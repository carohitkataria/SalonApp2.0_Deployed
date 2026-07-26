"""
Phase 5 (Part A) — Platform admin: salon management & subscription overrides.

Endpoints (all under /api/platform, JWT role=platform_admin required):

  GET    /salons                                        list + search + filter
  GET    /salons/{salon_id}                             salon detail (read-only)
  POST   /salons/{salon_id}/suspend                     {reason}
  POST   /salons/{salon_id}/reactivate
  POST   /salons/{salon_id}/view-as                     -> short-lived view-as JWT

Subscription overrides (write to `subscription_overrides_log`):
  POST   /salons/{salon_id}/subscription/comp           ongoing free
  POST   /salons/{salon_id}/subscription/grant-pro      {duration_months, max_branches, reason}
  POST   /salons/{salon_id}/subscription/override-branches {max_branches, reason}
  POST   /salons/{salon_id}/subscription/extend-trial   {days, reason}
  POST   /salons/{salon_id}/subscription/revoke-override/{override_id}

Audit log entry written to `platform_audit_log` for every action.
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timedelta, timezone
from typing import List, Optional

import jwt
from fastapi import APIRouter, Depends, HTTPException, Query, status as http_status
from pydantic import BaseModel, Field, field_validator

# Import the platform admin JWT dependency directly — this is the same
# `get_current_platform_admin` used in /platform/auth/me.
from platform_admin import get_current_platform_admin as require_platform_admin

logger = logging.getLogger(__name__)

# Injected at startup by server.py via init_platform_management_router(...)
_db = None
_get_subscription_status = None
_count_billable_branches = None
_get_active_branch_ids = None
_get_active_plan = None
_secret_key: str = "change-me"
_algorithm: str = "HS256"
_create_in_app_notification = None
_send_whatsapp_notification = None

management_router = APIRouter(
    prefix="/api/platform", tags=["platform-admin-management"]
)


# ---------- Models ----------

class SuspendRequest(BaseModel):
    reason: str = Field(..., min_length=2, max_length=500)


class GrantProRequest(BaseModel):
    duration_months: Optional[int] = Field(default=None, ge=0, le=120)
    duration_days: Optional[int] = Field(default=None, ge=0, le=3650)
    max_branches: Optional[int] = Field(default=None, ge=1, le=1000)
    reason: str = Field(..., min_length=2, max_length=500)


class OverrideBranchesRequest(BaseModel):
    max_branches: int = Field(..., ge=1, le=1000)
    reason: str = Field(..., min_length=2, max_length=500)


class ExtendTrialRequest(BaseModel):
    days: int = Field(..., gt=0, le=3650)
    reason: str = Field(..., min_length=2, max_length=500)


class CompRequest(BaseModel):
    reason: str = Field(..., min_length=2, max_length=500)
    max_branches: Optional[int] = Field(default=None, ge=1, le=1000)

    @field_validator("reason")
    @classmethod
    def reason_not_blank(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("reason must not be blank")
        return v.strip()


# Phase 6 — Broadcast
BROADCAST_AUDIENCES = {"all_salons", "premium_salons", "free_salons", "suspended_salons"}


class BroadcastRequest(BaseModel):
    title: str = Field(..., min_length=2, max_length=140)
    message: str = Field(..., min_length=2, max_length=2000)
    audience: str = Field(default="all_salons")
    # channels reserved for future (in_app only this iteration)
    channels: Optional[List[str]] = Field(default_factory=lambda: ["in_app"])

    @field_validator("audience")
    @classmethod
    def audience_valid(cls, v: str) -> str:
        if v not in BROADCAST_AUDIENCES:
            raise ValueError(f"audience must be one of {sorted(BROADCAST_AUDIENCES)}")
        return v

    @field_validator("title", "message")
    @classmethod
    def not_blank(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("must not be blank")
        return v.strip()


# ---------- Helpers ----------

def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _add_days(days: int) -> str:
    return (datetime.now(timezone.utc) + timedelta(days=days)).isoformat()


def _add_months_iso(months: int) -> str:
    return (datetime.now(timezone.utc) + timedelta(days=30 * months)).isoformat()


async def _write_audit(
    *, admin: dict, action: str, target: str, target_id: str,
    payload: Optional[dict] = None, status_str: str = "success",
):
    """Generic platform audit logger (used for suspend/reactivate/view-as/etc.).

    A dedicated audit-log viewer arrives in Phase 6, but we already write the
    rows now so nothing is lost retroactively.
    """
    await _db.platform_audit_log.insert_one({
        "id": str(uuid.uuid4()),
        "admin_id": admin.get("id"),
        "admin_mobile": admin.get("mobile"),
        "action": action,
        "target": target,
        "target_id": target_id,
        "payload": payload or {},
        "status": status_str,
        "created_at": _now_iso(),
    })


async def _write_override_log(
    *, salon_id: str, admin: dict, override_type: str,
    override_details: dict, previous_state: dict, new_state: dict,
    reason: str,
) -> dict:
    doc = {
        "id": str(uuid.uuid4()),
        "salon_id": salon_id,
        "override_type": override_type,
        "override_details": override_details,
        "previous_state": previous_state,
        "new_state": new_state,
        "granted_by_admin_id": admin.get("id"),
        "granted_by_admin_mobile": admin.get("mobile"),
        "revoked_by_admin_id": None,
        "revoked_by_admin_mobile": None,
        "revoked_at": None,
        "active": True,
        "reason": reason,
        "created_at": _now_iso(),
        "updated_at": _now_iso(),
    }
    await _db.subscription_overrides_log.insert_one(doc.copy())
    return doc


async def _existing_active_sub(salon_id: str) -> Optional[dict]:
    """Return the salon's currently-active sub (paid OR granted)."""
    return await _db.salon_subscriptions.find_one(
        {"salon_id": salon_id, "payment_status": {"$in": ["paid", "granted"]}},
        {"_id": 0},
        sort=[("expiry_date", -1)],
    )


