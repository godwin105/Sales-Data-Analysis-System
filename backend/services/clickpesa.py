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

# Platform-credential token cache: (token_string, expires_at_epoch)
_token_cache: tuple[str, float] = ("", 0.0)

# Per-owner token cache: { "client_id:api_key" -> (token_string, expires_at_epoch) }
_owner_token_cache: dict[str, tuple[str, float]] = {}

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


def _get_token(client_id: str = None, api_key: str = None) -> str:
    """
    Return a valid Bearer token string (includes "Bearer " prefix).
    If owner-specific credentials are provided, fetches a fresh token for them
    (not cached — per-owner calls are infrequent).
    Platform credentials use a module-level cache.
    """
    global _token_cache

    if client_id and api_key:
        # Owner-specific credentials — cache per owner (55-min window)
        cache_key = f"{client_id}:{api_key}"
        cached_tok, cached_exp = _owner_token_cache.get(cache_key, ("", 0.0))
        if cached_tok and time.time() < cached_exp - 60:
            return cached_tok

        resp = requests.post(
            f"{BASE_URL}/third-parties/generate-token",
            headers={"client-id": client_id, "api-key": api_key},
            timeout=15,
        )
        _safe_raise(resp)
        body = resp.json()
        if not body.get("success"):
            raise RuntimeError(f"ClickPesa token rejected: {body}")
        token = body["token"]
        _owner_token_cache[cache_key] = (token, time.time() + 3600)
        return token

    # Platform credentials — use module-level cache
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


def initiate_ussd_push(
    *,
    phone: str,
    amount: float,
    order_reference: str,
    client_id: str = None,
    api_key: str = None,
    callback_url: str = None,
) -> dict:
    """
    Send a mobile-money USSD push to the customer's phone.

    Pass client_id + api_key to use the business owner's own ClickPesa merchant
    account (money goes directly to them). Omit to use the platform credentials.
    Pass callback_url to include a per-request webhook URL in the body (supported
    by some ClickPesa API versions — acts as backup to the dashboard setting).
    """
    normalized = _normalize_phone(phone)
    payload = {
        "amount":         str(int(round(amount))),
        "currency":       "TZS",
        "orderReference": order_reference,
        "phoneNumber":    normalized,
    }
    if callback_url:
        payload["callbackUrl"] = callback_url

    account = "owner" if (client_id and api_key) else "platform"
    print(f"[ClickPesa] USSD push → phone={normalized} amount={payload['amount']} ref={order_reference} account={account}")

    resp = requests.post(
        f"{BASE_URL}/third-parties/payments/initiate-ussd-push-request",
        headers={
            "Authorization": _get_token(client_id=client_id, api_key=api_key),
            "Content-Type":  "application/json",
        },
        json=payload,
        timeout=20,
    )

    print(f"[ClickPesa] Response {resp.status_code}: {resp.text}")
    _safe_raise(resp)
    return resp.json()


def check_payment_status(order_reference: str, client_id: str = None, api_key: str = None) -> dict:
    """
    Query ClickPesa for the current status of a USSD push payment by orderReference.
    Used to poll for confirmation when webhooks are not delivered.
    Raises RuntimeError if the endpoint is unavailable.
    """
    resp = requests.get(
        f"{BASE_URL}/third-parties/payments/{order_reference}",
        headers={"Authorization": _get_token(client_id=client_id, api_key=api_key)},
        timeout=10,
    )
    print(f"[ClickPesa status] GET {order_reference} → {resp.status_code}: {resp.text[:200]}")
    _safe_raise(resp)
    return resp.json()
