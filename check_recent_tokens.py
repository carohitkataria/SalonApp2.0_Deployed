import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
import os
from datetime import datetime, timezone

async def check_token():
    # Connect to MongoDB
    mongo_url = os.environ.get('MONGO_URL', 'mongodb://localhost:27017')
    client = AsyncIOMotorClient(mongo_url)
    db = client.salon_management
    
    # Find recent tokens (last 10)
    tokens = await db.tokens.find(
        {"salon_id": "525d3b3e-6a39-4e28-8597-60b6c4ddcb60"},
        {"_id": 0, "id": 1, "token_number": 1, "customer_name": 1, "phone": 1, "created_at": 1}
    ).sort("created_at", -1).limit(10).to_list(10)
    
    print(f"Last 10 tokens for salon 525d3b3e-6a39-4e28-8597-60b6c4ddcb60:")
    for token in tokens:
        print(f"  {token.get('token_number')}: {token.get('customer_name')} ({token.get('phone')}) - {token.get('created_at')}")
    
    client.close()

asyncio.run(check_token())
