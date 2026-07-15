"""
Payment blueprint — ClickPesa mobile-money integration.

Routes:
  POST /api/payments/initiate         Record sale + push USSD to customer phone
  GET  /api/payments/status/<ref>     Poll payment status (called by frontend)
  POST /api/payments/callback         ClickPesa webhook (no JWT, external call)
"""
import uuid
import threading
import traceback
from decimal import Decimal, InvalidOperation

from flask import Blueprint, request, jsonify, current_app
from flask_jwt_extended import current_user
from sqlalchemy.exc import SQLAlchemyError

from extensions import db
from models import Product, Sale, SaleItem, Payment, User
from utils.decorators import cashier_or_admin_required
from utils.time import eat_now, isoformat_eat
import time as _time

from services.clickpesa import initiate_ussd_push, check_payment_status

payments_bp = Blueprint("payments", __name__, url_prefix="/api/payments")


def _poll_clickpesa(app, order_ref, tx_id, client_id, api_key, expiry_secs):
    """
    Poll ClickPesa's payment status API every 5 s as a webhook fallback.
    Runs in the same background thread as _push(), after the initial push commit.
    Stops as soon as the payment is resolved or the USSD session deadline passes.
    """
    success_signals = {"SUCCESS", "SUCCESSFUL", "COMPLETED", "PAID", "PROCESSING"}
    failed_signals  = {"FAILED", "FAILURE", "DECLINED", "CANCELLED", "CANCELED", "REJECTED"}

    _time.sleep(8)  # Give customer time to see and respond to the USSD prompt
    deadline = _time.time() + expiry_secs - 12  # Stop before the auto-fail window

    while _time.time() < deadline:
        with app.app_context():
            try:
                pay = db.session.query(Payment).filter_by(external_id=order_ref).first()
                if not pay or pay.status != "pending":
                    print(f"[ClickPesa poll] {order_ref} already resolved, stopping")
                    return

                data    = check_payment_status(order_ref, client_id=client_id, api_key=api_key)
                raw     = (data.get("status") or "").upper()
                col     = (data.get("collectionStatus") or "").upper()
                print(f"[ClickPesa poll] {order_ref} → status={raw!r} collection={col!r}")

                if raw in success_signals or col == "SUCCESS":
                    pay.status            = "confirmed"
                    pay.confirmed_at      = eat_now()
                    pay.sale.payment_status = "confirmed"
                    if data.get("channel"):
                        pay.provider = data["channel"]
                    db.session.commit()
                    print(f"[ClickPesa poll] CONFIRMED {order_ref}")
                    return
                elif raw in failed_signals:
                    pay.status              = "failed"
                    pay.sale.payment_status = "failed"
                    db.session.commit()
                    print(f"[ClickPesa poll] FAILED {order_ref}")
                    return

            except SQLAlchemyError:
                db.session.rollback()
            except Exception as exc:
                print(f"[ClickPesa poll] status check unavailable ({exc}), stopping poll")
                return  # Status endpoint might not exist — webhook is the only path

        _time.sleep(5)


