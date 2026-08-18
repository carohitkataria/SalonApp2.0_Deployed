"""Tests for Operational Hours, Manual Toggle, and Booking Availability APIs."""
import os
import copy
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://appt-filter-redesign.preview.emergentagent.com").rstrip("/")
SALON_ID = "a356c4e6-274f-40e7-9a37-66d3a4613d17"


@pytest.fixture(scope="module")
def client():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    # Authenticate as salon
    r = s.post(f"{BASE_URL}/api/salon/password-login",
               json={"phone": "+917503070727", "password": "salon123"})
    assert r.status_code == 200, f"Salon login failed: {r.status_code} {r.text}"
    token = r.json()["access_token"]
    s.headers.update({"Authorization": f"Bearer {token}"})
    return s


@pytest.fixture(scope="module")
def original_state(client):
    """Snapshot original operational hours + manual toggle, restore at end."""
    r = client.get(f"{BASE_URL}/api/salons/{SALON_ID}/operational-hours")
    assert r.status_code == 200
    original = r.json()
    yield original
    # restore
    client.put(f"{BASE_URL}/api/salons/{SALON_ID}/operational-hours",
               json=original["operational_hours"])
    mt = original.get("manual_toggle") or {}
    client.put(f"{BASE_URL}/api/salons/{SALON_ID}/manual-toggle",
               json={"is_overridden": mt.get("is_overridden", False),
                     "is_open": mt.get("is_open", True)})


# ---------- Operational Hours ----------
class TestOperationalHours:
    def test_get_returns_all_seven_days(self, client):
        r = client.get(f"{BASE_URL}/api/salons/{SALON_ID}/operational-hours")
        assert r.status_code == 200
        oh = r.json().get("operational_hours", {})
        for day in ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]:
            assert day in oh, f"Missing day: {day}"
            assert "opening_time" in oh[day]
            assert "closing_time" in oh[day]
            assert "is_holiday" in oh[day]

    def test_put_updates_schedule_persists(self, client, original_state):
        new_hours = copy.deepcopy(original_state["operational_hours"])
        new_hours["monday"] = {
            "is_holiday": False, "opening_time": "09:00", "closing_time": "20:00",
            "lunch_start": "12:30", "lunch_end": "13:30"
        }
        r = client.put(f"{BASE_URL}/api/salons/{SALON_ID}/operational-hours",
                       json=new_hours)
        assert r.status_code == 200
        # verify persistence
        g = client.get(f"{BASE_URL}/api/salons/{SALON_ID}/operational-hours")
        mon = g.json()["operational_hours"]["monday"]
        assert mon["opening_time"] == "09:00"
        assert mon["closing_time"] == "20:00"
        assert mon["lunch_start"] == "12:30"

    def test_put_marks_holiday(self, client, original_state):
        hours = copy.deepcopy(original_state["operational_hours"])
        hours["wednesday"]["is_holiday"] = True
        r = client.put(f"{BASE_URL}/api/salons/{SALON_ID}/operational-hours",
                       json=hours)
        assert r.status_code == 200
        g = client.get(f"{BASE_URL}/api/salons/{SALON_ID}/operational-hours")
        assert g.json()["operational_hours"]["wednesday"]["is_holiday"] is True


# ---------- Manual Toggle ----------
class TestManualToggle:
    def test_set_manual_open(self, client):
        r = client.put(f"{BASE_URL}/api/salons/{SALON_ID}/manual-toggle",
                       json={"is_overridden": True, "is_open": True})
        assert r.status_code == 200
        g = client.get(f"{BASE_URL}/api/salons/{SALON_ID}/operational-hours").json()
        assert g["manual_toggle"]["is_overridden"] is True
        assert g["manual_toggle"]["is_open"] is True

    def test_set_manual_closed(self, client):
        r = client.put(f"{BASE_URL}/api/salons/{SALON_ID}/manual-toggle",
                       json={"is_overridden": True, "is_open": False})
        assert r.status_code == 200
        g = client.get(f"{BASE_URL}/api/salons/{SALON_ID}/operational-hours").json()
        assert g["manual_toggle"]["is_open"] is False

    def test_clear_override(self, client):
        r = client.put(f"{BASE_URL}/api/salons/{SALON_ID}/manual-toggle",
                       json={"is_overridden": False, "is_open": True})
        assert r.status_code == 200
        g = client.get(f"{BASE_URL}/api/salons/{SALON_ID}/operational-hours").json()
        assert g["manual_toggle"]["is_overridden"] is False


# ---------- Booking Availability ----------
class TestBookingAvailability:
    def test_manual_closed_blocks_bookings(self, client):
        client.put(f"{BASE_URL}/api/salons/{SALON_ID}/manual-toggle",
                   json={"is_overridden": True, "is_open": False})
        r = client.get(f"{BASE_URL}/api/salons/{SALON_ID}/is-accepting-bookings")
        assert r.status_code == 200
        d = r.json()
        assert d["is_accepting_bookings"] is False
        assert "manual" in d["reason"].lower() or "closed" in d.get("message", "").lower()

    def test_manual_open_allows_bookings(self, client):
        client.put(f"{BASE_URL}/api/salons/{SALON_ID}/manual-toggle",
                   json={"is_overridden": True, "is_open": True})
        r = client.get(f"{BASE_URL}/api/salons/{SALON_ID}/is-accepting-bookings")
        assert r.status_code == 200
        assert r.json()["is_accepting_bookings"] is True

    def test_holiday_blocks_when_no_override(self, client, original_state):
        """When override cleared, booking acceptance depends on day's holiday flag."""
        # Mark ALL days as holidays to guarantee "today" is a holiday regardless of date
        all_hol = copy.deepcopy(original_state["operational_hours"])
        for d in all_hol:
            all_hol[d]["is_holiday"] = True
        client.put(f"{BASE_URL}/api/salons/{SALON_ID}/operational-hours",
                   json=all_hol)
        client.put(f"{BASE_URL}/api/salons/{SALON_ID}/manual-toggle",
                   json={"is_overridden": False, "is_open": True})
        r = client.get(f"{BASE_URL}/api/salons/{SALON_ID}/is-accepting-bookings")
        assert r.status_code == 200
        d = r.json()
        assert d["is_accepting_bookings"] is False
        assert "holiday" in (d.get("reason", "") + d.get("message", "")).lower()

    def test_non_holiday_allows_bookings_no_override(self, client, original_state):
        """With no override and no holidays, bookings should be accepted (lunch must NOT block)."""
        no_hol = copy.deepcopy(original_state["operational_hours"])
        for d in no_hol:
            no_hol[d]["is_holiday"] = False
            # Force "now" to be inside lunch window to verify lunch doesn't block
            no_hol[d]["opening_time"] = "00:00"
            no_hol[d]["closing_time"] = "23:59"
            no_hol[d]["lunch_start"] = "00:00"
            no_hol[d]["lunch_end"] = "23:59"
        client.put(f"{BASE_URL}/api/salons/{SALON_ID}/operational-hours",
                   json=no_hol)
        client.put(f"{BASE_URL}/api/salons/{SALON_ID}/manual-toggle",
                   json={"is_overridden": False, "is_open": True})
        r = client.get(f"{BASE_URL}/api/salons/{SALON_ID}/is-accepting-bookings")
        assert r.status_code == 200
        d = r.json()
        assert d["is_accepting_bookings"] is True, f"Lunch time should NOT block bookings: {d}"
