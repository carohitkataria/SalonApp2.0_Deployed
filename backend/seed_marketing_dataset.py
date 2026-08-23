"""
Seed marketing test data for manual testing.

- Inserts rich `users` + `tokens` so audience segments evaluate meaningfully.
- Creates segments / coupons / templates / automations / campaigns / settings
  via the REAL marketing API (admin auth) so it matches production schemas.

Idempotent: seed-created marketing docs are tagged with `_seed: true` and
cleared on each run. Users/tokens are upserted by a deterministic id.

Run:  cd /app/backend && python seed_marketing_dataset.py
"""
import os
import sys
import uuid
from datetime import datetime, timezone, timedelta

import requests
from pymongo import MongoClient

MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "salonapp")
BASE = os.environ.get("SEED_API_BASE", "http://localhost:8001/api")
SALON_ID = os.environ.get("SEED_SALON_ID", "786384d2-e999-4cce-b271-157bac5c5ce5")
ADMIN_ID = os.environ.get("SEED_ADMIN_ID", "admin")
ADMIN_PW = os.environ.get("SEED_ADMIN_PW", "salon123")

client = MongoClient(MONGO_URL)
db = client[DB_NAME]

now = datetime.now(timezone.utc)
this_month = now.month


def iso(dt):
    return dt.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


# ---------------------------------------------------------------- customers
# Fields used by marketing segment engine: phone, name, dob, gender,
# wedding_anniversary, spouse_date_of_birth. Phones stored as +91XXXXXXXXXX.
def mm(m):
    return f"{m:02d}"

CUSTOMERS = [
    # phone(10),      name,           dob,           gender, wed_anniv,      spouse_dob,     spend_profile
    ("9810000001", "Priya Sharma",   "1994-%s-12" % mm(this_month), "Female", "2019-%s-05" % mm(this_month), "1992-03-20", "high_recent"),
    ("9810000002", "Rahul Verma",    "1988-05-18", "Male",   "2015-11-02", "1990-%s-08" % mm(this_month), "high_recent"),
    ("9810000003", "Sana Kapoor",    "1996-%s-25" % mm(this_month), "Female", "2021-06-14", "1995-09-01", "mid_recent"),
    ("9810000004", "Amit Singh",     "1979-02-09", "Male",   "2008-%s-19" % mm(this_month), "1981-12-11", "high_lapsed"),
    ("9810000005", "Neha Gupta",     "2000-08-30", "Female", None,          None,           "low_recent"),
    ("9810000006", "Vikram Rao",     "1985-12-01", "Male",   "2012-04-22", "1987-07-07", "mid_lapsed"),
    ("9810000007", "Anjali Mehta",   "1998-%s-03" % mm(this_month), "Female", None,          "1997-02-14", "low_lapsed"),
    ("9810000008", "Karan Malhotra", "1975-07-27", "Male",   "2000-10-10", None,           "high_recent"),
    ("9810000009", "Divya Nair",     "1992-03-15", "Female", "2018-%s-01" % mm(this_month), "1991-11-30", "mid_recent"),
    ("9810000010", "Rohan Das",      "2001-06-06", "Male",   None,          None,           "new_norecent"),
    ("9810000011", "Meera Iyer",     "1990-09-19", "Female", "2016-01-25", "1989-04-04", "high_recent"),
    ("9810000012", "Sameer Khan",    "1983-11-11", "Male",   "2010-%s-15" % mm(this_month), "1985-08-08", "mid_lapsed"),
]

SPEND = {
    "high_recent":  (5,  1200, 3),    # (visits, amount_each, days_ago_last)
    "mid_recent":   (3,  650,  10),
    "low_recent":   (2,  300,  15),
    "high_lapsed":  (6,  1400, 75),
    "mid_lapsed":   (4,  700,  90),
    "low_lapsed":   (1,  250,  120),
    "new_norecent": (0,  0,    None),
}