# ── Initiate ──────────────────────────────────────────────────────────────────
@payments_bp.route("/initiate", methods=["POST"])
@cashier_or_admin_required
def initiate():
    """Record sale and push a USSD payment prompt to the customer's phone."""
    owner_id = current_user.owner_id
    data     = request.get_json(silent=True) or {}

    phone = (data.get("phone") or "").strip()
    if not phone:
        return jsonify({"error": "Customer phone number is required."}), 400

    raw_items = data.get("items") or []
    if not isinstance(raw_items, list) or not raw_items:
        return jsonify({"error": "Please add at least one product."}), 400

    qty_per_product = {}
    for item in raw_items:
        if not isinstance(item, dict):
            return jsonify({"error": "Invalid sale data."}), 400
        try:
            pid = int(item["product_id"])
            qty = Decimal(str(item["quantity"]))
        except (KeyError, TypeError, ValueError, InvalidOperation):
            return jsonify({"error": "Invalid product or quantity."}), 400
        if qty <= 0:
            return jsonify({"error": "Quantity must be positive."}), 400
        qty_per_product[pid] = qty_per_product.get(pid, Decimal("0")) + qty

    notes = (data.get("notes") or "").strip() or None

    try:
        total_amount   = Decimal("0")
        resolved_items = []

        for pid, qty in qty_per_product.items():
            product = (
                db.session.query(Product)
                .filter(
                    Product.product_id == pid,
                    Product.user_id    == owner_id,
                    Product.is_deleted.is_(False),
                )
                .with_for_update()
                .first()
            )
            if not product:
                raise ValueError(f"Product #{pid} not found.")
            if product.quantity < qty:
                raise ValueError(
                    f"Insufficient stock for '{product.name}' — "
                    f"only {product.quantity} available."
                )
            subtotal = product.selling_price * qty
            total_amount += subtotal
            resolved_items.append((product, qty, product.selling_price, subtotal))

        order_ref = f"BSALE{uuid.uuid4().hex[:14].upper()}"

        sale = Sale(
            user_id        = owner_id,
            recorded_by    = current_user.user_id,
            total_amount   = total_amount,
            sale_date      = eat_now(),
            notes          = notes,
            payment_method = "mobile_money",
            payment_status = "pending",
        )
        db.session.add(sale)
        db.session.flush()

        for product, qty, unit_price, subtotal in resolved_items:
            db.session.add(SaleItem(
                sale_id    = sale.sale_id,
                product_id = product.product_id,
                quantity   = qty,
                unit_price = unit_price,
                subtotal   = subtotal,
            ))
            product.quantity -= qty

        payment = Payment(
            sale_id      = sale.sale_id,
            provider     = "mobile_money",
            phone_number = phone,
            amount       = total_amount,
            external_id  = order_ref,
            status       = "pending",
        )
        db.session.add(payment)

        # Commit stock deduction and pending records immediately so the
        # response reaches the cashier without waiting for ClickPesa.
        db.session.commit()

        low_stock = [
            p.name for (p, _, _, _) in resolved_items
            if p.quantity <= p.low_stock_threshold
        ]

        # ── Send USSD push in background thread ───────────────────────────────
        owner = db.session.get(User, owner_id)
        owner_client_id = (owner.clickpesa_client_id if owner else None) or None
        owner_api_key   = (owner.clickpesa_api_key   if owner else None) or None

        app = current_app._get_current_object()
        # Build the webhook callback URL from the configured app base URL so
        # ClickPesa can deliver payment results even if the dashboard setting
        # is missing or wrong.
        base_url = current_app.config.get("APP_BASE_URL", "").rstrip("/")
        cb_url = f"{base_url}/api/payments/callback" if base_url else None

        def _push():
            cp_tx_id = None
            with app.app_context():
                try:
                    cp_resp = initiate_ussd_push(
                        phone           = phone,
                        amount          = float(total_amount),
                        order_reference = order_ref,
                        client_id       = owner_client_id,
                        api_key         = owner_api_key,
                        callback_url    = cb_url,
                    )
                    # Update channel / transaction_id from ClickPesa response
                    pay = db.session.query(Payment).filter_by(external_id=order_ref).first()
                    if pay:
                        if cp_resp.get("channel"):
                            pay.provider = cp_resp["channel"]
                        if cp_resp.get("id"):
                            pay.transaction_id = cp_resp["id"]
                            cp_tx_id = cp_resp["id"]

                        # ClickPesa returns collectedAmount in the push response when
                        # money is collected synchronously (e.g. Airtel Money direct debit).
                        # PROCESSING = collected from customer, settlement in progress.
                        resp_status = (cp_resp.get("status") or "").upper()
                        try:
                            collected = float(cp_resp.get("collectedAmount") or 0)
                        except (TypeError, ValueError):
                            collected = 0.0

                        _sync_success = {"PROCESSING", "SUCCESS", "SUCCESSFUL", "COMPLETED", "PAID"}
                        if resp_status in _sync_success and collected > 0:
                            pay.status              = "confirmed"
                            pay.confirmed_at        = eat_now()
                            pay.sale.payment_status = "confirmed"
                            cp_tx_id = None  # No need to poll
                            print(f"[ClickPesa] Confirmed from push response: ref={order_ref} status={resp_status} collected={collected}")

                        db.session.commit()
                except Exception:
                    traceback.print_exc()
                    # Push failed — mark payment failed and restore stock
                    try:
                        pay = db.session.query(Payment).filter_by(external_id=order_ref).first()
                        if pay and pay.status == "pending":
                            for item in pay.sale.items:
                                prod = (
                                    db.session.query(Product)
                                    .filter_by(product_id=item.product_id)
                                    .with_for_update()
                                    .first()
                                )
                                if prod:
                                    prod.quantity += item.quantity
                            pay.status = "failed"
                            pay.sale.payment_status = "failed"
                            db.session.commit()
                    except Exception:
                        db.session.rollback()
                        traceback.print_exc()
                    return  # Push failed — skip polling

            # Push succeeded but response had no collectedAmount — poll ClickPesa
            # using the orderReference as fallback for webhook-less confirmation.
            if cp_tx_id:
                _poll_clickpesa(app, order_ref, order_ref, owner_client_id, owner_api_key, USSD_EXPIRY_SECONDS)

        threading.Thread(target=_push, daemon=True).start()

        return jsonify({
            "sale_id":            sale.sale_id,
            "external_id":        order_ref,
            "status":             "pending",
            "amount":             float(total_amount),
            "customer_amount":    float(total_amount),
            "channel":            None,
            "low_stock_warnings": low_stock,
            "message":            f"Payment request sent to {phone}. Waiting for customer to confirm.",
        }), 201

    except ValueError as ve:
        db.session.rollback()
        return jsonify({"error": str(ve)}), 400
    except SQLAlchemyError:
        db.session.rollback()
        return jsonify({"error": "Could not record sale. Please try again."}), 500


