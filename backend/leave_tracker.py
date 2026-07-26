"""
Module 2 — Leave Tracker & Leave Settings.

Per-salon leave policy configuration + per-barber balance ledger with
monthly accrual and FY year-end carry-forward / lapse jobs.

Collections
-----------
leave_types_config        { id, salon_id, code, display_name, is_paid,
                            monthly_accrual, carry_forward_rule, lapse_rule,
                            max_balance_cap, allow_negative_balance,
                            applies_to, display_order, is_active }

leave_balances            { id, salon_id, barber_id, leave_type_code,
                            financial_year, opening_balance, accrued_ytd,
                            availed_ytd, current_balance, last_accrual_date }

leave_balance_movements   { id, balance_id, salon_id, barber_id,
                            leave_type_code, movement_type, qty_delta,
                            reference_type, reference_id, reason,
                            created_by_user_id, created_at }

leave_records             { id, salon_id, barber_id, leave_type_code, date,
                            half_day, status, source, created_at }

Endpoints (all under /api):
    GET    /api/salons/{salon_id}/leave-types-config
    POST   /api/salons/{salon_id}/leave-types-config
    PUT    /api/salons/{salon_id}/leave-types-config/{id}
    DELETE /api/salons/{salon_id}/leave-types-config/{id}
    GET    /api/salons/{salon_id}/barbers/{barber_id}/leave-balance
    GET    /api/salons/{salon_id}/barbers/{barber_id}/leave-balance/ledger
    POST   /api/salons/{salon_id}/barbers/{barber_id}/leave-balance/adjust
    POST   /api/salons/{salon_id}/leave-records
    PUT    /api/salons/{salon_id}/leave-records/{id}
    DELETE /api/salons/{salon_id}/leave-records/{id}
    GET    /api/salons/{salon_id}/leave-records

Scheduled jobs:
    run_monthly_accrual()  — 1st of every month 00:30 IST
    run_year_end_close()   — April 1, 01:00 IST
"""
from __future__ import annotations

import calendar
import logging
import uuid
from datetime import datetime, date, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, Field, field_validator

logger = logging.getLogger(__name__)

_db = None
_get_current_salon_user = None

leave_tracker_router = APIRouter(tags=["leave-tracker"])
_bearer = HTTPBearer(auto_error=False)

# India is UTC+5:30
IST_OFFSET = timedelta(hours=5, minutes=30)

DEFAULT_LEAVE_TYPES = [
    {"code": "CL", "display_name": "Casual Leave",    "is_paid": True,  "monthly_accrual": 1.0,
     "carry_forward_rule": {"enabled": True, "max_carry_forward": 10.0}, "lapse_rule": None,
     "max_balance_cap": 30.0, "allow_negative_balance": False,
     "applies_to": "all",            "display_order": 10},
    {"code": "SL", "display_name": "Sick Leave",      "is_paid": True,  "monthly_accrual": 1.0,
     "carry_forward_rule": None, "lapse_rule": {"enabled": True, "lapse_percent": 100.0},
     "max_balance_cap": 12.0, "allow_negative_balance": False,
     "applies_to": "all",            "display_order": 20},
    {"code": "PL", "display_name": "Privilege Leave", "is_paid": True,  "monthly_accrual": 1.25,
     "carry_forward_rule": {"enabled": True, "max_carry_forward": 30.0}, "lapse_rule": None,
     "max_balance_cap": None, "allow_negative_balance": False,
     "applies_to": "permanent_only", "display_order": 30},
    {"code": "UL", "display_name": "Unpaid Leave",    "is_paid": False, "monthly_accrual": 0.0,
     "carry_forward_rule": None, "lapse_rule": None,
     "max_balance_cap": None, "allow_negative_balance": True,
     "applies_to": "all",            "display_order": 40},
]


# ===================== Helpers =====================

def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _today_ist() -> date:
    return (datetime.utcnow() + IST_OFFSET).date()


def _fy_for(d: date) -> str:
    """India FY: Apr 1 .. Mar 31.  Returns 'YYYY-YY'."""
    if d.month >= 4:
        return f"{d.year}-{(d.year + 1) % 100:02d}"
    return f"{d.year - 1}-{d.year % 100:02d}"


def _fy_year_start(fy: str) -> date:
    """Return Apr-1 date for an 'YYYY-YY' FY string."""
    y = int(fy.split("-")[0])
    return date(y, 4, 1)


def _fy_year_end(fy: str) -> date:
    y = int(fy.split("-")[0])
    return date(y + 1, 3, 31)


def _prev_fy(fy: str) -> str:
    y = int(fy.split("-")[0])
    return f"{y - 1}-{y % 100:02d}"


def _next_fy(fy: str) -> str:
    y = int(fy.split("-")[0])
    return f"{y + 1}-{(y + 2) % 100:02d}"


def _strip(o: dict) -> dict:
    o.pop("_id", None)
    return o


def init_leave_tracker_router(*, db, get_current_salon_user):
    global _db, _get_current_salon_user
    _db = db
    _get_current_salon_user = get_current_salon_user


