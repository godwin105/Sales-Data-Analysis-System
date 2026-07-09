from decimal import Decimal, InvalidOperation
from sqlalchemy import func, exists
from sqlalchemy.orm import joinedload

from flask import Blueprint, request, jsonify
from flask_jwt_extended import current_user

from extensions import db
from models import Product, SaleItem, ProductCategory, Unit
from utils.decorators import admin_required, cashier_or_admin_required

stock_bp = Blueprint("stock", __name__, url_prefix="/api/stock")


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


def _validate_quantity(value, field_name, *, min_value=Decimal("0"), required=True):
    d, err = _validate_decimal(value, field_name, min_value=min_value, required=required)
    if err or d is None:
        return d, err
    if d % Decimal("0.25") != 0:
        return None, f"{field_name} must use whole, half (0.5), quarter (0.25), or three-quarter (0.75) units."
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


def _format_decimal(value):
    return f"{Decimal(value or 0):,}"


def _validate_product_payload(data, *, editing_id=None):
    errors = {}

    name = (data.get("name") or "").strip()
    if not name:
        errors["name"] = "Product name is required."
    elif len(name) > 100:
        errors["name"] = "Product name is too long (max 100 characters)."

    # Validate category against the DB lookup table
    category_id = None
    category_name = data.get("category")
    if category_name:
        cat_obj = db.session.query(ProductCategory).filter_by(name=category_name).first()
        if cat_obj is None:
            valid = [c.name for c in db.session.query(ProductCategory).all()]
            errors["category"] = f"Category must be one of: {', '.join(valid)}."
        else:
            category_id = cat_obj.id

    # Validate unit against the DB lookup table
    unit_symbol = (data.get("unit") or "pcs").strip()
    unit_obj = db.session.query(Unit).filter_by(symbol=unit_symbol).first()
    if unit_obj is None:
        valid = [u.symbol for u in db.session.query(Unit).all()]
        errors["unit"] = f"Unit must be one of: {', '.join(valid)}."
    unit_id = unit_obj.id if unit_obj else None

    purchase_price, err = _validate_decimal(data.get("purchase_price"), "Purchase price")
    if err:
        errors["purchase_price"] = err

    selling_price, err = _validate_decimal(data.get("selling_price"), "Selling price")
    if err:
        errors["selling_price"] = err

    quantity, err = _validate_quantity(
        data.get("quantity"), "Quantity",
        min_value=Decimal("0"),
        required=False,
    )
    if err:
        errors["quantity"] = err

    low_stock_threshold, err = _validate_quantity(
        data.get("low_stock_threshold"), "Low stock threshold",
        min_value=Decimal("0"),
        required=False,
    )
    if err:
        errors["low_stock_threshold"] = err

    # Optional barcode — max 50 chars, unique per business
    barcode = (data.get("barcode") or "").strip() or None
    if barcode and len(barcode) > 50:
        errors["barcode"] = "Barcode is too long (max 50 characters)."
    elif barcode:
        q = db.session.query(Product).filter(
            Product.user_id == current_user.owner_id,
            Product.barcode == barcode,
            Product.is_deleted.is_(False),
        )
        if editing_id is not None:
            q = q.filter(Product.product_id != editing_id)
        if q.first() is not None:
            errors["barcode"] = "Another product already has this barcode."

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
        "name":                name,
        "barcode":             barcode,
        "category_id":         category_id,
        "unit_id":             unit_id,
        "purchase_price":      purchase_price,
        "selling_price":       selling_price,
        "quantity":            quantity if quantity is not None else Decimal("0"),
        "low_stock_threshold": low_stock_threshold if low_stock_threshold is not None else Decimal("5"),
    }, None


def _get_owned_product(product_id):
    return (
        db.session.query(Product)
        .options(joinedload(Product.category_obj), joinedload(Product.unit_obj))
        .filter(
            Product.product_id == product_id,
            Product.user_id == current_user.owner_id,
            Product.is_deleted.is_(False),
        )
        .first()
    )


