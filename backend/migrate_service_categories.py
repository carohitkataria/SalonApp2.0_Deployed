"""Idempotent migration: normalise the service taxonomy.

Old data stored the fine-grained bucket (e.g. "Facial", "Hair Cut", "Bridal
Package") directly in `services.category` and left `sub_category` empty.

The app now expects a two-level taxonomy:
  • category      -> top level: "Services" or "Packages"
  • sub_category  -> fine-grained bucket (the old category value)

This script moves the old `category` value into `sub_category` and sets
`category` to "Packages" when the bucket/name looks like a package, else
"Services". It is idempotent: services whose `category` is already
"Services"/"Packages" are left untouched.

Run:  python migrate_service_categories.py
"""
import asyncio
import os
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

TOP_LEVELS = {"Services", "Packages"}


def _is_package(old_cat: str, name: str) -> bool:
    blob = f"{old_cat or ''} {name or ''}".lower()
    return "package" in blob or "combo" in blob


async def migrate():
    client = AsyncIOMotorClient(os.environ["MONGO_URL"], serverSelectionTimeoutMS=15000)
    db = client[os.environ["DB_NAME"]]

    cursor = db.services.find({}, {"_id": 0, "id": 1, "category": 1, "sub_category": 1, "service_name": 1})
    total = 0
    migrated = 0
    skipped = 0
    async for svc in cursor:
        total += 1
        cat = (svc.get("category") or "").strip()
        # Already migrated — leave as-is (idempotent)
        if cat in TOP_LEVELS:
            skipped += 1
            continue

        old_cat = cat or "General"
        name = svc.get("service_name") or ""
        new_top = "Packages" if _is_package(old_cat, name) else "Services"
        # Preserve an existing sub_category if present; otherwise use the old category value.
        new_sub = (svc.get("sub_category") or "").strip() or old_cat

        await db.services.update_one(
            {"id": svc["id"]},
            {"$set": {"category": new_top, "sub_category": new_sub}},
        )
        migrated += 1

    print(f"[migrate_service_categories] total={total} migrated={migrated} skipped(already_done)={skipped}")

    # Quick distribution report
    for top in sorted(TOP_LEVELS):
        c = await db.services.count_documents({"category": top})
        print(f"  category='{top}': {c}")
    client.close()


if __name__ == "__main__":
    asyncio.run(migrate())
