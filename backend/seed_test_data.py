"""
Idempotent seed for continuation_request:
- Enables 6 sample services for the admin salon
- Ensures 2 barbers are active
- Creates 3 sample bookings (tokens) for today with different statuses

Run: python /app/backend/seed_test_data.py
"""
import asyncio
import uuid
import os
from datetime import datetime, timezone
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
from pathlib import Path

load_dotenv(Path(__file__).parent / '.env')

MONGO_URL = os.environ['MONGO_URL']
DB_NAME = os.environ['DB_NAME']

SERVICES = [
    {"category": "Haircut", "service_name": "Men's Haircut",   "price": 300,  "gender": "Men",     "duration": 30},
    {"category": "Haircut", "service_name": "Women's Haircut", "price": 500,  "gender": "Women",   "duration": 45},
    {"category": "Beard",   "service_name": "Beard Trim",       "price": 150,  "gender": "Men",     "duration": 15},
    {"category": "Facial",  "service_name": "Fruit Facial",     "price": 800,  "gender": "Unisex", "duration": 45},
    {"category": "Hair Colour", "service_name": "Hair Colour", "price": 1500, "gender": "Unisex", "duration": 60},
    {"category": "Manicure", "service_name": "Normal Manicure","price": 500,  "gender": "Women",   "duration": 45},
]


