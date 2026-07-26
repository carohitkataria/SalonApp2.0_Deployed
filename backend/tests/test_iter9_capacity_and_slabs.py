"""Iteration 9 — Bug fix tests.

Two regressions covered:

1) Booking capacity (`get_barber_blocked_minutes_used`) must only count tokens whose
   status is still pending (waiting/future/in_progress/called).  Tokens that are
   completed/cancelled/skipped MUST free up the slot.

2) Incentive slab (`_compute_incentive_amount`) — the highest crossed total_pct slab
   must apply when the achievement % exceeds the highest defined to_pct.  Also,
   `_get_barber_actual_sales` must sum tokens via the `date` field (the field that
   tokens actually use), not `booking_date`.

3) Token complete handler must call `_recompute_incentive_payout` using
   token['date'] (with fallback to booking_date / today).

Cleanup: any tokens this file inserts are tagged `_test_iter9=true` and removed
in the module teardown.  We never touch real user tokens.
"""
import os
import sys
import uuid
import pytest
import pytest_asyncio
import requests
from datetime import datetime, timezone

sys.path.insert(0, "/app/backend")

# Use a single session-scoped event loop so motor's cached loop is consistent.
pytestmark = pytest.mark.asyncio(loop_scope="session")

# Server module exposes the helpers we want to unit-test directly.
import server as srv  # noqa: E402
from motor.motor_asyncio import AsyncIOMotorClient  # noqa: E402

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ.get("DB_NAME", "test_database")

SALON_ID = os.environ.get("TEST_SALON_ID", "2dad5cd9-5dda-4398-bbb5-a4d12aae7915")
BARBER_ID = os.environ.get("TEST_BARBER_ID", "5d7d3064-2580-4a43-ae3e-73cdcaefd9de")  # Imran
PHONE = os.environ.get("TEST_SALON_PHONE", "+917503070727")
PASSWORD = os.environ.get("TEST_SALON_PASSWORD", "salon123")


# ----------------------------------------------------------------------- helpers
def _api_login():
    r = requests.post(
        f"{BASE_URL}/api/salon/password-login",
        json={"phone": PHONE, "password": PASSWORD},
        timeout=30,
    )
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}",
            "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def auth_headers():
    return _api_login()


@pytest_asyncio.fixture(scope="module", autouse=True, loop_scope="session")
async def cleanup_iter9():
    """Remove any leftover _test_iter9 docs before & after the run."""
    await srv.db.tokens.delete_many({"_test_iter9": True})
    yield
    await srv.db.tokens.delete_many({"_test_iter9": True})


# ============================================================ 1) CAPACITY RULE
@pytest.mark.asyncio
async def test_capacity_excludes_completed_cancelled_skipped():
    """Three tokens (completed, cancelled, skipped) should produce 0 used minutes."""
    test_date = "2099-01-15"   # future, isolated date — no real bookings here
    shift = "Morning"
    base = {
        "salon_id": SALON_ID,
        "barber_id": BARBER_ID,
        "date": test_date,
        "shift": shift,
        "blocked_minutes": 30,  # would consume 30 min each if counted
        "_test_iter9": True,
    }
    docs = [
        {**base, "id": str(uuid.uuid4()), "status": "completed"},
        {**base, "id": str(uuid.uuid4()), "status": "cancelled"},
        {**base, "id": str(uuid.uuid4()), "status": "skipped"},
    ]
    await srv.db.tokens.insert_many(docs)
    try:
        used = await srv.get_barber_blocked_minutes_used(
            SALON_ID, BARBER_ID, test_date, shift
        )
        assert used == 0, (
            f"completed/cancelled/skipped tokens MUST NOT count toward capacity; "
            f"got {used} (expected 0)."
        )
    finally:
        await srv.db.tokens.delete_many({"_test_iter9": True, "date": test_date})


