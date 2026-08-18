"""
Iteration 29 backend tests — MD Phase 2 + 4 items.

Coverage:
 - Item 2: Attendance staff-report emits marked_by_label & marked_by_name; CSV headers include 'Marked By'/'Marked By Name'.
 - Item 4: Service POST/PUT accept & echo home_* fields.
 - Item 10: Guest booking POST works end-to-end (creates booking in DB).
"""
import os, csv, io, uuid, requests, pytest

BASE_URL = (os.environ.get("REACT_APP_BACKEND_URL") or "https://appt-filter-redesign.preview.emergentagent.com").rstrip("/")
SALON_ID = "58db26fa-f807-4305-9c86-313d3f1b35f3"


# --------- Fixtures ---------
@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(
        f"{BASE_URL}/api/salon/users/login",
        json={"identifier": "admin", "password": "salon123", "salon_phone": "+917503070727"},
        timeout=20,
    )
    if r.status_code != 200:
        r = requests.post(
            f"{BASE_URL}/api/salon/users/login",
            json={"identifier": "admin", "password": "salon123"},
            timeout=20,
        )
    assert r.status_code == 200, f"Admin login failed: {r.status_code} {r.text[:300]}"
    return r.json().get("access_token")


@pytest.fixture(scope="module")
def admin_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def legacy_salon_headers():
    """Legacy salon token (role='salon') needed for /api/services CRUD."""
    r = requests.post(
        f"{BASE_URL}/api/salon/password-login",
        json={"phone": "7503070727", "password": "TestSalon#2026"},
        timeout=20,
    )
    assert r.status_code == 200, f"Legacy salon login failed: {r.status_code} {r.text[:300]}"
    tok = r.json()["access_token"]
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


# --------- Item 2: Attendance Staff Report marked-by ---------
class TestAttendanceReportMarkedBy:
    def test_report_json_has_marked_by_fields(self, admin_headers):
        r = requests.get(
            f"{BASE_URL}/api/salons/{SALON_ID}/staff-attendance/report",
            params={"start_date": "2026-06-01", "end_date": "2026-06-30"},
            headers=admin_headers,
            timeout=20,
        )
        assert r.status_code == 200, f"{r.status_code} {r.text[:300]}"
        data = r.json()
        rows = data.get("rows") or data.get("records") or []
        assert isinstance(rows, list), data
        if rows:
            sample = rows[0]
            assert "marked_by_label" in sample, f"missing marked_by_label in row keys: {list(sample.keys())}"
            assert "marked_by_name" in sample
            assert sample["marked_by_label"] in ("Auto", "Admin", "Staff", "—"), sample["marked_by_label"]
        else:
            print("WARN: no attendance rows returned for June; field-presence check skipped.")

    def test_report_csv_headers_include_marked_by(self, admin_headers):
        r = requests.get(
            f"{BASE_URL}/api/salons/{SALON_ID}/staff-attendance/report",
            params={"start_date": "2026-06-01", "end_date": "2026-06-30", "format": "csv"},
            headers=admin_headers,
            timeout=20,
        )
        assert r.status_code == 200, f"{r.status_code} {r.text[:300]}"
        content = r.content.decode("utf-8")
        reader = csv.reader(io.StringIO(content))
        header = next(reader)
        assert "Marked By" in header, header
        assert "Marked By Name" in header, header


