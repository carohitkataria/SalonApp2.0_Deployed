"""
seed_demo_dataset.py — Comprehensive demo-data seed for the salon workspace.
============================================================================

Purpose
-------
Populates the local Mongo with a realistic, hand-crafted demo dataset for the
"admin" salon so every feature has data to render / test against:

  • 10 services (Services + Packages, Men/Women/Unisex)
  • 5 barbers with varied experience & incentive tiers
  • 10 tokens/bookings (past + today, various statuses & payment modes)
  •  Attendance sessions covering self check-in, admin-on-behalf, checked-out
  • Salary + incentive records for last month
  • 10 inventory items (3 assigned: 2 to specific barbers, 1 common bulk)
  • 10 shop products (sellable inventory rows the customer shop can list)
  •  2 customer product orders (one placed, one delivered)
  • Loyalty program (flat 3% on every ₹500 spend, 12-month period)
  • 2 membership plans + 2 customer memberships + wallets
  • 1 booking paid from wallet (wallet debit)

DEPLOYMENT SAFETY
-----------------
This file is EXCLUDED from production runs. It only runs when the caller
opts-in via BOTH:

  * env var  SEED_DEMO_DATASET=1              (must be explicitly set)
  * host env is NOT "production"              (ENVIRONMENT != "production")

If either check fails, the script exits with a friendly message and does
NOTHING. This means:

  - Deploys can safely ship this file — nothing runs automatically.
  - Devs on GitHub can just:   SEED_DEMO_DATASET=1 python seed_demo_dataset.py

The file is intentionally idempotent — safe to re-run; existing rows are
updated in-place, no duplicates are inserted.
"""
from __future__ import annotations

import asyncio
import os
import sys
import uuid
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Any, Dict, List, Optional

from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

# ---------------------------------------------------------------------------
# 1. Deployment guard — refuse to run unless explicitly opted-in on non-prod
# ---------------------------------------------------------------------------
load_dotenv(Path(__file__).parent / ".env")

_OPT_IN = os.environ.get("SEED_DEMO_DATASET", "").strip() == "1"
_ENVIRON = (os.environ.get("ENVIRONMENT") or "development").lower()
_IS_PROD = _ENVIRON in ("production", "prod", "live")

if not _OPT_IN:
    print(
        "[seed_demo_dataset] Skipped — set SEED_DEMO_DATASET=1 to opt-in. "
        "This safeguard prevents accidental prod seeding."
    )
    sys.exit(0)

if _IS_PROD:
    print(
        f"[seed_demo_dataset] Refusing to run in ENVIRONMENT={_ENVIRON!r}. "
        "Demo dataset is dev/staging only."
    )
    sys.exit(0)

# ---------------------------------------------------------------------------
# 2. Mongo connection
# ---------------------------------------------------------------------------
MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]

# ---------------------------------------------------------------------------
# 3. Helpers
# ---------------------------------------------------------------------------
_NOW = datetime.now(timezone.utc)
NOW_ISO = _NOW.isoformat()
IST_OFFSET = timedelta(hours=5, minutes=30)


def ist_date(offset_days: int = 0) -> str:
    return (_NOW + IST_OFFSET + timedelta(days=offset_days)).strftime("%Y-%m-%d")


def iso(offset_seconds: int = 0) -> str:
    return (_NOW + timedelta(seconds=offset_seconds)).isoformat()


# ---------------------------------------------------------------------------
# 4. Static demo data (deterministic — safe to re-seed)
# ---------------------------------------------------------------------------
SERVICES: List[Dict[str, Any]] = [
    # Services × 8
    {"category": "Services", "sub": "Haircut & Styling", "name": "Men's Haircut", "price": 300, "gender": "Men", "duration": 30, "price_type": "fixed"},
    {"category": "Services", "sub": "Haircut & Styling", "name": "Women's Haircut", "price": 600, "gender": "Women", "duration": 45, "price_type": "fixed"},
    {"category": "Services", "sub": "Haircut & Styling", "name": "Beard Trim", "price": 150, "gender": "Men", "duration": 15, "price_type": "fixed"},
    {"category": "Services", "sub": "Hair Colour", "name": "Global Hair Colour", "price": 1800, "gender": "Unisex", "duration": 90, "price_type": "onwards"},
    {"category": "Services", "sub": "Hair Colour", "name": "Root Touch-up", "price": 900, "gender": "Unisex", "duration": 45, "price_type": "fixed"},
    {"category": "Services", "sub": "Facials & Cleanup", "name": "Fruit Facial", "price": 800, "gender": "Unisex", "duration": 45, "price_type": "fixed"},
    {"category": "Services", "sub": "Facials & Cleanup", "name": "Gold Facial", "price": 1500, "gender": "Women", "duration": 60, "price_type": "fixed"},
    {"category": "Services", "sub": "Threading & Wax", "name": "Eyebrow Threading", "price": 80, "gender": "Women", "duration": 10, "price_type": "fixed"},
    # Packages × 2
    {"category": "Packages", "sub": "Grooming Combos", "name": "Men's Grooming Combo", "price": 999, "gender": "Men", "duration": 75, "price_type": "fixed"},
    {"category": "Packages", "sub": "Bridal", "name": "Bridal Package", "price": 8999, "gender": "Women", "duration": 240, "price_type": "onwards"},
]

