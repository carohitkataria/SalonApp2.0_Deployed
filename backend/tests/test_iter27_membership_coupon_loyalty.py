"""
Iteration 27 backend tests: Membership plan CRUD (with plan_type/discount_percent
and editable amount), Coupon max_discount cap, Loyalty program credit_destination
tiers, /api/bookings auto-apply discount membership + stacking with coupon,
and customer membership enrichment endpoints.
"""
import os
import uuid
import asyncio
from datetime import datetime, timedelta, timezone

import pytest
import requests
from motor.motor_asyncio import AsyncIOMotorClient

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://appt-filter-redesign.preview.emergentagent.com").rstrip("/")
SALON_ID = "5ddd4a6e-20f3-4982-b4b4-8e75a5cfd4ae"
TEST_PHONE = "+917503070727"
TEST_PHONE2 = "+919000000027"   # customer WITHOUT discount membership
MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "test_database")

# ---------- fixtures ----------

@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{BASE_URL}/api/salon/users/login",
                      json={"identifier": "admin", "password": "salon123"}, timeout=30)
    assert r.status_code == 200, f"admin login failed: {r.status_code} {r.text}"
    return r.json()["access_token"]

@pytest.fixture(scope="module")
def headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}", "Content-Type": "application/json"}

@pytest.fixture(scope="module")
def salon_meta(headers):
    b = requests.get(f"{BASE_URL}/api/salons/{SALON_ID}/barbers", headers=headers, timeout=30).json()
    barbers = b if isinstance(b, list) else b.get("barbers", [])
    active = [x for x in barbers if x.get("is_active", True) and not x.get("on_leave")]
    barber = active[0] if active else barbers[0]
    s = requests.get(f"{BASE_URL}/api/salons/{SALON_ID}/services/enabled", timeout=30).json()
    return {"barber_id": barber["id"], "service_id": s[0]["id"], "service_price": s[0]["base_price"]}

@pytest.fixture(scope="module")
def db():
    client = AsyncIOMotorClient(MONGO_URL)
    return client[DB_NAME]

def _run(coro):
    return asyncio.get_event_loop().run_until_complete(coro)


# ---------- 1. Membership plan CRUD ----------

