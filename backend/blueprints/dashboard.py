from datetime import datetime, date, timedelta

from flask import Blueprint, jsonify, request
from flask_jwt_extended import jwt_required, current_user
from sqlalchemy import func

from extensions import db
from models import Sale, SaleItem, Product, Expense, ExpenseCategory
from blueprints.expenses import profit_loss_for_period

dashboard_bp = Blueprint("dashboard", __name__, url_prefix="/api/dashboard")


@dashboard_bp.route("", methods=["GET"])
@jwt_required()
def dashboard():
    """All data the React Dashboard page needs in a single payload."""
    owner_id = current_user.owner_id
    today = date.today()


    today_start = datetime.combine(today, datetime.min.time())
    today_end = today_start + timedelta(days=1)
    today_rev = (
        db.session.query(func.coalesce(func.sum(Sale.total_amount), 0))
        .filter(
            Sale.user_id == owner_id,
            Sale.sale_date >= today_start,
            Sale.sale_date < today_end,
        )
        .scalar()
    )

    month_start = datetime.combine(today.replace(day=1), datetime.min.time())
    if today.month == 12:
        next_month_start = datetime(today.year + 1, 1, 1)
    else:
        next_month_start = datetime(today.year, today.month + 1, 1)

    pl = profit_loss_for_period(owner_id, month_start, next_month_start)

    total_products = (
        db.session.query(Product)
        .filter_by(user_id=owner_id, is_deleted=False)
        .count()
    )
    low_stock_q = (
        db.session.query(Product)
        .filter(
            Product.user_id == owner_id,
            Product.is_deleted.is_(False),
            Product.quantity <= Product.low_stock_threshold,
        )
        .order_by(Product.quantity)
        .all()
    )
    low_stock_count = len(low_stock_q)

    kpi = {
        "today_revenue": int(today_rev or 0),
        "monthly_profit": int(pl["net_profit"]),
        "total_products": total_products,
        "low_stock_count": low_stock_count,
        "low_stock_items": [
            {
                "name": p.name,
                "quantity": float(p.quantity),
                "threshold": float(p.low_stock_threshold),
            }
            for p in low_stock_q
        ],
    }

    # ========================================================================
    # RECENT SALES (last 5)
    # ========================================================================
    recent_sales_q = (
        db.session.query(Sale)
        .filter_by(user_id=owner_id)
        .order_by(Sale.sale_date.desc())
        .limit(5)
        .all()
    )
    recent_sales = [
        {
            "sale_id": s.sale_id,
            "sale_date": s.sale_date.isoformat() if s.sale_date else None,
            "total_amount": float(s.total_amount),
            "recorder_name": s.recorder.full_name if s.recorder else "—",
        }
        for s in recent_sales_q
    ]

    # ========================================================================
    # CHARTS (FR-20, FR-21, FR-22)
    # top_products queried once; same list drives both bar chart and trend lines
    # ========================================================================
    top_products = _get_top_products(owner_id, month_start, next_month_start)
    charts = {
        "trend": _build_sales_trend(owner_id, today, top_products),
        "top_products": {
            "labels": [r.name for r in top_products],
            "values": [int(r.qty_sold) for r in top_products],
        },
        "expenses": _build_expense_breakdown(owner_id, month_start, next_month_start),
    }

    return jsonify({
        "kpi": kpi,
        "recent_sales": recent_sales,
        "charts": charts,
    }), 200