BARBERS: List[Dict[str, Any]] = [
    {"name": "Imran",  "specialty": "master",  "exp": 8, "phone": "+919876543211", "base_salary": 25000, "commission_pct": 15, "incentive_pct": 5},
    {"name": "Abdul",  "specialty": "master",  "exp": 6, "phone": "+919876543212", "base_salary": 22000, "commission_pct": 12, "incentive_pct": 4},
    {"name": "Rahul",  "specialty": "senior",  "exp": 4, "phone": "+919876543213", "base_salary": 18000, "commission_pct": 10, "incentive_pct": 3},
    {"name": "Kabir",  "specialty": "senior",  "exp": 3, "phone": "+919876543214", "base_salary": 16000, "commission_pct": 10, "incentive_pct": 3},
    {"name": "Anita",  "specialty": "senior",  "exp": 5, "phone": "+919876543215", "base_salary": 20000, "commission_pct": 12, "incentive_pct": 4},
]

CUSTOMERS: List[Dict[str, Any]] = [
    {"name": "Rohit Sharma",  "phone": "+919812345601", "gender": "Male"},
    {"name": "Priya Verma",   "phone": "+919812345602", "gender": "Female"},
    {"name": "Amit Kumar",    "phone": "+919812345603", "gender": "Male"},
    {"name": "Neha Singh",    "phone": "+919812345604", "gender": "Female"},
    {"name": "Vikas Mehta",   "phone": "+919812345605", "gender": "Male"},
    {"name": "Sneha Iyer",    "phone": "+919812345606", "gender": "Female"},
    {"name": "Rahul Bansal",  "phone": "+919812345607", "gender": "Male"},
    {"name": "Kavya Nair",    "phone": "+919812345608", "gender": "Female"},
    {"name": "Aditya Rao",    "phone": "+919812345609", "gender": "Male"},
    {"name": "Isha Patel",    "phone": "+919812345610", "gender": "Female"},
]

INVENTORY: List[Dict[str, Any]] = [
    # 3 items are "assigned" (assigned_to_staff_id set OR internal-only common bulk).
    # First 2: staff-specific. #3: common (assigned to salon at large / internal_only).
    # Rest 7: sellable-both.
    {"name": "L'Oréal Shampoo 400ml",        "brand": "L'Oréal",   "category": "Shampoo",     "mrp": 550, "cost": 280, "sell": 495, "gst": 18, "qty": 12, "availability": "both",         "assigned_to": "barber:1", "unit": "bottle", "pack_size": "400ml", "sku": "LO-SH-400", "low_stock": 3},
    {"name": "Wella Hair Colour Kit",        "brand": "Wella",     "category": "Hair Colour", "mrp": 720, "cost": 380, "sell": 650, "gst": 18, "qty": 8,  "availability": "both",         "assigned_to": "barber:2", "unit": "kit",    "pack_size": "1kit",  "sku": "WL-CLR-01", "low_stock": 2},
    {"name": "Barber Cape (Common)",         "brand": "Salon-Pro", "category": "Tools",       "mrp": 500, "cost": 250, "sell": 0,   "gst": 5,  "qty": 6,  "availability": "internal_only","assigned_to": "common",   "unit": "piece",  "pack_size": "1",     "sku": "SP-CAPE-01","low_stock": 2},
    {"name": "Mac Makeup Foundation",        "brand": "MAC",       "category": "Makeup",      "mrp": 2500,"cost": 1200,"sell": 2200,"gst": 18, "qty": 5,  "availability": "both",         "assigned_to": None,       "unit": "bottle", "pack_size": "30ml",  "sku": "MAC-FDN-30","low_stock": 2},
    {"name": "Kerastase Hair Serum",         "brand": "Kerastase", "category": "Hair Care",   "mrp": 1800,"cost": 850, "sell": 1550,"gst": 18, "qty": 10, "availability": "sale_only",    "assigned_to": None,       "unit": "bottle", "pack_size": "100ml", "sku": "KR-SR-100", "low_stock": 3},
    {"name": "Nivea Body Lotion",            "brand": "Nivea",     "category": "Body Care",   "mrp": 350, "cost": 175, "sell": 320, "gst": 18, "qty": 20, "availability": "both",         "assigned_to": None,       "unit": "bottle", "pack_size": "400ml", "sku": "NV-BL-400", "low_stock": 5},
    {"name": "Schwarzkopf Bleach",           "brand": "Schwarzkopf","category":"Hair Colour", "mrp": 480, "cost": 240, "sell": 430, "gst": 18, "qty": 7,  "availability": "both",         "assigned_to": None,       "unit": "kit",    "pack_size": "1kit",  "sku": "SK-BL-01",  "low_stock": 2},
    {"name": "OPI Nail Polish (Red)",        "brand": "OPI",       "category": "Nail Care",   "mrp": 900, "cost": 400, "sell": 799, "gst": 18, "qty": 15, "availability": "both",         "assigned_to": None,       "unit": "bottle", "pack_size": "15ml",  "sku": "OPI-NP-R",  "low_stock": 3},
    {"name": "Streax Hair Mask",             "brand": "Streax",    "category": "Hair Care",   "mrp": 320, "cost": 160, "sell": 289, "gst": 18, "qty": 14, "availability": "both",         "assigned_to": None,       "unit": "sachet", "pack_size": "200g",  "sku": "ST-HM-200", "low_stock": 4},
    {"name": "Lakme Face Wash",              "brand": "Lakme",     "category": "Face Care",   "mrp": 260, "cost": 130, "sell": 235, "gst": 18, "qty": 18, "availability": "both",         "assigned_to": None,       "unit": "bottle", "pack_size": "150ml", "sku": "LK-FW-150", "low_stock": 4},
]

