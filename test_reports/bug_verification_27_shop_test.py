"""
Focused verification script for iteration 27 shop empty-state bug.

Manual/browser execution was performed with Playwright MCP against:
https://appt-filter-redesign.preview.emergentagent.com

Checks covered:
1. Salon store products API returns total=0/products=[] when no supplier-created products exist.
2. /salon/dashboard?tab=shop renders [data-testid="shop-empty-state"] with
   "No products added yet" and without "No products found." or "Coming soon".
3. A product created through the supplier authenticated product API appears in
   the salon Shop UI, then is soft-deleted and the empty state returns.
"""

TEST_STEPS = [
    "POST /api/salon/users/login identifier=admin password=salon123",
    "GET /api/salon/store/products with salon Bearer token; assert total == 0 and products == []",
    "Seed localStorage.salon_admin_token and localStorage.salon_id",
    "Open /salon/dashboard?tab=shop",
    "Assert [data-testid='shop-empty-state'] exists and contains 'No products added yet'",
    "Assert page text does not contain 'No products found.' or 'Coming soon'",
    "POST /api/supplier/auth/password-login mobile=+919000000001 password=supplier123",
    "POST /api/supplier/products with a temporary active QA product",
    "Assert GET /api/salon/store/products?q=<temp-name> returns the supplier-created product",
    "Reload /salon/dashboard?tab=shop and assert temp product name is visible with no empty state",
    "DELETE /api/supplier/products/<temp-id> for cleanup",
    "Reload /salon/dashboard?tab=shop and assert the empty state returns",
]