# ---------- Endpoint: list + search ----------

@management_router.get("/salons")
async def list_salons(
    q: Optional[str] = None,
    status: Optional[str] = Query(None, description="active | suspended | trial"),
    page: int = 1, page_size: int = 25,
    admin=Depends(require_platform_admin),
):
    """Searchable, paginated salon list for the admin console."""
    page = max(1, page)
    page_size = max(1, min(100, page_size))

    base_query: dict = {}
    if status == "suspended":
        base_query["status"] = "suspended"
    elif status == "active":
        base_query["$or"] = [
            {"status": "active"},
            {"status": {"$exists": False}},
            {"status": None},
        ]

    if q and q.strip():
        s = q.strip()
        # Match name, owner, phone (loose, case-insensitive)
        regex = {"$regex": s, "$options": "i"}
        text_or = [
            {"salon_name": regex},
            {"owner_name": regex},
            {"phone": regex},
            {"email": regex},
        ]
        if "$or" in base_query:
            base_query = {"$and": [base_query, {"$or": text_or}]}
        else:
            base_query["$or"] = text_or

    total = await _db.salons.count_documents(base_query)
    cursor = (
        _db.salons.find(base_query, {"_id": 0})
        .sort("created_at", -1)
        .skip((page - 1) * page_size)
        .limit(page_size)
    )
    rows: List[dict] = []
    async for salon in cursor:
        sub_state = await _get_subscription_status(salon["id"])
        sub = sub_state.get("subscription") or {}
        rows.append({
            "id": salon["id"],
            "salon_name": salon.get("salon_name"),
            "owner_name": salon.get("owner_name"),
            "phone": salon.get("phone"),
            "email": salon.get("email"),
            "city": salon.get("city"),
            "status": (salon.get("status") or "active"),
            "suspension_reason": salon.get("suspension_reason"),
            "created_at": salon.get("created_at"),
            "branches_count": sub_state.get("active_branch_count"),
            "plan_name": (sub_state.get("plan") or {}).get("plan_name"),
            "subscription_status": sub_state.get("status"),
            "is_premium": sub_state.get("is_premium"),
            "is_platform_granted": sub_state.get("is_platform_granted"),
            "grant_type": sub_state.get("grant_type"),
            "expiry_date": sub_state.get("expiry_date"),
            "trial_ends_at": sub_state.get("trial_ends_at"),
            "current_amount": sub.get("total_amount") or sub_state.get("total_amount"),
            "max_branches_effective": sub_state.get("max_branches_effective"),
        })

    await _write_audit(
        admin=admin, action="list_salons",
        target="salons", target_id="_all_",
        payload={"q": q, "status": status, "page": page, "page_size": page_size},
    )

    return {
        "rows": rows,
        "page": page,
        "page_size": page_size,
        "total": total,
        "total_pages": (total + page_size - 1) // page_size if page_size else 1,
    }


# ---------- Endpoint: salon detail (read-only) ----------

@management_router.get("/salons/{salon_id}")
async def salon_detail(salon_id: str, admin=Depends(require_platform_admin)):
    salon = await _db.salons.find_one({"id": salon_id}, {"_id": 0})
    if not salon:
        raise HTTPException(status_code=404, detail="Salon not found")

    sub_state = await _get_subscription_status(salon_id)

    # Subscription & payment history
    sub_history = await _db.salon_subscriptions.find(
        {"salon_id": salon_id}, {"_id": 0}
    ).sort("created_at", -1).to_list(length=200)

    payment_history = await _db.subscription_transactions.find(
        {"salon_id": salon_id}, {"_id": 0}
    ).sort("created_at", -1).to_list(length=200) if "subscription_transactions" in await _db.list_collection_names() else []

    # Branches
    branches = await _db.salon_branches.find(
        {"salon_id": salon_id}, {"_id": 0}
    ).to_list(length=None)

    # Staff count
    staff_count = await _db.barbers.count_documents(
        {"salon_id": salon_id, "is_active": True}
    )

    # This-month revenue (paid orders / bills if available; safe fallback to 0)
    month_start = datetime.now(timezone.utc).replace(
        day=1, hour=0, minute=0, second=0, microsecond=0
    ).isoformat()
    revenue_doc = None
    try:
        pipe = [
            {"$match": {"salon_id": salon_id, "created_at": {"$gte": month_start}}},
            {"$group": {"_id": None, "total": {"$sum": "$total_amount"}}},
        ]
        async for r in _db.bills.aggregate(pipe):
            revenue_doc = r
    except Exception:
        revenue_doc = None
    this_month_revenue = float((revenue_doc or {}).get("total") or 0)

    # Active overrides
    active_overrides = await _db.subscription_overrides_log.find(
        {"salon_id": salon_id, "active": True}, {"_id": 0}
    ).sort("created_at", -1).to_list(length=100)

    # All overrides (history)
    override_history = await _db.subscription_overrides_log.find(
        {"salon_id": salon_id}, {"_id": 0}
    ).sort("created_at", -1).to_list(length=200)

    await _write_audit(
        admin=admin, action="view_salon", target="salon", target_id=salon_id,
    )

    return {
        "salon": salon,
        "subscription_state": sub_state,
        "subscription_history": sub_history,
        "payment_history": payment_history,
        "branches": branches,
        "staff_count": staff_count,
        "this_month_revenue": this_month_revenue,
        "active_overrides": active_overrides,
        "override_history": override_history,
    }


