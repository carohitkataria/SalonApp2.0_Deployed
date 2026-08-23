import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
import os

async def check_token():
    # Connect to MongoDB
    mongo_url = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
    client = AsyncIOMotorClient(mongo_url)
    db = client.salon_management
    
    # Find all tokens for customer BugFix QA
    tokens = await db.tokens.find(
        {"customer_name": "BugFix QA"},
        {"_id": 0, "id": 1, "token_number": 1, "total_amount": 1, "order_discount_percent": 1, 
         "order_discount_amount": 1, "tip_amount": 1, "payment_mode": 1, "selected_services": 1}
    ).to_list(10)
    
    print(f"Found {len(tokens)} tokens for customer 'BugFix QA':")
    for token in tokens:
        print(f"\n  Token: {token.get('token_number')}")
        print(f"    - id: {token.get('id')}")
        print(f"    - total_amount: {token.get('total_amount')}")
        print(f"    - order_discount_percent: {token.get('order_discount_percent')}")
        print(f"    - order_discount_amount: {token.get('order_discount_amount')}")
        print(f"    - tip_amount: {token.get('tip_amount')}")
        print(f"    - payment_mode: {token.get('payment_mode')}")
        print(f"    - selected_services: {len(token.get('selected_services', []))} services")
    
    client.close()

asyncio.run(check_token())
