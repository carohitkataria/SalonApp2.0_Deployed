"""
Phase 4 (Part D) — Discount Codes.

Backend module that owns:
  - `discount_codes` collection (CRUD by platform admin)
  - `discount_code_usages` collection (history)
  - validate_discount_code() — runs the 6 validation rules
  - compute_discount() — converts a validated code + base context into a
    discount_amount and a `discount_details` block for the UI
  - record_discount_usage() — writes the usage row + increments `current_uses`

Endpoints exposed:
  Platform admin (JWT role=platform_admin, mounted under /api/platform):
    POST    /discount-codes                  create
    GET     /discount-codes                  list (filter: status)
    GET     /discount-codes/{id}             detail
    PUT     /discount-codes/{id}             edit (code immutable)
    POST    /discount-codes/{id}/disable     soft-disable
    GET     /discount-codes/{id}/usages      usage history

Salon-side endpoints stay where they already are:
  GET     /api/salons/{salon_id}/subscription/quote?discount_code=…
  POST    /api/salons/{salon_id}/subscription/create-order  body.discount_code

Both are wired in server.py to call helpers from this module.
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field, field_validator

from platform_admin import get_current_platform_admin as require_platform_admin

logger = logging.getLogger(__name__)

# Injected at startup by server.py via init_discount_codes_router(...)
_db = None

discount_codes_router = APIRouter(
    prefix="/api/platform", tags=["platform-admin-discount-codes"]
)


# ---------- Models ----------

DISCOUNT_TYPES = {"free_months", "percent", "flat_per_month"}
APPLIES_TO_VALUES = {"all", "first_n"}


class DiscountCodeCreate(BaseModel):
    code: str = Field(..., min_length=2, max_length=40)
    description: Optional[str] = Field(default=None, max_length=500)
    discount_type: str

    # Type-specific
    free_months: Optional[int] = Field(default=None, ge=1, le=120)
    percent_off: Optional[float] = Field(default=None, ge=0.01, le=100)
    flat_off_per_month: Optional[float] = Field(default=None, ge=0.01)

    duration_months: Optional[int] = Field(default=None, ge=1, le=1200)

    max_branches_for_discount: Optional[int] = Field(default=None, ge=1, le=1000)
    applies_to_branches: str = Field(default="all")
    applies_to_first_n_branches: Optional[int] = Field(default=None, ge=1, le=1000)

    eligible_salon_ids: Optional[List[str]] = None
    is_new_salons_only: bool = False

    max_total_uses: Optional[int] = Field(default=None, ge=1)
    max_uses_per_salon: int = Field(default=1, ge=1)

    valid_from: Optional[str] = None
    valid_until: Optional[str] = None

    @field_validator("code")
    @classmethod
    def code_upper(cls, v: str) -> str:
        v = (v or "").strip().upper()
        if not v.replace("_", "").replace("-", "").isalnum():
            raise ValueError("code must be alphanumeric (with optional - or _)")
        return v

    @field_validator("discount_type")
    @classmethod
    def discount_type_valid(cls, v: str) -> str:
        if v not in DISCOUNT_TYPES:
            raise ValueError(f"discount_type must be one of {sorted(DISCOUNT_TYPES)}")
        return v

    @field_validator("applies_to_branches")
    @classmethod
    def applies_to_valid(cls, v: str) -> str:
        if v not in APPLIES_TO_VALUES:
            raise ValueError(f"applies_to_branches must be one of {sorted(APPLIES_TO_VALUES)}")
        return v


class DiscountCodeUpdate(BaseModel):
    description: Optional[str] = None
    discount_type: Optional[str] = None
    free_months: Optional[int] = None
    percent_off: Optional[float] = None
    flat_off_per_month: Optional[float] = None
    duration_months: Optional[int] = None
    max_branches_for_discount: Optional[int] = None
    applies_to_branches: Optional[str] = None
    applies_to_first_n_branches: Optional[int] = None
    eligible_salon_ids: Optional[List[str]] = None
    is_new_salons_only: Optional[bool] = None
    max_total_uses: Optional[int] = None
    max_uses_per_salon: Optional[int] = None
    valid_from: Optional[str] = None
    valid_until: Optional[str] = None
    status: Optional[str] = None


# ---------- Helpers ----------

def _now() -> datetime:
    return datetime.now(timezone.utc)


def _parse_iso(s: Optional[str]) -> Optional[datetime]:
    if not s:
        return None
    try:
        dt = datetime.fromisoformat(s.replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except Exception:
        return None


def _summary(code_doc: dict) -> str:
    """Short human-readable summary for list view."""
    t = code_doc.get("discount_type")
    if t == "free_months":
        n = code_doc.get("free_months") or 0
        return f"{n} free month{'s' if n != 1 else ''}"
    if t == "percent":
        p = code_doc.get("percent_off") or 0
        d = code_doc.get("duration_months")
        return f"{p}% off" + (f" for {d} months" if d else " (recurring)")
    if t == "flat_per_month":
        f = code_doc.get("flat_off_per_month") or 0
        d = code_doc.get("duration_months")
        return f"₹{f}/branch/mo off" + (f" for {d} months" if d else " (recurring)")
    return "—"


# ---------- Public-facing helpers (used by /quote and /create-order) ----------

async def validate_discount_code(
    *, code: str, salon_id: str, billable_branch_count: int,
) -> dict:
    """Run all 6 validation rules.

    Returns: {"valid": bool, "code_doc": <doc or None>, "reason": <str or None>}
    """
    if not code:
        return {"valid": False, "code_doc": None, "reason": "No code provided"}

    code_upper = code.strip().upper()
    doc = await _db.discount_codes.find_one({"code": code_upper}, {"_id": 0})
    if not doc:
        return {"valid": False, "code_doc": None, "reason": "Code not found"}

    # Rule 1: status active AND inside validity window
    if doc.get("status") != "active":
        return {"valid": False, "code_doc": doc,
                "reason": f"Code is {doc.get('status', 'inactive')}"}
    now = _now()
    vf = _parse_iso(doc.get("valid_from"))
    vu = _parse_iso(doc.get("valid_until"))
    if vf and now < vf:
        return {"valid": False, "code_doc": doc,
                "reason": f"Code becomes valid on {vf.date().isoformat()}"}
    if vu and now > vu:
        # Auto-mark expired so it stops appearing as active in list view.
        await _db.discount_codes.update_one(
            {"id": doc["id"]},
            {"$set": {"status": "expired", "updated_at": now.isoformat()}}
        )
        return {"valid": False, "code_doc": doc,
                "reason": f"Code expired on {vu.date().isoformat()}"}

    # Rule 2: max_total_uses
    max_total = doc.get("max_total_uses")
    if max_total is not None and (doc.get("current_uses") or 0) >= int(max_total):
        return {"valid": False, "code_doc": doc,
                "reason": "Code usage limit reached"}

    # Rule 3: per-salon use limit
    max_per_salon = int(doc.get("max_uses_per_salon") or 1)
    salon_used = await _db.discount_code_usages.count_documents(
        {"code_id": doc["id"], "salon_id": salon_id}
    )
    if salon_used >= max_per_salon:
        return {"valid": False, "code_doc": doc,
                "reason": "You have already used this code"}

    # Rule 4: eligible_salon_ids restriction
    eligible = doc.get("eligible_salon_ids")
    if eligible:
        if salon_id not in eligible:
            return {"valid": False, "code_doc": doc,
                    "reason": "This code is not available for your salon"}

    # Rule 5: new salons only — must have NO prior paid sub
    if doc.get("is_new_salons_only"):
        prior_paid = await _db.salon_subscriptions.count_documents(
            {"salon_id": salon_id, "payment_status": "paid"}
        )
        if prior_paid > 0:
            return {"valid": False, "code_doc": doc,
                    "reason": "This code is for new salons only"}

    # Rule 6: max_branches_for_discount
    max_branches = doc.get("max_branches_for_discount")
    if max_branches is not None and billable_branch_count > int(max_branches):
        return {"valid": False, "code_doc": doc,
                "reason": (
                    f"This code is only valid for salons with up to "
                    f"{max_branches} branch{'es' if max_branches != 1 else ''}"
                )}

    return {"valid": True, "code_doc": doc, "reason": None}


def compute_discount(
    *, code_doc: dict, base_amount: float, price_per_branch: float,
    billable_branch_count: int,
) -> dict:
    """Given a validated code, return the discount breakdown.

    Returns dict with:
      discount_amount, total_amount, is_free_months, free_months,
      grants_expiry_months, discount_details
    """
    t = code_doc.get("discount_type")
    discount_amount = 0.0
    grants_expiry_months = 0
    is_free_months = False

    if t == "free_months":
        # 100% off for `free_months` cycles. We model month-1 here:
        # base_amount → 0, free_months captured separately so create-order can
        # bypass Cashfree and set expiry to now + free_months * 30 days.
        is_free_months = True
        grants_expiry_months = int(code_doc.get("free_months") or 0)
        discount_amount = float(base_amount)

    elif t == "percent":
        pct = float(code_doc.get("percent_off") or 0)
        discount_amount = round(base_amount * pct / 100.0, 2)

    elif t == "flat_per_month":
        flat = float(code_doc.get("flat_off_per_month") or 0)
        applies_to = code_doc.get("applies_to_branches") or "all"
        if applies_to == "first_n":
            n = int(code_doc.get("applies_to_first_n_branches") or 0)
            covered = max(0, min(n, billable_branch_count))
        else:
            covered = billable_branch_count
        discount_amount = round(flat * covered, 2)

    # Cap to base_amount — never negative totals
    discount_amount = min(discount_amount, float(base_amount))
    discount_amount = max(discount_amount, 0.0)
    total_amount = round(max(base_amount - discount_amount, 0.0), 2)

    discount_details = {
        "code": code_doc.get("code"),
        "valid": True,
        "discount_type": t,
        "summary": _summary(code_doc),
        "duration_months": code_doc.get("duration_months"),
        "is_free_months": is_free_months,
        "free_months_granted": grants_expiry_months,
        "savings": discount_amount,
        "description": code_doc.get("description"),
    }

    return {
        "discount_amount": discount_amount,
        "total_amount": total_amount,
        "is_free_months": is_free_months,
        "free_months": grants_expiry_months,
        "discount_details": discount_details,
    }


async def record_discount_usage(
    *, code_doc: dict, salon_id: str, subscription_id: str,
    base_amount: float, discount_amount: float, final_amount: float,
    branch_count_at_use: int,
):
    """Insert a usage row + increment current_uses atomically (best-effort)."""
    await _db.discount_code_usages.insert_one({
        "id": str(uuid.uuid4()),
        "code_id": code_doc["id"],
        "code_snapshot": {
            k: code_doc.get(k) for k in (
                "code", "discount_type", "free_months", "percent_off",
                "flat_off_per_month", "duration_months",
                "applies_to_branches", "applies_to_first_n_branches",
            )
        },
        "salon_id": salon_id,
        "subscription_id": subscription_id,
        "base_amount": float(base_amount),
        "discount_amount": float(discount_amount),
        "final_amount": float(final_amount),
        "branch_count_at_use": int(branch_count_at_use),
        "applied_at": _now().isoformat(),
    })
    await _db.discount_codes.update_one(
        {"id": code_doc["id"]},
        {"$inc": {"current_uses": 1}, "$set": {"updated_at": _now().isoformat()}},
    )


# ---------- Admin CRUD endpoints ----------

@discount_codes_router.post("/discount-codes")
async def create_code(
    body: DiscountCodeCreate,
    admin=Depends(require_platform_admin),
):
    # Per-type field requirements
    if body.discount_type == "free_months" and not body.free_months:
        raise HTTPException(status_code=422, detail="free_months is required for free_months type")
    if body.discount_type == "percent" and not body.percent_off:
        raise HTTPException(status_code=422, detail="percent_off is required for percent type")
    if body.discount_type == "flat_per_month" and not body.flat_off_per_month:
        raise HTTPException(status_code=422, detail="flat_off_per_month is required for flat_per_month type")
    if body.applies_to_branches == "first_n" and not body.applies_to_first_n_branches:
        raise HTTPException(status_code=422, detail="applies_to_first_n_branches required when applies_to_branches=first_n")

    # Validate valid_from < valid_until if both provided
    vf = _parse_iso(body.valid_from)
    vu = _parse_iso(body.valid_until)
    if vf and vu and vu <= vf:
        raise HTTPException(status_code=422, detail="valid_until must be after valid_from")

    # Uniqueness
    existing = await _db.discount_codes.find_one({"code": body.code}, {"_id": 0, "id": 1})
    if existing:
        raise HTTPException(status_code=400, detail=f"Code {body.code} already exists")

    now_iso = _now().isoformat()
    doc = body.model_dump()
    doc.update({
        "id": str(uuid.uuid4()),
        "status": "active",
        "current_uses": 0,
        "created_by_admin_id": admin["id"],
        "created_at": now_iso,
        "updated_at": now_iso,
    })
    await _db.discount_codes.insert_one(doc.copy())
    return doc


@discount_codes_router.get("/discount-codes")
async def list_codes(
    status: Optional[str] = Query(None),
    admin=Depends(require_platform_admin),
):
    q: dict = {}
    if status:
        q["status"] = status
    docs = await _db.discount_codes.find(q, {"_id": 0}).sort("created_at", -1).to_list(length=500)
    # Add a human-readable summary for the list view.
    for d in docs:
        d["summary"] = _summary(d)
    return {"codes": docs, "total": len(docs)}


@discount_codes_router.get("/discount-codes/{code_id}")
async def get_code(code_id: str, admin=Depends(require_platform_admin)):
    doc = await _db.discount_codes.find_one({"id": code_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Code not found")
    doc["summary"] = _summary(doc)
    return doc


@discount_codes_router.put("/discount-codes/{code_id}")
async def update_code(
    code_id: str, body: DiscountCodeUpdate,
    admin=Depends(require_platform_admin),
):
    doc = await _db.discount_codes.find_one({"id": code_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Code not found")

    update_data = {k: v for k, v in body.model_dump().items() if v is not None}
    if "discount_type" in update_data and update_data["discount_type"] not in DISCOUNT_TYPES:
        raise HTTPException(status_code=422, detail="invalid discount_type")
    if "applies_to_branches" in update_data and update_data["applies_to_branches"] not in APPLIES_TO_VALUES:
        raise HTTPException(status_code=422, detail="invalid applies_to_branches")
    if "status" in update_data and update_data["status"] not in {"active", "disabled", "expired"}:
        raise HTTPException(status_code=422, detail="status must be active|disabled|expired")

    # Re-validate date window
    vf = _parse_iso(update_data.get("valid_from") or doc.get("valid_from"))
    vu = _parse_iso(update_data.get("valid_until") or doc.get("valid_until"))
    if vf and vu and vu <= vf:
        raise HTTPException(status_code=422, detail="valid_until must be after valid_from")

    update_data["updated_at"] = _now().isoformat()
    await _db.discount_codes.update_one({"id": code_id}, {"$set": update_data})
    new_doc = await _db.discount_codes.find_one({"id": code_id}, {"_id": 0})
    new_doc["summary"] = _summary(new_doc)
    return new_doc


@discount_codes_router.post("/discount-codes/{code_id}/disable")
async def disable_code(code_id: str, admin=Depends(require_platform_admin)):
    doc = await _db.discount_codes.find_one({"id": code_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Code not found")
    if doc.get("status") == "disabled":
        return {"ok": True, "id": code_id, "status": "disabled"}
    await _db.discount_codes.update_one(
        {"id": code_id},
        {"$set": {"status": "disabled", "updated_at": _now().isoformat()}},
    )
    return {"ok": True, "id": code_id, "status": "disabled"}


@discount_codes_router.post("/discount-codes/{code_id}/enable")
async def enable_code(code_id: str, admin=Depends(require_platform_admin)):
    """Re-enable a disabled code (useful counterpart to /disable)."""
    doc = await _db.discount_codes.find_one({"id": code_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Code not found")
    await _db.discount_codes.update_one(
        {"id": code_id},
        {"$set": {"status": "active", "updated_at": _now().isoformat()}},
    )
    return {"ok": True, "id": code_id, "status": "active"}


@discount_codes_router.get("/discount-codes/{code_id}/usages")
async def list_usages(code_id: str, admin=Depends(require_platform_admin)):
    code = await _db.discount_codes.find_one({"id": code_id}, {"_id": 0})
    if not code:
        raise HTTPException(status_code=404, detail="Code not found")
    usages = await _db.discount_code_usages.find(
        {"code_id": code_id}, {"_id": 0}
    ).sort("applied_at", -1).to_list(length=2000)
    # Enrich with salon names
    salon_ids = list({u["salon_id"] for u in usages})
    salons = await _db.salons.find(
        {"id": {"$in": salon_ids}}, {"_id": 0, "id": 1, "salon_name": 1, "phone": 1}
    ).to_list(length=len(salon_ids) + 1)
    salon_map = {s["id"]: s for s in salons}
    for u in usages:
        s = salon_map.get(u["salon_id"], {})
        u["salon_name"] = s.get("salon_name")
        u["salon_phone"] = s.get("phone")
    return {"code": code, "usages": usages, "total": len(usages)}


# ---------- Wiring ----------

def init_discount_codes_router(*, db):
    global _db
    _db = db
    return discount_codes_router
