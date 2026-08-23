"""
Twilio WhatsApp and SMS Service

Production setup (Feb 2026):
  • OTP send/verify   → Twilio **Verify** service (`TWILIO_VERIFY_SERVICE_SID`).
                        Primary channel WhatsApp, automatic fallback to SMS.
  • Booking & status  → Twilio **Content API** with approved WhatsApp templates
                        (e.g. `TWILIO_BOOKING_CONFIRMATION_TEMPLATE_SID`) sent
                        from the production WhatsApp business sender
                        (`TWILIO_WHATSAPP_NUMBER`).
  • Freeform messages → still used inside the 24h reply window (in-app status
                        updates from staff).  Falls back to mock if Twilio
                        credentials are not configured.
"""
import asyncio
import json
from twilio.rest import Client
import os
import logging
from pathlib import Path
from dotenv import load_dotenv

# Load environment variables
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

logger = logging.getLogger(__name__)

# Twilio Configuration
ACCOUNT_SID = os.environ.get('TWILIO_ACCOUNT_SID')
AUTH_TOKEN = os.environ.get('TWILIO_AUTH_TOKEN')
# API Key auth (preferred). When present, we authenticate with the API Key
# SID + Secret and scope requests to ACCOUNT_SID. This avoids needing the
# account's primary Auth Token.
API_KEY_SID = os.environ.get('TWILIO_API_KEY_SID')
API_KEY_SECRET = os.environ.get('TWILIO_API_KEY_SECRET')
WHATSAPP_NUMBER = os.environ.get('TWILIO_WHATSAPP_NUMBER', 'whatsapp:+14155238886')
VERIFY_SERVICE_SID = os.environ.get('TWILIO_VERIFY_SERVICE_SID')
BOOKING_CONFIRMATION_TEMPLATE_SID = os.environ.get('TWILIO_BOOKING_CONFIRMATION_TEMPLATE_SID')
BOOKING_COMPLETED_TEMPLATE_SID = os.environ.get('TWILIO_BOOKING_COMPLETED_TEMPLATE_SID')
YOUR_TURN_NOW_TEMPLATE_SID = os.environ.get('TWILIO_YOUR_TURN_NOW_TEMPLATE_SID')
TOKEN_APPROACHING_TEMPLATE_SID = os.environ.get('TWILIO_TOKEN_APPROACHING_TEMPLATE_SID')

# WS3 — Platform default WhatsApp sender identity. We ALWAYS authenticate as the
# platform's ONE Twilio account (Account SID + Auth Token / API Key). "Sending as
# a salon" only changes WHICH registered sender we pass on each API call.
PLATFORM_MSG_SVC = os.environ.get('TWILIO_WHATSAPP_MESSAGING_SERVICE_SID') or None
PLATFORM_FROM = WHATSAPP_NUMBER  # already 'whatsapp:+...'


def _status_callback_url():
    """Public URL Twilio POSTs delivery status updates (queued→sent→delivered→
    read / failed) to. Must be publicly reachable and unauthenticated."""
    base = (
        os.environ.get('BACKEND_PUBLIC_URL')
        or os.environ.get('PUBLIC_BACKEND_URL')
        or os.environ.get('APP_URL')
        or os.environ.get('APP_BASE_URL')
        or ''
    ).rstrip('/')
    if not base:
        return None
    return f"{base}/api/twilio/status-callback"


def _platform_sender() -> dict:
    """create() kwargs for the platform default sender."""
    if PLATFORM_MSG_SVC:
        return {"messaging_service_sid": PLATFORM_MSG_SVC}
    return {"from_": PLATFORM_FROM}


