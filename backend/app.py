"""
Web-Based Sales Data Analysis System — Flask JSON API
Application entry point (Flask application factory pattern).

This is a JSON-only API server. The user interface lives in a separate
React SPA (../frontend/) which calls these endpoints via HTTPS.

Run with:
    python app.py        # development on port 5000
"""
import threading

from flask import Flask, jsonify
from flask_jwt_extended import JWTManager
from sqlalchemy import inspect, text
from sqlalchemy.exc import SQLAlchemyError

from config import Config
from extensions import db, bcrypt, jwt, cors

# Blueprints
from blueprints.auth import auth_bp
from blueprints.dashboard import dashboard_bp
from blueprints.stock import stock_bp
from blueprints.sales import sales_bp
from blueprints.expenses import expenses_bp
from blueprints.analytics import analytics_bp
from blueprints.reports import reports_bp
from blueprints.payments import payments_bp

# Models must be imported so SQLAlchemy registers them
import models  # noqa: F401


def create_app(config_class=Config):
    app = Flask(__name__)
    app.config.from_object(config_class)

    # ---- Initialise extensions ----
    db.init_app(app)
    bcrypt.init_app(app)
    jwt.init_app(app)
    cors.init_app(
        app,
        resources={r"/api/*": {"origins": app.config["CORS_ORIGINS"]}},
        supports_credentials=True,
    )

    # ---- JWT identity loader ----
    # Stores user_id as the JWT subject; we look up the User on each request.
    @jwt.user_identity_loader
    def user_identity(user):
        # `user` here is whatever we passed to create_access_token
        return str(user.user_id) if hasattr(user, "user_id") else str(user)

    @jwt.user_lookup_loader
    def user_lookup(_jwt_header, jwt_data):
        from models import User
        identity = jwt_data["sub"]
        return db.session.get(User, int(identity))

    # ---- JWT error handlers (return JSON, not HTML) ----
    @jwt.unauthorized_loader
    def missing_token(reason):
        return jsonify({"error": "Missing or invalid token", "detail": reason}), 401

    @jwt.invalid_token_loader
    def invalid_token(reason):
        return jsonify({"error": "Invalid token", "detail": reason}), 401

    @jwt.expired_token_loader
    def expired_token(_jwt_header, _jwt_data):
        return jsonify({"error": "Token has expired", "code": "token_expired"}), 401

    # ---- Register blueprints ----
    app.register_blueprint(auth_bp)
    app.register_blueprint(dashboard_bp)
    app.register_blueprint(stock_bp)
    app.register_blueprint(sales_bp)
    app.register_blueprint(expenses_bp)
    app.register_blueprint(analytics_bp)
    app.register_blueprint(reports_bp)
    app.register_blueprint(payments_bp)

    # ---- Lightweight compatibility migrations ----
    with app.app_context():
        _ensure_profile_image_column()
        _ensure_payment_columns()
        _ensure_normalization_tables()
        _ensure_clickpesa_columns()

    # ---- Health check ----
    @app.route("/api/health")
    def health():
        return jsonify({"status": "ok", "service": "sales-data-analysis-api"})

    # ---- Generic error handlers ----
    @app.errorhandler(404)
    def not_found(_e):
        return jsonify({"error": "Not found"}), 404

    @app.errorhandler(500)
    def server_error(_e):
        return jsonify({"error": "Internal server error"}), 500

    # ---- CLI command: create tables directly from models ----
    @app.cli.command("init-db")
    def init_db():
        """Create all tables defined by the SQLAlchemy models."""
        with app.app_context():
            db.create_all()
            print("✅ Database tables created.")

    # Pre-warm ClickPesa token so the first USSD push isn't slow
    _prefetch_clickpesa_token(app)

    return app


def _prefetch_clickpesa_token(app):
    """Fetch the ClickPesa auth token in the background on startup so the
    first USSD push doesn't block while waiting for the token endpoint."""
    def _do():
        try:
            with app.app_context():
                from services.clickpesa import _get_token
                _get_token()
        except Exception:
            pass  # credentials not set locally or API unreachable — non-fatal
    threading.Thread(target=_do, daemon=True).start()


def _ensure_payment_columns():
    """Add payment columns to sales table and create payments table if needed."""
    try:
        inspector = inspect(db.engine)
        if inspector.has_table("sales"):
            cols = {c["name"] for c in inspector.get_columns("sales")}
            if "payment_method" not in cols:
                db.session.execute(text(
                    "ALTER TABLE sales ADD COLUMN payment_method VARCHAR(20) NULL"
                ))
            if "payment_status" not in cols:
                db.session.execute(text(
                    "ALTER TABLE sales ADD COLUMN payment_status VARCHAR(20) NULL"
                ))
            db.session.commit()
        # Create the payments table (and any other new tables) from models
        db.create_all()
    except SQLAlchemyError:
        db.session.rollback()