def seed_customers_and_tokens():
    users = db["users"]
    tokens = db["tokens"]
    # wipe previously seeded tokens for these phones (this salon only)
    phones = [f"+91{c[0]}" for c in CUSTOMERS]
    tokens.delete_many({"salon_id": SALON_ID, "user_phone": {"$in": phones}, "_seed": True})
    n_users = 0
    n_tokens = 0
    for phone10, name, dob, gender, wed, spouse_dob, profile in CUSTOMERS:
        phone = f"+91{phone10}"
        users.update_one(
            {"phone": phone},
            {"$set": {
                "phone": phone,
                "name": name,
                "dob": dob,
                "gender": gender,
                "wedding_anniversary": wed,
                "spouse_date_of_birth": spouse_dob,
                "_seed": True,
            }, "$setOnInsert": {"id": str(uuid.uuid4()), "created_at": iso(now)}},
            upsert=True,
        )
        n_users += 1
        visits, amt, last_days = SPEND[profile]
        for i in range(visits):
            days_ago = (last_days if last_days is not None else 0) + i * 20
            created = now - timedelta(days=days_ago)
            tokens.insert_one({
                "id": str(uuid.uuid4()),
                "salon_id": SALON_ID,
                "user_phone": phone,
                "customer_phone": phone,
                "customer_name": name,
                "amount": amt,
                "final_amount": amt,
                "status": "completed",
                "created_at": iso(created),
                "_seed": True,
            })
            n_tokens += 1
    print(f"[seed_mkt] users upserted={n_users}, tokens inserted={n_tokens}")


# ---------------------------------------------------------------- API helpers
def login():
    r = requests.post(f"{BASE}/salon/users/login", json={"identifier": ADMIN_ID, "password": ADMIN_PW}, timeout=30)
    r.raise_for_status()
    return r.json()["access_token"]


def clear_seed_marketing():
    for col in ["marketing_segments", "marketing_campaigns", "marketing_automations", "marketing_templates", "coupons"]:
        res = db[col].delete_many({"salon_id": SALON_ID, "_seed": True})
        if res.deleted_count:
            print(f"[seed_mkt] cleared {res.deleted_count} seed docs from {col}")


def tag_seed(col, doc_id):
    db[col].update_one({"id": doc_id, "salon_id": SALON_ID}, {"$set": {"_seed": True}})