@pytest.mark.asyncio
async def test_capacity_includes_pending_statuses():
    """Pending statuses (waiting/future/in_progress/called) MUST count."""
    test_date = "2099-01-16"
    shift = "Morning"
    base = {
        "salon_id": SALON_ID,
        "barber_id": BARBER_ID,
        "date": test_date,
        "shift": shift,
        "blocked_minutes": 30,
        "_test_iter9": True,
    }
    statuses = ["waiting", "future", "in_progress", "called"]
    docs = [
        {**base, "id": str(uuid.uuid4()), "status": s} for s in statuses
    ]
    await srv.db.tokens.insert_many(docs)
    try:
        used = await srv.get_barber_blocked_minutes_used(
            SALON_ID, BARBER_ID, test_date, shift
        )
        assert used == 30 * len(statuses), (
            f"All pending tokens must count: expected {30*len(statuses)} got {used}"
        )
    finally:
        await srv.db.tokens.delete_many({"_test_iter9": True, "date": test_date})


@pytest.mark.asyncio
async def test_capacity_mixed_only_counts_pending():
    """Mix of statuses: only pending count."""
    test_date = "2099-01-17"
    shift = "Evening"
    base = {
        "salon_id": SALON_ID,
        "barber_id": BARBER_ID,
        "date": test_date,
        "shift": shift,
        "blocked_minutes": 45,
        "_test_iter9": True,
    }
    docs = [
        {**base, "id": str(uuid.uuid4()), "status": "waiting"},     # +45
        {**base, "id": str(uuid.uuid4()), "status": "in_progress"}, # +45
        {**base, "id": str(uuid.uuid4()), "status": "completed"},   # 0
        {**base, "id": str(uuid.uuid4()), "status": "cancelled"},   # 0
    ]
    await srv.db.tokens.insert_many(docs)
    try:
        used = await srv.get_barber_blocked_minutes_used(
            SALON_ID, BARBER_ID, test_date, shift
        )
        assert used == 90, f"Expected 90 (2 pending × 45), got {used}"
    finally:
        await srv.db.tokens.delete_many({"_test_iter9": True, "date": test_date})


# =================================================== 2) INCENTIVE SLAB CALC FIX
def _plan_two_slabs():
    return {
        "target_type": "salary_multiplier",
        "multiplier": 1.5,
        "slabs": [
            {"from_pct": 100.0, "to_pct": 120.0, "type": "total_pct", "value": 20.0},
            {"from_pct": 120.0, "to_pct": 150.0, "type": "total_pct", "value": 30.0},
        ],
    }


def test_slab_above_highest_uses_highest_crossed():
    """Achievement 168.96% with last slab capped at 150% MUST still apply 30%."""
    plan = _plan_two_slabs()
    target = 37500.0
    actual = 63360.0  # 168.96%
    out = srv._compute_incentive_amount(plan, target, actual)
    assert round(out["achievement_pct"], 2) == 168.96
    assert round(out["earned"], 2) == round(actual * 0.30, 2) == 19008.0
    assert any(b["slab"] == "120%-150%" and b["rate"] == "30%" for b in out["breakdown"]), \
        f"Breakdown should show '120%-150%' applied; got {out['breakdown']}"


def test_slab_inside_lower_only_first_applies():
    """Achievement 110% → only first slab (100-120% @ 20%)."""
    plan = _plan_two_slabs()
    target = 37500.0
    actual = 41250.0  # 110%
    out = srv._compute_incentive_amount(plan, target, actual)
    assert round(out["achievement_pct"], 2) == 110.0
    assert round(out["earned"], 2) == round(actual * 0.20, 2) == 8250.0
    assert any(b["slab"] == "100%-120%" for b in out["breakdown"])
    # Should NOT include 120-150% at this achievement
    assert not any(b["slab"] == "120%-150%" for b in out["breakdown"])


def test_slab_inside_higher_only_second_applies():
    """Achievement 130% → only second slab (120-150% @ 30%)."""
    plan = _plan_two_slabs()
    target = 37500.0
    actual = 48750.0  # 130%
    out = srv._compute_incentive_amount(plan, target, actual)
    assert round(out["achievement_pct"], 2) == 130.0
    assert round(out["earned"], 2) == round(actual * 0.30, 2) == 14625.0
    assert any(b["slab"] == "120%-150%" for b in out["breakdown"])
    # The 100-120% slab is NOT total_pct overlap; only one total_pct slab applies
    pct_slabs = [b for b in out["breakdown"] if b["type"] == "% of Total Sale"]
    assert len(pct_slabs) == 1, f"Only one total_pct slab should apply, got {pct_slabs}"


