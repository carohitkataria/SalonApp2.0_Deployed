"""Iteration 26 — verify P0-P2 bug fixes from review request.

Coverage:
  1. /api/salon/users/login (admin, +91 phone)
  2. /api/salons/{id}/queue and /barbers/{id}/queue range support
  3. /api/salons/{id}/reports/prefs GET/PUT and /reports/targets PUT
  4. /api/salons/{id}/reports/snapshot?view=month (+ subroutes)
  5. /api/salons/{id}/services/bulk-toggle
  6. supplier_products fixture purge (empty state)
"""
import os
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
SALON_ID = "f99309ea-7d35-4a33-aabb-8ca20cac7551"


@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(
        f"{BASE_URL}/api/salon/users/login",
        json={"identifier": "admin", "password": "salon123"},
        timeout=30,
    )
    if r.status_code != 200:
        pytest.skip(f"admin login failed: {r.status_code} {r.text[:200]}")
    return r.json()


@pytest.fixture(scope="module")
def auth_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token['access_token']}"}


# ---------------- Multi-user login ----------------
class TestSalonUsersLogin:
    def test_login_admin_identifier(self):
        r = requests.post(
            f"{BASE_URL}/api/salon/users/login",
            json={"identifier": "admin", "password": "salon123"},
            timeout=30,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("role") in ("admin", "salon_admin")
        perms = data.get("permissions") or {}
        for k in [
            "can_edit_salon", "can_access_analytics", "can_access_financials",
            "can_delete_salon", "can_access_services", "can_access_gallery",
            "can_access_staff", "can_view_all_staff", "can_access_marketing",
        ]:
            assert perms.get(k) is True, f"perm {k} not True: {perms}"

    def test_login_phone_identifier(self):
        r = requests.post(
            f"{BASE_URL}/api/salon/users/login",
            json={"identifier": "7503070727", "password": "salon123"},
            timeout=30,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("role") in ("admin", "salon_admin")
        # salon_id may be in root or nested
        sid = data.get("salon_id") or (data.get("user") or {}).get("salon_id")
        assert sid == SALON_ID, f"expected salon_id={SALON_ID} got {sid}"

    def test_login_wrong_password(self):
        r = requests.post(
            f"{BASE_URL}/api/salon/users/login",
            json={"identifier": "admin", "password": "wrong"},
            timeout=30,
        )
        assert r.status_code == 401


# ---------------- Queue range mode ----------------
class TestQueueRange:
    def test_salon_queue_single_date(self, auth_headers):
        r = requests.get(
            f"{BASE_URL}/api/salons/{SALON_ID}/queue",
            params={"date": "2026-01-15"},
            headers=auth_headers, timeout=30,
        )
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_salon_queue_range(self, auth_headers):
        r = requests.get(
            f"{BASE_URL}/api/salons/{SALON_ID}/queue",
            params={"date_from": "2026-01-01", "date_to": "2026-01-31"},
            headers=auth_headers, timeout=30,
        )
        assert r.status_code == 200, r.text
        assert isinstance(r.json(), list)

    def test_barber_queue_range(self, auth_headers):
        # get any barber id
        br = requests.get(
            f"{BASE_URL}/api/salons/{SALON_ID}/barbers",
            headers=auth_headers, timeout=30,
        )
        if br.status_code != 200 or not br.json():
            pytest.skip("no barbers")
        barber_id = br.json()[0]["id"]
        r = requests.get(
            f"{BASE_URL}/api/salons/{SALON_ID}/barbers/{barber_id}/queue",
            params={"date_from": "2026-01-01", "date_to": "2026-01-31"},
            headers=auth_headers, timeout=30,
        )
        assert r.status_code == 200, r.text
        assert isinstance(r.json(), list)


# ---------------- Reports prefs / targets ----------------
class TestReportsPrefsTargets:
    def test_get_prefs(self, auth_headers):
        r = requests.get(
            f"{BASE_URL}/api/salons/{SALON_ID}/reports/prefs",
            headers=auth_headers, timeout=30,
        )
        assert r.status_code == 200, r.text
        d = r.json()
        assert "cards" in d and "all_cards" in d

    def test_put_prefs(self, auth_headers):
        # Get, then push back
        g = requests.get(
            f"{BASE_URL}/api/salons/{SALON_ID}/reports/prefs",
            headers=auth_headers, timeout=30,
        ).json()
        cards = g["cards"]
        r = requests.put(
            f"{BASE_URL}/api/salons/{SALON_ID}/reports/prefs",
            headers=auth_headers, timeout=30,
            json={"cards": cards, "order": cards},
        )
        assert r.status_code == 200, r.text
        assert r.json().get("success") is True

    def test_put_target(self, auth_headers):
        r = requests.put(
            f"{BASE_URL}/api/salons/{SALON_ID}/reports/targets",
            headers=auth_headers, timeout=30,
            json={"metric_id": "revenue", "period_type": "month",
                  "target": 123456.0, "branch_id": None},
        )
        assert r.status_code == 200, r.text
        assert r.json().get("success") is True


# ---------------- Reports snapshot month view ----------------
class TestReportsSnapshot:
    def test_snapshot_month(self, auth_headers):
        r = requests.get(
            f"{BASE_URL}/api/salons/{SALON_ID}/reports/snapshot",
            params={"view": "month", "date": "2026-01-15"},
            headers=auth_headers, timeout=60,
        )
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["window"]["view"] == "month"
        assert d["window"]["start"] == "2026-01-01"
        assert d["window"]["end"] == "2026-01-31"
        assert "previous" in d["window"]
        # DEFAULT_CARDS has 13
        assert len(d["cards"]) == 13, f"expected 13 cards got {len(d['cards'])}"

    @pytest.mark.parametrize("sub", ["sales", "payments-gst", "pnl",
                                    "clients", "marketing", "inventory"])
    def test_report_subroutes_month(self, auth_headers, sub):
        r = requests.get(
            f"{BASE_URL}/api/salons/{SALON_ID}/reports/{sub}",
            params={"view": "month", "date": "2026-01-15"},
            headers=auth_headers, timeout=60,
        )
        assert r.status_code == 200, f"{sub}: {r.status_code} {r.text[:200]}"


# ---------------- Services bulk-toggle ----------------
class TestBulkToggle:
    def test_bulk_toggle_empty_400(self, auth_headers):
        r = requests.post(
            f"{BASE_URL}/api/salons/{SALON_ID}/services/bulk-toggle",
            headers=auth_headers, timeout=30,
            json={"service_ids": [], "is_enabled": True},
        )
        assert r.status_code == 400

    def test_bulk_toggle_disable_then_enable(self, auth_headers):
        # find at least one service
        sr = requests.get(
            f"{BASE_URL}/api/salons/{SALON_ID}/services",
            headers=auth_headers, timeout=30,
        )
        if sr.status_code != 200 or not sr.json():
            pytest.skip("no services to toggle")
        svc_ids = [s["id"] for s in sr.json()[:2]]

        for enabled in (False, True):
            r = requests.post(
                f"{BASE_URL}/api/salons/{SALON_ID}/services/bulk-toggle",
                headers=auth_headers, timeout=30,
                json={"service_ids": svc_ids, "is_enabled": enabled},
            )
            assert r.status_code == 200, r.text
            body = r.json()
            assert body.get("ok") is True
            assert body.get("is_enabled") is enabled


# ---------------- Supplier products purge ----------------
class TestSupplierProductsPurge:
    def test_shop_no_fixture_products(self, auth_headers):
        # Try common shop/supplier product endpoints
        candidates = [
            f"/api/salons/{SALON_ID}/supplier-products",
            f"/api/salons/{SALON_ID}/shop/products",
            f"/api/salons/{SALON_ID}/products",
        ]
        found_endpoint = None
        for c in candidates:
            r = requests.get(BASE_URL + c, headers=auth_headers, timeout=30)
            if r.status_code == 200:
                found_endpoint = c
                data = r.json()
                if isinstance(data, dict):
                    data = data.get("products") or data.get("items") or []
                # If anything, none should be a fixture
                names = [str(p.get("name", "")).lower() for p in data]
                # Fixtures typically had names like 'Sample ...' — assert no
                # known fixture markers remain
                bad = [n for n in names if "sample" in n or "fixture" in n]
                assert not bad, f"fixture products still present: {bad}"
                return
        if not found_endpoint:
            pytest.skip("no shop/supplier-product endpoint found")
