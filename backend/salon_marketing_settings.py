"""
salon_marketing_settings.py
Marketing → Settings backend module.

Implements the actual-cost pass-through wallet model with Cashfree top-ups
+ Twilio sub-account status + spend sync + SMS DLT + Email sender + sending windows.

Money is stored as integer minor units (paise). WALLET_PLATFORM_MARGIN_PERCENT=0 —
every rupee salons pay reaches Twilio (via us) 1:1.

Storage
=======
Collections created lazily (Mongo):
  * twilio_subaccounts     {salon_id, subaccount_sid, waba_id, sender_phone_e164,
                            messaging_service_sid, display_name, quality_rating,
                            messaging_tier, sender_status, updated_at}
  * wallets                {salon_id, balance_minor, currency:"INR",
                            marketing_status: "not_activated"|"active"|"paused",
                            first_recharge_at, auto_recharge,
                            recharge_threshold_minor, recharge_amount_minor,
                            low_balance_alert_minor, updated_at}
  * wallet_ledger          {id, salon_id, type: topup|debit|adjustment|refund,
                            channel, amount_minor (+/-), balance_after_minor,
                            ref, twilio_usage_key, created_at}
  * usage_sync             {id, salon_id, subaccount_sid, period_date, category,
                            count, twilio_cost_minor, billed_cost_minor, synced_at}
  * dlt_config             {salon_id, entity_id, sender_header, provider,
                            template_dlt_ids:[], registered}
  * email_sender           {salon_id, from_name, from_email, reply_to, verified}
  * send_settings          {salon_id, window_start, window_end, quiet_start,
                            quiet_end, optout_keyword, require_optin,
                            per_guest_cap_per_week}
  * payment_orders         {provider_order_id, salon_id, amount_minor, purpose,
                            status: created|credited|failed|expired, event_history:[],
                            created_at, credited_at, reference_id}
"""
from __future__ import annotations

import logging
import os
import time
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from bson import ObjectId
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from payment_provider import (
    CreateOrderInput,
    get_payment_provider,
)

logger = logging.getLogger(__name__)

# ------------- Injected at startup -------------
_db = None
_get_current_salon_user = None
_get_current_salon_admin = None

settings_router = APIRouter(prefix="/api", tags=["marketing-settings"])


def init_marketing_settings_router(*, db, get_current_salon_user, get_current_salon_admin):
    global _db, _get_current_salon_user, _get_current_salon_admin
    _db = db
    _get_current_salon_user = get_current_salon_user
    _get_current_salon_admin = get_current_salon_admin


# ------------- Helpers -------------

def _clean(doc):
    if not doc:
        return doc
    doc = dict(doc)
    doc.pop("_id", None)
    for k, v in list(doc.items()):
        if isinstance(v, ObjectId):
            doc[k] = str(v)
    return doc


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _rupees_env(name: str, default_rupees: int) -> int:
    """Convert an env var (rupees) into minor units (paise)."""
    try:
        return int(float(os.environ.get(name, str(default_rupees))) * 100)
    except (TypeError, ValueError):
        return default_rupees * 100


def _min_first_recharge_minor() -> int:
    return _rupees_env("WALLET_MIN_FIRST_RECHARGE", 500)


def _default_low_balance_alert_minor() -> int:
    return _rupees_env("WALLET_LOW_BALANCE_ALERT", 300)


async def _require_user(request: Request) -> Dict[str, Any]:
    if _get_current_salon_user is None:
        raise HTTPException(status_code=500, detail="Auth not initialised")
    from fastapi.security import HTTPAuthorizationCredentials
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.lower().startswith("bearer "):
        raise HTTPException(status_code=403, detail="Not authenticated")
    creds = HTTPAuthorizationCredentials(scheme="Bearer", credentials=auth_header.split(" ", 1)[1])
    return await _get_current_salon_user(creds)


async def _require_admin(request: Request) -> Dict[str, Any]:
    user = await _require_user(request)
    if user.get("role") not in ("salon_admin", "platform_admin", "admin"):
        raise HTTPException(status_code=403, detail="Admin required")
    return user


def _assert_salon_scope(user: Dict[str, Any], salon_id: str):
    if user and user.get("salon_id") and user.get("salon_id") != salon_id:
        raise HTTPException(status_code=403, detail="Cross-salon access denied")