def test_slab_below_threshold_no_earnings():
    """Achievement 80% → no slab crossed → earned 0."""
    plan = _plan_two_slabs()
    target = 37500.0
    actual = 30000.0  # 80%
    out = srv._compute_incentive_amount(plan, target, actual)
    assert round(out["achievement_pct"], 2) == 80.0
    assert out["earned"] == 0
    assert out["breakdown"] == []


# =============================================== 3) ACTUAL_SALES SUMS BY `date`
@pytest.mark.asyncio
async def test_actual_sales_uses_date_field():
    """Sum of Imran's completed tokens in 2026-04 should be 63360 via the `date` field."""
    total = await srv._get_barber_actual_sales(SALON_ID, BARBER_ID, "2026-04")
    assert total == 63360.0, f"Expected 63360.0 (real Imran data); got {total}"


# ============================== 4) LIVE API REGRESSION (achievement / earned)
def test_live_incentive_endpoint_imran_regression(auth_headers):
    """Hit list_incentives for 2026-04: Imran row must show actual=63360, ach=168.96, earned=19008."""
    r = requests.get(
        f"{BASE_URL}/api/salons/{SALON_ID}/reward-plan/incentives",
        params={"month": "2026-04", "barber_id": BARBER_ID},
        headers=auth_headers,
        timeout=30,
    )
    assert r.status_code == 200, r.text
    data = r.json()
    incentives = data["incentives"]
    assert len(incentives) >= 1
    row = next(i for i in incentives if i["barber_id"] == BARBER_ID)
    assert round(row["actual_sales"], 2) == 63360.0, row
    assert round(row["achievement_pct"], 2) == 168.96, row
    assert round(row["incentive_earned"], 2) == 19008.0, row
    # breakdown must show the highest crossed slab
    assert any(
        b.get("slab") == "120%-150%" and b.get("rate") == "30%"
        for b in row.get("breakdown", [])
    ), row.get("breakdown")


# ====== 5) RECOMPUTE ON COMPLETE — ensure new completed token bumps actual_sales
@pytest.mark.asyncio
async def test_complete_token_triggers_incentive_recompute(auth_headers):
    """Insert a waiting token (today, _test_iter9), call /complete, verify
    incentive recompute picked it up for the matching year-month."""
    c = AsyncIOMotorClient(MONGO_URL)
    db = c[DB_NAME]

    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    ym = today[:7]

    # Snapshot existing actual_sales for that month
    before = await srv._get_barber_actual_sales(SALON_ID, BARBER_ID, ym)

    token_id = str(uuid.uuid4())
    token_doc = {
        "id": token_id,
        "_test_iter9": True,
        "salon_id": SALON_ID,
        "barber_id": BARBER_ID,
        "barber_name": "Imran",
        "customer_name": "ITER9_TEST",
        "customer_phone": "+910000099991",
        "selected_services": [],
        "total_amount": 1234.0,
        "total_service_minutes": 30,
        "blocked_minutes": 23,
        "status": "waiting",
        "payment_confirmed": True,
        "date": today,
        "shift": "Morning",
        "token_number": 99991,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.tokens.insert_one(token_doc)
    try:
        # Hit the complete endpoint — must trigger _recompute_incentive_payout
        r = requests.post(
            f"{BASE_URL}/api/tokens/{token_id}/complete",
            headers=auth_headers,
            timeout=30,
        )
        assert r.status_code == 200, r.text

        after = await srv._get_barber_actual_sales(SALON_ID, BARBER_ID, ym)
        assert after - before == pytest.approx(1234.0), (
            f"actual_sales did not update on complete: before={before} after={after}"
        )

        # Live API should reflect new totals
        r2 = requests.get(
            f"{BASE_URL}/api/salons/{SALON_ID}/reward-plan/incentives",
            params={"month": ym, "barber_id": BARBER_ID},
            headers=auth_headers,
            timeout=30,
        )
        assert r2.status_code == 200
        row = next(i for i in r2.json()["incentives"] if i["barber_id"] == BARBER_ID)
        assert round(row["actual_sales"], 2) == round(after, 2)
    finally:
        await db.tokens.delete_one({"id": token_id})
        # Recompute again so dashboard goes back to clean state
        await srv._recompute_incentive_payout(SALON_ID, BARBER_ID, ym)
