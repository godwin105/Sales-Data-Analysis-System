from datetime import datetime
from sqlalchemy import Numeric
from extensions import db


# USER (Authentication)

class User(db.Model):
    __tablename__ = "users"

    user_id = db.Column(db.Integer, primary_key=True)
    business_name = db.Column(db.String(100), nullable=False)
    full_name = db.Column(db.String(100), nullable=False)
    email = db.Column(db.String(100), unique=True, nullable=False, index=True)
    password_hash = db.Column(db.String(255), nullable=False)
    role = db.Column(db.Enum("admin", "cashier"), nullable=False, default="admin")
    parent_user_id = db.Column(
        db.Integer,
        db.ForeignKey("users.user_id", ondelete="SET NULL"),
        nullable=True,
    )
    failed_login_attempts = db.Column(db.Integer, nullable=False, default=0)
    locked_until = db.Column(db.DateTime, nullable=True)
    is_active = db.Column(db.Boolean, nullable=False, default=True)
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
            "full_name": self.full_name,
            "email": self.email,
            "role": self.role,
            "is_active": self.is_active,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }

    def __repr__(self):
        return f"<User {self.email} ({self.role})>"


# PRODUCT (Stock Management)
class Product(db.Model):
    __tablename__ = "products"

    product_id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(
        db.Integer, db.ForeignKey("users.user_id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    name = db.Column(db.String(100), nullable=False)
    category = db.Column(db.String(50), nullable=True, index=True)
    purchase_price = db.Column(db.Numeric(10, 2), nullable=False)
    selling_price = db.Column(db.Numeric(10, 2), nullable=False)
    quantity =  db.Column(Numeric(10, 2), nullable=False, default=0)
    low_stock_threshold = db.Column(Numeric(10, 2), nullable=False, default=5)
    is_deleted = db.Column(db.Boolean, nullable=False, default=False)
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)

    @property
    def is_low_stock(self):
        return self.quantity <= self.low_stock_threshold

    def to_dict(self):
        return {
            "product_id": self.product_id,
            "name": self.name,
            "category": self.category,
            "purchase_price": float(self.purchase_price),
            "selling_price": float(self.selling_price),
            "quantity": float(self.quantity),
            "low_stock_threshold": float(self.low_stock_threshold),
            "is_low_stock": self.is_low_stock,
            "created_at": self.created_at.isoformat() if self.created_at else None,
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
    total_amount = db.Column(db.Numeric(10, 2), nullable=False)
    sale_date = db.Column(db.DateTime, nullable=False, default=datetime.now, index=True)
    notes = db.Column(db.Text, nullable=True)

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



# EXPENSE (Expense Tracking)

class Expense(db.Model):
    __tablename__ = "expenses"

    expense_id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(
        db.Integer, db.ForeignKey("users.user_id", ondelete="CASCADE"),
        nullable=False, index=True,
    )
    category = db.Column(db.String(50), nullable=False)
    description = db.Column(db.String(255), nullable=True)
    amount = db.Column(db.Numeric(10, 2), nullable=False)
    expense_date = db.Column(db.Date, nullable=False, index=True)
    created_at = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)

    def to_dict(self):
        return {
            "expense_id": self.expense_id,
            "category": self.category,
            "description": self.description,
            "amount": float(self.amount),
            "expense_date": self.expense_date.isoformat() if self.expense_date else None,
            "created_at": self.created_at.isoformat() if self.created_at else None,
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
