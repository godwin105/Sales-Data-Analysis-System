from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from collections import defaultdict

from flask import Blueprint, request, jsonify
from flask_jwt_extended import current_user
from sqlalchemy import func
from sqlalchemy.orm import joinedload

from extensions import db
from models import Expense, Sale, SaleItem, Product, ExpenseCategory
from utils.decorators import cashier_or_admin_required

expenses_bp = Blueprint("expenses", __name__, url_prefix="/api/expenses")


# SHARED HELPER — used by dashboard, analytics, reports

def profit_loss_for_period(owner_id, start_dt, end_dt):
    """
    Computes revenue, COGS, gross profit, operating expenses, and net profit
    for the window [start_dt, end_dt).

    COGS = sum(units_sold × purchase_price) for all sale items in the period.
    Operating Expenses = manually recorded expenses (Rent, Utilities, Salaries,
    Miscellaneous). "Purchase Costs" records are excluded — they are legacy
    entries created by the old system and are superseded by the COGS calculation.
    Net Profit = Gross Profit − Operating Expenses.
    """
    revenue_row = (
        db.session.query(
            func.coalesce(func.sum(Sale.total_amount), 0),
            func.count(Sale.sale_id),
        )
        .filter(
            Sale.user_id == owner_id,
            Sale.sale_date >= start_dt,
            Sale.sale_date < end_dt,
        )
        .one()
    )
    revenue     = Decimal(revenue_row[0] or 0)
    total_sales = int(revenue_row[1] or 0)

    # COGS: cost of every unit sold in the period at its purchase price
    cogs_scalar = (
        db.session.query(
            func.coalesce(func.sum(SaleItem.quantity * Product.purchase_price), 0)
        )
        .join(Product, SaleItem.product_id == Product.product_id)
        .join(Sale,    SaleItem.sale_id    == Sale.sale_id)
        .filter(
            Sale.user_id   == owner_id,
            Sale.sale_date >= start_dt,
            Sale.sale_date <  end_dt,
        )
        .scalar()
    )
    cogs         = Decimal(cogs_scalar or 0)
    gross_profit = revenue - cogs

    # Operating expenses — exclude legacy "Purchase Costs" entries via join
    exp_rows = (
        db.session.query(ExpenseCategory.name, func.sum(Expense.amount))
        .join(ExpenseCategory, Expense.category_id == ExpenseCategory.id)
        .filter(
            Expense.user_id      == owner_id,
            Expense.expense_date >= start_dt.date(),
            Expense.expense_date <  end_dt.date(),
            ExpenseCategory.name != "Purchase Costs",
        )
        .group_by(ExpenseCategory.name)
        .all()
    )
    expenses_by_cat    = {cat: Decimal(total or 0) for cat, total in exp_rows}
    operating_expenses = sum(expenses_by_cat.values(), Decimal("0"))

    net_profit = gross_profit - operating_expenses
    avg_sale   = (revenue / total_sales) if total_sales else Decimal("0")

    return {
        "revenue":            revenue,
        "cogs":               cogs,
        "gross_profit":       gross_profit,
        "operating_expenses": operating_expenses,
        "expenses_total":     operating_expenses,   # backward-compatible alias
        "expenses_by_cat":    expenses_by_cat,
        "net_profit":         net_profit,
        "total_sales":        total_sales,
        "avg_sale":           avg_sale,
    }


# =========================================================================
# VALIDATION
# =========================================================================
def _validate_expense_payload(data):
    errors = {}

    # Validate category against the DB lookup table (exclude Purchase Costs)
    category_id = None
    category_name = data.get("category")
    if not category_name:
        errors["category"] = "Please pick a category."
    else:
        cat_obj = db.session.query(ExpenseCategory).filter(
            ExpenseCategory.name == category_name,
            ExpenseCategory.name != "Purchase Costs",
        ).first()
        if cat_obj is None:
            valid = [c.name for c in db.session.query(ExpenseCategory).filter(
                ExpenseCategory.name != "Purchase Costs"
            ).all()]
            errors["category"] = f"Category must be one of: {', '.join(valid)}."
        else:
            category_id = cat_obj.id

    description = (data.get("description") or "").strip()
    if description and len(description) > 255:
        errors["description"] = "Description is too long (max 255 characters)."

    amount_raw = data.get("amount")
    amount = None
    if amount_raw in (None, ""):
        errors["amount"] = "Expense amount is required."
    else:
        try:
            amount = Decimal(str(amount_raw))
            if amount <= 0:
                errors["amount"] = "Amount must be greater than zero."
        except (InvalidOperation, ValueError, TypeError):
            errors["amount"] = "Please enter a valid number."

    expense_date_raw = (data.get("expense_date") or "").strip()
    expense_date = None
    if not expense_date_raw:
        errors["expense_date"] = "Date is required."
    else:
        try:
            expense_date = datetime.strptime(expense_date_raw, "%Y-%m-%d").date()
            if expense_date > date.today():
                errors["expense_date"] = "Expense date cannot be in the future."
        except ValueError:
            errors["expense_date"] = "Invalid date format."

    if errors:
        return None, errors

    return {
        "category_id":  category_id,
        "description":  description or None,
        "amount":       amount,
        "expense_date": expense_date,
    }, None


# =========================================================================
# ROUTES
# =========================================================================
@expenses_bp.route("", methods=["GET"])
@cashier_or_admin_required
def list_expenses():
    owner_id = current_user.owner_id

    expenses = (
        db.session.query(Expense)
        .options(joinedload(Expense.category_obj))
        .filter_by(user_id=owner_id)
        .order_by(Expense.expense_date.desc(), Expense.created_at.desc())
        .all()
    )

    # Aggregate totals per category, in DB-defined order (excluding Purchase Costs)
    valid_cats = [c.name for c in db.session.query(ExpenseCategory).filter(
        ExpenseCategory.name != "Purchase Costs"
    ).order_by(ExpenseCategory.id).all()]

    category_totals = defaultdict(lambda: Decimal("0"))
    for exp in expenses:
        if exp.category and exp.category != "Purchase Costs":
            category_totals[exp.category] += exp.amount

    ordered_totals = {
        cat: float(category_totals[cat])
        for cat in valid_cats
        if cat in category_totals
    }

    return jsonify({
        "expenses":       [e.to_dict() for e in expenses],
        "category_totals": ordered_totals,
        "categories":     valid_cats,
    }), 200


@expenses_bp.route("", methods=["POST"])
@cashier_or_admin_required
def add_expense():
    """FR-16: record an expense."""
    data = request.get_json(silent=True) or {}
    clean, errors = _validate_expense_payload(data)

    if errors:
        return jsonify({"error": "Validation failed", "fields": errors}), 400

    expense = Expense(
        user_id=current_user.owner_id,
        category_id=clean["category_id"],
        description=clean["description"],
        amount=clean["amount"],
        expense_date=clean["expense_date"],
    )
    db.session.add(expense)
    db.session.commit()

    return jsonify({
        "message": (
            f"Expense of TZS {expense.amount:,.0f} ({expense.category}) saved."
        ),
        "expense": expense.to_dict(),
    }), 201


@expenses_bp.route("/<int:expense_id>", methods=["DELETE"])
@cashier_or_admin_required
def delete_expense(expense_id):
    expense = db.session.query(Expense).filter(
        Expense.expense_id == expense_id,
        Expense.user_id == current_user.owner_id,
    ).first()

    if expense is None:
        return jsonify({"error": "Expense not found."}), 404

    db.session.delete(expense)
    db.session.commit()
    return jsonify({"message": "Expense deleted."}), 200
