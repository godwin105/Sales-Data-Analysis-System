"""
Authentication API blueprint — JWT-based.

Covers UC-01 (Register/Login), UC-07 (Manage Staff Accounts), and the UAT
additions (profile editing, admin password reset, email-based forgot password).

All endpoints accept and return JSON. Authentication is via JWT bearer
tokens (Authorization: Bearer <token>) issued at /api/auth/login.

Endpoints:
    POST   /api/auth/register
    POST   /api/auth/login
    POST   /api/auth/logout                       (stateless — client just discards token)
    GET    /api/auth/me
    PUT    /api/auth/me                           (update profile)
    PUT    /api/auth/me/password                  (change own password)

    GET    /api/auth/staff                        (admin: list cashiers)
    POST   /api/auth/staff                        (admin: add cashier)
    DELETE /api/auth/staff/<cashier_id>           (admin: remove cashier)
    POST   /api/auth/staff/<cashier_id>/reset-password  (admin: reset cashier password)

    POST   /api/auth/forgot-password
    GET    /api/auth/reset-password/<token>       (verify token validity)
    POST   /api/auth/reset-password/<token>       (set new password)
"""
from datetime import datetime, timedelta
import re
import secrets
import hashlib
from flask import Blueprint, request, jsonify, current_app
from flask_jwt_extended import (
    create_access_token, jwt_required, current_user, get_jwt_identity,
)

from extensions import db, bcrypt
from models import User, PasswordReset, Sale
from utils.decorators import admin_required
from utils.email_utils import send_email

auth_bp = Blueprint("auth", __name__, url_prefix="/api/auth")


# =========================================================================
# VALIDATION HELPERS
# =========================================================================
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def _err(message, status=400, **extra):
    """Standard JSON error response."""
    body = {"error": message}
    body.update(extra)
    return jsonify(body), status


def _validate_email(email):
    if not email or not isinstance(email, str):
        return "Email is required."
    email = email.strip().lower()
    if not EMAIL_RE.match(email):
        return "Please provide a valid email address."
    if len(email) > 100:
        return "Email is too long (max 100 characters)."
    return None


def _validate_password(password, field_name="Password"):
    if not password or not isinstance(password, str):
        return f"{field_name} is required."
    if len(password) < 8:
        return f"{field_name} must be at least 8 characters."
    if len(password) > 128:
        return f"{field_name} must be at most 128 characters."
    return None


def _validate_required_str(value, field_name, min_len=2, max_len=100):
    if not value or not isinstance(value, str):
        return f"{field_name} is required."
    v = value.strip()
    if len(v) < min_len:
        return f"{field_name} must be at least {min_len} characters."
    if len(v) > max_len:
        return f"{field_name} must be at most {max_len} characters."
    return None


# =========================================================================
# REGISTER (FR-01)
# =========================================================================
@auth_bp.route("/register", methods=["POST"])
def register():
    """Business owner self-registration. Creates an admin account."""
    data = request.get_json(silent=True) or {}

    business_name = (data.get("business_name") or "").strip()
    full_name = (data.get("full_name") or "").strip()
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""
    confirm_password = data.get("confirm_password") or ""

    # Field-level validation
    errors = {}
    if msg := _validate_required_str(business_name, "Business name"):
        errors["business_name"] = msg
    if msg := _validate_required_str(full_name, "Full name"):
        errors["full_name"] = msg
    if msg := _validate_email(email):
        errors["email"] = msg
    if msg := _validate_password(password):
        errors["password"] = msg
    if password != confirm_password:
        errors["confirm_password"] = "Passwords must match."

    if errors:
        return jsonify({"error": "Validation failed", "fields": errors}), 400

    # Uniqueness
    if User.query.filter_by(email=email).first():
        return jsonify({
            "error": "Validation failed",
            "fields": {"email": "Email already in use."},
        }), 400

    hashed = bcrypt.generate_password_hash(
        password, rounds=current_app.config["BCRYPT_LOG_ROUNDS"],
    ).decode("utf-8")

    user = User(
        business_name=business_name,
        full_name=full_name,
        email=email,
        password_hash=hashed,
        role="admin",
    )
    db.session.add(user)
    db.session.commit()

    return jsonify({
        "message": "Account created successfully.",
        "user": user.to_dict(),
    }), 201


