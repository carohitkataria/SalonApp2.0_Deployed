"""
Platform Admin module — Phase 1 of the master build.

Implements:
  - `platform_admins` collection model
  - Bootstrap of the first platform owner from env var PLATFORM_OWNER_MOBILE
  - OTP request / verify endpoints (reuses existing salon WhatsApp OTP service)
  - `get_current_platform_admin` dependency for protected routes
  - `/api/platform/auth/me` to fetch the logged-in admin profile

Login route on the frontend is intentionally hidden: bookmark `/platform/login`.
"""

from __future__ import annotations

import logging
import os
import secrets
import string
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

import jwt
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from passlib.context import CryptContext
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

# These are injected by server.py via `init_platform_admin_router(...)` below.
_db = None
_send_whatsapp_otp = None  # async callable(phone, otp) -> dict
_otp_is_valid = None       # async callable(phone, code, db_collection) -> bool
_secret_key: str = "change-me"
_algorithm: str = "HS256"

# Password hashing — bcrypt, matches the pattern in supplier_auth.py & server.py
_pwd = CryptContext(schemes=["bcrypt"], deprecated="auto")

# Brute force protection (in-memory; resets on backend restart, which is OK for
# admin login since attempts are rare).  After MAX_FAILS within WINDOW_SEC, the
# mobile is locked out for LOCKOUT_SEC.
_FAIL_BUCKET: dict = {}
_FAIL_MAX = 5
_FAIL_WINDOW_SEC = 15 * 60
_LOCKOUT_SEC = 15 * 60

def _record_fail(mobile: str):
    now = datetime.now(timezone.utc).timestamp()
    bucket = _FAIL_BUCKET.setdefault(mobile, {"count": 0, "first": now, "locked_until": 0})
    if now - bucket["first"] > _FAIL_WINDOW_SEC:
        bucket["count"] = 0
        bucket["first"] = now
    bucket["count"] += 1
    if bucket["count"] >= _FAIL_MAX:
        bucket["locked_until"] = now + _LOCKOUT_SEC

def _check_lockout(mobile: str):
    now = datetime.now(timezone.utc).timestamp()
    bucket = _FAIL_BUCKET.get(mobile)
    if bucket and bucket.get("locked_until", 0) > now:
        wait_sec = int(bucket["locked_until"] - now)
        raise HTTPException(
            status_code=429,
            detail=f"Too many failed attempts. Try again in {wait_sec // 60 + 1} minute(s).",
        )

def _clear_fails(mobile: str):
    _FAIL_BUCKET.pop(mobile, None)

platform_router = APIRouter(prefix="/api/platform", tags=["platform-admin"])
_security = HTTPBearer()


# ---------- Models ----------

class PlatformAdmin(BaseModel):
    id: str
    mobile: str
    name: Optional[str] = None
    email: Optional[str] = None
    is_owner: bool = False
    can_be_deleted: bool = True
    status: str = "active"  # active | suspended
    invited_by: Optional[str] = None
    last_login_at: Optional[str] = None
    created_at: str
    updated_at: Optional[str] = None


class OTPRequest(BaseModel):
    mobile: str = Field(..., description="10-digit mobile or +91XXXXXXXXXX")


class OTPVerify(BaseModel):
    mobile: str
    otp: str


class PlatformPasswordLogin(BaseModel):
    mobile: str
    password: str


class PlatformSetPassword(BaseModel):
    mobile: str
    otp: str
    new_password: str


# ---------- Helpers ----------

def _normalize_mobile(raw: str) -> str:
    """Return E.164-ish form '+91XXXXXXXXXX'."""
    digits = "".join(c for c in (raw or "") if c.isdigit())
    if digits.startswith("91") and len(digits) == 12:
        digits = digits[2:]
    if len(digits) != 10:
        raise HTTPException(status_code=400, detail="Invalid mobile number")
    return f"+91{digits}"


def _generate_otp() -> str:
    # Use secrets for cryptographically secure OTP generation
    return "".join(secrets.choice(string.digits) for _ in range(6))


def _make_access_token(admin_doc: dict) -> str:
    payload = {
        "role": "platform_admin",
        "platform_admin_id": admin_doc["id"],
        "mobile": admin_doc["mobile"],
        "is_owner": bool(admin_doc.get("is_owner")),
        "iat": int(datetime.now(timezone.utc).timestamp()),
        "exp": int((datetime.now(timezone.utc) + timedelta(days=30)).timestamp()),
    }
    return jwt.encode(payload, _secret_key, algorithm=_algorithm)


def _decode_token(token: str) -> Optional[dict]:
    try:
        return jwt.decode(token, _secret_key, algorithms=[_algorithm])
    except jwt.InvalidTokenError:
        return None


# ---------- Auth dependency ----------