def seed_via_api(token):
    H = {"Authorization": f"Bearer {token}"}
    S = f"{BASE}/salons/{SALON_ID}"

    def post(path, body, col=None):
        r = requests.post(f"{S}{path}", json=body, headers=H, timeout=30)
        if r.status_code >= 300:
            print(f"  ! POST {path} -> {r.status_code} {r.text[:160]}")
            return None
        data = r.json()
        if col and data.get("id"):
            tag_seed(col, data["id"])
        return data

    # ---- Segments
    segs = [
        {"name": "Lapsed 60+ days", "description": "Guests who haven't visited in 60+ days",
         "rules": {"logic": "AND", "conditions": [{"field": "last_visit_min_days", "op": "gte", "value": 60}]}},
        {"name": "Birthdays this month", "description": "Celebrate this month's birthdays",
         "rules": {"logic": "AND", "conditions": [{"field": "birthday_month", "op": "eq", "value": this_month}]}},
        {"name": "High spenders \u20b95k+", "description": "Lifetime spend >= 5000",
         "rules": {"logic": "AND", "conditions": [{"field": "total_spend_min", "op": "gte", "value": 5000}]}},
        {"name": "Members with wallet", "description": "Active membership holders",
         "rules": {"logic": "AND", "conditions": [{"field": "has_wallet", "op": "eq", "value": True}]}},
        {"name": "Women, recent", "description": "Female guests seen in last 30 days",
         "rules": {"logic": "AND", "conditions": [
             {"field": "gender", "op": "eq", "value": "Female"},
             {"field": "last_visit_max_days", "op": "lte", "value": 30}]}},
    ]
    seg_ids = {}
    for s in segs:
        d = post("/marketing/segments", s, "marketing_segments")
        if d:
            seg_ids[s["name"]] = d["id"]
            # preview count for logging
            pr = requests.post(f"{S}/marketing/segments/preview", json=s, headers=H, timeout=30)
            cnt = pr.json().get("count") if pr.status_code < 300 else "?"
            print(f"  segment '{s['name']}' -> {cnt} guests")

    # ---- Coupons
    coupons = [
        {"code": "GLOW20", "title": "Monsoon Glow 20% off", "description": "Flat 20% off all services",
         "type": "percent", "value": 20, "min_bill_amount": 500, "max_discount_amount": 400,
         "per_customer_limit": 1, "valid_to": iso(now + timedelta(days=30)), "visibility": "published",
         "is_active": True, "show_to_customer": True, "show_on_invoice": True},
        {"code": "WELCOME150", "title": "Welcome \u20b9150 off", "description": "New guest flat discount",
         "type": "flat", "value": 150, "min_bill_amount": 600, "per_customer_limit": 1,
         "valid_to": iso(now + timedelta(days=60)), "visibility": "published", "is_active": True,
         "show_to_customer": True},
        {"code": "WINBACK25", "title": "We miss you \u2014 25% off", "description": "Win-back lapsed guests",
         "type": "percent", "value": 25, "min_bill_amount": 400, "max_discount_amount": 500,
         "per_customer_limit": 2, "valid_to": iso(now + timedelta(days=45)), "visibility": "private",
         "is_active": True},
    ]
    coupon_ids = {}
    for c in coupons:
        d = post("/coupons", c, "coupons")
        if d:
            coupon_ids[c["code"]] = d["id"]
            print(f"  coupon {c['code']} created")

    # ---- Templates (drafts)
    templates = [
        {"name": "birthday_treat", "friendly_name": "Birthday treat", "category": "marketing", "lang_code": "en",
         "body": "Hi {{1}}, happy birthday from {{2}}! Enjoy {{3}} on us this month.",
         "example_values": {"1": "Priya", "2": "The Looks", "3": "20% off"},
         "variables_meta": {"1": "customer_name", "2": "salon_name", "3": "coupon_code"}},
        {"name": "winback_nudge", "friendly_name": "Win-back nudge", "category": "marketing", "lang_code": "en",
         "body": "Hi {{1}}, we miss you at {{2}}! Here's {{3}} on your next visit.",
         "example_values": {"1": "Rahul", "2": "The Looks", "3": "25% off"},
         "variables_meta": {"1": "customer_name", "2": "salon_name", "3": "coupon_code"}},
        {"name": "appt_reminder", "friendly_name": "Appointment reminder", "category": "utility", "lang_code": "en",
         "body": "Hi {{1}}, reminder for your appointment at {{2}} on {{3}}.",
         "example_values": {"1": "Sana", "2": "The Looks", "3": "14 Aug 5:30 PM"},
         "variables_meta": {"1": "customer_name", "2": "salon_name", "3": "appointment_date"}},
    ]
    for t in templates:
        d = post("/marketing/templates/draft", t, "marketing_templates")
        if d:
            print(f"  template {t['name']} draft created")

    # ---- Automations
    automations = [
        {"type": "birthday", "active": True,
         "template_body": "Hi {{1}}, happy birthday! Enjoy a special treat from us \ud83c\udf89",
         "coupon_id": coupon_ids.get("GLOW20")},
        {"type": "win_back", "active": True, "threshold_days": 60,
         "template_body": "Hi {{1}}, we miss you! Come back for 25% off.",
         "coupon_id": coupon_ids.get("WINBACK25")},
        {"type": "reminder", "active": False, "offset_days": 1,
         "template_body": "Hi {{1}}, reminder for your appointment tomorrow."},
    ]
    for a in automations:
        d = post("/marketing/automations", a, "marketing_automations")
        if d:
            print(f"  automation {a['type']} created")

    # ---- Campaigns (draft)
    campaigns = [
        {"name": "Monsoon Glow blast", "segment_id": seg_ids.get("High spenders \u20b95k+"),
         "template_body": "Hi {{name}}, monsoon glow is here \u2014 20% off with GLOW20!",
         "coupon_id": coupon_ids.get("GLOW20")},
        {"name": "Win-back lapsed guests", "segment_id": seg_ids.get("Lapsed 60+ days"),
         "template_body": "Hi {{name}}, we miss you! 25% off your next visit.",
         "coupon_id": coupon_ids.get("WINBACK25")},
    ]
    for c in campaigns:
        d = post("/marketing/campaigns", c, "marketing_campaigns")
        if d:
            print(f"  campaign '{c['name']}' created (draft)")

    # ---- Marketing settings (guardrails)
    r = requests.put(f"{S}/marketing/settings", json={
        "monthly_cap_inr": 5000, "freq_cap_per_customer_per_week": 3,
        "quiet_hours_start": "22:00", "quiet_hours_end": "09:00",
        "spend_brake": False, "consent_required": True,
    }, headers=H, timeout=30)
    print(f"  marketing settings -> {r.status_code}")


def main():
    print(f"[seed_mkt] salon={SALON_ID} db={DB_NAME} base={BASE}")
    seed_customers_and_tokens()
    try:
        token = login()
    except Exception as e:
        print(f"[seed_mkt] LOGIN FAILED: {e}", file=sys.stderr)
        sys.exit(1)
    clear_seed_marketing()
    seed_via_api(token)
    print("[seed_mkt] \u2705 Done.")


if __name__ == "__main__":
    main()
