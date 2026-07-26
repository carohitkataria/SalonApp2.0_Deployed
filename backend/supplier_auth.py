"""
Phase 8 (Part B) — Supplier role + Signup + Auth.

Endpoints:
  POST /api/supplier/signup                — create supplier with status="pending_approval"
  POST /api/supplier/auth/request-otp      — send OTP via WhatsApp
  POST /api/supplier/auth/verify-otp       — login with OTP, return JWT
  POST /api/supplier/auth/password-login   — login with mobile + password
  GET  /api/supplier/me                    — current supplier profile
  PUT  /api/supplier/me                    — update editable fields

Status gating: any login attempt where supplier.status != "active" returns 403
with the actual status in the detail so the frontend can route to /supplier/pending.
"""

from __future__ import annotations

import logging
import secrets
import re
import string
import uuid
from datetime import datetime, timedelta, timezone
from typing import List, Optional

import jwt
from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from passlib.context import CryptContext
from pydantic import BaseModel, Field, field_validator

logger = logging.getLogger(__name__)

# Dependencies injected by init_supplier_auth_router(...)
_db = None
_send_whatsapp_otp = None  # async callable(phone, otp) -> dict
_secret_key: str = "change-me"
_algorithm: str = "HS256"

supplier_auth_router = APIRouter(prefix="/api/supplier", tags=["supplier-auth"])
_security = HTTPBearer()
_pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

ALLOWED_STATUSES = {"pending_approval", "active", "rejected", "suspended"}


# ---------- Models ----------

class BankDetails(BaseModel):
    account_no: str = Field(..., min_length=4, max_length=30)
    ifsc: str = Field(..., min_length=4, max_length=15)
    account_holder: str = Field(..., min_length=2, max_length=100)


class SupplierSignupRequest(BaseModel):
    # Login credentials
    mobile: str = Field(..., description="10-digit mobile or +91XXXXXXXXXX")
    password: str = Field(..., min_length=6, max_length=72)

    # Business details
    business_name: str = Field(..., min_length=2, max_length=140)
    owner_name: str = Field(..., min_length=2, max_length=100)
    gst_number: Optional[str] = Field(default=None, max_length=20)
    pan_number: Optional[str] = Field(default=None, max_length=20)

    # Address
    address: Optional[str] = Field(default=None, max_length=500)
    city: Optional[str] = Field(default=None, max_length=100)
    state: Optional[str] = Field(default=None, max_length=100)
    pincode: Optional[str] = Field(default=None, max_length=10)
    email: Optional[str] = Field(default=None, max_length=200)

    # Categories
    category_tags: List[str] = Field(default_factory=list)

    # Bank (optional at signup since spec says non-mandatory for testing)
    bank_details: Optional[BankDetails] = None

    @field_validator("password")
    @classmethod
    def password_strong(cls, v: str) -> str:
        if len(v) < 6:
            raise ValueError("password must be at least 6 characters")
        return v


class SupplierUpdateRequest(BaseModel):
    business_name: Optional[str] = None
    owner_name: Optional[str] = None
    gst_number: Optional[str] = None
    pan_number: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    pincode: Optional[str] = None
    email: Optional[str] = None
    category_tags: Optional[List[str]] = None
    bank_details: Optional[BankDetails] = None


class OTPRequest(BaseModel):
    mobile: str


class OTPVerify(BaseModel):
    mobile: str
    otp: str


class PasswordLogin(BaseModel):
    mobile: str
    password: str


# ---------- Helpers ----------

def _normalize_mobile(raw: str) -> str:
    digits = "".join(c for c in (raw or "") if c.isdigit())
    if digits.startswith("91") and len(digits) == 12:
        digits = digits[2:]
    if len(digits) != 10:
        raise HTTPException(status_code=400, detail="Invalid mobile number")
    return f"+91{digits}"


def _generate_otp() -> str:
    # Use secrets for cryptographically secure OTP generation
    return "".join(secrets.choice(string.digits) for _ in range(6))


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _make_access_token(supplier_doc: dict) -> str:
    payload = {
        "role": "supplier",
        "supplier_id": supplier_doc["id"],
        "mobile": supplier_doc["mobile"],
        "iat": int(datetime.now(timezone.utc).timestamp()),
        "exp": int((datetime.now(timezone.utc) + timedelta(days=30)).timestamp()),
    }
    return jwt.encode(payload, _secret_key, algorithm=_algorithm)


def _decode_token(token: str) -> Optional[dict]:
    try:
        return jwt.decode(token, _secret_key, algorithms=[_algorithm])
    except jwt.InvalidTokenError:
        return None


def _strip_sensitive(doc: dict) -> dict:
    """Remove password hash + internal-only fields before returning to client."""
    if not doc:
        return doc
    out = {k: v for k, v in doc.items() if k != "password_hash" and not k.startswith("_")}
    return out