def resolve_sender(salon: dict = None) -> dict:
    """WS3 — pick the Twilio ``messages.create`` sender kwargs for a salon.

    A salon routes through its OWN registered WhatsApp sender only when it has
    explicitly opted in (``whatsapp.mode == 'own'``) AND the platform owner has
    flipped it live (``whatsapp.status == 'active'``). A per-salon Messaging
    Service SID (MG…) is preferred; otherwise a bare sender number is used.
    Everything else falls back to the platform default sender.

    The moment the owner sets ``mode='own'`` + ``status='active'`` for a salon,
    its messages flow through its own number with ZERO further code changes —
    every send routes through this resolver.
    """
    w = (salon or {}).get("whatsapp") or {}
    if w.get("mode") == "own" and w.get("status") == "active":
        msg_svc = w.get("messaging_service_sid")
        if msg_svc:
            return {"messaging_service_sid": msg_svc}
        num = w.get("sender_number")
        if num:
            if not str(num).startswith("whatsapp:"):
                num = f"whatsapp:{num}"
            return {"from_": num}
    return _platform_sender()


def resolve_template_sender(salon: dict, content_sid: str, template_name: str = None):
    """WS3 — resolve BOTH the sender kwargs and the effective content SID for a
    business-initiated template send, honouring the WABA/template caveat.

    The approved template content SIDs (HX…) are approved under the PLATFORM's
    WhatsApp Business Account (WABA). If a salon's number is registered under my
    own WABA (the simple path), those HX… SIDs work as-is for its sender.

    If a salon's number ever sits under ITS OWN WABA (``whatsapp.own_waba`` True),
    the platform HX… SIDs are NOT valid for it — it needs its own approved
    template SIDs. Until a salon supplies a ``template_overrides`` map
    (name -> content SID), we fall back to the PLATFORM sender for template
    messages so delivery never breaks.

    Returns ``(sender_kwargs, effective_content_sid)``.
    """
    w = (salon or {}).get("whatsapp") or {}
    if w.get("mode") == "own" and w.get("status") == "active" and w.get("own_waba"):
        overrides = w.get("template_overrides") or {}
        override_sid = overrides.get(template_name) if template_name else None
        if override_sid:
            # Salon has its own approved template SID for its own WABA sender.
            return resolve_sender(salon), override_sid
        # Own-WABA salon but no approved override yet → use platform sender + SID.
        logger.warning(
            "Salon flagged own_waba with no template override for '%s' — "
            "falling back to platform sender for this template send.",
            template_name,
        )
        return _platform_sender(), content_sid
    # Simple path: salon's number under platform WABA (or platform default).
    return resolve_sender(salon), content_sid


# Initialize Twilio client
twilio_client = None

def get_twilio_client():
    """Get or create Twilio client instance.

    Auth precedence:
      1. API Key (SK… + secret) + Account SID  → Client(api_key_sid, api_key_secret, account_sid)
      2. Account SID + Auth Token              → Client(account_sid, auth_token)
    Returns None (mock mode) if neither is fully configured.
    """
    global twilio_client
    if twilio_client is None:
        logger.info("Initializing Twilio client...")
        logger.info(f"ACCOUNT_SID: {ACCOUNT_SID[:8] if ACCOUNT_SID else 'None'}...")

        try:
            if API_KEY_SID and API_KEY_SECRET and ACCOUNT_SID:
                logger.info(f"Using API Key auth (API_KEY_SID: {API_KEY_SID[:8]}...)")
                twilio_client = Client(API_KEY_SID, API_KEY_SECRET, ACCOUNT_SID)
                logger.info("Twilio client initialized successfully with API Key authentication")
            elif ACCOUNT_SID and AUTH_TOKEN:
                logger.info("Using Auth Token authentication")
                twilio_client = Client(ACCOUNT_SID, AUTH_TOKEN)
                logger.info("Twilio client initialized successfully with Auth Token authentication")
            else:
                logger.warning("Twilio credentials not configured. Using mock mode.")
                return None
        except Exception as e:
            logger.error(f"Failed to initialize Twilio client: {e}")
            return None
    return twilio_client


