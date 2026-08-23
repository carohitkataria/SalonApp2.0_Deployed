#!/usr/bin/env python3
"""
Performance verification test for SalonHub backend (items 1b/1c/1d).
Target salon: Glam Central37 (909b8e81-ed8d-4c1c-9305-7545d1d4ce44)
Auth: admin/salon123
Base URL: from frontend/.env REACT_APP_BACKEND_URL
All routes prefixed with /api

SAFETY: This is PRODUCTION Twilio + Cashfree — do NOT trigger real WhatsApp sends or payments.
Do NOT call POST /api/admin/_oneoff_migrate.

Tests:
1. today-sales $group correctness - verify against MongoDB
2. customers list $group correctness - verify visit_count and total_spend
3. Server-Timing header (item 1d) - confirm header present
4. No regressions - test multiple endpoints
"""

import os
import sys
import requests
import json
from datetime import datetime, timezone
from pymongo import MongoClient

# Read REACT_APP_BACKEND_URL from frontend/.env
def read_backend_url():
    env_path = "/app/frontend/.env"
    with open(env_path, 'r') as f:
        for line in f:
            if line.startswith('REACT_APP_BACKEND_URL='):
                return line.split('=', 1)[1].strip()
    raise ValueError("REACT_APP_BACKEND_URL not found in /app/frontend/.env")

BASE_URL = read_backend_url()
API_BASE = f"{BASE_URL}/api"

# Test credentials
SALON_ID = "909b8e81-ed8d-4c1c-9305-7545d1d4ce44"  # Glam Central37
ADMIN_IDENTIFIER = "admin"
ADMIN_PASSWORD = "salon123"

# MongoDB connection
def get_mongo_client():
    mongo_url = os.environ.get('MONGO_URL')
    if not mongo_url:
        # Read from backend/.env
        env_path = "/app/backend/.env"
        with open(env_path, 'r') as f:
            for line in f:
                if line.startswith('MONGO_URL='):
                    mongo_url = line.split('=', 1)[1].strip().strip('"')
                    break
    db_name = os.environ.get('DB_NAME')
    if not db_name:
        env_path = "/app/backend/.env"
        with open(env_path, 'r') as f:
            for line in f:
                if line.startswith('DB_NAME='):
                    db_name = line.split('=', 1)[1].strip().strip('"')
                    break
    if not db_name:
        db_name = 'salonhub'
    client = MongoClient(mongo_url)
    return client[db_name]

# Test results
test_results = []

def log_test(test_name, passed, details=""):
    status = "✅ PASS" if passed else "❌ FAIL"
    test_results.append({
        "test": test_name,
        "passed": passed,
        "details": details
    })
    print(f"{status}: {test_name}")
    if details:
        print(f"  Details: {details}")

def print_summary():
    print("\n" + "="*80)
    print("PERFORMANCE VERIFICATION TEST SUMMARY")
    print("="*80)
    passed = sum(1 for t in test_results if t['passed'])
    total = len(test_results)
    print(f"Total: {passed}/{total} tests passed")
    print()
    
    if any(not t['passed'] for t in test_results):
        print("FAILED TESTS:")
        for t in test_results:
            if not t['passed']:
                print(f"  ❌ {t['test']}")
                if t['details']:
                    print(f"     {t['details']}")
    else:
        print("✅ ALL TESTS PASSED")
    print("="*80)

# Test 1: Salon admin login
def test_admin_login():
    try:
        resp = requests.post(
            f"{API_BASE}/salon/users/login",
            json={"identifier": ADMIN_IDENTIFIER, "password": ADMIN_PASSWORD},
            timeout=10
        )
        if resp.status_code != 200:
            log_test("1. Salon admin login", False, f"Status: {resp.status_code}, Body: {resp.text[:200]}")
            return None
        
        data = resp.json()
        token = data.get('access_token')
        resolved_salon_id = data.get('salon_id')
        
        if not token:
            log_test("1. Salon admin login", False, "No access_token in response")
            return None
        
        if resolved_salon_id != SALON_ID:
            log_test("1. Salon admin login", False, f"Resolved salon_id {resolved_salon_id} != expected {SALON_ID}")
            return None
        
        log_test("1. Salon admin login", True, f"Token received, salon_id: {resolved_salon_id}")
        return token
    except Exception as e:
        log_test("1. Salon admin login", False, f"Exception: {str(e)}")
        return None

