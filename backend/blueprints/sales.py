from datetime import datetime
from decimal import Decimal

from flask import Blueprint, request, jsonify
from flask_jwt_extended import current_user
from sqlalchemy.exc import SQLAlchemyError

from extensions import db
from models import Product, Sale, SaleItem
from utils.decorators import cashier_or_admin_required

sales_bp = Blueprint("sales", __name__, url_prefix="/api/sales")


@sales_bp.route("/products", methods=["GET"])
@cashier_or_admin_required
def in_stock_products():
    #List products available to sell (qty > 0, not deleted).
    products = (
        db.session.query(Product)
        .filter(
            Product.user_id == current_user.owner_id,
            Product.quantity > 0,
            Product.is_deleted.is_(False),
        )
        .order_by(Product.name.asc())
        .all()
    )
    return jsonify({"products": [p.to_dict() for p in products]}), 200


@sales_bp.route("", methods=["POST"])
@cashier_or_admin_required
def record_sale():
    #......record a new multi-item sale.
    owner_id = current_user.owner_id
    data = request.get_json(silent=True) or {}

    raw_items = data.get("items") or []

    if not isinstance(raw_items, list) or len(raw_items) == 0:
        return jsonify({"error": "Please add at least one product to the sale."}), 400

    # Aggregate items per product (handle duplicates)
    qty_per_product = {}
    for item in raw_items:
        from decimal import Decimal, InvalidOperation
        if not isinstance(item, dict):
            return jsonify({"error": "Invalid sale submission."}), 400
        try:
            pid = int(item.get("product_id"))
            qty = Decimal(str(item.get("quantity")))
        except (TypeError, ValueError, InvalidOperation):
            return jsonify({"error": "Product or quantity had invalid value."}), 400

        if qty < Decimal("0"):
            return jsonify({"error": "Quantity must be a positive number."}), 400

        qty_per_product[pid] = qty_per_product.get(pid, Decimal("0")) + qty

    if not qty_per_product:
        return jsonify({"error": "Please add at least one product to the sale."}), 400

    notes = (data.get("notes") or "").strip() or None

    # Stock check & write in a transaction with row-level locks
    try:
        total_amount = Decimal("0")
        resolved_items = []  # (Product, qty, unit_price, subtotal)

        for pid, qty in qty_per_product.items():
            product = (
                db.session.query(Product)
                .filter(
                    Product.product_id == pid,
                    Product.user_id == owner_id,
                    Product.is_deleted.is_(False),
                )
                .with_for_update()
                .first()
            )
            if product is None:
                raise ValueError(f"Product #{pid} not found in your catalogue.")

            if product.quantity < qty:
                raise ValueError(
                    f"Insufficient stock for '{product.name}' — "
                    f"only {product.quantity} available, you tried to sell {qty}."
                )

            unit_price = product.selling_price
            subtotal = unit_price * qty
            total_amount += subtotal
            resolved_items.append((product, qty, unit_price, subtotal))

        sale = Sale(
            user_id=owner_id,
            recorded_by=current_user.user_id,
            total_amount=total_amount,
            sale_date=datetime.utcnow(),
            notes=notes,
        )
        db.session.add(sale)
        db.session.flush()  # assign sale_id

        for product, qty, unit_price, subtotal in resolved_items:
            db.session.add(SaleItem(
                sale_id=sale.sale_id,
                product_id=product.product_id,
                quantity=qty,
                unit_price=unit_price,
                subtotal=subtotal,
            ))
            product.quantity -= qty

        db.session.commit()

        # Detect any low-stock warnings triggered by this sale (FR-10)
        low_stock_now = [
            p.name for (p, _, _, _) in resolved_items
            if p.quantity <= p.low_stock_threshold
        ]

        return jsonify({
            "message": f"Sale recorded — total TZS {total_amount:,.0f}. Stock updated.",
            "sale": sale.to_dict(include_items=True),
            "low_stock_warnings": low_stock_now,
        }), 201

    except ValueError as ve:
        db.session.rollback()
        return jsonify({"error": str(ve)}), 400

    except SQLAlchemyError:
        db.session.rollback()
        return jsonify({"error": "Sale could not be recorded. Please try again."}), 500


@sales_bp.route("", methods=["GET"])
@cashier_or_admin_required
def history():
    """UC-09 / FR-15: searchable, filterable sales history."""
    q = (request.args.get("q") or "").strip()
    date_from = (request.args.get("from") or "").strip()
    date_to = (request.args.get("to") or "").strip()

    query = db.session.query(Sale).filter_by(user_id=current_user.owner_id)

    warnings = []

    if date_from:
        try:
            dt = datetime.strptime(date_from, "%Y-%m-%d")
            query = query.filter(Sale.sale_date >= dt)
        except ValueError:
            warnings.append("Invalid 'From' date — ignored.")

    if date_to:
        try:
            dt = datetime.strptime(date_to, "%Y-%m-%d").replace(
                hour=23, minute=59, second=59
            )
            query = query.filter(Sale.sale_date <= dt)
        except ValueError:
            warnings.append("Invalid 'To' date — ignored.")

    sales = query.order_by(Sale.sale_date.desc()).limit(200).all()

    # Text search across recorder name + product names
    if q:
        q_lower = q.lower()
        sales = [
            s for s in sales
            if (s.recorder and q_lower in s.recorder.full_name.lower())
            or any(i.product and q_lower in i.product.name.lower() for i in s.items)
        ]

    return jsonify({
        "sales": [s.to_dict(include_items=True) for s in sales],
        "filters": {"q": q, "date_from": date_from, "date_to": date_to},
        "warnings": warnings,
    }), 200


@sales_bp.route("/<int:sale_id>", methods=["GET"])
@cashier_or_admin_required
def get_sale(sale_id):
    """Get a single sale with all line items."""
    sale = db.session.query(Sale).filter_by(
        sale_id=sale_id, user_id=current_user.owner_id,
    ).first()
    if sale is None:
        return jsonify({"error": "Sale not found."}), 404
    return jsonify({"sale": sale.to_dict(include_items=True)}), 200
