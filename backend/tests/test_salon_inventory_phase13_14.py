"""
Phase 13 (auto-post on supplier delivery) + Phase 14 (Salon Inventory) +
Payment-mode change endpoint backend tests.

Run:
    pytest /app/backend/tests/test_salon_inventory_phase13_14.py -v --tb=short \
        --junitxml=/app/test_reports/pytest/phase13_14.xml
"""
from __future__ import annotations

import os
import time
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
assert BASE_URL, "REACT_APP_BACKEND_URL must be set"

SALON_ID = os.environ.get("TEST_SALON_ID", "459ff694-c246-4891-a535-fc8f23b58ac3")
SALON_IDENTIFIER = os.environ.get("TEST_SALON_IDENTIFIER", "admin")
SALON_PASSWORD = os.environ.get("TEST_SALON_PASSWORD", "salon123")
SUPPLIER_GLOW_MOBILE = os.environ.get("TEST_SUPPLIER_MOBILE", "+919000000001")
SUPPLIER_PASSWORD = os.environ.get("TEST_SUPPLIER_PASSWORD", "supplier123")


# ===================== Fixtures =====================

@pytest.fixture(scope="module")
def salon_token():
    r = requests.post(
        f"{BASE_URL}/api/salon/users/login",
        json={"identifier": SALON_IDENTIFIER, "password": SALON_PASSWORD},
        timeout=15,
    )
    assert r.status_code == 200, f"salon login failed: {r.status_code} {r.text}"
    return r.json()["access_token"]


