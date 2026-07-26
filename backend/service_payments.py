"""
Customer → Salon service payments via Cashfree Easy Split.

Lets a *customer* pay a salon for a booking through the app, with money settling
directly to the salon (100% — no platform cut). Rides on Cashfree Easy Split so
the platform never holds customer funds in its own account (which would trigger
RBI Payment Aggregator rules).

Decisions baked in
------------------
1. No platform cut — the whole order amount is split to the salon vendor.
2. Salon bears the Cashfree fee — routed by splitting 100% to the vendor and
   relying on the Easy Split "vendor bears charges" account setting. That toggle
   is an account/dashboard config, NOT code; if it's off, the platform eats the
   fee.
3. KYC gate — a salon can only accept in-app UPI/card payment once its Cashfree
   vendor status is ACTIVE. Cash and the legacy direct-UPI intent stay open
   always; only in-app gateway payment is blocked until KYC completes.

Endpoints
---------
Salon-admin (Bearer salon token):
    POST /api/salons/{salon_id}/payment-vendor/onboard
    GET  /api/salons/{salon_id}/payment-vendor/status

Public (customer booking flow, no auth — mirrors existing customer-confirm-upi):
    GET  /api/service-payments/salon/{salon_id}/available
    POST /api/service-payments/create-order        body {token_id}
    GET  /api/service-payments/status/{order_id}

Shared webhook:
    server.py's Cashfree webhook calls handle_service_payment_webhook first.

Collections
-----------
salon_vendors           salon_id -> {cashfree_vendor_id, status, method, masked, ...}
service_payment_orders  cashfree_order_id -> {token_id, salon_id, amount, status}
"""

from __future__ import annotations

import logging
import os
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, ConfigDict

import cashfree_service

logger = logging.getLogger(__name__)

_db = None
_get_current_salon_user = None
_create_in_app_notification = None
_check_salon_admin_for_salon = None
_broadcast_update = None

_bearer = HTTPBearer(auto_error=False)

service_payments_router = APIRouter(tags=["service-payments"])

_ACTIVE_STATES = {"ACTIVE"}


def init_service_payments_router(
    *,
    db,
    get_current_salon_user,
    create_in_app_notification,
    check_salon_admin_for_salon,
    broadcast_update=None,
):
    """Wire module-level deps before the app starts serving."""
    global _db, _get_current_salon_user, _create_in_app_notification
    global _check_salon_admin_for_salon, _broadcast_update
    _db = db
    _get_current_salon_user = get_current_salon_user
    _create_in_app_notification = create_in_app_notification
    _check_salon_admin_for_salon = check_salon_admin_for_salon
    _broadcast_update = broadcast_update


async def _salon_auth(credentials: HTTPAuthorizationCredentials = Depends(_bearer)):
    if _get_current_salon_user is None:
        raise HTTPException(status_code=500, detail="service_payments_not_initialised")
    if credentials is None:
        raise HTTPException(status_code=401, detail="Authentication required")
    return await _get_current_salon_user(credentials)


def _vendor_id_for(salon_id: str) -> str:
    """Deterministic vendor id so we can reconstruct it without a lookup."""
    return f"salon_{salon_id[:12]}"


def _clean_phone(raw: Optional[str]) -> str:
    p = (raw or "").replace("+91", "").replace("+", "").strip()
    p = "".join(ch for ch in p if ch.isdigit())[-10:]
    return p if len(p) == 10 else "9999999999"


# ---------------------------------------------------------------------------
# Salon-admin: vendor onboarding
# ---------------------------------------------------------------------------
class VendorOnboardIn(BaseModel):
    model_config = ConfigDict(extra="ignore")
    upi_vpa: Optional[str] = None
    bank_account_number: Optional[str] = None
    bank_ifsc: Optional[str] = None
    account_holder: Optional[str] = None
    pan: Optional[str] = None


def _mask(method: str, upi: Optional[str], acct: Optional[str]) -> str:
    if method == "upi" and upi:
        name, _, host = upi.partition("@")
        keep = name[:2] if len(name) > 2 else name
        return f"{keep}{'*' * max(len(name) - 2, 0)}@{host}" if host else upi
    if method == "bank" and acct:
        return f"****{acct[-4:]}" if len(acct) >= 4 else "****"
    return ""


