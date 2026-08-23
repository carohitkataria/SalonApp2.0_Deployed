import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
import os
import json

async def check_token():
    # Connect to MongoDB
    mongo_url = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
    db_name = os.environ.get('DB_NAME', 'salon_db')
    client = AsyncIOMotorClient(mongo_url)
    db = client[db_name]
    
    print(f"Connected to MongoDB: {mongo_url}/{db_name}\n")
    
    # Find tokens for phone +919800055501
    tokens = await db.tokens.find(
        {"phone": "+919800055501"},
        {"_id": 0}
    ).sort("created_at", -1).to_list(10)
    
    print(f"Found {len(tokens)} tokens for phone +919800055501:\n")
    
    for token in tokens:
        print(f"Token: {token.get('token_number')} (ID: {token.get('id')})")
        print(f"  - customer_name: {token.get('customer_name')}")
        print(f"  - total_amount: ₹{token.get('total_amount')}")
        print(f"  - status: {token.get('status')}")
        print(f"  - selected_services: {len(token.get('selected_services', []))} services")
        print(f"  - service_assignments: {len(token.get('service_assignments', []))} assignments")
        print(f"\n  Billing snapshot fields:")
        print(f"    - order_discount_percent: {token.get('order_discount_percent')}")
        print(f"    - order_discount_amount: ₹{token.get('order_discount_amount')}")
        print(f"    - tip_amount: ₹{token.get('tip_amount')}")
        print(f"    - membership_discount_percent: {token.get('membership_discount_percent')}")
        print(f"    - payment_mode: {token.get('payment_mode')}")
        
        if token.get('service_assignments'):
            print(f"\n  Service assignments details:")
            for i, sa in enumerate(token['service_assignments']):
                print(f"    [{i+1}] service_id: {sa.get('service_id')[:8]}...")
                print(f"        service_price: ₹{sa.get('service_price')}")
                print(f"        list_price: ₹{sa.get('list_price')}")
                if 'discount_percent' in sa:
                    print(f"        discount_percent: {sa.get('discount_percent')}%")
                if 'barber_allocations' in sa and len(sa['barber_allocations']) > 1:
                    print(f"        barber_allocations: {len(sa['barber_allocations'])} barbers")
                    for alloc in sa['barber_allocations']:
                        print(f"          - {alloc.get('barber_id')[:8]}... ({alloc.get('pct')}%)")
        print("\n" + "="*80 + "\n")
    
    client.close()

asyncio.run(check_token())
