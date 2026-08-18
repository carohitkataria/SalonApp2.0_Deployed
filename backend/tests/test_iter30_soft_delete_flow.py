"""Full soft-delete flow test — mints platform_admin JWT & seeds throwaway salon."""
import os
import uuid
import time
import pytest
import requests
import jwt
from datetime import datetime, timezone, timedelta
from dotenv import load_dotenv

load_dotenv('/app/backend/.env')

BASE_URL = (os.environ.get('REACT_APP_BACKEND_URL') or 'https://appt-filter-redesign.preview.emergentagent.com').rstrip('/')
SECRET_KEY = os.environ['JWT_SECRET_KEY']


@pytest.fixture(scope="module")
def platform_token():
    # Fetch owner id from DB
    from pymongo import MongoClient
    m = MongoClient(os.environ['MONGO_URL'])
    db = m[os.environ['DB_NAME']]
    owner = db.platform_admins.find_one({"is_owner": True})
    assert owner, "No platform admin owner seeded"
    payload = {
        "role": "platform_admin",
        "platform_admin_id": owner["id"],
        "mobile": owner["mobile"],
        "is_owner": True,
        "iat": int(datetime.now(timezone.utc).timestamp()),
        "exp": int((datetime.now(timezone.utc) + timedelta(hours=1)).timestamp()),
    }
    return jwt.encode(payload, SECRET_KEY, algorithm="HS256")


@pytest.fixture(scope="module")
def throwaway_salon():
    """Insert a throwaway salon directly into MongoDB for delete testing."""
    from pymongo import MongoClient
    m = MongoClient(os.environ['MONGO_URL'])
    db = m[os.environ['DB_NAME']]
    sid = str(uuid.uuid4())
    phone = f"+9188888{uuid.uuid4().hex[:5]}"
    now = datetime.now(timezone.utc).isoformat()
    # Minimal salon doc + password hash so we can attempt login later
    from passlib.context import CryptContext
    pwd = CryptContext(schemes=["bcrypt"], deprecated="auto")
    doc = {
        "id": sid,
        "salon_name": f"TEST_Throwaway_{sid[:8]}",
        "owner_name": "Test Owner",
        "phone": phone,
        "email": f"tw_{sid[:6]}@example.com",
        "password_hash": pwd.hash("salon123"),
        "status": "active",
        "is_premium": True,
        "created_at": now,
        "updated_at": now,
    }
    db.salons.insert_one(doc)
    yield {"id": sid, "phone": phone, "password": "salon123"}
    # Cleanup: hard delete
    db.salons.delete_one({"id": sid})


class TestPlatformSoftDelete:
    def test_auth_me(self, platform_token):
        r = requests.get(f"{BASE_URL}/api/platform/auth/me",
                         headers={"Authorization": f"Bearer {platform_token}"}, timeout=15)
        assert r.status_code == 200, f"platform auth/me: {r.status_code} {r.text[:200]}"

    def test_delete_nonexistent_returns_404(self, platform_token):
        r = requests.post(f"{BASE_URL}/api/platform/salons/does-not-exist-{uuid.uuid4().hex[:6]}/delete",
                          headers={"Authorization": f"Bearer {platform_token}"},
                          json={"reason": "test 404 flow"}, timeout=15)
        assert r.status_code == 404, f"{r.status_code}: {r.text[:200]}"

    def test_full_soft_delete_flow(self, platform_token, throwaway_salon):
        sid = throwaway_salon["id"]
        phone = throwaway_salon["phone"]

        # 1. Precheck: salon appears in default list (deleted excluded means only non-deleted; new salon is not deleted so should show)
        # (skip listing all pages; verify it exists via login first)
        pre = requests.post(f"{BASE_URL}/api/salon/password-login",
                            json={"phone": phone, "password": "salon123"}, timeout=15)
        # It should be able to login (or fail with different message, e.g., no admin user seeded). Just require not 410.
        assert pre.status_code != 410, "Salon prematurely marked deleted"

        # 2. Delete
        r = requests.post(f"{BASE_URL}/api/platform/salons/{sid}/delete",
                          headers={"Authorization": f"Bearer {platform_token}"},
                          json={"reason": "iter30 automated soft-delete test"}, timeout=15)
        assert r.status_code == 200, f"delete: {r.status_code} {r.text[:200]}"
        body = r.json()
        assert body.get("ok") is True
        assert body.get("status") == "deleted"

        # 3. Verify DB flags
        from pymongo import MongoClient
        m = MongoClient(os.environ['MONGO_URL'])
        db = m[os.environ['DB_NAME']]
        s = db.salons.find_one({"id": sid})
        assert s.get("is_deleted") is True
        assert s.get("status") == "deleted"
        assert s.get("deleted_at")
        assert s.get("deleted_by")
        assert s.get("delete_reason") == "iter30 automated soft-delete test"

        # 4. Second delete → 409
        r2 = requests.post(f"{BASE_URL}/api/platform/salons/{sid}/delete",
                           headers={"Authorization": f"Bearer {platform_token}"},
                           json={"reason": "again"}, timeout=15)
        assert r2.status_code == 409, f"expected 409 on re-delete, got {r2.status_code}"

        # 5. Login for deleted salon → 410
        r3 = requests.post(f"{BASE_URL}/api/salon/password-login",
                           json={"phone": phone, "password": "salon123"}, timeout=15)
        assert r3.status_code == 410, f"expected 410, got {r3.status_code}: {r3.text[:200]}"

        # 6. List /api/platform/salons default excludes deleted
        rl = requests.get(f"{BASE_URL}/api/platform/salons?page=1&page_size=100",
                          headers={"Authorization": f"Bearer {platform_token}"}, timeout=15)
        assert rl.status_code == 200
        ids = [row["id"] for row in rl.json().get("rows", rl.json().get("items", []))]
        assert sid not in ids, f"Deleted salon still in default list; got ids={ids[:5]}..."

        # 7. status=deleted opts in
        rl2 = requests.get(f"{BASE_URL}/api/platform/salons?status=deleted&page=1&page_size=100",
                           headers={"Authorization": f"Bearer {platform_token}"}, timeout=15)
        assert rl2.status_code == 200
        ids2 = [row["id"] for row in rl2.json().get("rows", rl2.json().get("items", []))]
        assert sid in ids2, f"Deleted salon missing from status=deleted view; got {len(ids2)} rows"