# ---------- Endpoint: suspend / reactivate ----------

@management_router.post("/salons/{salon_id}/suspend")
async def suspend_salon(
    salon_id: str, body: SuspendRequest,
    admin=Depends(require_platform_admin),
):
    salon = await _db.salons.find_one({"id": salon_id}, {"_id": 0})
    if not salon:
        raise HTTPException(status_code=404, detail="Salon not found")
    if salon.get("status") == "suspended":
        raise HTTPException(status_code=400, detail="Salon is already suspended")

    await _db.salons.update_one(
        {"id": salon_id},
        {"$set": {
            "status": "suspended",
            "suspension_reason": body.reason,
            "suspended_at": _now_iso(),
            "suspended_by_admin_id": admin["id"],
        }},
    )
    await _write_audit(
        admin=admin, action="suspend_salon", target="salon", target_id=salon_id,
        payload={"reason": body.reason},
    )
    return {"ok": True, "salon_id": salon_id, "status": "suspended", "reason": body.reason}


@management_router.post("/salons/{salon_id}/reactivate")
async def reactivate_salon(
    salon_id: str, admin=Depends(require_platform_admin),
):
    salon = await _db.salons.find_one({"id": salon_id}, {"_id": 0})
    if not salon:
        raise HTTPException(status_code=404, detail="Salon not found")
    if salon.get("status") != "suspended":
        raise HTTPException(status_code=400, detail="Salon is not suspended")

    await _db.salons.update_one(
        {"id": salon_id},
        {"$set": {
            "status": "active",
            "reactivated_at": _now_iso(),
            "reactivated_by_admin_id": admin["id"],
        }, "$unset": {"suspension_reason": ""}},
    )
    await _write_audit(
        admin=admin, action="reactivate_salon", target="salon", target_id=salon_id,
    )
    return {"ok": True, "salon_id": salon_id, "status": "active"}


# ---------- Endpoint: view-as (read-only short-lived token) ----------

@management_router.post("/salons/{salon_id}/view-as")
async def view_as_salon(
    salon_id: str, admin=Depends(require_platform_admin),
):
    salon = await _db.salons.find_one({"id": salon_id}, {"_id": 0, "id": 1, "salon_name": 1})
    if not salon:
        raise HTTPException(status_code=404, detail="Salon not found")

    payload = {
        "role": "salon_view_as",      # NOTE: distinct role — middleware can deny writes
        "platform_admin_id": admin["id"],
        "platform_admin_mobile": admin.get("mobile"),
        "salon_id": salon_id,
        "readonly": True,
        "iat": int(datetime.now(timezone.utc).timestamp()),
        "exp": int((datetime.now(timezone.utc) + timedelta(minutes=15)).timestamp()),
    }
    token = jwt.encode(payload, _secret_key, algorithm=_algorithm)
    await _write_audit(
        admin=admin, action="view_as", target="salon", target_id=salon_id,
    )
    return {
        "token": token,
        "salon_id": salon_id,
        "salon_name": salon.get("salon_name"),
        "expires_in_seconds": 15 * 60,
        "readonly": True,
    }


# ---------- Subscription overrides ----------

async def _create_granted_sub(
    *, salon_id: str, plan_name: str, plan_id: str,
    expiry_iso: str, max_branches: Optional[int], grant_type: str,
    reason: str, admin_id: str,
) -> dict:
    """Build a salon_subscriptions doc for a platform-granted access."""
    # Snapshot fields for per-branch pricing (Phase 2)
    plan = await _get_active_plan() or {}
    price_per_branch = float(plan.get("price_per_branch") or plan.get("price") or 0)
    branch_ids = await _get_active_branch_ids(salon_id)
    billable = max(len(branch_ids), 1)
    sub_doc = {
        "id": str(uuid.uuid4()),
        "salon_id": salon_id,
        "plan_id": plan_id,
        "plan_name": plan_name,
        "price": 0.0,
        "subscription_status": "active",
        "start_date": _now_iso(),
        "expiry_date": expiry_iso,
        "payment_status": "granted",
        "cashfree_order_id": None,
        "cashfree_payment_id": None,
        "auto_renew": False,
        "billing_cycle": "monthly",
        "billable_branch_count": billable,
        "price_per_branch_snapshot": price_per_branch,
        "branch_ids_snapshot": branch_ids,
        "base_amount": 0.0,
        "discount_code_applied": None,
        "discount_amount": 0.0,
        "total_amount": 0.0,
        # Phase 5 — grant metadata
        "grant_type": grant_type,
        "max_branches": max_branches,
        "max_branches_override": None,
        "granted_by_admin_id": admin_id,
        "grant_reason": reason,
        "trial_ends_at": None,
        "created_at": _now_iso(),
        "updated_at": _now_iso(),
    }
    await _db.salon_subscriptions.insert_one(sub_doc.copy())
    return sub_doc