# ── Poll status ───────────────────────────────────────────────────────────────
USSD_EXPIRY_SECONDS = 120  # auto-fail after 120 seconds if no webhook received

@payments_bp.route("/status/<external_id>", methods=["GET"])
@cashier_or_admin_required
def payment_status(external_id):
    """Frontend polls this every few seconds until status != 'pending'."""
    payment = db.session.query(Payment).filter_by(external_id=external_id).first()
    if not payment:
        return jsonify({"error": "Payment not found."}), 404

    if payment.sale.user_id != current_user.owner_id:
        return jsonify({"error": "Forbidden."}), 403

    # Auto-fail if still pending after USSD session has clearly expired.
    # This handles the case where the customer cancelled but the ClickPesa
    # webhook was never received (e.g. webhook URL not yet configured).
    if payment.status == "pending":
        elapsed = (eat_now() - payment.initiated_at).total_seconds()
        if elapsed > USSD_EXPIRY_SECONDS:
            payment.status = "failed"
            payment.sale.payment_status = "failed"
            try:
                db.session.commit()
            except SQLAlchemyError:
                db.session.rollback()

    return jsonify({
        "external_id":    payment.external_id,
        "status":         payment.status,
        "provider":       payment.provider,
        "phone_number":   payment.phone_number,
        "amount":         float(payment.amount),
        "transaction_id": payment.transaction_id,
        "confirmed_at":   isoformat_eat(payment.confirmed_at),
    }), 200


# ── Cancel payment (reverse sale + restore stock) ────────────────────────────
@payments_bp.route("/<external_id>/cancel", methods=["POST"])
@cashier_or_admin_required
def cancel_payment(external_id):
    """
    Cancel a pending or failed mobile-money payment.
    Restores stock and deletes the sale record so it never appears in history.
    Only allowed while the payment hasn't been confirmed (money not received).
    """
    payment = db.session.query(Payment).filter_by(external_id=external_id).first()
    if not payment:
        return jsonify({"error": "Payment not found."}), 404
    if payment.sale.user_id != current_user.owner_id:
        return jsonify({"error": "Forbidden."}), 403
    if payment.status == "confirmed":
        return jsonify({"error": "Cannot cancel a confirmed payment."}), 409

    sale = payment.sale

    # Restore stock for each item — lock rows to prevent a race with a late webhook
    for item in sale.items:
        product = (
            db.session.query(Product)
            .filter_by(product_id=item.product_id)
            .with_for_update()
            .first()
        )
        if product:
            product.quantity += item.quantity

    # Delete payment explicitly first so SQLAlchemy doesn't get confused by the
    # bidirectional relationship when the sale is deleted next.
    db.session.delete(payment)
    db.session.flush()

    # Delete sale — ORM cascade removes all SaleItems automatically.
    db.session.delete(sale)

    try:
        db.session.commit()
    except SQLAlchemyError:
        db.session.rollback()
        return jsonify({"error": "Could not cancel payment. Please try again."}), 500

    return jsonify({"message": "Payment cancelled and sale reversed."}), 200