async def _get_or_create_wallet(salon_id: str) -> Dict[str, Any]:
    doc = await _db.wallets.find_one({"salon_id": salon_id})
    if not doc:
        doc = {
            "salon_id": salon_id,
            "balance_minor": 0,
            "currency": os.environ.get("WALLET_CURRENCY", "INR"),
            "marketing_status": "not_activated",
            "first_recharge_at": None,
            "auto_recharge": False,
            "recharge_threshold_minor": 0,
            "recharge_amount_minor": 0,
            "low_balance_alert_minor": _default_low_balance_alert_minor(),
            "created_at": _now_iso(),
            "updated_at": _now_iso(),
        }
        await _db.wallets.insert_one(dict(doc))
    return _clean(doc)


async def _insert_ledger(
    salon_id: str, type_: str, amount_minor: int, balance_after_minor: int,
    channel: Optional[str] = None, ref: Optional[str] = None,
    twilio_usage_key: Optional[str] = None, note: Optional[str] = None,
):
    row = {
        "id": str(uuid.uuid4()),
        "salon_id": salon_id,
        "type": type_,           # topup | debit | adjustment | refund
        "channel": channel,      # whatsapp | sms | email | null
        "amount_minor": int(amount_minor),
        "balance_after_minor": int(balance_after_minor),
        "ref": ref,
        "twilio_usage_key": twilio_usage_key,
        "note": note,
        "created_at": _now_iso(),
    }
    await _db.wallet_ledger.insert_one(dict(row))
    return _clean(row)


async def _snapshot_subaccount(salon_id: str) -> Dict[str, Any]:
    """Return the salon's sub-account state, seeding a placeholder row when
    missing so the frontend can render 'Not connected' cleanly."""
    doc = await _db.twilio_subaccounts.find_one({"salon_id": salon_id})
    if not doc:
        doc = {
            "salon_id": salon_id,
            "subaccount_sid": None,
            "friendly_name": None,
            "waba_id": None,
            "sender_phone_e164": None,
            "messaging_service_sid": None,
            "display_name": None,
            "quality_rating": None,
            "messaging_tier": None,
            "sender_status": "not_connected",  # not_connected|pending|online|paused
            "created_at": _now_iso(),
            "updated_at": _now_iso(),
        }
    return _clean(doc)


# ------------- Wallet / spend guard -------------

async def assert_can_send(salon_id: str, estimated_cost_minor: int):
    """Called from the campaign dispatch code path. Raises HTTPException if the
    salon can't send (no first recharge OR insufficient balance)."""
    wallet = await _get_or_create_wallet(salon_id)
    if wallet.get("marketing_status") != "active":
        raise HTTPException(status_code=402, detail="Recharge required to activate marketing")
    if int(wallet.get("balance_minor") or 0) < int(estimated_cost_minor or 0):
        raise HTTPException(status_code=402, detail="Insufficient balance — top up to continue")
    return True


# ========================================================
# GET  /api/salons/{salon_id}/marketing/settings  (full snapshot)
# ========================================================

@settings_router.get("/salons/{salon_id}/marketing/settings/full")
async def get_settings_full(salon_id: str, request: Request):
    user = await _require_user(request)
    _assert_salon_scope(user, salon_id)

    subaccount = await _snapshot_subaccount(salon_id)
    wallet = await _get_or_create_wallet(salon_id)

    dlt = _clean(await _db.dlt_config.find_one({"salon_id": salon_id})) or {}
    email_cfg = _clean(await _db.email_sender.find_one({"salon_id": salon_id})) or {}
    send_settings = _clean(await _db.send_settings.find_one({"salon_id": salon_id})) or {}

    # Spend this month
    now = datetime.now(timezone.utc)
    period_prefix = now.strftime("%Y-%m")
    spend = {"total_minor": 0, "channels": {"whatsapp": {"count": 0, "cost_minor": 0},
                                            "sms": {"count": 0, "cost_minor": 0},
                                            "email": {"count": 0, "cost_minor": 0}}}
    async for u in _db.usage_sync.find({"salon_id": salon_id, "period_date": {"$regex": f"^{period_prefix}"}}):
        cat = (u.get("category") or "whatsapp").lower()
        if cat not in spend["channels"]:
            spend["channels"][cat] = {"count": 0, "cost_minor": 0}
        spend["channels"][cat]["count"] += int(u.get("count") or 0)
        spend["channels"][cat]["cost_minor"] += int(u.get("billed_cost_minor") or 0)
        spend["total_minor"] += int(u.get("billed_cost_minor") or 0)

    # Environment hints for the frontend (Cashfree env)
    env_hints = {
        "cashfree_env": (os.environ.get("CASHFREE_ENV") or "sandbox"),
        "meta_app_id": (os.environ.get("META_APP_ID") or ""),
        "wallet_currency": (os.environ.get("WALLET_CURRENCY") or "INR"),
        "min_first_recharge_minor": _min_first_recharge_minor(),
        "twilio_whatsapp_sender": os.environ.get("TWILIO_WHATSAPP_SENDER"),
    }

    return {
        "salon_id": salon_id,
        "subaccount": subaccount,
        "wallet": wallet,
        "dlt": dlt,
        "email_sender": email_cfg,
        "send_settings": send_settings,
        "spend_month": spend,
        "env": env_hints,
    }