@management_router.post("/salons/{salon_id}/subscription/comp")
async def grant_comp_access(
    salon_id: str, body: CompRequest,
    admin=Depends(require_platform_admin),
):
    """Ongoing complimentary access. We model this as a granted subscription
    with a far-future expiry date (1000 years out) so existing code paths
    keep working unchanged.
    """
    salon = await _db.salons.find_one({"id": salon_id}, {"_id": 0, "id": 1})
    if not salon:
        raise HTTPException(status_code=404, detail="Salon not found")

    previous_state = (await _existing_active_sub(salon_id)) or {}
    far_future = (datetime.now(timezone.utc) + timedelta(days=365 * 1000)).isoformat()
    sub = await _create_granted_sub(
        salon_id=salon_id, plan_name="Platform Comp", plan_id="PLATFORM_GRANT_COMP",
        expiry_iso=far_future, max_branches=body.max_branches, grant_type="comp",
        reason=body.reason, admin_id=admin["id"],
    )
    override = await _write_override_log(
        salon_id=salon_id, admin=admin, override_type="comp",
        override_details={"max_branches": body.max_branches},
        previous_state={
            "subscription_id": previous_state.get("id"),
            "payment_status": previous_state.get("payment_status"),
            "expiry_date": previous_state.get("expiry_date"),
            "max_branches": previous_state.get("max_branches"),
        },
        new_state={
            "subscription_id": sub["id"],
            "payment_status": "granted",
            "expiry_date": far_future,
            "max_branches": body.max_branches,
        },
        reason=body.reason,
    )
    await _write_audit(
        admin=admin, action="comp_access", target="salon", target_id=salon_id,
        payload={"override_id": override["id"], "max_branches": body.max_branches},
    )
    return {"ok": True, "override": override, "subscription_id": sub["id"]}


@management_router.post("/salons/{salon_id}/subscription/grant-pro")
async def grant_pro_access(
    salon_id: str, body: GrantProRequest,
    admin=Depends(require_platform_admin),
):
    """Time-bound Pro access for N months."""
    salon = await _db.salons.find_one({"id": salon_id}, {"_id": 0, "id": 1})
    if not salon:
        raise HTTPException(status_code=404, detail="Salon not found")

    previous_state = (await _existing_active_sub(salon_id)) or {}
    # Compute expiry from days OR months. Explicit days take precedence so admins
    # can grant sub-month durations (e.g. "100 days" instead of ~3 months).
    total_days = 0
    if body.duration_days:
        total_days += int(body.duration_days)
    if body.duration_months:
        total_days += 30 * int(body.duration_months)
    if total_days <= 0:
        raise HTTPException(
            status_code=400,
            detail="Grant duration must be at least 1 day (provide duration_days and/or duration_months)."
        )
    expiry_iso = (datetime.now(timezone.utc) + timedelta(days=total_days)).isoformat()
    sub = await _create_granted_sub(
        salon_id=salon_id, plan_name="Platform Granted Pro", plan_id="PLATFORM_GRANT",
        expiry_iso=expiry_iso, max_branches=body.max_branches, grant_type="grant_pro",
        reason=body.reason, admin_id=admin["id"],
    )
    override = await _write_override_log(
        salon_id=salon_id, admin=admin, override_type="grant_pro",
        override_details={
            "duration_months": body.duration_months,
            "duration_days": body.duration_days,
            "total_days": total_days,
            "max_branches": body.max_branches,
        },
        previous_state={
            "subscription_id": previous_state.get("id"),
            "payment_status": previous_state.get("payment_status"),
            "expiry_date": previous_state.get("expiry_date"),
            "max_branches": previous_state.get("max_branches"),
        },
        new_state={
            "subscription_id": sub["id"],
            "payment_status": "granted",
            "expiry_date": expiry_iso,
            "max_branches": body.max_branches,
        },
        reason=body.reason,
    )
    await _write_audit(
        admin=admin, action="grant_pro", target="salon", target_id=salon_id,
        payload={
            "override_id": override["id"],
            "duration_months": body.duration_months,
            "duration_days": body.duration_days,
            "total_days": total_days,
            "max_branches": body.max_branches,
        },
    )
    return {"ok": True, "override": override, "subscription_id": sub["id"]}