# --------- Item 4: Service at-home pricing fields ---------
class TestServiceAtHomeFields:
    def test_create_and_update_service_with_home_fields(self, legacy_salon_headers, admin_headers):
        payload = {
            "service_name": f"TEST_AtHome_{uuid.uuid4().hex[:8]}",
            "category": "Other",
            "default_duration": 30,
            "base_price": 500,
            "available_at_home": True,
            "home_price": 700,
            "home_min_order_value": 999,
            "home_min_items": 2,
            "home_travel_fee": 99,
            "home_service_radius_km": 6.5,
        }
        r = requests.post(
            f"{BASE_URL}/api/services",
            json=payload, headers=legacy_salon_headers, timeout=20,
        )
        assert r.status_code in (200, 201), f"{r.status_code} {r.text[:300]}"
        created = r.json()
        sid = created.get("id")
        assert sid, created
        assert created.get("home_price") == 700
        assert created.get("home_min_order_value") == 999
        assert created.get("home_min_items") == 2
        assert created.get("home_travel_fee") == 99
        assert float(created.get("home_service_radius_km")) == 6.5
        assert created.get("available_at_home") is True

        # GET list and re-check persistence
        r2 = requests.get(f"{BASE_URL}/api/salons/{SALON_ID}/services/all", headers=admin_headers, timeout=15)
        assert r2.status_code == 200, r2.text[:300]
        body2 = r2.json()
        services = body2 if isinstance(body2, list) else (body2.get("services") or [])
        match = next((s for s in services if s.get("id") == sid), None)
        assert match, f"Created service {sid} not found in list"
        assert match.get("home_price") == 700

        # PUT update home_price + travel fee
        upd = requests.put(
            f"{BASE_URL}/api/services/{sid}",
            json={"home_price": 850, "home_travel_fee": 49},
            headers=legacy_salon_headers, timeout=20,
        )
        assert upd.status_code in (200, 204), f"{upd.status_code} {upd.text[:300]}"
        if upd.status_code == 200:
            body = upd.json()
            assert body["home_price"] == 850
            assert body["home_travel_fee"] == 49

        # Re-fetch
        r3 = requests.get(f"{BASE_URL}/api/salons/{SALON_ID}/services/all", headers=admin_headers, timeout=15)
        body3 = r3.json()
        services = body3 if isinstance(body3, list) else (body3.get("services") or [])
        match = next((s for s in services if s.get("id") == sid), None)
        assert match["home_price"] == 850
        assert match["home_travel_fee"] == 49

        # Cleanup
        requests.delete(f"{BASE_URL}/api/services/{sid}", headers=legacy_salon_headers, timeout=15)

    def test_set_classic_beard_home_price(self, legacy_salon_headers, admin_headers):
        """Set 'Classic Beard Trim' home_price=320 for UI verification."""
        r = requests.get(f"{BASE_URL}/api/salons/{SALON_ID}/services/all", headers=admin_headers, timeout=15)
        body = r.json()
        services = body if isinstance(body, list) else (body.get("services") or [])
        cbt = next(
            (s for s in services
             if isinstance(s, dict)
             and "beard" in (s.get("service_name") or s.get("name") or "").lower()
             and "trim" in (s.get("service_name") or s.get("name") or "").lower()),
            None,
        )
        if not cbt:
            pytest.skip("Classic Beard Trim not in seed.")
        original_home_price = cbt.get("home_price")
        upd = requests.put(
            f"{BASE_URL}/api/services/{cbt['id']}",
            json={"home_price": 320, "available_at_home": True},
            headers=legacy_salon_headers, timeout=20,
        )
        assert upd.status_code in (200, 204), f"{upd.status_code} {upd.text[:300]}"
        r2 = requests.get(f"{BASE_URL}/api/salons/{SALON_ID}/services/all", headers=admin_headers, timeout=15)
        body2 = r2.json()
        services = body2 if isinstance(body2, list) else (body2.get("services") or [])
        cbt2 = next((s for s in services if s["id"] == cbt["id"]), None)
        assert cbt2["home_price"] == 320
        assert cbt2.get("available_at_home") is True
        print(f"NOTE: classic-beard-trim original home_price was {original_home_price}; left at 320 for UI test.")


# --------- Item 10: Guest booking creation ---------
class TestGuestBookingPost:
    def test_guest_booking_creates(self, admin_headers):
        sv_resp = requests.get(f"{BASE_URL}/api/salons/{SALON_ID}/services/enabled", timeout=15)
        body = sv_resp.json()
        services = body if isinstance(body, list) else (body.get("services") or [])
        assert services, f"No enabled services on salon: {body}"
        svc = services[0]

        from datetime import datetime, timezone as tz, timedelta
        ist = tz(timedelta(hours=5, minutes=30))
        booking_date = (datetime.now(ist) + timedelta(days=2)).strftime("%Y-%m-%d")

        payload = {
            "salon_id": SALON_ID,
            "user_id": "guest-" + uuid.uuid4().hex[:8],
            "customer_name": "TEST Guest",
            "phone": "9876500099",
            "date": booking_date,
            "shift": "Morning",
            "barber_id": "any",
            "selected_services": [svc["id"]],
            "source": "online",
            "booking_type": "future",
            "booking_for_self": True,
            "customer_gender": "male",
            "is_guest": True,
            "payment_mode": "cash",
        }
        r = requests.post(f"{BASE_URL}/api/bookings", json=payload, timeout=25)
        assert r.status_code in (200, 201), f"Guest booking failed: {r.status_code} {r.text[:400]}"
        body = r.json()
        booking_id = body.get("id")
        assert booking_id, body
        assert body.get("phone", "").endswith("9876500099")
        print(f"Guest booking OK: id={booking_id}, token_number={body.get('token_number')}")
