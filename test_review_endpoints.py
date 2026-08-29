#!/usr/bin/env python3
"""
Backend Test Suite for SalonHub Public Review Endpoints
Test the new PUBLIC review endpoints (no auth required):
1. GET /api/reviews/booking/{token_id}
2. POST /api/reviews/submit
3. Regression: GET /api/salons/{salon_id}/ratings
"""

import asyncio
import httpx
import os
import sys
from datetime import datetime
from pymongo import MongoClient

# Backend URL from environment
BACKEND_URL = os.getenv("REACT_APP_BACKEND_URL", "http://localhost:8001").rstrip("/")
API_BASE = f"{BACKEND_URL}/api"

# MongoDB connection
MONGO_URL = os.getenv("MONGO_URL", "mongodb://localhost:27017")
mongo_client = MongoClient(MONGO_URL)
db = mongo_client["salonhub"]

# Test state
test_state = {
    "completed_token_id": None,
    "completed_token_salon_id": None,
    "pending_token_id": None,
    "rated_token_id": None,
    "test_rating_id": None,
}

# Test results
test_results = {
    "total": 0,
    "passed": 0,
    "failed": 0,
    "tests": []
}


def log_test(name, passed, details=""):
    """Log test result"""
    test_results["total"] += 1
    if passed:
        test_results["passed"] += 1
        status = "✅ PASS"
    else:
        test_results["failed"] += 1
        status = "❌ FAIL"
    
    result = f"{status} - {name}"
    if details:
        result += f"\n    {details}"
    
    print(result)
    test_results["tests"].append({"name": name, "passed": passed, "details": details})


def print_summary():
    """Print test summary"""
    print("\n" + "="*80)
    print("TEST SUMMARY")
    print("="*80)
    print(f"Total Tests: {test_results['total']}")
    print(f"Passed: {test_results['passed']} ✅")
    print(f"Failed: {test_results['failed']} ❌")
    print(f"Success Rate: {(test_results['passed']/test_results['total']*100):.1f}%")
    print("="*80)


async def setup_test_data():
    """Find test tokens from MongoDB"""
    print("\n" + "="*80)
    print("SETUP: Finding test tokens from MongoDB")
    print("="*80)
    
    # Find a completed token that hasn't been rated yet
    completed_token = db.tokens.find_one(
        {"status": "completed"},
        {"id": 1, "salon_id": 1, "token_number": 1, "customer_name": 1, "_id": 0}
    )
    
    if not completed_token:
        print("❌ ERROR: No completed tokens found in database")
        sys.exit(1)
    
    # Check if this token has been rated
    existing_rating = db.ratings.find_one({"token_id": completed_token["id"]})
    
    if existing_rating:
        # Find another completed token without rating
        all_completed = list(db.tokens.find(
            {"status": "completed"},
            {"id": 1, "salon_id": 1, "token_number": 1, "_id": 0}
        ).limit(10))
        
        for token in all_completed:
            if not db.ratings.find_one({"token_id": token["id"]}):
                completed_token = token
                break
    
    test_state["completed_token_id"] = completed_token["id"]
    test_state["completed_token_salon_id"] = completed_token["salon_id"]
    
    print(f"✅ Found completed token: {completed_token['id']}")
    print(f"   Token number: {completed_token.get('token_number', 'N/A')}")
    print(f"   Salon ID: {completed_token['salon_id']}")
    print(f"   Customer: {completed_token.get('customer_name', 'N/A')}")
    
    # Find a non-completed token for negative testing
    pending_token = db.tokens.find_one(
        {"status": {"$ne": "completed"}},
        {"id": 1, "status": 1, "_id": 0}
    )
    
    if pending_token:
        test_state["pending_token_id"] = pending_token["id"]
        print(f"✅ Found non-completed token: {pending_token['id']} (status: {pending_token['status']})")
    else:
        print("⚠️  WARNING: No non-completed tokens found for negative testing")


