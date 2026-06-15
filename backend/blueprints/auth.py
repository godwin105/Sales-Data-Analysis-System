from datetime import datetime, timedelta
import os
import re
import secrets
import hashlib
from uuid import uuid4
from flask import Blueprint, request, jsonify, current_app
from flask_jwt_extended import (
    create_access_token, jwt_required, current_user, get_jwt_identity,
)
from werkzeug.utils import secure_filename

from sqlalchemy import func

from extensions import db, bcrypt
from models import User, PasswordReset, Sale, EmailVerification
from utils.decorators import admin_required
from utils.email_utils import send_email

auth_bp = Blueprint("auth", __name__, url_prefix="/api/auth")


# VALIDATION HELPERS

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
ALLOWED_PROFILE_IMAGE_EXTENSIONS = {"jpg", "jpeg", "png", "webp"}


def _err(message, status=400, **extra):
    
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
    if not re.search(r"[A-Z]", password):
        return f"{field_name} must contain at least one uppercase letter (A–Z)."
    if not re.search(r"[a-z]", password):
        return f"{field_name} must contain at least one lowercase letter (a–z)."
    if not re.search(r"[0-9]", password):
        return f"{field_name} must contain at least one number (0–9)."
    if not re.search(r"[^A-Za-z0-9]", password):
        return f"{field_name} must contain at least one special character (e.g. !@#$%^&*)."
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


def _allowed_profile_image(filename):
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_PROFILE_IMAGE_EXTENSIONS


def _profile_image_dir():
    return os.path.join(current_app.config["UPLOAD_FOLDER"], "profile_images")


#registration: this section of code enable user to perform registration

@auth_bp.route("/register", methods=["POST"])
def register():
    # Business owner self-registration. Creates an admin account.
    data = request.get_json(silent=True) or {}

    business_name = (data.get("business_name") or "").strip()
    first_name = (data.get("first_name") or "").strip()
    last_name = (data.get("last_name") or "").strip()
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""
    confirm_password = data.get("confirm_password") or ""

    # Field-level validation
    errors = {}
    if msg := _validate_required_str(business_name, "Business name"):
        errors["business_name"] = msg
    if msg := _validate_required_str(first_name, "First name", min_len=1):
        errors["first_name"] = msg
    if msg := _validate_required_str(last_name, "Last name", min_len=1):
        errors["last_name"] = msg
    if msg := _validate_email(email):
        errors["email"] = msg
    if msg := _validate_password(password):
        errors["password"] = msg
    if password != confirm_password:
        errors["confirm_password"] = "Passwords must match."

    if errors:
        return jsonify({"error": "Validation failed", "fields": errors}), 400

    # Business name uniqueness (case-insensitive, among admin accounts only)
    if User.query.filter(
        func.lower(User.business_name) == func.lower(business_name),
        User.role == "admin",
    ).first():
        return jsonify({
            "error": "Validation failed",
            "fields": {"business_name": "A business with this name already exists. Please choose a different name."},
        }), 400

    # Email uniqueness
    if User.query.filter_by(email=email).first():
        return jsonify({
            "error": "Validation failed",
            "fields": {"email": "Email already in use."},
        }), 400

    hashed = bcrypt.generate_password_hash(
        password, rounds=current_app.config["BCRYPT_LOG_ROUNDS"],
    ).decode("utf-8")

    # Auto-verify when SMTP is not configured (e.g. Render free tier blocks SMTP ports).
    # When MAIL_USERNAME is set, verification email is sent and the gate is enforced.
    mail_dry_run = current_app.config.get("MAIL_DRY_RUN", True)

    user = User(
        business_name=business_name,
        first_name=first_name,
        last_name=last_name,
        email=email,
        password_hash=hashed,
        role="admin",
        is_email_verified=mail_dry_run,
    )
    db.session.add(user)
    db.session.commit()

    if not mail_dry_run:
        _send_verification_email(user)

    message = (
        "Account created. You can log in now."
        if mail_dry_run
        else "Account created. Please check your email to verify your account before logging in."
    )
    return jsonify({"message": message, "user": user.to_dict()}), 201


