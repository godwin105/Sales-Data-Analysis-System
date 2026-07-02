"""
Application configuration.
All values are read from environment variables so secrets stay out of source control.
"""
import os
from datetime import timedelta
from dotenv import load_dotenv

load_dotenv()

BASE_DIR = os.path.abspath(os.path.dirname(__file__))
UPLOAD_FOLDER = os.path.join(BASE_DIR, "static", "uploads")


class Config:
    # ---- Flask ----
    SECRET_KEY = os.environ.get("SECRET_KEY", "dev-secret-change-me")

    # ---- MySQL via SQLAlchemy (PyMySQL driver) ----
    # Always built from individual MYSQL_* variables.
    # DATABASE_URL is intentionally ignored — DigitalOcean injects it
    # automatically in a format that breaks SQLAlchemy's URL parser.
    MYSQL_HOST     = os.environ.get("MYSQL_HOST", "localhost")
    MYSQL_PORT     = os.environ.get("MYSQL_PORT", "3306")
    MYSQL_USER     = os.environ.get("MYSQL_USER", "root")
    MYSQL_PASSWORD = os.environ.get("MYSQL_PASSWORD", "")
    MYSQL_DB       = os.environ.get("MYSQL_DB", "sales_analysis_db")
    _is_remote     = MYSQL_HOST not in ("localhost", "127.0.0.1")
    SQLALCHEMY_DATABASE_URI = (
        f"mysql+pymysql://{MYSQL_USER}:{MYSQL_PASSWORD}"
        f"@{MYSQL_HOST}:{MYSQL_PORT}/{MYSQL_DB}?charset=utf8mb4"
    )
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SQLALCHEMY_ENGINE_OPTIONS = {
        "pool_pre_ping": True,
        "pool_recycle": 280,
        **({"connect_args": {"ssl": {}}} if _is_remote else {}),
    }

    # ---- JWT (replaces Flask-Login session cookies) ----
    JWT_SECRET_KEY = os.environ.get("JWT_SECRET_KEY", SECRET_KEY)
    # Access token expires after 8 hours (long enough for a working day)
    JWT_ACCESS_TOKEN_EXPIRES = timedelta(hours=8)
    JWT_TOKEN_LOCATION = ["headers"]
    JWT_HEADER_NAME = "Authorization"
    JWT_HEADER_TYPE = "Bearer"

    # ---- CORS ----
    # Allow the React dev server to call the API from localhost and same-WiFi
    # devices that open Vite through the machine's LAN IP address.
    # In production this should be the deployed frontend URL.
    cors_origins_raw = os.environ.get(
        "CORS_ORIGINS",
        ",".join([
            "http://localhost:5173",
            "http://127.0.0.1:5173",
            r"http://192\.168\.\d{1,3}\.\d{1,3}:5173",
            r"http://10\.\d{1,3}\.\d{1,3}\.\d{1,3}:5173",
            r"http://172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}:5173",
        ])
    )
    CORS_ORIGINS = [o.strip() for o in cors_origins_raw.split(",") if o.strip()]

    # ---- Frontend URL (used in password reset emails) ----
    FRONTEND_URL = os.environ.get("FRONTEND_URL", "http://localhost:5173")

    # ---- Security policy ----
    MAX_FAILED_LOGIN_ATTEMPTS = 5        # FR-05
    ACCOUNT_LOCKOUT_MINUTES = 15         # reasonable default
    BCRYPT_LOG_ROUNDS = 12               # NFR-03

    # ---- Email / SMTP (UAT: password reset emails) ----
    MAIL_SERVER = os.environ.get("MAIL_SERVER", "smtp.gmail.com")
    MAIL_PORT = int(os.environ.get("MAIL_PORT", "587"))
    MAIL_USE_TLS = os.environ.get("MAIL_USE_TLS", "1") == "1"
    MAIL_USERNAME = os.environ.get("MAIL_USERNAME", "")
    MAIL_PASSWORD = os.environ.get("MAIL_PASSWORD", "")
    MAIL_FROM_NAME = os.environ.get("MAIL_FROM_NAME", "Biashara App")
    MAIL_FROM_ADDRESS = os.environ.get("MAIL_FROM_ADDRESS", MAIL_USERNAME)

    # Password reset tokens expire after 1 hour
    PASSWORD_RESET_TOKEN_MINUTES = 60

    # Email verification tokens expire after 24 hours
    EMAIL_VERIFICATION_TOKEN_MINUTES = 1440

    # If MAIL_USERNAME is blank, the app writes reset links to the console
    # instead of actually sending (useful for testing without SMTP setup)
    MAIL_DRY_RUN = not MAIL_USERNAME

    # ---- Uploads ----
    UPLOAD_FOLDER = os.environ.get("UPLOAD_FOLDER", UPLOAD_FOLDER)
    MAX_CONTENT_LENGTH = int(os.environ.get("MAX_CONTENT_LENGTH", 5 * 1024 * 1024))

    # ---- ClickPesa (mobile money payments) ----
    # Get these from: ClickPesa Dashboard → Applications → your app → API Keys
    CLICKPESA_CLIENT_ID = os.environ.get("CLICKPESA_CLIENT_ID", "")
    CLICKPESA_API_KEY   = os.environ.get("CLICKPESA_API_KEY", "")