# Test 2: today-sales $group correctness
def test_today_sales_correctness(token):
    try:
        headers = {"Authorization": f"Bearer {token}"}
        
        # Get today-sales from API
        resp = requests.get(
            f"{API_BASE}/salons/{SALON_ID}/today-sales",
            headers=headers,
            timeout=10
        )
        
        if resp.status_code != 200:
            log_test("2. today-sales $group correctness", False, f"Status: {resp.status_code}, Body: {resp.text[:200]}")
            return False
        
        data = resp.json()
        if 'today_sales' not in data:
            log_test("2. today-sales $group correctness", False, f"No 'today_sales' field in response: {data}")
            return False
        
        api_today_sales = data['today_sales']
        
        # Independently verify against MongoDB
        db = get_mongo_client()
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        
        # Query: salon_id=this salon, date=today's date (UTC, format YYYY-MM-DD), status="completed"
        query = {
            "salon_id": SALON_ID,
            "date": today,
            "status": "completed"
        }
        
        # Compute sum of total_amount
        completed_tokens = list(db.tokens.find(query, {"_id": 0, "total_amount": 1}))
        mongo_sum = sum(float(t.get('total_amount', 0)) for t in completed_tokens)
        
        # Check if they match
        if abs(api_today_sales - mongo_sum) < 0.01:  # Allow for floating point precision
            log_test("2. today-sales $group correctness", True, 
                    f"API: {api_today_sales}, MongoDB: {mongo_sum}, Tokens: {len(completed_tokens)}")
            return True
        else:
            log_test("2. today-sales $group correctness", False, 
                    f"MISMATCH - API: {api_today_sales}, MongoDB: {mongo_sum}, Tokens: {len(completed_tokens)}")
            return False
    except Exception as e:
        log_test("2. today-sales $group correctness", False, f"Exception: {str(e)}")
        return False

# Test 3: customers list $group correctness
def test_customers_list_correctness(token):
    try:
        headers = {"Authorization": f"Bearer {token}"}
        
        # Get customers list from API
        resp = requests.get(
            f"{API_BASE}/salons/{SALON_ID}/customers",
            headers=headers,
            timeout=30
        )
        
        if resp.status_code != 200:
            log_test("3. customers list $group correctness", False, f"Status: {resp.status_code}, Body: {resp.text[:200]}")
            return False
        
        data = resp.json()
        customers = data.get('customers', [])
        
        if not isinstance(customers, list):
            log_test("3. customers list $group correctness", False, f"customers is not a list: {type(customers)}")
            return False
        
        # Check each customer has numeric visit_count and total_spend (non-negative)
        issues = []
        for i, cust in enumerate(customers):
            phone = cust.get('phone', 'unknown')
            visit_count = cust.get('visit_count')
            total_spend = cust.get('total_spend')
            
            if visit_count is None:
                issues.append(f"Customer {phone} missing visit_count")
            elif not isinstance(visit_count, (int, float)) or visit_count < 0:
                issues.append(f"Customer {phone} has invalid visit_count: {visit_count}")
            
            if total_spend is None:
                issues.append(f"Customer {phone} missing total_spend")
            elif not isinstance(total_spend, (int, float)) or total_spend < 0:
                issues.append(f"Customer {phone} has invalid total_spend: {total_spend}")
        
        if issues:
            log_test("3. customers list $group correctness", False, f"Issues: {'; '.join(issues[:5])}")
            return False
        
        # Sanity-check: pick one customer with bookings and verify total_spend
        db = get_mongo_client()
        if customers:
            # Find a customer with at least one completed booking
            test_customer = None
            for cust in customers:
                if cust.get('visit_count', 0) > 0 and cust.get('total_spend', 0) > 0:
                    test_customer = cust
                    break
            
            if test_customer:
                phone = test_customer['phone']
                api_total_spend = test_customer['total_spend']
                
                # Query MongoDB for this customer's completed tokens
                tokens = list(db.tokens.find({
                    "salon_id": SALON_ID,
                    "phone": phone,
                    "status": {"$in": ["completed", "complete"]},
                    "customer_status": {"$ne": "deleted"}
                }, {"_id": 0, "final_amount": 1, "total_amount": 1}))
                
                # Sum using same logic as backend: final_amount if > 0, else total_amount
                mongo_sum = sum(
                    float(t.get('final_amount', 0)) if float(t.get('final_amount', 0)) > 0 
                    else float(t.get('total_amount', 0)) 
                    for t in tokens
                )
                
                # Allow for small floating point differences
                if abs(api_total_spend - mongo_sum) < 0.01:
                    log_test("3. customers list $group correctness", True, 
                            f"Total customers: {len(customers)}, Sanity-check customer {phone}: API={api_total_spend}, MongoDB={mongo_sum}")
                    return True
                else:
                    log_test("3. customers list $group correctness", False, 
                            f"Sanity-check FAILED for customer {phone}: API={api_total_spend}, MongoDB={mongo_sum}")
                    return False
            else:
                # No customer with bookings to verify, but all have valid fields
                log_test("3. customers list $group correctness", True, 
                        f"Total customers: {len(customers)}, all have valid visit_count and total_spend (no customer with bookings to sanity-check)")
                return True
        else:
            log_test("3. customers list $group correctness", True, "No customers found (empty list is valid)")
            return True
    except Exception as e:
        log_test("3. customers list $group correctness", False, f"Exception: {str(e)}")
        return False