@management_router.post("/salons/{salon_id}/subscription/override-branches")
async def override_branches(
    salon_id: str, body: OverrideBranchesRequest,
    admin=Depends(require_platform_admin),
):
    """Raise (or lower) the max_branches cap on the active subscription."""
    sub = await _existing_active_sub(salon_id)
    if not sub:
        raise HTTPException(
            status_code=400,
            detail="No active subscription to override. Grant Pro / Comp first.",
        )

    previous_state = {
        "subscription_id": sub["id"],
        "max_branches": sub.get("max_branches"),
        "max_branches_override": sub.get("max_branches_override"),
    }
    await _db.salon_subscriptions.update_one(
        {"id": sub["id"]},
        {"$set": {
            "max_branches_override": body.max_branches,
            "updated_at": _now_iso(),
        }},
    )
    new_state = {
        "subscription_id": sub["id"],
        "max_branches": sub.get("max_branches"),
        "max_branches_override": body.max_branches,
    }
    override = await _write_override_log(
        salon_id=salon_id, admin=admin, override_type="override_branches",
        override_details={"max_branches": body.max_branches},
        previous_state=previous_state, new_state=new_state, reason=body.reason,
    )
    await _write_audit(
        admin=admin, action="override_branches", target="salon", target_id=salon_id,
        payload={"override_id": override["id"], "max_branches": body.max_branches},
    )
    return {"ok": True, "override": override}


@management_router.post("/salons/{salon_id}/subscription/extend-trial")
async def extend_trial(
    salon_id: str, body: ExtendTrialRequest,
    admin=Depends(require_platform_admin),
):
    """Extend the active subscription's expiry/trial_ends_at by N days."""
    sub = await _existing_active_sub(salon_id)
    if not sub:
        # No subscription yet — create a granted one for N days so the trial
        # extension behaves predictably even on brand-new salons.
        expiry_iso = _add_days(body.days)
        sub = await _create_granted_sub(
            salon_id=salon_id, plan_name="Platform Trial", plan_id="PLATFORM_TRIAL",
            expiry_iso=expiry_iso, max_branches=None, grant_type="grant_pro",
            reason=body.reason, admin_id=admin["id"],
        )
        await _db.salon_subscriptions.update_one(
            {"id": sub["id"]}, {"$set": {"trial_ends_at": expiry_iso}}
        )
        previous_state = {"subscription_id": None}
        new_state = {
            "subscription_id": sub["id"],
            "expiry_date": expiry_iso,
            "trial_ends_at": expiry_iso,
        }
    else:
        # Push out expiry / trial_ends_at by N days
        try:
            current_expiry = datetime.fromisoformat(
                (sub.get("expiry_date") or _now_iso()).replace("Z", "+00:00")
            )
            if current_expiry.tzinfo is None:
                current_expiry = current_expiry.replace(tzinfo=timezone.utc)
        except Exception:
            current_expiry = datetime.now(timezone.utc)
        # If already expired, extend from now; else extend from current expiry.
        base = max(current_expiry, datetime.now(timezone.utc))
        new_expiry = (base + timedelta(days=body.days)).isoformat()

        previous_state = {
            "subscription_id": sub["id"],
            "expiry_date": sub.get("expiry_date"),
            "trial_ends_at": sub.get("trial_ends_at"),
        }
        await _db.salon_subscriptions.update_one(
            {"id": sub["id"]},
            {"$set": {
                "expiry_date": new_expiry,
                "trial_ends_at": new_expiry,
                "updated_at": _now_iso(),
            }},
        )
        new_state = {
            "subscription_id": sub["id"],
            "expiry_date": new_expiry,
            "trial_ends_at": new_expiry,
        }

    override = await _write_override_log(
        salon_id=salon_id, admin=admin, override_type="extend_trial",
        override_details={"days": body.days},
        previous_state=previous_state, new_state=new_state, reason=body.reason,
    )
    await _write_audit(
        admin=admin, action="extend_trial", target="salon", target_id=salon_id,
        payload={"override_id": override["id"], "days": body.days},
    )
    return {"ok": True, "override": override}


# ---------- Revoke ----------

@management_router.post(
    "/salons/{salon_id}/subscription/revoke-override/{override_id}"
)
async def revoke_override(
    salon_id: str, override_id: str,
    admin=Depends(require_platform_admin),
):
    """Revert an override and restore the previous_state as best we can."""
    override = await _db.subscription_overrides_log.find_one(
        {"id": override_id, "salon_id": salon_id}, {"_id": 0}
    )
    if not override:
        raise HTTPException(status_code=404, detail="Override not found")
    if not override.get("active"):
        raise HTTPException(status_code=400, detail="Override is already revoked")

    prev = override.get("previous_state") or {}
    new = override.get("new_state") or {}
    ov_type = override.get("override_type")

    if ov_type in ("comp", "grant_pro"):
        # Expire the granted sub by setting its expiry to now.
        sub_id = new.get("subscription_id")
        if sub_id:
            now_iso = _now_iso()
            await _db.salon_subscriptions.update_one(
                {"id": sub_id},
                {"$set": {
                    "subscription_status": "cancelled",
                    "expiry_date": now_iso,
                    "revoked_at": now_iso,
                    "revoked_by_admin_id": admin["id"],
                    "updated_at": now_iso,
                }},
            )
    elif ov_type == "override_branches":
        sub_id = new.get("subscription_id")
        if sub_id:
            await _db.salon_subscriptions.update_one(
                {"id": sub_id},
                {"$set": {
                    "max_branches_override": prev.get("max_branches_override"),
                    "updated_at": _now_iso(),
                }},
            )
    elif ov_type == "extend_trial":
        sub_id = new.get("subscription_id")
        if sub_id:
            await _db.salon_subscriptions.update_one(
                {"id": sub_id},
                {"$set": {
                    "expiry_date": prev.get("expiry_date") or _now_iso(),
                    "trial_ends_at": prev.get("trial_ends_at"),
                    "updated_at": _now_iso(),
                }},
            )

    await _db.subscription_overrides_log.update_one(
        {"id": override_id},
        {"$set": {
            "active": False,
            "revoked_by_admin_id": admin["id"],
            "revoked_by_admin_mobile": admin.get("mobile"),
            "revoked_at": _now_iso(),
            "updated_at": _now_iso(),
        }},
    )
    await _write_audit(
        admin=admin, action="revoke_override", target="override", target_id=override_id,
        payload={"salon_id": salon_id, "override_type": ov_type},
    )
    return {"ok": True, "override_id": override_id}


