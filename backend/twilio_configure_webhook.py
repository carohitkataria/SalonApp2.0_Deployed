"""Configure the inbound webhook on the WhatsApp sender (+918560934455) so
customer-initiated messages POST to our backend and sync into the platform chat.

Uses the Twilio Messaging v2 Channels/Senders API (Option A of the playbook).
Idempotent: safe to re-run (e.g. after deploy, with a new PUBLIC_WEBHOOK_BASE).
"""
import os
import json
import requests
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / ".env")

API_KEY_SID = os.environ["TWILIO_API_KEY_SID"]
API_KEY_SECRET = os.environ["TWILIO_API_KEY_SECRET"]

SENDER_SID = os.environ.get("TWILIO_WHATSAPP_SENDER_SID", "XEdbdf073a4d655e73a597e13b45c779d2")
# Public base URL Twilio should call. Override via env after deploying to prod.
BASE = os.environ.get("PUBLIC_WEBHOOK_BASE", "https://salonhub.in").rstrip("/")
WEBHOOK_URL = f"{BASE}/api/whatsapp/twilio-inbound"
STATUS_URL = f"{BASE}/api/webhooks/twilio-status"  # existing status callback route

url = f"https://messaging.twilio.com/v2/Channels/Senders/{SENDER_SID}"

# Fetch current config first (v2 update requires the configuration block).
cur = requests.get("https://messaging.twilio.com/v2/Channels/Senders?Channel=whatsapp",
                   auth=(API_KEY_SID, API_KEY_SECRET), timeout=20).json()
sender = next((s for s in cur.get("senders", []) if s.get("sid") == SENDER_SID), None)
if not sender:
    raise SystemExit(f"Sender {SENDER_SID} not found")

payload = {
    "configuration": sender.get("configuration") or {},
    "webhook": {
        "callback_url": WEBHOOK_URL,
        "callback_method": "POST",
    },
}

print(f"Setting inbound webhook for {sender.get('sender_id')} -> {WEBHOOK_URL}")
r = requests.post(url, auth=(API_KEY_SID, API_KEY_SECRET),
                  headers={"Content-Type": "application/json"},
                  data=json.dumps(payload), timeout=30)
print("update status:", r.status_code)
try:
    j = r.json()
    print("webhook now:", json.dumps(j.get("webhook")))
except Exception:
    print(r.text[:600])