async def get_current_platform_admin(
    creds: HTTPAuthorizationCredentials = Depends(_security),
) -> dict:
    """JWT auth dependency for platform admin routes."""
    payload = _decode_token(creds.credentials)
    if not payload or payload.get("role") != "platform_admin":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid platform admin token",
        )
    admin = await _db.platform_admins.find_one(
        {"id": payload["platform_admin_id"]}, {"_id": 0}
    )
    if not admin:
        raise HTTPException(status_code=401, detail="Platform admin no longer exists")
    if admin.get("status") != "active":
        raise HTTPException(status_code=403, detail="Platform admin is suspended")
    return admin


# ---------- Bootstrap ----------

async def bootstrap_platform_owner():
    """
    Idempotently seed the platform owner from PLATFORM_OWNER_MOBILE.
    Runs every startup. Safe if already present.
    """
    raw_mobile = os.environ.get("PLATFORM_OWNER_MOBILE")
    if not raw_mobile:
        logger.warning(
            "[Platform Admin] PLATFORM_OWNER_MOBILE not set — owner bootstrap skipped."
        )
        return None

    try:
        mobile = _normalize_mobile(raw_mobile)
    except HTTPException as e:
        logger.error(f"[Platform Admin] Invalid PLATFORM_OWNER_MOBILE: {e.detail}")
        return None

    existing_owner = await _db.platform_admins.find_one({"is_owner": True}, {"_id": 0})
    if existing_owner:
        # Repair: ensure the owner's mobile matches env (in case it was changed)
        # but never demote / never auto-delete.
        if existing_owner["mobile"] != mobile:
            logger.info(
                f"[Platform Admin] Owner mobile in DB ({existing_owner['mobile']}) "
                f"differs from env ({mobile}). Leaving DB record untouched."
            )
        return existing_owner

    # No owner yet — create one.
    now_iso = datetime.now(timezone.utc).isoformat()
    owner_doc = {
        "id": str(uuid.uuid4()),
        "mobile": mobile,
        "name": os.environ.get("PLATFORM_OWNER_NAME", "Platform Owner"),
        "email": os.environ.get("PLATFORM_OWNER_EMAIL"),
        "is_owner": True,
        "can_be_deleted": False,
        "status": "active",
        "invited_by": None,
        "last_login_at": None,
        "created_at": now_iso,
        "updated_at": now_iso,
    }
    await _db.platform_admins.insert_one(owner_doc.copy())
    logger.info(
        f"[Platform Admin] Bootstrapped platform owner with mobile {mobile}"
    )
    return owner_doc


def init_platform_admin_router(*, db, send_whatsapp_otp, otp_is_valid, secret_key: str, algorithm: str = "HS256"):
    """Called by server.py at import time to inject shared dependencies."""
    global _db, _send_whatsapp_otp, _otp_is_valid, _secret_key, _algorithm
    _db = db
    _send_whatsapp_otp = send_whatsapp_otp
    _otp_is_valid = otp_is_valid
    _secret_key = secret_key
    _algorithm = algorithm
    return platform_router


# ---------- Endpoints ----------

