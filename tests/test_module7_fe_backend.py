"""Test: Save without edits should keep total_amount unchanged.
Backend backward-compat regression test.
"""
import os, requests, json
BASE = os.environ.get("REACT_APP_BACKEND_URL", "https://appt-filter-redesign.preview.emergentagent.com").rstrip("/")
TOKEN_ID = "34b806ab-49fe-43b7-9baf-5e28e5cae247"

r = requests.post(f"{BASE}/api/salon/users/login", json={"identifier": "admin", "password": "salon123"})
H = {"Authorization": f"Bearer {r.json()['access_token']}", "Content-Type": "application/json"}

# Read pre-save state
pre = requests.get(f"{BASE}/api/tokens/{TOKEN_ID}", headers=H).json()
print("PRE: total=", pre.get("total_amount"), "subtotal=", pre.get("subtotal"))

# Backward-compat regression: PUT with NO service_assignments, NO discount, final_amount=existing total
existing_total = pre["total_amount"]
payload = {"final_amount": existing_total}
r = requests.put(f"{BASE}/api/tokens/{TOKEN_ID}/modify", json=payload, headers=H)
print("PUT status:", r.status_code)
tok = r.json()["token"]
print("POST: total=", tok["total_amount"], "subtotal=", tok["subtotal"],
      "order_discount_amount=", tok["order_discount_amount"])

# Assertions
assert abs(tok["total_amount"] - existing_total) < 0.01, "total_amount should equal final_amount"
assert tok["subtotal"] >= existing_total, f"subtotal {tok['subtotal']} should be >= total {existing_total}"
expected_disc = max(0, tok["subtotal"] - existing_total)
assert abs(tok["order_discount_amount"] - expected_disc) < 0.01, f"discount {tok['order_discount_amount']} != {expected_disc}"
sa = tok.get("service_assignments") or []
assert len(sa) >= 2, f"service_assignments should remain populated: {sa}"
print("BACKWARD_COMPAT_PASS")

# Now save end-to-end: split 2 services across 2 barbers + 10% discount
BARBER_A = "a3e12da2-b2d2-4e78-ae7c-2e3b4b0c0169"
BARBER_B = "228abdec-bd39-48f0-93b7-245c8e2156a6"
SH = "36ab7dd7-6835-4399-97fa-edfa01b8b802"
SB = "c904dc04-7df3-4bf6-9456-dca4fd5d6b38"
payload = {
    "main_barber_id": BARBER_A,
    "service_assignments": [
        {"service_id": SH, "barber_id": BARBER_A, "service_price": 400},
        {"service_id": SB, "barber_id": BARBER_B, "service_price": 600},
    ],
    "order_discount_percent": 10,
}
r = requests.put(f"{BASE}/api/tokens/{TOKEN_ID}/modify", json=payload, headers=H)
print("E2E PUT status:", r.status_code)
tok = r.json()["token"]
print("E2E: subtotal=", tok["subtotal"], "total=", tok["total_amount"], "disc%=", tok["order_discount_percent"])
assert tok["subtotal"] == 1000.0
assert abs(tok["total_amount"] - 900.0) < 0.01
assert tok["order_discount_percent"] == 10.0
# Verify persistence via GET
g = requests.get(f"{BASE}/api/tokens/{TOKEN_ID}", headers=H).json()
sa = g["service_assignments"]
by = {a["service_id"]: a for a in sa}
assert by[SH]["barber_id"] == BARBER_A
assert by[SB]["barber_id"] == BARBER_B
print("E2E_SPLIT_PASS")
print("ALL_TESTS_PASS")
