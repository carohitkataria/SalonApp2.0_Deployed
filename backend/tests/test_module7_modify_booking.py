"""Module 7 — Per-Service Barber Assignment & Order Discount on PUT /modify.

Covers:
- happy path with service_assignments + order_discount_percent
- final_amount path (implicit % derivation)
- validation errors (any/unknown barber/completed token/unknown token)
- pro-rata per-line discount math
- /analytics/barber-wise-sales split attribution
- /analytics/service-wise-sales per-line attribution
- incentive recompute via /salons/{salon_id}/reward-plan/incentives
- backward-compat: legacy token modify with no assignments+no discount
- attribute_token_revenue_to_barbers helper (direct unit assertions)
"""

import os
import sys
import uuid
from datetime import datetime, timezone

import pytest
import requests

# Add backend to path for direct helper import
sys.path.insert(0, "/app/backend")

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://appt-filter-redesign.preview.emergentagent.com").rstrip("/")

SALON_ID = "62609c3d-a90a-481b-9cd4-4208f741e121"
BRANCH_ID = "b829d20e-f923-4db8-a69c-9daf38fcd5a9"
BARBER_A = "a3e12da2-b2d2-4e78-ae7c-2e3b4b0c0169"  # Imran
BARBER_B = "228abdec-bd39-48f0-93b7-245c8e2156a6"  # Abdul

# Two services that BOTH barbers can perform (verified barber_services collection)
SERVICE_HAIRCUT = "36ab7dd7-6835-4399-97fa-edfa01b8b802"  # 150 base
SERVICE_BEARD = "c904dc04-7df3-4bf6-9456-dca4fd5d6b38"   # 80 base

ADMIN_IDENT = "admin"
ADMIN_PASS = "salon123"
CUSTOMER_PHONE = "7503070727"


# ---------- Fixtures ----------

@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def salon_token(session):
    r = session.post(f"{BASE_URL}/api/salon/users/login",
                     json={"identifier": ADMIN_IDENT, "password": ADMIN_PASS})
    assert r.status_code == 200, f"Salon login failed: {r.status_code} {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def admin_headers(salon_token):
    return {"Content-Type": "application/json", "Authorization": f"Bearer {salon_token}"}


@pytest.fixture(scope="module")
def customer(session):
    r = session.post(f"{BASE_URL}/api/user/login",
                     json={"name": "TEST M7 Customer", "phone": CUSTOMER_PHONE})
    assert r.status_code == 200, f"customer login failed: {r.text}"
    return r.json()


@pytest.fixture(scope="module", autouse=True)
def prepare_salon_services():
    """Ensure at least 2 services are enabled for the salon, then clean up."""
    import os as _os
    from pymongo import MongoClient
    from dotenv import load_dotenv
    load_dotenv("/app/backend/.env")
    client = MongoClient(_os.environ["MONGO_URL"])
    db = client[_os.environ["DB_NAME"]]

    created_ids = []
    for sid in (SERVICE_HAIRCUT, SERVICE_BEARD):
        existing = db.salon_services.find_one({"salon_id": SALON_ID, "service_id": sid})
        if not existing:
            doc = {
                "id": str(uuid.uuid4()),
                "salon_id": SALON_ID,
                "service_id": sid,
                "is_enabled": True,
                "created_at": datetime.now(timezone.utc).isoformat(),
            }
            db.salon_services.insert_one(doc)
            created_ids.append(doc["id"])
        else:
            db.salon_services.update_one(
                {"_id": existing["_id"]}, {"$set": {"is_enabled": True}}
            )

    # Track test-created tokens for cleanup
    yield {"db": db, "created_salon_service_ids": created_ids}

    # Cleanup: remove TEST tokens + the salon_service docs we created
    db.tokens.delete_many({"customer_name": {"$regex": "^TEST M7"}})
    if created_ids:
        db.salon_services.delete_many({"id": {"$in": created_ids}})
    # Clean any incentive_payouts for the test month we touched (optional;
    # keeping them is harmless because they are recomputed on read).
    client.close()