async def test_get_review_booking_success():
    """Test 1a: GET /api/reviews/booking/{token_id} with valid completed token"""
    print("\n" + "-"*80)
    print("TEST 1a: GET /api/reviews/booking/{token_id} - Valid completed token")
    print("-"*80)
    
    token_id = test_state["completed_token_id"]
    url = f"{API_BASE}/reviews/booking/{token_id}"
    
    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            response = await client.get(url)
            
            # Check status code
            if response.status_code != 200:
                log_test("GET /reviews/booking/{token_id} - Status 200", False, 
                        f"Expected 200, got {response.status_code}")
                return
            
            log_test("GET /reviews/booking/{token_id} - Status 200", True)
            
            # Check response structure
            data = response.json()
            
            # Required fields
            required_fields = ["salon_name", "services", "is_completed", "already_rated", "customer_name"]
            missing_fields = [f for f in required_fields if f not in data]
            
            if missing_fields:
                log_test("Response contains required fields", False, 
                        f"Missing fields: {missing_fields}")
            else:
                log_test("Response contains required fields", True, 
                        f"All required fields present: {required_fields}")
            
            # Verify field types and values
            if not isinstance(data.get("salon_name"), str):
                log_test("salon_name is string", False, f"Got type: {type(data.get('salon_name'))}")
            else:
                log_test("salon_name is string", True, f"Value: '{data['salon_name']}'")
            
            if not isinstance(data.get("services"), list):
                log_test("services is list", False, f"Got type: {type(data.get('services'))}")
            else:
                log_test("services is list", True, f"Count: {len(data['services'])}")
            
            if data.get("is_completed") != True:
                log_test("is_completed is true", False, f"Got: {data.get('is_completed')}")
            else:
                log_test("is_completed is true", True)
            
            if not isinstance(data.get("already_rated"), bool):
                log_test("already_rated is boolean", False, f"Got type: {type(data.get('already_rated'))}")
            else:
                log_test("already_rated is boolean", True, f"Value: {data['already_rated']}")
            
            if not isinstance(data.get("customer_name"), str):
                log_test("customer_name is string", False, f"Got type: {type(data.get('customer_name'))}")
            else:
                log_test("customer_name is string", True, f"Value: '{data['customer_name']}'")
            
            print(f"\n📋 Full response: {data}")
            
        except Exception as e:
            log_test("GET /reviews/booking/{token_id} - Request", False, f"Exception: {str(e)}")


async def test_get_review_booking_not_found():
    """Test 1b: GET /api/reviews/booking/{token_id} with unknown token_id"""
    print("\n" + "-"*80)
    print("TEST 1b: GET /api/reviews/booking/{token_id} - Unknown token_id")
    print("-"*80)
    
    unknown_token_id = "does-not-exist-123"
    url = f"{API_BASE}/reviews/booking/{unknown_token_id}"
    
    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            response = await client.get(url)
            
            if response.status_code != 404:
                log_test("GET /reviews/booking/{unknown_token} - Status 404", False, 
                        f"Expected 404, got {response.status_code}")
            else:
                log_test("GET /reviews/booking/{unknown_token} - Status 404", True, 
                        f"Correctly returns 404 for unknown token")
            
        except Exception as e:
            log_test("GET /reviews/booking/{unknown_token} - Request", False, f"Exception: {str(e)}")


async def test_submit_review_success():
    """Test 2a: POST /api/reviews/submit with valid completed token"""
    print("\n" + "-"*80)
    print("TEST 2a: POST /api/reviews/submit - Valid completed token (first submission)")
    print("-"*80)
    
    token_id = test_state["completed_token_id"]
    url = f"{API_BASE}/reviews/submit"
    
    payload = {
        "token_id": token_id,
        "rating": 5,
        "review": "Great service, loved it"
    }
    
    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            response = await client.post(url, json=payload)
            
            # Check status code
            if response.status_code != 200:
                log_test("POST /reviews/submit - Status 200", False, 
                        f"Expected 200, got {response.status_code}. Response: {response.text}")
                return
            
            log_test("POST /reviews/submit - Status 200", True)
            
            # Check response structure
            data = response.json()
            
            if not data.get("success"):
                log_test("Response success is true", False, f"Got: {data.get('success')}")
            else:
                log_test("Response success is true", True)
            
            if "id" not in data:
                log_test("Response contains rating id", False, "Missing 'id' field")
            else:
                log_test("Response contains rating id", True, f"Rating ID: {data['id']}")
                test_state["test_rating_id"] = data["id"]
            
            print(f"\n📋 Response: {data}")
            
            # Verify in MongoDB
            rating_doc = db.ratings.find_one({"token_id": token_id}, {"_id": 0})
            
            if not rating_doc:
                log_test("Rating persisted in db.ratings", False, "No rating found in database")
            else:
                log_test("Rating persisted in db.ratings", True, 
                        f"Found rating with ID: {rating_doc.get('id')}")
            
            # Verify source field
            if rating_doc and rating_doc.get("source") != "salonhub":
                log_test("Rating source is 'salonhub'", False, f"Got: {rating_doc.get('source')}")
            elif rating_doc:
                log_test("Rating source is 'salonhub'", True)
            
            # Verify salon_id is set
            if rating_doc and not rating_doc.get("salon_id"):
                log_test("Rating has salon_id set", False, "salon_id is missing or empty")
            elif rating_doc:
                log_test("Rating has salon_id set", True, f"salon_id: {rating_doc.get('salon_id')}")
            
            # Mark this token as rated for next test
            test_state["rated_token_id"] = token_id
            
        except Exception as e:
            log_test("POST /reviews/submit - Request", False, f"Exception: {str(e)}")