async def _salon_auth(credentials: HTTPAuthorizationCredentials = Depends(_bearer)):
    if _get_current_salon_user is None:
        raise HTTPException(status_code=500, detail="leave_tracker_not_initialised")
    if credentials is None:
        raise HTTPException(status_code=401, detail="Authentication required")
    return await _get_current_salon_user(credentials)


def _assert_salon_owns(user: dict, salon_id: str):
    user_salon = user.get("salon_id") or user.get("sub")
    if user_salon != salon_id:
        raise HTTPException(status_code=403, detail="Not allowed for this salon")


# ===================== Models =====================

class CarryForwardRule(BaseModel):
    enabled: bool
    max_carry_forward: float = Field(..., ge=0)


class LapseRule(BaseModel):
    enabled: bool
    lapse_percent: float = Field(..., ge=0, le=100)


class LeaveTypeConfigIn(BaseModel):
    code: str = Field(..., min_length=1, max_length=10)
    display_name: str = Field(..., min_length=1, max_length=80)
    is_paid: bool = True
    monthly_accrual: float = Field(0.0, ge=0, le=10)
    carry_forward_rule: Optional[CarryForwardRule] = None
    lapse_rule: Optional[LapseRule] = None
    max_balance_cap: Optional[float] = Field(None, ge=0)
    allow_negative_balance: bool = False
    applies_to: str = "all"
    display_order: int = 0
    is_active: bool = True

    @field_validator("code")
    @classmethod
    def _v_code(cls, v):
        v = v.strip().upper()
        if not v.isalnum():
            raise ValueError("code must be alphanumeric")
        return v

    @field_validator("applies_to")
    @classmethod
    def _v_applies(cls, v):
        if v not in {"all", "permanent_only"}:
            raise ValueError("applies_to must be 'all' or 'permanent_only'")
        return v


class LeaveTypeConfigUpdate(BaseModel):
    display_name: Optional[str] = Field(None, min_length=1, max_length=80)
    is_paid: Optional[bool] = None
    monthly_accrual: Optional[float] = Field(None, ge=0, le=10)
    carry_forward_rule: Optional[CarryForwardRule] = None
    lapse_rule: Optional[LapseRule] = None
    max_balance_cap: Optional[float] = Field(None, ge=0)
    allow_negative_balance: Optional[bool] = None
    applies_to: Optional[str] = None
    display_order: Optional[int] = None
    is_active: Optional[bool] = None
    clear_carry_forward: bool = False  # explicit clear
    clear_lapse: bool = False

    @field_validator("applies_to")
    @classmethod
    def _v_applies(cls, v):
        if v is None:
            return v
        if v not in {"all", "permanent_only"}:
            raise ValueError("applies_to must be 'all' or 'permanent_only'")
        return v


class ManualAdjustPayload(BaseModel):
    leave_type_code: str
    qty_delta: float
    reason: str = Field(..., min_length=1, max_length=300)
    financial_year: Optional[str] = None  # default = current FY


class LeaveRecordIn(BaseModel):
    barber_id: str
    leave_type_code: str
    date: str  # YYYY-MM-DD
    half_day: bool = False
    note: Optional[str] = Field(default=None, max_length=300)

    @field_validator("date")
    @classmethod
    def _v_date(cls, v):
        try:
            datetime.strptime(v, "%Y-%m-%d")
        except ValueError:
            raise ValueError("date must be YYYY-MM-DD")
        return v


class LeaveRecordUpdate(BaseModel):
    leave_type_code: Optional[str] = None
    half_day: Optional[bool] = None
    note: Optional[str] = Field(default=None, max_length=300)


# ===================== Internal helpers =====================

async def _seed_default_types(salon_id: str) -> None:
    """Ensure a salon has at least the default leave types."""
    n = await _db.leave_types_config.count_documents({"salon_id": salon_id})
    if n > 0:
        return
    docs = []
    for t in DEFAULT_LEAVE_TYPES:
        docs.append({
            "id": str(uuid.uuid4()),
            "salon_id": salon_id,
            **t,
            "is_active": True,
            "created_at": _now_iso(),
            "updated_at": _now_iso(),
        })
    if docs:
        await _db.leave_types_config.insert_many(docs)


async def _record_movement(*, balance_doc: dict, movement_type: str, qty_delta: float,
                            reference_type: Optional[str] = None,
                            reference_id: Optional[str] = None,
                            reason: Optional[str] = None,
                            created_by_user_id: Optional[str] = None) -> None:
    try:
        await _db.leave_balance_movements.insert_one({
            "id": str(uuid.uuid4()),
            "balance_id": balance_doc["id"],
            "salon_id": balance_doc["salon_id"],
            "barber_id": balance_doc["barber_id"],
            "leave_type_code": balance_doc["leave_type_code"],
            "financial_year": balance_doc["financial_year"],
            "movement_type": movement_type,
            "qty_delta": qty_delta,
            "reference_type": reference_type,
            "reference_id": reference_id,
            "reason": reason,
            "created_by_user_id": created_by_user_id,
            "created_at": _now_iso(),
        })
    except Exception as e:
        logger.error(f"[leave_tracker] movement insert failed: {e}")