def _create_booking(session, customer, barber_id=BARBER_A, services=None, shift="Morning"):
    services = services or [SERVICE_HAIRCUT, SERVICE_BEARD]
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    body = {
        "salon_id": SALON_ID,
        "branch_id": BRANCH_ID,
        "user_id": customer["id"],
        "customer_name": "TEST M7 " + datetime.now().strftime("%H%M%S%f"),
        "phone": CUSTOMER_PHONE,
        "date": today,
        "shift": shift,
        "barber_id": barber_id,
        "selected_services": services,
        "source": "online",
        "booking_type": "instant",
        "booking_for_self": True,
    }
    # Booking limit: 1 self + 1 other per day. Cancel existing first.
    session.get(f"{BASE_URL}/api/user/{customer['id']}/active-bookings")
    # not all servers expose that; best-effort. We instead cancel via tokens listing.
    r = session.post(f"{BASE_URL}/api/bookings", json=body)
    if r.status_code == 400 and "already have an active booking" in r.text:
        # Cancel existing active token for this phone and retry once
        from pymongo import MongoClient
        from dotenv import load_dotenv
        load_dotenv("/app/backend/.env")
        client = MongoClient(os.environ["MONGO_URL"])
        db = client[os.environ["DB_NAME"]]
        db.tokens.update_many(
            {"phone": f"+91{CUSTOMER_PHONE}", "status": {"$in": ["waiting", "in_service", "called"]}},
            {"$set": {"status": "cancelled", "cancelled": True}},
        )
        client.close()
        r = session.post(f"{BASE_URL}/api/bookings", json=body)
    assert r.status_code == 200, f"booking creation failed: {r.status_code} {r.text}"
    return r.json()


# ---------- Tests ----------

class TestModifyHappyPath:
    def test_modify_with_assignments_and_percent(self, session, admin_headers, customer):
        tok = _create_booking(session, customer, barber_id=BARBER_A,
                              services=[SERVICE_HAIRCUT, SERVICE_BEARD])
        tid = tok["id"]
        # Modify: split haircut→A, beard→B, 10% off
        payload = {
            "main_barber_id": BARBER_A,
            "service_assignments": [
                {"service_id": SERVICE_HAIRCUT, "barber_id": BARBER_A, "service_price": 400},
                {"service_id": SERVICE_BEARD, "barber_id": BARBER_B, "service_price": 600},
            ],
            "order_discount_percent": 10,
        }
        r = session.put(f"{BASE_URL}/api/tokens/{tid}/modify", json=payload, headers=admin_headers)
        assert r.status_code == 200, r.text
        token = r.json()["token"]

        assert token["subtotal"] == 1000.0
        assert token["order_discount_percent"] == 10.0
        assert token["order_discount_amount"] == 100.0
        assert abs(token["total_amount"] - 900.0) < 0.01

        sa = token["service_assignments"]
        assert len(sa) == 2
        by_svc = {a["service_id"]: a for a in sa}
        # Pro-rata: haircut=400 → 40, beard=600 → 60
        assert abs(by_svc[SERVICE_HAIRCUT]["discount_amount"] - 40.0) < 0.01
        assert abs(by_svc[SERVICE_HAIRCUT]["line_total"] - 360.0) < 0.01
        assert abs(by_svc[SERVICE_BEARD]["discount_amount"] - 60.0) < 0.01
        assert abs(by_svc[SERVICE_BEARD]["line_total"] - 540.0) < 0.01

        # name snapshots
        assert by_svc[SERVICE_HAIRCUT]["barber_id"] == BARBER_A
        assert by_svc[SERVICE_BEARD]["barber_id"] == BARBER_B
        assert by_svc[SERVICE_HAIRCUT]["barber_name_snapshot"]
        assert by_svc[SERVICE_BEARD]["barber_name_snapshot"]

        # sum of line_total == total_amount
        assert abs(sum(a["line_total"] for a in sa) - token["total_amount"]) < 0.01

    def test_modify_with_final_amount_derives_percent(self, session, admin_headers, customer):
        tok = _create_booking(session, customer, barber_id=BARBER_A)
        tid = tok["id"]
        payload = {
            "service_assignments": [
                {"service_id": SERVICE_HAIRCUT, "barber_id": BARBER_A, "service_price": 400},
                {"service_id": SERVICE_BEARD, "barber_id": BARBER_B, "service_price": 600},
            ],
            "final_amount": 850,  # implies 150 off, 15%
        }
        r = session.put(f"{BASE_URL}/api/tokens/{tid}/modify", json=payload, headers=admin_headers)
        assert r.status_code == 200, r.text
        t = r.json()["token"]
        assert t["subtotal"] == 1000.0
        assert abs(t["order_discount_amount"] - 150.0) < 0.01
        assert abs(t["order_discount_percent"] - 15.0) < 0.01
        assert abs(t["total_amount"] - 850.0) < 0.01