# ── ClickPesa webhook (no JWT — external call) ────────────────────────────────
@payments_bp.route("/callback", methods=["POST"])
def clickpesa_callback():
    """
    ClickPesa POSTs here when a payment completes or fails.
    Configure this URL in ClickPesa Dashboard → Settings → Developers → Webhooks
    (Application-level webhook, PAYMENT RECEIVED / PAYMENT FAILED events).

    For local dev: expose via ngrok → ngrok http 5000
    Then set URL to: https://<ngrok-id>.ngrok.io/api/payments/callback
    """
    data = request.get_json(silent=True) or {}
    print(f"[ClickPesa callback] payload: {data}")

    # ClickPesa webhook payload — try multiple field name variations
    order_ref = (
        data.get("orderReference")
        or data.get("order_reference")
        or data.get("OrderReference")
        or ""
    ).strip()

    status_raw = (
        data.get("status") or data.get("Status") or ""
    ).upper()

    event = (
        data.get("event") or data.get("Event") or data.get("eventType") or ""
    ).upper()

    tx_id = (
        data.get("id") or data.get("transactionId") or data.get("transaction_id") or ""
    )

    if not order_ref:
        print(f"[ClickPesa callback] WARNING: no orderReference in payload keys={list(data.keys())}")
        return jsonify({"message": "ok"}), 200

    payment = db.session.query(Payment).filter_by(external_id=order_ref).first()
    if not payment:
        print(f"[ClickPesa callback] WARNING: payment not found for ref={order_ref}")
        return jsonify({"message": "ok"}), 200
    if payment.status != "pending":
        print(f"[ClickPesa callback] payment {order_ref} already {payment.status}, skipping")
        return jsonify({"message": "ok"}), 200

    # Map ClickPesa status → internal status (handle multiple variants)
    # "PROCESSING" means ClickPesa collected from the customer; settlement to
    # merchant is still processing but the money is guaranteed — treat as success.
    success_signals = {"SUCCESS", "SUCCESSFUL", "COMPLETED", "PAID", "PROCESSING"}
    failed_signals  = {"FAILED", "FAILURE", "DECLINED", "CANCELLED", "CANCELED", "REJECTED"}
    success_events  = {"PAYMENT RECEIVED", "PAYMENT_RECEIVED", "PAYMENT SUCCESS", "PAYMENT_SUCCESS"}
    failed_events   = {"PAYMENT FAILED", "PAYMENT_FAILED", "PAYMENT FAILURE", "PAYMENT_FAILURE"}

    # ClickPesa sends two status fields: "status" (settlement) and "collectionStatus"
    # (collection from customer). Either SUCCESS means money was received.
    collection_status = (
        data.get("collectionStatus") or data.get("collection_status") or ""
    ).upper()

    if status_raw in success_signals or event in success_events or collection_status == "SUCCESS":
        new_status = "confirmed"
        print(f"[ClickPesa callback] CONFIRMED ref={order_ref} status={status_raw} event={event} collection={collection_status}")
    elif status_raw in failed_signals or event in failed_events:
        new_status = "failed"
        print(f"[ClickPesa callback] FAILED ref={order_ref} status={status_raw} event={event}")
    else:
        print(f"[ClickPesa callback] UNRECOGNIZED ref={order_ref} status={status_raw!r} event={event!r} collection={collection_status!r}")
        return jsonify({"message": "ok"}), 200

    payment.status = new_status
    if tx_id:
        payment.transaction_id = str(tx_id)
    if new_status == "confirmed":
        payment.confirmed_at = eat_now()

    payment.sale.payment_status = new_status

    # Update channel if ClickPesa tells us which network processed it
    if data.get("channel"):
        payment.provider = data["channel"]

    try:
        db.session.commit()
    except SQLAlchemyError:
        db.session.rollback()

    return jsonify({"message": "ok"}), 200
