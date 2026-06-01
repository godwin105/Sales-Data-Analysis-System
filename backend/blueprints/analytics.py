from datetime import datetime, date, timedelta
from decimal import Decimal
from collections import defaultdict

from flask import Blueprint, jsonify
from flask_jwt_extended import current_user
from sqlalchemy import func

from extensions import db
from models import Sale, SaleItem, Product
from blueprints.expenses import profit_loss_for_period
from utils.decorators import admin_required

analytics_bp = Blueprint("analytics", __name__, url_prefix="/api/insights")


@analytics_bp.route("", methods=["GET"])
@admin_required
def insights():

    #Priority-sorted business insights data
    owner_id = current_user.owner_id
    today = date.today()

    # Current month + previous month windows
    month_start = datetime.combine(today.replace(day=1), datetime.min.time())
    if today.month == 12:
        next_month_start = datetime(today.year + 1, 1, 1)
    else:
        next_month_start = datetime(today.year, today.month + 1, 1)

    prev_month_end = month_start
    prev = (month_start - timedelta(days=1)).replace(day=1)
    prev_month_start = datetime.combine(prev.date(), datetime.min.time())

    this_pl = profit_loss_for_period(owner_id, month_start, next_month_start)
    last_pl = profit_loss_for_period(owner_id, prev_month_start, prev_month_end)

    has_data = (this_pl["total_sales"] > 0) or (this_pl["expenses_total"] > 0)

    # Revenue change vs last month
    if last_pl["revenue"] > 0:
        rev_change = float(
            (this_pl["revenue"] - last_pl["revenue"]) / last_pl["revenue"] * 100
        )
    else:
        rev_change = 0.0

    if last_pl["expenses_total"] > 0:
        exp_change = float(
            (this_pl["expenses_total"] - last_pl["expenses_total"])
            / last_pl["expenses_total"] * 100
        )
    else:
        exp_change = 0.0

    # Profit margin
    margin = 0.0
    if this_pl["revenue"] > 0:
        margin = float(this_pl["net_profit"] / this_pl["revenue"] * 100)

    # Priority 1: Stock-out projections
    critical_stockouts = _stockout_projections(owner_id, today)

    # Priority 2: Expense ratio
    expense_ratio = 0.0
    if this_pl["revenue"] > 0:
        expense_ratio = float(this_pl["expenses_total"] / this_pl["revenue"] * 100)
    expense_ratio_warning = expense_ratio > 60

    # Priority 3: Revenue growth (>5%)
    revenue_growth = rev_change > 5.0
    revenue_gain = this_pl["revenue"] - last_pl["revenue"]

    # Charts
    charts = _build_insights_charts(owner_id, today)

    return jsonify({
        "period_label": today.strftime("%B %Y"),
        "has_data": has_data,
        "kpis": {
            "revenue_display":      _short_money(this_pl["revenue"]),
            "revenue_change":       round(rev_change, 1),
            "profit_display":       _short_money(this_pl["net_profit"]),
            "profit_margin":        round(margin, 1),
            "expenses_display":     _short_money(this_pl["expenses_total"]),
            "expense_change":       round(exp_change, 1),
            "critical_alerts":      len(critical_stockouts),
            "revenue_gain_display": _short_money(revenue_gain),
        },
        "priority_alerts": {
            "critical_stockouts":     critical_stockouts,
            "expense_ratio_warning":  expense_ratio_warning,
            "expense_ratio":          round(expense_ratio, 1),
            "revenue_growth":         revenue_growth,
        },
        "charts": charts,
    }), 200


