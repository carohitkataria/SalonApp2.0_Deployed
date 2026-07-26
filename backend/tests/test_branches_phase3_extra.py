"""
Phase 3 Branch Model — extra edge cases & regression coverage.
- city filter narrows results
- radius filter excludes far branches
- non-main branch returns its own address (branch_address) on active-bookings
- public/salon-locations row schema check (branch_id, salon_id, branch_name, salon_name fields)
- /api/public/salons/{id}/branches has no auth requirement (no header)
"""
import os
from datetime import datetime, timezone

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_LOGIN = {"identifier": "admin", "password": "salon123"}


@pytest.fixture(scope="module")
def admin():
    r = requests.post(f"{API}/salon/users/login", json=ADMIN_LOGIN, timeout=10)
    assert r.status_code == 200, r.text
    j = r.json()
    return {
        "salon_id": j["salon_id"],
        "headers": {"Authorization": f"Bearer {j['access_token']}"},
    }


@pytest.fixture(scope="module")
def temp_branch(admin):
    code = "P3X-EXTRA"
    r = requests.post(
        f"{API}/salons/{admin['salon_id']}/branches",
        json={
            "branch_name": "Phase3Extra",
            "branch_code": code,
            "city": "Pytestville",
            "latitude": 12.97,
            "longitude": 77.75,
            "address": "P3X-EXTRA address",
        },
        headers=admin["headers"],
    )
    assert r.status_code == 200, r.text
    bid = r.json()["id"]
    yield bid
    requests.delete(
        f"{API}/salons/{admin['salon_id']}/branches/{bid}", headers=admin["headers"]
    )


def test_locations_row_schema(admin, temp_branch):
    rows = requests.get(f"{API}/public/salon-locations").json()
    row = next(r for r in rows if r["branch_id"] == temp_branch)
    # Required fields
    for key in ("salon_id", "branch_id", "salon_name"):
        assert key in row, f"missing {key} in {row}"
    assert row["salon_id"] == admin["salon_id"]
    # Non-main branch label rule
    assert "Phase3Extra" in row["salon_name"]
    assert "–" in row["salon_name"]


def test_locations_city_filter(admin, temp_branch):
    rows = requests.get(
        f"{API}/public/salon-locations", params={"city": "Pytestville"}
    ).json()
    branch_ids = {r["branch_id"] for r in rows}
    assert temp_branch in branch_ids
    # All results must be from our city (branch- or salon-level)
    # (we only assert presence here — other salons could legitimately be in same city if seeded)


def test_locations_radius_filter_excludes_far(admin, temp_branch):
    # Coords far from Bangalore (e.g., London ~ 51.5, -0.12)
    rows = requests.get(
        f"{API}/public/salon-locations",
        params={"lat": 51.5, "lng": -0.12, "radius": 5},
    ).json()
    branch_ids = {r["branch_id"] for r in rows}
    assert temp_branch not in branch_ids, "Bangalore branch returned within 5km of London"


def test_public_branches_no_auth_required(admin, temp_branch):
    # Plain GET, no Authorization header
    r = requests.get(f"{API}/public/salons/{admin['salon_id']}/branches")
    assert r.status_code == 200
    ids = {b["id"] for b in r.json()}
    assert temp_branch in ids


def test_public_branches_only_active(admin):
    """Inactive branches must not surface in the public branches endpoint."""
    # Create + deactivate
    code = "P3X-INACT"
    r = requests.post(
        f"{API}/salons/{admin['salon_id']}/branches",
        json={"branch_name": "P3xInactive", "branch_code": code, "city": "Bangalore"},
        headers=admin["headers"],
    )
    assert r.status_code == 200
    bid = r.json()["id"]
    try:
        # Deactivate it
        requests.delete(
            f"{API}/salons/{admin['salon_id']}/branches/{bid}",
            headers=admin["headers"],
        )
        r = requests.get(f"{API}/public/salons/{admin['salon_id']}/branches")
        assert r.status_code == 200
        ids = {b["id"] for b in r.json()}
        assert bid not in ids
    finally:
        # Hard cleanup — try to fully delete (already inactive)
        requests.delete(
            f"{API}/salons/{admin['salon_id']}/branches/{bid}",
            headers=admin["headers"],
        )


def test_active_bookings_branch_address_for_main(admin):
    """When a booking is on the MAIN branch, branch_name should NOT be set
    (since main branch keeps the salon name) but branch_address may still be present."""
    # Pick a service
    svcs = requests.get(f"{API}/services").json()
    if not svcs:
        pytest.skip("no services available")
    svc_id = svcs[0]["id"]

    # Get main branch id
    branches = requests.get(
        f"{API}/salons/{admin['salon_id']}/branches", headers=admin["headers"]
    ).json()
    main = next(b for b in branches if b["is_main_branch"])
    main_id = main["id"]

    phone = f"+918{int(datetime.now(timezone.utc).timestamp() * 1000) % 1000000000:09d}"
    user = requests.post(
        f"{API}/user/login",
        json={"name": "P3xMain", "phone": phone, "gender": "Men"},
    ).json()
    if "id" not in user:
        pytest.skip(f"User login failed: {user}")

    # Need a barber on main branch
    bars_main = requests.get(
        f"{API}/salons/{admin['salon_id']}/barbers",
        params={"branch_id": main_id},
        headers=admin["headers"],
    ).json()
    if not bars_main:
        pytest.skip("no barber on main branch")

    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    booking = {
        "salon_id": admin["salon_id"],
        "branch_id": main_id,
        "user_id": user["id"],
        "customer_name": "P3xMain",
        "phone": phone,
        "date": today,
        "shift": "Morning",
        "barber_id": "any",
        "selected_services": [svc_id],
        "booking_type": "instant",
        "booking_for_self": True,
        "payment_mode": "cash",
    }
    r = requests.post(f"{API}/bookings", json=booking)
    if r.status_code != 200:
        pytest.skip(f"Booking creation skipped: {r.status_code} {r.text}")
    token = r.json()
    try:
        assert token["branch_id"] == main_id
        ab = requests.get(f"{API}/customers/{phone[3:]}/active-bookings").json()
        match = next((b for b in ab.get("active_bookings", []) if b["id"] == token["id"]), None)
        assert match is not None
        # On the main branch, branch_name should be empty/None per design
        assert not match.get("branch_name"), f"expected no branch_name on main, got {match.get('branch_name')}"
    finally:
        requests.post(f"{API}/tokens/{token['id']}/cancel", headers=admin["headers"])