async def _persist_vendor(salon_id: str, vendor_id: str, method: str,
                          masked: str, cf_status: str, raw: dict) -> dict:
    now = datetime.now(timezone.utc).isoformat()
    doc = {
        "salon_id": salon_id,
        "cashfree_vendor_id": vendor_id,
        "status": cf_status,
        "method": method,
        "masked_destination": masked,
        "last_cashfree_response": raw,
        "updated_at": now,
    }
    existing = await _db.salon_vendors.find_one({"salon_id": salon_id}, {"_id": 0, "created_at": 1})
    if existing:
        await _db.salon_vendors.update_one({"salon_id": salon_id}, {"$set": doc})
    else:
        doc["created_at"] = now
        await _db.salon_vendors.insert_one(doc.copy())
    doc.pop("last_cashfree_response", None)
    return doc


@service_payments_router.post("/api/salons/{salon_id}/payment-vendor/onboard")
async def onboard_payment_vendor(
    salon_id: str,
    payload: VendorOnboardIn,
    current_user=Depends(_salon_auth),
):
    """
    Register the salon as an Easy Split vendor so it can receive in-app payments.
    Provide EITHER a UPI VPA OR bank account+IFSC (not both). Cashfree runs KYC /
    account verification asynchronously; the returned `status` may be pending and
    should be polled via GET .../payment-vendor/status.
    """
    _check_salon_admin_for_salon(current_user, salon_id)

    salon = await _db.salons.find_one({"id": salon_id}, {"_id": 0})
    if not salon:
        raise HTTPException(status_code=404, detail="Salon not found")

    upi = (payload.upi_vpa or "").strip() or None
    acct = (payload.bank_account_number or "").strip() or None
    ifsc = (payload.bank_ifsc or "").strip().upper() or None

    # Fall back to the salon's existing on-file UPI id if none supplied.
    if not upi and not acct:
        upi = (salon.get("upi_id") or "").strip() or None

    if not upi and not (acct and ifsc):
        raise HTTPException(
            status_code=400,
            detail="Provide a UPI ID, or bank account number + IFSC, to receive payments.",
        )
    if upi and acct:
        raise HTTPException(
            status_code=400,
            detail="Provide either a UPI ID or a bank account — not both.",
        )

    if not cashfree_service.is_configured():
        raise HTTPException(status_code=503, detail="Payment gateway is not configured.")

    method = "upi" if upi else "bank"
    vendor_id = _vendor_id_for(salon_id)
    holder = (payload.account_holder or salon.get("owner_name")
              or salon.get("salon_name") or "Salon")[:100]

    try:
        cf = await cashfree_service.add_vendor(
            vendor_id=vendor_id,
            name=salon.get("salon_name") or holder,
            email=salon.get("email") or "noreply@salonhub.in",
            phone=_clean_phone(salon.get("phone")),
            upi_vpa=upi,
            bank_account_number=acct,
            bank_ifsc=ifsc,
            account_holder=holder,
            verify_account=True,
            kyc_pan=(payload.pan or "").strip().upper() or None,
        )
    except Exception as e:
        logger.error(f"[ServicePayments] add_vendor failed for {salon_id}: {e}")
        raise HTTPException(status_code=502, detail=f"Could not onboard vendor: {e}")

    cf_status = (cf.get("status") or "IN_BENE_VERIFICATION").upper()
    masked = _mask(method, upi, acct)
    await _persist_vendor(salon_id, vendor_id, method, masked, cf_status, cf)

    return {
        "salon_id": salon_id,
        "vendor_id": vendor_id,
        "status": cf_status,
        "in_app_payment_enabled": cf_status in _ACTIVE_STATES,
        "method": method,
        "masked_destination": masked,
        "message": (
            "In-app payments are live."
            if cf_status in _ACTIVE_STATES
            else "Details submitted. Verification usually completes within a few minutes."
        ),
    }


