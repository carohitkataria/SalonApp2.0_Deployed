"""Module 6 — Services Menu QR + Frictionless Booking backend tests.

Covers:
  - GET /api/salons/{salon}/branches/{branch}/services-menu-qr (200 + 404)
  - GET /api/salons/{salon}/menu (200 + 404, public/no-auth)
  - POST /api/bookings — stamps `is_otp_verified_at_booking` from booker User
  - Regression: GET /api/salons/{salon}/branches/{branch}/qr-code still ok
"""
import os
import asyncio
import uuid
import datetime as dt
from typing import Dict

import pytest
import requests
from motor.motor_asyncio import AsyncIOMotorClient

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/") if os.environ.get("REACT_APP_BACKEND_URL") else "https://appt-filter-redesign.preview.emergentagent.com"
SALON_ID = "62609c3d-a90a-481b-9cd4-4208f741e121"
BRANCH_ID = "b829d20e-f923-4db8-a69c-9daf38fcd5a9"
BARBER_ID = "a3e12da2-b2d2-4e78-ae7c-2e3b4b0c0169"  # Imran (Main)
SERVICE_ID = "36ab7dd7-6835-4399-97fa-edfa01b8b802"  # Haircut, base_price 150

MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "salon_app")


@pytest.fixture(scope="module")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


# --------------------------- QR endpoints ---------------------------

class TestServicesMenuQrEndpoint:
    def test_services_menu_qr_returns_payload(self, api):
        r = api.get(f"{BASE_URL}/api/salons/{SALON_ID}/branches/{BRANCH_ID}/services-menu-qr")
        assert r.status_code == 200
        d = r.json()
        assert "qr_code" in d
        assert d["qr_code"].startswith("data:image/png;base64,")
        assert "menu_url" in d
        assert f"/salon/{SALON_ID}/menu?branch={BRANCH_ID}" in d["menu_url"]
        assert d.get("branch_name")

    def test_services_menu_qr_unknown_branch_404(self, api):
        r = api.get(f"{BASE_URL}/api/salons/{SALON_ID}/branches/no-such-branch/services-menu-qr")
        assert r.status_code == 404


class TestPublicMenuEndpoint:
    def test_menu_returns_salon_branch_services_keys(self, api):
        r = api.get(f"{BASE_URL}/api/salons/{SALON_ID}/menu?branch={BRANCH_ID}")
        assert r.status_code == 200
        d = r.json()
        assert set(["salon", "branch", "services"]).issubset(d.keys())
        assert d["salon"]["id"] == SALON_ID
        assert d["branch"]["id"] == BRANCH_ID
        assert isinstance(d["services"], list)

    def test_menu_public_no_auth_required(self, api):
        # Same call but explicitly drop Authorization
        r = requests.get(f"{BASE_URL}/api/salons/{SALON_ID}/menu?branch={BRANCH_ID}")
        assert r.status_code == 200

    def test_menu_unknown_salon_404(self, api):
        r = api.get(f"{BASE_URL}/api/salons/no-such-salon/menu")
        assert r.status_code == 404

    def test_menu_without_branch_falls_back_to_main(self, api):
        r = api.get(f"{BASE_URL}/api/salons/{SALON_ID}/menu")
        assert r.status_code == 200
        d = r.json()
        # Should resolve main branch when branch not supplied
        assert d.get("branch") is None or d["branch"]["id"] == BRANCH_ID


# --------------------------- Regression: booking QR ---------------------------

class TestBookingQrRegression:
    def test_booking_qr_still_works(self, api):
        r = api.get(f"{BASE_URL}/api/salons/{SALON_ID}/branches/{BRANCH_ID}/qr-code")
        assert r.status_code == 200
        d = r.json()
        assert "qr_code" in d
        assert d["qr_code"].startswith("data:image/png;base64,")
        assert "booking_url" in d
        assert f"/salon/{SALON_ID}" in d["booking_url"]


# --------------------------- is_otp_verified_at_booking ---------------------------

def _today():
    return dt.datetime.utcnow().strftime("%Y-%m-%d")