async def _get_or_create_balance(*, salon_id: str, barber_id: str, leave_type_code: str,
                                  fy: Optional[str] = None) -> dict:
    """Atomic upsert; returns the canonical balance doc."""
    fy = fy or _fy_for(_today_ist())
    now = _now_iso()
    existing = await _db.leave_balances.find_one(
        {"salon_id": salon_id, "barber_id": barber_id,
         "leave_type_code": leave_type_code, "financial_year": fy},
        {"_id": 0},
    )
    if existing:
        return existing
    doc = {
        "id": str(uuid.uuid4()),
        "salon_id": salon_id,
        "barber_id": barber_id,
        "leave_type_code": leave_type_code,
        "financial_year": fy,
        "opening_balance": 0.0,
        "accrued_ytd": 0.0,
        "availed_ytd": 0.0,
        "current_balance": 0.0,
        "last_accrual_date": None,
        "created_at": now,
        "updated_at": now,
    }
    try:
        await _db.leave_balances.insert_one(doc.copy())
    except Exception:
        # raced — fetch the existing one
        existing = await _db.leave_balances.find_one(
            {"salon_id": salon_id, "barber_id": barber_id,
             "leave_type_code": leave_type_code, "financial_year": fy},
            {"_id": 0},
        )
        if existing:
            return existing
        raise
    doc.pop("_id", None)
    return doc


async def _apply_balance_change(*, balance: dict, qty_delta: float, movement_type: str,
                                 reference_type: Optional[str] = None,
                                 reference_id: Optional[str] = None,
                                 reason: Optional[str] = None,
                                 created_by_user_id: Optional[str] = None,
                                 update_accrued: bool = False,
                                 update_availed: bool = False,
                                 update_opening: bool = False,
                                 allow_negative: bool = True,
                                 max_cap: Optional[float] = None) -> dict:
    """Apply qty_delta to current_balance and (optionally) the YTD fields.

    Returns the updated balance doc.  Logs a movement row.  If the resulting
    balance would breach max_cap or go negative (when not allowed), the
    delta is clamped and a movement reflecting the clamped value is logged.
    """
    cur = float(balance.get("current_balance") or 0)
    next_balance = cur + qty_delta
    effective_delta = qty_delta

    if max_cap is not None and qty_delta > 0 and next_balance > max_cap:
        effective_delta = max(0.0, max_cap - cur)
        next_balance = cur + effective_delta

    if not allow_negative and next_balance < 0:
        # clamp to zero
        effective_delta = -cur
        next_balance = 0.0

    set_doc = {"current_balance": round(next_balance, 4), "updated_at": _now_iso()}
    inc_doc: dict = {}
    if update_accrued:
        inc_doc["accrued_ytd"] = round(effective_delta, 4)
    if update_availed:
        inc_doc["availed_ytd"] = round(-effective_delta, 4)  # availed is positive of -delta
    if update_opening:
        set_doc["opening_balance"] = round(next_balance, 4)

    update_query: dict = {"$set": set_doc}
    if inc_doc:
        update_query["$inc"] = inc_doc

    await _db.leave_balances.update_one({"id": balance["id"]}, update_query)
    updated = await _db.leave_balances.find_one({"id": balance["id"]}, {"_id": 0})

    if effective_delta != 0 or movement_type in {"year_open_carry_forward", "year_end_lapse", "type_renamed"}:
        await _record_movement(
            balance_doc=updated,
            movement_type=movement_type,
            qty_delta=effective_delta,
            reference_type=reference_type,
            reference_id=reference_id,
            reason=reason,
            created_by_user_id=created_by_user_id,
        )
    return updated


# ===================== Scheduler jobs =====================