@platform_router.post("/auth/request-otp")
async def platform_request_otp(payload: OTPRequest):
    """
    Send a 6-digit OTP via SMS.

    Security: We do NOT reveal whether the mobile is registered as a platform
    admin. The response is identical whether or not the number maps to one.

    Self-heal: the configured PLATFORM_OWNER_MOBILE auto-seeds itself the first
    time it requests an OTP, in case the startup bootstrap was skipped.
    """
    mobile = _normalize_mobile(payload.mobile)
    admin = await _db.platform_admins.find_one(
        {"mobile": mobile, "status": "active"}, {"_id": 0}
    )

    # Self-heal the configured owner if startup bootstrap didn't run.
    if not admin:
        owner_env = os.environ.get("PLATFORM_OWNER_MOBILE")
        if owner_env:
            try:
                if _normalize_mobile(owner_env) == mobile:
                    await bootstrap_platform_owner()
                    admin = await _db.platform_admins.find_one(
                        {"mobile": mobile, "status": "active"}, {"_id": 0}
                    )
            except HTTPException:
                pass

    otp = _generate_otp()
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=10)

    await _db.platform_otp.delete_many({"mobile": mobile})
    await _db.platform_otp.insert_one(
        {
            "mobile": mobile,
            "phone": mobile,  # so the shared dev OTP validator fallback works
            "otp": otp,
            "expires_at": expires_at.isoformat(),
            "verified": False,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
    )

    response: dict = {
        "message": "If this number is registered as a platform admin, an OTP has been sent via SMS.",
        "delivery_status": "sent",
    }

    if admin:
        sms_result = await _send_whatsapp_otp(mobile, otp)
        response["delivery_status"] = sms_result.get("status", "sent")
        if sms_result.get("status") in ("mock", "failed"):
            # OTP is never returned in the response. It is logged server-side
            # for support/debugging only.
            logger.warning(f"[Platform Admin] OTP for {mobile} (status={sms_result.get('status')}): {otp}")
            response["note"] = (
                "Messaging not configured. Please contact support."
                if sms_result.get("status") == "mock"
                else "SMS delivery failed. Please try again."
            )
    else:
        # Do not actually send SMS for unknown numbers, but keep timing similar.
        logger.info(f"[Platform Admin] OTP request for unknown mobile {mobile}")

    return response


@platform_router.post("/auth/set-password")
async def platform_set_password(payload: PlatformSetPassword):
    """First-time or forgot-password flow.  Requires a valid OTP for the mobile."""
    mobile = _normalize_mobile(payload.mobile)
    pw = (payload.new_password or "").strip()
    if len(pw) < 6:
        raise HTTPException(status_code=400, detail="Password must be at least 6 characters")
    ok = await _otp_is_valid(mobile, (payload.otp or "").strip(), _db.platform_otp)
    if not ok:
        raise HTTPException(status_code=401, detail="Invalid or expired OTP")
    admin = await _db.platform_admins.find_one(
        {"mobile": mobile, "status": "active"}, {"_id": 0}
    )
    if not admin:
        raise HTTPException(status_code=401, detail="Not a platform admin")
    await _db.platform_otp.delete_many({"mobile": mobile})
    now_iso = datetime.now(timezone.utc).isoformat()
    await _db.platform_admins.update_one(
        {"id": admin["id"]},
        {"$set": {
            "password_hash": _pwd.hash(pw),
            "password_set_at": now_iso,
            "updated_at": now_iso,
        }},
    )
    _clear_fails(mobile)
    return {"success": True}


@platform_router.post("/auth/login-password")
async def platform_login_password(payload: PlatformPasswordLogin):
    """Mobile + password login.  Returns a JWT (30-day expiry) just like OTP login."""
    mobile = _normalize_mobile(payload.mobile)
    _check_lockout(mobile)
    invalid = HTTPException(status_code=401, detail="Invalid mobile or password")

    admin = await _db.platform_admins.find_one(
        {"mobile": mobile, "status": "active"}, {"_id": 0}
    )
    if not admin or not admin.get("password_hash"):
        _record_fail(mobile)
        raise invalid
    try:
        if not _pwd.verify((payload.password or "").strip(), admin["password_hash"]):
            _record_fail(mobile)
            raise invalid
    except Exception:
        _record_fail(mobile)
        raise invalid

    _clear_fails(mobile)
    now_iso = datetime.now(timezone.utc).isoformat()
    await _db.platform_admins.update_one(
        {"id": admin["id"]},
        {"$set": {"last_login_at": now_iso, "updated_at": now_iso}},
    )
    return {
        "access_token": _make_access_token(admin),
        "token_type": "bearer",
        "admin": {
            "id": admin["id"],
            "mobile": admin["mobile"],
            "name": admin.get("name"),
            "email": admin.get("email"),
            "is_owner": bool(admin.get("is_owner")),
        },
    }


@platform_router.post("/auth/verify-otp")
async def platform_verify_otp(payload: OTPVerify):
    mobile = _normalize_mobile(payload.mobile)

    # Generic 401 for either missing admin or bad OTP — no enumeration.
    invalid = HTTPException(
        status_code=401, detail="Invalid mobile or OTP. Please try again."
    )

    # Production: Twilio Verify.  Mock/dev: db.platform_otp.
    ok = await _otp_is_valid(mobile, (payload.otp or "").strip(), _db.platform_otp)
    if not ok:
        raise invalid

    admin = await _db.platform_admins.find_one(
        {"mobile": mobile, "status": "active"}, {"_id": 0}
    )
    if not admin:
        # OTP matches our stored value but no admin — still invalid.
        await _db.platform_otp.delete_one({"mobile": mobile})
        raise invalid

    # Clean up + update last_login_at
    await _db.platform_otp.delete_one({"mobile": mobile})
    now_iso = datetime.now(timezone.utc).isoformat()
    await _db.platform_admins.update_one(
        {"id": admin["id"]},
        {"$set": {"last_login_at": now_iso, "updated_at": now_iso}},
    )
    admin["last_login_at"] = now_iso

    token = _make_access_token(admin)

    return {
        "access_token": token,
        "token_type": "bearer",
        "admin": {
            "id": admin["id"],
            "mobile": admin["mobile"],
            "name": admin.get("name"),
            "email": admin.get("email"),
            "is_owner": bool(admin.get("is_owner")),
        },
    }


@platform_router.get("/auth/me")
async def platform_me(current=Depends(get_current_platform_admin)):
    """Return the authenticated platform admin's profile."""
    return {
        "id": current["id"],
        "mobile": current["mobile"],
        "name": current.get("name"),
        "email": current.get("email"),
        "is_owner": bool(current.get("is_owner")),
        "can_be_deleted": bool(current.get("can_be_deleted", True)),
        "status": current.get("status", "active"),
        "last_login_at": current.get("last_login_at"),
        "created_at": current.get("created_at"),
    }