async def test_submit_review_already_reviewed():
    """Test 2b: POST /api/reviews/submit with already reviewed token"""
    print("\n" + "-"*80)
    print("TEST 2b: POST /api/reviews/submit - Already reviewed token")
    print("-"*80)
    
    token_id = test_state["rated_token_id"]
    
    if not token_id:
        log_test("POST /reviews/submit - Already reviewed", False, 
                "Skipped: No rated token available from previous test")
        return
    
    url = f"{API_BASE}/reviews/submit"
    
    payload = {
        "token_id": token_id,
        "rating": 4,
        "review": "Second review attempt"
    }
    
    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            response = await client.post(url, json=payload)
            
            if response.status_code != 400:
                log_test("POST /reviews/submit - Already reviewed returns 400", False, 
                        f"Expected 400, got {response.status_code}")
            else:
                log_test("POST /reviews/submit - Already reviewed returns 400", True, 
                        "Correctly rejects duplicate review with 400")
            
        except Exception as e:
            log_test("POST /reviews/submit - Already reviewed", False, f"Exception: {str(e)}")


async def test_submit_review_unknown_token():
    """Test 2c: POST /api/reviews/submit with unknown token_id"""
    print("\n" + "-"*80)
    print("TEST 2c: POST /api/reviews/submit - Unknown token_id")
    print("-"*80)
    
    url = f"{API_BASE}/reviews/submit"
    
    payload = {
        "token_id": "unknown-token-xyz-123",
        "rating": 5,
        "review": "Test review"
    }
    
    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            response = await client.post(url, json=payload)
            
            if response.status_code != 404:
                log_test("POST /reviews/submit - Unknown token returns 404", False, 
                        f"Expected 404, got {response.status_code}")
            else:
                log_test("POST /reviews/submit - Unknown token returns 404", True)
            
        except Exception as e:
            log_test("POST /reviews/submit - Unknown token", False, f"Exception: {str(e)}")


async def test_submit_review_not_completed():
    """Test 2d: POST /api/reviews/submit with non-completed token"""
    print("\n" + "-"*80)
    print("TEST 2d: POST /api/reviews/submit - Non-completed token")
    print("-"*80)
    
    token_id = test_state["pending_token_id"]
    
    if not token_id:
        log_test("POST /reviews/submit - Non-completed token", False, 
                "Skipped: No pending token available")
        return
    
    url = f"{API_BASE}/reviews/submit"
    
    payload = {
        "token_id": token_id,
        "rating": 5,
        "review": "Test review"
    }
    
    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            response = await client.post(url, json=payload)
            
            if response.status_code != 400:
                log_test("POST /reviews/submit - Non-completed returns 400", False, 
                        f"Expected 400, got {response.status_code}")
            else:
                log_test("POST /reviews/submit - Non-completed returns 400", True, 
                        "Correctly rejects non-completed booking with 400")
            
        except Exception as e:
            log_test("POST /reviews/submit - Non-completed", False, f"Exception: {str(e)}")


async def test_submit_review_validation():
    """Test 2e: POST /api/reviews/submit with invalid rating values"""
    print("\n" + "-"*80)
    print("TEST 2e: POST /api/reviews/submit - Validation (rating out of range)")
    print("-"*80)
    
    url = f"{API_BASE}/reviews/submit"
    
    # Test rating = 0 (below minimum)
    payload_zero = {
        "token_id": "any-token",
        "rating": 0,
        "review": "Test"
    }
    
    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            response = await client.post(url, json=payload_zero)
            
            if response.status_code not in [400, 422]:
                log_test("POST /reviews/submit - Rating 0 rejected", False, 
                        f"Expected 400/422, got {response.status_code}")
            else:
                log_test("POST /reviews/submit - Rating 0 rejected", True, 
                        f"Correctly rejects rating=0 with {response.status_code}")
            
        except Exception as e:
            log_test("POST /reviews/submit - Rating 0 validation", False, f"Exception: {str(e)}")
    
    # Test rating = 6 (above maximum)
    payload_six = {
        "token_id": "any-token",
        "rating": 6,
        "review": "Test"
    }
    
    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            response = await client.post(url, json=payload_six)
            
            if response.status_code not in [400, 422]:
                log_test("POST /reviews/submit - Rating 6 rejected", False, 
                        f"Expected 400/422, got {response.status_code}")
            else:
                log_test("POST /reviews/submit - Rating 6 rejected", True, 
                        f"Correctly rejects rating=6 with {response.status_code}")
            
        except Exception as e:
            log_test("POST /reviews/submit - Rating 6 validation", False, f"Exception: {str(e)}")


