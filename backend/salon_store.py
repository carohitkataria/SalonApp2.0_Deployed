"""
Phase 10 + 11 + 12 — Salon Store (browse + cart + checkout + order lifecycle)

This module replaces the inquiry-only marketplace flow with a full
browse → cart (client-side) → checkout (Cashfree / COD) → supplier fulfilment
loop.

Endpoints
---------
Salon-side  (Depends salon user):
    GET    /api/salon/store/products
    GET    /api/salon/store/products/{product_id}
    GET    /api/salon/store/categories
    GET    /api/salon/store/brands
    POST   /api/salon/store/notify-me                  body {product_id}
    POST   /api/salon/store/checkout                   body {items, shipping_address, payment_mode, branch_id}
    GET    /api/salon/store/orders
    GET    /api/salon/store/orders/{order_id}
    POST   /api/salon/store/orders/{order_id}/cancel

Public webhook:
    POST   /api/salon/store/cashfree/webhook

Supplier-side  (Depends supplier auth):
    GET    /api/supplier/orders
    GET    /api/supplier/orders/{order_id}
    POST   /api/supplier/orders/{order_id}/confirm
    POST   /api/supplier/orders/{order_id}/ship       body {tracking_number?, carrier?, note?}
    POST   /api/supplier/orders/{order_id}/deliver    body {note?}

Reservation semantics (Phase 11)
--------------------------------
On checkout we atomically decrement `inventory_available` and increment
`inventory_reserved` on every supplier_products line. If any line cannot
reserve the requested qty we ROLLBACK the prior lines and abort with 409.

- payment_mode = "cashfree"  → reservation_expires_at = now + 15min,
                                order_status = "pending_payment".
- payment_mode = "cod"       → order_status = "confirmed" immediately, no
                                expiry timer.

A background sweeper (started by server.py) releases reservations on
expiry by reversing the $inc and marking the order "cancelled".

When the supplier marks an order delivered (Phase 12), reservations are
"consumed" — we decrement `inventory_reserved` by the line qty so it
permanently leaves the supplier's stock. (Phase 13 will then add the
matching auto-post into the salon's inventory; for now we only close out
the supplier side.)
"""

from __future__ import annotations

import asyncio
import logging
import os
import uuid
from datetime import datetime, timezone, timedelta
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, Field, field_validator

import cashfree_service

logger = logging.getLogger(__name__)

# Injected by init_salon_store_router
_db = None
_get_current_salon_user = None
_create_in_app_notification = None  # async fn from server.py
_require_supplier = None            # async dep from supplier_auth
_auto_post_on_delivery = None       # Phase 13 hook (set by server.py wiring)


def set_auto_post_hook(fn) -> None:
    """Allow server.py to inject the Phase 13 auto-post callback after both
    modules are imported. The callback is `async fn(order_doc) -> summary`.
    """
    global _auto_post_on_delivery
    _auto_post_on_delivery = fn

salon_store_router = APIRouter(tags=["salon-store"])
_bearer = HTTPBearer(auto_error=False)

# How long a Cashfree reservation stays alive before the sweeper releases it.
RESERVATION_TTL_MINUTES = int(os.environ.get("SALON_STORE_RESERVATION_TTL_MIN", "15"))
# Shipping default — MVP charges flat 0; left as constant for future tuning.
DEFAULT_SHIPPING_FEE = 0.0


# --------------------------- Helpers ---------------------------

def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _now_dt() -> datetime:
    return datetime.now(timezone.utc)


def init_salon_store_router(
    *,
    db,
    get_current_salon_user,
    create_in_app_notification,
    require_supplier,
):
    """Wire module-level deps before the app starts serving."""
    global _db, _get_current_salon_user, _create_in_app_notification, _require_supplier
    _db = db
    _get_current_salon_user = get_current_salon_user
    _create_in_app_notification = create_in_app_notification
    _require_supplier = require_supplier


async def _salon_auth(credentials: HTTPAuthorizationCredentials = Depends(_bearer)):
    if _get_current_salon_user is None:
        raise HTTPException(status_code=500, detail="salon_store_not_initialised")
    if credentials is None:
        raise HTTPException(status_code=401, detail="Authentication required")
    return await _get_current_salon_user(credentials)


async def _supplier_auth(credentials: HTTPAuthorizationCredentials = Depends(_bearer)):
    if _require_supplier is None:
        raise HTTPException(status_code=500, detail="salon_store_not_initialised")
    if credentials is None:
        raise HTTPException(status_code=401, detail="Authentication required")
    return await _require_supplier(credentials)


async def _active_supplier_ids() -> list:
    cursor = _db.suppliers.find({"status": "active"}, {"_id": 0, "id": 1})
    return [doc["id"] async for doc in cursor]


async def _attach_supplier_info(product: dict) -> dict:
    if not product:
        return product
    sup_id = product.get("supplier_id")
    if sup_id:
        sup = await _db.suppliers.find_one(
            {"id": sup_id, "status": "active"},
            {"_id": 0, "id": 1, "business_name": 1, "rating_avg": 1, "rating_count": 1,
             "city": 1, "state": 1},
        )
        if sup:
            product["supplier"] = {
                "id": sup["id"],
                "business_name": sup.get("business_name"),
                "rating_avg": float(sup.get("rating_avg") or 0),
                "rating_count": int(sup.get("rating_count") or 0),
                "city": sup.get("city"),
                "state": sup.get("state"),
            }
    # Hide internal reservation counters from buyers.
    product.pop("inventory_reserved", None)
    return product


# --------------------------- Models ----------------------------

class CartItemIn(BaseModel):
    product_id: str
    qty: int = Field(..., ge=1, le=10000)


class ShippingAddress(BaseModel):
    name: str = Field(..., min_length=2, max_length=120)
    phone: str = Field(..., min_length=8, max_length=20)
    line1: str = Field(..., min_length=2, max_length=200)
    line2: Optional[str] = Field(default=None, max_length=200)
    city: str = Field(..., min_length=2, max_length=80)
    state: str = Field(..., min_length=2, max_length=80)
    pincode: str = Field(..., min_length=4, max_length=10)
    latitude: Optional[float] = None   # WS2 — map location snapshot
    longitude: Optional[float] = None  # WS2 — map location snapshot