# ========================================================
# GET  /api/salons/{salon_id}/wallet
# ========================================================

@settings_router.get("/salons/{salon_id}/wallet")
async def get_wallet(salon_id: str, request: Request):
    user = await _require_user(request)
    _assert_salon_scope(user, salon_id)
    w = await _get_or_create_wallet(salon_id)
    return {
        "salon_id": salon_id,
        "balance_minor": w.get("balance_minor") or 0,
        "currency": w.get("currency") or "INR",
        "marketing_status": w.get("marketing_status") or "not_activated",
        "first_recharge_at": w.get("first_recharge_at"),
        "auto_recharge": bool(w.get("auto_recharge")),
        "recharge_threshold_minor": w.get("recharge_threshold_minor") or 0,
        "recharge_amount_minor": w.get("recharge_amount_minor") or 0,
        "low_balance_alert_minor": w.get("low_balance_alert_minor") or _default_low_balance_alert_minor(),
    }


# ========================================================
# GET  /api/salons/{salon_id}/wallet/ledger
# ========================================================

@settings_router.get("/salons/{salon_id}/wallet/ledger")
async def get_wallet_ledger(salon_id: str, request: Request, limit: int = 100):
    user = await _require_user(request)
    _assert_salon_scope(user, salon_id)
    out: List[Dict[str, Any]] = []
    limit = max(1, min(int(limit or 100), 500))
    async for row in _db.wallet_ledger.find({"salon_id": salon_id}).sort("created_at", -1).limit(limit):
        out.append(_clean(row))
    return {"entries": out}


# ========================================================
# POST /api/salons/{salon_id}/wallet/topup
# ========================================================

class TopupIn(BaseModel):
    amount_minor: int = Field(..., ge=1)
    return_url: Optional[str] = None


@settings_router.post("/salons/{salon_id}/wallet/topup")
async def create_wallet_topup(salon_id: str, body: TopupIn, request: Request):
    user = await _require_admin(request)
    _assert_salon_scope(user, salon_id)

    wallet = await _get_or_create_wallet(salon_id)
    is_first_recharge = wallet.get("first_recharge_at") is None
    min_minor = _min_first_recharge_minor()
    if is_first_recharge and int(body.amount_minor) < min_minor:
        raise HTTPException(
            status_code=400,
            detail=f"First recharge must be at least ₹{min_minor // 100:,} to activate marketing.",
        )

    # Get salon for customer_details
    salon = await _db.salons.find_one({"id": salon_id}) or {}
    provider = get_payment_provider()
    idem_key = f"tl_{salon_id[:8]}_{int(time.time() * 1000)}_{uuid.uuid4().hex[:8]}"

    result = provider.create_order(CreateOrderInput(
        salon_id=salon_id,
        amount_minor=int(body.amount_minor),
        currency=os.environ.get("WALLET_CURRENCY", "INR"),
        purpose="wallet_topup",
        customer_id=user.get("user_id") or salon_id,
        customer_name=(salon.get("name") or user.get("name") or "Salon Owner")[:60],
        customer_email=(salon.get("email") or user.get("email") or "owner@example.com"),
        customer_phone=(salon.get("phone") or user.get("phone") or "9999999999"),
        return_url=body.return_url or (os.environ.get("APP_BASE_URL", "").rstrip("/") + "/salon/dashboard?tab=marketing"),
        idempotency_key=idem_key,
    ))

    # Persist the order for idempotent webhook credit + reconciliation.
    await _db.payment_orders.insert_one({
        "provider_order_id": result.provider_order_id,
        "payment_session_id": result.payment_session_id,
        "salon_id": salon_id,
        "amount_minor": result.amount_minor,
        "currency": result.currency,
        "purpose": "wallet_topup",
        "status": "created",
        "event_history": [{"event": "created", "at": _now_iso()}],
        "created_at": _now_iso(),
        "user_id": user.get("user_id"),
    })

    return {
        "provider_order_id": result.provider_order_id,
        "payment_session_id": result.payment_session_id,
        "amount_minor": result.amount_minor,
        "currency": result.currency,
        "cashfree_env": (os.environ.get("CASHFREE_ENV") or "sandbox"),
    }


