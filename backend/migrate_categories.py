"""WS4 migration — build ONE canonical category taxonomy per salon and rewrite
service documents to reference `category_id`.

Strategy: the CUSTOMER-FACING categories are the canonical set. In this app the
customer view groups services by their `category` string, so the distinct
`category` strings actually attached to a salon's services ARE the canonical
customer set. We (1) create a `categories` row per distinct (salon, name),
(2) map every service's free-text category onto that canonical row (case/space
insensitive), (3) set `category_id` on the service and normalise the `category`
name mirror. A mapping report is printed for review.

Run (report only):   python migrate_categories.py
Run (apply writes):  python migrate_categories.py --apply
"""
import asyncio
import os
import re
import sys
import uuid
from collections import defaultdict
from datetime import datetime, timezone

from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
from pathlib import Path

load_dotenv(Path(__file__).parent / '.env')
client = AsyncIOMotorClient(os.environ['MONGO_URL'])
db = client[os.environ['DB_NAME']]

APPLY = "--apply" in sys.argv


def slugify(name):
    s = re.sub(r"[^a-z0-9]+", "-", (name or "").strip().lower()).strip("-")
    return s or "category"


async def ensure_cat(salon_id, ctype, name, order, thumb=None):
    slug = slugify(name)
    existing = await db.categories.find_one({"salon_id": salon_id, "type": ctype, "slug": slug}, {"_id": 0})
    if existing:
        return existing
    doc = {"id": str(uuid.uuid4()), "salon_id": salon_id, "type": ctype,
           "name": name.strip(), "slug": slug, "sort_order": order, "active": True,
           "thumbnail_url": thumb, "created_at": datetime.now(timezone.utc).isoformat()}
    if APPLY:
        await db.categories.insert_one({**doc})
    return doc


async def migrate_type(ctype, collection, name_field="category"):
    coll = getattr(db, collection)
    items = await coll.find({}, {"_id": 0}).to_list(200000)
    # group by salon
    by_salon = defaultdict(list)
    for it in items:
        sid = it.get("salon_id")
        if sid:
            by_salon[sid].append(it)
    print(f"\n=== {ctype.upper()} ({collection}) — {len(items)} items across {len(by_salon)} salons ===")
    for sid, its in by_salon.items():
        # canonical set = distinct names (preserve first-seen order)
        order_map = {}
        for it in its:
            nm = (it.get(name_field) or "General").strip() or "General"
            key = slugify(nm)
            if key not in order_map:
                order_map[key] = nm
        print(f"  salon {sid}: {len(order_map)} canonical categories -> {list(order_map.values())}")
        slug_to_doc = {}
        for i, (slug, nm) in enumerate(order_map.items()):
            thumb = next((it.get("thumbnail_url") for it in its
                          if slugify((it.get(name_field) or "").strip()) == slug and it.get("thumbnail_url")), None)
            slug_to_doc[slug] = await ensure_cat(sid, ctype, nm, i, thumb)
        # assign category_id to each item
        assigned = 0
        for it in its:
            nm = (it.get(name_field) or "General").strip() or "General"
            doc = slug_to_doc.get(slugify(nm))
            if not doc:
                continue
            if it.get("category_id") == doc["id"] and it.get(name_field) == doc["name"]:
                continue
            if APPLY:
                await coll.update_one({"id": it.get("id")},
                                      {"$set": {"category_id": doc["id"], name_field: doc["name"]}})
            assigned += 1
        print(f"     assigned category_id to {assigned} items")


async def main():
    print("MODE:", "APPLY (writing changes)" if APPLY else "DRY-RUN (report only, no writes)")
    await migrate_type("service", "services", "category")
    # products (inventory) — only if they carry a category string
    try:
        await migrate_type("product", "salon_inventory", "category")
    except Exception as e:
        print("  (products skipped:", e, ")")
    if APPLY:
        try:
            await db.categories.create_index([("salon_id", 1), ("type", 1), ("slug", 1)], unique=True)
        except Exception as e:
            print("  index note:", e)
    print("\nDone.", "Changes applied." if APPLY else "Re-run with --apply to write.")


if __name__ == "__main__":
    asyncio.run(main())
