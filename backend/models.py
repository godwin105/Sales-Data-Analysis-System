from datetime import datetime
from sqlalchemy import Numeric
from extensions import db


# ── Lookup tables (normalization) ─────────────────────────────────────────────

class ProductCategory(db.Model):
    __tablename__ = "product_categories"

    id   = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(50), nullable=False, unique=True)

    def __repr__(self):
        return f"<ProductCategory {self.name}>"


class Unit(db.Model):
    __tablename__ = "units"

    id     = db.Column(db.Integer, primary_key=True)
    symbol = db.Column(db.String(20), nullable=False, unique=True)
    name   = db.Column(db.String(50), nullable=False)

    def __repr__(self):
        return f"<Unit {self.symbol}>"


class ExpenseCategory(db.Model):
    __tablename__ = "expense_categories"

    id   = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(50), nullable=False, unique=True)

    def __repr__(self):
        return f"<ExpenseCategory {self.name}>"


# ── USER (Authentication) ─────────────────────────────────────────────────────

class User(db.Model):
    __tablename__ = "users"

    user_id = db.Column(db.Integer, primary_key=True)
    business_name = db.Column(db.String(100), nullable=False)
    first_name = db.Column(db.String(50), nullable=False)
    last_name = db.Column(db.String(50), nullable=False)
    email = db.Column(db.String(100), unique=True, nullable=False, index=True)
    password_hash = db.Column(db.String(255), nullable=False)
    profile_image_url = db.Column(db.String(255), nullable=True)
    role = db.Column(db.Enum("admin", "cashier"), nullable=False, default="admin")
    parent_user_id = db.Column(
        db.Integer,
        db.ForeignKey("users.user_id", ondelete="SET NULL"),
        nullable=True,
    )
    clickpesa_client_id = db.Column(db.String(255), nullable=True)
    clickpesa_api_key = db.Column(db.String(255), nullable=True)
    failed_login_attempts = db.Column(db.Integer, nullable=False, default=0)
    locked_until = db.Column(db.DateTime, nullable=True)
    is_active = db.Column(db.Boolean, nullable=False, default=True)
    is_email_verified = db.Column(db.Boolean, nullable=False, default=False)
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)

    # Relationships
    cashiers = db.relationship(
        "User",
        backref=db.backref("business_owner", remote_side=[user_id]),
        foreign_keys=[parent_user_id],
    )
    products = db.relationship(
        "Product", backref="owner", cascade="all, delete-orphan",
        foreign_keys="Product.user_id",
    )
    sales = db.relationship(
        "Sale", backref="owner", cascade="all, delete-orphan",
        foreign_keys="Sale.user_id",
    )
    expenses = db.relationship(
        "Expense", backref="owner", cascade="all, delete-orphan",
        foreign_keys="Expense.user_id",
    )

    @property
    def full_name(self):
        return f"{self.first_name} {self.last_name}"

    #Convenience helpers
    @property
    def is_admin(self):
        return self.role == "admin"

    @property
    def is_cashier(self):
        return self.role == "cashier"

    @property
    def owner_id(self):
        """The business's owner user_id — self for admins, parent for cashiers."""
        return self.parent_user_id if self.is_cashier else self.user_id

    def to_dict(self):
        """Serialize to JSON-safe dict for API responses."""
        return {
            "user_id": self.user_id,
            "business_name": self.business_name,
            "first_name": self.first_name,
            "last_name": self.last_name,
            "full_name": self.full_name,
            "email": self.email,
            "profile_image_url": self.profile_image_url,
            "role": self.role,
            "is_active": self.is_active,
            "is_email_verified": self.is_email_verified,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "has_clickpesa_configured": bool(self.clickpesa_client_id and self.clickpesa_api_key),
        }

    def __repr__(self):
        return f"<User {self.email} ({self.role})>"


# ── PRODUCT (Stock Management) ───────────────────────────────────────────────