# ---------- Phase 6: Dashboard Stats ----------

@management_router.get("/dashboard/stats")
async def dashboard_stats(admin=Depends(require_platform_admin)):
    """High-level KPIs for the platform admin dashboard.

    Includes:
      - Salon counts (total, active, suspended)
      - Subscription counts (active premium, expired, granted)
      - Month-to-date revenue (from paid payment_transactions in current month)
      - Active overrides count
      - Discount code counts (active / disabled / expired)
      - Suppliers pending approval (stub: 0 until Phase 8)
    """
    now = datetime.now(timezone.utc)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0).isoformat()

    # Salon counts
    total_salons = await _db.salons.count_documents({})
    suspended_salons = await _db.salons.count_documents({"status": "suspended"})
    active_salons = total_salons - suspended_salons

    # Subscription counts
    active_subs = await _db.salon_subscriptions.count_documents({
        "payment_status": {"$in": ["paid", "granted", "discounted_free"]},
        "subscription_status": {"$in": ["active", "granted"]},
        "expiry_date": {"$gt": now.isoformat()},
    })
    expired_subs = await _db.salon_subscriptions.count_documents({
        "expiry_date": {"$lte": now.isoformat()},
        "payment_status": {"$in": ["paid", "granted", "discounted_free"]},
    })
    granted_subs = await _db.salon_subscriptions.count_documents({
        "payment_status": "granted",
        "subscription_status": "granted",
        "expiry_date": {"$gt": now.isoformat()},
    })

    # MTD revenue (only real money — not discounted_free / granted)
    pipeline = [
        {"$match": {
            "payment_status": "success",
            "created_at": {"$gte": month_start},
        }},
        {"$group": {"_id": None, "total": {"$sum": "$amount"}, "count": {"$sum": 1}}},
    ]
    rev_cursor = _db.payment_transactions.aggregate(pipeline)
    rev_list = await rev_cursor.to_list(length=1)
    mtd_revenue = float(rev_list[0]["total"]) if rev_list else 0.0
    mtd_tx_count = int(rev_list[0]["count"]) if rev_list else 0

    # Active overrides
    active_overrides = await _db.subscription_overrides_log.count_documents({"active": True})

    # Discount codes
    total_codes = await _db.discount_codes.count_documents({})
    active_codes = await _db.discount_codes.count_documents({"status": "active"})
    disabled_codes = await _db.discount_codes.count_documents({"status": "disabled"})
    expired_codes = await _db.discount_codes.count_documents({"status": "expired"})

    # Usage stats for codes (this month)
    usage_pipeline = [
        {"$match": {"applied_at": {"$gte": month_start}}},
        {"$group": {"_id": None, "uses": {"$sum": 1}, "savings": {"$sum": "$discount_amount"}}},
    ]
    usage_cursor = _db.discount_code_usages.aggregate(usage_pipeline)
    usage_list = await usage_cursor.to_list(length=1)
    mtd_code_uses = int(usage_list[0]["uses"]) if usage_list else 0
    mtd_code_savings = float(usage_list[0]["savings"]) if usage_list else 0.0

    # Suppliers (stub for Phase 8)
    suppliers_pending = await _db.suppliers.count_documents({"approval_status": "pending"}) if "suppliers" in await _db.list_collection_names() else 0

    return {
        "as_of": now.isoformat(),
        "salons": {
            "total": total_salons,
            "active": active_salons,
            "suspended": suspended_salons,
        },
        "subscriptions": {
            "active": active_subs,
            "expired": expired_subs,
            "granted": granted_subs,
        },
        "revenue": {
            "mtd_amount": mtd_revenue,
            "mtd_transaction_count": mtd_tx_count,
        },
        "overrides": {
            "active": active_overrides,
        },
        "discount_codes": {
            "total": total_codes,
            "active": active_codes,
            "disabled": disabled_codes,
            "expired": expired_codes,
            "mtd_uses": mtd_code_uses,
            "mtd_savings": mtd_code_savings,
        },
        "suppliers": {
            "pending_approval": suppliers_pending,
        },
    }


# ---------- Phase 6: Broadcast ----------