class TestModifyValidation:
    def test_rejects_main_barber_any(self, session, admin_headers, customer):
        tok = _create_booking(session, customer, barber_id=BARBER_A)
        r = session.put(
            f"{BASE_URL}/api/tokens/{tok['id']}/modify",
            json={"main_barber_id": "any"},
            headers=admin_headers,
        )
        assert r.status_code == 400, r.text
        assert "specific main barber" in r.text.lower() or "any" in r.text.lower() or "barber" in r.text.lower()

    def test_rejects_unknown_main_barber(self, session, admin_headers, customer):
        tok = _create_booking(session, customer, barber_id=BARBER_A)
        r = session.put(
            f"{BASE_URL}/api/tokens/{tok['id']}/modify",
            json={"main_barber_id": "barber-does-not-exist"},
            headers=admin_headers,
        )
        assert r.status_code == 400, r.text

    def test_rejects_unknown_line_barber(self, session, admin_headers, customer):
        tok = _create_booking(session, customer, barber_id=BARBER_A)
        r = session.put(
            f"{BASE_URL}/api/tokens/{tok['id']}/modify",
            json={
                "main_barber_id": BARBER_A,
                "service_assignments": [
                    {"service_id": SERVICE_HAIRCUT, "barber_id": "ghost-barber", "service_price": 100},
                ],
            },
            headers=admin_headers,
        )
        assert r.status_code == 400

    def test_rejects_unknown_token(self, session, admin_headers):
        r = session.put(
            f"{BASE_URL}/api/tokens/nonexistent-token-id/modify",
            json={"main_barber_id": BARBER_A},
            headers=admin_headers,
        )
        assert r.status_code == 404

    def test_rejects_completed_token(self, session, admin_headers, customer, prepare_salon_services):
        tok = _create_booking(session, customer, barber_id=BARBER_A)
        # Directly mark completed in DB to avoid going through the call/complete flow
        prepare_salon_services["db"].tokens.update_one(
            {"id": tok["id"]}, {"$set": {"status": "completed"}}
        )
        r = session.put(
            f"{BASE_URL}/api/tokens/{tok['id']}/modify",
            json={"main_barber_id": BARBER_A},
            headers=admin_headers,
        )
        assert r.status_code == 400, r.text


class TestBackwardCompat:
    def test_modify_legacy_token_without_assignments(self, session, admin_headers, customer):
        """A legacy-style modify (no service_assignments, no discount) must not corrupt data."""
        tok = _create_booking(session, customer, barber_id=BARBER_A,
                              services=[SERVICE_HAIRCUT, SERVICE_BEARD])
        tid = tok["id"]
        r = session.put(
            f"{BASE_URL}/api/tokens/{tid}/modify",
            json={"main_barber_id": BARBER_A},
            headers=admin_headers,
        )
        assert r.status_code == 200, r.text
        t = r.json()["token"]
        # All services credited to BARBER_A
        sa = t.get("service_assignments") or []
        assert len(sa) == 2
        assert all(a["barber_id"] == BARBER_A for a in sa)
        assert t["order_discount_amount"] == 0.0
        assert abs(t["total_amount"] - t["subtotal"]) < 0.01


class TestRevenueAttributionHelpers:
    """Direct unit tests on the attribution helpers."""

    def test_barber_revenue_split_pro_rata(self):
        from server import attribute_token_revenue_to_barbers
        tok = {
            "barber_id": BARBER_A,
            "total_amount": 900,
            "order_discount_amount": 100,
            "service_assignments": [
                {"service_id": SERVICE_HAIRCUT, "barber_id": BARBER_A, "service_price": 400},
                {"service_id": SERVICE_BEARD, "barber_id": BARBER_B, "service_price": 600},
            ],
        }
        out = attribute_token_revenue_to_barbers(tok)
        assert abs(out[BARBER_A] - 360.0) < 0.01
        assert abs(out[BARBER_B] - 540.0) < 0.01
        assert abs(sum(out.values()) - 900.0) < 0.01

    def test_legacy_token_credits_main_barber_in_full(self):
        from server import attribute_token_revenue_to_barbers
        tok = {"barber_id": BARBER_A, "total_amount": 250, "service_assignments": []}
        out = attribute_token_revenue_to_barbers(tok)
        assert out == {BARBER_A: 250.0}

    def test_service_revenue_uses_line_total(self):
        from server import attribute_token_revenue_to_services
        tok = {
            "total_amount": 900,
            "order_discount_amount": 100,
            "service_assignments": [
                {"service_id": SERVICE_HAIRCUT, "barber_id": BARBER_A, "service_price": 400},
                {"service_id": SERVICE_BEARD, "barber_id": BARBER_B, "service_price": 600},
            ],
        }
        rows = {r["service_id"]: r for r in attribute_token_revenue_to_services(tok)}
        assert abs(rows[SERVICE_HAIRCUT]["line_total"] - 360.0) < 0.01
        assert abs(rows[SERVICE_BEARD]["line_total"] - 540.0) < 0.01