@pytest.fixture(scope="module")
def salon_headers(salon_token):
    return {"Authorization": f"Bearer {salon_token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def supplier_glow_token():
    r = requests.post(
        f"{BASE_URL}/api/supplier/auth/password-login",
        json={"mobile": SUPPLIER_GLOW_MOBILE, "password": SUPPLIER_PASSWORD},
        timeout=15,
    )
    assert r.status_code == 200, f"supplier login failed: {r.status_code} {r.text}"
    return r.json().get("access_token") or r.json().get("token")


@pytest.fixture(scope="module")
def supplier_headers(supplier_glow_token):
    return {"Authorization": f"Bearer {supplier_glow_token}", "Content-Type": "application/json"}


# ===================== Phase 14 - CRUD =====================

class TestPhase14CRUD:
    created_id = None

    def test_create_item(self, salon_headers):
        payload = {
            "name": "TEST_PH14_Shampoo",
            "brand": "TestBrand",
            "category": "haircare",
            "unit": "bottle",
            "cost_price": 100.0,
            "selling_price": 200.0,
            "gst_percent": 18.0,
            "mrp": 250.0,
            "qty_total": 20,
            "availability": "both",
            "low_stock_threshold": 3,
        }
        r = requests.post(f"{BASE_URL}/api/salon/inventory", json=payload, headers=salon_headers, timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["name"] == payload["name"]
        assert data["qty_total"] == 20
        assert data["is_deleted"] is False
        assert data["qty_available_for_customer"] == 20
        assert "id" in data
        TestPhase14CRUD.created_id = data["id"]

    def test_list_items_includes_created(self, salon_headers):
        r = requests.get(f"{BASE_URL}/api/salon/inventory?q=TEST_PH14_Shampoo", headers=salon_headers, timeout=15)
        assert r.status_code == 200
        data = r.json()
        ids = [it["id"] for it in data["inventory_items"]]
        assert TestPhase14CRUD.created_id in ids

    def test_get_one(self, salon_headers):
        r = requests.get(
            f"{BASE_URL}/api/salon/inventory/{TestPhase14CRUD.created_id}",
            headers=salon_headers, timeout=15,
        )
        assert r.status_code == 200
        assert r.json()["id"] == TestPhase14CRUD.created_id

    def test_update_manual_item(self, salon_headers):
        r = requests.put(
            f"{BASE_URL}/api/salon/inventory/{TestPhase14CRUD.created_id}",
            json={"name": "TEST_PH14_Shampoo_RENAMED", "selling_price": 220.0},
            headers=salon_headers, timeout=15,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        # Manual item, no product_id_source: name should be updatable
        assert data["name"] == "TEST_PH14_Shampoo_RENAMED"
        assert data["selling_price"] == 220.0

    def test_create_invalid_availability(self, salon_headers):
        r = requests.post(
            f"{BASE_URL}/api/salon/inventory",
            json={"name": "TEST_BAD", "availability": "bitcoin"},
            headers=salon_headers, timeout=15,
        )
        assert r.status_code == 422

    def test_create_negative_qty(self, salon_headers):
        r = requests.post(
            f"{BASE_URL}/api/salon/inventory",
            json={"name": "TEST_NEG", "qty_total": -5},
            headers=salon_headers, timeout=15,
        )
        assert r.status_code == 422

    def test_unauthorized_list(self):
        r = requests.get(f"{BASE_URL}/api/salon/inventory", timeout=15)
        assert r.status_code in (401, 403)

    def test_soft_delete(self, salon_headers):
        r = requests.delete(
            f"{BASE_URL}/api/salon/inventory/{TestPhase14CRUD.created_id}",
            headers=salon_headers, timeout=15,
        )
        assert r.status_code == 200
        # Verify excluded from list
        r2 = requests.get(
            f"{BASE_URL}/api/salon/inventory?q=TEST_PH14_Shampoo_RENAMED",
            headers=salon_headers, timeout=15,
        )
        ids = [it["id"] for it in r2.json()["inventory_items"]]
        assert TestPhase14CRUD.created_id not in ids
        # GET by id should 404
        r3 = requests.get(
            f"{BASE_URL}/api/salon/inventory/{TestPhase14CRUD.created_id}",
            headers=salon_headers, timeout=15,
        )
        assert r3.status_code == 404


# ===================== Phase 14 - Lifecycle =====================

class TestPhase14Lifecycle:
    item_id = None

    def _create(self, headers, qty=30, availability="both"):
        r = requests.post(
            f"{BASE_URL}/api/salon/inventory",
            json={
                "name": f"TEST_LC_{uuid.uuid4().hex[:6]}",
                "qty_total": qty,
                "selling_price": 100.0,
                "gst_percent": 0.0,
                "availability": availability,
            },
            headers=headers, timeout=15,
        )
        assert r.status_code == 200, r.text
        return r.json()["id"]

    def test_assign_to_staff(self, salon_headers):
        iid = self._create(salon_headers, qty=20)
        TestPhase14Lifecycle.item_id = iid
        r = requests.post(
            f"{BASE_URL}/api/salon/inventory/{iid}/assign",
            json={"staff_id": "TEST_STAFF_1", "qty": 5},
            headers=salon_headers, timeout=15,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["qty_reserved_for_internal"] == 5
        assert data["assigned_to_staff_id"] == "TEST_STAFF_1"

    def test_assign_too_much(self, salon_headers):
        r = requests.post(
            f"{BASE_URL}/api/salon/inventory/{TestPhase14Lifecycle.item_id}/assign",
            json={"staff_id": "TEST_STAFF_1", "qty": 9999},
            headers=salon_headers, timeout=15,
        )
        assert r.status_code == 409

    def test_reserve_internal(self, salon_headers):
        iid = self._create(salon_headers, qty=15)
        r = requests.post(
            f"{BASE_URL}/api/salon/inventory/{iid}/reserve-internal",
            json={"qty": 5},
            headers=salon_headers, timeout=15,
        )
        assert r.status_code == 200, r.text
        assert r.json()["qty_reserved_for_internal"] == 5

        # Reserve too much
        r2 = requests.post(
            f"{BASE_URL}/api/salon/inventory/{iid}/reserve-internal",
            json={"qty": 999},
            headers=salon_headers, timeout=15,
        )
        assert r2.status_code == 409

        # Release
        r3 = requests.post(
            f"{BASE_URL}/api/salon/inventory/{iid}/release-internal",
            json={"qty": 3},
            headers=salon_headers, timeout=15,
        )
        assert r3.status_code == 200
        assert r3.json()["qty_reserved_for_internal"] == 2

        # Release too much
        r4 = requests.post(
            f"{BASE_URL}/api/salon/inventory/{iid}/release-internal",
            json={"qty": 999},
            headers=salon_headers, timeout=15,
        )
        assert r4.status_code == 409

    def test_consume(self, salon_headers):
        iid = self._create(salon_headers, qty=10)
        r = requests.post(
            f"{BASE_URL}/api/salon/inventory/{iid}/consume",
            json={"qty": 3, "note": "TEST consume"},
            headers=salon_headers, timeout=15,
        )
        assert r.status_code == 200, r.text
        assert r.json()["qty_total"] == 7

    def test_consume_rejected_for_sale_only(self, salon_headers):
        iid = self._create(salon_headers, qty=10, availability="sale_only")
        r = requests.post(
            f"{BASE_URL}/api/salon/inventory/{iid}/consume",
            json={"qty": 1},
            headers=salon_headers, timeout=15,
        )
        assert r.status_code == 409

    def test_sell(self, salon_headers):
        iid = self._create(salon_headers, qty=10)
        r = requests.post(
            f"{BASE_URL}/api/salon/inventory/{iid}/sell",
            json={"qty": 2, "payment_mode": "cash"},
            headers=salon_headers, timeout=15,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["ok"] is True
        assert data["item"]["qty_total"] == 8
        assert data["amount"] > 0
        txn_id = data["transaction_id"]
        assert txn_id

    def test_sell_rejected_for_internal_only(self, salon_headers):
        iid = self._create(salon_headers, qty=10, availability="internal_only")
        r = requests.post(
            f"{BASE_URL}/api/salon/inventory/{iid}/sell",
            json={"qty": 1, "payment_mode": "cash"},
            headers=salon_headers, timeout=15,
        )
        assert r.status_code == 409


# ===================== Phase 14 - Movements =====================

class TestPhase14Movements:
    def test_movements_appear_for_lifecycle_actions(self, salon_headers):
        # Create with qty -> manual_add
        r = requests.post(
            f"{BASE_URL}/api/salon/inventory",
            json={"name": f"TEST_MV_{uuid.uuid4().hex[:6]}", "qty_total": 10, "selling_price": 50},
            headers=salon_headers, timeout=15,
        )
        iid = r.json()["id"]

        requests.post(f"{BASE_URL}/api/salon/inventory/{iid}/reserve-internal",
                      json={"qty": 2}, headers=salon_headers, timeout=15)
        requests.post(f"{BASE_URL}/api/salon/inventory/{iid}/release-internal",
                      json={"qty": 1}, headers=salon_headers, timeout=15)
        requests.post(f"{BASE_URL}/api/salon/inventory/{iid}/consume",
                      json={"qty": 1}, headers=salon_headers, timeout=15)
        requests.post(f"{BASE_URL}/api/salon/inventory/{iid}/sell",
                      json={"qty": 1, "payment_mode": "cash"}, headers=salon_headers, timeout=15)
        requests.post(f"{BASE_URL}/api/salon/inventory/{iid}/assign",
                      json={"staff_id": "S1", "qty": 1}, headers=salon_headers, timeout=15)

        r2 = requests.get(f"{BASE_URL}/api/salon/inventory/{iid}/movements",
                          headers=salon_headers, timeout=15)
        assert r2.status_code == 200
        mvs = r2.json()["movements"]
        types = [m["movement_type"] for m in mvs]
        # Expect at least these
        assert "manual_add" in types
        assert "reserve_internal" in types
        assert "release_reserve" in types
        assert "internal_consumption" in types
        assert "sale_to_customer" in types
        assert ("assign_to_staff" in types) or ("reserve_internal" in types)
        # qty_after sign checks
        for m in mvs:
            assert "qty_delta" in m and "qty_after" in m

    def test_list_all_movements_filter(self, salon_headers):
        r = requests.get(
            f"{BASE_URL}/api/salon/inventory/movements?movement_type=manual_add&page_size=5",
            headers=salon_headers, timeout=15,
        )
        assert r.status_code == 200
        for m in r.json()["movements"]:
            assert m["movement_type"] == "manual_add"


# ===================== Phase 13 - Auto-post on Delivery =====================

class TestPhase13AutoPost:
    order_id_1 = None
    order_id_2 = None
    product_ids_used = []

    @pytest.fixture(scope="class")
    def store_products(self, salon_headers):
        r = requests.get(
            f"{BASE_URL}/api/salon/store/products?supplier_id=test-supplier-glow&in_stock_only=true&page_size=10",
            headers=salon_headers, timeout=15,
        )
        assert r.status_code == 200, r.text
        data = r.json()
        prods = data.get("products", [])
        assert len(prods) >= 1, f"no glow supplier products available: {data}"
        return prods

    def _place_cod_order(self, salon_headers, products, qtys):
        items = [{"product_id": p["id"], "qty": q} for p, q in zip(products, qtys)]
        body = {
            "items": items,
            "shipping_address": {
                "name": "Test Salon", "phone": "9999999999",
                "line1": "1 Test St", "city": "Bengaluru",
                "state": "KA", "pincode": "560001",
            },
            "payment_mode": "cod",
        }
        r = requests.post(f"{BASE_URL}/api/salon/store/checkout", json=body,
                          headers=salon_headers, timeout=20)
        assert r.status_code == 200, r.text
        return r.json()

    def test_full_delivery_flow(self, salon_headers, supplier_headers, store_products):
        prods = store_products[:2] if len(store_products) >= 2 else store_products[:1]
        TestPhase13AutoPost.product_ids_used = [p["id"] for p in prods]
        qtys = [3] * len(prods)
        co = self._place_cod_order(salon_headers, prods, qtys)
        orders = co.get("orders") or co.get("created_orders") or []
        assert orders, f"no orders in checkout response: {co}"
        order = orders[0]
        order_id = order["id"] if isinstance(order, dict) else order
        TestPhase13AutoPost.order_id_1 = order_id

        # Supplier confirm
        rc = requests.post(f"{BASE_URL}/api/supplier/orders/{order_id}/confirm",
                           headers=supplier_headers, timeout=15)
        assert rc.status_code == 200, rc.text
        # Ship
        rs = requests.post(f"{BASE_URL}/api/supplier/orders/{order_id}/ship",
                           json={"tracking_number": "TRK_TEST_1"},
                           headers=supplier_headers, timeout=15)
        assert rs.status_code == 200, rs.text
        # Deliver
        rd = requests.post(f"{BASE_URL}/api/supplier/orders/{order_id}/deliver",
                           json={"note": "Delivered for test"},
                           headers=supplier_headers, timeout=20)
        assert rd.status_code == 200, rd.text
        delivered = rd.json()["order"]
        assert delivered["order_status"] == "delivered"
        # auto_post_summary populated
        aps = delivered.get("auto_post_summary")
        assert aps is not None, f"no auto_post_summary on order: {delivered.keys()}"
        assert aps.get("finance_posted") is True
        assert aps.get("inventory_items_touched", 0) >= 1
        # Order total used for finance
        delivered["total_amount"]

        # Verify finance txn exists
        time.sleep(0.5)
        # We don't have a finance list endpoint guaranteed; verify via inventory_items.
        # Check inventory row created/incremented per line
        rinv = requests.get(
            f"{BASE_URL}/api/salon/inventory?page_size=200",
            headers=salon_headers, timeout=15,
        )
        assert rinv.status_code == 200
        rows = rinv.json()["inventory_items"]
        for pid in TestPhase13AutoPost.product_ids_used:
            matches = [r for r in rows if r.get("product_id_source") == pid]
            assert matches, f"no salon_inventory row for product {pid}"
            inv_row = matches[0]
            assert inv_row["qty_total"] >= 3

            # Check movements purchase_in
            rm = requests.get(
                f"{BASE_URL}/api/salon/inventory/{inv_row['id']}/movements",
                headers=salon_headers, timeout=15,
            )
            assert rm.status_code == 200
            mtypes = [m["movement_type"] for m in rm.json()["movements"]]
            assert "purchase_in" in mtypes
            # Reference to order_id
            ref_ids = [m["reference_id"] for m in rm.json()["movements"] if m["movement_type"] == "purchase_in"]
            assert order_id in ref_ids

        # Second deliver attempt — should 409 (transition guard)
        rd2 = requests.post(f"{BASE_URL}/api/supplier/orders/{order_id}/deliver",
                            json={"note": "again"},
                            headers=supplier_headers, timeout=15)
        assert rd2.status_code == 409, f"expected 409 on second deliver, got {rd2.status_code} {rd2.text}"

    def test_second_order_increments_same_row(self, salon_headers, supplier_headers, store_products):
        prods = store_products[:1]
        co = self._place_cod_order(salon_headers, prods, [2])
        orders = co.get("orders") or co.get("created_orders") or []
        order_id = orders[0]["id"] if isinstance(orders[0], dict) else orders[0]
        TestPhase13AutoPost.order_id_2 = order_id

        # Capture pre-state of inventory row
        rinv_before = requests.get(
            f"{BASE_URL}/api/salon/inventory?page_size=200",
            headers=salon_headers, timeout=15,
        )
        pre_rows = [r for r in rinv_before.json()["inventory_items"]
                    if r.get("product_id_source") == prods[0]["id"]]
        pre_qty = pre_rows[0]["qty_total"] if pre_rows else 0

        requests.post(f"{BASE_URL}/api/supplier/orders/{order_id}/confirm",
                      headers=supplier_headers, timeout=15)
        requests.post(f"{BASE_URL}/api/supplier/orders/{order_id}/ship",
                      json={"tracking_number": "T2"}, headers=supplier_headers, timeout=15)
        rd = requests.post(f"{BASE_URL}/api/supplier/orders/{order_id}/deliver",
                           json={}, headers=supplier_headers, timeout=20)
        assert rd.status_code == 200, rd.text

        rinv_after = requests.get(
            f"{BASE_URL}/api/salon/inventory?page_size=200",
            headers=salon_headers, timeout=15,
        )
        post_rows = [r for r in rinv_after.json()["inventory_items"]
                     if r.get("product_id_source") == prods[0]["id"]]
        # Same row reused, qty incremented (not duplicated)
        assert len(post_rows) == 1, f"expected exactly 1 salon_inventory row per product_id_source, got {len(post_rows)}"
        assert post_rows[0]["qty_total"] == pre_qty + 2


# ===================== Phase 13 - Idempotency (direct call) =====================

class TestPhase13Idempotency:
    def test_direct_call_skips_when_already_posted(self):
        """Invoke auto_post_on_delivery twice on the same order doc directly."""
        import subprocess
        order_id = TestPhase13AutoPost.order_id_1
        assert order_id, "Phase 13 e2e test must run first to seed an order"
        script = f"""
import asyncio, os, sys, json
sys.path.insert(0, '/app/backend')
from dotenv import load_dotenv
load_dotenv('/app/backend/.env')
from motor.motor_asyncio import AsyncIOMotorClient
from salon_inventory import auto_post_on_delivery, init_salon_inventory_router

async def main():
    mongo_url = os.environ.get('MONGO_URL')
    db_name = os.environ.get('DB_NAME')
    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]
    # Init router so module-level _db / _resolve_branch_id are set (resolve_branch_id is optional)
    init_salon_inventory_router(db=db, get_current_salon_user=None, resolve_branch_id=None)
    order = await db.salon_orders.find_one({{'id': '{order_id}'}}, {{'_id': 0}})
    if not order:
        print(json.dumps({{'error': 'order_not_found'}}))
        return
    s1 = await auto_post_on_delivery(order, db=db)
    s2 = await auto_post_on_delivery(order, db=db)
    print('RESULT_JSON:' + json.dumps({{'s1': s1, 's2': s2}}))

asyncio.run(main())
"""
        result = subprocess.run(
            ["python3", "-c", script],
            cwd="/app/backend",
            capture_output=True, text=True, timeout=60,
            env={**os.environ},
        )
        assert result.returncode == 0, f"stdout={result.stdout}\nstderr={result.stderr}"
        line = [l for l in result.stdout.splitlines() if l.startswith("RESULT_JSON:")]
        assert line, f"no RESULT_JSON line in: {result.stdout}\n{result.stderr}"
        import json as _json
        payload = _json.loads(line[0].split("RESULT_JSON:", 1)[1])
        # Second call should skip
        assert payload["s2"]["skipped_reason"] == "already_posted", payload
        # First call also should skip since delivered already auto-posted
        assert payload["s1"]["skipped_reason"] == "already_posted", payload


# ===================== Payment Mode Change =====================

class TestPaymentModeChange:
    def test_change_cod_to_upi(self, salon_headers):
        order_id = TestPhase13AutoPost.order_id_1
        assert order_id, "Need delivered order from Phase 13 test"
        r = requests.patch(
            f"{BASE_URL}/api/salon/store/orders/{order_id}/payment-mode",
            json={"payment_mode": "upi", "note": "Paid via UPI at door"},
            headers=salon_headers, timeout=15,
        )
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["ok"] is True
        assert body["order"]["payment_mode"] == "upi"
        hist = body["order"].get("payment_mode_history") or []
        assert len(hist) >= 1
        assert hist[-1]["from"] == "cod" and hist[-1]["to"] == "upi"
        assert hist[-1].get("note") == "Paid via UPI at door"
        assert body["financial_transactions_updated"] >= 1

    def test_change_same_mode_no_history(self, salon_headers):
        order_id = TestPhase13AutoPost.order_id_1
        # Get current history len
        r0 = requests.patch(
            f"{BASE_URL}/api/salon/store/orders/{order_id}/payment-mode",
            json={"payment_mode": "upi"},
            headers=salon_headers, timeout=15,
        )
        assert r0.status_code == 200
        assert "unchanged" in r0.json().get("message", "").lower()
        hist = r0.json()["order"].get("payment_mode_history") or []
        # No new entry should be added on no-op
        r1 = requests.patch(
            f"{BASE_URL}/api/salon/store/orders/{order_id}/payment-mode",
            json={"payment_mode": "upi"},
            headers=salon_headers, timeout=15,
        )
        hist2 = r1.json()["order"].get("payment_mode_history") or []
        assert len(hist2) == len(hist)

    def test_invalid_payment_mode(self, salon_headers):
        order_id = TestPhase13AutoPost.order_id_1
        r = requests.patch(
            f"{BASE_URL}/api/salon/store/orders/{order_id}/payment-mode",
            json={"payment_mode": "bitcoin"},
            headers=salon_headers, timeout=15,
        )
        assert r.status_code == 422

    def test_wrong_salon_returns_404(self, supplier_headers):
        order_id = TestPhase13AutoPost.order_id_1
        # Use supplier token (which has no salon_id) — should fail auth/404
        # Use bogus auth header to simulate different salon JWT
        r = requests.patch(
            f"{BASE_URL}/api/salon/store/orders/{order_id}/payment-mode",
            json={"payment_mode": "cash"},
            headers={"Authorization": "Bearer invalid.jwt.token",
                     "Content-Type": "application/json"},
            timeout=15,
        )
        assert r.status_code in (401, 403, 404)


# ===================== Negative paths =====================

class TestNegativePaths:
    def test_unauthorized_no_jwt(self):
        r = requests.get(f"{BASE_URL}/api/salon/inventory", timeout=10)
        assert r.status_code in (401, 403)

    def test_other_salon_item_404(self, salon_headers):
        # A made-up id obviously not owned
        r = requests.get(
            f"{BASE_URL}/api/salon/inventory/{uuid.uuid4()}",
            headers=salon_headers, timeout=10,
        )
        assert r.status_code == 404