async def run_monthly_accrual(*, db=None, target_month: Optional[str] = None) -> dict:
    """Accrue monthly leave balances for all active barbers on every salon.

    Idempotent — checks `last_accrual_date` on the balance doc.  Pro-rates the
    first accrual when DOJ is mid-month.
    """
    db = db or _db
    today = _today_ist() if target_month is None else datetime.strptime(target_month + "-01", "%Y-%m-%d").date()
    accrual_marker = today.strftime("%Y-%m")
    accrual_date_str = today.strftime("%Y-%m-%d")
    fy = _fy_for(today)

    summary = {"barbers_processed": 0, "accruals_applied": 0, "skipped_idempotent": 0,
                "skipped_future_doj": 0, "errors": 0, "target_month": accrual_marker}

    async for barber in db.barbers.find({}, {"_id": 0}):
        salon_id = barber.get("salon_id")
        if not salon_id:
            continue
        barber_id = barber.get("id")
        last_working = barber.get("last_working_date")
        if last_working and last_working < today.isoformat():
            continue  # left the salon
        doj_str = barber.get("doj") or barber.get("date_of_joining")
        if doj_str:
            try:
                doj = datetime.strptime(doj_str[:10], "%Y-%m-%d").date()
            except ValueError:
                doj = today
        else:
            doj = today
        if doj > today:
            summary["skipped_future_doj"] += 1
            continue
        if doj.year == today.year and doj.month == today.month and doj.day > today.day:
            summary["skipped_future_doj"] += 1
            continue

        summary["barbers_processed"] += 1

        # Pull the salon's active leave-type configs.
        configs: list = []
        async for cfg in db.leave_types_config.find(
            {"salon_id": salon_id, "is_active": True, "monthly_accrual": {"$gt": 0}},
            {"_id": 0},
        ):
            applies_to = cfg.get("applies_to") or "all"
            if applies_to == "permanent_only":
                if (barber.get("employment_type") or "permanent") != "permanent":
                    continue
            configs.append(cfg)

        for cfg in configs:
            code = cfg["code"]
            try:
                balance = await _get_or_create_balance(
                    salon_id=salon_id, barber_id=barber_id, leave_type_code=code, fy=fy
                )
                # Idempotency — if last_accrual_date is in same month already, skip.
                last_acc = balance.get("last_accrual_date")
                if last_acc and last_acc[:7] == accrual_marker:
                    summary["skipped_idempotent"] += 1
                    continue

                accrual = float(cfg.get("monthly_accrual") or 0)

                # Pro-rate first month for new joiner.
                if doj.year == today.year and doj.month == today.month:
                    total_days = calendar.monthrange(today.year, today.month)[1]
                    days_remaining = total_days - doj.day + 1
                    accrual = round(accrual * days_remaining / total_days, 4)

                cap = cfg.get("max_balance_cap")
                await _apply_balance_change(
                    balance=balance,
                    qty_delta=accrual,
                    movement_type="monthly_accrual",
                    reference_type="scheduler",
                    reference_id=accrual_marker,
                    reason=f"Monthly accrual for {accrual_marker}",
                    update_accrued=True,
                    allow_negative=True,
                    max_cap=cap,
                )
                # Mark last_accrual_date.
                await db.leave_balances.update_one(
                    {"id": balance["id"]},
                    {"$set": {"last_accrual_date": accrual_date_str, "updated_at": _now_iso()}},
                )
                summary["accruals_applied"] += 1
            except Exception as e:
                logger.error(f"[leave_accrual] failed for {barber_id}/{code}: {e}")
                summary["errors"] += 1

    logger.info(f"[leave_accrual] {summary}")
    return summary


async def run_year_end_close(*, db=None, target_fy: Optional[str] = None) -> dict:
    """On April 1 — close out previous FY balances per leave-type policy.

    For every (barber, leave_type) balance with current_balance > 0 in the
    closing FY:
        * if carry_forward_rule.enabled → next_year_opening = min(current, max_cf)
        * if lapse_rule.enabled → next_year_opening = current * (1 - lapse_pct/100)
        * else → next_year_opening = 0  (full forfeiture)
    The difference is logged as year_end_lapse.  A new leave_balances row
    is created for the next FY with opening_balance = next_year_opening.
    """
    db = db or _db
    today = _today_ist()
    closing_fy = target_fy or _prev_fy(_fy_for(today))
    new_fy = _next_fy(closing_fy)
    summary = {"closing_fy": closing_fy, "new_fy": new_fy, "balances_closed": 0,
                "carried_forward": 0, "lapsed_total": 0.0, "errors": 0}

    # Group balances by salon to pull configs once.
    configs_cache: dict = {}

    async for bal in db.leave_balances.find({"financial_year": closing_fy}, {"_id": 0}):
        try:
            salon_id = bal["salon_id"]
            code = bal["leave_type_code"]
            if salon_id not in configs_cache:
                cmap: dict = {}
                async for cfg in db.leave_types_config.find({"salon_id": salon_id}, {"_id": 0}):
                    cmap[cfg["code"]] = cfg
                configs_cache[salon_id] = cmap
            cfg = configs_cache[salon_id].get(code) or {}
            current = float(bal.get("current_balance") or 0)
            if current <= 0:
                # close-out row with zero — still create next-year row for tracking.
                opening = 0.0
                lapsed = 0.0
            else:
                cf = cfg.get("carry_forward_rule") or {}
                lp = cfg.get("lapse_rule") or {}
                if cf.get("enabled"):
                    max_cf = float(cf.get("max_carry_forward") or 0)
                    opening = min(current, max_cf)
                    lapsed = current - opening
                elif lp.get("enabled"):
                    pct = float(lp.get("lapse_percent") or 0)
                    lapsed = round(current * pct / 100.0, 4)
                    opening = round(current - lapsed, 4)
                else:
                    lapsed = current
                    opening = 0.0

            if lapsed > 0:
                await _apply_balance_change(
                    balance=bal,
                    qty_delta=-lapsed,
                    movement_type="year_end_lapse",
                    reference_type="scheduler",
                    reference_id=closing_fy,
                    reason=f"FY {closing_fy} year-end close",
                    allow_negative=True,
                )
                summary["lapsed_total"] += lapsed

            # Open new FY row.
            new_balance = await _get_or_create_balance(
                salon_id=salon_id, barber_id=bal["barber_id"],
                leave_type_code=code, fy=new_fy,
            )
            if opening > 0:
                await _apply_balance_change(
                    balance=new_balance,
                    qty_delta=opening,
                    movement_type="year_open_carry_forward",
                    reference_type="scheduler",
                    reference_id=closing_fy,
                    reason=f"Carried over from FY {closing_fy}",
                    update_opening=True,
                    allow_negative=True,
                )
                summary["carried_forward"] += 1
            summary["balances_closed"] += 1
        except Exception as e:
            logger.error(f"[leave_year_end] failed: {e}")
            summary["errors"] += 1

    logger.info(f"[leave_year_end] {summary}")
    return summary


