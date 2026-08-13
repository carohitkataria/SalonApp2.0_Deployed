"""WS3 migration — scan all credential-bearing accounts for login-ID conflicts
across the whole platform, print a conflict report (WITHOUT auto-renaming), and
build the `login_ids` registry from clean (non-conflicting) data.

Run:  python migrate_login_ids.py
"""
import asyncio
import os
import uuid
from collections import defaultdict
from datetime import datetime, timezone

from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
from pathlib import Path

load_dotenv(Path(__file__).parent / '.env')
client = AsyncIOMotorClient(os.environ['MONGO_URL'])
db = client[os.environ['DB_NAME']]

RESERVED = {"admin"}


def norm(s):
    return (s or "").strip().lower()


async def main():
    users = await db.salon_users.find(
        {"login_id": {"$exists": True, "$ne": None}},
        {"_id": 0, "id": 1, "login_id": 1, "salon_id": 1, "name": 1, "role": 1},
    ).to_list(100000)

    by_key = defaultdict(list)
    for u in users:
        k = norm(u.get("login_id"))
        if not k or k in RESERVED:
            continue
        by_key[k].append(u)

    conflicts = {k: v for k, v in by_key.items() if len(v) > 1}
    print(f"Scanned {len(users)} salon_user accounts.")
    print(f"Distinct non-reserved login IDs: {len(by_key)}")
    print(f"CONFLICTS (same login ID on 2+ accounts): {len(conflicts)}")
    print("-" * 70)
    for k, holders in conflicts.items():
        print(f"  login_id '{k}' is held by {len(holders)} accounts:")
        for h in holders:
            print(f"     - user_id={h.get('id')} salon_id={h.get('salon_id')} name={h.get('name')} role={h.get('role')}")
    if not conflicts:
        print("  None — data is clean.")
    print("-" * 70)

    # Build the registry from clean data. For conflicting keys the FIRST holder
    # wins the registry row; the rest are flagged (left for manual resolution).
    built = 0
    for k, holders in by_key.items():
        winner = holders[0]
        try:
            await db.login_ids.update_one(
                {"key": k},
                {"$set": {"key": k, "login_id": (winner.get("login_id") or "").strip(),
                          "owner_type": "staff", "owner_id": winner.get("id"),
                          "salon_id": winner.get("salon_id"),
                          "updated_at": datetime.now(timezone.utc).isoformat()},
                 "$setOnInsert": {"id": str(uuid.uuid4()), "created_at": datetime.now(timezone.utc).isoformat()}},
                upsert=True,
            )
            built += 1
        except Exception as e:
            print(f"  ! failed to register '{k}': {e}")
    try:
        await db.login_ids.create_index("key", unique=True)
    except Exception as e:
        print(f"  ! unique index note: {e}")
    print(f"Registry rows ensured: {built}")
    print("Done. Resolve the conflicts above manually (rename staff IDs), then re-run.")


if __name__ == "__main__":
    asyncio.run(main())
