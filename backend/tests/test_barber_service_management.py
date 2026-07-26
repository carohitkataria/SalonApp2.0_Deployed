"""
Backend API Tests for Barber Management and Service Management
Tests: Barber CRUD, Service CRUD, Barber-Service Assignment with pricing
"""
import pytest
import requests
import os
from datetime import datetime

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
API = f"{BASE_URL}/api"

# Test data
TEST_OTP = "123456"  # Hardcoded OTP for testing
SALON_PHONE = "7503070727"


class TestAuthSetup:
    """Get auth token for protected endpoints"""
    
    @pytest.fixture(scope="class")
    def auth_headers(self):
        """Get authenticated headers for salon"""
        # Send OTP
        requests.post(f"{API}/salon/send-otp", json={"phone": SALON_PHONE})
        
        # Verify OTP
        response = requests.post(f"{API}/salon/verify-otp", json={
            "phone": SALON_PHONE,
            "otp": TEST_OTP
        })
        
        if response.status_code != 200:
            pytest.skip("Could not authenticate salon")
        
        data = response.json()
        return {
            "Authorization": f"Bearer {data['access_token']}",
            "salon_id": data["salon_id"]
        }


class TestServiceManagement(TestAuthSetup):
    """Service CRUD tests"""
    
    def test_get_all_services(self):
        """Test getting all services"""
        response = requests.get(f"{API}/services")
        assert response.status_code == 200
        
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Found {len(data)} services")
        
        if len(data) > 0:
            service = data[0]
            assert "id" in service
            assert "service_name" in service
            assert "base_price" in service
            assert "default_duration" in service
            print(f"  Sample service: {service['service_name']} - Rs.{service['base_price']}")
        return data
    
    def test_create_service(self, auth_headers):
        """Test creating a new service"""
        payload = {
            "service_name": f"TEST_Service_{datetime.now().strftime('%H%M%S')}",
            "description": "Test service description",
            "default_duration": 45,
            "base_price": 250
        }
        
        response = requests.post(
            f"{API}/services",
            json=payload,
            headers={"Authorization": auth_headers["Authorization"]}
        )
        
        assert response.status_code == 200
        data = response.json()
        
        assert data["service_name"] == payload["service_name"]
        assert data["description"] == payload["description"]
        assert data["default_duration"] == payload["default_duration"]
        assert data["base_price"] == payload["base_price"]
        assert "id" in data
        
        print(f"✓ Service created: {data['service_name']} (ID: {data['id']})")
        return data
    
    def test_update_service(self, auth_headers):
        """Test updating a service"""
        # First create a service
        create_payload = {
            "service_name": f"TEST_Update_{datetime.now().strftime('%H%M%S')}",
            "description": "Original description",
            "default_duration": 30,
            "base_price": 100
        }
        
        create_response = requests.post(
            f"{API}/services",
            json=create_payload,
            headers={"Authorization": auth_headers["Authorization"]}
        )
        assert create_response.status_code == 200
        service_id = create_response.json()["id"]
        
        # Update the service
        update_payload = {
            "service_name": f"TEST_Updated_{datetime.now().strftime('%H%M%S')}",
            "description": "Updated description",
            "default_duration": 60,
            "base_price": 200
        }
        
        update_response = requests.put(
            f"{API}/services/{service_id}",
            json=update_payload,
            headers={"Authorization": auth_headers["Authorization"]}
        )
        
        assert update_response.status_code == 200
        data = update_response.json()
        
        assert data["service_name"] == update_payload["service_name"]
        assert data["description"] == update_payload["description"]
        assert data["default_duration"] == update_payload["default_duration"]
        assert data["base_price"] == update_payload["base_price"]
        
        print(f"✓ Service updated: {data['service_name']}")
        return data
    
    def test_delete_service(self, auth_headers):
        """Test deleting a service"""
        # First create a service to delete
        create_payload = {
            "service_name": f"TEST_Delete_{datetime.now().strftime('%H%M%S')}",
            "description": "To be deleted",
            "default_duration": 30,
            "base_price": 100
        }
        
        create_response = requests.post(
            f"{API}/services",
            json=create_payload,
            headers={"Authorization": auth_headers["Authorization"]}
        )
        assert create_response.status_code == 200
        service_id = create_response.json()["id"]
        
        # Delete the service
        delete_response = requests.delete(
            f"{API}/services/{service_id}",
            headers={"Authorization": auth_headers["Authorization"]}
        )
        
        assert delete_response.status_code == 200
        data = delete_response.json()
        assert "message" in data
        
        # Verify service is no longer in active list
        services = requests.get(f"{API}/services").json()
        service_ids = [s["id"] for s in services]
        assert service_id not in service_ids
        
        print("✓ Service deleted successfully")
    
    def test_create_service_without_auth_fails(self):
        """Test that creating service without auth fails"""
        payload = {
            "service_name": "Unauthorized Service",
            "description": "Should fail",
            "default_duration": 30,
            "base_price": 100
        }
        
        response = requests.post(f"{API}/services", json=payload)
        assert response.status_code in [401, 403]
        print("✓ Unauthorized service creation correctly rejected")


