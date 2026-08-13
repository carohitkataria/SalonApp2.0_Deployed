"""WS3 — Per-salon WhatsApp sender (Twilio) configuration endpoints.

The platform always authenticates as ONE Twilio account. "Sending as the salon"
only means passing a different registered sender on each API call. These
endpoints let the salon REQUEST its own number and let the PLATFORM OWNER paste
the salon's Messaging Service SID (or sender number) and flip it live with a
single toggle — routing then goes live instantly because every send already
runs through ``twilio_service.resolve_sender``.

Salon document shape (``salons.whatsapp``):
    {
      "mode": "platform" | "own",           # default "platform"
      "messaging_service_sid": "MG...",      # preferred routing
      "sender_number": "+9198XXXXXXXX",      # fallback if no messaging service
      "status": "none" | "pending" | "active",
      "own_waba": false,                     # True => needs its own template SIDs
      "template_overrides": {},              # name -> content SID (future-proof)
      "business_name": "...",                # captured on request
      "requested_number": "+91...",          # captured on request
      "requested_at": iso, "activated_at": iso, "updated_at": iso
    }
"""
import os
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

whatsapp_sender_router = APIRouter(prefix="/api", tags=["whatsapp-sender"])

_db = None
_require_user = None
_require_admin = None
_assert_salon_scope = None


def init_whatsapp_sender_router(*, db, require_user, require_admin, assert_salon_scope):
    global _db, _require_user, _require_admin, _assert_salon_scope
    _db = db
    _require_user = require_user
    _require_admin = require_admin
    _assert_salon_scope = assert_salon_scope


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _is_owner(user: Dict[str, Any]) -> bool:
    return (user or {}).get("role") == "platform_admin"


async def _require_owner(request: Request) -> Dict[str, Any]:
    user = await _require_admin(request)
    if not _is_owner(user):
        raise HTTPException(status_code=403, detail="Platform owner access required")
    return user


DEFAULT_WA = {
    "mode": "platform",
    "messaging_service_sid": None,
    "sender_number": None,
    "status": "none",
    "own_waba": False,
    "template_overrides": {},
    "business_name": None,
    "requested_number": None,
}


def _describe(wa: Dict[str, Any]) -> Dict[str, str]:
    """Return plain-language sender + status pill for the UI."""
    platform_from = os.environ.get("TWILIO_WHATSAPP_NUMBER", "")
    platform_display = platform_from.replace("whatsapp:", "") if platform_from else "SalonHub default number"
    status = wa.get("status") or "none"
    if wa.get("mode") == "own" and status == "active":
        num = wa.get("sender_number") or ""
        sending_from = f"your own number {num}" if num else "your own registered sender"
    else:
        sending_from = "SalonHub default number"
    pill = {"none": "Not set up", "pending": "Pending verification", "active": "Active"}.get(status, "Not set up")
    return {
        "sending_from": sending_from,
        "status_pill": pill,
        "platform_number": platform_display,
    }


async def _get_wa(salon_id: str) -> Dict[str, Any]:
    salon = await _db.salons.find_one({"id": salon_id}, {"_id": 0, "id": 1, "whatsapp": 1})
    if salon is None:
        raise HTTPException(status_code=404, detail="Salon not found")
    wa = {**DEFAULT_WA, **(salon.get("whatsapp") or {})}
    return wa


# ========================================================
# GET current sender config
# ========================================================
@whatsapp_sender_router.get("/salons/{salon_id}/whatsapp-sender")
async def get_whatsapp_sender(salon_id: str, request: Request):
    user = await _require_user(request)
    _assert_salon_scope(user, salon_id)
    wa = await _get_wa(salon_id)
    return {
        "salon_id": salon_id,
        "whatsapp": wa,
        "describe": _describe(wa),
        "is_owner": _is_owner(user),
    }


# ========================================================
# POST salon-facing request to use own number
# ========================================================
class RequestOwnIn(BaseModel):
    sender_number: str = Field(..., min_length=8, max_length=20)
    business_name: str = Field(..., min_length=2, max_length=120)