async def _set_user_otp_verified(phone: str, flag: bool):
    c = AsyncIOMotorClient(MONGO_URL)
    try:
        db = c[DB_NAME]
        await db.users.update_one({"phone": phone}, {"$set": {"is_otp_verified": flag}})
    finally:
        c.close()


async def _delete_token(token_id: str):
    c = AsyncIOMotorClient(MONGO_URL)
    try:
        db = c[DB_NAME]
        await db.tokens.delete_one({"id": token_id})
    finally:
        c.close()


async def _delete_user(phone: str):
    c = AsyncIOMotorClient(MONGO_URL)
    try:
        db = c[DB_NAME]
        await db.users.delete_one({"phone": phone})
    finally:
        c.close()


def _make_booking_payload(user_id: str, customer_name: str, phone: str) -> Dict:
    # Use a phone unique per run so the active-booking limit doesn't kick in
    return {
        "salon_id": SALON_ID,
        "branch_id": BRANCH_ID,
        "user_id": user_id,
        "customer_name": customer_name,
        "phone": phone,
        "date": _today(),
        "shift": "Morning",
        "barber_id": BARBER_ID,
        "selected_services": [SERVICE_ID],
        "source": "TEST_module6",
        "booking_type": "instant",
        "booking_for_self": True,
        "payment_mode": "cash",
        "customer_gender": "Men",
    }


class TestBookingOtpFlagStamping:
    """Verify POST /api/bookings stamps is_otp_verified_at_booking from User."""

    def _unique_phone(self, suffix: str) -> str:
        # 10-digit phone unique to this test run; +91 is added server-side
        n = uuid.uuid4().int % 10_000_000
        return f"9{suffix[:2]}{n:07d}"[:10]

    def test_unverified_user_stamps_false(self, api):
        phone10 = self._unique_phone("11")
        login = api.post(
            f"{BASE_URL}/api/user/login",
            json={"name": "TEST Express", "phone": phone10, "gender": "Men"},
        )
        assert login.status_code == 200, login.text
        user = login.json()
        assert user.get("is_otp_verified") in (False, None)
        full_phone = user["phone"]  # +91...
        token_id = None
        try:
            payload = _make_booking_payload(user["id"], "TEST Express", full_phone)
            r = api.post(f"{BASE_URL}/api/bookings", json=payload)
            assert r.status_code == 200, r.text
            tok = r.json()
            token_id = tok["id"]
            assert tok.get("is_otp_verified_at_booking") is False, tok

            # Re-fetch via /api/user/{user_id}/history to verify persisted
            hist = api.get(f"{BASE_URL}/api/user/{user['id']}/history")
            assert hist.status_code == 200, hist.text
            tokens = hist.json()
            found = [t for t in tokens if t["id"] == token_id]
            assert found, tokens
            assert found[0].get("is_otp_verified_at_booking") is False, found[0]
        finally:
            if token_id:
                asyncio.run(_delete_token(token_id))
            asyncio.run(_delete_user(full_phone))

    def test_verified_user_stamps_true(self, api):
        phone10 = self._unique_phone("22")
        login = api.post(
            f"{BASE_URL}/api/user/login",
            json={"name": "TEST Verified", "phone": phone10, "gender": "Men"},
        )
        assert login.status_code == 200, login.text
        user = login.json()
        full_phone = user["phone"]
        # Flip the verification flag in DB to simulate an OTP-verified customer
        asyncio.run(_set_user_otp_verified(full_phone, True))

        token_id = None
        try:
            payload = _make_booking_payload(user["id"], "TEST Verified", full_phone)
            r = api.post(f"{BASE_URL}/api/bookings", json=payload)
            assert r.status_code == 200, r.text
            tok = r.json()
            token_id = tok["id"]
            assert tok.get("is_otp_verified_at_booking") is True, tok

            # Re-fetch via /api/user/{user_id}/history
            hist = api.get(f"{BASE_URL}/api/user/{user['id']}/history")
            assert hist.status_code == 200, hist.text
            tokens = hist.json()
            assert any(t["id"] == token_id and t.get("is_otp_verified_at_booking") is True for t in tokens), tokens
        finally:
            if token_id:
                asyncio.run(_delete_token(token_id))
            asyncio.run(_delete_user(full_phone))
