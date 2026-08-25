#!/usr/bin/env python3
"""
Test script to verify the WhatsApp booking_completed template bug fix.

BUG: Previously, the "booking completed / invoice generated" WhatsApp message was sent
as FREE-TEXT, which Twilio rejected outside the 24h window.

FIX: Now it uses the APPROVED Content TEMPLATE (SID HXa417403d8b7ff32ce17fcadc6fe1c19a,
template_name 'booking_completed').

This test verifies:
1. The /complete endpoint sends the message using the template (not free-text)
2. The whatsapp_send_log records template_name='booking_completed'
3. No free-text 'invoice_sent' row is created
"""

import requests
import pymongo
import os
import sys
from datetime import datetime, timezone
import uuid

# Configuration
BASE_URL = "https://salon-booking-hub-167.preview.emergentagent.com/api"
SALON_ID = "909b8e81-ed8d-4c1c-9305-7545d1d4ce44"
TEST_PHONE = "+919999000022"  # Fake test phone (Twilio may reject, that's fine)
ADMIN_IDENTIFIER = "admin"
ADMIN_PASSWORD = "salon123"

# MongoDB connection
MONGO_URL = os.getenv("MONGO_URL", "mongodb+srv://carohitkataria_db_user:BqdaSfoiBeHWNKTT@salonhub.s3udxut.mongodb.net/salonhub?retryWrites=true&w=majority")
DB_NAME = os.getenv("DB_NAME", "salonhub")

def get_mongo_client():
    """Get MongoDB client"""
    return pymongo.MongoClient(MONGO_URL)

def login_admin():
    """Login as admin and get Bearer token"""
    print("\n" + "="*80)
    print("STEP 1: ADMIN LOGIN")
    print("="*80)
    
    url = f"{BASE_URL}/salon/users/login"
    payload = {
        "identifier": ADMIN_IDENTIFIER,
        "password": ADMIN_PASSWORD
    }
    
    print(f"POST {url}")
    print(f"Payload: {payload}")
    
    response = requests.post(url, json=payload)
    print(f"Status: {response.status_code}")
    
    if response.status_code != 200:
        print(f"ERROR: Login failed")
        print(f"Response: {response.text}")
        sys.exit(1)
    
    data = response.json()
    token = data.get("access_token")
    salon_id = data.get("salon_id")
    
    print(f"✅ Login successful")
    print(f"   Salon ID: {salon_id}")
    print(f"   Token: {token[:20]}...")
    
    return token, salon_id

def get_active_token_for_reference(mongo_client, salon_id):
    """Get an existing active token to copy field structure"""
    db = mongo_client[DB_NAME]
    tokens_col = db["tokens"]
    
    # Find an active token for this salon
    existing_token = tokens_col.find_one({
        "salon_id": salon_id,
        "status": "active"
    })
    
    return existing_token

