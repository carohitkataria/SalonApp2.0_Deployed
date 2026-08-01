"""
Iter 31 — Verify:
  * Marketing template/coupon/settings creation with role='salon' JWT (previously 403)
  * /api/invoices/{invoice_id}/view returns 200 HTML (no auth required)
  * TWILIO_WHATSAPP_NUMBER env is production number, NOT sandbox
  * Regression: legacy salon endpoints still 200
"""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    # Fallback: read from frontend/.env
    try:
        with open("/app/frontend/.env") as f:
            for ln in f:
                if ln.startswith("REACT_APP_BACKEND_URL="):
                    BASE_URL = ln.split("=", 1)[1].strip().rstrip("/")
                    break
    except Exception:
        pass

SALON_ID = "f99309ea-7d35-4a33-aabb-8ca20cac7551"
LOGIN_PHONE = "+917503070727"
LOGIN_PWD = "salon123"


@pytest.fixture(scope="module")
def token():
    r = requests.post(f"{BASE_URL}/api/salon/password-login",
                      json={"phone": LOGIN_PHONE, "password": LOGIN_PWD}, timeout=15)
    assert r.status_code == 200, f"Login failed: {r.status_code} {r.text}"
    data = r.json()
    tok = data.get("token") or data.get("accessToken") or data.get("access_token")
    assert tok, f"No token in response: {data}"
    return tok


@pytest.fixture(scope="module")
def headers(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


# ---- Login role check ----
class TestLogin:
    def test_login_role_is_salon(self, token):
        # Decode payload without verification
        import base64, json
        payload_b64 = token.split(".")[1] + "=="
        payload = json.loads(base64.urlsafe_b64decode(payload_b64))
        assert payload.get("role") == "salon", f"Expected role='salon', got {payload.get('role')}"


# ---- Marketing template creation (bug (b)) ----
class TestMarketingTemplates:
    def test_create_marketing_template_200(self, headers):
        body = {
            "name": f"TEST_tpl_{uuid.uuid4().hex[:6]}",
            "body": "Hi {{name}}, welcome offer 10% off",
            "category": "utility",
        }
        r = requests.post(f"{BASE_URL}/api/salons/{SALON_ID}/marketing/templates",
                          json=body, headers=headers, timeout=15)
        assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"
        data = r.json()
        assert data.get("name") == body["name"]
        assert data.get("id")
        # Cleanup
        requests.delete(f"{BASE_URL}/api/salons/{SALON_ID}/marketing/templates/{data['id']}",
                        headers=headers, timeout=15)


# ---- Marketing settings (PUT via _require_admin) ----
class TestMarketingSettings:
    def test_put_marketing_settings_200(self, headers):
        body = {
            "monthly_cap_inr": 1000,
            "freq_cap_per_customer_per_week": 3,
            "quiet_hours_start": "22:00",
            "quiet_hours_end": "09:00",
            "spend_brake": False,
            "consent_required": True,
        }
        r = requests.put(f"{BASE_URL}/api/salons/{SALON_ID}/marketing/settings",
                         json=body, headers=headers, timeout=15)
        assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"

    def test_sending_windows_200(self, headers):
        body = {
            "window_start": "10:00", "window_end": "21:00",
            "quiet_start": "22:00", "quiet_end": "09:00",
            "optout_keyword": "STOP", "require_optin": True,
            "per_guest_cap_per_week": 3,
        }
        r = requests.post(f"{BASE_URL}/api/salons/{SALON_ID}/marketing/settings/sending-windows",
                          json=body, headers=headers, timeout=15)
        assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"


# ---- Coupon creation (bug (b)) ----
class TestCoupons:
    def test_create_coupon_200(self, headers):
        code = f"TEST{uuid.uuid4().hex[:5].upper()}"
        body = {
            "code": code,
            "title": "TEST coupon",
            "type": "percent",
            "value": 10,
            "min_bill_amount": 0,
        }
        r = requests.post(f"{BASE_URL}/api/salons/{SALON_ID}/coupons",
                          json=body, headers=headers, timeout=15)
        assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text}"
        data = r.json()
        assert data.get("code") == code
        assert data.get("id")
        # Cleanup
        requests.delete(f"{BASE_URL}/api/salons/{SALON_ID}/coupons/{data['id']}",
                        headers=headers, timeout=15)


