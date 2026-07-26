"""
seed_demo_extras.py
Add extra demo services (across categories) to the default salon so the Home v2
Appointment drawer chips + category filter have variety to exercise. Idempotent.
"""
import asyncio, os, uuid
from datetime import datetime, timezone
from pathlib import Path
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

load_dotenv(Path(__file__).parent / '.env')

EXTRA = [
    # Hair
    {"service_name": "Hair Color (Global)", "category": "Hair", "base_price": 1800, "default_duration": 60, "gender_tag": "Unisex"},
    {"service_name": "Hair Spa",            "category": "Hair", "base_price": 900,  "default_duration": 45, "gender_tag": "Unisex"},
    {"service_name": "Keratin Treatment",   "category": "Hair", "base_price": 3500, "default_duration": 90, "gender_tag": "Unisex"},
    # Facial
    {"service_name": "Fruit Facial",        "category": "Facial", "base_price": 1200, "default_duration": 45, "gender_tag": "Unisex"},
    {"service_name": "Gold Facial",         "category": "Facial", "base_price": 1700, "default_duration": 45, "gender_tag": "Unisex"},
    {"service_name": "Hydra Facial",        "category": "Facial", "base_price": 2500, "default_duration": 60, "gender_tag": "Unisex"},
    # Clean Up
    {"service_name": "Fruit Clean Up",      "category": "Clean Up", "base_price": 700,  "default_duration": 30, "gender_tag": "Unisex"},
    {"service_name": "O3+ Clean Up",        "category": "Clean Up", "base_price": 1500, "default_duration": 30, "gender_tag": "Unisex"},
    # Manicure / Pedicure
    {"service_name": "Normal Manicure",     "category": "Manicure", "base_price": 500, "default_duration": 45, "gender_tag": "Unisex"},
    {"service_name": "Spa Pedicure",        "category": "Pedicure", "base_price": 900, "default_duration": 45, "gender_tag": "Unisex"},
    # Waxing
    {"service_name": "Full Arms Waxing",    "category": "Waxing", "base_price": 400, "default_duration": 25, "gender_tag": "Women"},
    {"service_name": "Full Legs Waxing",    "category": "Waxing", "base_price": 600, "default_duration": 30, "gender_tag": "Women"},
    # Beard
    {"service_name": "Beard Styling",       "category": "Beard", "base_price": 200, "default_duration": 20, "gender_tag": "Men"},
    {"service_name": "Beard Color",         "category": "Beard", "base_price": 350, "default_duration": 20, "gender_tag": "Men"},
    # Kids
    {"service_name": "Kids Haircut",        "category": "Kids", "base_price": 150, "default_duration": 25, "gender_tag": "Unisex"},
]

# Nice public thumbnails (Unsplash) mapped per category
THUMBS = {
    "Hair": "https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?w=200&h=200&fit=crop",
    "Facial": "https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?w=200&h=200&fit=crop",
    "Clean Up": "https://images.unsplash.com/photo-1560750588-73207b1ef5b8?w=200&h=200&fit=crop",
    "Manicure": "https://images.unsplash.com/photo-1604654894610-df63bc536371?w=200&h=200&fit=crop",
    "Pedicure": "https://images.unsplash.com/photo-1519415510236-718bdfcd89c8?w=200&h=200&fit=crop",
    "Waxing": "https://images.unsplash.com/photo-1522337660859-02fbefca4702?w=200&h=200&fit=crop",
    "Beard": "https://images.unsplash.com/photo-1503951914875-452162b0f3f1?w=200&h=200&fit=crop",
    "Kids": "https://images.unsplash.com/photo-1600180758890-6b94519a8ba6?w=200&h=200&fit=crop",
    "General": "https://images.unsplash.com/photo-1512690829907-77e7b02836f5?w=200&h=200&fit=crop",
}


async def main() -> None:
    client = AsyncIOMotorClient(os.environ["MONGO_URL"])
    db = client[os.environ["DB_NAME"]]

    salon = await db.salons.find_one({}, {"id": 1})
    if not salon:
        print("No salon found — run backend first to auto-seed.")
        return
    sid = salon["id"]
    print(f"Seeding demo extras for salon {sid}")

    added, enabled = 0, 0
    for row in EXTRA:
        existing = await db.services.find_one({"service_name": row["service_name"]})
        if not existing:
            svc_id = str(uuid.uuid4())
            doc = {
                "id": svc_id,
                "service_name": row["service_name"],
                "description": "",
                "category": row["category"],
                "gender_tag": row["gender_tag"],
                "default_duration": row["default_duration"],
                "base_price": row["base_price"],
                "price_type": "fixed",
                "thumbnail_url": THUMBS.get(row["category"], THUMBS["General"]),
                "is_active": True,
            }
            await db.services.insert_one(doc)
            added += 1
        else:
            svc_id = existing["id"]

        # Enable for this salon
        salon_svc = await db.salon_services.find_one({"salon_id": sid, "service_id": svc_id})
        if not salon_svc:
            await db.salon_services.insert_one({
                "id": str(uuid.uuid4()),
                "salon_id": sid,
                "service_id": svc_id,
                "is_enabled": True,
                "salon_price": None,
            })
            enabled += 1
        elif not salon_svc.get("is_enabled"):
            await db.salon_services.update_one(
                {"_id": salon_svc["_id"]},
                {"$set": {"is_enabled": True}},
            )
            enabled += 1

    total_enabled = await db.salon_services.count_documents({"salon_id": sid, "is_enabled": True})
    print(f"✓ Added {added} new services · Newly enabled {enabled} · Total enabled for salon = {total_enabled}")


if __name__ == "__main__":
    asyncio.run(main())