def create_test_token(mongo_client, salon_id, bearer_token):
    """Create a minimal but valid test token in MongoDB"""
    print("\n" + "="*80)
    print("STEP 2: CREATE TEST TOKEN")
    print("="*80)
    
    db = mongo_client[DB_NAME]
    tokens_col = db["tokens"]
    
    # Get reference token to copy structure
    ref_token = get_active_token_for_reference(mongo_client, salon_id)
    
    if not ref_token:
        print("ERROR: No active tokens found for reference. Creating minimal token...")
        # Get services and barbers
        services_resp = requests.get(
            f"{BASE_URL}/salons/{salon_id}/services/enabled",
            headers={"Authorization": f"Bearer {bearer_token}"}
        )
        barbers_resp = requests.get(
            f"{BASE_URL}/salons/{salon_id}/barbers",
            headers={"Authorization": f"Bearer {bearer_token}"}
        )
        
        if services_resp.status_code != 200 or barbers_resp.status_code != 200:
            print("ERROR: Failed to fetch services or barbers")
            sys.exit(1)
        
        services = services_resp.json()
        barbers = barbers_resp.json()
        
        if not services or not barbers:
            print("ERROR: No services or barbers available")
            sys.exit(1)
        
        service = services[0]
        barber = barbers[0]
        
        # Create minimal token
        token_id = str(uuid.uuid4())
        token_doc = {
            "id": token_id,
            "salon_id": salon_id,
            "token_number": "99999",  # String, not int
            "customer_name": "QA Complete Test",
            "phone": TEST_PHONE,
            "status": "active",
            "barber_id": barber.get("id"),
            "barber_name": barber.get("name", "QA Barber"),
            "total_amount": 500,
            "selected_services": [service.get("id")],
            "service_assignments": [{
                "service_id": service.get("id"),
                "service_name": service.get("service_name", "Test Service"),
                "barber_id": barber.get("id"),
                "barber_name_snapshot": barber.get("name", "QA Barber"),
                "service_price": 500,
                "list_price": 500,
                "quantity": 1
            }],
            "date": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
            "created_at": datetime.now(timezone.utc).isoformat(),
            "booking_type": "queue",
            "payment_mode": "cash",
            "payment_status": "unpaid",
            "shift": "Morning",  # Required field
            "source": "walk_in"  # Required field
        }
    else:
        # Copy structure from existing token
        print(f"Found reference token: {ref_token.get('token_number')}")
        
        token_id = str(uuid.uuid4())
        token_doc = {
            "id": token_id,
            "salon_id": salon_id,
            "token_number": "99999",  # String, not int
            "customer_name": "QA Complete Test",
            "phone": TEST_PHONE,
            "status": "active",
            "barber_id": ref_token.get("barber_id"),
            "barber_name": ref_token.get("barber_name", "QA Barber"),
            "total_amount": 500,
            "selected_services": ref_token.get("selected_services", []),
            "service_assignments": [{
                "service_id": ref_token.get("selected_services", ["test"])[0] if ref_token.get("selected_services") else "test",
                "service_name": "Test Service",
                "barber_id": ref_token.get("barber_id"),
                "barber_name_snapshot": ref_token.get("barber_name", "QA Barber"),
                "service_price": 500,
                "list_price": 500,
                "quantity": 1
            }],
            "date": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
            "created_at": datetime.now(timezone.utc).isoformat(),
            "booking_type": ref_token.get("booking_type", "queue"),
            "payment_mode": "cash",
            "payment_status": "unpaid",
            "branch_id": ref_token.get("branch_id"),
            "service_ids": ref_token.get("service_ids", []),
            "shift": ref_token.get("shift", "Morning"),  # Required field
            "source": ref_token.get("source", "walk_in")  # Required field
        }
    
    # Insert token
    result = tokens_col.insert_one(token_doc)
    print(f"✅ Test token created")
    print(f"   Token ID: {token_id}")
    print(f"   Token Number: 99999")
    print(f"   Customer: QA Complete Test")
    print(f"   Phone: {TEST_PHONE}")
    print(f"   Status: active")
    print(f"   Total Amount: 500")
    
    return token_id

def confirm_payment(token_id, bearer_token):
    """Confirm payment for the token"""
    print("\n" + "="*80)
    print("STEP 3: CONFIRM PAYMENT")
    print("="*80)
    
    url = f"{BASE_URL}/tokens/{token_id}/confirm-payment"
    headers = {"Authorization": f"Bearer {bearer_token}"}
    payload = {"payment_mode": "cash"}
    
    print(f"POST {url}")
    print(f"Payload: {payload}")
    
    response = requests.post(url, headers=headers, json=payload)
    print(f"Status: {response.status_code}")
    
    if response.status_code != 200:
        print(f"ERROR: Confirm payment failed")
        print(f"Response: {response.text}")
        return False
    
    data = response.json()
    print(f"✅ Payment confirmed successfully")
    print(f"   Response: {data}")
    
    return True

def complete_token(token_id, bearer_token):
    """Complete the token via POST /api/tokens/{token_id}/complete"""
    print("\n" + "="*80)
    print("STEP 4: COMPLETE TOKEN")
    print("="*80)
    
    url = f"{BASE_URL}/tokens/{token_id}/complete"
    headers = {"Authorization": f"Bearer {bearer_token}"}
    
    print(f"POST {url}")
    
    response = requests.post(url, headers=headers)
    print(f"Status: {response.status_code}")
    
    if response.status_code != 200:
        print(f"ERROR: Complete token failed")
        print(f"Response: {response.text}")
        return False
    
    data = response.json()
    print(f"✅ Token completed successfully")
    print(f"   Response: {data}")
    
    return True

def verify_whatsapp_log(mongo_client, salon_id):
    """Verify whatsapp_send_log for the booking_completed template"""
    print("\n" + "="*80)
    print("STEP 5: VERIFY WHATSAPP SEND LOG")
    print("="*80)
    
    db = mongo_client[DB_NAME]
    whatsapp_log_col = db["whatsapp_send_log"]
    
    # Query for recent logs for this phone/salon
    import time
    time.sleep(2)  # Wait for async notification to complete
    
    # Find logs for our test phone
    logs = list(whatsapp_log_col.find({
        "salon_id": salon_id,
        "to": {"$regex": "9999000022"}
    }).sort("created_at", -1).limit(5))
    
    print(f"Found {len(logs)} WhatsApp send log entries for test phone")
    
    # Check for booking_completed template
    booking_completed_found = False
    free_text_invoice_found = False
    
    for log in logs:
        template_name = log.get("template_name")
        status = log.get("status")
        created_at = log.get("created_at")
        
        print(f"\n   Log entry:")
        print(f"      template_name: {template_name}")
        print(f"      status: {status}")
        print(f"      created_at: {created_at}")
        print(f"      to: {log.get('to')}")
        
        if template_name == "booking_completed":
            booking_completed_found = True
            print(f"      ✅ FOUND booking_completed template entry")
        
        if template_name == "invoice_sent" or (not template_name and "invoice" in str(log.get("message", "")).lower()):
            free_text_invoice_found = True
            print(f"      ❌ FOUND free-text invoice entry (BUG NOT FIXED)")
    
    print("\n" + "-"*80)
    print("VERIFICATION RESULTS:")
    print("-"*80)
    
    if booking_completed_found:
        print("✅ PASS: booking_completed template entry found")
    else:
        print("❌ FAIL: booking_completed template entry NOT found")
    
    if free_text_invoice_found:
        print("❌ FAIL: Free-text invoice entry found (old buggy behavior)")
    else:
        print("✅ PASS: No free-text invoice entry (bug fixed)")
    
    return booking_completed_found and not free_text_invoice_found