async def send_whatsapp_otp(phone_number: str, otp: str = None) -> dict:
    """
    Send a login OTP via Twilio **Verify**.

    Twilio Verify generates, sends, and tracks the OTP entirely on its side —
    we don't need to generate `otp` locally any more.  The `otp` parameter
    is kept for backwards-compatibility with existing call sites; if it is
    passed (legacy mock path) and Verify is NOT configured, we'll log it.

    Channel strategy (production):
      • SMS only — Indian Twilio Verify default WhatsApp template currently
        doesn't deliver reliably from the SalonHub sender, so we route OTP
        through SMS where delivery is verified working.  Booking & status
        notifications still go via WhatsApp (Content API + approved templates).
    """
    client = get_twilio_client()

    if client is None or not VERIFY_SERVICE_SID:
        logger.warning(
            f"Twilio Verify not configured. Mock OTP path for {phone_number}: {otp}"
        )
        return {
            "status": "mock",
            "message": f"Mock OTP: {otp} (Twilio Verify not configured)",
            "otp": otp,
        }

    last_error = None
    for channel in ("sms",):
        try:
            verification = await asyncio.to_thread(
                lambda: client.verify.v2.services(VERIFY_SERVICE_SID).verifications.create(
                    to=phone_number,
                    channel=channel,
                )
            )
            logger.info(
                f"Twilio Verify OTP sent via {channel} to {phone_number}. SID: {verification.sid} status={verification.status}"
            )
            return {
                "status": "sent",
                "message_sid": verification.sid,
                "channel": channel,
                "to": phone_number,
            }
        except Exception as e:
            logger.warning(
                f"Verify OTP via {channel} failed for {phone_number}: {e}"
            )
            last_error = str(e)

    return {
        "status": "failed",
        "error": last_error,
        "otp": otp,
    }


async def verify_whatsapp_otp(phone_number: str, code: str) -> dict:
    """
    Validate a user-entered OTP against Twilio Verify.

    Returns:
        dict {
          status: "approved" | "pending" | "failed",
          valid:  bool,
          error:  str (only on failure),
        }
    """
    client = get_twilio_client()

    if client is None or not VERIFY_SERVICE_SID:
        logger.warning("Twilio Verify not configured. Cannot verify OTP via Twilio.")
        return {"status": "failed", "valid": False, "error": "verify_not_configured"}

    try:
        check = await asyncio.to_thread(
            lambda: client.verify.v2.services(VERIFY_SERVICE_SID).verification_checks.create(
                to=phone_number,
                code=code,
            )
        )
        valid = (check.status == "approved")
        logger.info(
            f"Twilio Verify check for {phone_number}: status={check.status} valid={valid}"
        )
        return {"status": check.status, "valid": valid}
    except Exception as e:
        logger.error(f"Twilio Verify check failed for {phone_number}: {e}")
        return {"status": "failed", "valid": False, "error": str(e)}


def is_verify_configured() -> bool:
    """True iff Twilio Verify is fully configured for production OTP."""
    return bool(VERIFY_SERVICE_SID) and get_twilio_client() is not None


async def send_whatsapp_template(
    phone_number: str,
    content_sid: str,
    content_variables: dict,
    template_name: str = None,
    salon: dict = None,
) -> dict:
    """
    Send a WhatsApp message using an approved Content Template (Content API).

    This is the ONLY way to start a WhatsApp conversation outside the 24-hour
    customer-reply window in production.

    Args:
        phone_number     : recipient in E.164 format (e.g. +919876543210)
        content_sid      : approved template SID (HX…)
        content_variables: dict of variable index → value (keys "1", "2", …)
        template_name    : logging label (e.g. "booking_confirmation")
        salon            : WS3 — salon document; its ``whatsapp`` config selects
                           the per-salon sender via ``resolve_template_sender``.
    """
    client = get_twilio_client()

    if client is None:
        logger.warning(
            f"Twilio not configured. Mock template '{template_name}' to {phone_number}: {content_variables}"
        )
        return {"status": "mock", "template": template_name, "variables": content_variables}

    try:
        # Twilio rejects Content Templates when any content variable is an
        # empty string — coerce None/blank → "-" so all placeholders render.
        safe_vars = {}
        for k, v in content_variables.items():
            s = "" if v is None else str(v)
            safe_vars[str(k)] = s if s.strip() else "-"

        # WS3 — resolve per-salon sender + effective content SID (WABA caveat).
        sender_kwargs, effective_sid = resolve_template_sender(salon, content_sid, template_name)
        create_kwargs = {
            "to": f"whatsapp:{phone_number}",
            "content_sid": effective_sid,
            "content_variables": json.dumps(safe_vars),
        }
        create_kwargs.update(sender_kwargs)
        _cb = _status_callback_url()
        if _cb:
            create_kwargs["status_callback"] = _cb

        message = await asyncio.to_thread(client.messages.create, **create_kwargs)
        logger.info(
            f"WhatsApp template '{template_name}' sent to {phone_number} "
            f"via {list(sender_kwargs.keys())[0]}={list(sender_kwargs.values())[0]}. SID: {message.sid}"
        )
        return {
            "status": "sent",
            "message_sid": message.sid,
            "to": phone_number,
            "template": template_name,
            "sender": sender_kwargs,
        }
    except Exception as e:
        logger.error(
            f"Failed to send WhatsApp template '{template_name}' to {phone_number}: {e}"
        )
        return {"status": "failed", "error": str(e), "template": template_name}


