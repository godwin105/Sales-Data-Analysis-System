from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from collections import defaultdict

from flask import Blueprint, request, jsonify
from flask_jwt_extended import current_user
from sqlalchemy import func

from extensions import db
from models import Expense, Sale, SaleItem, Product
from utils.decorators import cashier_or_admin_required

expenses_bp = Blueprint("expenses", __name__, url_prefix="/api/expenses")


EXPENSE_CATEGORIES = ["Rent", "Utilities", "Salaries", "Miscellaneous"]


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

    # Operating expenses — exclude legacy "Purchase Costs" entries
    exp_rows = (
        db.session.query(Expense.category, func.sum(Expense.amount))
        .filter(
            Expense.user_id      == owner_id,
            Expense.expense_date >= start_dt.date(),
            Expense.expense_date <  end_dt.date(),
            Expense.category     != "Purchase Costs",
        )
        .group_by(Expense.category)
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

    category = data.get("category")
    if not category:
        errors["category"] = "Please pick a category."
    elif category not in EXPENSE_CATEGORIES:
        errors["category"] = (
            f"Category must be one of: {', '.join(EXPENSE_CATEGORIES)}."
        )

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
        "category": category,
        "description": description or None,
        "amount": amount,
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
        .filter_by(user_id=owner_id)
        .order_by(Expense.expense_date.desc(), Expense.created_at.desc())
        .all()
    )

    # FR-18: aggregate totals per category, in canonical order
    category_totals = defaultdict(lambda: Decimal("0"))
    for exp in expenses:
        category_totals[exp.category] += exp.amount

    ordered_totals = {
        cat: float(category_totals[cat])
        for cat in EXPENSE_CATEGORIES
        if cat in category_totals
    }

    return jsonify({
        "expenses": [e.to_dict() for e in expenses],
        "category_totals": ordered_totals,
        "categories": EXPENSE_CATEGORIES,
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
        category=clean["category"],
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
