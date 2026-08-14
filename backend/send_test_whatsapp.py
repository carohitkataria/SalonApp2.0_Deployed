"""One-off: send a business-initiated WhatsApp template to a test customer via
the default sender, and log it to the salon's platform chat so replies route
back to that salon's conversation thread."""
import asyncio
import os
import uuid
from datetime import datetime, timezone
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / ".env")

from motor.motor_asyncio import AsyncIOMotorClient
from twilio_service import send_booking_confirmation_template

TEST_PHONE = "+917976441272"
SALON_ID = "909b8e81-ed8d-4c1c-9305-7545d1d4ce44"  # Glam Central37


async def main():
    client = AsyncIOMotorClient(os.environ["MONGO_URL"], serverSelectionTimeoutMS=15000)
    db = client[os.environ["DB_NAME"]]
    salon = await db.salons.find_one({"id": SALON_ID}, {"_id": 0})
    salon_name = (salon or {}).get("salon_name", "Glam Central")

    # Business-initiated template message (default platform sender -> salon=None).
    result = await send_booking_confirmation_template(
        phone_number=TEST_PHONE,
        customer_name="Rohit",
        salon_name=salon_name,
        token_number=1,
        date=datetime.now().strftime("%d %b %Y"),
        time_slot="5:30 PM",
        barber_name="Istyak",
        salon=None,          # default sender (whatsapp:+918560934455)
    )
    print("SEND RESULT:", result)

    # Log outbound into the salon's chat so a customer reply routes here.
    now = datetime.now(timezone.utc).isoformat()
    await db.whatsapp_messages.insert_one({
        "id": str(uuid.uuid4()),
        "salon_id": SALON_ID,
        "customer_phone": TEST_PHONE,
        "customer_name": "Rohit",
        "direction": "out",
        "text": f"Booking confirmation sent to {TEST_PHONE} (test)",
        "channel": "whatsapp",
        "provider": result.get("provider", "twilio"),
        "kind": "message",
        "status": result.get("status"),
        "message_sid": result.get("sid") or result.get("message_sid"),
        "read": True,
        "created_at": now,
    })
    print("Outbound logged to salon chat:", SALON_ID)
    client.close()


asyncio.run(main())
