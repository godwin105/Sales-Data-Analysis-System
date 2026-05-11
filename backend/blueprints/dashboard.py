"""
Dashboard API blueprint.

Release 5 (Weeks 9-10): aggregated data feed for the React dashboard.
    FR-19  Total revenue / expenses / net profit for selected period
    FR-20  Sales Trend Line Chart (revenue over time)
    FR-21  Top Products Bar Chart (best sellers by revenue)
    FR-22  Expense Breakdown Doughnut Chart (by category)
    FR-23  KPI cards

Endpoint:
    GET /api/dashboard
"""
from datetime import datetime, date, timedelta

from flask import Blueprint, jsonify
from flask_jwt_extended import jwt_required, current_user
from sqlalchemy import func

from extensions import db
from models import Sale, SaleItem, Product, Expense
from blueprints.expenses import profit_loss_for_period

dashboard_bp = Blueprint("dashboard", __name__, url_prefix="/api/dashboard")


@dashboard_bp.route("", methods=["GET"])
@jwt_required()
def dashboard():
    """All data the React Dashboard page needs in a single payload."""
    owner_id = current_user.owner_id
    today = date.today()

    # ========================================================================
    # KPI CARDS (FR-23)
    # ========================================================================
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
    low_stock_count = (
        db.session.query(Product)
        .filter(
            Product.user_id == owner_id,
            Product.is_deleted.is_(False),
            Product.quantity <= Product.low_stock_threshold,
        )
        .count()
    )

    kpi = {
        "today_revenue": int(today_rev or 0),
        "monthly_profit": int(pl["net_profit"]),
        "total_products": total_products,
        "low_stock_count": low_stock_count,
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
    # ========================================================================
    charts = {
        "trend":        _build_sales_trend(owner_id, today),
        "top_products": _build_top_products(owner_id, month_start, next_month_start),
        "expenses":     _build_expense_breakdown(owner_id, month_start, next_month_start),
    }

    return jsonify({
        "kpi": kpi,
        "recent_sales": recent_sales,
        "charts": charts,
    }), 200


# =========================================================================
# CHART BUILDERS
# =========================================================================
def _build_sales_trend(owner_id, today):
    """FR-20: daily revenue for last 30 days."""
    start = today - timedelta(days=29)
    start_dt = datetime.combine(start, datetime.min.time())
    end_dt = datetime.combine(today + timedelta(days=1), datetime.min.time())

    rows = (
        db.session.query(
            func.date(Sale.sale_date).label("day"),
            func.coalesce(func.sum(Sale.total_amount), 0).label("total"),
        )
        .filter(
            Sale.user_id == owner_id,
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

    labels, values = [], []
    for i in range(30):
        d = start + timedelta(days=i)
        labels.append(d.strftime("%b %d"))
        values.append(day_map.get(d, 0))

    return {"labels": labels, "values": values}


def _build_top_products(owner_id, start_dt, end_dt):
    """FR-21: top 5 products by revenue in current month."""
    rows = (
        db.session.query(
            Product.name,
            func.coalesce(func.sum(SaleItem.subtotal), 0).label("revenue"),
        )
        .join(Product, SaleItem.product_id == Product.product_id)
        .join(Sale, SaleItem.sale_id == Sale.sale_id)
        .filter(
            Sale.user_id == owner_id,
            Sale.sale_date >= start_dt,
            Sale.sale_date < end_dt,
        )
        .group_by(Product.product_id, Product.name)
        .order_by(func.sum(SaleItem.subtotal).desc())
        .limit(5)
        .all()
    )
    return {
        "labels": [r.name for r in rows],
        "values": [int(r.revenue) for r in rows],
    }


def _build_expense_breakdown(owner_id, start_dt, end_dt):
    """FR-22: expense totals by category for current month."""
    rows = (
        db.session.query(Expense.category, func.sum(Expense.amount))
        .filter(
            Expense.user_id == owner_id,
            Expense.expense_date >= start_dt.date(),
            Expense.expense_date < end_dt.date(),
        )
        .group_by(Expense.category)
        .order_by(func.sum(Expense.amount).desc())
        .all()
    )
    return {
        "labels": [r[0] for r in rows],
        "values": [int(r[1]) for r in rows],
    }