def _ensure_normalization_tables():
    """
    Idempotent migration: creates lookup tables (product_categories, units,
    expense_categories) and migrates FK columns on products/expenses.
    Safe to call on every startup — checks schema before acting.
    """
    try:
        # Create all new lookup tables declared in models
        db.create_all()

        from models import ProductCategory, Unit, ExpenseCategory

        # Seed product categories (idempotent: only adds missing ones)
        _default_cats = [
            "Food", "Beverages", "Cleaning", "Electronics", "Clothing",
            "Stationery", "Household", "Beauty & Health", "Fruits & Vegetables",
            "Dairy & Eggs", "Construction", "Other",
        ]
        existing_cats = {c.name for c in db.session.query(ProductCategory).all()}
        for name in _default_cats:
            if name not in existing_cats:
                db.session.add(ProductCategory(name=name))
        db.session.flush()

        # Seed units
        if not db.session.query(Unit).first():
            for symbol, uname in [
                ("pcs", "Pieces"), ("kg", "Kilograms"), ("g", "Grams"),
                ("L", "Litres"), ("mL", "Millilitres"), ("m", "Metres"),
                ("box", "Box"), ("pkt", "Packet"), ("doz", "Dozen"),
                ("ctn", "Carton"), ("btl", "Bottle"), ("bag", "Bag"),
                ("tin", "Tin"), ("sack", "Sack"),
            ]:
                db.session.add(Unit(symbol=symbol, name=uname))
            db.session.flush()

        # Seed expense categories (include Purchase Costs for legacy FK mapping)
        if not db.session.query(ExpenseCategory).first():
            for name in ["Rent", "Utilities", "Salaries", "Purchase Costs", "Miscellaneous"]:
                db.session.add(ExpenseCategory(name=name))
            db.session.flush()

        db.session.commit()

        inspector = inspect(db.engine)

        # ── Migrate products table ─────────────────────────────────────────
        if inspector.has_table("products"):
            cols = {c["name"] for c in inspector.get_columns("products")}

            if "category_id" not in cols:
                db.session.execute(text("ALTER TABLE products ADD COLUMN category_id INT NULL"))
                if "category" in cols:
                    db.session.execute(text("""
                        UPDATE products p
                        JOIN product_categories pc ON pc.name = p.category
                        SET p.category_id = pc.id
                        WHERE p.category IS NOT NULL
                    """))
                db.session.commit()

            if "unit_id" not in cols:
                db.session.execute(text("ALTER TABLE products ADD COLUMN unit_id INT NULL"))
                if "unit" in cols:
                    db.session.execute(text("""
                        UPDATE products p
                        JOIN units u ON u.symbol = p.unit
                        SET p.unit_id = u.id
                        WHERE p.unit IS NOT NULL
                    """))
                # Default any remaining NULLs to 'pcs'
                db.session.execute(text("""
                    UPDATE products p
                    JOIN units u ON u.symbol = 'pcs'
                    SET p.unit_id = u.id
                    WHERE p.unit_id IS NULL
                """))
                db.session.commit()

            # Drop old string columns once FK columns are populated
            cols = {c["name"] for c in inspect(db.engine).get_columns("products")}
            if "category" in cols and "category_id" in cols:
                db.session.execute(text("ALTER TABLE products DROP COLUMN category"))
                db.session.commit()
            if "unit" in cols and "unit_id" in cols:
                db.session.execute(text("ALTER TABLE products DROP COLUMN unit"))
                db.session.commit()

        # ── Migrate expenses table ─────────────────────────────────────────
        if inspector.has_table("expenses"):
            cols = {c["name"] for c in inspector.get_columns("expenses")}

            if "category_id" not in cols:
                db.session.execute(text("ALTER TABLE expenses ADD COLUMN category_id INT NULL"))
                if "category" in cols:
                    db.session.execute(text("""
                        UPDATE expenses e
                        JOIN expense_categories ec ON ec.name = e.category
                        SET e.category_id = ec.id
                        WHERE e.category IS NOT NULL
                    """))
                # Default orphan rows to Miscellaneous
                db.session.execute(text("""
                    UPDATE expenses e
                    JOIN expense_categories ec ON ec.name = 'Miscellaneous'
                    SET e.category_id = ec.id
                    WHERE e.category_id IS NULL
                """))
                db.session.commit()

            # Drop old string column once FK column is populated
            cols = {c["name"] for c in inspect(db.engine).get_columns("expenses")}
            if "category" in cols and "category_id" in cols:
                db.session.execute(text("ALTER TABLE expenses DROP COLUMN category"))
                db.session.commit()

    except SQLAlchemyError as exc:
        db.session.rollback()
        print(f"[migration] Normalization warning: {exc}")


def _ensure_clickpesa_columns():
    """Add per-owner ClickPesa credential columns to users table if missing."""
    try:
        inspector = inspect(db.engine)
        if not inspector.has_table("users"):
            return
        cols = {c["name"] for c in inspector.get_columns("users")}
        if "clickpesa_client_id" not in cols:
            db.session.execute(text(
                "ALTER TABLE users ADD COLUMN clickpesa_client_id VARCHAR(255) NULL"
            ))
            db.session.commit()
        if "clickpesa_api_key" not in cols:
            db.session.execute(text(
                "ALTER TABLE users ADD COLUMN clickpesa_api_key VARCHAR(255) NULL"
            ))
            db.session.commit()
    except SQLAlchemyError:
        db.session.rollback()


def _ensure_profile_image_column():
    try:
        inspector = inspect(db.engine)
        if not inspector.has_table("users"):
            return
        columns = {col["name"] for col in inspector.get_columns("users")}
        if "profile_image_url" not in columns:
            db.session.execute(text("ALTER TABLE users ADD COLUMN profile_image_url MEDIUMTEXT NULL"))
        else:
            # Widen to MEDIUMTEXT so base64 images fit (idempotent in MySQL)
            db.session.execute(text("ALTER TABLE users MODIFY COLUMN profile_image_url MEDIUMTEXT NULL"))
        db.session.commit()
    except SQLAlchemyError:
        db.session.rollback()


app = create_app()


if __name__ == "__main__":
    app.run(debug=True, host="0.0.0.0", port=5000)
