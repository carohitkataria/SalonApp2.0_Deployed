"""Seed an approved supplier with a handful of products for Phase 10-12 tests.

Idempotent: re-running just upserts. Safe in CI/dev.
"""
import asyncio
import os
from datetime import datetime, timezone

from motor.motor_asyncio import AsyncIOMotorClient
from passlib.context import CryptContext

MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "salon_app")

pwd_ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


SUPPLIER_FIXTURES = [
    {
        "id": "test-supplier-glow",
        "business_name": "Glow Beauty Wholesale",
        "owner_name": "Aarav Kapoor",
        "phone": "+919000000001",
        "email": "glow.test@salonhub.in",
        "city": "Mumbai",
        "state": "Maharashtra",
        "rating_avg": 4.6,
        "rating_count": 184,
        "products": [
            {"name": "Premium Hair Serum 100ml",  "brand": "GlowPro", "category": "Hair Care",
             "selling_price": 549, "mrp": 699, "gst_percent": 18, "inventory_available": 80, "unit": "bottle"},
            {"name": "Argan Oil Shampoo 1L",      "brand": "GlowPro", "category": "Hair Care",
             "selling_price": 899, "mrp": 1099, "gst_percent": 18, "inventory_available": 40, "unit": "bottle"},
            {"name": "Disposable Towels (50 pcs)","brand": "SalonEssentials", "category": "Disposables",
             "selling_price": 350, "mrp": 450, "gst_percent": 12, "inventory_available": 200, "unit": "pack"},
            {"name": "Out of stock test item",    "brand": "GlowPro", "category": "Hair Care",
             "selling_price": 199, "mrp": 250, "gst_percent": 18, "inventory_available": 0, "unit": "piece"},
        ],
    },
    {
        "id": "test-supplier-luxe",
        "business_name": "Luxe Cosmetics Direct",
        "owner_name": "Priya Sharma",
        "phone": "+919000000002",
        "email": "luxe.test@salonhub.in",
        "city": "Delhi",
        "state": "Delhi",
        "rating_avg": 4.2,
        "rating_count": 92,
        "products": [
            {"name": "Acrylic Nail Polish Kit",   "brand": "LuxeNails", "category": "Nail Care",
             "selling_price": 1299, "mrp": 1599, "gst_percent": 18, "inventory_available": 25, "unit": "kit"},
            {"name": "Skin Bleach Cream 250g",    "brand": "LuxeSkin", "category": "Skin Care",
             "selling_price": 380, "mrp": 450, "gst_percent": 18, "inventory_available": 60, "unit": "jar"},
            {"name": "Manicure Tool Set",         "brand": "LuxeTools", "category": "Tools",
             "selling_price": 1750, "mrp": 2200, "gst_percent": 18, "inventory_available": 15, "unit": "set"},
        ],
    },
]


async def seed():
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]

    for sup in SUPPLIER_FIXTURES:
        supplier_doc = {
            "id": sup["id"],
            "business_name": sup["business_name"],
            "owner_name": sup["owner_name"],
            "phone": sup["phone"],
            "mobile": sup["phone"],  # supplier_auth queries by `mobile`
            "email": sup["email"],
            "city": sup["city"],
            "state": sup["state"],
            "country": "India",
            "rating_avg": sup["rating_avg"],
            "rating_count": sup["rating_count"],
            "status": "active",
            "approved_at": _now_iso(),
            "password_hash": pwd_ctx.hash("supplier123"),
            "login_id": sup["phone"],
            "created_at": _now_iso(),
            "updated_at": _now_iso(),
        }
        await db.suppliers.update_one(
            {"id": sup["id"]},
            {"$set": supplier_doc},
            upsert=True,
        )

        for p in sup["products"]:
            product_id = f"{sup['id']}::{p['name']}".replace(" ", "_")[:80]
            doc = {
                "id": product_id,
                "supplier_id": sup["id"],
                "name": p["name"],
                "brand": p["brand"],
                "category": p["category"],
                "description": f"Test product from {sup['business_name']} — {p['name']}.",
                "images": [],
                "selling_price": p["selling_price"],
                "mrp": p["mrp"],
                "gst_percent": p["gst_percent"],
                "inventory_available": p["inventory_available"],
                "inventory_reserved": 0,
                "min_order_qty": 1,
                "pack_size": None,
                "unit": p["unit"],
                "is_active": True,
                "is_deleted": False,
                "created_at": _now_iso(),
                "updated_at": _now_iso(),
            }
            await db.supplier_products.update_one(
                {"id": product_id},
                {"$set": doc},
                upsert=True,
            )

    print(f"Seeded {len(SUPPLIER_FIXTURES)} suppliers with "
          f"{sum(len(s['products']) for s in SUPPLIER_FIXTURES)} products.")


if __name__ == "__main__":
    asyncio.run(seed())