# ========================================================
# POST /api/webhooks/cashfree  (raw body — signature verified)
# ========================================================

@settings_router.post("/webhooks/cashfree")
async def cashfree_webhook(request: Request):
    raw = await request.body()
    headers = dict(request.headers)
    provider = get_payment_provider()
    result = provider.verify_webhook(raw, headers)

    if not result.valid:
        # Log for debugging + return 401 to prevent silent replay attacks.
        logger.warning("Cashfree webhook signature invalid: %s", result.event)
        raise HTTPException(status_code=401, detail="Signature invalid")

    # Always ack non-success events so Cashfree stops retrying.
    if result.event != "payment.success":
        # Best-effort audit trail.
        await _db.payment_orders.update_one(
            {"provider_order_id": result.provider_order_id},
            {"$push": {"event_history": {"event": result.event, "at": _now_iso()}}}
        )
        return {"ok": True}

    order = await _db.payment_orders.find_one({"provider_order_id": result.provider_order_id})
    if not order:
        logger.warning("Cashfree webhook for unknown order %s", result.provider_order_id)
        return {"ok": True}  # ack

    if order.get("status") == "credited":
        return {"ok": True, "idempotent": True}  # replay

    salon_id = order["salon_id"]
    credit_amount = int(order.get("amount_minor") or result.amount_minor)

    wallet = await _get_or_create_wallet(salon_id)
    new_balance = int(wallet.get("balance_minor") or 0) + credit_amount

    is_first = wallet.get("first_recharge_at") is None
    updates = {
        "balance_minor": new_balance,
        "updated_at": _now_iso(),
        "marketing_status": "active",
    }
    if is_first:
        updates["first_recharge_at"] = _now_iso()

    await _db.wallets.update_one({"salon_id": salon_id}, {"$set": updates})
    await _insert_ledger(
        salon_id=salon_id, type_="topup", channel=None,
        amount_minor=credit_amount, balance_after_minor=new_balance,
        ref=result.provider_order_id, note="Cashfree top-up",
    )

    await _db.payment_orders.update_one(
        {"provider_order_id": result.provider_order_id},
        {"$set": {"status": "credited", "credited_at": _now_iso(), "reference_id": result.reference_id},
         "$push": {"event_history": {"event": "credited", "at": _now_iso(), "reference_id": result.reference_id}}}
    )
    return {"ok": True}


# ========================================================
# POST /api/salons/{salon_id}/wallet/simulate-credit  (DEV ONLY — bypasses PG)
# ========================================================

class SimulateCreditIn(BaseModel):
    provider_order_id: str
    amount_minor: Optional[int] = None


@settings_router.post("/salons/{salon_id}/wallet/simulate-credit")
async def simulate_credit(salon_id: str, body: SimulateCreditIn, request: Request):
    """Dev-only helper — pretends a Cashfree webhook fired for the given order id.
    Never enabled in production (CASHFREE_ENV=production disables this)."""
    user = await _require_admin(request)
    _assert_salon_scope(user, salon_id)
    if (os.environ.get("CASHFREE_ENV") or "sandbox").lower() == "production":
        raise HTTPException(status_code=403, detail="simulate-credit is disabled in production")

    order = await _db.payment_orders.find_one({"provider_order_id": body.provider_order_id, "salon_id": salon_id})
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if order.get("status") == "credited":
        return {"ok": True, "idempotent": True}

    amount = int(body.amount_minor or order.get("amount_minor") or 0)
    if amount <= 0:
        raise HTTPException(status_code=400, detail="amount_minor missing")

    wallet = await _get_or_create_wallet(salon_id)
    new_balance = int(wallet.get("balance_minor") or 0) + amount
    is_first = wallet.get("first_recharge_at") is None
    updates = {"balance_minor": new_balance, "updated_at": _now_iso(), "marketing_status": "active"}
    if is_first:
        updates["first_recharge_at"] = _now_iso()

    await _db.wallets.update_one({"salon_id": salon_id}, {"$set": updates})
    await _insert_ledger(
        salon_id=salon_id, type_="topup", channel=None,
        amount_minor=amount, balance_after_minor=new_balance,
        ref=body.provider_order_id, note="Simulated top-up (dev)",
    )
    await _db.payment_orders.update_one(
        {"provider_order_id": body.provider_order_id},
        {"$set": {"status": "credited", "credited_at": _now_iso()},
         "$push": {"event_history": {"event": "credited-simulated", "at": _now_iso()}}}
    )
    return {"ok": True, "balance_minor": new_balance}