class CheckoutPayload(BaseModel):
    items: List[CartItemIn] = Field(..., min_length=1, max_length=50)
    shipping_address: ShippingAddress
    payment_mode: str = Field(..., description="cashfree | cod")
    branch_id: Optional[str] = None
    notes: Optional[str] = Field(default=None, max_length=500)

    @field_validator("payment_mode")
    @classmethod
    def _check_payment_mode(cls, v: str) -> str:
        if v not in {"cashfree", "cod"}:
            raise ValueError("payment_mode must be 'cashfree' or 'cod'")
        return v


class NotifyMePayload(BaseModel):
    product_id: str


class ShipPayload(BaseModel):
    tracking_number: Optional[str] = Field(default=None, max_length=120)
    carrier: Optional[str] = Field(default=None, max_length=80)
    note: Optional[str] = Field(default=None, max_length=500)


class DeliverPayload(BaseModel):
    note: Optional[str] = Field(default=None, max_length=500)
    payment_mode: Optional[str] = Field(default=None, description="Optional payment mode captured at delivery")

    @field_validator("payment_mode")
    @classmethod
    def _v_pm_deliver(cls, v):
        if v is None or v == "":
            return None
        if v not in VALID_PAYMENT_MODES_AFTER_DELIVERY:
            raise ValueError(f"payment_mode must be one of {sorted(VALID_PAYMENT_MODES_AFTER_DELIVERY)}")
        return v


class CancelPayload(BaseModel):
    reason: Optional[str] = Field(default=None, max_length=500)


VALID_PAYMENT_MODES_AFTER_DELIVERY = {"cod", "upi", "cashfree", "cash", "card", "bank_transfer", "other"}


class PaymentModeChangePayload(BaseModel):
    payment_mode: str = Field(..., description="cod | upi | cashfree | cash | card | bank_transfer | other")
    note: Optional[str] = Field(default=None, max_length=500)

    @field_validator("payment_mode")
    @classmethod
    def _v_pm(cls, v: str) -> str:
        if v not in VALID_PAYMENT_MODES_AFTER_DELIVERY:
            raise ValueError(f"payment_mode must be one of {sorted(VALID_PAYMENT_MODES_AFTER_DELIVERY)}")
        return v


# --------------------------- Browse ----------------------------

@salon_store_router.get("/api/salon/store/products")
async def list_products(
    q: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    brand: Optional[str] = Query(None),
    supplier_id: Optional[str] = Query(None),
    sort: str = Query("popular"),
    page: int = Query(1, ge=1),
    page_size: int = Query(24, ge=1, le=100),
    in_stock_only: bool = Query(False),
    user: dict = Depends(_salon_auth),
):
    supplier_ids = await _active_supplier_ids()
    if not supplier_ids:
        return {"products": [], "total": 0, "page": page, "page_size": page_size, "total_pages": 1}

    query: dict = {
        "supplier_id": {"$in": supplier_ids} if not supplier_id else supplier_id,
        "is_active": True,
        "is_deleted": {"$ne": True},
    }
    if supplier_id and supplier_id not in supplier_ids:
        return {"products": [], "total": 0, "page": page, "page_size": page_size, "total_pages": 1}
    if in_stock_only:
        query["inventory_available"] = {"$gt": 0}
    if category:
        query["category"] = category
    if brand:
        query["brand"] = brand
    if q:
        query["$or"] = [
            {"name": {"$regex": q, "$options": "i"}},
            {"brand": {"$regex": q, "$options": "i"}},
            {"description": {"$regex": q, "$options": "i"}},
        ]

    sort_clauses = {
        "price_asc":  [("selling_price", 1)],
        "price_desc": [("selling_price", -1)],
        "newest":     [("created_at", -1)],
        "popular":    [("updated_at", -1)],
    }
    sort_clause = sort_clauses.get(sort, sort_clauses["popular"])

    total = await _db.supplier_products.count_documents(query)
    skip = (page - 1) * page_size
    cursor = (
        _db.supplier_products
        .find(query, {"_id": 0})
        .sort(sort_clause)
        .skip(skip)
        .limit(page_size)
    )
    products: list = []
    async for doc in cursor:
        products.append(await _attach_supplier_info(doc))

    return {
        "products": products,
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": max(1, (total + page_size - 1) // page_size),
    }


