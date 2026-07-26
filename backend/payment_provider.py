"""
Payment provider abstraction + Cashfree Payments (PG) adapter.

Rules (from payment_provider_spec.md):
  * Money is integer minor units (paise). ₹1,000 == 100000.
  * All provider calls are server-side only. Frontend gets only payment_session_id.
  * Actual-cost pass-through — wallet credited by exact paid amount, debited by exact
    Twilio cost. WALLET_PLATFORM_MARGIN_PERCENT = 0 (enforced by caller).
  * Idempotent by provider_order_id (payments) and Twilio usage record key (debits).
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import os
from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Any, Dict

import httpx


# ---------------------------- DTOs ----------------------------

@dataclass
class CreateOrderInput:
    salon_id: str
    amount_minor: int          # 100000 == ₹1,000
    currency: str              # "INR"
    purpose: str               # "wallet_topup"
    customer_id: str
    customer_name: str
    customer_email: str
    customer_phone: str
    return_url: str
    idempotency_key: str


@dataclass
class CreateOrderResult:
    provider_order_id: str
    payment_session_id: str
    amount_minor: int
    currency: str
    status: str                # "created"


@dataclass
class WebhookResult:
    valid: bool
    event: str                 # "payment.success" | "payment.failed" | "other"
    provider_order_id: str
    reference_id: str          # cf_payment_id
    amount_minor: int


# ---------------------- Interface ----------------------

class PaymentProvider(ABC):
    """Swappable payment provider. Implementations MUST be side-effect free
    outside of the provider itself; wallet crediting happens in the caller."""

    @abstractmethod
    def create_order(self, data: CreateOrderInput) -> CreateOrderResult: ...

    @abstractmethod
    def verify_webhook(self, raw_body: bytes, headers: Dict[str, str]) -> WebhookResult: ...

    @abstractmethod
    def fetch_order_status(self, provider_order_id: str) -> Dict[str, Any]:
        # -> {"status": "PAID"|"ACTIVE"|"EXPIRED"|"FAILED", "amount_minor": int}
        ...


# ---------------------- Cashfree adapter ----------------------

class CashfreeProvider(PaymentProvider):
    """
    Cashfree Payments (PG) — Orders API v2025-01-01 + JS SDK v3 checkout +
    HMAC-SHA256 webhook verification. Sandbox by default.

    Reference contract: payment_provider_spec.md
    """

    def __init__(self):
        env = (os.environ.get("CASHFREE_ENV") or "sandbox").lower()
        self.base_url = (
            "https://api.cashfree.com/pg"
            if env == "production"
            else "https://sandbox.cashfree.com/pg"
        )
        self.app_id = os.environ.get("CASHFREE_APP_ID", "")
        self.secret_key = os.environ.get("CASHFREE_SECRET_KEY", "")
        self.webhook_secret = os.environ.get("CASHFREE_WEBHOOK_SECRET", "")
        self.api_version = os.environ.get("CASHFREE_API_VERSION", "2025-01-01")
        self.env = env

    def _headers(self) -> Dict[str, str]:
        return {
            "x-client-id": self.app_id,
            "x-client-secret": self.secret_key,
            "x-api-version": self.api_version,
            "Content-Type": "application/json",
            "Accept": "application/json",
        }

    def _is_configured(self) -> bool:
        return bool(
            self.app_id and self.secret_key
            and not self.app_id.endswith("_DUMMY")
            and not self.secret_key.endswith("_DUMMY")
        )

    # -------- create order --------
    def create_order(self, data: CreateOrderInput) -> CreateOrderResult:
        # Cashfree PG expects a decimal order_amount, not paise.
        payload = {
            "order_id": data.idempotency_key,
            "order_amount": round(data.amount_minor / 100.0, 2),
            "order_currency": data.currency or "INR",
            "customer_details": {
                "customer_id": data.customer_id,
                "customer_name": data.customer_name or "Guest",
                "customer_email": data.customer_email or "no-reply@example.com",
                "customer_phone": data.customer_phone or "9999999999",
            },
            "order_meta": {
                "return_url": data.return_url,
                "notify_url": (os.environ.get("APP_BASE_URL", "").rstrip("/") + "/api/webhooks/cashfree"),
            },
            "order_note": data.purpose,
            "order_tags": {"salon_id": data.salon_id, "purpose": data.purpose},
        }

        # DUMMY mode — for dev without real Cashfree keys. Returns a stub session
        # id so the frontend flow can be exercised end-to-end without hitting PG.
        if not self._is_configured():
            return CreateOrderResult(
                provider_order_id=data.idempotency_key,
                payment_session_id=f"session_dummy_{data.idempotency_key}",
                amount_minor=data.amount_minor,
                currency=data.currency,
                status="created",
            )

        with httpx.Client(timeout=20.0) as client:
            resp = client.post(f"{self.base_url}/orders", headers=self._headers(), json=payload)
            resp.raise_for_status()
            body = resp.json()

        return CreateOrderResult(
            provider_order_id=str(body.get("order_id") or data.idempotency_key),
            payment_session_id=str(body.get("payment_session_id") or ""),
            amount_minor=data.amount_minor,
            currency=data.currency,
            status="created",
        )

    # -------- verify webhook --------
    def verify_webhook(self, raw_body: bytes, headers: Dict[str, str]) -> WebhookResult:
        """HMAC-SHA256 verification. Header names in Cashfree are:
          - x-webhook-timestamp
          - x-webhook-signature   (base64(HMAC_SHA256(timestamp + raw_body, secret)))
        """
        h = {k.lower(): v for k, v in (headers or {}).items()}
        ts = h.get("x-webhook-timestamp", "")
        sig = h.get("x-webhook-signature", "")

        expected = self._sign(ts, raw_body)
        valid = bool(sig) and hmac.compare_digest(expected, sig)

        # Parse the payload for downstream routing regardless of validity so
        # callers can log/replay in staging.
        try:
            import json as _json
            payload = _json.loads(raw_body.decode("utf-8"))
        except Exception:
            payload = {}

        evt_type = str(payload.get("type") or "").lower()
        event = "other"
        if evt_type in ("payment_success_webhook", "payment.success"):
            event = "payment.success"
        elif evt_type in ("payment_failed_webhook", "payment.failed"):
            event = "payment.failed"
        elif evt_type in ("payment_user_dropped_webhook", "payment.dropped"):
            event = "payment.failed"

        data = (payload.get("data") or {})
        order = (data.get("order") or {})
        payment = (data.get("payment") or {})

        try:
            amount_minor = int(round(float(order.get("order_amount") or payment.get("payment_amount") or 0) * 100))
        except (TypeError, ValueError):
            amount_minor = 0

        return WebhookResult(
            valid=valid,
            event=event,
            provider_order_id=str(order.get("order_id") or payment.get("order_id") or ""),
            reference_id=str(payment.get("cf_payment_id") or payment.get("payment_id") or ""),
            amount_minor=amount_minor,
        )

    def _sign(self, timestamp: str, raw_body: bytes) -> str:
        if not self.webhook_secret:
            return ""
        message = (timestamp or "").encode("utf-8") + (raw_body or b"")
        digest = hmac.new(self.webhook_secret.encode("utf-8"), message, hashlib.sha256).digest()
        return base64.b64encode(digest).decode("utf-8")

    # -------- fetch order status --------
    def fetch_order_status(self, provider_order_id: str) -> Dict[str, Any]:
        if not self._is_configured():
            return {"status": "ACTIVE", "amount_minor": 0}
        with httpx.Client(timeout=20.0) as client:
            resp = client.get(f"{self.base_url}/orders/{provider_order_id}", headers=self._headers())
            if resp.status_code == 404:
                return {"status": "EXPIRED", "amount_minor": 0}
            resp.raise_for_status()
            body = resp.json()
        try:
            amt_minor = int(round(float(body.get("order_amount") or 0) * 100))
        except (TypeError, ValueError):
            amt_minor = 0
        return {"status": str(body.get("order_status") or "ACTIVE"), "amount_minor": amt_minor}


# ---------------------- Factory ----------------------

_provider_singleton: PaymentProvider | None = None


def get_payment_provider() -> PaymentProvider:
    """Returns the configured PaymentProvider singleton. Currently Cashfree."""
    global _provider_singleton
    if _provider_singleton is None:
        _provider_singleton = CashfreeProvider()
    return _provider_singleton