async def _resolve_broadcast_audience(audience: str) -> List[dict]:
    """Return list of salon dicts matching the audience filter."""
    now_iso = datetime.now(timezone.utc).isoformat()
    if audience == "suspended_salons":
        cursor = _db.salons.find({"status": "suspended"}, {"_id": 0, "id": 1, "salon_name": 1, "phone": 1})
        return await cursor.to_list(length=10000)

    # Active salons (status active or unset)
    base_q = {"$or": [{"status": "active"}, {"status": {"$exists": False}}, {"status": None}]}

    if audience == "all_salons":
        cursor = _db.salons.find(base_q, {"_id": 0, "id": 1, "salon_name": 1, "phone": 1})
        return await cursor.to_list(length=10000)

    # For premium/free filter, look up active subscriptions
    cursor = _db.salons.find(base_q, {"_id": 0, "id": 1, "salon_name": 1, "phone": 1})
    all_salons = await cursor.to_list(length=10000)

    # Get salons with active subs
    active_sub_salon_ids = set()
    sub_cursor = _db.salon_subscriptions.find(
        {
            "payment_status": {"$in": ["paid", "granted", "discounted_free"]},
            "subscription_status": {"$in": ["active", "granted"]},
            "expiry_date": {"$gt": now_iso},
        },
        {"_id": 0, "salon_id": 1},
    )
    async for s in sub_cursor:
        active_sub_salon_ids.add(s["salon_id"])

    if audience == "premium_salons":
        return [s for s in all_salons if s["id"] in active_sub_salon_ids]
    elif audience == "free_salons":
        return [s for s in all_salons if s["id"] not in active_sub_salon_ids]

    return all_salons


@management_router.post("/broadcast")
async def send_broadcast(
    body: BroadcastRequest,
    admin=Depends(require_platform_admin),
):
    """Send an in-app broadcast notification to a target audience of salon admins.

    Stores a record in `platform_broadcasts` and fan-outs in-app notifications
    via `notifications` collection so salon admins see it in their bell.
    """
    if not _create_in_app_notification:
        raise HTTPException(
            status_code=503,
            detail="Broadcast not yet wired — notification helper missing",
        )

    salons = await _resolve_broadcast_audience(body.audience)
    broadcast_id = str(uuid.uuid4())
    now_iso = _now_iso()

    delivered = 0
    failed = 0
    for s in salons:
        try:
            res = await _create_in_app_notification(
                user_type="salon",
                user_id=s["id"],
                title=body.title,
                message=body.message,
                notification_type="platform_broadcast",
                setting_key="platform_broadcast",
                salon_id=s["id"],
                related_id=broadcast_id,
            )
            if res:
                delivered += 1
            else:
                # Suppressed by user preference still counts as attempted
                delivered += 1
        except Exception as e:
            logger.error(f"Broadcast in-app failure for salon {s['id']}: {e}")
            failed += 1

    # Persist broadcast record
    broadcast_doc = {
        "id": broadcast_id,
        "title": body.title,
        "message": body.message,
        "audience": body.audience,
        "channels": body.channels or ["in_app"],
        "target_count": len(salons),
        "delivered_count": delivered,
        "failed_count": failed,
        "sent_by_admin_id": admin["id"],
        "sent_by_admin_mobile": admin.get("mobile"),
        "created_at": now_iso,
    }
    await _db.platform_broadcasts.insert_one(broadcast_doc.copy())
    await _write_audit(
        admin=admin, action="send_broadcast", target="broadcast", target_id=broadcast_id,
        payload={"audience": body.audience, "target_count": len(salons), "delivered": delivered},
    )

    return broadcast_doc


@management_router.get("/broadcasts")
async def list_broadcasts(admin=Depends(require_platform_admin)):
    """Returns history of broadcasts (latest first)."""
    docs = await _db.platform_broadcasts.find({}, {"_id": 0}).sort("created_at", -1).to_list(length=200)
    return {"broadcasts": docs, "total": len(docs)}


# ---------- Phase 8: Supplier Approval (real impl, supersedes Phase 6 stubs) ----------