async def send_whatsapp(salon: dict, to: str, content_sid: str, variables: dict, template_name: str = None) -> dict:
    """WS3 — the single canonical entry point for business-initiated WhatsApp
    template sends. Thin wrapper over ``send_whatsapp_template`` that makes the
    per-salon ``salon`` argument first-class, matching the build spec
    ``send_whatsapp(salon, to, content_sid, variables)``.
    """
    return await send_whatsapp_template(
        phone_number=to,
        content_sid=content_sid,
        content_variables=variables,
        template_name=template_name,
        salon=salon,
    )


async def send_booking_confirmation_template(
    phone_number: str,
    customer_name: str,
    salon_name: str,
    token_number,
    date: str,
    time_slot: str,
    barber_name: str,
    salon: dict = None,
) -> dict:
    """
    Send the approved booking-confirmation template
    (HX4ec6d831674ce97cc1dc209327445b81).

    Template variables:
        {{1}} customer_name
        {{2}} salon_name
        {{3}} token_number
        {{4}} date
        {{5}} time_slot
        {{6}} barber_name
    """
    if not BOOKING_CONFIRMATION_TEMPLATE_SID:
        logger.warning(
            "TWILIO_BOOKING_CONFIRMATION_TEMPLATE_SID not configured — falling back to freeform message."
        )
        body = format_booking_confirmation(
            customer_name=customer_name,
            token_number=token_number,
            date=date,
            time_slot=time_slot,
            barber_name=barber_name,
            salon_name=salon_name,
        )
        return await send_whatsapp_notification(phone_number, body, "booking_confirmation", salon=salon)

    return await send_whatsapp_template(
        phone_number=phone_number,
        content_sid=BOOKING_CONFIRMATION_TEMPLATE_SID,
        content_variables={
            "1": customer_name,
            "2": salon_name,
            "3": token_number,
            "4": date,
            "5": time_slot,
            "6": barber_name,
        },
        template_name="booking_confirmation",
        salon=salon,
    )


async def send_booking_completed_template(
    phone_number: str,
    customer_name: str,
    salon_name: str,
    token_number,
    barber_name: str = "",
    amount: str = "",
    salon: dict = None,
) -> dict:
    """
    Send the approved 'booking_completed' WhatsApp Content template
    (default SID: HXa417403d8b7ff32ce17fcadc6fe1c19a).

    Template body:
        ✅ All done!
        Thank you for visiting {{1}}, {{2}}.
        🎫 Token: #{{3}}
        💈 Served by: {{4}}
        💰 Amount: {{5}}
        ...

    Variables:
        {{1}} salon_name
        {{2}} customer_name
        {{3}} token_number
        {{4}} barber_name
        {{5}} amount
    """
    if not BOOKING_COMPLETED_TEMPLATE_SID:
        logger.warning(
            "TWILIO_BOOKING_COMPLETED_TEMPLATE_SID not configured — skipping booking_completed WhatsApp."
        )
        return {"status": "skipped", "reason": "template_not_configured"}

    return await send_whatsapp_template(
        phone_number=phone_number,
        content_sid=BOOKING_COMPLETED_TEMPLATE_SID,
        content_variables={
            "1": salon_name,
            "2": customer_name,
            "3": str(token_number),
            "4": barber_name or "our stylist",
            "5": str(amount) if amount else "0",
        },
        template_name="booking_completed",
        salon=salon,
    )


