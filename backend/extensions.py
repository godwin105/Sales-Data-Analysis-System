"""
Flask extension instances.

Defined in a separate module so blueprints can import them without
creating circular imports with the application factory.

NOTE: Migrated from Flask-Login + Flask-WTF + CSRFProtect (server-rendered
session pattern) to JWT + CORS for a decoupled React SPA frontend.
"""
from flask_sqlalchemy import SQLAlchemy
from flask_bcrypt import Bcrypt
from flask_jwt_extended import JWTManager
from flask_cors import CORS

db = SQLAlchemy()
bcrypt = Bcrypt()
jwt = JWTManager()
cors = CORS()
