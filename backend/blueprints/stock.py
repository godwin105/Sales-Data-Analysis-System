"""
Stock Management API blueprint.

Implements Release 2 of the XP plan — Weeks 3-4.
Covers UC-02 (Manage Stock), UC-08 (Restock Inventory):
    FR-06  Add product
    FR-07  Edit and delete products
    FR-08  Restock product
    FR-10  Low-stock alerts when quantity <= threshold

Endpoints:
    GET    /api/stock
    GET    /api/stock/<id>
    POST   /api/stock                  (add)
    PUT    /api/stock/<id>             (edit)
    POST   /api/stock/<id>/restock
    DELETE /api/stock/<id>
"""
from decimal import Decimal, InvalidOperation
from sqlalchemy import func, exists

from flask import Blueprint, request, jsonify
from flask_jwt_extended import current_user

from extensions import db
from models import Product, SaleItem
from utils.decorators import admin_required

stock_bp = Blueprint("stock", __name__, url_prefix="/api/stock")

# Same categories as the original Jinja2 form
PRODUCT_CATEGORIES = ["Food", "Cleaning", "Beverages", "Other"]


# =========================================================================
# VALIDATION
# =========================================================================
def _validate_decimal(value, field_name, *, min_value=Decimal("0"), required=True):
    if value is None or value == "":
        if required:
            return None, f"{field_name} is required."
        return None, None
    try:
        d = Decimal(str(value))
    except (InvalidOperation, ValueError, TypeError):
        return None, f"{field_name} must be a valid number."
    if d < min_value:
        return None, f"{field_name} cannot be less than {min_value}."
    return d, None


def _validate_int(value, field_name, *, min_value=0, required=True, default=None):
    if value is None or value == "":
        if required:
            return None, f"{field_name} is required."
        return default, None
    try:
        i = int(value)
    except (ValueError, TypeError):
        return None, f"{field_name} must be a whole number."
    if i < min_value:
        return None, f"{field_name} cannot be less than {min_value}."
    return i, None


def _validate_product_payload(data, *, editing_id=None):
    """Validate the body of an add/edit product request. Returns (clean, errors)."""
    errors = {}

    name = (data.get("name") or "").strip()
    if not name:
        errors["name"] = "Product name is required."
    elif len(name) > 100:
        errors["name"] = "Product name is too long (max 100 characters)."

    category = data.get("category")
    if category and category not in PRODUCT_CATEGORIES:
        errors["category"] = f"Category must be one of: {', '.join(PRODUCT_CATEGORIES)}."

    purchase_price, err = _validate_decimal(data.get("purchase_price"), "Purchase price")
    if err:
        errors["purchase_price"] = err

    selling_price, err = _validate_decimal(data.get("selling_price"), "Selling price")
    if err:
        errors["selling_price"] = err

    quantity, err = _validate_int(
        data.get("quantity"), "Quantity",
        required=False, default=0,
    )
    if err:
        errors["quantity"] = err

    low_stock_threshold, err = _validate_int(
        data.get("low_stock_threshold"), "Low stock threshold",
        required=False, default=5,
    )
    if err:
        errors["low_stock_threshold"] = err

    # Duplicate-name check (case-insensitive, per business)
    if not errors.get("name"):
        q = db.session.query(Product).filter(
            Product.user_id == current_user.owner_id,
            func.lower(Product.name) == name.lower(),
            Product.is_deleted.is_(False),
        )
        if editing_id is not None:
            q = q.filter(Product.product_id != editing_id)
        if q.first() is not None:
            errors["name"] = "A product with this name already exists."

    if errors:
        return None, errors

    return {
        "name": name,
        "category": category or None,
        "purchase_price": purchase_price,
        "selling_price": selling_price,
        "quantity": quantity if quantity is not None else 0,
        "low_stock_threshold": low_stock_threshold if low_stock_threshold is not None else 5,
    }, None


def _get_owned_product(product_id):
    """Fetch a product belonging to the current user's business, or None."""
    return db.session.query(Product).filter(
        Product.product_id == product_id,
        Product.user_id == current_user.owner_id,
        Product.is_deleted.is_(False),
    ).first()


