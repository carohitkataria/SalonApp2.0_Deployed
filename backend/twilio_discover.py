"""Discover Twilio messaging setup so we can point the inbound WhatsApp webhook
at our backend. Read-only (lists services/senders/numbers)."""
import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / ".env")
from twilio.rest import Client

ACCOUNT_SID = os.environ["TWILIO_ACCOUNT_SID"]
API_KEY_SID = os.environ["TWILIO_API_KEY_SID"]
API_KEY_SECRET = os.environ["TWILIO_API_KEY_SECRET"]
client = Client(API_KEY_SID, API_KEY_SECRET, account_sid=ACCOUNT_SID)

print("=== Messaging Services ===")
try:
    for s in client.messaging.v1.services.list(limit=20):
        print(f"  MG={s.sid} name={s.friendly_name!r} inbound_url={s.inbound_request_url!r} "
              f"inbound_method={s.inbound_method} use_inbound_on_number={s.use_inbound_webhook_on_number}")
except Exception as e:
    print("  services error:", repr(e)[:200])

print("=== WhatsApp Senders (messaging v2 channels/senders) ===")
try:
    for s in client.messaging.v2.channels_senders.list(limit=20):
        print(f"  sender_sid={getattr(s,'sid',None)} sender={getattr(s,'sender_id',None)} "
              f"status={getattr(s,'status',None)} webhook={getattr(s,'webhook',None)}")
except Exception as e:
    print("  senders v2 error:", repr(e)[:250])

print("=== Incoming Phone Numbers ===")
try:
    for n in client.incoming_phone_numbers.list(limit=20):
        print(f"  {n.phone_number} sms_url={n.sms_url!r} sms_method={n.sms_method}")
except Exception as e:
    print("  numbers error:", repr(e)[:200])