def _gate_login_status(supplier: dict) -> None:
    """Raise 403 if supplier is not active, with status info for frontend routing."""
    st = supplier.get("status") or "pending_approval"
    if st == "active":
        return
    # 403 with structured detail for the frontend to navigate to /supplier/pending
    raise HTTPException(
        status_code=403,
        detail={
            "code": "supplier_not_active",
            "status": st,
            "rejection_reason": supplier.get("rejection_reason"),
            "message": {
                "pending_approval": "Your supplier account is under review.",
                "rejected": "Your supplier signup was rejected.",
                "suspended": "Your supplier account has been suspended.",
            }.get(st, "Your supplier account is not active."),
        },
    )


async def require_supplier(creds: HTTPAuthorizationCredentials = Depends(_security)) -> dict:
    """FastAPI dependency to get current authenticated supplier from JWT."""
    token = creds.credentials
    decoded = _decode_token(token)
    if not decoded or decoded.get("role") != "supplier":
        raise HTTPException(status_code=401, detail="Invalid supplier session")
    supplier_id = decoded.get("supplier_id")
    if not supplier_id:
        raise HTTPException(status_code=401, detail="Invalid supplier session")
    supplier = await _db.suppliers.find_one({"id": supplier_id}, {"_id": 0})
    if not supplier:
        raise HTTPException(status_code=401, detail="Supplier no longer exists")
    # If suspended/rejected after login, reject here too.
    _gate_login_status(supplier)
    return supplier


# ---------- Init ----------

def init_supplier_auth_router(*, db, send_whatsapp_otp, secret_key: str, algorithm: str = "HS256"):
    global _db, _send_whatsapp_otp, _secret_key, _algorithm
    _db = db
    _send_whatsapp_otp = send_whatsapp_otp
    _secret_key = secret_key
    _algorithm = algorithm
    return supplier_auth_router


# ---------- Endpoints ----------

@supplier_auth_router.post("/signup")
async def supplier_signup(payload: SupplierSignupRequest):
    """Self-service supplier signup. Creates doc with status="pending_approval".

    Returns the new supplier (without password) but DOES NOT issue a JWT — the
    supplier cannot log in until a platform admin approves.
    """
    mobile = _normalize_mobile(payload.mobile)

    # GST/PAN format soft-validation if provided
    if payload.gst_number and not re.match(r"^[0-9A-Z]{10,15}$", payload.gst_number.upper()):
        raise HTTPException(status_code=400, detail="Invalid GST number format")
    if payload.pan_number and not re.match(r"^[A-Z]{5}[0-9]{4}[A-Z]$", payload.pan_number.upper()):
        raise HTTPException(status_code=400, detail="Invalid PAN number format")

    existing = await _db.suppliers.find_one({"mobile": mobile}, {"_id": 0, "id": 1, "status": 1})
    if existing:
        raise HTTPException(
            status_code=409,
            detail={
                "code": "supplier_already_exists",
                "status": existing.get("status"),
                "message": "A supplier account already exists for this mobile. Please log in.",
            },
        )

    supplier_id = str(uuid.uuid4())
    now = _now_iso()
    doc = {
        "id": supplier_id,
        "mobile": mobile,
        "password_hash": _pwd_context.hash(payload.password),
        "business_name": payload.business_name.strip(),
        "owner_name": payload.owner_name.strip(),
        "gst_number": (payload.gst_number or "").upper() or None,
        "pan_number": (payload.pan_number or "").upper() or None,
        "address": payload.address,
        "city": payload.city,
        "state": payload.state,
        "pincode": payload.pincode,
        "email": payload.email,
        "category_tags": list({(t or "").strip().lower() for t in (payload.category_tags or []) if t and t.strip()}),
        "bank_details": payload.bank_details.model_dump() if payload.bank_details else None,
        "status": "pending_approval",
        "rejection_reason": None,
        "approved_by_admin_id": None,
        "approved_at": None,
        "rating_avg": 0.0,
        "rating_count": 0,
        "created_at": now,
        "updated_at": now,
    }
    await _db.suppliers.insert_one(doc.copy())

    return {
        "ok": True,
        "supplier": _strip_sensitive(doc),
        "message": "Signup received. A platform admin will review and approve your account shortly.",
    }


