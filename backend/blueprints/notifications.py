from flask import Blueprint, jsonify
from flask_jwt_extended import current_user
from sqlalchemy.exc import SQLAlchemyError

from extensions import db
from models import Notification
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
    unread_count = sum(1 for n in rows if not n.is_read)
    return jsonify({
        "notifications": [n.to_dict() for n in rows],
        "unread_count": unread_count,
    }), 200


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
