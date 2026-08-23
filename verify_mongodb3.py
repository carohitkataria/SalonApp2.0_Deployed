import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
import os

async def check_token():
    # Connect to MongoDB
    mongo_url = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
    client = AsyncIOMotorClient(mongo_url)
    db = client.salon_management
    
    # Find tokens with phone 9800055501
    tokens = await db.tokens.find(
        {"phone": {"$regex": "9800055501"}},
        {"_id": 0, "id": 1, "token_number": 1, "customer_name": 1, "phone": 1, "total_amount": 1, 
         "order_discount_percent": 1, "order_discount_amount": 1, "tip_amount": 1, "payment_mode": 1}
    ).to_list(10)
    
    print(f"Found {len(tokens)} tokens for phone containing '9800055501':")
    for token in tokens:
        print(f"\n  Token: {token.get('token_number')}")
        print(f"    - id: {token.get('id')}")
        print(f"    - customer_name: {token.get('customer_name')}")
        print(f"    - phone: {token.get('phone')}")
        print(f"    - total_amount: {token.get('total_amount')}")
        print(f"    - order_discount_percent: {token.get('order_discount_percent')}")
        print(f"    - order_discount_amount: {token.get('order_discount_amount')}")
        print(f"    - tip_amount: {token.get('tip_amount')}")
        print(f"    - payment_mode: {token.get('payment_mode')}")
    
    client.close()

asyncio.run(check_token())