@service_payments_router.get("/api/salons/{salon_id}/payment-vendor/status")
async def payment_vendor_status(salon_id: str, current_user=Depends(_salon_auth)):
    """
    Return the salon's in-app-payment readiness. If we have a vendor that isn't
    yet ACTIVE, re-fetch from Cashfree so a completed KYC flips us live without
    the salon re-submitting.
    """
    _check_salon_admin_for_salon(current_user, salon_id)

    rec = await _db.salon_vendors.find_one({"salon_id": salon_id}, {"_id": 0})
    if not rec:
        return {
            "salon_id": salon_id,
            "onboarded": False,
            "status": None,
            "in_app_payment_enabled": False,
        }

    status = (rec.get("status") or "").upper()
    if status not in _ACTIVE_STATES and cashfree_service.is_configured():
        try:
            cf = await cashfree_service.get_vendor(rec["cashfree_vendor_id"])
            if cf:
                new_status = (cf.get("status") or status).upper()
                if new_status != status:
                    status = new_status
                    await _db.salon_vendors.update_one(
                        {"salon_id": salon_id},
                        {"$set": {"status": status,
                                  "last_cashfree_response": cf,
                                  "updated_at": datetime.now(timezone.utc).isoformat()}},
                    )
        except Exception as e:
            logger.warning(f"[ServicePayments] status refresh failed for {salon_id}: {e}")

    return {
        "salon_id": salon_id,
        "onboarded": True,
        "status": status,
        "in_app_payment_enabled": status in _ACTIVE_STATES,
        "method": rec.get("method"),
        "masked_destination": rec.get("masked_destination"),
    }


async def _is_salon_active_vendor(salon_id: str) -> bool:
    rec = await _db.salon_vendors.find_one(
        {"salon_id": salon_id}, {"_id": 0, "status": 1}
    )
    return bool(rec and (rec.get("status") or "").upper() in _ACTIVE_STATES)


# ---------------------------------------------------------------------------
# Customer: create split order + poll
# ---------------------------------------------------------------------------
@service_payments_router.get("/api/service-payments/salon/{salon_id}/available")
async def in_app_payment_available(salon_id: str):
    """Public: does this salon accept in-app UPI/card payment right now?"""
    return {
        "salon_id": salon_id,
        "in_app_payment_enabled": await _is_salon_active_vendor(salon_id),
    }


class CreateServiceOrderIn(BaseModel):
    model_config = ConfigDict(extra="ignore")
    token_id: str


@service_payments_router.post("/api/service-payments/create-order")
async def create_service_payment_order(payload: CreateServiceOrderIn):
    """
    Create a Cashfree Easy Split order for a booking token. 100% of the amount is
    split to the salon vendor. Returns a payment_session_id for the JS SDK.

    Blocked with 409 if the salon hasn't completed Cashfree KYC (vendor inactive)
    — the caller should fall back to cash / direct-UPI in that case.
    """
    token = await _db.tokens.find_one({"id": payload.token_id}, {"_id": 0})
    if not token:
        raise HTTPException(status_code=404, detail="Booking not found")
    if token.get("payment_status") == "paid":
        raise HTTPException(status_code=400, detail="This booking is already paid")

    salon_id = token.get("salon_id")
    amount = round(float(token.get("total_amount") or 0), 2)
    if amount <= 0:
        raise HTTPException(status_code=400, detail="Invalid booking amount")

    if not cashfree_service.is_configured():
        raise HTTPException(status_code=503, detail="Payment gateway is not configured.")

    if not await _is_salon_active_vendor(salon_id):
        raise HTTPException(
            status_code=409,
            detail="This salon isn't set up for in-app payment yet. Please pay by cash or UPI.",
        )

    vendor_id = _vendor_id_for(salon_id)
    order_id = f"SVC-{token.get('id', '')[:8]}-{int(datetime.now(timezone.utc).timestamp())}"

    backend_base = os.environ.get("BACKEND_PUBLIC_URL", "")
    frontend_base = os.environ.get("FRONTEND_PUBLIC_URL", "")
    return_url = (
        f"{frontend_base}/pay/callback?order_id={order_id}"
        if frontend_base else "https://salonhub.in/pay/callback"
    )
    notify_url = f"{backend_base}/api/subscriptions/webhook" if backend_base else None

    # 100% to the salon vendor — no platform cut.
    order_splits = [{"vendor_id": vendor_id, "percentage": 100}]

    try:
        cf = await cashfree_service.create_order(
            order_id=order_id,
            order_amount=amount,
            customer_id=(token.get("user_id") or _clean_phone(token.get("phone")))[:40],
            customer_name=token.get("customer_name") or "Customer",
            customer_email="noreply@salonhub.in",
            customer_phone=_clean_phone(token.get("phone")),
            return_url=return_url,
            notify_url=notify_url,
            order_note=f"Service payment · Token {token.get('token_number','')}",
            order_currency="INR",
            order_splits=order_splits,
            order_tags={"kind": "service_payment", "token_id": token["id"]},
        )
    except Exception as e:
        logger.error(f"[ServicePayments] create_order failed token={payload.token_id}: {e}")
        raise HTTPException(status_code=502, detail=f"Payment gateway error: {e}")

    now = datetime.now(timezone.utc).isoformat()
    await _db.service_payment_orders.insert_one({
        "id": str(uuid.uuid4()),
        "cashfree_order_id": cf.get("order_id") or order_id,
        "token_id": token["id"],
        "salon_id": salon_id,
        "vendor_id": vendor_id,
        "amount": amount,
        "status": "pending",
        "created_at": now,
        "updated_at": now,
    })

    return {
        "order_id": cf.get("order_id") or order_id,
        "payment_session_id": cf.get("payment_session_id"),
        "cashfree_env": cashfree_service.CASHFREE_ENV,
        "amount": amount,
        "currency": "INR",
    }