# ---- Invoice view (bug (d)) ----
class TestInvoiceView:
    def test_invoice_view_returns_200_html(self, headers):
        # Fetch a real invoice_id from the DB via the salon queue/history APIs
        # Use tokens API to find any completed token with invoice_id.
        # Try /api/salons/{sid}/tokens?date=... or fallback to db read via API not available.
        # Simpler: iterate tokens today; but simplest -- use direct mongo via API isn't available.
        # Use /api/salon/tokens/history? Let's try customers full-history.
        # Actually let's hit a broad endpoint: /api/salons/{sid}/tokens
        r = requests.get(f"{BASE_URL}/api/salons/{SALON_ID}/tokens?limit=200",
                         headers=headers, timeout=20)
        invoice_id = None
        if r.status_code == 200:
            js = r.json()
            items = js if isinstance(js, list) else js.get("tokens") or js.get("items") or []
            for t in items:
                if t.get("invoice_id"):
                    invoice_id = t["invoice_id"]
                    break
        if not invoice_id:
            # Fallback: hit customers list and full-history
            rc = requests.get(f"{BASE_URL}/api/salons/{SALON_ID}/customers?limit=50",
                              headers=headers, timeout=20)
            if rc.status_code == 200:
                custs = rc.json()
                custs = custs if isinstance(custs, list) else custs.get("customers", [])
                for c in custs[:20]:
                    phone = c.get("phone") or c.get("customer_phone")
                    if not phone:
                        continue
                    rh = requests.get(f"{BASE_URL}/api/salons/{SALON_ID}/customers/{phone}/history",
                                      headers=headers, timeout=15)
                    if rh.status_code == 200:
                        hist = rh.json()
                        bookings = hist.get("bookings") or hist.get("history") or []
                        for b in bookings:
                            if b.get("invoice_id"):
                                invoice_id = b["invoice_id"]
                                break
                    if invoice_id:
                        break
        if not invoice_id:
            # No invoices exist — verify endpoint is public (returns 404 not 401/403)
            rv = requests.get(f"{BASE_URL}/api/invoices/nonexistent-id-xyz/view", timeout=15)
            assert rv.status_code == 404, (
                f"Expected 404 for missing invoice, got {rv.status_code}. "
                f"If 401/403 the endpoint requires auth and the <a href> in frontend will break."
            )
            pytest.skip("No invoice_id in DB — verified endpoint is public (404, not 401/403)")

        # Now hit /api/invoices/{id}/view — PUBLIC (no auth needed)
        rv = requests.get(f"{BASE_URL}/api/invoices/{invoice_id}/view", timeout=15)
        assert rv.status_code == 200, f"Expected 200, got {rv.status_code}: {rv.text[:200]}"
        assert "text/html" in rv.headers.get("content-type", "").lower()
        assert len(rv.text) > 100, "Invoice HTML seems empty"


# ---- Twilio production number check ----
class TestTwilioConfig:
    def test_twilio_whatsapp_number_is_production(self):
        # Read backend .env directly
        with open("/app/backend/.env") as f:
            content = f.read()
        # Find the line
        for ln in content.split("\n"):
            if ln.startswith("TWILIO_WHATSAPP_NUMBER"):
                val = ln.split("=", 1)[1].strip().strip('"').strip("'")
                assert "14155238886" not in val, f"Sandbox number configured: {val}"
                assert val.startswith("whatsapp:+"), f"Bad format: {val}"
                print(f"TWILIO_WHATSAPP_NUMBER={val} (production)")
                return
        pytest.fail("TWILIO_WHATSAPP_NUMBER not found in backend/.env")


# ---- Regression: legacy endpoints still 200 ----
class TestRegression:
    @pytest.mark.parametrize("path", [
        "/api/salon/store/products",
        "/api/salon/store/orders",
        "/api/salon/inventory",
    ])
    def test_legacy_endpoints_200(self, headers, path):
        r = requests.get(f"{BASE_URL}{path}", headers=headers, timeout=15)
        assert r.status_code == 200, f"{path} → {r.status_code}: {r.text[:200]}"

    def test_mark_all_present_200(self, headers):
        from datetime import date
        today = date.today().isoformat()
        r = requests.post(
            f"{BASE_URL}/api/salons/{SALON_ID}/staff-attendance/mark-all-present/{today}",
            headers=headers, timeout=15,
        )
        # 200 or 400 (if not applicable e.g. no staff) both ok — 401/403 are failures
        assert r.status_code not in (401, 403), f"Auth failed: {r.status_code}: {r.text}"

    def test_customers_list_200(self, headers):
        r = requests.get(f"{BASE_URL}/api/salons/{SALON_ID}/customers?limit=5",
                         headers=headers, timeout=15)
        assert r.status_code == 200, f"{r.status_code}: {r.text[:200]}"