#login session
@auth_bp.route("/login", methods=["POST"])
def login():
    #Authenticate user and issue JWT. Enforces 5-strike lockout (FR-05).
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
                code="invalid_credentials",
                attempts_remaining=remaining,
            )

    # Email verification check — skipped when SMTP is not configured (MAIL_DRY_RUN=True)
    # so users aren't permanently locked out when the email service is unavailable.
    mail_dry_run = current_app.config.get("MAIL_DRY_RUN", True)
    if user.role == "admin" and not user.is_email_verified and not mail_dry_run:
        return _err(
            "Your email address has not been verified. Please check your inbox for the verification link.",
            403,
            code="email_not_verified",
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
    """Update first_name, last_name and (admin only) business_name."""
    data = request.get_json(silent=True) or {}
    new_first_name = (data.get("first_name") or "").strip()
    new_last_name = (data.get("last_name") or "").strip()
    new_business_name = (data.get("business_name") or "").strip()

    errors = {}
    if msg := _validate_required_str(new_first_name, "First name", min_len=1):
        errors["first_name"] = msg
    if msg := _validate_required_str(new_last_name, "Last name", min_len=1):
        errors["last_name"] = msg
    if current_user.is_admin and new_business_name:
        if msg := _validate_required_str(new_business_name, "Business name"):
            errors["business_name"] = msg

    if errors:
        return jsonify({"error": "Validation failed", "fields": errors}), 400

    current_user.first_name = new_first_name
    current_user.last_name = new_last_name
    if current_user.is_admin and new_business_name:
        current_user.business_name = new_business_name

    db.session.commit()
    return jsonify({
        "message": "Profile updated successfully.",
        "user": current_user.to_dict(),
    }), 200


@auth_bp.route("/me/profile-image", methods=["POST"])
@jwt_required()
def upload_profile_image():
    """Upload or replace the current user's profile picture."""
    file = request.files.get("profile_image")
    if file is None or not file.filename:
        return _err("Please choose an image to upload.", 400, code="missing_profile_image")

    if not _allowed_profile_image(file.filename):
        return _err(
            "Profile picture must be a JPG, PNG, or WebP image.",
            400,
            code="invalid_profile_image_type",
        )

    upload_dir = _profile_image_dir()
    os.makedirs(upload_dir, exist_ok=True)

    original = secure_filename(file.filename)
    ext = original.rsplit(".", 1)[1].lower()
    filename = f"user_{current_user.user_id}_{uuid4().hex}.{ext}"
    path = os.path.join(upload_dir, filename)
    file.save(path)

    old_url = current_user.profile_image_url
    current_user.profile_image_url = f"/static/uploads/profile_images/{filename}"
    db.session.commit()

    if old_url and old_url.startswith("/static/uploads/profile_images/"):
        old_path = os.path.join(current_app.root_path, old_url.lstrip("/").replace("/", os.sep))
        try:
            if os.path.isfile(old_path):
                os.remove(old_path)
        except OSError:
            pass

    return jsonify({
        "message": "Profile picture updated successfully.",
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
    first_name = (data.get("first_name") or "").strip()
    last_name = (data.get("last_name") or "").strip()
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""

    errors = {}
    if msg := _validate_required_str(first_name, "First name", min_len=1):
        errors["first_name"] = msg
    if msg := _validate_required_str(last_name, "Last name", min_len=1):
        errors["last_name"] = msg
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

    # Cashiers are added by admin directly — no email verification required
    cashier = User(
        business_name=current_user.business_name,
        first_name=first_name,
        last_name=last_name,
        email=email,
        password_hash=hashed,
        role="cashier",
        parent_user_id=current_user.user_id,
        is_email_verified=True,
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
# EMAIL VERIFICATION (signup flow)
# =========================================================================
def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _frontend_reset_url(token: str) -> str:
    base = current_app.config["FRONTEND_URL"].rstrip("/")
    return f"{base}/reset-password/{token}"


def _send_verification_email(user):
    """Generate a verification token and email it to the user."""
    token = secrets.token_urlsafe(32)
    token_hash = _hash_token(token)
    expires_at = datetime.utcnow() + timedelta(
        minutes=current_app.config["EMAIL_VERIFICATION_TOKEN_MINUTES"]
    )

    # Invalidate any existing unused tokens for this user
    EmailVerification.query.filter_by(user_id=user.user_id, verified_at=None).delete()
    db.session.flush()

    ev = EmailVerification(
        user_id=user.user_id,
        token_hash=token_hash,
        expires_at=expires_at,
    )
    db.session.add(ev)
    db.session.commit()

    base = current_app.config["FRONTEND_URL"].rstrip("/")
    verify_url = f"{base}/verify-email/{token}"
    expires_in_hours = current_app.config["EMAIL_VERIFICATION_TOKEN_MINUTES"] // 60

    subject = "Verify your email — Sales Data Analysis System"
    text_body = (
        f"Hi {user.first_name},\n\n"
        f"Thank you for registering with the Sales Data Analysis System.\n\n"
        f"Please verify your email address by clicking the link below "
        f"within {expires_in_hours} hour(s):\n\n"
        f"{verify_url}\n\n"
        f"If you did not create this account, you can safely ignore this email.\n\n"
        f"— Sales Data Analysis System\n"
    )
    html_body = f"""
        <div style="font-family:Arial,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#1E293B;">
          <h2 style="color:#2563EB;margin-bottom:10px;">Verify your email address</h2>
          <p>Hi <strong>{user.first_name}</strong>,</p>
          <p>Thank you for registering with the <strong>Sales Data Analysis System</strong>.
          Click the button below to verify your email address and activate your account.</p>
          <p style="margin:28px 0;">
            <a href="{verify_url}"
               style="background:#2563EB;color:#fff;padding:12px 24px;border-radius:8px;
                      text-decoration:none;font-weight:700;display:inline-block;">
               Verify my email
            </a>
          </p>
          <p style="color:#64748B;font-size:13px;">
            This link expires in <strong>{expires_in_hours} hour(s)</strong>.
            If the button doesn't work, copy and paste this URL:
          </p>
          <p style="color:#64748B;font-size:12px;word-break:break-all;">{verify_url}</p>
          <hr style="border:none;border-top:1px solid #E2E8F0;margin:24px 0;">
          <p style="color:#94A3B8;font-size:12px;">
            If you did not create an account, you can safely ignore this email.
          </p>
        </div>
    """
    send_email(to=user.email, subject=subject, html_body=html_body, text_body=text_body)


@auth_bp.route("/verify-email/<token>", methods=["GET"])
def verify_email(token):
    """Validate an email verification token and activate the account."""
    ev = EmailVerification.query.filter_by(token_hash=_hash_token(token)).first()
    if ev is None or not ev.is_valid:
        return jsonify({"valid": False, "error": "Invalid or expired verification link."}), 400

    ev.user.is_email_verified = True
    ev.verified_at = datetime.utcnow()
    db.session.commit()

    return jsonify({
        "valid": True,
        "message": "Email verified successfully. You can now log in.",
    }), 200


@auth_bp.route("/resend-verification", methods=["POST"])
def resend_verification():
    """Resend a verification email. Always returns the same message to prevent enumeration."""
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()

    if not email:
        return jsonify({
            "error": "Validation failed",
            "fields": {"email": "Email is required."},
        }), 400

    user = User.query.filter_by(email=email).first()
    if user and not user.is_email_verified:
        _send_verification_email(user)

    return jsonify({
        "message": "If that email is registered and unverified, we've sent a new verification link. Check your inbox.",
    }), 200


# =========================================================================
# Email-based password reset
# =========================================================================


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