async def send_your_turn_now_template(
    phone_number: str,
    customer_name: str,
    salon_name: str,
    barber_name: str,
    token_number,
    salon: dict = None,
) -> dict:
    """
    Send the approved 'your_turn_now' WhatsApp Content template
    (default SID: HXce2a0648ccfc5d259615714b7f49457b).

    Template body:
        💈 It's your turn!
        Hi {{1}}, token #{{2}} is being called now at {{3}}.
        Please head to {{4}}'s chair.

    Variables:
        {{1}} customer_name
        {{2}} token_number
        {{3}} salon_name
        {{4}} barber_name
    """
    if not YOUR_TURN_NOW_TEMPLATE_SID:
        logger.warning(
            "TWILIO_YOUR_TURN_NOW_TEMPLATE_SID not configured — skipping your_turn_now WhatsApp."
        )
        return {"status": "skipped", "reason": "template_not_configured"}

    return await send_whatsapp_template(
        phone_number=phone_number,
        content_sid=YOUR_TURN_NOW_TEMPLATE_SID,
        content_variables={
            "1": customer_name,
            "2": str(token_number),
            "3": salon_name,
            "4": barber_name or "your stylist",
        },
        template_name="your_turn_now",
        salon=salon,
    )


async def send_token_approaching_template(
    phone_number: str,
    customer_name: str,
    token_number,
    tokens_away,
    salon_name: str = "",
    barber_name: str = "",
    current_serving: str = "",
    salon: dict = None,
) -> dict:
    """
    Send the approved 'token_approaching' WhatsApp Content template
    (default SID: HX5cf990aaa6d32eb99a58ddd799c6fab2).

    Template body:
        ⏳ Your turn is approaching!
        Hi {{1}}, you are {{2}} away at {{3}}.
        🎫 Your token: #{{4}}
        💈 With: {{5}}
        ⏱ Now serving: #{{6}}
        Please start heading over so you don't miss your turn.

    Variables:
        {{1}} customer_name
        {{2}} tokens_away         (e.g. "1 token", "2 tokens")
        {{3}} salon_name
        {{4}} token_number
        {{5}} barber_name
        {{6}} current_serving     (currently-being-served token number)
    """
    if not TOKEN_APPROACHING_TEMPLATE_SID:
        logger.warning(
            "TWILIO_TOKEN_APPROACHING_TEMPLATE_SID not configured — skipping token_approaching WhatsApp."
        )
        return {"status": "skipped", "reason": "template_not_configured"}

    tokens_away_str = f"{tokens_away} token" if str(tokens_away) == "1" else f"{tokens_away} tokens"
    return await send_whatsapp_template(
        phone_number=phone_number,
        content_sid=TOKEN_APPROACHING_TEMPLATE_SID,
        content_variables={
            "1": customer_name,
            "2": tokens_away_str,
            "3": salon_name or "the salon",
            "4": str(token_number),
            "5": barber_name or "your stylist",
            "6": str(current_serving) if current_serving else "—",
        },
        template_name="token_approaching",
        salon=salon,
    )


async def send_whatsapp_notification(phone_number: str, message: str, template_name: str = None, salon: dict = None) -> dict:
    """
    Send WhatsApp notification message
    
    Args:
        phone_number: Recipient's phone number in E.164 format
        message: Message content to send
        template_name: Optional template identifier for logging
        
    Returns:
        dict with status and message_sid or error
    """
    client = get_twilio_client()
    
    if client is None:
        logger.warning(f"Twilio not configured. Mock notification to {phone_number}")
        return {
            "status": "mock",
            "message": message
        }
    
    try:
        # Format phone number for WhatsApp
        to_whatsapp = f"whatsapp:{phone_number}"
        
        # Send WhatsApp message — WS3: route through the per-salon sender.
        sender_kwargs = resolve_sender(salon)
        create_kwargs = dict(body=message, to=to_whatsapp, **sender_kwargs)
        _cb = _status_callback_url()
        if _cb:
            create_kwargs["status_callback"] = _cb
        whatsapp_message = await asyncio.to_thread(client.messages.create, **create_kwargs)
        
        logger.info(f"WhatsApp notification sent to {phone_number}. Template: {template_name}, SID: {whatsapp_message.sid}")
        
        return {
            "status": "sent",
            "message_sid": whatsapp_message.sid,
            "to": phone_number,
            "template": template_name
        }
        
    except Exception as e:
        logger.error(f"Failed to send WhatsApp notification to {phone_number}: {str(e)}")
        return {
            "status": "failed",
            "error": str(e)
        }