class Product(db.Model):
    __tablename__ = "products"

    product_id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(
        db.Integer, db.ForeignKey("users.user_id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    name = db.Column(db.String(100), nullable=False)
    category_id = db.Column(
        db.Integer, db.ForeignKey("product_categories.id", ondelete="SET NULL"),
        nullable=True, index=True,
    )
    unit_id = db.Column(
        db.Integer, db.ForeignKey("units.id", ondelete="RESTRICT"),
        nullable=True,
    )
    purchase_price = db.Column(db.Numeric(10, 2), nullable=False)
    selling_price = db.Column(db.Numeric(10, 2), nullable=False)
    quantity =  db.Column(Numeric(10, 2), nullable=False, default=0)
    low_stock_threshold = db.Column(Numeric(10, 2), nullable=False, default=5)
    is_deleted = db.Column(db.Boolean, nullable=False, default=False)
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)

    category_obj = db.relationship("ProductCategory")
    unit_obj     = db.relationship("Unit")

    @property
    def category(self):
        return self.category_obj.name if self.category_obj else None

    @property
    def unit(self):
        return self.unit_obj.symbol if self.unit_obj else "pcs"

    @property
    def is_low_stock(self):
        return self.quantity <= self.low_stock_threshold

    def to_dict(self):
        return {
            "product_id":    self.product_id,
            "name":          self.name,
            "category":      self.category,
            "category_id":   self.category_id,
            "unit":          self.unit,
            "unit_id":       self.unit_id,
            "purchase_price": float(self.purchase_price),
            "selling_price":  float(self.selling_price),
            "quantity":      float(self.quantity),
            "low_stock_threshold": float(self.low_stock_threshold),
            "is_low_stock":  self.is_low_stock,
            "created_at":    self.created_at.isoformat() if self.created_at else None,
        }


# SALE (Sales Recording)

class Sale(db.Model):
    __tablename__ = "sales"

    sale_id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(
        db.Integer, db.ForeignKey("users.user_id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    recorded_by = db.Column(
        db.Integer, db.ForeignKey("users.user_id", ondelete="RESTRICT"),
        nullable=False,
    )
    total_amount    = db.Column(db.Numeric(10, 2), nullable=False)
    sale_date       = db.Column(db.DateTime, nullable=False, default=datetime.now, index=True)
    notes           = db.Column(db.Text, nullable=True)
    payment_method  = db.Column(db.String(20), nullable=True)   # cash | mobile_money
    payment_status  = db.Column(db.String(20), nullable=True)   # paid | pending | confirmed | failed

    items = db.relationship(
        "SaleItem", backref="sale", cascade="all, delete-orphan",
    )
    recorder = db.relationship("User", foreign_keys=[recorded_by])

    def to_dict(self, include_items=False):
        data = {
            "sale_id": self.sale_id,
            "total_amount": float(self.total_amount),
            "sale_date": self.sale_date.isoformat() if self.sale_date else None,
            "recorded_by": self.recorded_by,
            "recorder_name": self.recorder.full_name if self.recorder else None,
            "notes": self.notes,
        }
        data["payment_method"] = self.payment_method
        data["payment_status"] = self.payment_status
        if include_items:
            data["items"] = [item.to_dict() for item in self.items]
        return data


class SaleItem(db.Model):
    __tablename__ = "sale_items"

    item_id = db.Column(db.Integer, primary_key=True)
    sale_id = db.Column(
        db.Integer, db.ForeignKey("sales.sale_id", ondelete="CASCADE"),
        nullable=False,
    )
    product_id = db.Column(
        db.Integer, db.ForeignKey("products.product_id", ondelete="RESTRICT"),
        nullable=False,
    )
    quantity = db.Column(Numeric(10, 2), nullable=False)
    unit_price = db.Column(db.Numeric(10, 2), nullable=False)
    subtotal = db.Column(db.Numeric(10, 2), nullable=False)

    product = db.relationship("Product")

    def to_dict(self):
        return {
            "item_id": self.item_id,
            "product_id": self.product_id,
            "product_name": self.product.name if self.product else None,
            "quantity": float(self.quantity),
            "unit_price": float(self.unit_price),
            "subtotal": float(self.subtotal),
        }



# ── EXPENSE (Expense Tracking) ───────────────────────────────────────────────

class Expense(db.Model):
    __tablename__ = "expenses"

    expense_id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(
        db.Integer, db.ForeignKey("users.user_id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    category_id = db.Column(
        db.Integer, db.ForeignKey("expense_categories.id", ondelete="RESTRICT"),
        nullable=True,
    )
    description = db.Column(db.String(255), nullable=True)
    amount = db.Column(db.Numeric(10, 2), nullable=False)
    expense_date = db.Column(db.Date, nullable=False, index=True)
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)

    category_obj = db.relationship("ExpenseCategory")

    @property
    def category(self):
        return self.category_obj.name if self.category_obj else None

    def to_dict(self):
        return {
            "expense_id":   self.expense_id,
            "category":     self.category,
            "category_id":  self.category_id,
            "description":  self.description,
            "amount":       float(self.amount),
            "expense_date": self.expense_date.isoformat() if self.expense_date else None,
            "created_at":   self.created_at.isoformat() if self.created_at else None,
        }



# PAYMENT (AzamPay mobile-money)

class Payment(db.Model):
    __tablename__ = "payments"

    payment_id     = db.Column(db.Integer, primary_key=True)
    sale_id        = db.Column(
        db.Integer, db.ForeignKey("sales.sale_id", ondelete="CASCADE"),
        nullable=False, unique=True, index=True,
    )
    provider       = db.Column(db.String(20), nullable=False)   # Mpesa | Tigopesa | Airtel | Halopesa
    phone_number   = db.Column(db.String(20), nullable=False)
    amount         = db.Column(db.Numeric(10, 2), nullable=False)
    external_id    = db.Column(db.String(100), nullable=False, unique=True, index=True)
    transaction_id = db.Column(db.String(100), nullable=True)   # AzamPay's reference
    status         = db.Column(db.String(20), nullable=False, default="pending")
    initiated_at   = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    confirmed_at   = db.Column(db.DateTime, nullable=True)

    sale = db.relationship("Sale", backref=db.backref("payment", uselist=False))

    def to_dict(self):
        return {
            "payment_id":     self.payment_id,
            "sale_id":        self.sale_id,
            "provider":       self.provider,
            "phone_number":   self.phone_number,
            "amount":         float(self.amount),
            "external_id":    self.external_id,
            "transaction_id": self.transaction_id,
            "status":         self.status,
            "initiated_at":   self.initiated_at.isoformat() if self.initiated_at else None,
            "confirmed_at":   self.confirmed_at.isoformat() if self.confirmed_at else None,
        }


# PASSWORD RESET (UAT addition)

class PasswordReset(db.Model):
    __tablename__ = "password_resets"

    reset_id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(
        db.Integer, db.ForeignKey("users.user_id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    token_hash = db.Column(db.String(255), nullable=False, index=True)
    expires_at = db.Column(db.DateTime, nullable=False)
    used_at = db.Column(db.DateTime, nullable=True)
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)

    user = db.relationship("User")

    @property
    def is_expired(self):
        return datetime.utcnow() >= self.expires_at

    @property
    def is_used(self):
        return self.used_at is not None

    @property
    def is_valid(self):
        return not self.is_expired and not self.is_used


# EMAIL VERIFICATION (signup flow)

class EmailVerification(db.Model):
    __tablename__ = "email_verifications"

    verification_id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(
        db.Integer, db.ForeignKey("users.user_id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    token_hash = db.Column(db.String(255), nullable=False, index=True)
    expires_at = db.Column(db.DateTime, nullable=False)
    verified_at = db.Column(db.DateTime, nullable=True)
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)

    user = db.relationship("User")

    @property
    def is_expired(self):
        return datetime.utcnow() >= self.expires_at

    @property
    def is_used(self):
        return self.verified_at is not None

    @property
    def is_valid(self):
        return not self.is_expired and not self.is_used
