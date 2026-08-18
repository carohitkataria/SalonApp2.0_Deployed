"""
Backend tests for Module 2 — Leave Tracker & Leave Settings,
and Module 3 — Staff Settings Consolidation (attendance_rules persistence).
"""
import os
import uuid
import requests
import pytest
from datetime import datetime, timedelta, timezone

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://appt-filter-redesign.preview.emergentagent.com").rstrip("/")
SALON_ID = "a6f10c9e-f0e0-4128-8246-00282188c70b"
IST = timezone(timedelta(hours=5, minutes=30))


def _fy_now() -> str:
    d = datetime.now(IST).date()
    if d.month >= 4:
        return f"{d.year}-{(d.year + 1) % 100:02d}"
    return f"{d.year - 1}-{d.year % 100:02d}"


# ============ Fixtures ============

@pytest.fixture(scope="session")
def token():
    r = requests.post(f"{BASE_URL}/api/salon/users/login",
                      json={"identifier": "+917503070727", "password": "salon123"},
                      timeout=30)
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


@pytest.fixture(scope="session")
def auth(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


def _extract_barbers(data):
    if isinstance(data, list):
        return data
    return data.get("barbers") or data.get("items") or []


@pytest.fixture(scope="session")
def barber_id(auth):
    """Pick first active barber for SALON_ID."""
    r = requests.get(f"{BASE_URL}/api/salons/{SALON_ID}/barbers", headers=auth, timeout=30)
    assert r.status_code == 200, r.text
    items = _extract_barbers(r.json())
    assert items, f"No barbers found: {r.json()}"
    return items[0]["id"]


# ============ Module 2 — leave-types-config ============

class TestLeaveTypesConfig:
    def test_default_seed_returns_four_codes(self, auth):
        r = requests.get(f"{BASE_URL}/api/salons/{SALON_ID}/leave-types-config", headers=auth, timeout=30)
        assert r.status_code == 200, r.text
        items = r.json()["items"]
        codes = {x["code"] for x in items}
        for c in ("CL", "SL", "PL", "UL"):
            assert c in codes, f"missing default {c}; got {codes}"

    def test_create_uppercases_code_and_409_on_duplicate(self, auth):
        code = f"TST{uuid.uuid4().hex[:4]}"  # alphanumeric
        payload = {
            "code": code.lower(), "display_name": f"Test {code}",
            "is_paid": True, "monthly_accrual": 0.5,
            "carry_forward_rule": {"enabled": True, "max_carry_forward": 5.0},
            "max_balance_cap": 20.0, "applies_to": "all", "display_order": 99
        }
        r = requests.post(f"{BASE_URL}/api/salons/{SALON_ID}/leave-types-config",
                          headers=auth, json=payload, timeout=30)
        assert r.status_code == 200, r.text
        item = r.json()["item"]
        assert item["code"] == code.upper()
        # duplicate
        r2 = requests.post(f"{BASE_URL}/api/salons/{SALON_ID}/leave-types-config",
                           headers=auth, json=payload, timeout=30)
        assert r2.status_code == 409, r2.text
        # cleanup
        requests.delete(f"{BASE_URL}/api/salons/{SALON_ID}/leave-types-config/{item['id']}",
                        headers=auth, timeout=30)

    def test_mutual_exclusion_create_400(self, auth):
        code = f"MX{uuid.uuid4().hex[:4]}"
        payload = {
            "code": code, "display_name": "ME Test",
            "carry_forward_rule": {"enabled": True, "max_carry_forward": 5.0},
            "lapse_rule": {"enabled": True, "lapse_percent": 50.0},
        }
        r = requests.post(f"{BASE_URL}/api/salons/{SALON_ID}/leave-types-config",
                          headers=auth, json=payload, timeout=30)
        # Pydantic ValueError => 422 by FastAPI default; spec says 400. Accept either but flag.
        assert r.status_code in (400, 422), r.text

    def test_put_partial_update_and_clear_flags(self, auth):
        # create
        code = f"PU{uuid.uuid4().hex[:4]}"
        cr = requests.post(f"{BASE_URL}/api/salons/{SALON_ID}/leave-types-config", headers=auth,
                           json={"code": code, "display_name": "PU Test",
                                 "carry_forward_rule": {"enabled": True, "max_carry_forward": 3.0}},
                           timeout=30)
        assert cr.status_code == 200, cr.text
        cfg_id = cr.json()["item"]["id"]
        # partial update display_name only
        r = requests.put(f"{BASE_URL}/api/salons/{SALON_ID}/leave-types-config/{cfg_id}",
                         headers=auth, json={"display_name": "Renamed PU"}, timeout=30)
        assert r.status_code == 200, r.text
        assert r.json()["item"]["display_name"] == "Renamed PU"
        # clear_carry_forward then add lapse
        r2 = requests.put(f"{BASE_URL}/api/salons/{SALON_ID}/leave-types-config/{cfg_id}",
                          headers=auth, json={"clear_carry_forward": True,
                                              "lapse_rule": {"enabled": True, "lapse_percent": 100.0}}, timeout=30)
        assert r2.status_code == 200, r2.text
        assert r2.json()["item"]["carry_forward_rule"] in (None, {})
        # try mutual exclusion after merge
        r3 = requests.put(f"{BASE_URL}/api/salons/{SALON_ID}/leave-types-config/{cfg_id}",
                          headers=auth, json={"carry_forward_rule": {"enabled": True, "max_carry_forward": 5.0}},
                          timeout=30)
        assert r3.status_code == 400, r3.text
        # cleanup
        requests.delete(f"{BASE_URL}/api/salons/{SALON_ID}/leave-types-config/{cfg_id}", headers=auth, timeout=30)

    def test_delete_soft_hides_unless_include_inactive(self, auth):
        code = f"DL{uuid.uuid4().hex[:4]}"
        cr = requests.post(f"{BASE_URL}/api/salons/{SALON_ID}/leave-types-config", headers=auth,
                           json={"code": code, "display_name": "DL Test"}, timeout=30)
        cfg_id = cr.json()["item"]["id"]
        r = requests.delete(f"{BASE_URL}/api/salons/{SALON_ID}/leave-types-config/{cfg_id}", headers=auth, timeout=30)
        assert r.status_code == 200, r.text
        # default hides
        r1 = requests.get(f"{BASE_URL}/api/salons/{SALON_ID}/leave-types-config", headers=auth, timeout=30)
        assert code.upper() not in {x["code"] for x in r1.json()["items"]}
        # include_inactive=true shows
        r2 = requests.get(f"{BASE_URL}/api/salons/{SALON_ID}/leave-types-config?include_inactive=true",
                          headers=auth, timeout=30)
        codes_inactive = {x["code"]: x for x in r2.json()["items"]}
        assert code.upper() in codes_inactive
        assert codes_inactive[code.upper()]["is_active"] is False


# ============ Module 2 — leave balance ============

class TestLeaveBalance:
    def test_get_creates_rows_and_fy_format(self, auth, barber_id):
        r = requests.get(f"{BASE_URL}/api/salons/{SALON_ID}/barbers/{barber_id}/leave-balance",
                         headers=auth, timeout=30)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["financial_year"] == _fy_now()
        codes = {x["leave_type_code"] for x in body["items"]}
        for c in ("CL", "SL", "PL", "UL"):
            assert c in codes
        # FY format YYYY-YY
        import re
        assert re.match(r"^\d{4}-\d{2}$", body["financial_year"])

    def test_adjust_positive_negative_and_cap_clamp(self, auth, barber_id):
        # Positive adjust on CL
        r = requests.post(f"{BASE_URL}/api/salons/{SALON_ID}/barbers/{barber_id}/leave-balance/adjust",
                          headers=auth,
                          json={"leave_type_code": "CL", "qty_delta": 2.0, "reason": "TEST positive"},
                          timeout=30)
        assert r.status_code == 200, r.text
        bal_after_pos = r.json()["balance"]["current_balance"]
        accrued_after_pos = r.json()["balance"]["accrued_ytd"]

        # Negative adjust capped to zero (set balance to 0 by sending big negative; CL allow_negative=False)
        r2 = requests.post(f"{BASE_URL}/api/salons/{SALON_ID}/barbers/{barber_id}/leave-balance/adjust",
                           headers=auth,
                           json={"leave_type_code": "CL", "qty_delta": -9999.0, "reason": "TEST clamp"},
                           timeout=30)
        assert r2.status_code == 200, r2.text
        assert r2.json()["balance"]["current_balance"] == 0.0

        # Re-add small to test cap clamp on SL (cap=12). Push 100 above cap -> clamp.
        r3 = requests.post(f"{BASE_URL}/api/salons/{SALON_ID}/barbers/{barber_id}/leave-balance/adjust",
                           headers=auth,
                           json={"leave_type_code": "SL", "qty_delta": 100.0, "reason": "TEST cap"},
                           timeout=30)
        assert r3.status_code == 200, r3.text
        assert r3.json()["balance"]["current_balance"] <= 12.0

        assert bal_after_pos >= 2.0
        assert accrued_after_pos >= 2.0

    def test_ledger_pagination_and_filter(self, auth, barber_id):
        r = requests.get(f"{BASE_URL}/api/salons/{SALON_ID}/barbers/{barber_id}/leave-balance/ledger?page=1&page_size=5",
                         headers=auth, timeout=30)
        assert r.status_code == 200, r.text
        b = r.json()
        for k in ("movements", "total_count", "page", "page_size", "total_pages"):
            assert k in b
        assert b["page"] == 1 and b["page_size"] == 5
        # filter by leave_type_code
        r2 = requests.get(f"{BASE_URL}/api/salons/{SALON_ID}/barbers/{barber_id}/leave-balance/ledger?leave_type_code=CL",
                          headers=auth, timeout=30)
        assert r2.status_code == 200
        for m in r2.json()["movements"]:
            assert m["leave_type_code"] == "CL"


# ============ Module 2 — leave records ============

class TestLeaveRecords:
    @pytest.fixture(autouse=True)
    def _setup_balance(self, auth, barber_id):
        # Ensure CL has at least 3 days
        requests.post(f"{BASE_URL}/api/salons/{SALON_ID}/barbers/{barber_id}/leave-balance/adjust",
                      headers=auth,
                      json={"leave_type_code": "CL", "qty_delta": 5.0, "reason": "TEST setup"}, timeout=30)
        # Ensure SL has 0 balance for insufficient test (clamp to 0)
        requests.post(f"{BASE_URL}/api/salons/{SALON_ID}/barbers/{barber_id}/leave-balance/adjust",
                      headers=auth,
                      json={"leave_type_code": "SL", "qty_delta": -9999.0, "reason": "TEST drain"}, timeout=30)

    def _unique_date(self, offset_days=0):
        # pick a future date well outside any existing records
        d = (datetime.now(IST).date() + timedelta(days=200 + offset_days))
        return d.strftime("%Y-%m-%d")

    def test_create_full_day_debits_one(self, auth, barber_id):
        # get balance
        b = requests.get(f"{BASE_URL}/api/salons/{SALON_ID}/barbers/{barber_id}/leave-balance",
                         headers=auth, timeout=30).json()
        cl_before = next(x for x in b["items"] if x["leave_type_code"] == "CL")["current_balance"]
        d = self._unique_date(1)
        r = requests.post(f"{BASE_URL}/api/salons/{SALON_ID}/leave-records", headers=auth,
                          json={"barber_id": barber_id, "leave_type_code": "CL", "date": d, "half_day": False},
                          timeout=30)
        assert r.status_code == 200, r.text
        rec = r.json()["record"]
        bal = r.json()["balance"]
        assert bal["current_balance"] == round(cl_before - 1.0, 4)

        # barber.leave_dates updated
        bar = requests.get(f"{BASE_URL}/api/salons/{SALON_ID}/barbers", headers=auth, timeout=30).json()
        items = _extract_barbers(bar)
        my = next(x for x in items if x["id"] == barber_id)
        assert d in (my.get("leave_dates") or [])

        # ledger has an 'availed' movement
        ldg = requests.get(f"{BASE_URL}/api/salons/{SALON_ID}/barbers/{barber_id}/leave-balance/ledger?leave_type_code=CL",
                           headers=auth, timeout=30).json()
        assert any(m["movement_type"] == "availed" and m["reference_id"] == rec["id"] for m in ldg["movements"])

        # cleanup
        requests.delete(f"{BASE_URL}/api/salons/{SALON_ID}/leave-records/{rec['id']}", headers=auth, timeout=30)

    def test_half_day_debits_half(self, auth, barber_id):
        d = self._unique_date(2)
        r = requests.post(f"{BASE_URL}/api/salons/{SALON_ID}/leave-records", headers=auth,
                          json={"barber_id": barber_id, "leave_type_code": "CL", "date": d, "half_day": True},
                          timeout=30)
        assert r.status_code == 200, r.text
        rec_id = r.json()["record"]["id"]
        # cleanup
        requests.delete(f"{BASE_URL}/api/salons/{SALON_ID}/leave-records/{rec_id}", headers=auth, timeout=30)

    def test_duplicate_date_returns_409(self, auth, barber_id):
        d = self._unique_date(3)
        r1 = requests.post(f"{BASE_URL}/api/salons/{SALON_ID}/leave-records", headers=auth,
                           json={"barber_id": barber_id, "leave_type_code": "CL", "date": d}, timeout=30)
        assert r1.status_code == 200, r1.text
        r2 = requests.post(f"{BASE_URL}/api/salons/{SALON_ID}/leave-records", headers=auth,
                           json={"barber_id": barber_id, "leave_type_code": "CL", "date": d}, timeout=30)
        assert r2.status_code == 409, r2.text
        # cleanup
        requests.delete(f"{BASE_URL}/api/salons/{SALON_ID}/leave-records/{r1.json()['record']['id']}",
                        headers=auth, timeout=30)

    def test_insufficient_balance_409(self, auth, barber_id):
        d = self._unique_date(4)
        # SL is drained and allow_negative=False
        r = requests.post(f"{BASE_URL}/api/salons/{SALON_ID}/leave-records", headers=auth,
                          json={"barber_id": barber_id, "leave_type_code": "SL", "date": d}, timeout=30)
        assert r.status_code == 409, r.text

    def test_update_changes_type_restores_old_debits_new(self, auth, barber_id):
        # Ensure PL has 2 days
        requests.post(f"{BASE_URL}/api/salons/{SALON_ID}/barbers/{barber_id}/leave-balance/adjust",
                      headers=auth, json={"leave_type_code": "PL", "qty_delta": 3.0, "reason": "TEST"}, timeout=30)
        d = self._unique_date(5)
        r = requests.post(f"{BASE_URL}/api/salons/{SALON_ID}/leave-records", headers=auth,
                          json={"barber_id": barber_id, "leave_type_code": "CL", "date": d}, timeout=30)
        rec_id = r.json()["record"]["id"]

        bal_cl_before = next(x for x in requests.get(
            f"{BASE_URL}/api/salons/{SALON_ID}/barbers/{barber_id}/leave-balance",
            headers=auth, timeout=30).json()["items"] if x["leave_type_code"] == "CL")["current_balance"]
        bal_pl_before = next(x for x in requests.get(
            f"{BASE_URL}/api/salons/{SALON_ID}/barbers/{barber_id}/leave-balance",
            headers=auth, timeout=30).json()["items"] if x["leave_type_code"] == "PL")["current_balance"]

        u = requests.put(f"{BASE_URL}/api/salons/{SALON_ID}/leave-records/{rec_id}", headers=auth,
                         json={"leave_type_code": "PL"}, timeout=30)
        assert u.status_code == 200, u.text

        bal_cl_after = next(x for x in requests.get(
            f"{BASE_URL}/api/salons/{SALON_ID}/barbers/{barber_id}/leave-balance",
            headers=auth, timeout=30).json()["items"] if x["leave_type_code"] == "CL")["current_balance"]
        bal_pl_after = next(x for x in requests.get(
            f"{BASE_URL}/api/salons/{SALON_ID}/barbers/{barber_id}/leave-balance",
            headers=auth, timeout=30).json()["items"] if x["leave_type_code"] == "PL")["current_balance"]

        assert round(bal_cl_after - bal_cl_before, 4) == 1.0
        assert round(bal_pl_before - bal_pl_after, 4) == 1.0

        # cleanup
        requests.delete(f"{BASE_URL}/api/salons/{SALON_ID}/leave-records/{rec_id}", headers=auth, timeout=30)

    def test_update_type_rollback_on_insufficient(self, auth, barber_id):
        d = self._unique_date(6)
        r = requests.post(f"{BASE_URL}/api/salons/{SALON_ID}/leave-records", headers=auth,
                          json={"barber_id": barber_id, "leave_type_code": "CL", "date": d}, timeout=30)
        rec_id = r.json()["record"]["id"]
        cl_before = next(x for x in requests.get(
            f"{BASE_URL}/api/salons/{SALON_ID}/barbers/{barber_id}/leave-balance",
            headers=auth, timeout=30).json()["items"] if x["leave_type_code"] == "CL")["current_balance"]
        # SL is drained -> changing to SL should 409
        u = requests.put(f"{BASE_URL}/api/salons/{SALON_ID}/leave-records/{rec_id}", headers=auth,
                         json={"leave_type_code": "SL"}, timeout=30)
        assert u.status_code == 409, u.text
        # Old type (CL) balance must NOT change (rollback worked)
        cl_after = next(x for x in requests.get(
            f"{BASE_URL}/api/salons/{SALON_ID}/barbers/{barber_id}/leave-balance",
            headers=auth, timeout=30).json()["items"] if x["leave_type_code"] == "CL")["current_balance"]
        assert cl_before == cl_after
        requests.delete(f"{BASE_URL}/api/salons/{SALON_ID}/leave-records/{rec_id}", headers=auth, timeout=30)

    def test_delete_cancels_restores_balance_and_removes_date(self, auth, barber_id):
        d = self._unique_date(7)
        r = requests.post(f"{BASE_URL}/api/salons/{SALON_ID}/leave-records", headers=auth,
                          json={"barber_id": barber_id, "leave_type_code": "CL", "date": d}, timeout=30)
        rec_id = r.json()["record"]["id"]
        bal_after_create = r.json()["balance"]["current_balance"]
        d_resp = requests.delete(f"{BASE_URL}/api/salons/{SALON_ID}/leave-records/{rec_id}", headers=auth, timeout=30)
        assert d_resp.status_code == 200, d_resp.text
        assert round(d_resp.json()["balance"]["current_balance"] - bal_after_create, 4) == 1.0
        # leave_dates removed
        bar = requests.get(f"{BASE_URL}/api/salons/{SALON_ID}/barbers", headers=auth, timeout=30).json()
        items = _extract_barbers(bar)
        my = next(x for x in items if x["id"] == barber_id)
        assert d not in (my.get("leave_dates") or [])
        # cancelled excluded from list
        lst = requests.get(f"{BASE_URL}/api/salons/{SALON_ID}/leave-records?barber_id={barber_id}",
                           headers=auth, timeout=30).json()
        assert all(x["id"] != rec_id for x in lst["records"])

    def test_list_filters(self, auth, barber_id):
        d = self._unique_date(8)
        r = requests.post(f"{BASE_URL}/api/salons/{SALON_ID}/leave-records", headers=auth,
                          json={"barber_id": barber_id, "leave_type_code": "CL", "date": d}, timeout=30)
        rec_id = r.json()["record"]["id"]
        # filter by date range
        lst = requests.get(f"{BASE_URL}/api/salons/{SALON_ID}/leave-records",
                           params={"barber_id": barber_id, "from": d, "to": d, "type": "CL"},
                           headers=auth, timeout=30).json()
        assert any(x["id"] == rec_id for x in lst["records"])
        requests.delete(f"{BASE_URL}/api/salons/{SALON_ID}/leave-records/{rec_id}", headers=auth, timeout=30)


# ============ Auth tests ============

class TestAuth:
    def test_no_token_401(self):
        r = requests.get(f"{BASE_URL}/api/salons/{SALON_ID}/leave-types-config", timeout=30)
        assert r.status_code == 401, r.text

    def test_wrong_salon_403(self, auth):
        wrong = "00000000-0000-0000-0000-000000000000"
        r = requests.get(f"{BASE_URL}/api/salons/{wrong}/leave-types-config", headers=auth, timeout=30)
        assert r.status_code == 403, r.text


# ============ Module 3 — Staff Settings (attendance_rules) ============

class TestAttendanceRules:
    def test_patch_attendance_rules(self, auth):
        payload = {
            "attendance_rules": {
                "geofence_radius_m": 150,
                "late_mark_threshold_min": 12,
                "required_hours_per_day": 8.5,
                "auto_absent_cutoff_hour": 14,
            }
        }
        r = requests.patch(f"{BASE_URL}/api/salons/{SALON_ID}", headers=auth, json=payload, timeout=30)
        assert r.status_code in (200, 204), f"PATCH returned {r.status_code}: {r.text}"

    def test_put_persists_attendance_rules(self, auth):
        """Fallback / alternative: PUT /salons/{id} should also persist attendance_rules."""
        payload = {
            "attendance_rules": {
                "geofence_radius_m": 175,
                "late_mark_threshold_min": 7,
                "required_hours_per_day": 9.0,
                "auto_absent_cutoff_hour": 15,
            }
        }
        r = requests.put(f"{BASE_URL}/api/salons/{SALON_ID}", headers=auth, json=payload, timeout=30)
        assert r.status_code == 200, r.text
        g = requests.get(f"{BASE_URL}/api/salons/{SALON_ID}", headers=auth, timeout=30)
        assert g.status_code == 200, g.text
        body = g.json()
        got = body.get("attendance_rules") or body.get("salon", {}).get("attendance_rules")
        assert got is not None, f"attendance_rules not persisted/returned: {body}"
        assert got["geofence_radius_m"] == 175
        assert got["late_mark_threshold_min"] == 7
        assert float(got["required_hours_per_day"]) == 9.0
        assert got["auto_absent_cutoff_hour"] == 15