# =========================================================================
# LOGIN (FR-02 + FR-05)
# =========================================================================
@auth_bp.route("/login", methods=["POST"])
def login():
    """Authenticate user and issue JWT. Enforces 5-strike lockout (FR-05)."""
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""

    if not email or not password:
        return _err("Email and password are required.", 400)

    user = User.query.filter_by(email=email).first()

    # Generic error to avoid email enumeration
    GENERIC_BAD_CREDS = "Invalid email or password."

    if user is None:
        return _err(GENERIC_BAD_CREDS, 401)

    # Deactivated accounts (e.g. ex-cashiers) can't log in
    if not user.is_active:
        return _err(GENERIC_BAD_CREDS, 401)

    # Lockout check
    if user.locked_until and user.locked_until > datetime.utcnow():
        remaining = int((user.locked_until - datetime.utcnow()).total_seconds() // 60) + 1
        return _err(
            f"Account locked due to too many failed attempts. "
            f"Try again in {remaining} minute(s).",
            403,
            code="account_locked",
            unlock_in_minutes=remaining,
        )

    # Password check
    if not bcrypt.check_password_hash(user.password_hash, password):
        user.failed_login_attempts += 1
        max_attempts = current_app.config["MAX_FAILED_LOGIN_ATTEMPTS"]

        if user.failed_login_attempts >= max_attempts:
            lockout_minutes = current_app.config["ACCOUNT_LOCKOUT_MINUTES"]
            user.locked_until = datetime.utcnow() + timedelta(minutes=lockout_minutes)
            user.failed_login_attempts = 0
            db.session.commit()
            return _err(
                f"Account locked for {lockout_minutes} minutes due to "
                f"{max_attempts} failed login attempts.",
                403,
                code="account_locked",
                unlock_in_minutes=lockout_minutes,
            )
        else:
            remaining = max_attempts - user.failed_login_attempts
            db.session.commit()
            return _err(
                f"Invalid email or password. {remaining} attempt(s) remaining.",
                401,
                attempts_remaining=remaining,
            )

    # SUCCESS — reset counters, issue token
    user.failed_login_attempts = 0
    user.locked_until = None
    db.session.commit()

    access_token = create_access_token(identity=user)

    return jsonify({
        "message": f"Welcome back, {user.full_name.split()[0]}!",
        "access_token": access_token,
        "user": user.to_dict(),
    }), 200


# =========================================================================
# LOGOUT (stateless — client just discards token)
# =========================================================================
@auth_bp.route("/logout", methods=["POST"])
@jwt_required()
def logout():
    """
    With pure JWT, logout is client-side: the React app simply removes the
    token from storage. This endpoint exists for API symmetry and to log
    the event server-side (could be extended with a token blocklist later).
    """
    return jsonify({"message": "Logged out."}), 200


# =========================================================================
# CURRENT USER / PROFILE
# =========================================================================
@auth_bp.route("/me", methods=["GET"])
@jwt_required()
def me():
    """Returns the authenticated user."""
    return jsonify({"user": current_user.to_dict()}), 200


@auth_bp.route("/me", methods=["PUT"])
@jwt_required()
def update_profile():
    """Update full_name and (admin only) business_name."""
    data = request.get_json(silent=True) or {}
    new_full_name = (data.get("full_name") or "").strip()
    new_business_name = (data.get("business_name") or "").strip()

    errors = {}
    if msg := _validate_required_str(new_full_name, "Full name"):
        errors["full_name"] = msg
    if current_user.is_admin and new_business_name:
        if msg := _validate_required_str(new_business_name, "Business name"):
            errors["business_name"] = msg

    if errors:
        return jsonify({"error": "Validation failed", "fields": errors}), 400

    current_user.full_name = new_full_name
    if current_user.is_admin and new_business_name:
        current_user.business_name = new_business_name

    db.session.commit()
    return jsonify({
        "message": "Profile updated successfully.",
        "user": current_user.to_dict(),
    }), 200


@auth_bp.route("/me/password", methods=["PUT"])
@jwt_required()
def change_password():
    """Change own password — requires current password."""
    data = request.get_json(silent=True) or {}
    current_password = data.get("current_password") or ""
    new_password = data.get("new_password") or ""
    confirm_new_password = data.get("confirm_new_password") or ""

    errors = {}
    if not current_password:
        errors["current_password"] = "Current password is required."
    if msg := _validate_password(new_password, "New password"):
        errors["new_password"] = msg
    if new_password != confirm_new_password:
        errors["confirm_new_password"] = "Passwords must match."

    if errors:
        return jsonify({"error": "Validation failed", "fields": errors}), 400

    if not bcrypt.check_password_hash(current_user.password_hash, current_password):
        return jsonify({
            "error": "Validation failed",
            "fields": {"current_password": "Current password is incorrect."},
        }), 400

    current_user.password_hash = bcrypt.generate_password_hash(
        new_password, rounds=current_app.config["BCRYPT_LOG_ROUNDS"],
    ).decode("utf-8")
    db.session.commit()

    return jsonify({"message": "Password changed successfully."}), 200


# =========================================================================
# STAFF MANAGEMENT (UC-07 / FR-04) — admin only
# =========================================================================
@auth_bp.route("/staff", methods=["GET"])
@admin_required
def list_staff():
    """List all active cashiers under this business owner."""
    cashiers = (
        User.query
        .filter_by(parent_user_id=current_user.user_id, role="cashier", is_active=True)
        .order_by(User.created_at.desc())
        .all()
    )
    return jsonify({"cashiers": [c.to_dict() for c in cashiers]}), 200


@auth_bp.route("/staff", methods=["POST"])
@admin_required
def add_cashier():
    """Create a new cashier under this business owner."""
    data = request.get_json(silent=True) or {}
    full_name = (data.get("full_name") or "").strip()
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""

    errors = {}
    if msg := _validate_required_str(full_name, "Full name"):
        errors["full_name"] = msg
    if msg := _validate_email(email):
        errors["email"] = msg
    if msg := _validate_password(password, "Temporary password"):
        errors["password"] = msg

    if errors:
        return jsonify({"error": "Validation failed", "fields": errors}), 400

    if User.query.filter_by(email=email).first():
        return jsonify({
            "error": "Validation failed",
            "fields": {"email": "Email already in use."},
        }), 400

    hashed = bcrypt.generate_password_hash(
        password, rounds=current_app.config["BCRYPT_LOG_ROUNDS"],
    ).decode("utf-8")

    cashier = User(
        business_name=current_user.business_name,
        full_name=full_name,
        email=email,
        password_hash=hashed,
        role="cashier",
        parent_user_id=current_user.user_id,
    )
    db.session.add(cashier)
    db.session.commit()

    return jsonify({
        "message": f"Cashier account created for {cashier.full_name}.",
        "cashier": cashier.to_dict(),
    }), 201


@auth_bp.route("/staff/<int:cashier_id>", methods=["DELETE"])
@admin_required
def remove_cashier(cashier_id):
    """
    Remove a cashier. Soft-delete if they have sales history (preserves
    audit trail), otherwise hard delete.
    """
    cashier = db.session.get(User, cashier_id)
    if cashier is None:
        return _err("Cashier not found.", 404)

    if cashier.parent_user_id != current_user.user_id or cashier.role != "cashier":
        return _err("You cannot remove this account.", 403)

    has_sales = db.session.query(Sale.sale_id).filter_by(
        recorded_by=cashier.user_id
    ).first() is not None

    if has_sales:
        # Soft delete — preserve sales history
        cashier.is_active = False
        cashier.password_hash = bcrypt.generate_password_hash(
            secrets.token_urlsafe(32),
            rounds=current_app.config["BCRYPT_LOG_ROUNDS"],
        ).decode("utf-8")
        db.session.commit()
        return jsonify({
            "message": (
                f"Cashier {cashier.full_name} has been deactivated. "
                f"Their sales history is preserved for your records."
            ),
            "deletion_type": "soft",
        }), 200
    else:
        full_name = cashier.full_name
        db.session.delete(cashier)
        db.session.commit()
        return jsonify({
            "message": f"Cashier {full_name} removed.",
            "deletion_type": "hard",
        }), 200


@auth_bp.route("/staff/<int:cashier_id>/reset-password", methods=["POST"])
@admin_required
def reset_cashier_password(cashier_id):
    """Admin resets a cashier's password without knowing the old one."""
    cashier = db.session.get(User, cashier_id)
    if cashier is None:
        return _err("Cashier not found.", 404)

    if cashier.parent_user_id != current_user.user_id or cashier.role != "cashier":
        return _err("You cannot reset this account's password.", 403)

    data = request.get_json(silent=True) or {}
    new_password = data.get("new_password") or ""

    if msg := _validate_password(new_password, "New password"):
        return jsonify({
            "error": "Validation failed",
            "fields": {"new_password": msg},
        }), 400

    cashier.password_hash = bcrypt.generate_password_hash(
        new_password, rounds=current_app.config["BCRYPT_LOG_ROUNDS"],
    ).decode("utf-8")
    cashier.failed_login_attempts = 0
    cashier.locked_until = None
    db.session.commit()

    return jsonify({
        "message": (
            f"Password reset for {cashier.full_name}. "
            f"Share the new password with them securely."
        ),
        "new_password": new_password,  # admin needs to communicate it
    }), 200


# =========================================================================
# UAT ADDITION — Email-based password reset
# =========================================================================
def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _frontend_reset_url(token: str) -> str:
    """Build the React-side reset URL the user clicks in the email."""
    base = current_app.config["FRONTEND_URL"].rstrip("/")
    return f"{base}/reset-password/{token}"


@auth_bp.route("/forgot-password", methods=["POST"])
def forgot_password():
    """
    User submits their email. If matched, send a reset link. Always return
    the same success message regardless to prevent account enumeration.
    """
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()

    if msg := _validate_email(email):
        return jsonify({
            "error": "Validation failed",
            "fields": {"email": msg},
        }), 400

    user = User.query.filter_by(email=email).first()

    if user:
        # Invalidate any existing unused tokens for this user
        PasswordReset.query.filter_by(user_id=user.user_id, used_at=None).update(
            {PasswordReset.used_at: datetime.utcnow()},
            synchronize_session=False,
        )

        # Generate a secure random token
        token = secrets.token_urlsafe(32)
        token_hash = _hash_token(token)

        expires_at = datetime.utcnow() + timedelta(
            minutes=current_app.config["PASSWORD_RESET_TOKEN_MINUTES"]
        )

        pr = PasswordReset(
            user_id=user.user_id,
            token_hash=token_hash,
            expires_at=expires_at,
        )
        db.session.add(pr)
        db.session.commit()

        reset_url = _frontend_reset_url(token)
        expires_in_min = current_app.config["PASSWORD_RESET_TOKEN_MINUTES"]

        subject = "Reset your Sales Data Analysis System password"
        text_body = (
            f"Hi {user.full_name},\n\n"
            f"You (or someone using your email) requested a password reset "
            f"for your Sales Data Analysis System account.\n\n"
            f"To set a new password, visit this link within "
            f"{expires_in_min} minutes:\n\n"
            f"{reset_url}\n\n"
            f"If you didn't request this, you can safely ignore this email — "
            f"your password will stay the same.\n\n"
            f"— Sales Data Analysis System\n"
        )
        html_body = f"""
            <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#1E293B;">
              <h2 style="color:#2563EB;margin-bottom:10px;">Reset your password</h2>
              <p>Hi <strong>{user.full_name}</strong>,</p>
              <p>You (or someone using your email) requested a password reset for your
              <strong>Sales Data Analysis System</strong> account.</p>
              <p style="margin:28px 0;">
                <a href="{reset_url}"
                   style="background:#2563EB;color:#fff;padding:12px 24px;border-radius:8px;
                          text-decoration:none;font-weight:700;display:inline-block;">
                   Reset my password
                </a>
              </p>
              <p style="color:#64748B;font-size:13px;">
                This link expires in <strong>{expires_in_min} minutes</strong>.
                If the button doesn't work, copy and paste this URL into your browser:
              </p>
              <p style="color:#64748B;font-size:12px;word-break:break-all;">{reset_url}</p>
              <hr style="border:none;border-top:1px solid #E2E8F0;margin:24px 0;">
              <p style="color:#94A3B8;font-size:12px;">
                If you didn't request this, you can safely ignore this email — your password won't change.
              </p>
            </div>
        """

        send_email(
            to=user.email,
            subject=subject,
            html_body=html_body,
            text_body=text_body,
        )

    # Always return the same message
    return jsonify({
        "message": (
            "If an account with that email exists, we've sent a reset link. "
            "Please check your inbox (and spam folder)."
        ),
    }), 200


@auth_bp.route("/reset-password/<token>", methods=["GET"])
def verify_reset_token(token):
    """Check whether a reset token is still valid (used by React to show form)."""
    pr = PasswordReset.query.filter_by(token_hash=_hash_token(token)).first()
    if pr is None or not pr.is_valid:
        return jsonify({"valid": False, "error": "Invalid or expired link."}), 400
    return jsonify({"valid": True}), 200


@auth_bp.route("/reset-password/<token>", methods=["POST"])
def submit_reset_password(token):
    """Set a new password using a valid reset token."""
    data = request.get_json(silent=True) or {}
    password = data.get("password") or ""
    confirm_password = data.get("confirm_password") or ""

    errors = {}
    if msg := _validate_password(password):
        errors["password"] = msg
    if password != confirm_password:
        errors["confirm_password"] = "Passwords must match."

    if errors:
        return jsonify({"error": "Validation failed", "fields": errors}), 400

    pr = PasswordReset.query.filter_by(token_hash=_hash_token(token)).first()
    if pr is None or not pr.is_valid:
        return jsonify({
            "error": "This password reset link is invalid or has expired. "
                     "Please request a new one.",
            "code": "invalid_token",
        }), 400

    pr.user.password_hash = bcrypt.generate_password_hash(
        password, rounds=current_app.config["BCRYPT_LOG_ROUNDS"],
    ).decode("utf-8")
    pr.user.failed_login_attempts = 0
    pr.user.locked_until = None
    pr.used_at = datetime.utcnow()
    db.session.commit()

    return jsonify({
        "message": "Password reset successfully. Please log in with your new password.",
    }), 200