class SupplierRejectRequest(BaseModel):
    reason: str = Field(..., min_length=2, max_length=500)

    @field_validator("reason")
    @classmethod
    def reason_not_blank(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("reason must not be blank")
        return v.strip()


class SupplierSuspendRequest(BaseModel):
    reason: Optional[str] = Field(default=None, max_length=500)


async def _notify_supplier_whatsapp(supplier: dict, message: str) -> None:
    """Best-effort WhatsApp notification to a supplier. Logs failure but never raises."""
    if not _send_whatsapp_notification or not supplier.get("mobile"):
        return
    try:
        await _send_whatsapp_notification(supplier["mobile"], message, template_name="supplier_status")
    except Exception as e:
        logger.error(f"WhatsApp notify supplier {supplier.get('id')} failed: {e}")


@management_router.get("/suppliers")
async def list_suppliers(
    status: Optional[str] = Query(None, description="pending_approval | active | rejected | suspended"),
    q: Optional[str] = Query(None, description="Search business_name / owner_name / mobile"),
    admin=Depends(require_platform_admin),
):
    """Return suppliers list, latest first."""
    if "suppliers" not in await _db.list_collection_names():
        return {"suppliers": [], "total": 0}

    query: dict = {}
    if status:
        query["status"] = status
    if q:
        query["$or"] = [
            {"business_name": {"$regex": q, "$options": "i"}},
            {"owner_name": {"$regex": q, "$options": "i"}},
            {"mobile": {"$regex": q.replace("+", ""), "$options": "i"}},
        ]

    docs = await _db.suppliers.find(query, {"_id": 0, "password_hash": 0}).sort("created_at", -1).to_list(length=500)
    return {"suppliers": docs, "total": len(docs)}


@management_router.get("/suppliers/{supplier_id}")
async def get_supplier(supplier_id: str, admin=Depends(require_platform_admin)):
    supplier = await _db.suppliers.find_one({"id": supplier_id}, {"_id": 0, "password_hash": 0})
    if not supplier:
        raise HTTPException(status_code=404, detail="Supplier not found")
    return supplier


@management_router.post("/suppliers/{supplier_id}/approve")
async def approve_supplier(supplier_id: str, admin=Depends(require_platform_admin)):
    """Approve a pending or previously rejected supplier. Sends WhatsApp notification."""
    supplier = await _db.suppliers.find_one({"id": supplier_id}, {"_id": 0})
    if not supplier:
        raise HTTPException(status_code=404, detail="Supplier not found")
    if supplier.get("status") == "active":
        return {"ok": True, "status": "active", "message": "Already active"}

    now = _now_iso()
    await _db.suppliers.update_one(
        {"id": supplier_id},
        {"$set": {
            "status": "active",
            "approved_by_admin_id": admin.get("id"),
            "approved_at": now,
            "rejection_reason": None,
            "updated_at": now,
        }},
    )
    await _write_audit(admin=admin, action="approve_supplier", target="supplier", target_id=supplier_id, payload={})

    msg = (
        f"🎉 *Welcome to SalonHub Marketplace!*\n\n"
        f"Hi {supplier.get('owner_name') or 'Supplier'}, your supplier account "
        f"({supplier.get('business_name') or ''}) has been approved.\n\n"
        f"You can now start listing products. Log in here: /supplier/login"
    )
    await _notify_supplier_whatsapp({**supplier, "status": "active"}, msg)

    return {"ok": True, "supplier_id": supplier_id, "status": "active"}


@management_router.post("/suppliers/{supplier_id}/reject")
async def reject_supplier(
    supplier_id: str,
    body: SupplierRejectRequest,
    admin=Depends(require_platform_admin),
):
    """Reject a supplier with a required reason. Sends WhatsApp notification."""
    supplier = await _db.suppliers.find_one({"id": supplier_id}, {"_id": 0})
    if not supplier:
        raise HTTPException(status_code=404, detail="Supplier not found")

    now = _now_iso()
    await _db.suppliers.update_one(
        {"id": supplier_id},
        {"$set": {
            "status": "rejected",
            "rejection_reason": body.reason,
            "updated_at": now,
        }},
    )
    await _write_audit(
        admin=admin, action="reject_supplier", target="supplier", target_id=supplier_id,
        payload={"reason": body.reason},
    )

    msg = (
        f"Hello {supplier.get('owner_name') or 'there'},\n\n"
        f"Your supplier signup for SalonHub Marketplace could not be approved at this time.\n\n"
        f"*Reason:* {body.reason}\n\n"
        f"You may update your details and apply again, or reach out to support."
    )
    await _notify_supplier_whatsapp(supplier, msg)

    return {"ok": True, "supplier_id": supplier_id, "status": "rejected", "reason": body.reason}


@management_router.post("/suppliers/{supplier_id}/suspend")
async def suspend_supplier(
    supplier_id: str,
    body: SupplierSuspendRequest,
    admin=Depends(require_platform_admin),
):
    """Suspend an active supplier (immediately blocks login)."""
    supplier = await _db.suppliers.find_one({"id": supplier_id}, {"_id": 0})
    if not supplier:
        raise HTTPException(status_code=404, detail="Supplier not found")

    now = _now_iso()
    await _db.suppliers.update_one(
        {"id": supplier_id},
        {"$set": {
            "status": "suspended",
            "rejection_reason": body.reason,
            "updated_at": now,
        }},
    )
    await _write_audit(
        admin=admin, action="suspend_supplier", target="supplier", target_id=supplier_id,
        payload={"reason": body.reason or ""},
    )

    msg = (
        f"Hello {supplier.get('owner_name') or 'there'},\n\n"
        f"Your supplier account has been suspended. "
        f"{('Reason: ' + body.reason) if body.reason else ''}\n\n"
        f"Please contact support for assistance."
    )
    await _notify_supplier_whatsapp(supplier, msg)

    return {"ok": True, "supplier_id": supplier_id, "status": "suspended"}


# ---------- Wiring ----------

def init_platform_management_router(
    *, db,
    get_subscription_status, count_billable_branches,
    get_active_branch_ids, get_active_plan,
    secret_key: str, algorithm: str = "HS256",
    create_in_app_notification=None,
    send_whatsapp_notification=None,
):
    """Called by server.py at import time to inject shared dependencies."""
    global _db, _get_subscription_status
    global _count_billable_branches, _get_active_branch_ids, _get_active_plan
    global _secret_key, _algorithm, _create_in_app_notification, _send_whatsapp_notification
    _db = db
    _get_subscription_status = get_subscription_status
    _count_billable_branches = count_billable_branches
    _get_active_branch_ids = get_active_branch_ids
    _get_active_plan = get_active_plan
    _secret_key = secret_key
    _algorithm = algorithm
    _create_in_app_notification = create_in_app_notification
    _send_whatsapp_notification = send_whatsapp_notification
    return management_router