@supplier_auth_router.post("/auth/request-otp")
async def supplier_request_otp(payload: OTPRequest):
    """Send a 6-digit OTP to the supplier's WhatsApp.

    Does NOT reveal whether the mobile is registered.
    """
    mobile = _normalize_mobile(payload.mobile)
    supplier = await _db.suppliers.find_one({"mobile": mobile}, {"_id": 0})

    otp = _generate_otp()
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=10)

    await _db.supplier_otp.delete_many({"mobile": mobile})
    await _db.supplier_otp.insert_one(
        {
            "mobile": mobile,
            "otp": otp,
            "expires_at": expires_at.isoformat(),
            "verified": False,
            "created_at": _now_iso(),
        }
    )

    response: dict = {
        "message": "If this number is registered as a supplier, an OTP has been sent.",
        "delivery_status": "sent",
    }

    if supplier:
        whatsapp_result = await _send_whatsapp_otp(mobile, otp)
        response["delivery_status"] = whatsapp_result.get("status", "sent")
        if whatsapp_result.get("status") in ("mock", "failed"):
            # OTP is never returned in the response — logged server-side only.
            logger.warning(f"[Supplier Auth] OTP for {mobile} (status={whatsapp_result.get('status')}): {otp}")
            response["note"] = (
                "Messaging not configured. Please contact support."
                if whatsapp_result.get("status") == "mock"
                else "OTP delivery failed. Please try again."
            )
    else:
        logger.info(f"[Supplier Auth] OTP request for unknown mobile {mobile}")

    return response


@supplier_auth_router.post("/auth/verify-otp")
async def supplier_verify_otp(payload: OTPVerify):
    mobile = _normalize_mobile(payload.mobile)
    record = await _db.supplier_otp.find_one({"mobile": mobile}, {"_id": 0})

    invalid = HTTPException(status_code=401, detail="Invalid mobile or OTP. Please try again.")
    if not record:
        raise invalid

    try:
        exp_dt = datetime.fromisoformat(record["expires_at"].replace("Z", "+00:00"))
        if exp_dt.tzinfo is None:
            exp_dt = exp_dt.replace(tzinfo=timezone.utc)
    except Exception:
        raise invalid
    if exp_dt < datetime.now(timezone.utc):
        await _db.supplier_otp.delete_one({"mobile": mobile})
        raise HTTPException(status_code=401, detail="OTP expired. Please request a new one.")

    if (payload.otp or "").strip() != record.get("otp"):
        raise invalid

    supplier = await _db.suppliers.find_one({"mobile": mobile}, {"_id": 0})
    if not supplier:
        raise invalid

    # Status gate
    _gate_login_status(supplier)

    # Mark OTP consumed
    await _db.supplier_otp.delete_one({"mobile": mobile})
    await _db.suppliers.update_one({"id": supplier["id"]}, {"$set": {"last_login_at": _now_iso()}})

    token = _make_access_token(supplier)
    return {"token": token, "supplier": _strip_sensitive(supplier)}


@supplier_auth_router.post("/auth/password-login")
async def supplier_password_login(payload: PasswordLogin):
    mobile = _normalize_mobile(payload.mobile)
    supplier = await _db.suppliers.find_one({"mobile": mobile}, {"_id": 0})

    invalid = HTTPException(status_code=401, detail="Invalid mobile or password.")
    if not supplier:
        raise invalid

    if not supplier.get("password_hash") or not _pwd_context.verify(payload.password, supplier["password_hash"]):
        raise invalid

    _gate_login_status(supplier)

    await _db.suppliers.update_one({"id": supplier["id"]}, {"$set": {"last_login_at": _now_iso()}})
    token = _make_access_token(supplier)
    return {"token": token, "supplier": _strip_sensitive(supplier)}


@supplier_auth_router.get("/me")
async def supplier_me(supplier=Depends(require_supplier)):
    return _strip_sensitive(supplier)


@supplier_auth_router.put("/me")
async def supplier_update_me(payload: SupplierUpdateRequest, supplier=Depends(require_supplier)):
    """Suppliers can update their own profile (excluding mobile + status)."""
    updates = {k: v for k, v in payload.model_dump(exclude_unset=True).items() if v is not None}

    if "bank_details" in updates and isinstance(updates["bank_details"], dict):
        # already dumped via model_dump
        pass

    if "gst_number" in updates and updates["gst_number"]:
        if not re.match(r"^[0-9A-Z]{10,15}$", str(updates["gst_number"]).upper()):
            raise HTTPException(status_code=400, detail="Invalid GST number format")
        updates["gst_number"] = updates["gst_number"].upper()
    if "pan_number" in updates and updates["pan_number"]:
        if not re.match(r"^[A-Z]{5}[0-9]{4}[A-Z]$", str(updates["pan_number"]).upper()):
            raise HTTPException(status_code=400, detail="Invalid PAN number format")
        updates["pan_number"] = updates["pan_number"].upper()

    if "category_tags" in updates and isinstance(updates["category_tags"], list):
        updates["category_tags"] = list({(t or "").strip().lower() for t in updates["category_tags"] if t and t.strip()})

    updates["updated_at"] = _now_iso()
    await _db.suppliers.update_one({"id": supplier["id"]}, {"$set": updates})
    new_doc = await _db.suppliers.find_one({"id": supplier["id"]}, {"_id": 0})
    return _strip_sensitive(new_doc)