def verify_invoice_created(mongo_client, token_id):
    """Verify that invoice was still created in db.invoices"""
    print("\n" + "="*80)
    print("STEP 6: VERIFY INVOICE CREATED")
    print("="*80)
    
    db = mongo_client[DB_NAME]
    invoices_col = db["invoices"]
    
    invoice = invoices_col.find_one({"token_id": token_id})
    
    if invoice:
        print(f"✅ Invoice created successfully")
        print(f"   Invoice ID: {invoice.get('id')}")
        print(f"   Token ID: {invoice.get('token_id')}")
        return True
    else:
        print(f"❌ Invoice NOT created")
        return False

def cleanup(mongo_client, token_id, salon_id):
    """Clean up test data"""
    print("\n" + "="*80)
    print("STEP 7: CLEANUP")
    print("="*80)
    
    db = mongo_client[DB_NAME]
    
    # Delete test token
    tokens_col = db["tokens"]
    result = tokens_col.delete_one({"id": token_id})
    print(f"Deleted {result.deleted_count} test token(s)")
    
    # Delete test invoice
    invoices_col = db["invoices"]
    result = invoices_col.delete_one({"token_id": token_id})
    print(f"Deleted {result.deleted_count} test invoice(s)")
    
    # Delete test whatsapp logs
    whatsapp_log_col = db["whatsapp_send_log"]
    result = whatsapp_log_col.delete_many({
        "salon_id": salon_id,
        "to": {"$regex": "9999000022"}
    })
    print(f"Deleted {result.deleted_count} test WhatsApp log(s)")
    
    print("✅ Cleanup completed")

def main():
    """Main test flow"""
    print("\n" + "="*80)
    print("WHATSAPP BOOKING COMPLETED TEMPLATE BUG FIX VERIFICATION")
    print("="*80)
    print(f"Salon: {SALON_ID}")
    print(f"Test Phone: {TEST_PHONE}")
    print(f"Expected Template: booking_completed (SID: HXa417403d8b7ff32ce17fcadc6fe1c19a)")
    
    mongo_client = None
    token_id = None
    
    try:
        # Connect to MongoDB
        mongo_client = get_mongo_client()
        print("✅ MongoDB connected")
        
        # Step 1: Login
        bearer_token, salon_id = login_admin()
        
        # Step 2: Create test token
        token_id = create_test_token(mongo_client, salon_id, bearer_token)
        
        # Step 3: Confirm payment
        success = confirm_payment(token_id, bearer_token)
        if not success:
            print("\n❌ TEST FAILED: Payment confirmation failed")
            return False
        
        # Step 4: Complete token
        success = complete_token(token_id, bearer_token)
        if not success:
            print("\n❌ TEST FAILED: Token completion failed")
            return False
        
        # Step 5: Verify WhatsApp log
        log_verified = verify_whatsapp_log(mongo_client, salon_id)
        
        # Step 6: Verify invoice created
        invoice_verified = verify_invoice_created(mongo_client, token_id)
        
        # Final result
        print("\n" + "="*80)
        print("FINAL TEST RESULT")
        print("="*80)
        
        if log_verified and invoice_verified:
            print("✅ ALL TESTS PASSED")
            print("   - booking_completed template is being used (NOT free-text)")
            print("   - Invoice was generated successfully")
            print("   - Bug fix is working correctly")
            return True
        else:
            print("❌ TESTS FAILED")
            if not log_verified:
                print("   - WhatsApp log verification failed")
            if not invoice_verified:
                print("   - Invoice creation failed")
            return False
        
    except Exception as e:
        print(f"\n❌ ERROR: {e}")
        import traceback
        traceback.print_exc()
        return False
    
    finally:
        # Step 7: Cleanup
        if mongo_client and token_id:
            try:
                cleanup(mongo_client, token_id, SALON_ID)
            except Exception as e:
                print(f"Cleanup error: {e}")
        
        if mongo_client:
            mongo_client.close()

if __name__ == "__main__":
    success = main()
    sys.exit(0 if success else 1)