# ========================================================
# POST /api/salons/{salon_id}/wallet/auto-recharge  (config only)
# ========================================================

class AutoRechargeIn(BaseModel):
    auto_recharge: bool
    recharge_threshold_minor: int = Field(default=0, ge=0)
    recharge_amount_minor: int = Field(default=0, ge=0)
    low_balance_alert_minor: Optional[int] = None


@settings_router.post("/salons/{salon_id}/wallet/auto-recharge")
async def save_auto_recharge(salon_id: str, body: AutoRechargeIn, request: Request):
    user = await _require_admin(request)
    _assert_salon_scope(user, salon_id)
    await _get_or_create_wallet(salon_id)
    updates = {
        "auto_recharge": bool(body.auto_recharge),
        "recharge_threshold_minor": int(body.recharge_threshold_minor),
        "recharge_amount_minor": int(body.recharge_amount_minor),
        "updated_at": _now_iso(),
    }
    if body.low_balance_alert_minor is not None:
        updates["low_balance_alert_minor"] = int(body.low_balance_alert_minor)
    await _db.wallets.update_one({"salon_id": salon_id}, {"$set": updates})
    return {"ok": True, **updates}


# ========================================================
# POST /api/salons/{salon_id}/marketing/settings/waba/embedded-signup-complete
# ========================================================

class ESCompleteIn(BaseModel):
    waba_id: str
    phone: str
    display_name: Optional[str] = None


@settings_router.post("/salons/{salon_id}/marketing/settings/waba/embedded-signup-complete")
async def embedded_signup_complete(salon_id: str, body: ESCompleteIn, request: Request):
    """Called by the frontend once Meta's Embedded Signup returns a waba_id +
    phone. Real path: our backend then (a) creates a Twilio sub-account for
    the salon if not present, (b) registers the sender via Twilio Senders API,
    (c) polls status. With DUMMY credentials this stub records the intent."""
    user = await _require_admin(request)
    _assert_salon_scope(user, salon_id)

    now = _now_iso()
    existing = await _db.twilio_subaccounts.find_one({"salon_id": salon_id})
    friendly_name = f"Sub-{salon_id[:8]}"
    # DUMMY: fake sub-account SID so UI has something to render.
    subaccount_sid = (existing or {}).get("subaccount_sid") or f"ACsub_{uuid.uuid4().hex[:16]}"

    payload = {
        "salon_id": salon_id,
        "subaccount_sid": subaccount_sid,
        "friendly_name": friendly_name,
        "waba_id": body.waba_id,
        "sender_phone_e164": body.phone,
        "messaging_service_sid": os.environ.get("TWILIO_WHATSAPP_MESSAGING_SERVICE_SID"),
        "display_name": body.display_name or friendly_name,
        "quality_rating": "GREEN",
        "messaging_tier": "TIER_1K",
        "sender_status": "online",
        "updated_at": now,
    }
    await _db.twilio_subaccounts.update_one(
        {"salon_id": salon_id},
        {"$set": payload, "$setOnInsert": {"created_at": now}},
        upsert=True,
    )
    return {"ok": True, **payload}


# ========================================================
# POST /api/salons/{salon_id}/marketing/settings/waba/sync
# ========================================================

