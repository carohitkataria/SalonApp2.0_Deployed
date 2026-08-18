#!/usr/bin/env python3
"""
Verify service_assignments are stored correctly in tokens
"""

import requests
import json

BASE_URL = "https://appt-filter-redesign.preview.emergentagent.com/api"
SALON_ID = "9d2c95b0-3931-4e0c-b7e8-70aba857bd0a"

LOGIN_PAYLOAD = {
    "identifier": "admin",
    "password": "salon123"
}

def login():
    """Login and get access token"""
    url = f"{BASE_URL}/salon/users/login"
    response = requests.post(url, json=LOGIN_PAYLOAD)
    
    if response.status_code != 200:
        print(f"ERROR: Login failed")
        return None
    
    data = response.json()
    return data.get("access_token")

def verify_tokens(token):
    """Fetch tokens and verify service_assignments"""
    print("=" * 80)
    print("VERIFYING SERVICE ASSIGNMENTS IN TOKENS")
    print("=" * 80)
    
    headers = {"Authorization": f"Bearer {token}"}
    
    # Get today's date
    from datetime import datetime
    today = datetime.now().strftime("%Y-%m-%d")
    
    url = f"{BASE_URL}/salons/{SALON_ID}/queue?date={today}"
    
    response = requests.get(url, headers=headers)
    
    if response.status_code != 200:
        print(f"ERROR: Failed to get tokens")
        print(f"Response: {response.text}")
        return
    
    tokens = response.json()
    print(f"\nTotal tokens: {len(tokens)}")
    
    # Find tokens with service_assignments
    tokens_with_assignments = [t for t in tokens if t.get("service_assignments")]
    
    print(f"Tokens with service_assignments: {len(tokens_with_assignments)}")
    
    # Show the last 3 tokens with assignments (our test tokens)
    for i, token_data in enumerate(tokens_with_assignments[-3:]):
        print(f"\n--- Token {i+1} ---")
        print(f"Token Number: {token_data.get('token_number')}")
        print(f"Customer: {token_data.get('customer_name')}")
        print(f"Total Amount: ₹{token_data.get('total_amount')}")
        print(f"Status: {token_data.get('status')}")
        
        assignments = token_data.get("service_assignments", [])
        print(f"\nService Assignments ({len(assignments)}):")
        
        for j, asg in enumerate(assignments):
            print(f"  Assignment {j+1}:")
            print(f"    Service ID: {asg.get('service_id')}")
            print(f"    Barber: {asg.get('barber_name_snapshot')}")
            print(f"    List Price (base): ₹{asg.get('list_price')}")
            print(f"    Service Price (net): ₹{asg.get('service_price')}")
            print(f"    Discount %: {asg.get('discount_percent', 0)}%")
            
            # Verify calculation
            list_price = float(asg.get('list_price', 0))
            service_price = float(asg.get('service_price', 0))
            discount_pct = float(asg.get('discount_percent', 0))
            
            expected_net = round(list_price * (1 - discount_pct / 100.0), 2)
            
            if service_price == expected_net:
                print(f"    ✅ Calculation correct: {list_price} * (1 - {discount_pct}/100) = {service_price}")
            else:
                print(f"    ❌ Calculation mismatch: Expected {expected_net}, got {service_price}")

def main():
    token = login()
    if not token:
        print("Login failed")
        return
    
    verify_tokens(token)

if __name__ == "__main__":
    main()