async def main():
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]

    # 1) Find the admin salon (identifier 'admin')
    user = await db.salon_users.find_one({"login_id": "admin"})
    if not user:
        print("[SEED] admin user not found — nothing to do")
        return
    salon_id = user["salon_id"]
    print(f"[SEED] salon_id = {salon_id}")

    # 2) Insert & enable services
    now = datetime.now(timezone.utc).isoformat()
    for svc in SERVICES:
        existing = await db.services.find_one({
            "salon_id": salon_id,
            "service_name": svc["service_name"],
        })
        if existing:
            sid = existing["id"]
        else:
            sid = str(uuid.uuid4())
            await db.services.insert_one({
                "id": sid,
                "salon_id": salon_id,
                "service_name": svc["service_name"],
                "category": svc["category"],
                "description": f"{svc['service_name']} service",
                "gender_tag": svc["gender"],
                "default_duration": svc["duration"],
                "base_price": svc["price"],
                "price_type": "fixed",
                "is_favorite": False,
                "available_at_home": False,
                "is_active": True,
                "is_enabled": True,
                "created_at": now,
                "updated_at": now,
            })
        # Ensure enabled in salon_services (idempotent)
        await db.salon_services.update_one(
            {"salon_id": salon_id, "service_id": sid},
            {"$set": {
                "salon_id": salon_id,
                "service_id": sid,
                "is_enabled": True,
                "updated_at": now,
            }},
            upsert=True,
        )
    print(f"[SEED] Ensured {len(SERVICES)} services enabled")

    # 3) Barbers — ensure at least 2 active
    barbers = await db.barbers.find({"salon_id": salon_id, "is_active": True}).to_list(50)
    if len(barbers) < 2:
        for name, exp in [("Imran", 8), ("Abdul", 5)]:
            existing_b = await db.barbers.find_one({"salon_id": salon_id, "name": name})
            if not existing_b:
                await db.barbers.insert_one({
                    "id": str(uuid.uuid4()),
                    "salon_id": salon_id,
                    "name": name,
                    "specialty": "master",
                    "experience_years": exp,
                    "is_active": True,
                    "is_barber": True,
                    "phone": "+919876543211",
                    "created_at": now,
                })
        barbers = await db.barbers.find({"salon_id": salon_id, "is_active": True}).to_list(50)
    print(f"[SEED] Active barbers: {[b['name'] for b in barbers]}")

    # 4) Grab first 3 service ids for booking creation
    enabled_svcs = await db.services.find({"salon_id": salon_id, "is_active": True}).to_list(20)
    svc_by_name = {s["service_name"]: s for s in enabled_svcs}

    def _svc(name):
        s = svc_by_name.get(name)
        if not s: return None
        return {
            "service_id": s["id"],
            "service_name": s["service_name"],
            "price": s.get("base_price", 0),
            "duration": s.get("default_duration", 30),
        }

    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    # Also compute IST date because the dashboard filters "today" in IST
    from datetime import timedelta
    ist_now = datetime.now(timezone.utc) + timedelta(hours=5, minutes=30)
    today_ist = ist_now.strftime("%Y-%m-%d")

    # Only seed bookings if there are no tokens today (idempotent)
    already = await db.tokens.count_documents({"salon_id": salon_id, "booking_date": today_ist})
    # Find main branch id so tokens get associated correctly (fixes branch-filtered queries)
    main_branch = await db.salon_branches.find_one({"salon_id": salon_id})
    main_branch_id = main_branch.get("id") if main_branch else None

    if already > 0:
        print(f"[SEED] {already} token(s) already for today ({today_ist}) — skipping booking seed")
    else:
        b1 = barbers[0]
        b2 = barbers[1] if len(barbers) > 1 else barbers[0]
        bookings = [
            {
                "id": str(uuid.uuid4()),
                "salon_id": salon_id,
                "customer_name": "Rohit Sharma",
                "customer_phone": "+919812345601",
                "phone": "+919812345601",
                "gender": "Male",
                "barber_id": b1["id"],
                "barber_name": b1["name"],
                "services": [_svc("Men's Haircut"), _svc("Beard Trim")],
                "selected_services": [_svc("Men's Haircut")["service_id"], _svc("Beard Trim")["service_id"]],
                "total_amount": 450,
                "status": "waiting",
                "token_number": "M1",
                "shift": "Morning",
                "date": today_ist, "booking_date": today_ist,
                "created_at": now,
                "payment_mode": "cash",
                "channel": "manual",
                "source": "manual",
                "booking_type": "instant",
                "branch_id": main_branch_id,
            },
            {
                "id": str(uuid.uuid4()),
                "salon_id": salon_id,
                "customer_name": "Priya Verma",
                "customer_phone": "+919812345602",
                "phone": "+919812345602",
                "gender": "Female",
                "barber_id": b2["id"],
                "barber_name": b2["name"],
                "services": [_svc("Women's Haircut"), _svc("Fruit Facial")],
                "selected_services": [_svc("Women's Haircut")["service_id"], _svc("Fruit Facial")["service_id"]],
                "total_amount": 1300,
                "status": "in_progress",
                "token_number": "N1",
                "shift": "Noon",
                "date": today_ist, "booking_date": today_ist,
                "created_at": now,
                "payment_mode": "upi",
                "channel": "manual",
                "source": "manual",
                "booking_type": "instant",
                "branch_id": main_branch_id,
            },
            {
                "id": str(uuid.uuid4()),
                "salon_id": salon_id,
                "customer_name": "Amit Kumar",
                "customer_phone": "+919812345603",
                "phone": "+919812345603",
                "gender": "Male",
                "barber_id": b1["id"],
                "barber_name": b1["name"],
                "services": [_svc("Men's Haircut")],
                "selected_services": [_svc("Men's Haircut")["service_id"]],
                "total_amount": 300,
                "status": "completed",
                "token_number": "M2",
                "shift": "Morning",
                "date": today_ist, "booking_date": today_ist,
                "created_at": now,
                "completed_at": now,
                "payment_mode": "cash",
                "channel": "manual",
                "source": "manual",
                "booking_type": "instant",
                "branch_id": main_branch_id,
            },
        ]
        # Strip None services (in case not seeded)
        for b in bookings:
            b["services"] = [s for s in b["services"] if s]
        await db.tokens.insert_many(bookings)
        print(f"[SEED] Inserted {len(bookings)} test bookings for today ({today})")

        # Also register these as customers so global search + Guests tab find them
        for bk in bookings:
            phone = bk.get("phone")
            if not phone:
                continue
            await db.customers.update_one(
                {"phone": phone},
                {"$set": {
                    "phone": phone,
                    "name": bk.get("customer_name"),
                    "gender": bk.get("gender"),
                    "last_booking_salon_id": salon_id,
                    "salon_id": salon_id,
                    "updated_at": now,
                }, "$setOnInsert": {"id": str(uuid.uuid4()), "created_at": now}},
                upsert=True,
            )

    # ------------------------------------------------------------------
    # 5) Sample notifications (idempotent — skip if any already exist)
    # ------------------------------------------------------------------
    notif_count = await db.notifications.count_documents({
        "user_type": "salon", "user_id": salon_id,
    })
    if notif_count == 0:
        sample_notifs = [
            {
                "id": str(uuid.uuid4()),
                "user_type": "salon",
                "user_id": salon_id,
                "salon_id": salon_id,
                "type": "new_booking",
                "title": "New booking · M1",
                "message": "Rohit Sharma booked 2 services with Imran (Men's Haircut + Beard Trim).",
                "data": {"token_number": "M1", "customer": "Rohit Sharma", "barber": "Imran", "amount": 450},
                "is_read": False,
                "created_at": now,
            },
            {
                "id": str(uuid.uuid4()),
                "user_type": "salon",
                "user_id": salon_id,
                "salon_id": salon_id,
                "type": "booking_completed",
                "title": "Booking completed · M2",
                "message": "Amit Kumar's Men's Haircut finished. ₹300 collected in cash.",
                "data": {"token_number": "M2", "customer": "Amit Kumar", "amount": 300, "payment_mode": "cash"},
                "is_read": False,
                "created_at": now,
            },
            {
                "id": str(uuid.uuid4()),
                "user_type": "salon",
                "user_id": salon_id,
                "salon_id": salon_id,
                "type": "review_added",
                "title": "New 5\u2605 review",
                "message": "\"Great haircut, will come back!\" — Priya V.",
                "data": {"customer": "Priya Verma", "stars": 5},
                "is_read": True,
                "created_at": now,
            },
        ]
        await db.notifications.insert_many(sample_notifs)
        print(f"[SEED] Inserted {len(sample_notifs)} sample notifications")

    print("[SEED] Done")


if __name__ == "__main__":
    asyncio.run(main())
