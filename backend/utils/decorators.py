"""
Custom decorators for role-based access control (FR-03).

Uses Flask-JWT-Extended's `current_user` (resolved by user_lookup_loader
in app.py) to enforce admin / cashier / authenticated-only routes.

Usage:
    @admin_required
    def manage_stock(): ...

Returns JSON errors (not redirects) — appropriate for an API.
"""
from functools import wraps
from flask import jsonify
from flask_jwt_extended import jwt_required, current_user


def admin_required(view_func):
    """Allow only business owners (role='admin') past this route."""
    @wraps(view_func)
    @jwt_required()
    def wrapper(*args, **kwargs):
        if current_user is None:
            return jsonify({"error": "Unauthenticated"}), 401
        if not current_user.is_admin:
            return jsonify({
                "error": "Access denied — this action is for business owners only.",
                "code": "admin_required",
            }), 403
        return view_func(*args, **kwargs)
    return wrapper


def cashier_or_admin_required(view_func):
    """Allow both admins and cashiers — used for shared routes like Record Sale."""
    @wraps(view_func)
    @jwt_required()
    def wrapper(*args, **kwargs):
        if current_user is None:
            return jsonify({"error": "Unauthenticated"}), 401
        if current_user.role not in ("admin", "cashier"):
            return jsonify({"error": "Access denied"}), 403
        return view_func(*args, **kwargs)
    return wrapper