# ── Custom category creation ──────────────────────────────────────────────────
@stock_bp.route("/categories", methods=["POST"])
@admin_required
def add_category():
    """Allow business owner to create a custom product category."""
    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip()
    if not name:
        return jsonify({"error": "Category name is required."}), 400
    if len(name) > 50:
        return jsonify({"error": "Category name too long (max 50 characters)."}), 400
    existing = db.session.query(ProductCategory).filter(
        func.lower(ProductCategory.name) == name.lower()
    ).first()
    if existing:
        return jsonify({"error": f"Category '{existing.name}' already exists."}), 409
    cat = ProductCategory(name=name)
    db.session.add(cat)
    db.session.commit()
    return jsonify({"name": cat.name, "message": f"Category '{cat.name}' created."}), 201


#routes
@stock_bp.route("", methods=["GET"])
@admin_required
def list_products():
    #List all active products. Optional ?q=search.
    q = (request.args.get("q") or "").strip()

    query = db.session.query(Product).filter(
        Product.user_id == current_user.owner_id,
        Product.is_deleted.is_(False),
    )
    if q:
        query = query.filter(Product.name.ilike(f"%{q}%"))

    products = (
        query
        .options(joinedload(Product.category_obj), joinedload(Product.unit_obj))
        .order_by(Product.name.asc())
        .all()
    )

    categories = [c.name for c in db.session.query(ProductCategory).order_by(ProductCategory.name).all()]
    units = [u.symbol for u in db.session.query(Unit).order_by(Unit.id).all()]

    return jsonify({
        "products":   [p.to_dict() for p in products],
        "categories": categories,
        "units":      units,
    }), 200


@stock_bp.route("/<int:product_id>", methods=["GET"])
@admin_required
def get_product(product_id):
#Get a single product by id
    product = _get_owned_product(product_id)
    if product is None:
        return jsonify({"error": "Product not found."}), 404
    return jsonify({"product": product.to_dict()}), 200


@stock_bp.route("", methods=["POST"])
@admin_required
def add_product():
    #FR-06: create a new product
    data = request.get_json(silent=True) or {}
    clean, errors = _validate_product_payload(data)

    if errors:
        return jsonify({"error": "Validation failed", "fields": errors}), 400

    product = Product(
        user_id=current_user.owner_id,
        name=clean["name"],
        barcode=clean["barcode"],
        category_id=clean["category_id"],
        unit_id=clean["unit_id"],
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
    #edit existing product
    product = _get_owned_product(product_id)
    if product is None:
        return jsonify({"error": "Product not found."}), 404

    data = request.get_json(silent=True) or {}
    clean, errors = _validate_product_payload(data, editing_id=product_id)

    if errors:
        return jsonify({"error": "Validation failed", "fields": errors}), 400

    product.name = clean["name"]
    product.barcode = clean["barcode"]
    product.category_id = clean["category_id"]
    product.unit_id = clean["unit_id"]
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
    #"""add stock to an existing product
    product = _get_owned_product(product_id)
    if product is None:
        return jsonify({"error": "Product not found."}), 404

    data = request.get_json(silent=True) or {}

    qty, err = _validate_quantity(
        data.get("quantity"), "Additional quantity",
        min_value=Decimal("0.25"),
    )
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

    price_paid = new_purchase_price if new_purchase_price is not None else (product.purchase_price or Decimal("0"))
    product.quantity = (product.quantity or Decimal("0")) + qty
    if new_purchase_price is not None:
        product.purchase_price = new_purchase_price

    db.session.commit()

    return jsonify({
        "message": (
            f"Restocked {_format_decimal(qty)} unit(s) of '{product.name}'. "
            f"New quantity: {_format_decimal(product.quantity)}."
        ),
        "product": product.to_dict(),
    }), 200


@stock_bp.route("/barcode/<barcode>", methods=["GET"])
@cashier_or_admin_required
def get_by_barcode(barcode):
    """Look up a product by barcode — used by the scanner in Record Sale."""
    product = (
        db.session.query(Product)
        .options(joinedload(Product.category_obj), joinedload(Product.unit_obj))
        .filter(
            Product.user_id == current_user.owner_id,
            Product.barcode == barcode.strip(),
            Product.is_deleted.is_(False),
        )
        .first()
    )
    if product is None:
        return jsonify({"error": "No product found with that barcode."}), 404
    return jsonify({"product": product.to_dict()}), 200


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