# Test 4: Server-Timing header present
def test_server_timing_header(token):
    try:
        headers = {"Authorization": f"Bearer {token}"}
        
        # Test on GET /api/ (health check)
        resp = requests.get(f"{API_BASE}/", headers=headers, timeout=10)
        
        server_timing = resp.headers.get('Server-Timing')
        
        if not server_timing:
            log_test("4. Server-Timing header (item 1d)", False, f"No Server-Timing header in response. Headers: {dict(resp.headers)}")
            return False
        
        # Check format: app;dur=...
        if 'app;dur=' in server_timing or 'app; dur=' in server_timing:
            log_test("4. Server-Timing header (item 1d)", True, f"Server-Timing: {server_timing}")
            return True
        else:
            log_test("4. Server-Timing header (item 1d)", False, f"Server-Timing header present but wrong format: {server_timing}")
            return False
    except Exception as e:
        log_test("4. Server-Timing header (item 1d)", False, f"Exception: {str(e)}")
        return False

# Test 5: No regressions - services/enabled
def test_services_enabled_regression(token):
    try:
        headers = {"Authorization": f"Bearer {token}"}
        resp = requests.get(
            f"{API_BASE}/salons/{SALON_ID}/services/enabled",
            headers=headers,
            timeout=10
        )
        
        if resp.status_code != 200:
            log_test("5a. Regression: GET /services/enabled", False, f"Status: {resp.status_code}, Body: {resp.text[:200]}")
            return False
        
        services = resp.json()
        if not isinstance(services, list):
            log_test("5a. Regression: GET /services/enabled", False, f"Response is not a list: {type(services)}")
            return False
        
        # Check each service has category in {Services, Packages} and populated sub_category
        issues = []
        for svc in services[:10]:  # Check first 10
            category = svc.get('category')
            sub_category = svc.get('sub_category')
            
            if category not in ['Services', 'Packages']:
                issues.append(f"Service {svc.get('service_name', 'unknown')} has invalid category: {category}")
            
            if not sub_category or sub_category.strip() == "":
                issues.append(f"Service {svc.get('service_name', 'unknown')} has empty sub_category")
        
        if issues:
            log_test("5a. Regression: GET /services/enabled", False, f"Issues: {'; '.join(issues[:3])}")
            return False
        
        log_test("5a. Regression: GET /services/enabled", True, f"Returned {len(services)} services, all valid")
        return True
    except Exception as e:
        log_test("5a. Regression: GET /services/enabled", False, f"Exception: {str(e)}")
        return False