# ===================== Leave-type config endpoints =====================

@leave_tracker_router.get("/api/salons/{salon_id}/leave-types-config")
async def list_leave_type_configs(salon_id: str, include_inactive: bool = False,
                                    user: dict = Depends(_salon_auth)):
    _assert_salon_owns(user, salon_id)
    await _seed_default_types(salon_id)
    q: dict = {"salon_id": salon_id}
    if not include_inactive:
        q["is_active"] = True
    items = await _db.leave_types_config.find(q, {"_id": 0}).sort("display_order", 1).to_list(length=200)
    return {"items": items}


@leave_tracker_router.post("/api/salons/{salon_id}/leave-types-config")
async def create_leave_type_config(salon_id: str, payload: LeaveTypeConfigIn,
                                     user: dict = Depends(_salon_auth)):
    _assert_salon_owns(user, salon_id)
    # Mutual exclusion between carry-forward and lapse rules (consistent 400 with PUT).
    cf_on = bool(payload.carry_forward_rule and payload.carry_forward_rule.enabled)
    lp_on = bool(payload.lapse_rule and payload.lapse_rule.enabled)
    if cf_on and lp_on:
        raise HTTPException(
            status_code=400,
            detail="carry_forward_rule and lapse_rule cannot both be enabled",
        )
    existing = await _db.leave_types_config.find_one({"salon_id": salon_id, "code": payload.code})
    if existing:
        raise HTTPException(status_code=409, detail=f"Leave type with code '{payload.code}' already exists")
    if not payload.is_paid and payload.monthly_accrual > 0:
        logger.warning(f"[leave_tracker] unpaid leave with accrual {payload.monthly_accrual}: {payload.code}")
    doc = {
        "id": str(uuid.uuid4()),
        "salon_id": salon_id,
        **payload.model_dump(),
        "created_at": _now_iso(),
        "updated_at": _now_iso(),
    }
    # Pydantic CarryForwardRule / LapseRule may be sub-models — already dumped by model_dump()
    await _db.leave_types_config.insert_one(doc.copy())
    doc.pop("_id", None)
    return {"ok": True, "item": doc}