MEMBERSHIP_PLANS: List[Dict[str, Any]] = [
    {"name": "Silver", "tier": "Silver", "color": "#94A3B8", "amount": 1000, "credit": 1200, "validity": 6,  "terms": "Non-refundable. Valid on services + shop."},
    {"name": "Gold",   "tier": "Gold",   "color": "#D4AF37", "amount": 2000, "credit": 2500, "validity": 12, "terms": "12-month validity. Full-service usage on wallet."},
]


# ---------------------------------------------------------------------------
# 5. Seed sections
# ---------------------------------------------------------------------------
async def seed_services(db, salon_id: str) -> Dict[str, Dict[str, Any]]:
    """Upsert 10 services (idempotent by name)."""
    by_name: Dict[str, Dict[str, Any]] = {}
    for svc in SERVICES:
        existing = await db.services.find_one({"salon_id": salon_id, "service_name": svc["name"]})
        sid = existing["id"] if existing else str(uuid.uuid4())
        doc = {
            "id": sid,
            "salon_id": salon_id,
            "service_name": svc["name"],
            "category": svc["category"],
            "sub_category": svc["sub"],
            "description": f"{svc['name']} — high-quality salon service",
            "gender_tag": svc["gender"],
            "default_duration": svc["duration"],
            "base_price": svc["price"],
            "price_type": svc["price_type"],
            "is_favorite": svc["price"] >= 800,  # promote higher-value services
            "available_at_home": svc["category"] != "Packages",
            "home_price": svc["price"] + 200 if svc["category"] != "Packages" else None,
            "is_active": True,
            "is_enabled": True,
            "updated_at": NOW_ISO,
        }
        if not existing:
            doc["created_at"] = NOW_ISO
            await db.services.insert_one(doc)
        else:
            await db.services.update_one({"id": sid}, {"$set": doc})
        by_name[svc["name"]] = doc

        # Idempotent salon_services enablement
        await db.salon_services.update_one(
            {"salon_id": salon_id, "service_id": sid},
            {"$set": {"salon_id": salon_id, "service_id": sid, "is_enabled": True, "updated_at": NOW_ISO}},
            upsert=True,
        )
    print(f"[services] upserted {len(by_name)} services")

    # Sub-category directory (idempotent)
    subs_by_cat: Dict[str, List[str]] = {"Services": [], "Packages": []}
    for svc in SERVICES:
        subs_by_cat[svc["category"]].append(svc["sub"])
    for cat, names in subs_by_cat.items():
        for name in sorted(set(names)):
            await db.service_subcategories.update_one(
                {"salon_id": salon_id, "category": cat, "name": name},
                {"$set": {"salon_id": salon_id, "category": cat, "name": name, "updated_at": NOW_ISO}},
                upsert=True,
            )
    return by_name


