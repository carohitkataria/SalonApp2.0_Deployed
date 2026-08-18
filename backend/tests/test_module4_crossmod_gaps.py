"""Module 4 Phase 7/8 — cross-module gap extra tests (iteration 20).

Covers items called out in the iter-20 review request that were not
already exercised explicitly:
  • leave_type_snapshot persistence on leave-records (POST stores it,
    and salary still treats the day as the snapshot intended even after
    leave-type config is flipped is_paid=False).
  • staff-attendance/report?branch_id=... only returns barbers in that
    branch.
  • staff-attendance/report?barber_ids=<csv> only returns those barbers.
"""

import os
import uuid

import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL") or "https://appt-filter-redesign.preview.emergentagent.com"
SALON_ID = "a6f10c9e-f0e0-4128-8246-00282188c70b"


@pytest.fixture(scope="module")
def auth():
    r = requests.post(f"{BASE_URL}/api/salon/users/login",
                      json={"identifier": "+917503070727", "password": "salon123"}, timeout=30)
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


@pytest.fixture(scope="module")
def barbers(auth):
    r = requests.get(f"{BASE_URL}/api/salons/{SALON_ID}/barbers", headers=auth, timeout=30)
    items = r.json() if isinstance(r.json(), list) else (r.json().get("barbers") or [])
    assert len(items) >= 1
    return items


# ---------- 1. Report filters ----------
class TestReportFilters:
    def test_branch_id_filter_scopes_rows(self, auth, barbers):
        b = barbers[0]
        if not b.get("branch_id"):
            pytest.skip("First barber has no branch_id; cannot test branch filter")
        r = requests.get(
            f"{BASE_URL}/api/salons/{SALON_ID}/staff-attendance/report",
            headers=auth,
            params={"start_date": "2030-04-01", "end_date": "2030-04-02", "branch_id": b["branch_id"]},
            timeout=30,
        )
        assert r.status_code == 200, r.text
        rows = r.json()["rows"]
        if rows:
            staff_ids = {row["staff_id"] for row in rows}
            expected = {x["id"] for x in barbers if x.get("branch_id") == b["branch_id"]}
            assert staff_ids.issubset(expected), f"Got staff outside branch: {staff_ids - expected}"

    def test_barber_ids_filter_scopes_rows(self, auth, barbers):
        target = barbers[0]["id"]
        r = requests.get(
            f"{BASE_URL}/api/salons/{SALON_ID}/staff-attendance/report",
            headers=auth,
            params={"start_date": "2030-04-01", "end_date": "2030-04-02", "barber_ids": target},
            timeout=30,
        )
        assert r.status_code == 200, r.text
        rows = r.json()["rows"]
        # If we got rows, every row must be for the target barber.
        for row in rows:
            assert row["staff_id"] == target

    def test_end_before_start_400(self, auth):
        r = requests.get(
            f"{BASE_URL}/api/salons/{SALON_ID}/staff-attendance/report",
            headers=auth,
            params={"start_date": "2030-05-10", "end_date": "2030-05-01"},
            timeout=30,
        )
        assert r.status_code == 400


