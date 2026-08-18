"""Iter 30 tests: post-merge auth fixes + platform soft-delete salon."""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://appt-filter-redesign.preview.emergentagent.com').rstrip('/')
SALON_ID = "f99309ea-7d35-4a33-aabb-8ca20cac7551"


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{BASE_URL}/api/salon/password-login",
                      json={"phone": "+917503070727", "password": "salon123"}, timeout=20)
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    data = r.json()
    assert "access_token" in data
    assert data.get("salon_id") == SALON_ID
    assert data.get("role") == "admin"
    perms = data.get("permissions") or {}
    # all can_* flags true
    can_flags = [k for k in perms if k.startswith("can_")]
    assert can_flags, "no can_* permission keys in login response"
    for k in can_flags:
        assert perms[k] is True, f"perm {k} is not True: {perms[k]}"
    return data["access_token"]


@pytest.fixture(scope="module")
def auth_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


# ---------- Post-fix 401 endpoints ----------

class TestAuthedEndpoints:
    def test_get_store_products(self, auth_headers):
        r = requests.get(f"{BASE_URL}/api/salon/store/products", headers=auth_headers, timeout=20)
        assert r.status_code == 200, f"{r.status_code}: {r.text[:200]}"

    def test_get_store_orders(self, auth_headers):
        r = requests.get(f"{BASE_URL}/api/salon/store/orders", headers=auth_headers, timeout=20)
        assert r.status_code == 200, f"{r.status_code}: {r.text[:200]}"

    def test_get_inventory(self, auth_headers):
        r = requests.get(f"{BASE_URL}/api/salon/inventory", headers=auth_headers, timeout=20)
        assert r.status_code == 200, f"{r.status_code}: {r.text[:200]}"

    def test_mark_all_present(self, auth_headers):
        r = requests.post(
            f"{BASE_URL}/api/salons/{SALON_ID}/staff-attendance/mark-all-present/2026-07-28",
            headers=auth_headers, timeout=20)
        assert r.status_code == 200, f"{r.status_code}: {r.text[:300]}"

    def test_create_customer(self, auth_headers):
        payload = {"name": f"TEST_Cust_{uuid.uuid4().hex[:6]}",
                   "phone": f"+9199999{uuid.uuid4().hex[:5]}", "gender": "male"}
        r = requests.post(f"{BASE_URL}/api/salons/{SALON_ID}/customers",
                          headers=auth_headers, json=payload, timeout=20)
        assert r.status_code in (200, 201), f"{r.status_code}: {r.text[:300]}"


# ---------- Legacy multi-user login still works ----------

class TestMultiUserLogin:
    def test_admin_login(self):
        r = requests.post(f"{BASE_URL}/api/salon/users/login",
                          json={"identifier": "admin", "password": "salon123"}, timeout=20)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("role") == "admin"
        perms = data.get("permissions") or {}
        for k in ("can_edit_salon", "can_access_analytics", "can_access_financials",
                  "can_delete_salon", "can_access_services", "can_access_staff"):
            assert perms.get(k) is True, f"{k} missing/false"


# ---------- Unlimited-access legacy salon JWT ----------

class TestSalonAdminUnlimitedAccess:
    def test_services_get(self, auth_headers):
        # Global services endpoint (protected)
        r = requests.get(f"{BASE_URL}/api/services", headers=auth_headers, timeout=20)
        assert r.status_code == 200, f"{r.status_code}: {r.text[:200]}"

    def test_branches_list(self, auth_headers):
        r = requests.get(f"{BASE_URL}/api/salons/{SALON_ID}/branches", headers=auth_headers, timeout=20)
        assert r.status_code == 200, f"{r.status_code}: {r.text[:200]}"


# ---------- Platform soft-delete salon ----------

class TestPlatformDeleteSalonAuthGuard:
    def test_delete_without_token(self):
        r = requests.post(f"{BASE_URL}/api/platform/salons/nonexistent-id/delete",
                          json={"reason": "test unauth"}, timeout=20)
        # Should reject: 401 or 403
        assert r.status_code in (401, 403), f"expected 401/403, got {r.status_code}: {r.text[:200]}"

    def test_delete_with_salon_token_forbidden(self, auth_headers):
        r = requests.post(f"{BASE_URL}/api/platform/salons/nonexistent-id/delete",
                          headers=auth_headers, json={"reason": "test forbidden"}, timeout=20)
        assert r.status_code in (401, 403), f"expected 401/403, got {r.status_code}: {r.text[:200]}"


class TestPlatformSalonsList:
    def test_list_requires_platform_admin(self, auth_headers):
        r = requests.get(f"{BASE_URL}/api/platform/salons", headers=auth_headers, timeout=20)
        # salon admin token must not be able to hit platform endpoints
        assert r.status_code in (401, 403), f"{r.status_code}: {r.text[:200]}"