class TestBarberManagement(TestAuthSetup):
    """Barber CRUD tests"""
    
    def test_get_salon_barbers(self, auth_headers):
        """Test getting barbers for a salon"""
        salon_id = auth_headers["salon_id"]
        
        response = requests.get(f"{API}/salons/{salon_id}/barbers")
        assert response.status_code == 200
        
        data = response.json()
        assert isinstance(data, list)
        print(f"✓ Found {len(data)} barbers for salon")
        
        if len(data) > 0:
            barber = data[0]
            assert "id" in barber
            assert "name" in barber
            assert "category" in barber
            assert "experience" in barber
            assert "mobile" in barber
            print(f"  Sample barber: {barber['name']} ({barber['category']}, {barber['experience']} yrs)")
        return data
    
    def test_create_barber(self, auth_headers):
        """Test creating a new barber"""
        salon_id = auth_headers["salon_id"]
        
        payload = {
            "name": f"TEST_Barber_{datetime.now().strftime('%H%M%S')}",
            "salon_id": salon_id,
            "experience": 5,
            "category": "star",
            "mobile": "9876500001"
        }
        
        response = requests.post(
            f"{API}/salons/{salon_id}/barbers",
            json=payload,
            headers={"Authorization": auth_headers["Authorization"]}
        )
        
        assert response.status_code == 200
        data = response.json()
        
        assert data["name"] == payload["name"]
        assert data["experience"] == payload["experience"]
        assert data["category"] == payload["category"]
        assert data["mobile"] == payload["mobile"]
        assert data["salon_id"] == salon_id
        assert "id" in data
        
        print(f"✓ Barber created: {data['name']} (ID: {data['id']})")
        return data
    
    def test_update_barber(self, auth_headers):
        """Test updating a barber"""
        salon_id = auth_headers["salon_id"]
        
        # First create a barber
        create_payload = {
            "name": f"TEST_UpdateBarber_{datetime.now().strftime('%H%M%S')}",
            "salon_id": salon_id,
            "experience": 3,
            "category": "normal",
            "mobile": "9876500002"
        }
        
        create_response = requests.post(
            f"{API}/salons/{salon_id}/barbers",
            json=create_payload,
            headers={"Authorization": auth_headers["Authorization"]}
        )
        assert create_response.status_code == 200
        barber_id = create_response.json()["id"]
        
        # Update the barber
        update_payload = {
            "name": f"TEST_UpdatedBarber_{datetime.now().strftime('%H%M%S')}",
            "experience": 7,
            "category": "master",
            "mobile": "9876500003"
        }
        
        update_response = requests.put(
            f"{API}/barbers/{barber_id}",
            json=update_payload,
            headers={"Authorization": auth_headers["Authorization"]}
        )
        
        assert update_response.status_code == 200
        data = update_response.json()
        
        assert data["name"] == update_payload["name"]
        assert data["experience"] == update_payload["experience"]
        assert data["category"] == update_payload["category"]
        assert data["mobile"] == update_payload["mobile"]
        
        print(f"✓ Barber updated: {data['name']} (now {data['category']})")
        return data
    
    def test_delete_barber(self, auth_headers):
        """Test deleting a barber"""
        salon_id = auth_headers["salon_id"]
        
        # First create a barber to delete
        create_payload = {
            "name": f"TEST_DeleteBarber_{datetime.now().strftime('%H%M%S')}",
            "salon_id": salon_id,
            "experience": 1,
            "category": "normal",
            "mobile": "9876500004"
        }
        
        create_response = requests.post(
            f"{API}/salons/{salon_id}/barbers",
            json=create_payload,
            headers={"Authorization": auth_headers["Authorization"]}
        )
        assert create_response.status_code == 200
        barber_id = create_response.json()["id"]
        
        # Delete the barber
        delete_response = requests.delete(
            f"{API}/barbers/{barber_id}",
            headers={"Authorization": auth_headers["Authorization"]}
        )
        
        assert delete_response.status_code == 200
        data = delete_response.json()
        assert "message" in data
        
        # Verify barber is no longer in active list
        barbers = requests.get(f"{API}/salons/{salon_id}/barbers").json()
        barber_ids = [b["id"] for b in barbers]
        assert barber_id not in barber_ids
        
        print("✓ Barber deleted successfully")
    
    def test_create_barber_without_auth_fails(self, auth_headers):
        """Test that creating barber without auth fails"""
        salon_id = auth_headers["salon_id"]
        
        payload = {
            "name": "Unauthorized Barber",
            "salon_id": salon_id,
            "experience": 1,
            "category": "normal",
            "mobile": "9876500005"
        }
        
        response = requests.post(f"{API}/salons/{salon_id}/barbers", json=payload)
        assert response.status_code in [401, 403]
        print("✓ Unauthorized barber creation correctly rejected")


