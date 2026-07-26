"""
Seed demo Marketing + Guests data for the redesigned V2 pages.
Creates customers, segments, coupons, campaigns, automations and templates
for whichever salon exists in DB (first one). Safe to run multiple times —
uses upsert-like logic (skip if code/name already exists).
"""
import asyncio
import os
import sys
import uuid
from datetime import datetime, timezone, timedelta
from motor.motor_asyncio import AsyncIOMotorClient


def iso(dt):
    return dt.astimezone(timezone.utc).isoformat()


def now_iso():
    return iso(datetime.now(timezone.utc))


DEMO_CUSTOMERS = [
    ("Priya Sharma",    "+919876543210", "Women", 5, 4800,  520,  "Gold",   30,  "2025-05-14"),  # VIP + member
    ("Rahul Verma",     "+919876500001", "Men",   3, 2100,  0,    None,     45,  "2001-11-02"),
    ("Sana Kapoor",     "+919876500002", "Women", 1,  650,  0,    None,     15,  "1997-07-18"),  # new
    ("Neha Gupta",      "+919876500003", "Women", 12, 15600, 1200,"Platinum",7,  "1992-07-25"),  # VIP + member
    ("Arjun Malhotra",  "+919876500004", "Men",   2, 1200,  0,    None,     20,  "1990-03-11"),
    ("Kavya Menon",     "+919876500005", "Women", 8,  7200,  0,    "Silver", 90,  "1998-12-04"),  # lapsed member
    ("Vikram Rao",      "+919876500006", "Men",   4, 3200,  400,  None,     35,  "1985-09-30"),
    ("Meera Iyer",      "+919876500007", "Women", 6, 5100,  0,    "Gold",   50,  "1994-07-08"),
    ("Aditya Singh",    "+919876500008", "Men",   1,  550,  0,    None,     10,  "2000-01-22"),  # new
    ("Ishita Bansal",   "+919876500009", "Women", 22, 22400, 800, "Platinum", 4, "1988-07-14"),  # VIP + member + bday
    ("Rohan Nair",      "+919876500010", "Men",   3, 2400,  0,    None,     70,  "1993-04-19"),  # lapsed
    ("Ananya Deshmukh", "+919876500011", "Women", 15, 12200, 350, "Gold",   14,  "1996-07-05"),  # bday
]

DEMO_SEGMENTS = [
    ("Birthday · this month", "Guests with birthdays this month", {"logic":"AND","conditions":[{"field":"birthday_month","op":"eq","value":datetime.now().month}]}),
    ("Lapsed · 60+ days",     "Have not visited in 60 days",     {"logic":"AND","conditions":[{"field":"days_since_last_visit","op":"gte","value":60}]}),
    ("High spenders · ₹5k+",  "Lifetime spend above ₹5,000",     {"logic":"AND","conditions":[{"field":"total_spend","op":"gte","value":5000}]}),
    ("New guests · 30d",      "First-time in last 30 days",      {"logic":"AND","conditions":[{"field":"days_since_first_visit","op":"lte","value":30},{"field":"visit_count","op":"lte","value":2}]}),
    ("Members active",        "Any active membership",            {"logic":"AND","conditions":[{"field":"has_active_membership","op":"eq","value":True}]}),
    ("Regulars · 6+ visits",  "6 or more lifetime visits",        {"logic":"AND","conditions":[{"field":"visit_count","op":"gte","value":6}]}),
]

DEMO_COUPONS = [
    ("GLOW20",    "Monsoon Glow",       "percent", 20, 500,  "Save 20% on any service",         30),
    ("FIRST15",   "Welcome offer",      "percent", 15, 300,  "First-visit welcome — save 15%",  60),
    ("WKND299",   "Weekend flat ₹299",  "flat",   299,1200,  "Flat ₹299 off weekend bills",     14),
    ("SPA500",    "Spa special",        "flat",   500,2000,  "₹500 off any spa package",        45),
]

