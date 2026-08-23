import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
import os

async def check_token():
    # Connect to MongoDB
    mongo_url = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
    client = AsyncIOMotorClient(mongo_url)
    db = client.salon_management
    
    # Find our test token M4
    token = await db.tokens.find_one(
        {"token_number": "M4", "customer_name": "BugFix QA"},
        {"_id": 0}
    )
    
    if token:
        print("Token M4 found in MongoDB:")
        print(f"  - id: {token.get('id')}")
        print(f"  - token_number: {token.get('token_number')}")
        print(f"  - customer_name: {token.get('customer_name')}")
        print(f"  - total_amount: {token.get('total_amount')}")
        print(f"  - order_discount_percent: {token.get('order_discount_percent')}")
        print(f"  - order_discount_amount: {token.get('order_discount_amount')}")
        print(f"  - tip_amount: {token.get('tip_amount')}")
        print(f"  - membership_discount_percent: {token.get('membership_discount_percent')}")
        print(f"  - payment_mode: {token.get('payment_mode')}")
        print(f"  - selected_services count: {len(token.get('selected_services', []))}")
        print(f"  - service_assignments count: {len(token.get('service_assignments', []))}")
        
        # Check service_assignments details
        if token.get('service_assignments'):
            print("\n  Service assignments:")
            for i, sa in enumerate(token['service_assignments']):
                print(f"    [{i}] service_id: {sa.get('service_id')}")
                print(f"        barber_id: {sa.get('barber_id')}")
                print(f"        service_price: {sa.get('service_price')}")
                print(f"        list_price: {sa.get('list_price')}")
                print(f"        discount_percent: {sa.get('discount_percent', 'N/A')}")
                if 'barber_allocations' in sa:
                    print(f"        barber_allocations: {sa['barber_allocations']}")
    else:
        print("Token M4 not found in MongoDB")
    
    client.close()

asyncio.run(check_token())