@leave_tracker_router.put("/api/salons/{salon_id}/leave-types-config/{cfg_id}")
async def update_leave_type_config(salon_id: str, cfg_id: str, payload: LeaveTypeConfigUpdate,
                                     user: dict = Depends(_salon_auth)):
    _assert_salon_owns(user, salon_id)
    existing = await _db.leave_types_config.find_one({"id": cfg_id, "salon_id": salon_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Leave type not found")

    updates: dict = {"updated_at": _now_iso()}
    unsets: dict = {}
    for field in ("display_name", "is_paid", "monthly_accrual",
                  "max_balance_cap", "allow_negative_balance",
                  "applies_to", "display_order", "is_active"):
        v = getattr(payload, field)
        if v is not None:
            updates[field] = v
    if payload.clear_carry_forward:
        updates["carry_forward_rule"] = None
    elif payload.carry_forward_rule is not None:
        updates["carry_forward_rule"] = payload.carry_forward_rule.model_dump()
    if payload.clear_lapse:
        updates["lapse_rule"] = None
    elif payload.lapse_rule is not None:
        updates["lapse_rule"] = payload.lapse_rule.model_dump()

    # Validate mutual exclusivity after merging.
    merged = {**existing, **updates}
    cf_on = bool((merged.get("carry_forward_rule") or {}).get("enabled"))
    lp_on = bool((merged.get("lapse_rule") or {}).get("enabled"))
    if cf_on and lp_on:
        raise HTTPException(status_code=400, detail="carry_forward_rule and lapse_rule cannot both be enabled")

    update_query: dict = {"$set": updates}
    if unsets:
        update_query["$unset"] = unsets
    await _db.leave_types_config.update_one({"id": cfg_id}, update_query)
    fresh = await _db.leave_types_config.find_one({"id": cfg_id}, {"_id": 0})
    return {"ok": True, "item": fresh}


@leave_tracker_router.delete("/api/salons/{salon_id}/leave-types-config/{cfg_id}")
async def delete_leave_type_config(salon_id: str, cfg_id: str,
                                     user: dict = Depends(_salon_auth)):
    _assert_salon_owns(user, salon_id)
    res = await _db.leave_types_config.update_one(
        {"id": cfg_id, "salon_id": salon_id},
        {"$set": {"is_active": False, "updated_at": _now_iso()}},
    )
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Leave type not found")
    return {"ok": True}


# ===================== Balance endpoints =====================

@leave_tracker_router.get("/api/salons/{salon_id}/barbers/{barber_id}/leave-balance")
async def get_leave_balance(salon_id: str, barber_id: str,
                              financial_year: Optional[str] = Query(None),
                              user: dict = Depends(_salon_auth)):
    _assert_salon_owns(user, salon_id)
    await _seed_default_types(salon_id)
    fy = financial_year or _fy_for(_today_ist())

    # Ensure a balance row exists for every active paid type so the chip is shown even before accrual.
    cfgs = await _db.leave_types_config.find(
        {"salon_id": salon_id, "is_active": True}, {"_id": 0}
    ).sort("display_order", 1).to_list(length=100)
    items: list = []
    for cfg in cfgs:
        bal = await _get_or_create_balance(
            salon_id=salon_id, barber_id=barber_id,
            leave_type_code=cfg["code"], fy=fy,
        )
        items.append({**bal, "display_name": cfg.get("display_name"), "is_paid": cfg.get("is_paid")})
    return {"financial_year": fy, "items": items}


@leave_tracker_router.get("/api/salons/{salon_id}/barbers/{barber_id}/leave-balance/ledger")
async def get_leave_ledger(salon_id: str, barber_id: str,
                            financial_year: Optional[str] = Query(None),
                            leave_type_code: Optional[str] = Query(None),
                            page: int = Query(1, ge=1),
                            page_size: int = Query(50, ge=1, le=200),
                            user: dict = Depends(_salon_auth)):
    _assert_salon_owns(user, salon_id)
    q: dict = {"salon_id": salon_id, "barber_id": barber_id}
    if financial_year:
        q["financial_year"] = financial_year
    if leave_type_code:
        q["leave_type_code"] = leave_type_code
    total = await _db.leave_balance_movements.count_documents(q)
    cursor = (
        _db.leave_balance_movements.find(q, {"_id": 0})
        .sort("created_at", -1)
        .skip((page - 1) * page_size)
        .limit(page_size)
    )
    movements = await cursor.to_list(length=page_size)
    return {"movements": movements, "total_count": total,
            "page": page, "page_size": page_size,
            "total_pages": max(1, (total + page_size - 1) // page_size)}


@leave_tracker_router.post("/api/salons/{salon_id}/barbers/{barber_id}/leave-balance/adjust")
async def manual_balance_adjust(salon_id: str, barber_id: str, payload: ManualAdjustPayload,
                                  user: dict = Depends(_salon_auth)):
    _assert_salon_owns(user, salon_id)
    cfg = await _db.leave_types_config.find_one(
        {"salon_id": salon_id, "code": payload.leave_type_code}, {"_id": 0}
    )
    if not cfg:
        raise HTTPException(status_code=404, detail="Leave type not configured")
    fy = payload.financial_year or _fy_for(_today_ist())
    balance = await _get_or_create_balance(
        salon_id=salon_id, barber_id=barber_id,
        leave_type_code=payload.leave_type_code, fy=fy,
    )
    allow_neg = bool(cfg.get("allow_negative_balance"))
    max_cap = cfg.get("max_balance_cap")
    updated = await _apply_balance_change(
        balance=balance,
        qty_delta=payload.qty_delta,
        movement_type="manual_adjustment",
        reference_type="manual",
        reference_id=user.get("user_id") or user.get("id"),
        reason=payload.reason,
        created_by_user_id=user.get("user_id") or user.get("id"),
        update_accrued=payload.qty_delta > 0,
        update_availed=False,
        allow_negative=allow_neg,
        max_cap=max_cap,
    )
    return {"ok": True, "balance": updated}


# ===================== Leave records endpoints =====================

@leave_tracker_router.get("/api/salons/{salon_id}/leave-records")
async def list_leave_records(salon_id: str,
                               barber_id: Optional[str] = Query(None),
                               from_date: Optional[str] = Query(None, alias="from"),
                               to_date: Optional[str] = Query(None, alias="to"),
                               leave_type_code: Optional[str] = Query(None, alias="type"),
                               user: dict = Depends(_salon_auth)):
    _assert_salon_owns(user, salon_id)
    q: dict = {"salon_id": salon_id, "status": {"$ne": "cancelled"}}
    if barber_id:
        q["barber_id"] = barber_id
    if leave_type_code:
        q["leave_type_code"] = leave_type_code
    if from_date or to_date:
        date_q: dict = {}
        if from_date:
            date_q["$gte"] = from_date
        if to_date:
            date_q["$lte"] = to_date
        q["date"] = date_q
    records = await _db.leave_records.find(q, {"_id": 0}).sort("date", -1).to_list(length=2000)
    return {"records": records}


async def _sync_barber_leave_dates(salon_id: str, barber_id: str) -> None:
    """Rebuild barber.leave_dates from active leave_records (back-compat with old field)."""
    dates: list = []
    async for r in _db.leave_records.find(
        {"salon_id": salon_id, "barber_id": barber_id, "status": "active"},
        {"_id": 0, "date": 1},
    ):
        dates.append(r["date"])
    await _db.barbers.update_one(
        {"id": barber_id, "salon_id": salon_id},
        {"$set": {"leave_dates": sorted(set(dates))}},
    )


@leave_tracker_router.post("/api/salons/{salon_id}/leave-records")
async def create_leave_record(salon_id: str, payload: LeaveRecordIn,
                                user: dict = Depends(_salon_auth)):
    _assert_salon_owns(user, salon_id)
    barber = await _db.barbers.find_one(
        {"id": payload.barber_id, "salon_id": salon_id}, {"_id": 0}
    )
    if not barber:
        raise HTTPException(status_code=404, detail="Barber not found")
    cfg = await _db.leave_types_config.find_one(
        {"salon_id": salon_id, "code": payload.leave_type_code, "is_active": True}, {"_id": 0}
    )
    if not cfg:
        raise HTTPException(status_code=404, detail="Leave type not configured or inactive")

    # Disallow duplicate active record for same date+barber.
    dup = await _db.leave_records.find_one({
        "salon_id": salon_id, "barber_id": payload.barber_id,
        "date": payload.date, "status": "active",
    })
    if dup:
        raise HTTPException(status_code=409, detail="Leave already exists for this date")

    fy = _fy_for(datetime.strptime(payload.date, "%Y-%m-%d").date())
    balance = await _get_or_create_balance(
        salon_id=salon_id, barber_id=payload.barber_id,
        leave_type_code=payload.leave_type_code, fy=fy,
    )
    debit_qty = 0.5 if payload.half_day else 1.0
    allow_neg = bool(cfg.get("allow_negative_balance"))
    if not allow_neg and balance["current_balance"] < debit_qty:
        raise HTTPException(
            status_code=409,
            detail=f"Insufficient {payload.leave_type_code} balance ({balance['current_balance']} available, need {debit_qty})",
        )

    rec_id = str(uuid.uuid4())
    now = _now_iso()
    rec_doc = {
        "id": rec_id,
        "salon_id": salon_id,
        "barber_id": payload.barber_id,
        "leave_type_code": payload.leave_type_code,
        "date": payload.date,
        "half_day": payload.half_day,
        "note": payload.note,
        "status": "active",
        "source": "salon_admin",
        "created_at": now,
        "updated_at": now,
        "created_by": user.get("user_id") or user.get("id"),
        # Module 4 — snapshot is_paid/display_name at record creation time so
        # later salary math is immune to admins editing the leave-type config.
        "leave_type_snapshot": {
            "code": cfg.get("code"),
            "display_name": cfg.get("display_name"),
            "is_paid": bool(cfg.get("is_paid", True)),
        },
    }
    await _db.leave_records.insert_one(rec_doc.copy())
    rec_doc.pop("_id", None)

    await _apply_balance_change(
        balance=balance,
        qty_delta=-debit_qty,
        movement_type="availed",
        reference_type="leave_record",
        reference_id=rec_id,
        reason=f"Leave {payload.leave_type_code} on {payload.date}{' (half-day)' if payload.half_day else ''}",
        created_by_user_id=user.get("user_id") or user.get("id"),
        update_availed=True,
        allow_negative=allow_neg,
    )
    await _sync_barber_leave_dates(salon_id, payload.barber_id)
    fresh_balance = await _db.leave_balances.find_one({"id": balance["id"]}, {"_id": 0})
    return {"ok": True, "record": rec_doc, "balance": fresh_balance}


@leave_tracker_router.put("/api/salons/{salon_id}/leave-records/{record_id}")
async def update_leave_record(salon_id: str, record_id: str, payload: LeaveRecordUpdate,
                                user: dict = Depends(_salon_auth)):
    _assert_salon_owns(user, salon_id)
    rec = await _db.leave_records.find_one({"id": record_id, "salon_id": salon_id}, {"_id": 0})
    if not rec or rec.get("status") != "active":
        raise HTTPException(status_code=404, detail="Leave record not found or inactive")

    new_type = payload.leave_type_code or rec["leave_type_code"]
    new_half = rec["half_day"] if payload.half_day is None else payload.half_day
    old_type = rec["leave_type_code"]
    old_half = rec["half_day"]

    # If nothing meaningful changed except note → just update note.
    if new_type == old_type and new_half == old_half:
        if payload.note is not None:
            await _db.leave_records.update_one(
                {"id": record_id},
                {"$set": {"note": payload.note, "updated_at": _now_iso()}},
            )
        fresh = await _db.leave_records.find_one({"id": record_id}, {"_id": 0})
        return {"ok": True, "record": fresh}

    # Validate target config.
    new_cfg = await _db.leave_types_config.find_one(
        {"salon_id": salon_id, "code": new_type, "is_active": True}, {"_id": 0}
    )
    if not new_cfg:
        raise HTTPException(status_code=404, detail="New leave type not configured")

    fy = _fy_for(datetime.strptime(rec["date"], "%Y-%m-%d").date())

    # Restore old type balance.
    old_balance = await _get_or_create_balance(
        salon_id=salon_id, barber_id=rec["barber_id"],
        leave_type_code=old_type, fy=fy,
    )
    old_debit = 0.5 if old_half else 1.0
    old_balance_after_restore = await _apply_balance_change(
        balance=old_balance,
        qty_delta=+old_debit,
        movement_type="type_renamed",
        reference_type="leave_record",
        reference_id=record_id,
        reason=f"Restore from change → {new_type}",
        created_by_user_id=user.get("user_id") or user.get("id"),
        update_availed=True,  # availed decreases (we pass negative because qty_delta>0 → -delta < 0)
        allow_negative=True,
    )

    # Debit new type balance.
    new_balance = await _get_or_create_balance(
        salon_id=salon_id, barber_id=rec["barber_id"],
        leave_type_code=new_type, fy=fy,
    )
    new_debit = 0.5 if new_half else 1.0
    allow_neg = bool(new_cfg.get("allow_negative_balance"))
    if not allow_neg and new_balance["current_balance"] < new_debit:
        # Rollback the restore we just did and bail.
        # NOTE: must use the *post-restore* balance dict so we don't double-debit.
        await _apply_balance_change(
            balance=old_balance_after_restore,
            qty_delta=-old_debit,
            movement_type="type_renamed",
            reference_type="leave_record",
            reference_id=record_id,
            reason="Rollback after insufficient target balance",
            created_by_user_id=user.get("user_id") or user.get("id"),
            update_availed=True,
            allow_negative=True,
        )
        raise HTTPException(
            status_code=409,
            detail=f"Insufficient {new_type} balance ({new_balance['current_balance']} available, need {new_debit})",
        )
    await _apply_balance_change(
        balance=new_balance,
        qty_delta=-new_debit,
        movement_type="availed",
        reference_type="leave_record",
        reference_id=record_id,
        reason=f"Leave changed → {new_type} on {rec['date']}",
        created_by_user_id=user.get("user_id") or user.get("id"),
        update_availed=True,
        allow_negative=allow_neg,
    )

    await _db.leave_records.update_one(
        {"id": record_id},
        {"$set": {"leave_type_code": new_type, "half_day": new_half,
                  "note": payload.note if payload.note is not None else rec.get("note"),
                  "updated_at": _now_iso(),
                  "updated_by": user.get("user_id") or user.get("id")}},
    )
    fresh = await _db.leave_records.find_one({"id": record_id}, {"_id": 0})
    await _sync_barber_leave_dates(salon_id, rec["barber_id"])
    return {"ok": True, "record": fresh}


@leave_tracker_router.delete("/api/salons/{salon_id}/leave-records/{record_id}")
async def delete_leave_record(salon_id: str, record_id: str,
                                user: dict = Depends(_salon_auth)):
    _assert_salon_owns(user, salon_id)
    rec = await _db.leave_records.find_one({"id": record_id, "salon_id": salon_id}, {"_id": 0})
    if not rec or rec.get("status") != "active":
        raise HTTPException(status_code=404, detail="Leave record not found or inactive")

    fy = _fy_for(datetime.strptime(rec["date"], "%Y-%m-%d").date())
    balance = await _get_or_create_balance(
        salon_id=salon_id, barber_id=rec["barber_id"],
        leave_type_code=rec["leave_type_code"], fy=fy,
    )
    debit_qty = 0.5 if rec["half_day"] else 1.0
    await _apply_balance_change(
        balance=balance,
        qty_delta=+debit_qty,
        movement_type="availed",  # availed YTD will decrease (counter-leg)
        reference_type="leave_record",
        reference_id=record_id,
        reason="Leave deleted — balance restored",
        created_by_user_id=user.get("user_id") or user.get("id"),
        update_availed=True,
        allow_negative=True,
    )
    await _db.leave_records.update_one(
        {"id": record_id},
        {"$set": {"status": "cancelled", "cancelled_at": _now_iso(),
                  "cancelled_by": user.get("user_id") or user.get("id"),
                  "updated_at": _now_iso()}},
    )
    await _sync_barber_leave_dates(salon_id, rec["barber_id"])
    fresh_balance = await _db.leave_balances.find_one({"id": balance["id"]}, {"_id": 0})
    return {"ok": True, "balance": fresh_balance}


# ===================== Backfill from legacy barber.leave_dates =====================

async def backfill_from_legacy(*, db=None, salon_id: Optional[str] = None) -> dict:
    """Convert legacy `barber.leave_dates` lists into leave_records (CL default)
    so the new system has historical data.  Idempotent."""
    db = db or _db
    summary = {"barbers_scanned": 0, "records_created": 0, "skipped": 0}
    q: dict = {}
    if salon_id:
        q["salon_id"] = salon_id
    async for barber in db.barbers.find(q, {"_id": 0}):
        summary["barbers_scanned"] += 1
        dates = barber.get("leave_dates") or []
        if not dates:
            continue
        s_id = barber.get("salon_id")
        if not s_id:
            continue
        await _seed_default_types(s_id)
        default_code = "CL"
        for d in dates:
            existing = await db.leave_records.find_one({
                "salon_id": s_id, "barber_id": barber["id"], "date": d, "status": "active"
            })
            if existing:
                summary["skipped"] += 1
                continue
            rec_id = str(uuid.uuid4())
            await db.leave_records.insert_one({
                "id": rec_id, "salon_id": s_id, "barber_id": barber["id"],
                "leave_type_code": default_code, "date": d, "half_day": False,
                "note": "Backfilled from legacy leave_dates",
                "status": "active", "source": "legacy_backfill",
                "created_at": _now_iso(), "updated_at": _now_iso(),
            })
            summary["records_created"] += 1
    return summary
