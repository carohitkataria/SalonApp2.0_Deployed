import requests
import json

BASE_URL = "https://service-catalog-sync.preview.emergentagent.com/api"
SALON_ID = "525d3b3e-6a39-4e28-8597-60b6c4ddcb60"

# Authenticate
auth_response = requests.post(
    f"{BASE_URL}/salon/users/login",
    json={"identifier": "admin", "password": "salon123"}
)
token = auth_response.json()["access_token"]
headers = {"Authorization": f"Bearer {token}"}

# Get services and barbers
services = requests.get(f"{BASE_URL}/salons/{SALON_ID}/services/enabled", headers=headers).json()
barbers = requests.get(f"{BASE_URL}/salons/{SALON_ID}/barbers", headers=headers).json()

service_id = services[0]['id']
barber_id = barbers[0]['id']

# Create a new booking with tip_amount
booking_payload = {
    "customer_name": "Tip Test Customer",
    "phone": "9800055599",
    "gender": "Men",
    "barber_id": barber_id,
    "selected_services": [service_id],
    "services_payload": [
        {
            "service_id": service_id,
            "barber_id": barber_id,
            "discount_percent": 10
        }
    ],
    "shift": "Morning",
    "booking_type": "queue",
    "payment_mode": "cash",
    "discount_percent": 15,
    "discount_flat": 50,
    "tip_amount": 25
}

print("Creating booking with tip_amount=25...")
response = requests.post(
    f"{BASE_URL}/salons/{SALON_ID}/salon-booking",
    json=booking_payload,
    headers=headers
)

if response.status_code == 200:
    data = response.json()
    print(f"\n✅ Booking created: {data.get('token_number')}")
    print(f"  - order_discount_percent: {data.get('order_discount_percent')}")
    print(f"  - order_discount_amount: {data.get('order_discount_amount')}")
    print(f"  - tip_amount: {data.get('tip_amount')} (EXPECTED: 25)")
    print(f"  - payment_mode: {data.get('payment_mode')}")
    
    if data.get('tip_amount') == 25:
        print("\n✅ tip_amount correctly stored in CREATE response!")
    else:
        print(f"\n❌ tip_amount mismatch: got {data.get('tip_amount')}, expected 25")
else:
    print(f"❌ Failed: {response.status_code} - {response.text}")