# =========================================================================
# INSIGHT CALCULATIONS
# =========================================================================
def _stockout_projections(owner_id, today):
    lookback_days = 14
    start_dt = datetime.combine(today - timedelta(days=lookback_days), datetime.min.time())

    velocity_rows = (
        db.session.query(
            Product.product_id,
            Product.name,
            Product.quantity,
            func.coalesce(func.sum(SaleItem.quantity), 0).label("sold"),
        )
        .outerjoin(SaleItem, SaleItem.product_id == Product.product_id)
        .outerjoin(Sale, (SaleItem.sale_id == Sale.sale_id) & (Sale.sale_date >= start_dt))
        .filter(
            Product.user_id == owner_id,
            Product.is_deleted.is_(False),
        )
        .group_by(Product.product_id, Product.name, Product.quantity)
        .all()
    )

    results = []
    for r in velocity_rows:
        sold = int(r.sold or 0)
        if sold == 0 or r.quantity == 0:
            continue
        daily_rate = sold / lookback_days
        if daily_rate <= 0:
            continue
        days_left = r.quantity / daily_rate
        if days_left <= 10:
            results.append({
                "name": r.name,
                "units_left": r.quantity,
                "daily_rate": round(daily_rate, 1),
                "days_left": round(days_left, 1),
            })

    results.sort(key=lambda x: x["days_left"])
    return results[:5]


def _build_insights_charts(owner_id, today):
    """Build the 4 bottom charts."""
    compare_labels, compare_rev, compare_exp = [], [], []
    margin_labels, margin_vals = [], []

    for i in range(5, -1, -1):
        m = today.month - i
        y = today.year
        while m <= 0:
            m += 12
            y -= 1
        ms = datetime(y, m, 1)
        if m == 12:
            me = datetime(y + 1, 1, 1)
        else:
            me = datetime(y, m + 1, 1)
        pl = profit_loss_for_period(owner_id, ms, me)
        compare_labels.append(ms.strftime("%b"))
        compare_rev.append(int(pl["revenue"]))
        compare_exp.append(int(pl["expenses_total"]))
        margin_labels.append(ms.strftime("%b"))
        if pl["revenue"] > 0:
            margin_vals.append(round(float(pl["net_profit"] / pl["revenue"] * 100), 1))
        else:
            margin_vals.append(0)

    # Day-of-week average revenue (current month)
    day_labels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    day_totals = [Decimal("0")] * 7
    day_counts = [0] * 7

    month_start = datetime(today.year, today.month, 1)
    if today.month == 12:
        next_m = datetime(today.year + 1, 1, 1)
    else:
        next_m = datetime(today.year, today.month + 1, 1)

    sales_in_month = (
        db.session.query(Sale.sale_date, Sale.total_amount)
        .filter(
            Sale.user_id == owner_id,
            Sale.sale_date >= month_start,
            Sale.sale_date < next_m,
        )
        .all()
    )

    daily_totals = defaultdict(Decimal)
    for sd, amount in sales_in_month:
        daily_totals[sd.date()] += Decimal(amount or 0)

    for d, total in daily_totals.items():
        dow = d.weekday()
        day_totals[dow] += total
        day_counts[dow] += 1

    day_values = [
        int(day_totals[i] / day_counts[i]) if day_counts[i] > 0 else 0
        for i in range(7)
    ]

    # Product velocity (top 5 by units sold this month)
    vel_rows = (
        db.session.query(Product.name, func.coalesce(func.sum(SaleItem.quantity), 0).label("units"))
        .join(Product, SaleItem.product_id == Product.product_id)
        .join(Sale, SaleItem.sale_id == Sale.sale_id)
        .filter(
            Sale.user_id == owner_id,
            Sale.sale_date >= month_start,
            Sale.sale_date < next_m,
        )
        .group_by(Product.product_id, Product.name)
        .order_by(func.sum(SaleItem.quantity).desc())
        .limit(5)
        .all()
    )

    return {
        "compare":  {"labels": compare_labels, "revenue": compare_rev, "expenses": compare_exp},
        "margin":   {"labels": margin_labels, "values": margin_vals},
        "days":     {"labels": day_labels, "values": day_values},
        "velocity": {"labels": [r.name for r in vel_rows], "values": [int(r.units) for r in vel_rows]},
    }


def _short_money(value):
    """Format a Decimal as '3.08M' / '1.16M' / '450k' / '0'."""
    v = float(value or 0)
    sign = "-" if v < 0 else ""
    v = abs(v)
    if v >= 1_000_000:
        return f"{sign}{v/1_000_000:.2f}M"
    if v >= 1_000:
        return f"{sign}{v/1_000:.0f}k"
    return f"{sign}{int(v)}"
