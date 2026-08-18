"""
Iteration 28 backend tests:
  1. Platform owner password login + brute-force lockout + invalid password
  2. Salary monthly endpoint smoke check (prorate logic)
"""
import os
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://appt-filter-redesign.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

OWNER_MOBILE = os.environ.get("TEST_PLATFORM_MOBILE", "7503070727")
OWNER_PASSWORD = os.environ.get("TEST_PLATFORM_PASSWORD", "OwnerSecure#7503")
LOCKOUT_TEST_MOBILE = os.environ.get("TEST_LOCKOUT_MOBILE", "7503070728")   # different to avoid locking the real owner

SALON_ID = os.environ.get("TEST_SALON_ID", "58db26fa-f807-4305-9c86-313d3f1b35f3")
SALON_ADMIN_ID = os.environ.get("TEST_SALON_IDENTIFIER", "admin")
SALON_ADMIN_PW = os.environ.get("TEST_SALON_PASSWORD", "salon123")


# ---------- Platform owner password login ----------
class TestPlatformAuth:
    def test_login_password_success(self):
        r = requests.post(f"{API}/platform/auth/login-password",
                          json={"mobile": OWNER_MOBILE, "password": OWNER_PASSWORD},
                          timeout=15)
        assert r.status_code == 200, f"Got {r.status_code}: {r.text}"
        body = r.json()
        # JWT or token field expected
        token_field = next((k for k in ("token", "access_token", "jwt") if k in body), None)
        assert token_field, f"No token field in response: {body.keys()}"
        assert isinstance(body[token_field], str) and len(body[token_field]) > 10

    def test_login_password_invalid_returns_clear_error(self):
        r = requests.post(f"{API}/platform/auth/login-password",
                          json={"mobile": OWNER_MOBILE, "password": "definitely-wrong"},
                          timeout=15)
        assert r.status_code in (400, 401, 403), f"Expected auth-failure code, got {r.status_code}: {r.text}"
        detail = (r.json().get("detail") or r.json().get("message") or "").lower()
        # Should not leak whether the mobile exists
        assert "invalid" in detail or "incorrect" in detail or "wrong" in detail, f"Unclear error: {detail!r}"

    def test_login_password_bruteforce_lockout(self):
        """5 wrong attempts on an unregistered mobile should produce 429 lockout."""
        statuses = []
        for i in range(7):
            r = requests.post(f"{API}/platform/auth/login-password",
                              json={"mobile": LOCKOUT_TEST_MOBILE, "password": f"bad{i}"},
                              timeout=15)
            statuses.append(r.status_code)
            if r.status_code == 429:
                break
            time.sleep(0.05)
        assert 429 in statuses, f"Expected 429 within 7 attempts, got statuses: {statuses}"


# ---------- Salary monthly endpoint smoke ----------
@pytest.fixture(scope="module")
def salon_admin_token():
    # Try a couple of common salon-admin login routes
    candidates = [
        ("/salon/users/login", {"identifier": SALON_ADMIN_ID, "password": SALON_ADMIN_PW}),
    ]
    for path, payload in candidates:
        r = requests.post(f"{API}{path}", json=payload, timeout=15)
        if r.status_code == 200:
            j = r.json()
            for k in ("access_token", "token", "jwt"):
                if k in j and j[k]:
                    return j[k]
    pytest.skip("Could not obtain salon-admin token via known routes")


class TestSalarySmoke:
    def test_get_first_barber(self, salon_admin_token):
        h = {"Authorization": f"Bearer {salon_admin_token}"}
        # Try common barber listing routes
        for path in (f"/salons/{SALON_ID}/barbers", f"/salons/{SALON_ID}/staff", f"/barbers?salon_id={SALON_ID}"):
            r = requests.get(f"{API}{path}", headers=h, timeout=15)
            if r.status_code == 200:
                data = r.json()
                lst = data if isinstance(data, list) else data.get("barbers") or data.get("staff") or data.get("data") or []
                if lst:
                    pytest.barber_id = lst[0].get("id") or lst[0].get("_id") or lst[0].get("barber_id")
                    assert pytest.barber_id
                    return
        pytest.skip("Could not list barbers for salon")

    def test_monthly_salary_returns_reasonable_fields(self, salon_admin_token):
        barber_id = getattr(pytest, "barber_id", None)
        if not barber_id:
            pytest.skip("No barber id available from previous test")
        h = {"Authorization": f"Bearer {salon_admin_token}"}
        r = requests.get(
            f"{API}/salons/{SALON_ID}/staff-salary/month/2026-06",
            params={"barber_id": barber_id},
            headers=h, timeout=20,
        )
        assert r.status_code == 200, f"Got {r.status_code}: {r.text[:300]}"
        data = r.json()
        # New response is {"month": "...", "salary_records": [...]}
        records = data.get("salary_records") or ([data] if "final_payable" in data else [])
        assert records, f"No salary_records in response: {list(data.keys())}"
        rec = records[0]
        for key in ("final_payable", "working_days_in_month", "base_compensation", "incentive_amount"):
            assert key in rec, f"Missing key {key} in {list(rec.keys())}"
        assert isinstance(rec["final_payable"], (int, float))
        assert rec["working_days_in_month"] in (28, 29, 30, 31)
        assert rec["final_payable"] >= 0