@settings_router.post("/salons/{salon_id}/marketing/settings/waba/sync")
async def waba_sync(salon_id: str, request: Request):
    """Poll Twilio for the sender status. With DUMMY credentials we just bump
    the updated_at timestamp so the UI shows the sync happened."""
    user = await _require_admin(request)
    _assert_salon_scope(user, salon_id)
    doc = await _db.twilio_subaccounts.find_one({"salon_id": salon_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Sub-account not configured yet")
    await _db.twilio_subaccounts.update_one(
        {"salon_id": salon_id}, {"$set": {"updated_at": _now_iso()}}
    )
    return _clean({**doc, "updated_at": _now_iso()})


# ========================================================
# POST /api/salons/{salon_id}/marketing/settings/usage-sync
# ========================================================

@settings_router.post("/salons/{salon_id}/marketing/settings/usage-sync")
async def usage_sync_manual(salon_id: str, request: Request):
    """On-demand refresh of Twilio Usage Records for this salon's sub-account.
    With DUMMY credentials we produce a small MOCK entry so the UI shows the
    'synced N min ago' state and channel-breakdown bars render."""
    user = await _require_admin(request)
    _assert_salon_scope(user, salon_id)

    subaccount = await _db.twilio_subaccounts.find_one({"salon_id": salon_id})
    if not subaccount:
        raise HTTPException(status_code=400, detail="Connect WhatsApp sender first")

    # ---- MOCK sync (no real Twilio call yet) ----
    now = datetime.now(timezone.utc)
    today = now.strftime("%Y-%m-%d")
    # Count today's outbound WhatsApp messages recorded in our own logs.
    wa_count = await _db.marketing_messages.count_documents({"salon_id": salon_id})
    # Assume ₹0.85 per WhatsApp utility message (Twilio + Meta) for the placeholder.
    per_msg_minor = 85
    cost_minor = wa_count * per_msg_minor

    await _db.usage_sync.update_one(
        {"salon_id": salon_id, "period_date": today, "category": "whatsapp"},
        {"$set": {
            "salon_id": salon_id,
            "subaccount_sid": subaccount.get("subaccount_sid"),
            "period_date": today,
            "category": "whatsapp",
            "count": wa_count,
            "twilio_cost_minor": cost_minor,
            "billed_cost_minor": cost_minor,   # pass-through, no margin
            "synced_at": _now_iso(),
        }},
        upsert=True,
    )

    return {
        "synced_at": _now_iso(),
        "records_updated": 1,
        "detail": "MOCKED — DUMMY Twilio credentials. Real Usage Records API call goes here.",
    }


# ========================================================
# POST /api/salons/{salon_id}/marketing/settings/dlt
# ========================================================

class DLTConfigIn(BaseModel):
    entity_id: str
    sender_header: str
    provider: Optional[str] = None
    template_dlt_ids: Optional[List[str]] = None


@settings_router.post("/salons/{salon_id}/marketing/settings/dlt")
async def save_dlt(salon_id: str, body: DLTConfigIn, request: Request):
    user = await _require_admin(request)
    _assert_salon_scope(user, salon_id)
    payload = {**body.model_dump(), "salon_id": salon_id, "registered": True, "updated_at": _now_iso()}
    await _db.dlt_config.update_one(
        {"salon_id": salon_id}, {"$set": payload, "$setOnInsert": {"created_at": _now_iso()}}, upsert=True,
    )
    return _clean(payload)


# ========================================================
# POST /api/salons/{salon_id}/marketing/settings/email
# ========================================================

class EmailSenderIn(BaseModel):
    from_name: str
    from_email: str
    reply_to: Optional[str] = None


@settings_router.post("/salons/{salon_id}/marketing/settings/email")
async def save_email_sender(salon_id: str, body: EmailSenderIn, request: Request):
    user = await _require_admin(request)
    _assert_salon_scope(user, salon_id)
    payload = {
        **body.model_dump(),
        "salon_id": salon_id,
        "verified": True,   # MOCKED until real provider verification lands
        "updated_at": _now_iso(),
    }
    await _db.email_sender.update_one(
        {"salon_id": salon_id}, {"$set": payload, "$setOnInsert": {"created_at": _now_iso()}}, upsert=True,
    )
    return _clean(payload)


# ========================================================
# POST /api/salons/{salon_id}/marketing/settings/sending-windows
# ========================================================

class SendingWindowsIn(BaseModel):
    window_start: str = "10:00"
    window_end: str = "21:00"
    quiet_start: str = "22:00"
    quiet_end: str = "09:00"
    optout_keyword: str = "STOP"
    require_optin: bool = True
    per_guest_cap_per_week: int = 3


@settings_router.post("/salons/{salon_id}/marketing/settings/sending-windows")
async def save_sending_windows(salon_id: str, body: SendingWindowsIn, request: Request):
    user = await _require_admin(request)
    _assert_salon_scope(user, salon_id)
    payload = {**body.model_dump(), "salon_id": salon_id, "updated_at": _now_iso()}
    await _db.send_settings.update_one(
        {"salon_id": salon_id}, {"$set": payload, "$setOnInsert": {"created_at": _now_iso()}}, upsert=True,
    )
    return _clean(payload)