DEMO_TEMPLATES = [
    ("Booking confirmation",  "utility",    "Hi {{1}}, your booking at {{2}} for {{3}} on {{4}} is confirmed. See you then!",     ["1","2","3","4"], "approved"),
    ("Appointment reminder",  "utility",    "Hi {{1}}, reminder — your {{2}} appointment is tomorrow at {{3}}. Reply STOP to opt out.", ["1","2","3"], "approved"),
    ("Monsoon Glow offer",    "marketing",  "Hi {{1}}, monsoon skin needs love ✨. Get 20% off any spa this week — code GLOW20. Book: {{2}}", ["1","2"], "pending"),
    ("Birthday wish",         "marketing",  "Happy birthday {{1}}! 🎉 Enjoy a complimentary head massage on your next visit. Cheers, The Looks.", ["1"], "approved"),
    ("Win-back",              "marketing",  "Hey {{1}}, we've missed you at {{2}}. Come back this week for 15% off — code WELCOME15.",  ["1","2"], "draft"),
]

DEMO_AUTOMATIONS = [
    ("Appointment reminder · 24h",  "appointment_reminder", True,  "WhatsApp reminder sent 24 hours before every appointment"),
    ("Birthday wish + treat",        "birthday",             True,  "Birthday morning wish + free head massage coupon"),
    ("Win-back lapsed · 60d",        "winback_lapsed",       True,  "60-day lapsed guests get a WELCOME15 nudge"),
    ("Review request",               "review_request",       False, "Post-checkout Google review request (paused)"),
    ("Rebooking nudge",              "rebooking",            True,  "Service-cycle rebooking nudge (30d/45d/60d)"),
]

DEMO_CAMPAIGNS = [
    ("Monsoon Glow · WA",  "whatsapp", "running",   "High spenders · ₹5k+", 340, 320, 88, 22, 24800, 22),
    ("Membership renewal", "whatsapp", "scheduled", "Members active",       0,   0,   0,  0,  0,     0),
    ("Weekend flat ₹299",  "sms",      "completed", "Regulars · 6+ visits", 480, 462, 51, 34, 17600, 34),
    ("Birthday July",      "whatsapp", "running",   "Birthday · this month",120, 118, 45, 12, 9600,  12),
]


