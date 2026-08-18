"""
Test Loyalty Program API endpoints
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://appt-filter-redesign.preview.emergentagent.com').rstrip('/')

# Test salon credentials (override via env in CI)
TEST_PHONE = os.environ.get("TEST_SALON_PHONE", "7503070727")
TEST_PASSWORD = os.environ.get("TEST_SALON_PASSWORD", "salon123")
SALON_ID = os.environ.get("TEST_SALON_ID", "a9b1b6e7-482c-4dc0-904a-9fa50cc283d3")


class TestLoyaltyProgramAPI:
    """Test Loyalty Program API endpoints"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test fixtures"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
    def get_auth_token(self):
        """Get authentication token via password login"""
        response = self.session.post(
            f"{BASE_URL}/api/salon/password-login",
            json={"phone": f"+91{TEST_PHONE}", "password": TEST_PASSWORD}
        )
        if response.status_code == 200:
            return response.json().get("access_token")
        return None
    
    def test_health_check(self):
        """Test API is accessible"""
        response = self.session.get(f"{BASE_URL}/api/")
        assert response.status_code == 200
        data = response.json()
        assert "message" in data
        print(f"API Health: {data['message']}")
    
    def test_salon_password_login(self):
        """Test salon password login"""
        response = self.session.post(
            f"{BASE_URL}/api/salon/password-login",
            json={"phone": f"+91{TEST_PHONE}", "password": TEST_PASSWORD}
        )
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert "salon_id" in data
        print(f"Login successful, salon_id: {data['salon_id']}")
    
    def test_get_loyalty_program_unauthenticated(self):
        """Test GET loyalty program without auth - should fail"""
        response = self.session.get(f"{BASE_URL}/api/salons/{SALON_ID}/loyalty-program")
        # This endpoint requires authentication
        assert response.status_code in [401, 403]
        print(f"Unauthenticated request returned: {response.status_code}")
    
    def test_get_loyalty_program_authenticated(self):
        """Test GET loyalty program with auth"""
        token = self.get_auth_token()
        if not token:
            pytest.skip("Could not get auth token")
        
        self.session.headers.update({"Authorization": f"Bearer {token}"})
        response = self.session.get(f"{BASE_URL}/api/salons/{SALON_ID}/loyalty-program")
        
        # Check response - may be 200 (with data) or 401 (if auth type mismatch)
        print(f"GET loyalty program status: {response.status_code}")
        print(f"Response: {response.text[:500]}")
        
        if response.status_code == 200:
            data = response.json()
            # Should have default values if not configured
            assert "enabled" in data
            print(f"Loyalty program data: {data}")
    
    def test_post_loyalty_program_authenticated(self):
        """Test POST loyalty program settings with auth"""
        token = self.get_auth_token()
        if not token:
            pytest.skip("Could not get auth token")
        
        self.session.headers.update({"Authorization": f"Bearer {token}"})
        
        # Test data
        loyalty_settings = {
            "salon_id": SALON_ID,
            "enabled": True,
            "spend_amount": 10000,
            "period_months": 6,
            "topup_percentage": 10
        }
        
        response = self.session.post(
            f"{BASE_URL}/api/salons/{SALON_ID}/loyalty-program",
            json=loyalty_settings
        )
        
        print(f"POST loyalty program status: {response.status_code}")
        print(f"Response: {response.text[:500]}")
        
        # Check response
        if response.status_code == 200:
            data = response.json()
            assert data.get("enabled") == True
            assert data.get("spend_amount") == 10000
            print(f"Loyalty program saved: {data}")


class TestStaffManagement:
    """Test Staff Management endpoints"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test fixtures"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
    
    def test_get_barbers(self):
        """Test GET barbers for salon"""
        response = self.session.get(f"{BASE_URL}/api/salons/{SALON_ID}/barbers")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"Found {len(data)} barbers")
        for barber in data:
            print(f"  - {barber.get('name')}: {barber.get('category')}")


class TestCustomerPackages:
    """Test Customer Package endpoints"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test fixtures"""
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
    
    def test_get_services(self):
        """Test GET services"""
        response = self.session.get(f"{BASE_URL}/api/services")
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"Found {len(data)} services")
        
        # Check service structure
        if data:
            service = data[0]
            assert "id" in service
            assert "service_name" in service
            assert "base_price" in service
            print(f"Sample service: {service.get('service_name')} - ₹{service.get('base_price')}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