# Notification Templates
def format_booking_confirmation(customer_name: str, token_number: int, date: str, time_slot: str, barber_name: str, salon_name: str) -> str:
    """Format booking confirmation message"""
    return f"""
✅ *Booking Confirmed!*

Hello {customer_name}! 👋

Your appointment at *{salon_name}* has been confirmed.

📋 *Booking Details:*
🎫 Token Number: *#{token_number}*
📅 Date: {date}
🕐 Time Slot: {time_slot}
💈 Barber: {barber_name}

We look forward to serving you!

_The Looks Salon_
    """.strip()


def format_queue_status(customer_name: str, current_token: int, user_token: int, tokens_away: int, estimated_time: str) -> str:
    """Format queue status notification"""
    return f"""
⏰ *Queue Update*

Hello {customer_name}! 

📊 *Current Status:*
▶️ Now Serving: Token #{current_token}
🎫 Your Token: *#{user_token}*
📍 You are *{tokens_away} tokens away*
⏱️ Estimated wait: ~{estimated_time}

Please be ready! We'll notify you when your turn is near.

_The Looks Salon_
    """.strip()


def format_token_near(customer_name: str, user_token: int, tokens_away: int) -> str:
    """Format notification when user is near (3 or 1 token away)"""
    if tokens_away == 1:
        urgency = "🔔 *GET READY!*"
        message = "You're next! Please be ready."
    else:
        urgency = "⚠️ *Almost Your Turn!*"
        message = f"Only {tokens_away} customers ahead of you."
    
    return f"""
{urgency}

Hello {customer_name}!

🎫 Your Token: *#{user_token}*
{message}

Please arrive at the salon if you haven't already.

_The Looks Salon_
    """.strip()


def format_token_called(customer_name: str, token_number: int, barber_name: str) -> str:
    """Format notification when token is called"""
    return f"""
🎉 *YOUR TURN!*

Hello {customer_name}!

🎫 Token #{token_number} is now being called!
💈 Please proceed to {barber_name}'s chair.

_The Looks Salon_
    """.strip()


def format_salon_calling(customer_name: str, salon_name: str, barber_name: str) -> str:
    """
    Format the message sent when the salon explicitly clicks
    "Send Notification to Customer" on the token management screen.
    Per product spec — must be a clear, friendly call to come in.
    Reschedule / Cancel action links are appended by send_booking_notification.
    """
    cust = customer_name or "Customer"
    salon = salon_name or "The salon"
    barber = barber_name or "your barber"
    return f"""
🔔 *{salon} is calling you*

Hello {cust}!

{salon} is calling you. Please proceed to *{barber}*'s chair.
If you have any other plan, please inform the salon.

ℹ️ _Note: Rescheduling will assign you the next available token._
    """.strip()


def format_token_cancelled(customer_name: str, token_number: int, reason: str = None) -> str:
    """Format cancellation notification"""
    reason_text = f"\nReason: {reason}" if reason else ""
    
    return f"""
❌ *Booking Cancelled*

Hello {customer_name},

Your booking (Token #{token_number}) has been cancelled.{reason_text}

Please contact us if you have any questions or would like to reschedule.

_The Looks Salon_
    """.strip()


def format_token_rescheduled(customer_name: str, old_date: str, new_date: str, new_slot: str, token_number: int) -> str:
    """Format reschedule notification"""
    return f"""
📅 *Booking Rescheduled*

Hello {customer_name},

Your booking has been rescheduled:

🎫 Token: #{token_number}
❌ Old Date: {old_date}
✅ New Date: {new_date}
🕐 New Time: {new_slot}

See you then!

_The Looks Salon_
    """.strip()