async def seed_barbers(db, salon_id: str, branch_id: Optional[str]) -> List[Dict[str, Any]]:
    """Upsert 5 barbers (idempotent by name within salon)."""
    result: List[Dict[str, Any]] = []
    for idx, b in enumerate(BARBERS):
        existing = await db.barbers.find_one({"salon_id": salon_id, "name": b["name"]})
        bid = existing["id"] if existing else str(uuid.uuid4())
        doc = {
            "id": bid,
            "salon_id": salon_id,
            "branch_id": branch_id,
            "name": b["name"],
            "specialty": b["specialty"],
            "experience_years": b["exp"],
            "phone": b["phone"],
            "is_active": True,
            "is_barber": True,
            "role": "master" if b["specialty"] == "master" else "senior_stylist",
            "employee_type": "full_time",
            "base_salary": b["base_salary"],
            "commission_pct": b["commission_pct"],
            "incentive_pct": b["incentive_pct"],
            "compensation": {
                "base_salary": b["base_salary"],
                "commission_pct": b["commission_pct"],
                "incentive_pct": b["incentive_pct"],
                "pay_cycle": "monthly",
            },
            "designation": "Master Stylist" if b["specialty"] == "master" else "Senior Stylist",
            "department": "Hairstyling",
            "updated_at": NOW_ISO,
        }
        if not existing:
            doc["created_at"] = NOW_ISO
            await db.barbers.insert_one(doc)
        else:
            await db.barbers.update_one({"id": bid}, {"$set": doc})
        result.append(doc)
    print(f"[barbers] upserted {len(result)} barbers")
    return result


async def seed_customers(db, salon_id: str) -> List[Dict[str, Any]]:
    result: List[Dict[str, Any]] = []
    for c in CUSTOMERS:
        await db.customers.update_one(
            {"phone": c["phone"]},
            {
                "$set": {
                    "phone": c["phone"],
                    "name": c["name"],
                    "gender": c["gender"],
                    "salon_id": salon_id,
                    "last_booking_salon_id": salon_id,
                    "updated_at": NOW_ISO,
                },
                "$setOnInsert": {"id": str(uuid.uuid4()), "created_at": NOW_ISO},
            },
            upsert=True,
        )
        doc = await db.customers.find_one({"phone": c["phone"]}, {"_id": 0})
        result.append(doc)
    print(f"[customers] upserted {len(result)} customers")
    return result