@service_payments_router.get("/api/service-payments/status/{order_id}")
async def service_payment_status(order_id: str):
    """
    Poll fallback for the customer's success screen when the webhook is delayed.
    """
    rec = await _db.service_payment_orders.find_one(
        {"cashfree_order_id": order_id}, {"_id": 0}
    )
    if not rec:
        raise HTTPException(status_code=404, detail="Unknown order")

    token = await _db.tokens.find_one({"id": rec["token_id"]}, {"_id": 0})
    if token and token.get("payment_status") == "paid":
        return {"paid": True, "token_id": rec["token_id"], "source": "db"}

    try:
        payments = await cashfree_service.fetch_payments_for_order(order_id)
    except Exception:
        payments = []
    captured = next(
        (p for p in payments if (p.get("payment_status") or "").upper() == "SUCCESS"),
        None,
    )
    if captured:
        await _settle_service_payment(order_id, captured)
        return {"paid": True, "token_id": rec["token_id"], "source": "poll"}

    return {"paid": False, "token_id": rec["token_id"], "status": rec.get("status")}


# ---------------------------------------------------------------------------
# Settlement (shared by webhook + poll fallback) — idempotent
# ---------------------------------------------------------------------------
async def _settle_service_payment(order_id: str, payment: dict) -> bool:
    """
    Mark the booking token paid, log the financial transaction, notify the
    customer. Safe to call more than once (guards on order status + token state).
    """
    rec = await _db.service_payment_orders.find_one(
        {"cashfree_order_id": order_id}, {"_id": 0}
    )
    if not rec:
        logger.warning(f"[ServicePayments] settle: unknown order {order_id}")
        return False
    if rec.get("status") == "paid":
        return True

    token = await _db.tokens.find_one({"id": rec["token_id"]}, {"_id": 0})
    if not token:
        logger.warning(f"[ServicePayments] settle: token gone {rec['token_id']}")
        return False

    now = datetime.now(timezone.utc).isoformat()
    cf_payment_id = str(payment.get("cf_payment_id") or "")
    upi_txn = ""
    method = payment.get("payment_method")
    if isinstance(method, dict):
        upi_blob = method.get("upi") or {}
        upi_txn = upi_blob.get("upi_txn_id") or upi_blob.get("utr") or ""
    method_label = "upi"
    if isinstance(method, dict) and method:
        method_label = next(iter(method.keys()), "upi")

    # Flip the mapping first so concurrent webhook + poll can't double-post.
    res = await _db.service_payment_orders.update_one(
        {"cashfree_order_id": order_id, "status": {"$ne": "paid"}},
        {"$set": {"status": "paid", "cf_payment_id": cf_payment_id, "updated_at": now}},
    )
    if res.modified_count == 0:
        return True

    amount = round(float(rec.get("amount") or token.get("total_amount") or 0), 2)

    await _db.tokens.update_one(
        {"id": token["id"]},
        {"$set": {
            "payment_status": "paid",
            "payment_confirmed": True,
            "payment_mode": method_label if method_label in ("upi", "card", "netbanking") else "upi",
            "upi_transaction_id": upi_txn or None,
            "cashfree_order_id": order_id,
            "cashfree_payment_id": cf_payment_id or None,
            "payment_breakdown": {"upi_amount": amount, "cash_amount": 0, "wallet_amount": 0},
        }},
    )

    await _db.financial_transactions.insert_one({
        "id": str(uuid.uuid4()),
        "salon_id": rec["salon_id"],
        "branch_id": token.get("branch_id"),
        "type": "inflow",
        "category": "booking_payment",
        "amount": amount,
        "payment_mode": "upi",
        "narration": f"Online payment · Token {token.get('token_number','')} - "
                     f"{token.get('customer_name','')}",
        "reference_id": token["id"],
        "reference_type": "token",
        "gateway": "cashfree",
        "gateway_order_id": order_id,
        "gateway_payment_id": cf_payment_id or None,
        "created_by": "system",
        "date": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        "created_at": now,
    })

    phone = token.get("phone")
    if phone:
        try:
            await _db.notifications.insert_one({
                "id": str(uuid.uuid4()),
                "user_type": "customer",
                "user_id": phone,
                "salon_id": rec["salon_id"],
                "title": "Payment Received",
                "message": f"Payment of ₹{amount:.0f} for token "
                           f"{token.get('token_number','')} received. Thank you!",
                "type": "payment_confirmed",
                "related_id": token["id"],
                "is_read": False,
                "created_at": now,
            })
        except Exception as e:
            logger.warning(f"[ServicePayments] notify failed: {e}")

    if _create_in_app_notification:
        try:
            await _create_in_app_notification(
                user_type="salon",
                user_id=rec["salon_id"],
                title="💸 Payment received",
                message=f"₹{amount:.0f} received online for token "
                        f"{token.get('token_number','')}.",
                notification_type="payment_received",
                setting_key="payment_received",
                salon_id=rec["salon_id"],
                related_id=token["id"],
            )
        except Exception:
            pass

    if _broadcast_update:
        try:
            updated = await _db.tokens.find_one({"id": token["id"]}, {"_id": 0})
            await _broadcast_update("token_updated", updated)
        except Exception:
            pass

    logger.info(f"[ServicePayments] settled order={order_id} token={token['id']} ₹{amount}")
    return True


