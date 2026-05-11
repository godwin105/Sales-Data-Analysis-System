"""
Web-Based Sales Data Analysis System — Flask JSON API
Application entry point (Flask application factory pattern).

This is a JSON-only API server. The user interface lives in a separate
React SPA (../frontend/) which calls these endpoints via HTTPS.

Run with:
    python app.py        # development on port 5000
"""
from flask import Flask, jsonify
from flask_jwt_extended import JWTManager

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

    return app


app = create_app()


if __name__ == "__main__":
    app.run(debug=True, host="0.0.0.0", port=5000)
