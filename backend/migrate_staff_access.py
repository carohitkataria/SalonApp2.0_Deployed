"""
One-time migration for the Staff Access Consolidation.

For every `barbers` doc that carries a legacy `login_id` / `login_password_hash`:
  1. Find the `salon_users` record linked via `staff_id == barber.id`.
  2. If found  -> keep the existing salon_users credentials (they are the ones
     that actually worked). Log the discarded barber-side login_id.
  3. If not    -> create a `salon_users` record from the barber, carrying
     login_id + login_password_hash -> password_hash (both are pwd_context
     hashes, so it copies directly). role_id = system Staff role.
  4. $unset login_id / login_password_hash / password_updated_at from the barber.

Usage:
    python migrate_staff_access.py --dry-run
    python migrate_staff_access.py
"""

import argparse
import asyncio
import os
import uuid
from datetime import datetime, timezone

from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

client = AsyncIOMotorClient(os.environ["MONGO_URL"])
db = client[os.environ["DB_NAME"]]


MODULE_SCHEMA = {
    "staff": ["view", "view_all", "create", "edit", "delete", "attendance",
              "salary_view", "salary_pay", "documents", "access_control"],
    "financials": ["view_dashboard", "view_transactions", "create_transaction",
                   "edit_transaction", "delete_transaction"],
    "analytics": ["view"],
    "services": ["view", "create", "edit", "delete", "toggle", "upload_csv",
                 "manage_categories", "manage_packages", "manage_memberships"],
    "gallery": ["view", "upload", "delete"],
    "marketing": ["view", "create_campaign", "edit_campaign", "delete_campaign",
                  "manage_coupons", "manage_loyalty"],
    "salon_settings": ["view", "edit_profile", "edit_hours", "edit_notifications",
                       "edit_branches", "manage_users", "manage_subscription"],
    "delete_salon": ["allowed"],
}


def _build_modules(value):
    return {m: {a: value for a in actions} for m, actions in MODULE_SCHEMA.items()}


async def ensure_staff_role(salon_id):
    existing = await db.salon_roles.find_one(
        {"salon_id": salon_id, "is_system": True, "base_role": "staff"}, {"_id": 0}
    )
    if existing:
        return existing
    now = datetime.now(timezone.utc).isoformat()
    templates = [
        ("Owner / Admin", "admin", _build_modules(True)),
        ("Branch Manager", "branch_manager", _build_modules(True)),
        ("Staff", "staff", _build_modules(False)),
    ]
    staff_role = None
    for name, base, mods in templates:
        role = {
            "id": str(uuid.uuid4()), "salon_id": salon_id, "name": name,
            "description": None, "base_role": base, "is_system": True,
            "modules": mods, "created_at": now, "updated_at": now,
        }
        await db.salon_roles.insert_one(role)
        if base == "staff":
            staff_role = role
    return staff_role


async def run(dry_run):
    created = 0
    merged = 0
    conflicts = []
    cleaned = 0

    cursor = db.barbers.find(
        {"$or": [{"login_id": {"$exists": True, "$ne": None}},
                 {"login_password_hash": {"$exists": True, "$ne": None}}]},
        {"_id": 0},
    )
    barbers = await cursor.to_list(length=None)
    print(f"Found {len(barbers)} barber(s) with legacy credentials.\n")

    for b in barbers:
        salon_id = b.get("salon_id")
        bid = b.get("id")
        b_login = b.get("login_id")
        account = await db.salon_users.find_one(
            {"staff_id": bid, "salon_id": salon_id}, {"_id": 0}
        )
        if account:
            merged += 1
            if b_login and b_login != account.get("login_id"):
                conflicts.append((b.get("name"), b_login, account.get("login_id")))
            print(f"  MERGE  {b.get('name'):<20} kept salon_users login "
                  f"'{account.get('login_id')}' (discarded barber login '{b_login}')")
        else:
            staff_role = await ensure_staff_role(salon_id)
            now = datetime.now(timezone.utc).isoformat()
            mobile = b.get("mobile") or ""
            if mobile and not str(mobile).startswith("+91") and str(mobile).isdigit():
                mobile = f"+91{mobile}"
            new_account = {
                "id": str(uuid.uuid4()), "salon_id": salon_id,
                "branch_id": b.get("branch_id"),
                "name": b.get("name") or "Staff", "mobile": mobile,
                "login_id": b_login or f"staff_{bid[:8]}",
                "password_hash": b.get("login_password_hash") or "",
                "role": "staff",
                "role_id": staff_role["id"] if staff_role else None,
                "staff_id": bid, "assigned_branch_ids": [],
                "permissions": {"modules": {}},
                "status": "active", "created_at": now, "updated_at": now,
                "password_updated_at": b.get("password_updated_at"),
            }
            created += 1
            print(f"  CREATE {b.get('name'):<20} -> salon_users login "
                  f"'{new_account['login_id']}'")
            if not dry_run:
                await db.salon_users.insert_one(new_account)

        if not dry_run:
            await db.barbers.update_one(
                {"id": bid},
                {"$unset": {"login_id": "", "login_password_hash": "",
                            "password_updated_at": ""}},
            )
        cleaned += 1

    print("\n" + "=" * 50)
    print(f"{'DRY RUN — no changes written' if dry_run else 'MIGRATION COMPLETE'}")
    print(f"  Created new accounts : {created}")
    print(f"  Merged (kept existing): {merged}")
    print(f"  Barber docs cleaned  : {cleaned}")
    if conflicts:
        print(f"\n  CONFLICTS ({len(conflicts)}) — barber login discarded in favour of salon_users:")
        for name, bl, sl in conflicts:
            print(f"    - {name}: barber='{bl}' discarded, salon_users='{sl}' kept")
    print("=" * 50)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true", help="Preview without writing")
    args = parser.parse_args()
    asyncio.run(run(args.dry_run))