@salon_store_router.get("/api/salon/store/products/{product_id}")
async def get_product(product_id: str, user: dict = Depends(_salon_auth)):
    doc = await _db.supplier_products.find_one(
        {"id": product_id, "is_active": True, "is_deleted": {"$ne": True}},
        {"_id": 0},
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Product not available")
    supplier_ids = await _active_supplier_ids()
    if doc.get("supplier_id") not in supplier_ids:
        raise HTTPException(status_code=404, detail="Product not available")
    return await _attach_supplier_info(doc)


@salon_store_router.get("/api/salon/store/categories")
async def list_categories(user: dict = Depends(_salon_auth)):
    supplier_ids = await _active_supplier_ids()
    if not supplier_ids:
        return {"categories": []}
    pipeline = [
        {"$match": {
            "supplier_id": {"$in": supplier_ids},
            "is_active": True,
            "is_deleted": {"$ne": True},
        }},
        {"$group": {"_id": "$category", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
    ]
    docs = await _db.supplier_products.aggregate(pipeline).to_list(length=200)
    return {"categories": [{"name": d["_id"], "count": d["count"]} for d in docs if d["_id"]]}


@salon_store_router.get("/api/salon/store/brands")
async def list_brands(user: dict = Depends(_salon_auth)):
    supplier_ids = await _active_supplier_ids()
    if not supplier_ids:
        return {"brands": []}
    pipeline = [
        {"$match": {
            "supplier_id": {"$in": supplier_ids},
            "is_active": True,
            "is_deleted": {"$ne": True},
            "brand": {"$nin": [None, ""]},
        }},
        {"$group": {"_id": "$brand", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
    ]
    docs = await _db.supplier_products.aggregate(pipeline).to_list(length=400)
    return {"brands": [{"name": d["_id"], "count": d["count"]} for d in docs if d["_id"]]}


@salon_store_router.post("/api/salon/store/notify-me")
async def notify_me(payload: NotifyMePayload, user: dict = Depends(_salon_auth)):
    product = await _db.supplier_products.find_one(
        {"id": payload.product_id, "is_active": True, "is_deleted": {"$ne": True}},
        {"_id": 0, "id": 1, "name": 1, "supplier_id": 1},
    )
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    salon_id = user.get("salon_id") or user.get("sub")
    existing = await _db.stock_notify_requests.find_one(
        {"product_id": payload.product_id, "salon_id": salon_id, "status": "pending"}
    )
    if existing:
        return {"ok": True, "already_subscribed": True}
    doc = {
        "id": str(uuid.uuid4()),
        "product_id": payload.product_id,
        "product_name": product.get("name"),
        "supplier_id": product.get("supplier_id"),
        "salon_id": salon_id,
        "salon_user_id": user.get("user_id") or user.get("id"),
        "status": "pending",
        "created_at": _now_iso(),
    }
    await _db.stock_notify_requests.insert_one(doc.copy())
    return {"ok": True, "already_subscribed": False}


# --------------------------- Checkout --------------------------

async def _reserve_stock(items: List[CartItemIn]) -> List[dict]:
    """Atomically reserve stock for every line. Rolls back on failure.

    Returns the list of resolved product docs (in input order) on success.
    On any failure raises HTTPException(409).
    """
    resolved: list = []     # parallel to `items`
    reserved_ids: list = [] # tracks product_id, qty for compensating rollback

    try:
        for it in items:
            # MOQ guard (issue 3) — check before reserving so we don't have to roll back.
            product_meta = await _db.supplier_products.find_one(
                {"id": it.product_id},
                {"_id": 0, "name": 1, "min_order_qty": 1},
            )
            if product_meta:
                moq = int(product_meta.get("min_order_qty") or 1)
                if it.qty < moq:
                    raise HTTPException(
                        status_code=409,
                        detail={
                            "code": "below_moq",
                            "message": f"Minimum order quantity for '{product_meta.get('name') or it.product_id}' is {moq}",
                            "product_id": it.product_id,
                            "min_order_qty": moq,
                        },
                    )
            updated = await _db.supplier_products.find_one_and_update(
                {
                    "id": it.product_id,
                    "is_active": True,
                    "is_deleted": {"$ne": True},
                    "inventory_available": {"$gte": it.qty},
                },
                {
                    "$inc": {
                        "inventory_available": -it.qty,
                        "inventory_reserved": +it.qty,
                    },
                    "$set": {"updated_at": _now_iso()},
                },
                return_document=True,  # pymotor: returns updated
                projection={"_id": 0},
            )
            if not updated:
                # Either the product vanished/was deactivated, or insufficient stock.
                current = await _db.supplier_products.find_one(
                    {"id": it.product_id}, {"_id": 0, "name": 1, "inventory_available": 1, "is_active": 1}
                )
                raise HTTPException(
                    status_code=409,
                    detail={
                        "code": "INSUFFICIENT_STOCK",
                        "message": f"Not enough stock for '{(current or {}).get('name') or it.product_id}'",
                        "product_id": it.product_id,
                        "requested_qty": it.qty,
                        "available_qty": int((current or {}).get("inventory_available") or 0),
                    },
                )
            # Verify supplier is still active.
            sup = await _db.suppliers.find_one(
                {"id": updated.get("supplier_id"), "status": "active"},
                {"_id": 0, "id": 1, "business_name": 1},
            )
            if not sup:
                raise HTTPException(
                    status_code=409,
                    detail={"code": "SUPPLIER_INACTIVE",
                            "message": "Supplier is no longer accepting orders",
                            "product_id": it.product_id},
                )
            reserved_ids.append((it.product_id, it.qty))
            updated["__supplier_business_name"] = sup.get("business_name")
            resolved.append(updated)
        return resolved
    except Exception:
        # Compensate any successful reservations made before the failure.
        for pid, qty in reserved_ids:
            try:
                await _db.supplier_products.update_one(
                    {"id": pid},
                    {"$inc": {"inventory_available": +qty, "inventory_reserved": -qty},
                     "$set": {"updated_at": _now_iso()}},
                )
            except Exception as e:
                logger.error(f"[salon_store] rollback failed for {pid}: {e}")
        raise


def _line_totals(product: dict, qty: int, gst_mode: str = "exclusive") -> dict:
    """Compute line subtotal / gst / total from a product doc + qty.

    gst_mode is the SUPPLIER's `gst_pricing_mode` (inclusive|exclusive).
    - exclusive: selling_price is base; gst added on top (legacy).
    - inclusive: selling_price already includes gst; derive base + gst back-out.
    """
    selling = float(product.get("selling_price") or 0)
    gst_pct = float(product.get("gst_percent") or 0)
    if (gst_mode or "exclusive").lower() == "inclusive":
        line_total = round(selling * qty, 2)
        if gst_pct > 0:
            gst = round(line_total - (line_total / (1 + gst_pct / 100.0)), 2)
        else:
            gst = 0.0
        subtotal = round(line_total - gst, 2)
    else:
        subtotal = round(selling * qty, 2)
        gst = round(subtotal * gst_pct / 100.0, 2)
        line_total = round(subtotal + gst, 2)
    return {
        "selling_price": selling,
        "mrp": float(product.get("mrp") or selling),
        "gst_percent": gst_pct,
        "line_subtotal": subtotal,
        "line_gst": gst,
        "line_total": line_total,
    }


async def _release_reservations(order: dict) -> None:
    """Reverse the $inc made at checkout. Idempotent: if already released, no-op."""
    if order.get("_reservations_released"):
        return
    for line in order.get("items", []):
        try:
            await _db.supplier_products.update_one(
                {"id": line["product_id"]},
                {"$inc": {"inventory_available": +line["qty"], "inventory_reserved": -line["qty"]},
                 "$set": {"updated_at": _now_iso()}},
            )
        except Exception as e:
            logger.error(f"[salon_store] release_reservations failed {order['id']} {line['product_id']}: {e}")
    await _db.salon_orders.update_one(
        {"id": order["id"]},
        {"$set": {"_reservations_released": True, "updated_at": _now_iso()}},
    )


async def _consume_reservations(order: dict) -> None:
    """Reservations -> shipped/delivered. Decrement reserved counters.

    inventory_available is unchanged (already debited at checkout); we just
    drop the reserved counter so the supplier's books balance.
    """
    if order.get("_reservations_consumed"):
        return
    for line in order.get("items", []):
        try:
            await _db.supplier_products.update_one(
                {"id": line["product_id"]},
                {"$inc": {"inventory_reserved": -line["qty"]},
                 "$set": {"updated_at": _now_iso()}},
            )
        except Exception as e:
            logger.error(f"[salon_store] consume_reservations failed {order['id']} {line['product_id']}: {e}")
    await _db.salon_orders.update_one(
        {"id": order["id"]},
        {"$set": {"_reservations_consumed": True, "updated_at": _now_iso()}},
    )


@salon_store_router.post("/api/salon/store/checkout")
async def checkout(payload: CheckoutPayload, user: dict = Depends(_salon_auth)):
    salon_id = user.get("salon_id") or user.get("sub")
    if not salon_id:
        raise HTTPException(status_code=400, detail="Salon context missing on token")

    # Permission check — only admin or manager (or any user with manage_inventory).
    role = user.get("role")
    perms = user.get("permissions") or {}
    if role not in ("salon_admin", "salon_branch_manager", "salon") and not perms.get("manage_inventory"):
        raise HTTPException(status_code=403, detail="You do not have permission to place orders")

    # WS2 — a salon cannot place a shop order until its profile carries a State
    # and 6-digit PIN (needed for delivery + place-of-supply). Check BEFORE we
    # reserve any stock so nothing needs rolling back.
    salon = await _db.salons.find_one(
        {"id": salon_id},
        {"_id": 0, "id": 1, "salon_name": 1, "phone": 1, "state": 1, "pincode": 1},
    )
    if not (salon or {}).get("state") or not (salon or {}).get("pincode"):
        raise HTTPException(
            status_code=400,
            detail={
                "code": "salon_profile_incomplete",
                "message": "Add your salon's State and PIN code in the profile before placing a shop order.",
            },
        )

    # Reserve stock atomically (this throws 409 on failure with rollback).
    resolved = await _reserve_stock(payload.items)

    # Group lines by supplier_id. One salon_order per supplier.
    groups: dict = {}
    for prod, qin in zip(resolved, payload.items):
        sup_id = prod.get("supplier_id")
        groups.setdefault(sup_id, []).append((prod, qin.qty))

    checkout_id = str(uuid.uuid4())
    created_orders: list = []
    grand_total = 0.0
    cashfree_session_id: Optional[str] = None
    cashfree_order_id: Optional[str] = None

    for sup_id, lines in groups.items():
        order_id = str(uuid.uuid4())
        items_out: list = []
        subtotal = 0.0
        gst_amount = 0.0
        supplier_business_name = None

        # Fetch supplier settings (issue 4: shipping + GST mode).
        sup_doc = await _db.suppliers.find_one(
            {"id": sup_id},
            {"_id": 0, "business_name": 1, "shipping_charge": 1,
             "free_shipping_min_order_value": 1, "gst_pricing_mode": 1},
        ) or {}
        gst_mode = (sup_doc.get("gst_pricing_mode") or "exclusive").lower()
        shipping_charge = float(sup_doc.get("shipping_charge") or 0)
        free_ship_min = float(sup_doc.get("free_shipping_min_order_value") or 0)

        for prod, qty in lines:
            t = _line_totals(prod, qty, gst_mode)
            supplier_business_name = supplier_business_name or prod.get("__supplier_business_name") or sup_doc.get("business_name")
            items_out.append({
                "product_id": prod["id"],
                "name": prod.get("name"),
                "brand": prod.get("brand"),
                "sku_code": prod.get("sku_code"),
                "image_url": (prod.get("images") or [None])[0],
                "unit": prod.get("unit"),
                "pack_size": prod.get("pack_size"),
                "qty": qty,
                "mrp": t["mrp"],
                "selling_price": t["selling_price"],
                "gst_percent": t["gst_percent"],
                "line_subtotal": t["line_subtotal"],
                "line_gst": t["line_gst"],
                "line_total": t["line_total"],
            })
            subtotal += t["line_subtotal"]
            gst_amount += t["line_gst"]

        # Shipping: waived if subtotal meets supplier's free-shipping threshold.
        if free_ship_min > 0 and subtotal >= free_ship_min:
            shipping_fee = 0.0
        else:
            shipping_fee = shipping_charge

        total_amount = round(subtotal + gst_amount + shipping_fee, 2)
        grand_total += total_amount

        if payload.payment_mode == "cashfree":
            order_status = "pending_payment"
            payment_status = "pending"
            reservation_expires_at = (_now_dt() + timedelta(minutes=RESERVATION_TTL_MINUTES)).isoformat()
        else:  # cod
            order_status = "confirmed"
            payment_status = "cod_pending"
            reservation_expires_at = None

        doc = {
            "id": order_id,
            "checkout_id": checkout_id,
            "salon_id": salon_id,
            "salon_name": (salon or {}).get("salon_name"),
            "branch_id": payload.branch_id,
            "placed_by_user_id": user.get("user_id") or user.get("id"),
            "placed_by_role": user.get("role"),
            "supplier_id": sup_id,
            "supplier_name": supplier_business_name,
            "items": items_out,
            "subtotal": round(subtotal, 2),
            "gst_amount": round(gst_amount, 2),
            "shipping_fee": shipping_fee,
            "total_amount": total_amount,
            "shipping_address": payload.shipping_address.model_dump(),
            "payment_mode": payload.payment_mode,
            "payment_status": payment_status,
            "cashfree_order_id": None,
            "cashfree_payment_id": None,
            "cashfree_session_id": None,
            "order_status": order_status,
            "reservation_expires_at": reservation_expires_at,
            "status_history": [{
                "status": order_status,
                "timestamp": _now_iso(),
                "note": "Order placed (COD)" if payload.payment_mode == "cod" else "Awaiting payment",
                "updated_by": user.get("user_id") or user.get("id"),
            }],
            "confirmed_at": _now_iso() if payload.payment_mode == "cod" else None,
            "shipped_at": None,
            "delivered_at": None,
            "cancelled_at": None,
            "cancellation_reason": None,
            "notes": payload.notes,
            "_reservations_released": False,
            "_reservations_consumed": False,
            "created_at": _now_iso(),
            "updated_at": _now_iso(),
        }
        await _db.salon_orders.insert_one(doc.copy())
        doc.pop("_id", None)
        created_orders.append(doc)

    # If Cashfree path, create one Cashfree order covering all salon_orders.
    if payload.payment_mode == "cashfree":
        if not cashfree_service.is_configured():
            # Roll everything back so the stock doesn't sit reserved.
            for o in created_orders:
                await _release_reservations(o)
                await _db.salon_orders.update_one(
                    {"id": o["id"]},
                    {"$set": {
                        "order_status": "cancelled",
                        "cancelled_at": _now_iso(),
                        "cancellation_reason": "cashfree_not_configured",
                        "updated_at": _now_iso(),
                    }},
                )
            raise HTTPException(
                status_code=503,
                detail="Online payment is temporarily unavailable. Please choose Cash on Delivery.",
            )
        backend_base = (os.environ.get("BACKEND_PUBLIC_URL")
                        or os.environ.get("PUBLIC_BACKEND_URL")
                        or "").rstrip("/")
        frontend_base = (os.environ.get("FRONTEND_PUBLIC_URL")
                         or os.environ.get("PUBLIC_FRONTEND_URL")
                         or os.environ.get("APP_URL")
                         or "https://salonhub.in").rstrip("/")
        return_url = f"{frontend_base}/salon/orders?checkout_id={checkout_id}"
        notify_url = f"{backend_base}/api/salon/store/cashfree/webhook" if backend_base else None
        cf_order_id = f"store_{checkout_id[:8]}_{int(_now_dt().timestamp())}"
        try:
            cf_response = await cashfree_service.create_order(
                order_id=cf_order_id,
                order_amount=round(grand_total, 2),
                customer_id=salon_id,
                customer_name=(salon or {}).get("salon_name") or "Salon",
                customer_email="noreply@salonhub.in",
                customer_phone=(salon or {}).get("phone") or payload.shipping_address.phone,
                return_url=return_url,
                notify_url=notify_url,
                order_note=f"SalonHub store checkout {checkout_id}",
            )
        except Exception as e:
            logger.error(f"[salon_store] Cashfree create_order failed: {e}")
            for o in created_orders:
                await _release_reservations(o)
                await _db.salon_orders.update_one(
                    {"id": o["id"]},
                    {"$set": {
                        "order_status": "cancelled",
                        "cancelled_at": _now_iso(),
                        "cancellation_reason": "cashfree_create_order_failed",
                        "updated_at": _now_iso(),
                    }},
                )
            raise HTTPException(status_code=502, detail="Could not create payment order. Please try again.")

        cashfree_session_id = cf_response.get("payment_session_id")
        cashfree_order_id = cf_response.get("order_id") or cf_order_id

        await _db.salon_orders.update_many(
            {"checkout_id": checkout_id},
            {"$set": {
                "cashfree_order_id": cashfree_order_id,
                "cashfree_session_id": cashfree_session_id,
                "updated_at": _now_iso(),
            }},
        )

    # Notify each supplier about the new order (best-effort, in-app only for MVP).
    if _create_in_app_notification:
        for o in created_orders:
            try:
                await _create_in_app_notification(
                    user_type="supplier",
                    user_id=o["supplier_id"],
                    title="New order received",
                    message=f"{o['salon_name'] or 'A salon'} placed an order worth ₹{o['total_amount']:.2f}",
                    notification_type="store_order",
                    setting_key="orders",
                    salon_id=o["salon_id"],
                    related_id=o["id"],
                )
            except Exception as e:
                logger.warning(f"[salon_store] supplier notification failed: {e}")

    return {
        "ok": True,
        "checkout_id": checkout_id,
        "payment_mode": payload.payment_mode,
        "orders": created_orders,
        "grand_total": round(grand_total, 2),
        "cashfree_session_id": cashfree_session_id,
        "cashfree_order_id": cashfree_order_id,
        "reservation_ttl_minutes": RESERVATION_TTL_MINUTES if payload.payment_mode == "cashfree" else None,
    }


# --------------------------- Orders list -----------------------

def _strip_order_for_json(o: dict) -> dict:
    o.pop("_id", None)
    return o


@salon_store_router.get("/api/salon/store/orders")
async def list_salon_orders(
    status: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    user: dict = Depends(_salon_auth),
):
    salon_id = user.get("salon_id") or user.get("sub")
    q = {"salon_id": salon_id}
    if status:
        q["order_status"] = status
    total = await _db.salon_orders.count_documents(q)
    cursor = _db.salon_orders.find(q, {"_id": 0}).sort([("created_at", -1)]).skip((page - 1) * page_size).limit(page_size)
    items: list = []
    _phone_cache: dict = {}
    async for d in cursor:
        sup_id = d.get("supplier_id")
        if sup_id:
            if sup_id not in _phone_cache:
                sup = await _db.suppliers.find_one({"id": sup_id}, {"_id": 0, "mobile": 1})
                _phone_cache[sup_id] = (sup or {}).get("mobile")
            d["supplier_phone"] = _phone_cache.get(sup_id)
        items.append(d)
    return {
        "orders": items,
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": max(1, (total + page_size - 1) // page_size),
    }


@salon_store_router.get("/api/salon/store/orders/{order_id}")
async def get_salon_order(order_id: str, user: dict = Depends(_salon_auth)):
    salon_id = user.get("salon_id") or user.get("sub")
    doc = await _db.salon_orders.find_one({"id": order_id, "salon_id": salon_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Order not found")
    sup_id = doc.get("supplier_id")
    if sup_id:
        sup = await _db.suppliers.find_one({"id": sup_id}, {"_id": 0, "mobile": 1})
        doc["supplier_phone"] = (sup or {}).get("mobile")
    return doc


@salon_store_router.post("/api/salon/store/orders/{order_id}/cancel")
async def cancel_salon_order(
    order_id: str,
    payload: CancelPayload,
    user: dict = Depends(_salon_auth),
):
    salon_id = user.get("salon_id") or user.get("sub")
    doc = await _db.salon_orders.find_one({"id": order_id, "salon_id": salon_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Order not found")
    if doc["order_status"] not in ("pending_payment", "confirmed"):
        raise HTTPException(status_code=409, detail="Orders can only be cancelled before they are shipped.")

    await _release_reservations(doc)
    await _db.salon_orders.update_one(
        {"id": order_id},
        {"$set": {
            "order_status": "cancelled",
            "cancelled_at": _now_iso(),
            "cancellation_reason": payload.reason or "Cancelled by salon",
            "updated_at": _now_iso(),
        },
         "$push": {"status_history": {
             "status": "cancelled",
             "timestamp": _now_iso(),
             "note": payload.reason or "Cancelled by salon",
             "updated_by": user.get("user_id") or user.get("id"),
         }}},
    )

    if _create_in_app_notification:
        try:
            await _create_in_app_notification(
                user_type="supplier",
                user_id=doc["supplier_id"],
                title="Order cancelled",
                message=f"Order #{order_id[:8]} has been cancelled by the salon",
                notification_type="store_order_cancelled",
                setting_key="orders",
                salon_id=salon_id,
                related_id=order_id,
            )
        except Exception:
            pass

    fresh = await _db.salon_orders.find_one({"id": order_id}, {"_id": 0})
    return {"ok": True, "order": fresh}


# --------------------------- Concerns / Returns / Replacements ---------------------------

class ConcernPayload(BaseModel):
    type: str = Field(..., description="concern | return | replacement")
    note: str = Field(..., max_length=2000)

    @field_validator("type")
    @classmethod
    def _v_concern_type(cls, v: str) -> str:
        v = (v or "").strip().lower()
        if v not in {"concern", "return", "replacement"}:
            raise ValueError("type must be one of concern|return|replacement")
        return v


@salon_store_router.post("/api/salon/store/orders/{order_id}/concern")
async def raise_salon_order_concern(
    order_id: str,
    payload: ConcernPayload,
    user: dict = Depends(_salon_auth),
):
    """Salon raises a concern / return / replacement on an order.
    Appends to `concerns` array + `status_history` and notifies the supplier.
    """
    salon_id = user.get("salon_id") or user.get("sub")
    doc = await _db.salon_orders.find_one({"id": order_id, "salon_id": salon_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Order not found")

    raised_by = user.get("user_id") or user.get("id") or user.get("sub")
    entry = {
        "id": str(uuid.uuid4()),
        "type": payload.type,
        "note": payload.note.strip(),
        "status": "open",
        "raised_by": raised_by,
        "raised_by_role": user.get("role"),
        "created_at": _now_iso(),
    }
    await _db.salon_orders.update_one(
        {"id": order_id},
        {"$push": {
            "concerns": entry,
            "status_history": {
                "status": doc.get("order_status"),
                "timestamp": _now_iso(),
                "note": f"{payload.type.title()} raised: {payload.note.strip()[:120]}",
                "updated_by": raised_by,
            },
         },
         "$set": {"updated_at": _now_iso()}},
    )

    if _create_in_app_notification:
        try:
            await _create_in_app_notification(
                user_type="supplier",
                user_id=doc["supplier_id"],
                title=f"{payload.type.title()} raised on order #{order_id[:8]}",
                message=payload.note.strip()[:180],
                notification_type="store_order_concern",
                setting_key="orders",
                salon_id=salon_id,
                related_id=order_id,
            )
        except Exception:
            pass

    fresh = await _db.salon_orders.find_one({"id": order_id}, {"_id": 0})
    return {"ok": True, "order": fresh}


@salon_store_router.patch("/api/salon/store/orders/{order_id}/payment-mode")
async def change_salon_order_payment_mode(
    order_id: str,
    payload: PaymentModeChangePayload,
    user: dict = Depends(_salon_auth),
):
    """Salon can change the payment_mode on an order with an audit log.

    Use-case: supplier captured the order as COD but the salon actually paid
    via UPI at delivery — keep the financial ledger clean by updating both
    the order and the auto-posted financial_transactions row.
    """
    salon_id = user.get("salon_id") or user.get("sub")
    doc = await _db.salon_orders.find_one({"id": order_id, "salon_id": salon_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Order not found")

    old_mode = doc.get("payment_mode") or "unknown"
    new_mode = payload.payment_mode
    if old_mode == new_mode:
        return {"ok": True, "order": doc, "message": "Payment mode unchanged"}

    audit_entry = {
        "from": old_mode,
        "to": new_mode,
        "note": payload.note,
        "changed_by": user.get("user_id") or user.get("id"),
        "changed_at": _now_iso(),
    }

    await _db.salon_orders.update_one(
        {"id": order_id},
        {"$set": {"payment_mode": new_mode, "updated_at": _now_iso()},
         "$push": {"payment_mode_history": audit_entry,
                   "status_history": {
                       "status": doc.get("order_status"),
                       "timestamp": _now_iso(),
                       "note": f"Payment mode changed: {old_mode} → {new_mode}"
                               + (f" · {payload.note}" if payload.note else ""),
                       "updated_by": user.get("user_id") or user.get("id"),
                   }}},
    )

    # Mirror the change onto the linked financial transaction (Phase 13 auto-post).
    fin_updated = 0
    try:
        result = await _db.financial_transactions.update_many(
            {"reference_type": "salon_order", "reference_id": order_id,
             "salon_id": salon_id, "type": "outflow",
             "category": "inventory_purchase"},
            {"$set": {"payment_mode": new_mode, "updated_at": _now_iso()},
             "$push": {"payment_mode_history": audit_entry}},
        )
        fin_updated = result.modified_count
    except Exception as e:
        logger.error(f"[salon_store] failed to mirror payment_mode change to finance: {e}")

    fresh = await _db.salon_orders.find_one({"id": order_id}, {"_id": 0})
    return {
        "ok": True,
        "order": fresh,
        "financial_transactions_updated": fin_updated,
        "message": f"Payment mode updated from {old_mode} to {new_mode}",
    }


# --------------------------- Cashfree webhook ------------------

@salon_store_router.post("/api/salon/store/cashfree/webhook")
async def cashfree_webhook(request: Request):
    raw = await request.body()
    timestamp = request.headers.get("x-webhook-timestamp", "")
    signature = request.headers.get("x-webhook-signature", "")
    # Verify (in TEST/sandbox we still verify but log on failure).
    try:
        ok = cashfree_service.verify_webhook_signature(raw, timestamp, signature)
    except Exception:
        ok = False
    if not ok:
        logger.warning("[salon_store] Cashfree webhook signature invalid")
        # Don't 401 — Cashfree retries; just don't act on it.
        return {"ok": False}

    try:
        body = await request.json()
    except Exception:
        return {"ok": False, "error": "invalid_json"}

    data = (body or {}).get("data") or {}
    order = data.get("order") or {}
    payment = data.get("payment") or {}
    cf_order_id = order.get("order_id")
    cf_status = (payment.get("payment_status") or order.get("order_status") or "").upper()

    if not cf_order_id:
        return {"ok": False, "error": "missing_order_id"}

    matched = []
    async for o in _db.salon_orders.find({"cashfree_order_id": cf_order_id}, {"_id": 0}):
        matched.append(o)
    if not matched:
        logger.warning(f"[salon_store] webhook for unknown cf_order_id={cf_order_id}")
        return {"ok": True}

    if cf_status in ("SUCCESS", "PAID", "ORDER_PAID"):
        for o in matched:
            if o.get("payment_status") == "paid":
                continue
            await _db.salon_orders.update_one(
                {"id": o["id"]},
                {"$set": {
                    "payment_status": "paid",
                    "order_status": "confirmed",
                    "cashfree_payment_id": payment.get("cf_payment_id") or payment.get("payment_id"),
                    "reservation_expires_at": None,
                    "confirmed_at": _now_iso(),
                    "updated_at": _now_iso(),
                 },
                 "$push": {"status_history": {
                     "status": "confirmed",
                     "timestamp": _now_iso(),
                     "note": "Payment received via Cashfree",
                     "updated_by": "system",
                 }}},
            )
            if _create_in_app_notification:
                try:
                    await _create_in_app_notification(
                        user_type="supplier",
                        user_id=o["supplier_id"],
                        title="Order confirmed",
                        message=f"Payment received for order #{o['id'][:8]} (₹{o['total_amount']:.2f})",
                        notification_type="store_order_paid",
                        setting_key="orders",
                        salon_id=o["salon_id"],
                        related_id=o["id"],
                    )
                except Exception:
                    pass
    elif cf_status in ("FAILED", "USER_DROPPED", "CANCELLED", "EXPIRED"):
        for o in matched:
            if o.get("order_status") == "cancelled":
                continue
            await _release_reservations(o)
            await _db.salon_orders.update_one(
                {"id": o["id"]},
                {"$set": {
                    "payment_status": "failed",
                    "order_status": "cancelled",
                    "cancelled_at": _now_iso(),
                    "cancellation_reason": f"payment_{cf_status.lower()}",
                    "updated_at": _now_iso(),
                 },
                 "$push": {"status_history": {
                     "status": "cancelled",
                     "timestamp": _now_iso(),
                     "note": f"Payment {cf_status.lower()}",
                     "updated_by": "system",
                 }}},
            )
    return {"ok": True}


# --------------------------- Supplier-side ---------------------

@salon_store_router.get("/api/supplier/orders")
async def supplier_list_orders(
    status: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    supplier=Depends(_supplier_auth),
):
    sup_id = supplier.get("id") if isinstance(supplier, dict) else None
    if not sup_id:
        raise HTTPException(status_code=401, detail="Invalid supplier token")
    q = {"supplier_id": sup_id, "order_status": {"$ne": "pending_payment"}}
    # Hide pending_payment orders from supplier until payment lands — keeps the
    # supplier inbox tidy.
    if status:
        q["order_status"] = status
    total = await _db.salon_orders.count_documents(q)
    cursor = _db.salon_orders.find(q, {"_id": 0}).sort([("created_at", -1)]).skip((page - 1) * page_size).limit(page_size)
    items: list = []
    async for d in cursor:
        items.append(d)
    return {
        "orders": items,
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": max(1, (total + page_size - 1) // page_size),
    }


@salon_store_router.get("/api/supplier/orders/{order_id}")
async def supplier_get_order(order_id: str, supplier=Depends(_supplier_auth)):
    sup_id = supplier.get("id")
    doc = await _db.salon_orders.find_one({"id": order_id, "supplier_id": sup_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Order not found")
    if doc.get("order_status") == "pending_payment":
        # Hide until paid.
        raise HTTPException(status_code=404, detail="Order not found")
    return doc


async def _supplier_transition(order_id: str, supplier: dict, from_statuses: List[str], to_status: str, note: str):
    sup_id = supplier.get("id")
    doc = await _db.salon_orders.find_one({"id": order_id, "supplier_id": sup_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="Order not found")
    if doc["order_status"] not in from_statuses:
        raise HTTPException(
            status_code=409,
            detail=f"Cannot move order from '{doc['order_status']}' to '{to_status}'",
        )
    return doc


@salon_store_router.post("/api/supplier/orders/{order_id}/confirm")
async def supplier_confirm_order(order_id: str, supplier=Depends(_supplier_auth)):
    """Idempotent acknowledgement of a paid/COD order by the supplier.

    Cashfree-paid orders are already in 'confirmed' state; this endpoint is
    primarily useful for explicit acknowledgement and to push a status_history
    entry. For COD orders nothing changes either.
    """
    # Validates ownership / state transition and raises 4xx on failure.
    await _supplier_transition(order_id, supplier, ["confirmed"], "confirmed", "Acknowledged by supplier")
    await _db.salon_orders.update_one(
        {"id": order_id},
        {"$set": {"updated_at": _now_iso()},
         "$push": {"status_history": {
             "status": "confirmed",
             "timestamp": _now_iso(),
             "note": "Acknowledged by supplier",
             "updated_by": supplier.get("id"),
         }}},
    )
    fresh = await _db.salon_orders.find_one({"id": order_id}, {"_id": 0})
    return {"ok": True, "order": fresh}


@salon_store_router.post("/api/supplier/orders/{order_id}/ship")
async def supplier_ship_order(order_id: str, payload: ShipPayload, supplier=Depends(_supplier_auth)):
    doc = await _supplier_transition(order_id, supplier, ["confirmed"], "shipped", "Shipped")
    await _db.salon_orders.update_one(
        {"id": order_id},
        {"$set": {
            "order_status": "shipped",
            "shipped_at": _now_iso(),
            "tracking_number": payload.tracking_number,
            "shipping_carrier": payload.carrier,
            "updated_at": _now_iso(),
         },
         "$push": {"status_history": {
             "status": "shipped",
             "timestamp": _now_iso(),
             "note": payload.note or (f"Shipped via {payload.carrier}" if payload.carrier else "Shipped"),
             "updated_by": supplier.get("id"),
             "tracking_number": payload.tracking_number,
         }}},
    )
    if _create_in_app_notification:
        try:
            await _create_in_app_notification(
                user_type="salon",
                user_id=doc["salon_id"],
                title="Your order has shipped",
                message=f"Order #{order_id[:8]} from {doc.get('supplier_name') or 'supplier'} is on its way",
                notification_type="store_order_shipped",
                setting_key="orders",
                salon_id=doc["salon_id"],
                related_id=order_id,
            )
        except Exception:
            pass
    fresh = await _db.salon_orders.find_one({"id": order_id}, {"_id": 0})
    return {"ok": True, "order": fresh}


@salon_store_router.post("/api/supplier/orders/{order_id}/deliver")
async def supplier_deliver_order(order_id: str, payload: DeliverPayload, supplier=Depends(_supplier_auth)):
    # Allow delivery from either 'shipped' (normal path) or 'confirmed' (in-person handoff for COD/local).
    doc = await _supplier_transition(order_id, supplier, ["shipped", "confirmed"], "delivered", "Delivered")
    # For COD: payment is collected on delivery.
    new_payment_status = "paid" if doc.get("payment_mode") == "cod" else doc.get("payment_status", "paid")

    # Issue 7 — supplier may set payment_mode at delivery. Persist BEFORE auto-post
    # so the finance row records the correct mode.
    update_set = {
        "order_status": "delivered",
        "delivered_at": _now_iso(),
        "payment_status": new_payment_status,
        "updated_at": _now_iso(),
    }
    push_updates: dict = {
        "status_history": {
            "status": "delivered",
            "timestamp": _now_iso(),
            "note": payload.note or "Delivered",
            "updated_by": supplier.get("id"),
        }
    }
    if payload.payment_mode:
        update_set["payment_mode"] = payload.payment_mode
        push_updates["payment_mode_history"] = {
            "id": str(uuid.uuid4()),
            "old_mode": doc.get("payment_mode"),
            "new_mode": payload.payment_mode,
            "changed_by": supplier.get("id"),
            "changed_by_role": "supplier",
            "note": "Set at delivery",
            "timestamp": _now_iso(),
        }
    await _db.salon_orders.update_one(
        {"id": order_id},
        {"$set": update_set, "$push": push_updates},
    )
    # Reservations -> consumed (drop reserved counter).
    fresh = await _db.salon_orders.find_one({"id": order_id}, {"_id": 0})
    await _consume_reservations(fresh)

    # Phase 13 — auto-post inventory & finance for the salon.
    autopost_summary = None
    if _auto_post_on_delivery is not None:
        try:
            autopost_summary = await _auto_post_on_delivery(fresh)
            await _db.salon_orders.update_one(
                {"id": order_id},
                {"$set": {"auto_post_summary": autopost_summary, "updated_at": _now_iso()}},
            )
        except Exception as e:
            logger.error(f"[salon_store] auto_post_on_delivery raised: {e}")
            autopost_summary = {"error": str(e)}

    if _create_in_app_notification:
        try:
            await _create_in_app_notification(
                user_type="salon",
                user_id=doc["salon_id"],
                title="Order delivered",
                message=f"Order #{order_id[:8]} from {doc.get('supplier_name') or 'supplier'} has been delivered",
                notification_type="store_order_delivered",
                setting_key="orders",
                salon_id=doc["salon_id"],
                related_id=order_id,
            )
        except Exception:
            pass

    final = await _db.salon_orders.find_one({"id": order_id}, {"_id": 0})
    return {"ok": True, "order": final}


# --------------------------- Sweeper ---------------------------

_sweeper_task: Optional[asyncio.Task] = None


async def _sweeper_loop():
    """Background task: every minute, release reservations of expired pending_payment orders."""
    while True:
        try:
            now = _now_iso()
            cursor = _db.salon_orders.find(
                {
                    "order_status": "pending_payment",
                    "reservation_expires_at": {"$ne": None, "$lt": now},
                    "_reservations_released": {"$ne": True},
                },
                {"_id": 0},
            )
            async for o in cursor:
                logger.info(f"[salon_store] expiring reservation for order {o['id']}")
                await _release_reservations(o)
                await _db.salon_orders.update_one(
                    {"id": o["id"]},
                    {"$set": {
                        "order_status": "cancelled",
                        "cancelled_at": _now_iso(),
                        "cancellation_reason": "payment_window_expired",
                        "updated_at": _now_iso(),
                     },
                     "$push": {"status_history": {
                         "status": "cancelled",
                         "timestamp": _now_iso(),
                         "note": "Payment window expired",
                         "updated_by": "system",
                     }}},
                )
        except Exception as e:
            logger.error(f"[salon_store] sweeper iteration failed: {e}")
        await asyncio.sleep(60)


def start_sweeper():
    """Schedule the background sweeper. Safe to call multiple times."""
    global _sweeper_task
    if _sweeper_task is None or _sweeper_task.done():
        try:
            _sweeper_task = asyncio.create_task(_sweeper_loop())
            logger.info("[salon_store] reservation sweeper started")
        except RuntimeError:
            # No running loop yet — caller should retry on startup event.
            pass
