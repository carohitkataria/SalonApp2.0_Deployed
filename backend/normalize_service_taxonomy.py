"""
normalize_service_taxonomy.py — permanent 2-level taxonomy standardization.

Level 1 (type)  -> service.category  ∈ {"Services", "Packages"}
Level 2 (group) -> service.sub_category (Haircut, Hair Spa, Facial, …)

Also (re)builds the per-salon classification MASTER (db.salon_classification)
so the Service page, appointment page, reports and customer booking all read
the SAME L2 category list.

Idempotent — safe to run repeatedly. Run for one salon (SALON_ID env) or all.
"""
import asyncio
import os
from motor.motor_asyncio import AsyncIOMotorClient

MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "salon_db")

L1_TYPES = {"Services", "Packages"}


def _is_package(svc: dict) -> bool:
    if (svc.get("category") or "") == "Packages":
        return True
    if svc.get("package_items"):
        return True
    if (svc.get("sub_category") or "").lower() in ("bridal", "grooming combos"):
        # heuristic only when nothing else says package
        return bool(svc.get("package_items"))
    return False


async def normalize_salon(db, salon_id: str):
    services = await db.services.find({"salon_id": salon_id}).to_list(5000)
    svc_cats, pkg_cats = set(), set()
    fixed = 0
    for s in services:
        cat = (s.get("category") or "").strip()
        sub = (s.get("sub_category") or "").strip()
        is_pkg = _is_package(s)
        l1 = "Packages" if is_pkg else "Services"
        updates = {}
        # If category holds an L2 name (not a valid L1 type), demote it to sub_category.
        if cat not in L1_TYPES:
            if not sub and cat:
                sub = cat
            updates["sub_category"] = sub
            updates["category"] = l1
        elif cat != l1:
            updates["category"] = l1
        if not sub:
            sub = "General"
            updates["sub_category"] = sub
        if updates:
            await db.services.update_one({"id": s["id"]}, {"$set": updates})
            fixed += 1
        (pkg_cats if l1 == "Packages" else svc_cats).add(sub)

    # Merge into classification master (preserve existing thumbnails/order).
    doc = await db.salon_classification.find_one({"salon_id": salon_id}) or {}
    existing = {c["name"]: c for c in (doc.get("categories") or []) if isinstance(c, dict) and c.get("name")}
    for name in sorted(svc_cats):
        if name and name not in existing:
            existing[name] = {"name": name, "thumbnail_url": ""}
    merged_cats = list(existing.values())
    existing_pkg = set(doc.get("package_categories") or [])
    merged_pkg = sorted(existing_pkg | {p for p in pkg_cats if p})

    await db.salon_classification.update_one(
        {"salon_id": salon_id},
        {"$set": {
            "salon_id": salon_id,
            "categories": merged_cats,
            "package_categories": merged_pkg,
            "tiers": doc.get("tiers") or ["Basic", "Standard", "Premium", "Ultra"],
            "lengths": doc.get("lengths") or ["Short", "Medium", "Long", "XL"],
        }},
        upsert=True,
    )
    print(f"[{salon_id}] services_fixed={fixed} L2_service_cats={len(merged_cats)} L2_pkg_cats={len(merged_pkg)}")


async def main():
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]
    target = os.environ.get("SALON_ID")
    if target:
        salon_ids = [target]
    else:
        salon_ids = await db.services.distinct("salon_id")
    print(f"Normalizing taxonomy for {len(salon_ids)} salon(s)…")
    for sid in salon_ids:
        if sid:
            await normalize_salon(db, sid)
    print("Done.")


if __name__ == "__main__":
    asyncio.run(main())