async def test_get_salon_ratings_regression():
    """Test 3: Regression - GET /api/salons/{salon_id}/ratings"""
    print("\n" + "-"*80)
    print("TEST 3: REGRESSION - GET /api/salons/{salon_id}/ratings")
    print("-"*80)
    
    salon_id = test_state["completed_token_salon_id"]
    url = f"{API_BASE}/salons/{salon_id}/ratings"
    
    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            response = await client.get(url)
            
            # Check status code
            if response.status_code != 200:
                log_test("GET /salons/{salon_id}/ratings - Status 200", False, 
                        f"Expected 200, got {response.status_code}")
                return
            
            log_test("GET /salons/{salon_id}/ratings - Status 200", True)
            
            # Check response structure
            data = response.json()
            
            # Required fields
            required_fields = ["average_rating", "total_reviews", "reviews"]
            missing_fields = [f for f in required_fields if f not in data]
            
            if missing_fields:
                log_test("Response contains required fields", False, 
                        f"Missing fields: {missing_fields}")
            else:
                log_test("Response contains required fields", True, 
                        f"All required fields present: {required_fields}")
            
            # Verify field types
            if not isinstance(data.get("average_rating"), (int, float)):
                log_test("average_rating is numeric", False, f"Got type: {type(data.get('average_rating'))}")
            else:
                log_test("average_rating is numeric", True, f"Value: {data['average_rating']}")
            
            if not isinstance(data.get("total_reviews"), int):
                log_test("total_reviews is integer", False, f"Got type: {type(data.get('total_reviews'))}")
            else:
                log_test("total_reviews is integer", True, f"Value: {data['total_reviews']}")
            
            if not isinstance(data.get("reviews"), list):
                log_test("reviews is array", False, f"Got type: {type(data.get('reviews'))}")
            else:
                log_test("reviews is array", True, f"Count: {len(data['reviews'])}")
            
            print(f"\n📋 Salon ratings summary:")
            print(f"   Average rating: {data.get('average_rating')}")
            print(f"   Total reviews: {data.get('total_reviews')}")
            print(f"   Reviews count: {len(data.get('reviews', []))}")
            
        except Exception as e:
            log_test("GET /salons/{salon_id}/ratings - Request", False, f"Exception: {str(e)}")


async def cleanup_test_data():
    """Clean up test data created during tests"""
    print("\n" + "="*80)
    print("CLEANUP: Removing test data")
    print("="*80)
    
    if test_state["test_rating_id"]:
        result = db.ratings.delete_one({"id": test_state["test_rating_id"]})
        if result.deleted_count > 0:
            print(f"✅ Deleted test rating: {test_state['test_rating_id']}")
        else:
            print(f"⚠️  Test rating not found: {test_state['test_rating_id']}")


async def main():
    """Run all tests"""
    print("\n" + "="*80)
    print("SALONHUB PUBLIC REVIEW ENDPOINTS TEST SUITE")
    print("="*80)
    print(f"Backend URL: {BACKEND_URL}")
    print(f"API Base: {API_BASE}")
    print(f"MongoDB: {MONGO_URL}")
    
    try:
        # Setup
        await setup_test_data()
        
        # Test 1: GET /api/reviews/booking/{token_id}
        await test_get_review_booking_success()
        await test_get_review_booking_not_found()
        
        # Test 2: POST /api/reviews/submit
        await test_submit_review_success()
        await test_submit_review_already_reviewed()
        await test_submit_review_unknown_token()
        await test_submit_review_not_completed()
        await test_submit_review_validation()
        
        # Test 3: Regression - GET /api/salons/{salon_id}/ratings
        await test_get_salon_ratings_regression()
        
        # Cleanup
        await cleanup_test_data()
        
        # Summary
        print_summary()
        
        # Exit with appropriate code
        if test_results["failed"] > 0:
            sys.exit(1)
        else:
            sys.exit(0)
            
    except Exception as e:
        print(f"\n❌ FATAL ERROR: {str(e)}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