@dashboard_bp.route("/cashier", methods=["GET"])
@jwt_required()
def cashier_dashboard():
    """Dashboard payload scoped to the logged-in cashier's own activity."""
    owner_id   = current_user.owner_id
    cashier_id = current_user.user_id
    today      = date.today()
    today_start = datetime.combine(today, datetime.min.time())
    today_end   = today_start + timedelta(days=1)

    my_sales_count = (
        db.session.query(func.count(Sale.sale_id))
        .filter(
            Sale.user_id     == owner_id,
            Sale.recorded_by == cashier_id,
            Sale.sale_date   >= today_start,
            Sale.sale_date   <  today_end,
        )
        .scalar() or 0
    )

    my_revenue = (
        db.session.query(func.coalesce(func.sum(Sale.total_amount), 0))
        .filter(
            Sale.user_id     == owner_id,
            Sale.recorded_by == cashier_id,
            Sale.sale_date   >= today_start,
            Sale.sale_date   <  today_end,
        )
        .scalar() or 0
    )

    pending_count = (
        db.session.query(func.count(Sale.sale_id))
        .filter(
            Sale.user_id       == owner_id,
            Sale.recorded_by   == cashier_id,
            Sale.payment_status == "pending",
        )
        .scalar() or 0
    )

    low_stock_q = (
        db.session.query(Product)
        .filter(
            Product.user_id    == owner_id,
            Product.is_deleted.is_(False),
            Product.quantity   <= Product.low_stock_threshold,
        )
        .order_by(Product.quantity)
        .all()
    )

    recent_q = (
        db.session.query(Sale)
        .filter(
            Sale.user_id     == owner_id,
            Sale.recorded_by == cashier_id,
        )
        .order_by(Sale.sale_date.desc())
        .limit(8)
        .all()
    )

    return jsonify({
        "kpi": {
            "my_sales_today":    int(my_sales_count),
            "my_revenue_today":  int(my_revenue),
            "low_stock_count":   len(low_stock_q),
            "pending_payments":  int(pending_count),
            "low_stock_items": [
                {
                    "name":      p.name,
                    "quantity":  float(p.quantity),
                    "unit":      p.unit or "pcs",
                    "threshold": float(p.low_stock_threshold),
                }
                for p in low_stock_q
            ],
        },
        "recent_sales": [
            {
                "sale_id":        s.sale_id,
                "sale_date":      s.sale_date.isoformat(),
                "total_amount":   float(s.total_amount),
                "items_count":    len(s.items),
                "payment_method": s.payment_method,
                "payment_status": s.payment_status,
            }
            for s in recent_q
        ],
    }), 200


# =========================================================================
# CHART BUILDERS
# =========================================================================
def _get_top_products(owner_id, start_dt, end_dt):
    """FR-21: top 5 products by units sold (quantity) for a period."""
    return (
        db.session.query(
            Product.product_id,
            Product.name,
            func.coalesce(func.sum(SaleItem.quantity), 0).label("qty_sold"),
        )
        .join(Product, SaleItem.product_id == Product.product_id)
        .join(Sale, SaleItem.sale_id == Sale.sale_id)
        .filter(
            Sale.user_id == owner_id,
            Sale.sale_date >= start_dt,
            Sale.sale_date < end_dt,
        )
        .group_by(Product.product_id, Product.name)
        .order_by(func.sum(SaleItem.quantity).desc())
        .limit(5)
        .all()
    )


def _build_trend_datasets(owner_id, month_start, days, start_dt, end_dt, top_products):
    """Shared helper: per-product daily units sold for a date range."""
    labels = [(month_start + timedelta(days=i)).strftime("%b %d") for i in range(days)]
    if not top_products:
        return {"labels": labels, "datasets": []}

    datasets = []
    for product in top_products:
        rows = (
            db.session.query(
                func.date(Sale.sale_date).label("day"),
                func.coalesce(func.sum(SaleItem.quantity), 0).label("total"),
            )
            .join(Sale, SaleItem.sale_id == Sale.sale_id)
            .filter(
                Sale.user_id == owner_id,
                SaleItem.product_id == product.product_id,
                Sale.sale_date >= start_dt,
                Sale.sale_date < end_dt,
            )
            .group_by("day")
            .all()
        )
        day_map = {}
        for row in rows:
            k = row.day if isinstance(row.day, date) else datetime.strptime(str(row.day), "%Y-%m-%d").date()
            day_map[k] = int(row.total or 0)
        values = [day_map.get(month_start + timedelta(days=i), 0) for i in range(days)]
        datasets.append({"name": product.name, "values": values})

    return {"labels": labels, "datasets": datasets}