# Test 6: No regressions - classification
def test_classification_regression(token):
    try:
        headers = {"Authorization": f"Bearer {token}"}
        resp = requests.get(
            f"{API_BASE}/salons/{SALON_ID}/classification",
            headers=headers,
            timeout=10
        )
        
        passed = resp.status_code == 200
        log_test("5b. Regression: GET /classification", passed, f"Status: {resp.status_code}")
        return passed
    except Exception as e:
        log_test("5b. Regression: GET /classification", False, f"Exception: {str(e)}")
        return False

# Test 7: No regressions - ops-settings
def test_ops_settings_regression(token):
    try:
        headers = {"Authorization": f"Bearer {token}"}
        resp = requests.get(
            f"{API_BASE}/salons/{SALON_ID}/ops-settings",
            headers=headers,
            timeout=10
        )
        
        passed = resp.status_code == 200
        log_test("5c. Regression: GET /ops-settings", passed, f"Status: {resp.status_code}")
        return passed
    except Exception as e:
        log_test("5c. Regression: GET /ops-settings", False, f"Exception: {str(e)}")
        return False

# Test 8: No regressions - messages/unread-count
def test_unread_count_regression(token):
    try:
        headers = {"Authorization": f"Bearer {token}"}
        resp = requests.get(
            f"{API_BASE}/salons/{SALON_ID}/messages/unread-count",
            headers=headers,
            timeout=10
        )
        
        if resp.status_code != 200:
            log_test("5d. Regression: GET /messages/unread-count", False, f"Status: {resp.status_code}, Body: {resp.text[:200]}")
            return False
        
        data = resp.json()
        if 'count' not in data:
            log_test("5d. Regression: GET /messages/unread-count", False, f"No 'count' field in response: {data}")
            return False
        
        log_test("5d. Regression: GET /messages/unread-count", True, f"Status: 200, count: {data['count']}")
        return True
    except Exception as e:
        log_test("5d. Regression: GET /messages/unread-count", False, f"Exception: {str(e)}")
        return False

# Test 9: No regressions - conversations
def test_conversations_regression(token):
    try:
        headers = {"Authorization": f"Bearer {token}"}
        resp = requests.get(
            f"{API_BASE}/salons/{SALON_ID}/conversations",
            headers=headers,
            timeout=10
        )
        
        passed = resp.status_code == 200
        details = f"Status: {resp.status_code}"
        if passed:
            data = resp.json()
            details += f", Conversations count: {len(data) if isinstance(data, list) else 'N/A'}"
        else:
            details += f", Body: {resp.text[:200]}"
        
        log_test("5e. Regression: GET /conversations", passed, details)
        return passed
    except Exception as e:
        log_test("5e. Regression: GET /conversations", False, f"Exception: {str(e)}")
        return False

def main():
    print("="*80)
    print("SALONHUB BACKEND PERFORMANCE VERIFICATION TEST")
    print(f"Base URL: {BASE_URL}")
    print(f"Salon ID: {SALON_ID} (Glam Central37)")
    print(f"Auth: {ADMIN_IDENTIFIER}/{ADMIN_PASSWORD}")
    print("="*80)
    print()
    
    # Test 1: Login
    token = test_admin_login()
    if not token:
        print("\n❌ CRITICAL: Admin login failed. Stopping tests that require auth.")
        print_summary()
        sys.exit(1)
    
    # Test 2: today-sales $group correctness
    test_today_sales_correctness(token)
    
    # Test 3: customers list $group correctness
    test_customers_list_correctness(token)
    
    # Test 4: Server-Timing header
    test_server_timing_header(token)
    
    # Test 5-9: No regressions
    test_services_enabled_regression(token)
    test_classification_regression(token)
    test_ops_settings_regression(token)
    test_unread_count_regression(token)
    test_conversations_regression(token)
    
    # Summary
    print_summary()
    
    # Exit code
    all_passed = all(t['passed'] for t in test_results)
    sys.exit(0 if all_passed else 1)

if __name__ == "__main__":
    main()