class TestBarberServiceAssignment(TestAuthSetup):
    """Barber-Service assignment and pricing tests"""
    
    def test_get_barber_services(self, auth_headers):
        """Test getting services with barber-specific pricing"""
        salon_id = auth_headers["salon_id"]
        
        # Get barbers
        barbers = requests.get(f"{API}/salons/{salon_id}/barbers").json()
        if not barbers:
            pytest.skip("No barbers available for testing")
        
        barber_id = barbers[0]["id"]
        
        response = requests.get(f"{API}/barbers/{barber_id}/services")
        assert response.status_code == 200
        
        data = response.json()
        assert isinstance(data, list)
        
        if len(data) > 0:
            service = data[0]
            assert "id" in service
            assert "service_name" in service
            assert "base_price" in service
            assert "barber_price" in service
            assert "is_available" in service
            print(f"✓ Barber services: {len(data)} services with pricing")
            print(f"  Sample: {service['service_name']} - Base: Rs.{service['base_price']}, Barber: Rs.{service['barber_price']}")
        return data
    
    def test_bulk_update_barber_services(self, auth_headers):
        """Test bulk updating barber services with pricing"""
        salon_id = auth_headers["salon_id"]
        
        # Get barbers
        barbers = requests.get(f"{API}/salons/{salon_id}/barbers").json()
        if not barbers:
            pytest.skip("No barbers available for testing")
        
        barber_id = barbers[0]["id"]
        
        # Get services
        services = requests.get(f"{API}/services").json()
        if not services:
            pytest.skip("No services available for testing")
        
        # Create service assignments with custom pricing
        service_assignments = []
        for i, service in enumerate(services[:3]):  # Test with first 3 services
            service_assignments.append({
                "service_id": service["id"],
                "price": service["base_price"] + (i * 50),  # Custom pricing
                "is_available": True
            })
        
        # Add one disabled service
        if len(services) > 3:
            service_assignments.append({
                "service_id": services[3]["id"],
                "price": services[3]["base_price"],
                "is_available": False
            })
        
        response = requests.put(
            f"{API}/barbers/{barber_id}/services",
            json=service_assignments,
            headers={"Authorization": auth_headers["Authorization"]}
        )
        
        assert response.status_code == 200
        data = response.json()
        assert "message" in data
        
        # Verify the update
        updated_services = requests.get(f"{API}/barbers/{barber_id}/services").json()
        
        # Check that enabled services have correct pricing
        for assignment in service_assignments:
            if assignment["is_available"]:
                matching = [s for s in updated_services if s["id"] == assignment["service_id"]]
                if matching:
                    assert matching[0]["barber_price"] == assignment["price"]
                    assert matching[0]["is_available"] == True
        
        print(f"✓ Bulk service assignment updated: {len([a for a in service_assignments if a['is_available']])} services enabled")
        return data
    
    def test_update_single_service_price(self, auth_headers):
        """Test updating price for a single service"""
        salon_id = auth_headers["salon_id"]
        
        # Get barbers
        barbers = requests.get(f"{API}/salons/{salon_id}/barbers").json()
        if not barbers:
            pytest.skip("No barbers available for testing")
        
        barber_id = barbers[0]["id"]
        
        # Get services
        services = requests.get(f"{API}/services").json()
        if not services:
            pytest.skip("No services available for testing")
        
        service_id = services[0]["id"]
        new_price = 999.0
        
        response = requests.put(
            f"{API}/barbers/{barber_id}/services/{service_id}/price?price={new_price}",
            headers={"Authorization": auth_headers["Authorization"]}
        )
        
        assert response.status_code == 200
        data = response.json()
        assert "message" in data
        
        # Verify the price update
        barber_services = requests.get(f"{API}/barbers/{barber_id}/services").json()
        matching = [s for s in barber_services if s["id"] == service_id]
        if matching:
            assert matching[0]["barber_price"] == new_price
        
        print(f"✓ Single service price updated to Rs.{new_price}")