# ---------- 2. leave_type_snapshot persistence ----------
class TestLeaveTypeSnapshot:
    def test_snapshot_is_stored_and_salary_uses_it(self, auth, barbers):
        barber_id = barbers[0]["id"]

        # Ensure barber has a comp doc so salary works.
        requests.put(
            f"{BASE_URL}/api/salons/{SALON_ID}/barbers/{barber_id}/compensation",
            headers=auth,
            json={"base_salary": 26000, "rate_type": "monthly", "monthly_working_days": 26},
            timeout=30,
        )

        # 1. Create a custom paid leave type (uniquify).
        code = f"SNAP{uuid.uuid4().hex[:4].upper()}"
        rt = requests.post(
            f"{BASE_URL}/api/salons/{SALON_ID}/leave-types-config",
            headers=auth,
            json={"code": code, "display_name": "Snap test paid leave", "is_paid": True, "default_annual_quota": 10},
            timeout=30,
        )
        assert rt.status_code in (200, 201), rt.text
        lt = rt.json()
        lt_id = lt.get("id") or lt.get("leave_type_id")

        # 2. Top up balance (use FY matching the leave date).
        adj = requests.post(
            f"{BASE_URL}/api/salons/{SALON_ID}/barbers/{barber_id}/leave-balance/adjust",
            headers=auth,
            json={"leave_type_code": code, "qty_delta": 5, "reason": "snapshot-test", "financial_year": "2070-71"},
            timeout=30,
        )
        assert adj.status_code in (200, 201), adj.text

        # 3. Create a leave record for a future month (uniquify date by day).
        import secrets
        day = secrets.randbelow(27) + 1  # 1..27
        leave_date = f"2070-06-{day:02d}"
        # FY for 2070-06-15 is 2070-71
        lr = requests.post(
            f"{BASE_URL}/api/salons/{SALON_ID}/leave-records",
            headers=auth,
            json={"barber_id": barber_id, "date": leave_date, "leave_type_code": code, "half_day": False, "note": "snap"},
            timeout=30,
        )
        assert lr.status_code in (200, 201), lr.text
        body = lr.json()
        rec = body.get("record") or body
        leave_record_id = rec.get("id")
        snap_inline = rec.get("leave_type_snapshot")
        assert snap_inline, f"snapshot missing in POST response: {body}"
        assert snap_inline.get("is_paid") is True

        # 4. List leave-records and confirm leave_type_snapshot is persisted.
        listed = requests.get(
            f"{BASE_URL}/api/salons/{SALON_ID}/leave-records",
            headers=auth,
            params={"barber_id": barber_id, "from": leave_date, "to": leave_date},
            timeout=30,
        ).json()
        items = listed.get("records") if isinstance(listed, dict) else listed
        match = next((x for x in items if x.get("date") == leave_date), None)
        assert match is not None, f"Created leave record not found: {listed}"
        snap = match.get("leave_type_snapshot")
        assert snap, f"leave_type_snapshot missing on record: {match}"
        assert snap.get("code") == code
        assert snap.get("is_paid") is True

        # 5. Flip the leave-type config to is_paid=False.
        requests.put(
            f"{BASE_URL}/api/salons/{SALON_ID}/leave-types-config/{lt_id}",
            headers=auth,
            json={"is_paid": False},
            timeout=30,
        )

        # 6. Recompute salary for 2055-06 — snapshot is_paid=True must
        #    keep this day in paid_leave_days (not unpaid).
        sal = requests.get(
            f"{BASE_URL}/api/salons/{SALON_ID}/staff-salary/month/2070-06",
            headers=auth, params={"barber_id": barber_id}, timeout=30,
        )
        assert sal.status_code == 200, sal.text
        body = sal.json()
        # Pick this barber's row out of the response (may be list or dict).
        row = None
        if isinstance(body, list):
            row = next((x for x in body if x.get("barber_id") == barber_id), None)
        elif isinstance(body, dict):
            rows = body.get("rows") or body.get("salaries") or body.get("items")
            if isinstance(rows, list):
                row = next((x for x in rows if x.get("barber_id") == barber_id), None)
            else:
                row = body  # single-barber response shape
        assert row, f"barber row not found in salary response: {body}"
        unpaid = row.get("unpaid_leave_days", 0)
        paid = row.get("paid_leave_days", 0)
        # Snapshot wins: the 1 day must NOT be classified unpaid.
        assert unpaid == 0 or paid >= 1, (
            f"Snapshot not respected — unpaid={unpaid}, paid={paid}, row={row}"
        )

        # Cleanup: restore is_paid=True, delete the leave record.
        requests.put(
            f"{BASE_URL}/api/salons/{SALON_ID}/leave-types-config/{lt_id}",
            headers=auth, json={"is_paid": True}, timeout=30,
        )
        if leave_record_id:
            requests.delete(
                f"{BASE_URL}/api/salons/{SALON_ID}/leave-records/{leave_record_id}",
                headers=auth, timeout=30,
            )
        # Soft-delete the leave-type
        requests.delete(
            f"{BASE_URL}/api/salons/{SALON_ID}/leave-types-config/{lt_id}",
            headers=auth, timeout=30,
        )