# =========================================================================
# ROUTES
# =========================================================================
@stock_bp.route("", methods=["GET"])
@admin_required
def list_products():
    """List all active products. Optional ?q=search."""
    q = (request.args.get("q") or "").strip()

    query = db.session.query(Product).filter(
        Product.user_id == current_user.owner_id,
        Product.is_deleted.is_(False),
    )
    if q:
        query = query.filter(Product.name.ilike(f"%{q}%"))

    products = query.order_by(Product.name.asc()).all()

    return jsonify({
        "products": [p.to_dict() for p in products],
        "categories": PRODUCT_CATEGORIES,
    }), 200


@stock_bp.route("/<int:product_id>", methods=["GET"])
@admin_required
def get_product(product_id):
    """Get a single product by id."""
    product = _get_owned_product(product_id)
    if product is None:
        return jsonify({"error": "Product not found."}), 404
    return jsonify({"product": product.to_dict()}), 200


@stock_bp.route("", methods=["POST"])
@admin_required
def add_product():
    """FR-06: create a new product."""
    data = request.get_json(silent=True) or {}
    clean, errors = _validate_product_payload(data)

    if errors:
        return jsonify({"error": "Validation failed", "fields": errors}), 400

    product = Product(
        user_id=current_user.owner_id,
        name=clean["name"],
        category=clean["category"],
        purchase_price=clean["purchase_price"],
        selling_price=clean["selling_price"],
        quantity=clean["quantity"],
        low_stock_threshold=clean["low_stock_threshold"],
    )
    db.session.add(product)
    db.session.commit()

    return jsonify({
        "message": f"Product '{product.name}' added successfully.",
        "product": product.to_dict(),
    }), 201


@stock_bp.route("/<int:product_id>", methods=["PUT"])
@admin_required
def edit_product(product_id):
    """FR-07: edit existing product."""
    product = _get_owned_product(product_id)
    if product is None:
        return jsonify({"error": "Product not found."}), 404

    data = request.get_json(silent=True) or {}
    clean, errors = _validate_product_payload(data, editing_id=product_id)

    if errors:
        return jsonify({"error": "Validation failed", "fields": errors}), 400

    product.name = clean["name"]
    product.category = clean["category"]
    product.purchase_price = clean["purchase_price"]
    product.selling_price = clean["selling_price"]
    product.quantity = clean["quantity"]
    product.low_stock_threshold = clean["low_stock_threshold"]
    db.session.commit()

    return jsonify({
        "message": f"Product '{product.name}' updated.",
        "product": product.to_dict(),
    }), 200


@stock_bp.route("/<int:product_id>/restock", methods=["POST"])
@admin_required
def restock_product(product_id):
    """FR-08 / UC-08: add stock to an existing product."""
    product = _get_owned_product(product_id)
    if product is None:
        return jsonify({"error": "Product not found."}), 404

    data = request.get_json(silent=True) or {}

    qty, err = _validate_int(data.get("quantity"), "Additional quantity", min_value=1)
    if err:
        return jsonify({"error": "Validation failed", "fields": {"quantity": err}}), 400

    new_purchase_price = None
    if data.get("purchase_price") not in (None, ""):
        d, err = _validate_decimal(data.get("purchase_price"), "Purchase price")
        if err:
            return jsonify({
                "error": "Validation failed",
                "fields": {"purchase_price": err},
            }), 400
        new_purchase_price = d

    product.quantity = (product.quantity or 0) + qty
    if new_purchase_price is not None:
        product.purchase_price = new_purchase_price
    db.session.commit()

    return jsonify({
        "message": (
            f"Restocked {qty} unit(s) of '{product.name}'. "
            f"New quantity: {product.quantity}."
        ),
        "product": product.to_dict(),
    }), 200


@stock_bp.route("/<int:product_id>", methods=["DELETE"])
@admin_required
def delete_product(product_id):
    """Hard delete when safe; soft-delete if product has sales history."""
    product = _get_owned_product(product_id)
    if product is None:
        return jsonify({"error": "Product not found."}), 404

    has_sales = db.session.query(
        exists().where(SaleItem.product_id == product.product_id)
    ).scalar()

    product_name = product.name
    if has_sales:
        product.is_deleted = True
        db.session.commit()
        return jsonify({
            "message": (
                f"Product '{product_name}' has sales history and was archived "
                f"(kept in reports but removed from the active catalogue)."
            ),
            "deletion_type": "soft",
        }), 200
    else:
        db.session.delete(product)
        db.session.commit()
        return jsonify({
            "message": f"Product '{product_name}' deleted.",
            "deletion_type": "hard",
        }), 200