def _build_sales_trend(owner_id, today, top_products):
    """FR-20: per-product daily units sold in the current month (day 1 to today)."""
    month_start = today.replace(day=1)
    start_dt = datetime.combine(month_start, datetime.min.time())
    end_dt = datetime.combine(today + timedelta(days=1), datetime.min.time())
    days = (today - month_start).days + 1
    return _build_trend_datasets(owner_id, month_start, days, start_dt, end_dt, top_products)


@dashboard_bp.route("/sales-trend", methods=["GET"])
@jwt_required()
def sales_trend_by_month():
    """Per-product daily units sold for any given month."""
    owner_id = current_user.owner_id
    today = date.today()
    year = request.args.get("year", type=int, default=today.year)
    month = request.args.get("month", type=int, default=today.month)
    try:
        month_start = date(year, month, 1)
        start_dt = datetime(year, month, 1)
        end_dt = datetime(year + 1, 1, 1) if month == 12 else datetime(year, month + 1, 1)
    except ValueError:
        return jsonify({"error": "Invalid year or month"}), 400

    if year == today.year and month == today.month:
        days = (today - month_start).days + 1
        cap_end = datetime.combine(today + timedelta(days=1), datetime.min.time())
    else:
        days = (end_dt.date() - month_start).days
        cap_end = end_dt

    top_products = _get_top_products(owner_id, start_dt, cap_end)
    return jsonify(_build_trend_datasets(owner_id, month_start, days, start_dt, cap_end, top_products)), 200


@dashboard_bp.route("/top-products", methods=["GET"])
@jwt_required()
def top_products_by_month():
    """Top 5 selling products for a given year/month (defaults to current month)."""
    owner_id = current_user.owner_id
    today = date.today()
    year = request.args.get("year", type=int, default=today.year)
    month = request.args.get("month", type=int, default=today.month)
    try:
        start_dt = datetime(year, month, 1)
        end_dt = datetime(year + 1, 1, 1) if month == 12 else datetime(year, month + 1, 1)
    except ValueError:
        return jsonify({"error": "Invalid year or month"}), 400
    rows = _get_top_products(owner_id, start_dt, end_dt)
    return jsonify({
        "labels": [r.name for r in rows],
        "values": [int(r.qty_sold) for r in rows],
    }), 200


@dashboard_bp.route("/expenses", methods=["GET"])
@jwt_required()
def expenses_by_month():
    """Expense breakdown for a given year/month (defaults to current month)."""
    owner_id = current_user.owner_id
    today = date.today()
    year = request.args.get("year", type=int, default=today.year)
    month = request.args.get("month", type=int, default=today.month)
    try:
        start_dt = datetime(year, month, 1)
        end_dt = datetime(year + 1, 1, 1) if month == 12 else datetime(year, month + 1, 1)
    except ValueError:
        return jsonify({"error": "Invalid year or month"}), 400
    return jsonify(_build_expense_breakdown(owner_id, start_dt, end_dt)), 200


def _build_expense_breakdown(owner_id, start_dt, end_dt):
    """FR-22: operating expense totals by category for current month."""
    rows = (
        db.session.query(ExpenseCategory.name, func.sum(Expense.amount))
        .join(ExpenseCategory, Expense.category_id == ExpenseCategory.id)
        .filter(
            Expense.user_id      == owner_id,
            Expense.expense_date >= start_dt.date(),
            Expense.expense_date <  end_dt.date(),
            ExpenseCategory.name != "Purchase Costs",
        )
        .group_by(ExpenseCategory.name)
        .order_by(func.sum(Expense.amount).desc())
        .all()
    )
    return {
        "labels": [r[0] for r in rows],
        "values": [int(r[1]) for r in rows],
    }
