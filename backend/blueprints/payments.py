"""
Payment blueprint — ClickPesa mobile-money integration.

Routes:
  POST /api/payments/initiate         Record sale + push USSD to customer phone
  GET  /api/payments/status/<ref>     Poll payment status (called by frontend)
  POST /api/payments/callback         ClickPesa webhook (no JWT, external call)
"""
import uuid
import traceback
from datetime import datetime
from decimal import Decimal, InvalidOperation

from flask import Blueprint, request, jsonify
from flask_jwt_extended import current_user
from sqlalchemy.exc import SQLAlchemyError

from extensions import db
from models import Product, Sale, SaleItem, Payment
from utils.decorators import cashier_or_admin_required
from services.clickpesa import initiate_ussd_push

payments_bp = Blueprint("payments", __name__, url_prefix="/api/payments")


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
            sale_date      = datetime.now(),
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
        # Do NOT commit yet — push must succeed first.

        # ── Send USSD push via ClickPesa ──────────────────────────────────────
        try:
            cp_resp = initiate_ussd_push(
                phone           = phone,
                amount          = float(total_amount),
                order_reference = order_ref,
            )
        except Exception as exc:
            # Push failed before reaching the customer — roll back everything
            # so no sale or stock change is recorded.
            db.session.rollback()
            traceback.print_exc()
            return jsonify({
                "error": (
                    f"Payment push failed: {exc}. "
                    "The sale was NOT recorded — please try again."
                ),
            }), 502

        # Push reached the customer's phone — now commit the sale.
        channel         = cp_resp.get("channel") or None
        customer_amount = float(total_amount)

        if channel:
            payment.provider = channel
        if cp_resp.get("id"):
            payment.transaction_id = cp_resp["id"]
        if cp_resp.get("collectedAmount"):
            try:
                customer_amount = float(cp_resp["collectedAmount"])
            except (TypeError, ValueError):
                pass

        db.session.commit()

        low_stock = [
            p.name for (p, _, _, _) in resolved_items
            if p.quantity <= p.low_stock_threshold
        ]

        return jsonify({
            "sale_id":            sale.sale_id,
            "external_id":        order_ref,
            "status":             "pending",
            "amount":             float(total_amount),
            "customer_amount":    customer_amount,
            "channel":            channel,
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
@payments_bp.route("/status/<external_id>", methods=["GET"])
@cashier_or_admin_required
def payment_status(external_id):
    """Frontend polls this every few seconds until status != 'pending'."""
    payment = db.session.query(Payment).filter_by(external_id=external_id).first()
    if not payment:
        return jsonify({"error": "Payment not found."}), 404

    if payment.sale.user_id != current_user.owner_id:
        return jsonify({"error": "Forbidden."}), 403

    return jsonify({
        "external_id":    payment.external_id,
        "status":         payment.status,
        "provider":       payment.provider,
        "phone_number":   payment.phone_number,
        "amount":         float(payment.amount),
        "transaction_id": payment.transaction_id,
        "confirmed_at":   payment.confirmed_at.isoformat() if payment.confirmed_at else None,
    }), 200


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

    # ClickPesa webhook payload fields
    order_ref  = (data.get("orderReference") or "").strip()
    status_raw = (data.get("status") or "").upper()          # "SUCCESS" or "FAILED"
    event      = (data.get("event") or "").upper()
    tx_id      = data.get("id") or data.get("transactionId") or ""

    if not order_ref:
        return jsonify({"message": "ok"}), 200

    payment = db.session.query(Payment).filter_by(external_id=order_ref).first()
    if not payment or payment.status != "pending":
        return jsonify({"message": "ok"}), 200

    # Map ClickPesa status → internal status
    if status_raw == "SUCCESS" or event == "PAYMENT RECEIVED":
        new_status = "confirmed"
    elif status_raw == "FAILED" or event == "PAYMENT FAILED":
        new_status = "failed"
    else:
        return jsonify({"message": "ok"}), 200

    payment.status = new_status
    if tx_id:
        payment.transaction_id = str(tx_id)
    if new_status == "confirmed":
        payment.confirmed_at = datetime.utcnow()

    payment.sale.payment_status = new_status

    # Update channel if ClickPesa tells us which network processed it
    if data.get("channel"):
        payment.provider = data["channel"]

    try:
        db.session.commit()
    except SQLAlchemyError:
        db.session.rollback()

    return jsonify({"message": "ok"}), 200
