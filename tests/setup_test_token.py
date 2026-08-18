"""Create a test booking via API for frontend test."""
import os
import requests
import sys
from datetime import datetime, timezone

BASE = os.environ.get("REACT_APP_BACKEND_URL", "https://appt-filter-redesign.preview.emergentagent.com").rstrip("/")
SALON_ID = "62609c3d-a90a-481b-9cd4-4208f741e121"
BRANCH_ID = "b829d20e-f923-4db8-a69c-9daf38fcd5a9"
BARBER_A = "a3e12da2-b2d2-4e78-ae7c-2e3b4b0c0169"
SERVICE_HAIRCUT = "36ab7dd7-6835-4399-97fa-edfa01b8b802"
SERVICE_BEARD = "c904dc04-7df3-4bf6-9456-dca4fd5d6b38"

# Enable salon services first
from pymongo import MongoClient
from dotenv import load_dotenv
import uuid
load_dotenv("/app/backend/.env")
mc = MongoClient(os.environ["MONGO_URL"])
db = mc[os.environ["DB_NAME"]]
for sid in (SERVICE_HAIRCUT, SERVICE_BEARD):
    existing = db.salon_services.find_one({"salon_id": SALON_ID, "service_id": sid})
    if not existing:
        db.salon_services.insert_one({
            "id": str(uuid.uuid4()),
            "salon_id": SALON_ID,
            "service_id": sid,
            "is_enabled": True,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
    else:
        db.salon_services.update_one({"_id": existing["_id"]}, {"$set": {"is_enabled": True}})

# Cancel any existing active token for our test phone
db.tokens.update_many(
    {"phone": "+917503070727", "status": {"$in": ["waiting", "in_service", "called"]}},
    {"$set": {"status": "cancelled", "cancelled": True}},
)

# Login admin
r = requests.post(f"{BASE}/api/salon/users/login", json={"identifier": "admin", "password": "salon123"})
salon_token = r.json()["access_token"]
print("SALON_TOKEN_PREFIX=", salon_token[:30])

# Customer login
r = requests.post(f"{BASE}/api/user/login", json={"name": "TEST M7 FE", "phone": "7503070727"})
cust = r.json()
print("CUST_ID=", cust["id"])

# Create a booking
today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
body = {
    "salon_id": SALON_ID,
    "branch_id": BRANCH_ID,
    "user_id": cust["id"],
    "customer_name": "TEST M7 FE Modify",
    "phone": "7503070727",
    "date": today,
    "shift": "Morning",
    "barber_id": BARBER_A,
    "selected_services": [SERVICE_HAIRCUT, SERVICE_BEARD],
    "source": "online",
    "booking_type": "instant",
    "booking_for_self": True,
}
r = requests.post(f"{BASE}/api/bookings", json=body)
tok = r.json()
print("TOKEN_ID=", tok["id"])
print("TOKEN_TOTAL=", tok.get("total_amount"))
print("SALON_TOKEN=", salon_token)