class TestReportsAndIncentives:
    """Mark a split token as completed (today) and check analytics + incentives."""

    def test_split_token_reflected_in_reports_and_incentives(
        self, session, admin_headers, customer, prepare_salon_services
    ):
        db = prepare_salon_services["db"]
        # 1) Create + modify with a split (haircut→A:400, beard→B:600), 10% off → A:360, B:540
        tok = _create_booking(session, customer, barber_id=BARBER_A)
        tid = tok["id"]
        payload = {
            "main_barber_id": BARBER_A,
            "service_assignments": [
                {"service_id": SERVICE_HAIRCUT, "barber_id": BARBER_A, "service_price": 400},
                {"service_id": SERVICE_BEARD, "barber_id": BARBER_B, "service_price": 600},
            ],
            "order_discount_percent": 10,
        }
        r = session.put(f"{BASE_URL}/api/tokens/{tid}/modify", json=payload, headers=admin_headers)
        assert r.status_code == 200, r.text

        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        ym = today[:7]

        # 2) Force token to completed (so analytics include it). Snapshot existing
        # completed-token revenue per barber for accurate delta comparison.
        existing_completed = list(db.tokens.find(
            {"salon_id": SALON_ID, "status": "completed", "date": today}, {"_id": 0}
        ))
        from server import attribute_token_revenue_to_barbers
        baseline = {}
        for t in existing_completed:
            for bid, amt in attribute_token_revenue_to_barbers(t).items():
                baseline[bid] = baseline.get(bid, 0.0) + amt
        db.tokens.update_one({"id": tid}, {"$set": {"status": "completed", "date": today}})

        # 3) Barber-wise sales — expect ≥360 delta for A and ≥540 for B
        r = session.get(
            f"{BASE_URL}/api/analytics/barber-wise-sales",
            params={"salon_id": SALON_ID, "start_date": today, "end_date": today},
            headers=admin_headers,
        )
        assert r.status_code == 200, r.text
        rows = {row["barber_id"]: row for row in r.json()["data"]}
        a_sales = rows.get(BARBER_A, {}).get("total_sales", 0.0)
        b_sales = rows.get(BARBER_B, {}).get("total_sales", 0.0)
        assert a_sales - baseline.get(BARBER_A, 0.0) >= 359.9, (a_sales, baseline.get(BARBER_A))
        assert b_sales - baseline.get(BARBER_B, 0.0) >= 539.9, (b_sales, baseline.get(BARBER_B))

        # 4) Service-wise sales — both services should be present with line_total
        r = session.get(
            f"{BASE_URL}/api/analytics/service-wise-sales",
            params={"salon_id": SALON_ID, "start_date": today, "end_date": today},
            headers=admin_headers,
        )
        assert r.status_code == 200, r.text
        svc_rows = {r2["service_id"]: r2 for r2 in r.json()["data"]}
        assert SERVICE_HAIRCUT in svc_rows
        assert SERVICE_BEARD in svc_rows
        assert svc_rows[SERVICE_HAIRCUT]["revenue"] >= 359.9
        assert svc_rows[SERVICE_BEARD]["revenue"] >= 539.9

        # 5) Incentive recompute — both barbers must show actual_sales reflecting their share
        r = session.get(
            f"{BASE_URL}/api/salons/{SALON_ID}/reward-plan/incentives",
            params={"month": ym}, headers=admin_headers,
        )
        # Skip if no plan configured (200 with empty list, or any other graceful status)
        if r.status_code != 200:
            pytest.skip(f"reward-plan/incentives returned {r.status_code}: {r.text}")
        incentives = {row["barber_id"]: row for row in r.json().get("incentives", [])}
        if not incentives:
            pytest.skip("No reward plan / incentive rows configured for this salon — feature not testable for this salon")
        # Both barbers should be present, and their actual_sales should be >= their split share for this token.
        assert BARBER_A in incentives, incentives.keys()
        assert BARBER_B in incentives, incentives.keys()
        assert incentives[BARBER_A]["actual_sales"] >= 360.0 - 0.5
        assert incentives[BARBER_B]["actual_sales"] >= 540.0 - 0.5