async def seed_bookings(
    db, salon_id: str, branch_id: Optional[str],
    services_by_name: Dict[str, Dict[str, Any]],
    barbers: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    """Seed 10 tokens spread across today and the last 30 days."""
    today = ist_date(0)

    def _svc(name: str, qty: int = 1) -> Dict[str, Any]:
        s = services_by_name[name]
        return {
            "service_id": s["id"],
            "service_name": s["service_name"],
            "price": s["base_price"],
            "duration": s["default_duration"],
            "quantity": qty,
        }

    plan = [
        # 4 for TODAY — mix of statuses
        {"cust": 0, "barber": 0, "svcs": [("Men's Haircut", 1), ("Beard Trim", 1)], "status": "waiting",     "shift": "Morning", "token": "M1", "pay": "cash",   "date_offset": 0, "hour": 10},
        {"cust": 1, "barber": 1, "svcs": [("Women's Haircut", 1), ("Fruit Facial", 1)], "status": "in_progress","shift": "Noon",    "token": "N1", "pay": "upi",    "date_offset": 0, "hour": 13},
        {"cust": 2, "barber": 0, "svcs": [("Men's Haircut", 1)],                          "status": "completed",  "shift": "Morning", "token": "M2", "pay": "cash",   "date_offset": 0, "hour": 11},
        {"cust": 3, "barber": 4, "svcs": [("Gold Facial", 1)],                            "status": "completed",  "shift": "Noon",    "token": "N2", "pay": "upi",    "date_offset": 0, "hour": 14},
        # 6 in the last 30 days — completed / revenue-generating
        {"cust": 4, "barber": 2, "svcs": [("Global Hair Colour", 1)],                     "status": "completed",  "shift": "Noon",    "token": "N3", "pay": "card",   "date_offset": -2,  "hour": 15},
        {"cust": 5, "barber": 3, "svcs": [("Bridal Package", 1)],                         "status": "completed",  "shift": "Morning", "token": "M3", "pay": "upi",    "date_offset": -5,  "hour": 9},
        {"cust": 6, "barber": 1, "svcs": [("Men's Grooming Combo", 1)],                   "status": "completed",  "shift": "Evening", "token": "E1", "pay": "cash",   "date_offset": -8,  "hour": 18},
        {"cust": 7, "barber": 4, "svcs": [("Root Touch-up", 1), ("Eyebrow Threading", 1)],"status": "completed",  "shift": "Noon",    "token": "N4", "pay": "upi",    "date_offset": -12, "hour": 12},
        {"cust": 8, "barber": 0, "svcs": [("Beard Trim", 1), ("Men's Haircut", 1)],       "status": "completed",  "shift": "Morning", "token": "M4", "pay": "card",   "date_offset": -18, "hour": 10},
        # Bookings from wallet — customer #9 has membership wallet, pays via wallet
        {"cust": 9, "barber": 2, "svcs": [("Women's Haircut", 1)],                         "status": "completed",  "shift": "Noon",    "token": "N5", "pay": "wallet", "date_offset": -1,  "hour": 12},
    ]

    for p in plan:
        cust = CUSTOMERS[p["cust"]]
        barb = barbers[p["barber"]]
        svcs = [_svc(name, qty) for name, qty in p["svcs"]]
        total = sum(s["price"] * s["quantity"] for s in svcs)

        booking_date = ist_date(p["date_offset"])
        completed_at = (
            (_NOW + timedelta(days=p["date_offset"], hours=(p["hour"] - _NOW.astimezone(timezone.utc).hour)))
            .replace(minute=30).isoformat()
            if p["status"] == "completed" else None
        )
        token_key = f"{salon_id}:{booking_date}:{p['token']}"
        existing = await db.tokens.find_one({"seed_key": token_key})
        if existing:
            continue  # idempotent

        doc = {
            "id": str(uuid.uuid4()),
            "seed_key": token_key,   # dedupe marker for re-runs
            "salon_id": salon_id,
            "branch_id": branch_id,
            "customer_name": cust["name"],
            "customer_phone": cust["phone"],
            "phone": cust["phone"],
            "gender": cust["gender"],
            "barber_id": barb["id"],
            "barber_name": barb["name"],
            "services": svcs,
            "selected_services": [s["service_id"] for s in svcs],
            "total_amount": total,
            "status": p["status"],
            "token_number": p["token"],
            "shift": p["shift"],
            "date": booking_date,
            "booking_date": booking_date,
            "created_at": iso(-abs(p["date_offset"]) * 86400 - 3600),
            "completed_at": completed_at,
            "payment_mode": p["pay"],
            "channel": "manual",
            "source": "manual",
            "booking_type": "instant",
        }
        await db.tokens.insert_one(doc)

    total_after = await db.tokens.count_documents({"salon_id": salon_id, "seed_key": {"$regex": f"^{salon_id}:"}})
    print(f"[bookings] seed-token count = {total_after}")
    return []


async def seed_attendance(db, salon_id: str, barbers: List[Dict[str, Any]]) -> None:
    """Seed varied attendance for each barber (self / admin_on_behalf / etc)."""
    today = ist_date(0)
    y1 = ist_date(-1)
    scenarios = [
        # Barber 0 — Imran: self-check-in earlier today, still IN
        {"barber": 0, "date": today, "sessions": [{"ci": iso(-4 * 3600), "co": None, "ci_method": "self", "co_method": None}]},
        # Barber 1 — Abdul: admin_on_behalf check-in this morning, still IN
        {"barber": 1, "date": today, "sessions": [{"ci": iso(-3 * 3600), "co": None, "ci_method": "admin_on_behalf", "co_method": None}]},
        # Barber 2 — Rahul: complete session yesterday (self CI / self CO)
        {"barber": 2, "date": y1,    "sessions": [{"ci": iso(-30 * 3600), "co": iso(-22 * 3600), "ci_method": "self", "co_method": "self"}]},
        # Barber 3 — Kabir: complete session today, checked out
        {"barber": 3, "date": today, "sessions": [{"ci": iso(-8 * 3600), "co": iso(-1 * 3600),   "ci_method": "self", "co_method": "self"}]},
        # Barber 4 — Anita: admin edit inserted a completed session yesterday
        {"barber": 4, "date": y1,    "sessions": [{"ci": iso(-32 * 3600), "co": iso(-24 * 3600), "ci_method": "admin_edit", "co_method": "admin_edit"}]},
    ]

    for sc in scenarios:
        barb = barbers[sc["barber"]]
        sessions = sc["sessions"]
        # First session drives the legacy fields.
        first = sessions[0]
        last = sessions[-1]
        doc = {
            "id": f"seed-att-{barb['id']}-{sc['date']}",
            "salon_id": salon_id,
            "barber_id": barb["id"],
            "barber_name": barb["name"],
            "date": sc["date"],
            "sessions": sessions,
            "check_in_at": first["ci"],
            "check_in_method": first["ci_method"],
            "check_out_at": last["co"],
            "check_out_method": last["co_method"],
            "status": "checked_out" if last["co"] else "checked_in",
            "computed_under_mode": "geo_checkin",
            "updated_at": NOW_ISO,
        }
        await db.attendance.update_one(
            {"id": doc["id"]},
            {"$set": doc, "$setOnInsert": {"created_at": NOW_ISO}},
            upsert=True,
        )
    print(f"[attendance] upserted {len(scenarios)} attendance records")


async def seed_salary(db, salon_id: str, barbers: List[Dict[str, Any]]) -> None:
    """Seed last-month salary_records with base + commission + incentives."""
    prev = (_NOW + IST_OFFSET).replace(day=1) - timedelta(days=1)
    month = prev.strftime("%Y-%m")

    for barb in barbers:
        base = float(barb.get("base_salary") or 0)
        commission_pct = float(barb.get("commission_pct") or 0)
        incentive_pct = float(barb.get("incentive_pct") or 0)

        # Aggregate barber's last-30-day revenue from tokens
        cutoff = (_NOW - timedelta(days=30)).isoformat()
        agg = await db.tokens.find({
            "salon_id": salon_id,
            "barber_id": barb["id"],
            "status": "completed",
            "created_at": {"$gte": cutoff},
        }).to_list(500)
        gross = float(sum((t.get("total_amount") or 0) for t in agg))
        commission = round(gross * commission_pct / 100.0, 2)
        # Incentive kicks in only if barber crossed a threshold of ₹3000 revenue.
        incentive = round(gross * incentive_pct / 100.0, 2) if gross > 3000 else 0.0
        gross_pay = round(base + commission + incentive, 2)

        salary_id = f"seed-salary-{barb['id']}-{month}"
        doc = {
            "id": salary_id,
            "salon_id": salon_id,
            "barber_id": barb["id"],
            "barber_name": barb["name"],
            "month": month,
            "base_salary": base,
            "commission_pct": commission_pct,
            "commission_earned": commission,
            "incentive_pct": incentive_pct,
            "incentive_earned": incentive,
            "incentive_threshold_revenue": 3000.0,
            "revenue_last_30d": round(gross, 2),
            "gross_pay": gross_pay,
            "deductions": 0.0,
            "net_pay": gross_pay,
            "status": "computed",
            "paid_at": None,
            "updated_at": NOW_ISO,
        }
        await db.salary_records.update_one(
            {"id": salary_id},
            {"$set": doc, "$setOnInsert": {"created_at": NOW_ISO}},
            upsert=True,
        )
    print(f"[salary] upserted {len(barbers)} salary records for {month}")


async def seed_inventory(
    db, salon_id: str, branch_id: Optional[str],
    barbers: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    """Seed 10 inventory items; 3 are 'assigned' — 2 to specific barbers, 1 common bulk (internal_only)."""
    saved: List[Dict[str, Any]] = []
    for idx, it in enumerate(INVENTORY):
        assigned_to = it.get("assigned_to")
        staff_id = None
        if isinstance(assigned_to, str) and assigned_to.startswith("barber:"):
            b_idx = int(assigned_to.split(":", 1)[1])
            staff_id = barbers[b_idx]["id"] if b_idx < len(barbers) else None

        seed_id = f"seed-inv-{salon_id}-{it['sku']}"
        existing = await db.salon_inventory.find_one({"id": seed_id})
        doc = {
            "id": seed_id,
            "salon_id": salon_id,
            "branch_id": branch_id,
            "name": it["name"],
            "brand": it["brand"],
            "category": it["category"],
            "unit": it["unit"],
            "pack_size": it["pack_size"],
            "cost_price": float(it["cost"]),
            "selling_price": float(it["sell"]),
            "gst_percent": float(it["gst"]),
            "mrp": float(it["mrp"]),
            "discount": max(0.0, float(it["mrp"]) - float(it["sell"])) if it["sell"] else 0.0,
            "qty_total": int(it["qty"]),
            "qty_reserved_for_internal": 0,
            "qty_reserved_for_customer_orders": 0,
            "availability": it["availability"],
            "assigned_to_staff_id": staff_id,
            "assigned_to_label": "common" if assigned_to == "common" else None,
            "low_stock_threshold": int(it["low_stock"]),
            "sku_code": it["sku"],
            "image_url": None,
            "is_deleted": False,
            "updated_at": NOW_ISO,
        }
        if not existing:
            doc["created_at"] = NOW_ISO
            await db.salon_inventory.insert_one(doc)
        else:
            await db.salon_inventory.update_one({"id": seed_id}, {"$set": doc})
        saved.append(doc)
    print(f"[inventory] upserted {len(saved)} inventory items · 3 assigned (2 staff-specific, 1 common)")
    return saved


async def seed_orders(db, salon_id: str, branch_id: Optional[str], inv: List[Dict[str, Any]]) -> None:
    """Seed 2 customer product orders (1 placed / 1 delivered)."""
    if len(inv) < 2:
        return

    order_specs = [
        {
            "customer": CUSTOMERS[0],
            "lines": [(inv[3], 1), (inv[5], 2)],  # MAC Foundation + Nivea Lotion x2
            "status": "placed",
            "pay_status": "pending",
            "pay_mode": "cod",
            "note": "Please deliver evening.",
        },
        {
            "customer": CUSTOMERS[1],
            "lines": [(inv[4], 1)],  # Kerastase Serum
            "status": "delivered",
            "pay_status": "paid",
            "pay_mode": "upi",
            "note": "Received in salon on pickup.",
        },
    ]

    for spec in order_specs:
        items = []
        subtotal = 0.0
        gst = 0.0
        for prod, qty in spec["lines"]:
            unit_price = float(prod["selling_price"])
            gst_pct = float(prod["gst_percent"])
            line_gst = unit_price * qty * (gst_pct / (100.0 + gst_pct))
            line_sub = unit_price * qty - line_gst
            items.append({
                "item_type": "product",
                "item_id": prod["id"],
                "name": prod["name"],
                "brand": prod["brand"],
                "image_url": prod.get("image_url"),
                "unit": prod["unit"],
                "pack_size": prod["pack_size"],
                "qty": qty,
                "qty_reserved": qty if spec["status"] == "placed" else 0,
                "qty_final": qty,
                "unit_price": round(unit_price, 2),
                "line_subtotal": round(line_sub, 2),
                "line_gst": round(line_gst, 2),
                "line_total": round(unit_price * qty, 2),
                "gst_percent": gst_pct,
                "discount_percent": 0.0,
            })
            subtotal += line_sub
            gst += line_gst

        cust = spec["customer"]
        order_id = f"seed-ord-{salon_id}-{cust['phone']}-{spec['status']}"
        history = [{"status": "placed", "timestamp": iso(-3600), "note": "Customer placed order"}]
        if spec["status"] == "delivered":
            history += [
                {"status": "packed",  "timestamp": iso(-2400), "note": "Packed for delivery"},
                {"status": "delivered","timestamp": iso(-1200), "note": "Handed over to customer"},
            ]
        doc = {
            "id": order_id,
            "salon_id": salon_id,
            "branch_id": branch_id,
            "customer_phone": cust["phone"],
            "customer_name": cust["name"],
            "items": items,
            "subtotal": round(subtotal, 2),
            "gst_total": round(gst, 2),
            "total_amount": round(subtotal + gst, 2),
            "payment_mode": spec["pay_mode"],
            "payment_status": spec["pay_status"],
            "order_status": spec["status"],
            "status_history": history,
            "note": spec["note"],
            "created_at": iso(-3600),
            "updated_at": NOW_ISO,
        }
        await db.customer_product_orders.update_one(
            {"id": order_id}, {"$set": doc, "$setOnInsert": {}}, upsert=True,
        )
    print(f"[orders] upserted {len(order_specs)} customer orders")


async def seed_loyalty(db, salon_id: str) -> None:
    """Enable loyalty: single flat tier — every ₹500 spend yields 3% wallet credit."""
    tier = {
        "name": "Loyal Member",
        "spend_amount": 500,       # threshold
        "topup_percentage": 3.0,   # flat 3%
        "period_months": 12,
    }
    program = {
        "id": f"seed-loyalty-{salon_id}",
        "salon_id": salon_id,
        "enabled": True,
        "tiers": [tier],
        "updated_at": NOW_ISO,
    }
    await db.loyalty_programs.update_one(
        {"salon_id": salon_id},
        {"$set": program, "$setOnInsert": {"created_at": NOW_ISO}},
        upsert=True,
    )
    print("[loyalty] program enabled — 3% flat on every ₹500 spend, 12-month window")


async def seed_memberships(db, salon_id: str) -> List[Dict[str, Any]]:
    """Seed Silver + Gold plans and 2 customer memberships (+ matching wallets)."""
    plans_out: List[Dict[str, Any]] = []
    for plan in MEMBERSHIP_PLANS:
        plan_id = f"seed-plan-{salon_id}-{plan['name'].lower()}"
        doc = {
            "id": plan_id,
            "salon_id": salon_id,
            "name": plan["name"],
            "tier": plan["tier"],
            "color": plan["color"],
            "amount": plan["amount"],
            "credit": plan["credit"],
            "validity_months": plan["validity"],
            "terms_conditions": plan["terms"],
            "is_active": True,
            "updated_at": NOW_ISO,
        }
        await db.membership_plans.update_one(
            {"id": plan_id}, {"$set": doc, "$setOnInsert": {"created_at": NOW_ISO}}, upsert=True,
        )
        plans_out.append(doc)

    # Attach to 2 customers — Isha Patel (last CUSTOMER) & Aditya Rao (second-last)
    attach = [
        {"cust": CUSTOMERS[8], "plan": plans_out[0]},   # Aditya → Silver
        {"cust": CUSTOMERS[9], "plan": plans_out[1]},   # Isha   → Gold
    ]
    for row in attach:
        cust = row["cust"]
        plan = row["plan"]
        mem_id = f"seed-mem-{salon_id}-{cust['phone']}"
        expiry = (_NOW + timedelta(days=30 * plan["validity_months"])).isoformat()
        # Wallet balance for booking-from-wallet demo: Isha's remaining wallet
        # reflects that she already used a ₹600 booking from wallet.
        used = 600 if cust == CUSTOMERS[9] else 0
        wallet_balance = plan["credit"] - used
        mem_doc = {
            "id": mem_id,
            "salon_id": salon_id,
            "customer_phone": cust["phone"],
            "customer_name": cust["name"],
            "membership_plan_id": plan["id"],
            "membership_name": plan["name"],
            "tier": plan["tier"],
            "color": plan["color"],
            "payment_mode": "upi",
            "paid_amount": plan["amount"],
            "credit_added": plan["credit"],
            "wallet_balance": wallet_balance,
            "expiry_date": expiry,
            "is_active": True,
            "cancelled": False,
            "purchased_at": iso(-10 * 86400),
            "updated_at": NOW_ISO,
        }
        await db.customer_memberships.update_one(
            {"id": mem_id}, {"$set": mem_doc, "$setOnInsert": {"created_at": NOW_ISO}}, upsert=True,
        )

        # Customer wallet (independent of membership)
        wallet_id = f"seed-wallet-{salon_id}-{cust['phone']}"
        await db.customer_wallets.update_one(
            {"salon_id": salon_id, "customer_phone": cust["phone"]},
            {"$set": {
                "id": wallet_id,
                "salon_id": salon_id,
                "customer_phone": cust["phone"],
                "wallet_balance": wallet_balance,
                "updated_at": NOW_ISO,
            }, "$setOnInsert": {"created_at": NOW_ISO}},
            upsert=True,
        )

        # Record the wallet debit as a transaction (for the wallet-paid booking)
        if used > 0:
            tx_id = f"seed-walletdebit-{salon_id}-{cust['phone']}"
            await db.wallet_transactions.update_one(
                {"id": tx_id},
                {"$set": {
                    "id": tx_id,
                    "salon_id": salon_id,
                    "customer_phone": cust["phone"],
                    "type": "debit",
                    "amount": used,
                    "source": "booking_wallet_payment",
                    "reference_type": "token",
                    "note": "Women's Haircut paid from wallet",
                    "balance_after": wallet_balance,
                    "updated_at": NOW_ISO,
                }, "$setOnInsert": {"created_at": iso(-86400)}},
                upsert=True,
            )
    print(f"[memberships] {len(plans_out)} plans · {len(attach)} customer memberships + wallets")
    return plans_out


# ---------------------------------------------------------------------------
# 6. Orchestrator
# ---------------------------------------------------------------------------
async def main() -> None:
    client = AsyncIOMotorClient(MONGO_URL)
    db = client[DB_NAME]

    user = await db.salon_users.find_one({"login_id": "admin"})
    if not user:
        print("[seed_demo_dataset] admin salon_user not found — nothing to do")
        return
    salon_id = user["salon_id"]
    branch = await db.salon_branches.find_one({"salon_id": salon_id})
    branch_id = branch["id"] if branch else None
    print(f"[seed_demo_dataset] target salon_id={salon_id}  branch_id={branch_id}")

    services_by_name = await seed_services(db, salon_id)
    barbers = await seed_barbers(db, salon_id, branch_id)
    await seed_customers(db, salon_id)
    await seed_bookings(db, salon_id, branch_id, services_by_name, barbers)
    await seed_attendance(db, salon_id, barbers)
    await seed_salary(db, salon_id, barbers)
    inv = await seed_inventory(db, salon_id, branch_id, barbers)
    await seed_orders(db, salon_id, branch_id, inv)
    await seed_loyalty(db, salon_id)
    await seed_memberships(db, salon_id)

    print("[seed_demo_dataset] ✅ Done — visit the dashboard to see everything wired up.")


if __name__ == "__main__":
    asyncio.run(main())
