import json

from flask import Blueprint, jsonify
from flask_jwt_extended import current_user
from sqlalchemy.exc import SQLAlchemyError

from extensions import db
from models import Notification, Product
from utils.decorators import cashier_or_admin_required

notifications_bp = Blueprint("notifications", __name__, url_prefix="/api/notifications")


@notifications_bp.route("", methods=["GET"])
@cashier_or_admin_required
def list_notifications():
    owner_id = current_user.owner_id
    rows = (
        db.session.query(Notification)
        .filter_by(user_id=owner_id)
        .order_by(Notification.created_at.desc())
        .limit(50)
        .all()
    )
    stock_product_ids = {
        n.related_id
        for n in rows
        if n.type in {"low_stock", "out_of_stock"} and n.related_id is not None
    }
    products_by_id = {}
    if stock_product_ids:
        products = (
            db.session.query(Product)
            .filter(
                Product.user_id == owner_id,
                Product.product_id.in_(stock_product_ids),
            )
            .all()
        )
        products_by_id = {p.product_id: p for p in products}

    unread_count = sum(1 for n in rows if not n.is_read)
    return jsonify({
        "notifications": [_notification_dict(n, products_by_id) for n in rows],
        "unread_count": unread_count,
    }), 200


def _notification_dict(notification, products_by_id):
    data = notification.to_dict()
    product = products_by_id.get(notification.related_id)
    if not product or notification.type not in {"low_stock", "out_of_stock"}:
        return data

    try:
        body = json.loads(notification.body or "{}")
    except (TypeError, json.JSONDecodeError):
        return data

    if isinstance(body, dict) and not body.get("unit"):
        body["unit"] = product.unit
        data["body"] = json.dumps(body)
    return data


@notifications_bp.route("/read-all", methods=["PATCH"])
@cashier_or_admin_required
def mark_all_read():
    try:
        db.session.query(Notification).filter_by(
            user_id=current_user.owner_id, is_read=False
        ).update({"is_read": True})
        db.session.commit()
        return jsonify({"message": "All notifications marked as read."}), 200
    except SQLAlchemyError:
        db.session.rollback()
        return jsonify({"error": "Could not update notifications."}), 500


@notifications_bp.route("/<int:notification_id>/read", methods=["PATCH"])
@cashier_or_admin_required
def mark_read(notification_id):
    n = db.session.query(Notification).filter_by(
        notification_id=notification_id, user_id=current_user.owner_id
    ).first()
    if n is None:
        return jsonify({"error": "Notification not found."}), 404
    n.is_read = True
    db.session.commit()
    return jsonify({"notification": n.to_dict()}), 200
