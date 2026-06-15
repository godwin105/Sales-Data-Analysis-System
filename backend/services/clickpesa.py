"""
ClickPesa payment gateway service.

Auth flow:
  POST https://api.clickpesa.com/third-parties/generate-token
  Headers: client-id, api-key
  Response: { "success": true, "token": "Bearer <jwt>" }   ← includes "Bearer" prefix
  Token is valid for 1 hour — cached to avoid extra requests.

USSD Push flow:
  POST https://api.clickpesa.com/third-parties/payments/initiate-ussd-push-request
  Authorization: <token from above — already has "Bearer" prefix>
  Body: { amount, currency, orderReference, phoneNumber }
  Phone must be in E.164 without "+": 255712345678
  Provider is auto-detected from the phone number prefix.
"""
import time
import requests
from flask import current_app

# Module-level token cache: (token_string, expires_at_epoch)
_token_cache: tuple[str, float] = ("", 0.0)

BASE_URL = "https://api.clickpesa.com"


def _normalize_phone(phone: str) -> str:
    """Convert any TZ phone format to 255XXXXXXXXX (no + sign)."""
    p = phone.strip().replace(" ", "").replace("-", "")
    if p.startswith("+255"):
        return p[1:]
    if p.startswith("255"):
        return p
    if p.startswith("0") and len(p) == 10:
        return "255" + p[1:]
    return "255" + p


def _safe_raise(resp: requests.Response) -> None:
    """Raise RuntimeError with the ClickPesa response body included."""
    if resp.ok:
        return
    try:
        body = resp.json()
    except Exception:
        body = resp.text
    raise RuntimeError(f"ClickPesa {resp.status_code}: {body}")


def _get_token() -> str:
    """
    Return a valid Bearer token string (includes "Bearer " prefix).
    Uses a module-level cache; refreshes when less than 60 seconds remain.
    """
    global _token_cache
    token, expires_at = _token_cache

    if token and time.time() < expires_at - 60:
        return token

    cfg = current_app.config
    resp = requests.post(
        f"{BASE_URL}/third-parties/generate-token",
        headers={
            "client-id": cfg["CLICKPESA_CLIENT_ID"],
            "api-key":   cfg["CLICKPESA_API_KEY"],
        },
        timeout=15,
    )
    _safe_raise(resp)
    body = resp.json()
    if not body.get("success"):
        raise RuntimeError(f"ClickPesa token rejected: {body}")

    token = body["token"]                       # already "Bearer <jwt>"
    _token_cache = (token, time.time() + 3600)  # valid 1 hour
    return token


def initiate_ussd_push(*, phone: str, amount: float, order_reference: str) -> dict:
    """
    Send a mobile-money USSD push to the customer's phone.

    Args:
        phone:           Customer phone (any TZ format — normalized internally).
        amount:          Amount in TZS (integer only).
        order_reference: Unique reference string for this transaction.

    Returns:
        ClickPesa response dict with keys: id, status, channel, orderReference, …

    Raises:
        RuntimeError: with the full ClickPesa error body if the call fails.
    """
    normalized = _normalize_phone(phone)
    payload = {
        "amount":         str(int(round(amount))),
        "currency":       "TZS",
        "orderReference": order_reference,
        "phoneNumber":    normalized,
    }

    print(f"[ClickPesa] USSD push → phone={normalized} amount={payload['amount']} ref={order_reference}")

    resp = requests.post(
        f"{BASE_URL}/third-parties/payments/initiate-ussd-push-request",
        headers={
            "Authorization": _get_token(),
            "Content-Type":  "application/json",
        },
        json=payload,
        timeout=20,
    )

    print(f"[ClickPesa] Response {resp.status_code}: {resp.text}")
    _safe_raise(resp)
    return resp.json()
