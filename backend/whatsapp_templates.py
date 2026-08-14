"""WS5 — Single source of truth for approved WhatsApp Content templates.

All business-initiated WhatsApp sends (queue alerts + invoice delivery) use these
pre-approved Twilio Content API templates so they bypass the 24-hour
user-initiated session window. SIDs come from env (set per environment); the
ordered variable names document the {{n}} → value mapping for each template.

These templates are approved under the PLATFORM's WhatsApp Business Account. If a
salon's number is registered under its OWN WABA, these SIDs are NOT valid for it
and the code (twilio_service.resolve_template_sender) falls back to the platform
sender unless the salon supplies its own `whatsapp.template_overrides` map.
"""
import os

# ---- Approved template content SIDs (platform WABA) ----
TOKEN_APPROACHING_SID = os.environ.get("TWILIO_TOKEN_APPROACHING_TEMPLATE_SID")
YOUR_TURN_NOW_SID = os.environ.get("TWILIO_YOUR_TURN_NOW_TEMPLATE_SID")
BOOKING_COMPLETED_SID = os.environ.get("TWILIO_BOOKING_COMPLETED_TEMPLATE_SID")
BOOKING_CONFIRMATION_SID = os.environ.get("TWILIO_BOOKING_CONFIRMATION_TEMPLATE_SID")

# ---- Registry: name -> {sid, variables (ordered), message_type, consumes_wallet} ----
# message_type maps to the salon marketing/notification per-type toggles.
# consumes_wallet=False for operational (queue/invoice) messages so they always
# deliver; marketing/promotional campaigns are metered elsewhere.
TEMPLATES = {
    "token_approaching": {
        "sid": TOKEN_APPROACHING_SID,
        "variables": ["customer_name", "tokens_away", "salon_name", "customer_token", "barber_name", "current_token"],
        "message_type": "queue_alerts",
        "consumes_wallet": False,
    },
    "your_turn_now": {
        "sid": YOUR_TURN_NOW_SID,
        "variables": ["customer_name", "token_number", "salon_name", "barber_name"],
        "message_type": "queue_alerts",
        "consumes_wallet": False,
    },
    "booking_completed": {
        "sid": BOOKING_COMPLETED_SID,
        "variables": ["salon_name", "customer_name", "token_number", "barber_name", "invoice_amount"],
        "message_type": "invoice_delivery",
        "consumes_wallet": False,
    },
    "booking_confirmation": {
        "sid": BOOKING_CONFIRMATION_SID,
        "variables": ["customer_name", "salon_name", "date", "time_slot", "barber_name"],
        "message_type": "booking_confirmation",
        "consumes_wallet": False,
    },
}


def get_template(name: str) -> dict:
    return TEMPLATES.get(name) or {}


def build_variables(name: str, values: dict) -> dict:
    """Map named values → the ordered {{1}}, {{2}}, … content_variables dict that
    Twilio expects, using the registry's variable order for the template."""
    spec = TEMPLATES.get(name) or {}
    ordered = spec.get("variables") or []
    out = {}
    for idx, var_name in enumerate(ordered, start=1):
        out[str(idx)] = values.get(var_name, "")
    return out


def message_type_for(name: str) -> str:
    return (TEMPLATES.get(name) or {}).get("message_type") or "other"


def consumes_wallet(name: str) -> bool:
    return bool((TEMPLATES.get(name) or {}).get("consumes_wallet"))