class TestMembershipPlanCRUD:
    plan_discount_id = None
    plan_credit_id = None

    def test_create_discount_plan(self, headers):
        body = {
            "salon_id": SALON_ID,
            "name": "TEST_Discount_Plan",
            "amount": 999,
            "credit": 0,
            "validity_months": 12,
            "terms_conditions": "TEST tc",
            "plan_type": "discount",
            "discount_percent": 15,
        }
        r = requests.post(f"{BASE_URL}/api/salons/{SALON_ID}/membership-plans", headers=headers, json=body, timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["plan_type"] == "discount"
        assert d["discount_percent"] == 15
        assert d["amount"] == 999
        TestMembershipPlanCRUD.plan_discount_id = d["id"]

    def test_create_credit_plan(self, headers):
        body = {
            "salon_id": SALON_ID,
            "name": "TEST_Credit_Plan",
            "amount": 1000,
            "credit": 1200,
            "validity_months": 6,
            "terms_conditions": "TEST tc",
            "plan_type": "credit",
        }
        r = requests.post(f"{BASE_URL}/api/salons/{SALON_ID}/membership-plans", headers=headers, json=body, timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["plan_type"] == "credit"
        assert d["amount"] == 1000
        TestMembershipPlanCRUD.plan_credit_id = d["id"]

    def test_update_discount_plan_persists_all_fields(self, headers):
        pid = TestMembershipPlanCRUD.plan_discount_id
        assert pid
        body = {
            "salon_id": SALON_ID,
            "name": "TEST_Discount_Plan",
            "amount": 1299,           # was 999
            "credit": 0,
            "validity_months": 12,
            "terms_conditions": "TEST tc updated",
            "plan_type": "discount",
            "discount_percent": 20,   # was 15
        }
        r = requests.put(f"{BASE_URL}/api/salons/{SALON_ID}/membership-plans/{pid}", headers=headers, json=body, timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["discount_percent"] == 20
        assert d["amount"] == 1299
        assert d["plan_type"] == "discount"
        # GET to verify persistence
        g = requests.get(f"{BASE_URL}/api/salons/{SALON_ID}/membership-plans", timeout=30).json()
        plans = g.get("plans", [])
        found = next((p for p in plans if p["id"] == pid), None)
        assert found
        assert found["discount_percent"] == 20
        assert found["amount"] == 1299

    def test_delete_plan_removes_from_active_list(self, headers):
        pid = TestMembershipPlanCRUD.plan_credit_id
        r = requests.delete(f"{BASE_URL}/api/salons/{SALON_ID}/membership-plans/{pid}", headers=headers, timeout=30)
        assert r.status_code == 200, r.text
        g = requests.get(f"{BASE_URL}/api/salons/{SALON_ID}/membership-plans", timeout=30).json()
        ids = [p["id"] for p in g.get("plans", [])]
        assert pid not in ids


# ---------- 2. Coupon max_discount_amount cap ----------

class TestCouponMaxDiscount:
    coupon_id = None
    code = f"TESTCAP{uuid.uuid4().hex[:6].upper()}"

    def test_create_coupon_with_cap(self, headers):
        body = {
            "code": TestCouponMaxDiscount.code,
            "title": "TEST cap coupon",
            "type": "percent",
            "value": 50,
            "min_bill_amount": 0,
            "max_discount_amount": 200,
            "per_customer_limit": 100,
            "is_active": True,
            "visibility": "private",
        }
        r = requests.post(f"{BASE_URL}/api/salons/{SALON_ID}/coupons", headers=headers, json=body, timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["max_discount_amount"] == 200
        TestCouponMaxDiscount.coupon_id = d["id"]

    def test_validate_coupon_caps_discount(self):
        r = requests.post(f"{BASE_URL}/api/salons/{SALON_ID}/coupons/validate",
                          json={"code": TestCouponMaxDiscount.code, "bill_amount": 1000}, timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        # 50% of 1000 = 500, but max_discount_amount cap = 200
        assert d["discount_amount"] == 200, f"expected cap=200 got {d}"
        assert d["final_amount"] == 800

    def test_update_coupon_max_discount_persists(self, headers):
        cid = TestCouponMaxDiscount.coupon_id
        body = {
            "code": TestCouponMaxDiscount.code,
            "title": "TEST cap coupon",
            "type": "percent",
            "value": 50,
            "min_bill_amount": 0,
            "max_discount_amount": 300,
            "per_customer_limit": 100,
            "is_active": True,
            "visibility": "private",
        }
        r = requests.put(f"{BASE_URL}/api/salons/{SALON_ID}/coupons/{cid}", headers=headers, json=body, timeout=30)
        assert r.status_code == 200, r.text
        assert r.json()["max_discount_amount"] == 300
        # re-validate: cap should now be 300
        r = requests.post(f"{BASE_URL}/api/salons/{SALON_ID}/coupons/validate",
                          json={"code": TestCouponMaxDiscount.code, "bill_amount": 1000}, timeout=30)
        assert r.json()["discount_amount"] == 300


# ---------- 3. Loyalty program credit_destination & tiers ----------

class TestLoyaltyProgram:
    def test_save_and_get_points_destination(self, headers):
        body = {
            "salon_id": SALON_ID,
            "enabled": True,
            "credit_destination": "points",
            "tiers": [
                {"name": "TEST_Silver", "spend_amount": 5000, "period_months": 3, "topup_percentage": 5},
                {"name": "TEST_Gold", "spend_amount": 10000, "period_months": 6, "topup_percentage": 10},
            ],
        }
        r = requests.post(f"{BASE_URL}/api/salons/{SALON_ID}/loyalty-program", headers=headers, json=body, timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["credit_destination"] == "points"
        assert len(d["tiers"]) == 2
        # GET echoes credit_destination
        g = requests.get(f"{BASE_URL}/api/salons/{SALON_ID}/loyalty-program", headers=headers, timeout=30).json()
        assert g["credit_destination"] == "points"
        assert g["enabled"] is True
        assert len(g["tiers"]) == 2

    def test_save_wallet_destination(self, headers):
        body = {
            "salon_id": SALON_ID,
            "enabled": True,
            "credit_destination": "wallet",
            "tiers": [
                {"name": "TEST_Bronze", "spend_amount": 3000, "period_months": 3, "topup_percentage": 3},
            ],
        }
        r = requests.post(f"{BASE_URL}/api/salons/{SALON_ID}/loyalty-program", headers=headers, json=body, timeout=30)
        assert r.status_code == 200, r.text
        assert r.json()["credit_destination"] == "wallet"


# ---------- 4. Discount membership auto-apply at booking + stacking ----------

class TestBookingMembershipAutoApply:
    """
    Set up an active discount membership for TEST_PHONE via direct DB insert,
    then POST /api/bookings and verify membership_discount fields on the token.
    """
    discount_plan_id = None
    membership_id = None
    coupon_code = f"TESTBK{uuid.uuid4().hex[:6].upper()}"
    coupon_id = None
    booking_ids = []

    def test_setup_discount_membership(self, headers, db):
        # Create a discount plan (20%)
        body = {
            "salon_id": SALON_ID,
            "name": "TEST_AutoApply_Plan",
            "amount": 999,
            "credit": 0,
            "validity_months": 12,
            "terms_conditions": "auto-apply",
            "plan_type": "discount",
            "discount_percent": 20,
        }
        r = requests.post(f"{BASE_URL}/api/salons/{SALON_ID}/membership-plans", headers=headers, json=body, timeout=30)
        assert r.status_code == 200, r.text
        TestBookingMembershipAutoApply.discount_plan_id = r.json()["id"]

        # Direct insert into customer_memberships
        mem_id = str(uuid.uuid4())
        doc = {
            "id": mem_id,
            "salon_id": SALON_ID,
            "customer_phone": TEST_PHONE,
            "customer_name": "TEST Auto Apply",
            "membership_plan_id": TestBookingMembershipAutoApply.discount_plan_id,
            "membership_name": "TEST_AutoApply_Plan",
            "tier": "Custom",
            "color": None,
            "plan_type": "discount",
            "discount_percent": 20,
            "payment_mode": "cash",
            "paid_amount": 999,
            "credit_added": 0,
            "wallet_balance": 0,
            "expiry_date": (datetime.now(timezone.utc) + timedelta(days=365)).isoformat(),
            "is_active": True,
            "payment_confirmed": True,
            "purchased_at": datetime.now(timezone.utc).isoformat(),
        }
        # Wipe prior active membership on this phone (test cleanup safety)
        _run(db.customer_memberships.update_many(
            {"salon_id": SALON_ID, "customer_phone": TEST_PHONE, "is_active": True},
            {"$set": {"is_active": False, "_test_deactivated": True}},
        ))
        _run(db.customer_memberships.insert_one(doc))
        TestBookingMembershipAutoApply.membership_id = mem_id

    def _post_booking(self, salon_meta, phone, coupon=None):
        # Build a booking for a far-future date to avoid slot conflicts
        date = (datetime.now(timezone.utc) + timedelta(days=30)).strftime("%Y-%m-%d")
        body = {
            "salon_id": SALON_ID,
            "user_id": phone,
            "customer_name": "TEST Booker",
            "phone": phone,
            "date": date,
            "shift": "Morning",
            "barber_id": salon_meta["barber_id"],
            "selected_services": [salon_meta["service_id"]],
            "source": "online",
            "booking_type": "future",
            "booking_for_self": True,
            "is_guest": True,
        }
        if coupon:
            body["coupon_code"] = coupon
        r = requests.post(f"{BASE_URL}/api/bookings", json=body, timeout=30)
        return r

    def test_booking_auto_applies_membership_discount(self, salon_meta, db):
        r = self._post_booking(salon_meta, TEST_PHONE)
        assert r.status_code == 200, f"booking failed: {r.status_code} {r.text}"
        tok_resp = r.json()
        TestBookingMembershipAutoApply.booking_ids.append(tok_resp.get("id"))
        # response_model=TokenModel strips extra fields — fetch actual doc from DB
        tok = _run(db.tokens.find_one({"id": tok_resp["id"]}, {"_id": 0}))
        assert tok, "token not persisted"
        price = float(salon_meta["service_price"])
        expected_disc = round(price * 0.20, 2)
        assert tok.get("membership_discount_percent") == 20, tok
        assert tok["membership_discount"] == expected_disc, tok
        assert tok["total_amount"] == round(price - expected_disc, 2), tok
        assert tok["order_discount_amount"] >= expected_disc

    def test_booking_without_membership_no_discount(self, salon_meta, db):
        # Ensure TEST_PHONE2 has no active membership
        _run(db.customer_memberships.update_many(
            {"salon_id": SALON_ID, "customer_phone": TEST_PHONE2, "is_active": True},
            {"$set": {"is_active": False}},
        ))
        r = self._post_booking(salon_meta, TEST_PHONE2)
        assert r.status_code == 200, r.text
        tok_resp = r.json()
        TestBookingMembershipAutoApply.booking_ids.append(tok_resp.get("id"))
        tok = _run(db.tokens.find_one({"id": tok_resp["id"]}, {"_id": 0}))
        assert tok.get("membership_discount", 0) == 0
        assert tok["total_amount"] == float(salon_meta["service_price"])

    def test_stacking_membership_then_coupon(self, salon_meta, headers):
        # Create a 25% percent coupon (no cap) for stacking test
        body = {
            "code": TestBookingMembershipAutoApply.coupon_code,
            "title": "TEST stacking coupon",
            "type": "percent", "value": 25,
            "min_bill_amount": 0, "per_customer_limit": 100,
            "is_active": True, "visibility": "private",
        }
        c = requests.post(f"{BASE_URL}/api/salons/{SALON_ID}/coupons", headers=headers, json=body, timeout=30)
        assert c.status_code == 200, c.text
        TestBookingMembershipAutoApply.coupon_id = c.json()["id"]

        r = self._post_booking(salon_meta, TEST_PHONE, coupon=TestBookingMembershipAutoApply.coupon_code)
        assert r.status_code == 200, r.text
        tok_resp = r.json()
        TestBookingMembershipAutoApply.booking_ids.append(tok_resp.get("id"))
        # Fetch persisted token doc (response_model strips extras)
        from motor.motor_asyncio import AsyncIOMotorClient as _C
        _db = _C(MONGO_URL)[DB_NAME]
        tok = _run(_db.tokens.find_one({"id": tok_resp["id"]}, {"_id": 0}))
        price = float(salon_meta["service_price"])
        membership_disc = round(price * 0.20, 2)
        reduced_base = round(price - membership_disc, 2)
        expected_coupon = round(reduced_base * 0.25, 2)
        assert tok["membership_discount"] == membership_disc, tok
        # coupon computed on reduced base, not on original bill
        assert abs(tok["coupon_discount"] - expected_coupon) < 0.5, tok
        expected_total = round(price - membership_disc - expected_coupon, 2)
        assert abs(tok["total_amount"] - expected_total) < 0.5, tok
        expected_order_disc = round(expected_coupon + tok.get("points_discount", 0) + membership_disc, 2)
        assert abs(tok["order_discount_amount"] - expected_order_disc) < 0.5, tok


# ---------- 5. Customer membership enrichment ----------

class TestMembershipEnrichment:
    def test_customer_membership_info(self):
        # /api/salons/{id}/customers/{phone}/membership
        r = requests.get(f"{BASE_URL}/api/salons/{SALON_ID}/customers/{TEST_PHONE}/membership", timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d.get("plan_type") == "discount"
        assert d.get("discount_percent") == 20

    def test_customer_membership_endpoint(self):
        # /api/salons/{id}/customer-membership/{phone}
        r = requests.get(f"{BASE_URL}/api/salons/{SALON_ID}/customer-membership/{TEST_PHONE}", timeout=30)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d.get("has_membership") is True
        assert d.get("plan_type") == "discount"
        assert d.get("discount_percent") == 20


# ---------- 6. Loyalty routing code path exists (config round-trip only) ----------

class TestLoyaltyRoutingCodePath:
    def test_check_and_apply_loyalty_reward_has_points_branch(self):
        # Static verification that the points branch exists in server.py
        with open("/app/backend/server.py", "r") as f:
            src = f.read()
        assert 'destination = (loyalty_program.get("credit_destination") or "wallet").lower()' in src
        assert 'if destination == "points":' in src
        assert "_credit_loyalty_points" in src


# ---------- teardown ----------

def teardown_module(module):
    """Best-effort cleanup: delete TEST_ coupons/plans and reset loyalty program."""
    try:
        r = requests.post(f"{BASE_URL}/api/salon/users/login",
                          json={"identifier": "admin", "password": "salon123"}, timeout=15)
        if r.status_code != 200:
            return
        token = r.json()["access_token"]
        h = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}

        # Delete test coupons
        coupons = requests.get(f"{BASE_URL}/api/salons/{SALON_ID}/coupons", headers=h, timeout=15).json().get("coupons", [])
        for c in coupons:
            if c.get("code", "").startswith(("TESTCAP", "TESTBK")):
                requests.delete(f"{BASE_URL}/api/salons/{SALON_ID}/coupons/{c['id']}", headers=h, timeout=15)

        # Delete test membership plans
        plans = requests.get(f"{BASE_URL}/api/salons/{SALON_ID}/membership-plans", timeout=15).json().get("plans", [])
        for p in plans:
            if p.get("name", "").startswith("TEST_"):
                requests.delete(f"{BASE_URL}/api/salons/{SALON_ID}/membership-plans/{p['id']}", headers=h, timeout=15)

        # Reset loyalty program
        requests.post(f"{BASE_URL}/api/salons/{SALON_ID}/loyalty-program", headers=h, json={
            "salon_id": SALON_ID, "enabled": False, "credit_destination": "wallet", "tiers": []
        }, timeout=15)

        # Deactivate customer_memberships we created
        client = AsyncIOMotorClient(MONGO_URL)
        db = client[DB_NAME]
        loop = asyncio.new_event_loop()
        loop.run_until_complete(db.customer_memberships.update_many(
            {"salon_id": SALON_ID, "customer_name": "TEST Auto Apply"},
            {"$set": {"is_active": False}},
        ))
        # Delete tokens created in the bookings
        for bid in TestBookingMembershipAutoApply.booking_ids:
            if bid:
                loop.run_until_complete(db.tokens.delete_one({"id": bid}))
        loop.close()
    except Exception as e:
        print(f"teardown warning: {e}")