@whatsapp_sender_router.post("/salons/{salon_id}/whatsapp-sender/request")
async def request_own_sender(salon_id: str, body: RequestOwnIn, request: Request):
    user = await _require_admin(request)
    _assert_salon_scope(user, salon_id)
    num = body.sender_number.strip()
    if not num.startswith("+"):
        num = "+" + num.lstrip("0")
    wa = await _get_wa(salon_id)
    wa.update({
        "requested_number": num,
        "business_name": body.business_name.strip(),
        "status": "pending",
        "requested_at": _now_iso(),
        "updated_at": _now_iso(),
    })
    await _db.salons.update_one({"id": salon_id}, {"$set": {"whatsapp": wa}})

    # Notify the platform owner (manual-onboarding trigger).
    try:
        salon = await _db.salons.find_one({"id": salon_id}, {"_id": 0, "salon_name": 1, "name": 1})
        salon_name = (salon or {}).get("salon_name") or (salon or {}).get("name") or salon_id
        await _db.owner_notifications.insert_one({
            "id": str(uuid.uuid4()),
            "type": "whatsapp_sender_request",
            "salon_id": salon_id,
            "salon_name": salon_name,
            "sender_number": num,
            "business_name": body.business_name.strip(),
            "read": False,
            "created_at": _now_iso(),
        })
    except Exception:
        pass
    return {"ok": True, "whatsapp": wa, "describe": _describe(wa)}


# ========================================================
# PUT owner-only config (paste MG SID / sender number)
# ========================================================
class OwnerConfigIn(BaseModel):
    messaging_service_sid: Optional[str] = None
    sender_number: Optional[str] = None
    mode: Optional[str] = None          # "platform" | "own"
    own_waba: Optional[bool] = None
    template_overrides: Optional[Dict[str, str]] = None


@whatsapp_sender_router.put("/salons/{salon_id}/whatsapp-sender/config")
async def owner_set_config(salon_id: str, body: OwnerConfigIn, request: Request):
    await _require_owner(request)
    wa = await _get_wa(salon_id)
    if body.messaging_service_sid is not None:
        wa["messaging_service_sid"] = body.messaging_service_sid.strip() or None
    if body.sender_number is not None:
        num = body.sender_number.strip()
        if num and not num.startswith("+"):
            num = "+" + num.lstrip("0")
        wa["sender_number"] = num or None
    if body.mode in ("platform", "own"):
        wa["mode"] = body.mode
    if body.own_waba is not None:
        wa["own_waba"] = bool(body.own_waba)
    if body.template_overrides is not None:
        wa["template_overrides"] = body.template_overrides
    wa["updated_at"] = _now_iso()
    await _db.salons.update_one({"id": salon_id}, {"$set": {"whatsapp": wa}})
    return {"ok": True, "whatsapp": wa, "describe": _describe(wa)}


# ========================================================
# POST owner-only activate / deactivate toggle
# ========================================================
class ActivateIn(BaseModel):
    active: bool


@whatsapp_sender_router.post("/salons/{salon_id}/whatsapp-sender/activate")
async def owner_activate(salon_id: str, body: ActivateIn, request: Request):
    await _require_owner(request)
    wa = await _get_wa(salon_id)
    if body.active:
        if not wa.get("messaging_service_sid") and not wa.get("sender_number"):
            raise HTTPException(
                status_code=400,
                detail="Set a Messaging Service SID or sender number before activating.",
            )
        wa["mode"] = "own"
        wa["status"] = "active"
        wa["activated_at"] = _now_iso()
    else:
        wa["mode"] = "platform"
        wa["status"] = "none"
    wa["updated_at"] = _now_iso()
    await _db.salons.update_one({"id": salon_id}, {"$set": {"whatsapp": wa}})
    return {"ok": True, "whatsapp": wa, "describe": _describe(wa)}


# ========================================================
# POST owner-only send test message
# ========================================================
class TestSendIn(BaseModel):
    to: str = Field(..., min_length=8, max_length=20)


@whatsapp_sender_router.post("/salons/{salon_id}/whatsapp-sender/test")
async def owner_send_test(salon_id: str, body: TestSendIn, request: Request):
    await _require_owner(request)
    salon = await _db.salons.find_one({"id": salon_id}, {"_id": 0})
    if not salon:
        raise HTTPException(status_code=404, detail="Salon not found")
    to = body.to.strip()
    if not to.startswith("+"):
        to = "+" + to.lstrip("0")

    from twilio_service import send_your_turn_now_template
    salon_name = salon.get("salon_name") or salon.get("name") or "Your salon"
    result = await send_your_turn_now_template(
        phone_number=to,
        customer_name="Owner Test",
        salon_name=salon_name,
        barber_name="Test",
        token_number="0",
        salon=salon,
    )
    return {"ok": result.get("status") in ("sent", "mock"), "result": result}