async def main():
    client = AsyncIOMotorClient(os.environ.get('MONGO_URL','mongodb://localhost:27017'))
    db = client[os.environ.get('DB_NAME','test_database')]
    salon = await db.salons.find_one({}, {'id': 1, 'phone': 1, 'name': 1})
    if not salon:
        print("No salon in DB — seed platform_owner first.")
        return
    sid = salon['id']
    print(f"Seeding for salon {sid}")

    # ---- Customers ----
    now = datetime.now(timezone.utc)
    for name, phone, gender, visits, spend, wallet, mem, days_since, bday in DEMO_CUSTOMERS:
        last_visit = iso(now - timedelta(days=days_since))
        first_visit = iso(now - timedelta(days=days_since + (visits-1)*20))
        doc = {
            "id": str(uuid.uuid4()),
            "salon_id": sid,
            "name": name,
            "phone": phone,
            "gender": gender,
            "date_of_birth": bday,
            "visit_count": visits,
            "total_spend": spend,
            "wallet_balance": wallet,
            "membership_name": mem,
            "last_visit": last_visit,
            "first_visit": first_visit,
            "created_at": first_visit,
            "source": "demo_seed",
            "consent_whatsapp": True,
        }
        res = await db.salon_customers.update_one(
            {"salon_id": sid, "phone": phone},
            {"$setOnInsert": doc},
            upsert=True,
        )
        print(f"  customer: {name:22s} {phone}")

    # ---- Segments ----
    for name, desc, rules in DEMO_SEGMENTS:
        doc = {
            "id": str(uuid.uuid4()),
            "salon_id": sid,
            "name": name,
            "description": desc,
            "rules": rules,
            "created_at": now_iso(),
        }
        await db.marketing_segments.update_one({"salon_id": sid, "name": name},{"$setOnInsert": doc}, upsert=True)
        print(f"  segment:  {name}")

    # ---- Coupons ----
    for code, title, ctype, val, minbill, desc, exp_days in DEMO_COUPONS:
        valid_to = iso(now + timedelta(days=exp_days))
        doc = {
            "id": str(uuid.uuid4()),
            "salon_id": sid,
            "code": code,
            "title": title,
            "description": desc,
            "type": ctype,
            "value": float(val),
            "min_bill_amount": float(minbill),
            "per_customer_limit": 1,
            "stackable": False,
            "valid_to": valid_to,
            "visibility": "published",
            "is_active": True,
            "uses_count": 0,
            "created_at": now_iso(),
        }
        await db.salon_coupons.update_one({"salon_id": sid, "code": code},{"$setOnInsert": doc}, upsert=True)
        print(f"  coupon:   {code}")

    # ---- Templates ----
    for name, cat, body, vars_, status in DEMO_TEMPLATES:
        doc = {
            "id": str(uuid.uuid4()),
            "salon_id": sid,
            "name": name,
            "category": cat,
            "body": body,
            "variables": vars_,
            "lang_code": "en_US",
            "channel": "whatsapp",
            "meta_status": status,
            "provider": "twilio",
            "sample_values": ["Priya","The Looks","Haircut","tomorrow 4pm"][:len(vars_)],
            "created_at": now_iso(),
        }
        await db.marketing_templates.update_one({"salon_id": sid, "name": name},{"$setOnInsert": doc}, upsert=True)
        print(f"  template: {name}")

    # ---- Automations ----
    for name, trig, active, desc in DEMO_AUTOMATIONS:
        doc = {
            "id": str(uuid.uuid4()),
            "salon_id": sid,
            "name": name,
            "trigger": trig,
            "channel": "whatsapp",
            "description": desc,
            "active": active,
            "created_at": now_iso(),
        }
        await db.marketing_automations.update_one({"salon_id": sid, "name": name},{"$setOnInsert": doc}, upsert=True)
        print(f"  automation:{name}")

    # ---- Campaigns ----
    for cname, prov, status, seg_name, sent, deliv, read_c, red, rev, redeemed in DEMO_CAMPAIGNS:
        seg = await db.marketing_segments.find_one({"salon_id": sid, "name": seg_name}, {"id":1, "name":1})
        doc = {
            "id": str(uuid.uuid4()),
            "salon_id": sid,
            "name": cname,
            "provider": prov,
            "status": status,
            "segment_id": seg["id"] if seg else None,
            "segment_name": seg["name"] if seg else seg_name,
            "stats": {"sent": sent, "delivered": deliv, "read": read_c, "redeemed": red, "revenue": rev},
            "spend_inr": sent * 1.5,
            "created_at": now_iso(),
        }
        await db.marketing_campaigns.update_one({"salon_id": sid, "name": cname},{"$setOnInsert": doc}, upsert=True)
        print(f"  campaign: {cname:24s} {status}")

    # ---- Ensure a marketing_settings doc ----
    await db.marketing_settings.update_one(
        {"salon_id": sid},
        {"$setOnInsert": {
            "salon_id": sid,
            "default_provider": "twilio",
            "opt_in_required": True,
            "quiet_hours": "22:00 – 08:00 IST",
            "dlt_sender_id": "THLOOKS",
            "email_sender": "hello@thelooks.in",
            "created_at": now_iso(),
        }},
        upsert=True,
    )

    print("\n✓ Demo marketing + guest data seeded.")
    print("  Login credentials (already in test_credentials.md):")
    print("  identifier: demo   password: demo1234   phone: +917503070727")


if __name__ == "__main__":
    asyncio.run(main())