async def handle_service_payment_webhook(payload: dict) -> Optional[dict]:
    """
    Called by server.py's shared Cashfree webhook. Returns a result dict if this
    event belonged to a service payment, or None if it's not ours (so the caller
    can fall through to subscription handling).
    """
    data = payload.get("data") or {}
    order = data.get("order") or {}
    payment = data.get("payment") or {}
    order_id = order.get("order_id") or ""

    tags = order.get("order_tags") or {}
    is_ours = (tags.get("kind") == "service_payment") or order_id.startswith("SVC-")
    if not is_ours and order_id:
        exists = await _db.service_payment_orders.find_one(
            {"cashfree_order_id": order_id}, {"_id": 0, "id": 1}
        )
        is_ours = bool(exists)
    if not is_ours or not order_id:
        return None

    status = (payment.get("payment_status") or "").upper()
    now = datetime.now(timezone.utc).isoformat()

    if status == "SUCCESS":
        await _settle_service_payment(order_id, payment)
    elif status in ("FAILED", "USER_DROPPED", "CANCELLED"):
        await _db.service_payment_orders.update_one(
            {"cashfree_order_id": order_id, "status": {"$ne": "paid"}},
            {"$set": {"status": "failed", "updated_at": now}},
        )

    return {"handled": True, "kind": "service_payment", "order_id": order_id}
