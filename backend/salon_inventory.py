"""
Phase 14 — Salon Inventory Management.

Owned by the salon (vs supplier_products which is owned by the supplier).
Provides full CRUD + lifecycle management for the stock that physically lives
in the salon: assign to staff, reserve internally, release, consume,
sell-over-the-counter (POS), and a complete movement history.

Schema — `salon_inventory` doc:
    id, salon_id, branch_id,
    product_id_source         (supplier_products.id if seeded via Phase 13, else None)
    source_order_id           (salon_orders.id if seeded via Phase 13, else None)
    name, brand, category, unit, pack_size,
    cost_price, selling_price, gst_percent, mrp, discount,
    qty_total,
    qty_reserved_for_internal,
    qty_reserved_for_customer_orders,
    availability              ("both" | "sale_only" | "internal_only")
    assigned_to_staff_id,
    low_stock_threshold,
    sku_code,
    image_url,
    is_deleted,
    created_at, updated_at

Schema — `salon_inventory_movements` doc:
    id, inventory_item_id, salon_id, branch_id,
    movement_type, qty_delta, qty_after,
    reference_type, reference_id,
    staff_id, note, created_by, created_at

Movement types enum:
    purchase_in, manual_add, sale_to_customer, internal_consumption,
    assign_to_staff, reserve_internal, release_reserve, adjustment, return
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, Field, field_validator

logger = logging.getLogger(__name__)

# Injected by init_salon_inventory_router (server.py wires these at startup).
_db = None
_get_current_salon_user = None
_resolve_branch_id = None

salon_inventory_router = APIRouter(tags=["salon-inventory"])
_bearer = HTTPBearer(auto_error=False)

VALID_UNITS = {"piece", "ml", "g", "kg", "litre", "pack", "bottle", "tube", "jar", "kit", "set"}
VALID_AVAILABILITY = {"both", "sale_only", "internal_only"}
VALID_MOVEMENT_TYPES = {
    "purchase_in", "manual_add", "sale_to_customer", "internal_consumption",
    "assign_to_staff", "reserve_internal", "release_reserve", "adjustment", "return",
}


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _today_str() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


def init_salon_inventory_router(*, db, get_current_salon_user, resolve_branch_id):
    global _db, _get_current_salon_user, _resolve_branch_id
    _db = db
    _get_current_salon_user = get_current_salon_user
    _resolve_branch_id = resolve_branch_id


async def _salon_auth(credentials: HTTPAuthorizationCredentials = Depends(_bearer)):
    if _get_current_salon_user is None:
        raise HTTPException(status_code=500, detail="salon_inventory_not_initialised")
    if credentials is None:
        raise HTTPException(status_code=401, detail="Authentication required")
    return await _get_current_salon_user(credentials)


# ===================== Models =====================

class InventoryCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    brand: Optional[str] = Field(default=None, max_length=120)
    category: Optional[str] = Field(default=None, max_length=80)
    unit: str = Field(default="piece")
    pack_size: Optional[str] = Field(default=None, max_length=80)
    cost_price: float = Field(default=0.0, ge=0)
    selling_price: float = Field(default=0.0, ge=0)
    gst_percent: float = Field(default=0.0, ge=0, le=100)
    mrp: float = Field(default=0.0, ge=0)
    discount: float = Field(default=0.0, ge=0, le=100)
    qty_total: int = Field(default=0, ge=0)
    availability: str = Field(default="both")
    low_stock_threshold: int = Field(default=5, ge=0)
    sku_code: Optional[str] = Field(default=None, max_length=80)
    image_url: Optional[str] = Field(default=None, max_length=600)
    supplier: Optional[str] = Field(default=None, max_length=200)
    expiry: Optional[str] = Field(default=None, max_length=32)
    assigned_staff_ids: Optional[List[str]] = None
    branch_id: Optional[str] = None
    # Jul 2026 — auto-purchase-entry fields when salon adds stock manually
    purchase_payment_mode: Optional[str] = Field(
        default="none",
        description="cash | upi | bank | none (none = do not create financial entry)"
    )
    purchase_note: Optional[str] = Field(default=None, max_length=500)

    @field_validator("unit")
    @classmethod
    def _v_unit(cls, v): return v if v in VALID_UNITS else "piece"

    @field_validator("availability")
    @classmethod
    def _v_av(cls, v):
        if v not in VALID_AVAILABILITY:
            raise ValueError(f"availability must be one of {VALID_AVAILABILITY}")
        return v

    @field_validator("purchase_payment_mode")
    @classmethod
    def _v_ppm(cls, v):
        if v is None or v == "":
            return "none"
        if v not in {"cash", "upi", "bank", "none"}:
            raise ValueError("purchase_payment_mode must be cash | upi | bank | none")
        return v


class InventoryUpdate(BaseModel):
    name: Optional[str] = Field(default=None, max_length=200)
    brand: Optional[str] = Field(default=None, max_length=120)
    category: Optional[str] = Field(default=None, max_length=80)
    unit: Optional[str] = None
    pack_size: Optional[str] = Field(default=None, max_length=80)
    cost_price: Optional[float] = Field(default=None, ge=0)
    selling_price: Optional[float] = Field(default=None, ge=0)
    gst_percent: Optional[float] = Field(default=None, ge=0, le=100)
    mrp: Optional[float] = Field(default=None, ge=0)
    discount: Optional[float] = Field(default=None, ge=0, le=100)
    availability: Optional[str] = None
    low_stock_threshold: Optional[int] = Field(default=None, ge=0)
    sku_code: Optional[str] = Field(default=None, max_length=80)
    image_url: Optional[str] = Field(default=None, max_length=600)
    supplier: Optional[str] = Field(default=None, max_length=200)
    expiry: Optional[str] = Field(default=None, max_length=32)
    assigned_staff_ids: Optional[List[str]] = None

    @field_validator("unit")
    @classmethod
    def _v_unit(cls, v):
        if v is None: return v
        return v if v in VALID_UNITS else "piece"

    @field_validator("availability")
    @classmethod
    def _v_av(cls, v):
        if v is None: return v
        if v not in VALID_AVAILABILITY:
            raise ValueError(f"availability must be one of {VALID_AVAILABILITY}")
        return v


class AssignPayload(BaseModel):
    staff_id: Optional[str] = None  # None = common pool / unassign
    qty: int = Field(..., ge=0)


class QtyPayload(BaseModel):
    qty: int = Field(..., ge=1)


class ConsumePayload(BaseModel):
    qty: int = Field(..., ge=1)
    staff_id: Optional[str] = None
    note: Optional[str] = Field(default=None, max_length=500)


class SellPayload(BaseModel):
    qty: int = Field(..., ge=1)
    payment_mode: str = Field(default="cash")
    staff_id: Optional[str] = None
    branch_id: Optional[str] = None
    note: Optional[str] = Field(default=None, max_length=500)
    # Jul 2026 — optional customer info when selling inventory
    customer_name: Optional[str] = Field(default=None, max_length=120)
    customer_phone: Optional[str] = Field(default=None, max_length=20)

    @field_validator("payment_mode")
    @classmethod
    def _v_pm(cls, v):
        if v not in {"cash", "card", "upi", "wallet", "other"}:
            raise ValueError("payment_mode must be cash/card/upi/wallet/other")
        return v


class RestockPayload(BaseModel):
    """Phase 17 — manual stock-in for salon inventory items."""
    qty: int = Field(..., ge=1)
    cost_price: Optional[float] = Field(default=None, ge=0)
    supplier: Optional[str] = Field(default=None, max_length=200)
    expiry: Optional[str] = Field(default=None, max_length=32)  # YYYY-MM or YYYY-MM-DD
    note: Optional[str] = Field(default=None, max_length=500)
    payment_mode: Optional[str] = Field(default="cash")
    record_finance: bool = Field(default=False)  # set True to log an inventory_purchase outflow


# Module-level hook (injected by server.py) for cross-module notifications
_fire_customer_restock_for_product = None
_in_app_notifier = None


def set_notification_hooks(*, fire_customer_restock=None, in_app_notifier=None):
    """Wire Phase 16 notification hooks after both modules import."""
    global _fire_customer_restock_for_product, _in_app_notifier
    if fire_customer_restock is not None:
        _fire_customer_restock_for_product = fire_customer_restock
    if in_app_notifier is not None:
        _in_app_notifier = in_app_notifier


async def _maybe_low_stock_alert(item: dict) -> None:
    """Phase 16 — send in-app alert when qty_total dips to/below threshold.

    Idempotent per `low_stock_alert_sent` flag; reset when we restock above
    threshold.
    """
    if _in_app_notifier is None:
        return
    threshold = int(item.get("low_stock_threshold") or 0)
    qty = int(item.get("qty_total") or 0)
    already_sent = bool(item.get("low_stock_alert_sent"))
    if threshold > 0 and qty <= threshold and not already_sent:
        try:
            await _in_app_notifier(
                user_type="salon",
                user_id=item["salon_id"],
                title="Low stock alert",
                message=f"'{item.get('name')}' is low ({qty} {item.get('unit') or 'units'} left, threshold {threshold}).",
                notification_type="inventory_low_stock",
                setting_key="inventory_low_stock",
                salon_id=item["salon_id"],
                related_id=item["id"],
            )
        except Exception as e:
            logger.error(f"[salon_inventory] low stock notify failed: {e}")
        await _db.salon_inventory.update_one(
            {"id": item["id"]},
            {"$set": {"low_stock_alert_sent": True, "low_stock_alert_at": _now_iso()}},
        )


async def _maybe_clear_low_stock_flag(item: dict) -> None:
    """If qty bounced back above threshold, clear the alert flag so the next dip re-fires."""
    threshold = int(item.get("low_stock_threshold") or 0)
    qty = int(item.get("qty_total") or 0)
    if item.get("low_stock_alert_sent") and qty > threshold:
        await _db.salon_inventory.update_one(
            {"id": item["id"]},
            {"$set": {"low_stock_alert_sent": False}, "$unset": {"low_stock_alert_at": ""}},
        )


# ===================== Helpers =====================

def _strip(o: dict) -> dict:
    o.pop("_id", None)
    return o


def _enrich(item: dict) -> dict:
    """Add derived fields the UI needs (e.g. customer-visible qty, low stock flag)."""
    total = int(item.get("qty_total") or 0)
    res_int = int(item.get("qty_reserved_for_internal") or 0)
    res_cust = int(item.get("qty_reserved_for_customer_orders") or 0)
    item["qty_available_for_customer"] = max(0, total - res_int - res_cust)
    item["qty_available_for_internal"] = max(0, total - res_cust)
    item["is_low_stock"] = total <= int(item.get("low_stock_threshold") or 0)
    return item


async def _log_movement(*, item: dict, movement_type: str, qty_delta: int, qty_after: int,
                        reference_type: str, reference_id: str,
                        staff_id: Optional[str] = None, note: Optional[str] = None,
                        created_by: str = "system") -> None:
    """Append a row to salon_inventory_movements. Best-effort but logged on failure."""
    try:
        await _db.salon_inventory_movements.insert_one({
            "id": str(uuid.uuid4()),
            "inventory_item_id": item["id"],
            "salon_id": item["salon_id"],
            "branch_id": item.get("branch_id"),
            "movement_type": movement_type,
            "qty_delta": qty_delta,
            "qty_after": qty_after,
            "reference_type": reference_type,
            "reference_id": reference_id,
            "staff_id": staff_id,
            "note": note,
            "item_name": item.get("name"),
            "created_by": created_by,
            "created_at": _now_iso(),
        })
    except Exception as e:
        logger.error(f"[salon_inventory] failed to log movement for {item.get('id')}: {e}")


async def _get_item_or_404(item_id: str, salon_id: str) -> dict:
    doc = await _db.salon_inventory.find_one(
        {"id": item_id, "salon_id": salon_id, "is_deleted": {"$ne": True}},
        {"_id": 0},
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Inventory item not found")
    return doc


def _check_availability_for_internal(item: dict) -> None:
    if item.get("availability") == "sale_only":
        raise HTTPException(status_code=409, detail="This item is marked 'sale_only' and cannot be used internally")


def _check_availability_for_sale(item: dict) -> None:
    if item.get("availability") == "internal_only":
        raise HTTPException(status_code=409, detail="This item is marked 'internal_only' and cannot be sold")


# ===================== Endpoints =====================

@salon_inventory_router.get("/api/salon/inventory")
async def list_inventory(
    q: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    brand: Optional[str] = Query(None),
    availability: Optional[str] = Query(None),
    branch_id: Optional[str] = Query(None),
    low_stock_only: bool = Query(False),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    user: dict = Depends(_salon_auth),
):
    salon_id = user.get("salon_id") or user.get("sub")
    query: dict = {"salon_id": salon_id, "is_deleted": {"$ne": True}}
    if branch_id: query["branch_id"] = branch_id
    if category:  query["category"] = category
    if brand:     query["brand"] = brand
    if availability and availability in VALID_AVAILABILITY:
        query["availability"] = availability
    if q:
        query["$or"] = [
            {"name":  {"$regex": q, "$options": "i"}},
            {"brand": {"$regex": q, "$options": "i"}},
            {"sku_code": {"$regex": q, "$options": "i"}},
        ]

    total = await _db.salon_inventory.count_documents(query)
    cursor = (
        _db.salon_inventory
        .find(query, {"_id": 0})
        .sort([("name", 1)])
        .skip((page - 1) * page_size)
        .limit(page_size)
    )
    items: list = []
    async for doc in cursor:
        enriched = _enrich(doc)
        if low_stock_only and not enriched["is_low_stock"]:
            continue
        items.append(enriched)

    # When low_stock_only filtering is applied client-side, total reflects pre-filter count.
    return {
        "inventory_items": items,
        "total_count": total,
        "page": page,
        "page_size": page_size,
        "total_pages": max(1, (total + page_size - 1) // page_size),
    }


@salon_inventory_router.get("/api/salon/inventory/movements")
async def list_all_movements(
    movement_type: Optional[str] = Query(None),
    inventory_item_id: Optional[str] = Query(None),
    branch_id: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(100, ge=1, le=500),
    user: dict = Depends(_salon_auth),
):
    salon_id = user.get("salon_id") or user.get("sub")
    query: dict = {"salon_id": salon_id}
    if movement_type:     query["movement_type"] = movement_type
    if inventory_item_id: query["inventory_item_id"] = inventory_item_id
    if branch_id:         query["branch_id"] = branch_id

    total = await _db.salon_inventory_movements.count_documents(query)
    cursor = (
        _db.salon_inventory_movements
        .find(query, {"_id": 0})
        .sort([("created_at", -1)])
        .skip((page - 1) * page_size)
        .limit(page_size)
    )
    movements: list = []
    async for d in cursor: movements.append(d)
    return {
        "movements": movements,
        "total_count": total,
        "page": page,
        "page_size": page_size,
        "total_pages": max(1, (total + page_size - 1) // page_size),
    }


@salon_inventory_router.get("/api/salon/inventory/{item_id}")
async def get_inventory(item_id: str, user: dict = Depends(_salon_auth)):
    salon_id = user.get("salon_id") or user.get("sub")
    doc = await _get_item_or_404(item_id, salon_id)
    return _enrich(doc)


@salon_inventory_router.post("/api/salon/inventory")
async def create_inventory(payload: InventoryCreate, user: dict = Depends(_salon_auth)):
    salon_id = user.get("salon_id") or user.get("sub")
    branch_id = await _resolve_branch_id(salon_id, payload.branch_id) if _resolve_branch_id else payload.branch_id

    item_id = str(uuid.uuid4())
    doc = {
        "id": item_id,
        "salon_id": salon_id,
        "branch_id": branch_id,
        "product_id_source": None,
        "source_order_id": None,
        "name": payload.name,
        "brand": payload.brand,
        "category": payload.category,
        "unit": payload.unit,
        "pack_size": payload.pack_size,
        "cost_price": float(payload.cost_price or 0),
        "selling_price": float(payload.selling_price or 0),
        "gst_percent": float(payload.gst_percent or 0),
        "mrp": float(payload.mrp or 0),
        "discount": float(payload.discount or 0),
        "qty_total": int(payload.qty_total or 0),
        "qty_reserved_for_internal": 0,
        "qty_reserved_for_customer_orders": 0,
        "availability": payload.availability,
        "assigned_to_staff_id": None,
        "low_stock_threshold": int(payload.low_stock_threshold or 0),
        "sku_code": payload.sku_code,
        "image_url": payload.image_url,
        "is_deleted": False,
        "created_at": _now_iso(),
        "updated_at": _now_iso(),
    }
    await _db.salon_inventory.insert_one(doc.copy())
    doc.pop("_id", None)
    # Movement entry if seeded with any quantity.
    if doc["qty_total"] > 0:
        await _log_movement(
            item=doc,
            movement_type="manual_add",
            qty_delta=doc["qty_total"],
            qty_after=doc["qty_total"],
            reference_type="adjustment",
            reference_id=item_id,
            created_by=user.get("user_id") or "salon_user",
            note="Initial stock on manual create",
        )
    # Jul 2026 — auto-post a purchase-outflow to Financials when the salon
    # opts in with a real payment mode (cash / upi / bank). Nomenclature:
    # `purchase_payment_mode = "none"` disables the finance entry entirely.
    fin_id = None
    ppm = (payload.purchase_payment_mode or "none")
    if ppm != "none" and doc["qty_total"] > 0 and (doc.get("cost_price") or 0) > 0:
        amount = round(float(doc["cost_price"]) * int(doc["qty_total"]), 2)
        fin_id = str(uuid.uuid4())
        await _db.financial_transactions.insert_one({
            "id": fin_id,
            "salon_id": salon_id,
            "branch_id": doc.get("branch_id"),
            "type": "outflow",
            "category": "inventory_purchase",
            "amount": amount,
            "payment_mode": ppm,
            "narration": f"Inventory purchase · {doc.get('name')} × {doc['qty_total']}",
            "reference_id": item_id,
            "reference_type": "manual_inventory_add",
            "created_by": user.get("user_id") or "salon_user",
            "date": _today_str(),
            "created_at": _now_iso(),
            "note": payload.purchase_note,
        })
    enriched = _enrich(doc)
    if fin_id:
        enriched["financial_transaction_id"] = fin_id
    return enriched


@salon_inventory_router.put("/api/salon/inventory/{item_id}")
async def update_inventory(item_id: str, payload: InventoryUpdate, user: dict = Depends(_salon_auth)):
    salon_id = user.get("salon_id") or user.get("sub")
    existing = await _get_item_or_404(item_id, salon_id)

    updates = {k: v for k, v in payload.model_dump(exclude_none=True).items()}
    if not updates:
        return _enrich(existing)

    # If sourced from a supplier product, protect the identity fields.
    if existing.get("product_id_source"):
        for protected in ("name", "brand", "unit"):
            updates.pop(protected, None)

    updates["updated_at"] = _now_iso()
    await _db.salon_inventory.update_one({"id": item_id}, {"$set": updates})
    fresh = await _db.salon_inventory.find_one({"id": item_id}, {"_id": 0})
    return _enrich(fresh)


@salon_inventory_router.delete("/api/salon/inventory/{item_id}")
async def delete_inventory(item_id: str, user: dict = Depends(_salon_auth)):
    salon_id = user.get("salon_id") or user.get("sub")
    # Raises 404 when the item doesn't belong to this salon.
    await _get_item_or_404(item_id, salon_id)
    await _db.salon_inventory.update_one(
        {"id": item_id},
        {"$set": {"is_deleted": True, "updated_at": _now_iso()}},
    )
    return {"ok": True}


@salon_inventory_router.get("/api/salon/inventory/{item_id}/movements")
async def list_item_movements(
    item_id: str,
    page: int = Query(1, ge=1),
    page_size: int = Query(100, ge=1, le=500),
    user: dict = Depends(_salon_auth),
):
    salon_id = user.get("salon_id") or user.get("sub")
    await _get_item_or_404(item_id, salon_id)
    query = {"inventory_item_id": item_id, "salon_id": salon_id}
    total = await _db.salon_inventory_movements.count_documents(query)
    cursor = (
        _db.salon_inventory_movements
        .find(query, {"_id": 0})
        .sort([("created_at", -1)])
        .skip((page - 1) * page_size)
        .limit(page_size)
    )
    movements: list = []
    async for d in cursor: movements.append(d)
    return {
        "movements": movements,
        "total_count": total,
        "page": page,
        "page_size": page_size,
        "total_pages": max(1, (total + page_size - 1) // page_size),
    }


# ----- Lifecycle endpoints -----

@salon_inventory_router.post("/api/salon/inventory/{item_id}/assign")
async def assign_to_staff(item_id: str, payload: AssignPayload, user: dict = Depends(_salon_auth)):
    salon_id = user.get("salon_id") or user.get("sub")
    item = await _get_item_or_404(item_id, salon_id)
    _check_availability_for_internal(item)

    # `qty` here represents the new reserved-for-internal amount tied to a staff,
    # not a delta. We diff against the existing reserve.
    new_reserve = int(payload.qty or 0)
    existing_reserve = int(item.get("qty_reserved_for_internal") or 0)
    delta = new_reserve - existing_reserve
    qty_total = int(item.get("qty_total") or 0)
    qty_cust_res = int(item.get("qty_reserved_for_customer_orders") or 0)

    if new_reserve > qty_total - qty_cust_res:
        raise HTTPException(
            status_code=409,
            detail=f"Cannot reserve {new_reserve}; only {qty_total - qty_cust_res} units exist outside customer reservations",
        )

    updated = await _db.salon_inventory.find_one_and_update(
        {"id": item_id, "salon_id": salon_id},
        {"$set": {
            "qty_reserved_for_internal": new_reserve,
            "assigned_to_staff_id": payload.staff_id,
            "updated_at": _now_iso(),
        }},
        return_document=True,
        projection={"_id": 0},
    )
    await _log_movement(
        item=updated,
        movement_type="assign_to_staff" if payload.staff_id else "reserve_internal",
        qty_delta=delta,
        qty_after=int(updated.get("qty_total") or 0),
        reference_type="staff_assignment",
        reference_id=payload.staff_id or "common_pool",
        staff_id=payload.staff_id,
        created_by=user.get("user_id") or "salon_user",
    )
    return _enrich(updated)


@salon_inventory_router.post("/api/salon/inventory/{item_id}/reserve-internal")
async def reserve_internal(item_id: str, payload: QtyPayload, user: dict = Depends(_salon_auth)):
    salon_id = user.get("salon_id") or user.get("sub")
    item = await _get_item_or_404(item_id, salon_id)
    _check_availability_for_internal(item)

    qty_total = int(item.get("qty_total") or 0)
    cur_res_int = int(item.get("qty_reserved_for_internal") or 0)
    cur_res_cust = int(item.get("qty_reserved_for_customer_orders") or 0)
    if cur_res_int + payload.qty > qty_total - cur_res_cust:
        raise HTTPException(status_code=409, detail="Not enough available stock to reserve internally")

    updated = await _db.salon_inventory.find_one_and_update(
        {"id": item_id, "salon_id": salon_id},
        {"$inc": {"qty_reserved_for_internal": payload.qty},
         "$set": {"updated_at": _now_iso()}},
        return_document=True,
        projection={"_id": 0},
    )
    await _log_movement(
        item=updated, movement_type="reserve_internal",
        qty_delta=payload.qty,
        qty_after=int(updated.get("qty_total") or 0),
        reference_type="adjustment", reference_id=item_id,
        created_by=user.get("user_id") or "salon_user",
    )
    return _enrich(updated)


@salon_inventory_router.post("/api/salon/inventory/{item_id}/release-internal")
async def release_internal(item_id: str, payload: QtyPayload, user: dict = Depends(_salon_auth)):
    salon_id = user.get("salon_id") or user.get("sub")
    item = await _get_item_or_404(item_id, salon_id)
    if int(item.get("qty_reserved_for_internal") or 0) < payload.qty:
        raise HTTPException(status_code=409, detail="Cannot release more than currently reserved")

    updated = await _db.salon_inventory.find_one_and_update(
        {"id": item_id, "salon_id": salon_id,
         "qty_reserved_for_internal": {"$gte": payload.qty}},
        {"$inc": {"qty_reserved_for_internal": -payload.qty},
         "$set": {"updated_at": _now_iso()}},
        return_document=True,
        projection={"_id": 0},
    )
    if not updated:
        raise HTTPException(status_code=409, detail="Concurrent update; please retry")
    await _log_movement(
        item=updated, movement_type="release_reserve",
        qty_delta=-payload.qty,
        qty_after=int(updated.get("qty_total") or 0),
        reference_type="adjustment", reference_id=item_id,
        created_by=user.get("user_id") or "salon_user",
    )
    return _enrich(updated)


@salon_inventory_router.post("/api/salon/inventory/{item_id}/consume")
async def consume(item_id: str, payload: ConsumePayload, user: dict = Depends(_salon_auth)):
    salon_id = user.get("salon_id") or user.get("sub")
    item = await _get_item_or_404(item_id, salon_id)
    _check_availability_for_internal(item)

    qty_total = int(item.get("qty_total") or 0)
    cur_res_cust = int(item.get("qty_reserved_for_customer_orders") or 0)
    if qty_total - cur_res_cust < payload.qty:
        raise HTTPException(status_code=409, detail="Not enough stock to consume (customer reservations are protected)")

    # We allow consumption to also burn down qty_reserved_for_internal if needed.
    cur_res_int = int(item.get("qty_reserved_for_internal") or 0)
    res_int_delta = -min(payload.qty, cur_res_int)

    updated = await _db.salon_inventory.find_one_and_update(
        {"id": item_id, "salon_id": salon_id,
         "qty_total": {"$gte": payload.qty + cur_res_cust}},
        {"$inc": {
            "qty_total": -payload.qty,
            "qty_reserved_for_internal": res_int_delta,
         },
         "$set": {"updated_at": _now_iso()}},
        return_document=True,
        projection={"_id": 0},
    )
    if not updated:
        raise HTTPException(status_code=409, detail="Concurrent update; please retry")
    await _log_movement(
        item=updated, movement_type="internal_consumption",
        qty_delta=-payload.qty,
        qty_after=int(updated.get("qty_total") or 0),
        reference_type="adjustment", reference_id=item_id,
        staff_id=payload.staff_id, note=payload.note,
        created_by=user.get("user_id") or "salon_user",
    )
    await _maybe_low_stock_alert(updated)
    return _enrich(updated)


@salon_inventory_router.post("/api/salon/inventory/{item_id}/sell")
async def sell_pos(item_id: str, payload: SellPayload, user: dict = Depends(_salon_auth)):
    salon_id = user.get("salon_id") or user.get("sub")
    item = await _get_item_or_404(item_id, salon_id)
    _check_availability_for_sale(item)

    qty_total = int(item.get("qty_total") or 0)
    res_int = int(item.get("qty_reserved_for_internal") or 0)
    res_cust = int(item.get("qty_reserved_for_customer_orders") or 0)
    customer_available = max(0, qty_total - res_int - res_cust)
    if customer_available < payload.qty:
        raise HTTPException(status_code=409, detail=f"Only {customer_available} units available for sale")

    branch_id = await _resolve_branch_id(salon_id, payload.branch_id or item.get("branch_id")) if _resolve_branch_id else item.get("branch_id")

    # Atomic stock decrement.
    updated = await _db.salon_inventory.find_one_and_update(
        {"id": item_id, "salon_id": salon_id,
         "qty_total": {"$gte": payload.qty + res_int + res_cust}},
        {"$inc": {"qty_total": -payload.qty},
         "$set": {"updated_at": _now_iso()}},
        return_document=True,
        projection={"_id": 0},
    )
    if not updated:
        raise HTTPException(status_code=409, detail="Concurrent update; please retry")

    # Compute sale amount with discount + GST.
    selling = float(item.get("selling_price") or 0)
    discount_pct = float(item.get("discount") or 0)
    gst_pct = float(item.get("gst_percent") or 0)
    line_sub = selling * payload.qty * (1 - discount_pct / 100.0)
    line_gst = line_sub * gst_pct / 100.0
    total_amount = round(line_sub + line_gst, 2)

    txn_id = str(uuid.uuid4())
    # Normalize customer phone (add +91 for 10-digit Indian numbers)
    cust_phone = (payload.customer_phone or "").strip()
    if cust_phone and not cust_phone.startswith("+"):
        digits = "".join(c for c in cust_phone if c.isdigit())
        if len(digits) == 10:
            cust_phone = f"+91{digits}"
        elif digits:
            cust_phone = digits
    txn = {
        "id": txn_id,
        "salon_id": salon_id,
        "branch_id": branch_id,
        "type": "inflow",                # follows existing financial_transactions convention
        "category": "product_sale",
        "amount": total_amount,
        "payment_mode": payload.payment_mode,
        "narration": (
            f"POS sale · {item.get('name')} × {payload.qty}"
            + (f" · {payload.customer_name}" if payload.customer_name else "")
        ),
        "reference_id": txn_id,           # self-ref since POS sale = the txn itself
        "reference_type": "pos_sale",
        "staff_id": payload.staff_id,
        "exclude_from_incentive": True,    # B7-D: direct product sales don't count toward incentives
        "created_by": user.get("user_id") or "salon_user",
        "date": _today_str(),
        "created_at": _now_iso(),
        "inventory_item_id": item_id,
        "qty": payload.qty,
        "note": payload.note,
        "customer_name": payload.customer_name or None,
        "customer_phone": cust_phone or None,
    }
    await _db.financial_transactions.insert_one(txn.copy())

    await _log_movement(
        item=updated, movement_type="sale_to_customer",
        qty_delta=-payload.qty,
        qty_after=int(updated.get("qty_total") or 0),
        reference_type="pos_sale", reference_id=txn_id,
        staff_id=payload.staff_id,
        note=(
            (payload.note or "")
            + (f" · Sold to: {payload.customer_name}" if payload.customer_name else "")
            + (f" ({cust_phone})" if cust_phone else "")
        ).strip(" ·") or None,
        created_by=user.get("user_id") or "salon_user",
    )
    await _maybe_low_stock_alert(updated)
    return {
        "ok": True,
        "transaction_id": txn_id,
        "amount": total_amount,
        "item": _enrich(updated),
        "message": f"POS sale of ₹{total_amount:.2f} recorded",
    }


# ===================== Phase 17 — manual restock =====================


@salon_inventory_router.post("/api/salon/inventory/{item_id}/restock")
async def manual_restock(item_id: str, payload: RestockPayload, user: dict = Depends(_salon_auth)):
    """Manual stock-in entry by salon admin.

    Increases qty_total, logs a `purchase_in` movement, optionally creates an
    inventory_purchase financial outflow, and fires any pending customer
    notify-me requests for that item (Phase 16).
    """
    salon_id = user.get("salon_id") or user.get("sub")
    item = await _get_item_or_404(item_id, salon_id)
    was_zero = int(item.get("qty_total") or 0) == 0

    updated = await _db.salon_inventory.find_one_and_update(
        {"id": item_id, "salon_id": salon_id},
        {"$inc": {"qty_total": payload.qty},
         "$set": {"updated_at": _now_iso(),
                  **({"cost_price": float(payload.cost_price)} if payload.cost_price is not None else {}),
                  **({"supplier": payload.supplier} if payload.supplier else {}),
                  **({"expiry": payload.expiry} if payload.expiry else {})}},
        return_document=True,
        projection={"_id": 0},
    )
    if not updated:
        raise HTTPException(status_code=409, detail="Concurrent update; please retry")

    await _log_movement(
        item=updated, movement_type="purchase_in",
        qty_delta=payload.qty,
        qty_after=int(updated.get("qty_total") or 0),
        reference_type="manual_purchase", reference_id=item_id,
        note=payload.note,
        created_by=user.get("user_id") or "salon_user",
    )

    # Optional finance posting
    fin_id = None
    if payload.record_finance:
        unit_cost = float(payload.cost_price if payload.cost_price is not None else (updated.get("cost_price") or 0))
        amount = round(unit_cost * payload.qty, 2)
        if amount > 0:
            fin_id = str(uuid.uuid4())
            await _db.financial_transactions.insert_one({
                "id": fin_id,
                "salon_id": salon_id,
                "branch_id": updated.get("branch_id"),
                "type": "outflow",
                "category": "inventory_purchase",
                "amount": amount,
                "payment_mode": payload.payment_mode or "cash",
                "narration": f"Manual restock · {updated.get('name')} × {payload.qty}",
                "reference_id": item_id,
                "reference_type": "manual_restock",
                "created_by": user.get("user_id") or "salon_user",
                "date": _today_str(),
                "created_at": _now_iso(),
            })

    # Clear low-stock flag if back above threshold.
    await _maybe_clear_low_stock_flag(updated)

    # Fire customer notify-me for restock if was zero before.
    fired = 0
    try:
        if was_zero and _fire_customer_restock_for_product is not None:
            fired = await _fire_customer_restock_for_product(salon_id, item_id)
    except Exception as e:
        logger.error(f"[salon_inventory] customer restock notify failed: {e}")

    return {
        "ok": True,
        "added_qty": payload.qty,
        "financial_transaction_id": fin_id,
        "customer_notifications_sent": fired,
        "item": _enrich(updated),
    }


# ===================== Phase 13 hook =====================

async def auto_post_on_delivery(order: dict, *, db) -> dict:
    """Phase 13 — called when a supplier marks a salon_order delivered.

    Side-effects (idempotent on `reference_id == order.id`):
      1. For each line item: upsert a `salon_inventory` doc (linked via
         `product_id_source`) and bump qty_total. Log a `purchase_in` movement.
      2. Create one `financial_transactions` doc of type 'outflow' with
         category 'inventory_purchase' for the entire order.

    Returns a small summary the caller (server / salon_store) can stash on
    the order doc.
    """
    order_id = order["id"]
    salon_id = order["salon_id"]
    branch_id = order.get("branch_id") or (
        await _resolve_branch_id(salon_id, None) if _resolve_branch_id else None
    )

    summary = {"inventory_items_touched": 0, "finance_posted": False, "skipped_reason": None}

    # Idempotency: skip entire posting if any finance entry exists with this order ref.
    already = await db.financial_transactions.find_one(
        {"reference_type": "salon_order", "reference_id": order_id},
        {"_id": 0, "id": 1},
    )
    if already:
        summary["skipped_reason"] = "already_posted"
        return summary

    # 1) Per-line inventory upsert + movement.
    for line in order.get("items", []):
        product_id_source = line.get("product_id")
        qty = int(line.get("qty") or 0)
        if qty <= 0:
            continue

        existing = await db.salon_inventory.find_one(
            {"salon_id": salon_id, "branch_id": branch_id,
             "product_id_source": product_id_source, "is_deleted": {"$ne": True}},
            {"_id": 0},
        )
        if existing:
            updated = await db.salon_inventory.find_one_and_update(
                {"id": existing["id"]},
                {"$inc": {"qty_total": qty},
                 "$set": {"updated_at": _now_iso(),
                          "source_order_id": order_id}},
                return_document=True,
                projection={"_id": 0},
            )
        else:
            new_id = str(uuid.uuid4())
            updated = {
                "id": new_id,
                "salon_id": salon_id,
                "branch_id": branch_id,
                "product_id_source": product_id_source,
                "source_order_id": order_id,
                "name": line.get("name") or "Unnamed product",
                "brand": line.get("brand"),
                "category": None,
                "unit": line.get("unit") or "piece",
                "pack_size": line.get("pack_size"),
                "cost_price": float(line.get("selling_price") or 0),
                "selling_price": float(line.get("mrp") or line.get("selling_price") or 0),
                "gst_percent": float(line.get("gst_percent") or 0),
                "mrp": float(line.get("mrp") or 0),
                "discount": 0.0,
                "qty_total": qty,
                "qty_reserved_for_internal": 0,
                "qty_reserved_for_customer_orders": 0,
                "availability": "both",
                "assigned_to_staff_id": None,
                "low_stock_threshold": max(1, qty // 5),
                "sku_code": None,
                "image_url": line.get("image_url"),
                "is_deleted": False,
                "created_at": _now_iso(),
                "updated_at": _now_iso(),
            }
            await db.salon_inventory.insert_one(updated.copy())
            updated.pop("_id", None)

        # Movement log — direct insert so we don't depend on init at module import.
        try:
            await db.salon_inventory_movements.insert_one({
                "id": str(uuid.uuid4()),
                "inventory_item_id": updated["id"],
                "salon_id": salon_id,
                "branch_id": branch_id,
                "movement_type": "purchase_in",
                "qty_delta": qty,
                "qty_after": int(updated.get("qty_total") or 0),
                "reference_type": "salon_order",
                "reference_id": order_id,
                "staff_id": None,
                "note": f"Auto-posted from supplier delivery of order {order_id[:8]}",
                "item_name": updated.get("name"),
                "created_by": "system",
                "created_at": _now_iso(),
            })
        except Exception as e:
            logger.error(f"[auto_post_on_delivery] movement insert failed: {e}")

        # Phase 16 — fire customer restock notify-me requests + clear low-stock flag.
        try:
            await _maybe_clear_low_stock_flag(updated)
            if _fire_customer_restock_for_product is not None:
                await _fire_customer_restock_for_product(salon_id, updated["id"])
        except Exception as e:
            logger.error(f"[auto_post_on_delivery] post-restock notify failed: {e}")

        summary["inventory_items_touched"] += 1

    # 2) Finance posting.
    try:
        await db.financial_transactions.insert_one({
            "id": str(uuid.uuid4()),
            "salon_id": salon_id,
            "branch_id": branch_id,
            "type": "outflow",
            "category": "inventory_purchase",
            "amount": float(order.get("total_amount") or 0),
            "payment_mode": order.get("payment_mode") or "cashfree",
            "narration": f"Inventory purchase · {order.get('supplier_name') or 'Supplier'} · order {order_id[:8]}",
            "reference_id": order_id,
            "reference_type": "salon_order",
            "created_by": "system",
            "date": _today_str(),
            "created_at": _now_iso(),
            "supplier_id": order.get("supplier_id"),
        })
        summary["finance_posted"] = True
    except Exception as e:
        logger.error(f"[auto_post_on_delivery] finance insert failed: {e}")

    return summary