class TestBarberServiceIntegration(TestAuthSetup):
    """Integration tests for barber-service workflow"""
    
    def test_full_barber_service_workflow(self, auth_headers):
        """Test complete workflow: Create barber -> Assign services -> Update pricing"""
        salon_id = auth_headers["salon_id"]
        
        # Step 1: Create a new barber
        barber_payload = {
            "name": f"TEST_Workflow_{datetime.now().strftime('%H%M%S')}",
            "salon_id": salon_id,
            "experience": 4,
            "category": "star",
            "mobile": "9876500010"
        }
        
        barber_response = requests.post(
            f"{API}/salons/{salon_id}/barbers",
            json=barber_payload,
            headers={"Authorization": auth_headers["Authorization"]}
        )
        assert barber_response.status_code == 200
        barber = barber_response.json()
        barber_id = barber["id"]
        print(f"  Step 1: Created barber {barber['name']}")
        
        # Step 2: Get available services
        services = requests.get(f"{API}/services").json()
        assert len(services) > 0
        print(f"  Step 2: Found {len(services)} services")
        
        # Step 3: Assign services with custom pricing
        service_assignments = [
            {
                "service_id": services[0]["id"],
                "price": 300,
                "is_available": True
            },
            {
                "service_id": services[1]["id"] if len(services) > 1 else services[0]["id"],
                "price": 450,
                "is_available": True
            }
        ]
        
        assign_response = requests.put(
            f"{API}/barbers/{barber_id}/services",
            json=service_assignments,
            headers={"Authorization": auth_headers["Authorization"]}
        )
        assert assign_response.status_code == 200
        print(f"  Step 3: Assigned {len(service_assignments)} services")
        
        # Step 4: Verify services are assigned
        barber_services = requests.get(f"{API}/barbers/{barber_id}/services").json()
        enabled_services = [s for s in barber_services if s["is_available"]]
        assert len(enabled_services) >= 2
        print(f"  Step 4: Verified {len(enabled_services)} services enabled")
        
        # Step 5: Update barber details
        update_response = requests.put(
            f"{API}/barbers/{barber_id}",
            json={"category": "master", "experience": 10},
            headers={"Authorization": auth_headers["Authorization"]}
        )
        assert update_response.status_code == 200
        updated_barber = update_response.json()
        assert updated_barber["category"] == "master"
        print("  Step 5: Updated barber to master category")
        
        # Step 6: Clean up - delete the test barber
        delete_response = requests.delete(
            f"{API}/barbers/{barber_id}",
            headers={"Authorization": auth_headers["Authorization"]}
        )
        assert delete_response.status_code == 200
        print("  Step 6: Cleaned up test barber")
        
        print("✓ Full barber-service workflow completed successfully")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
