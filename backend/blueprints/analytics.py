from datetime import datetime, date, timedelta
from decimal import Decimal
from collections import defaultdict

from flask import Blueprint, jsonify, request
from flask_jwt_extended import current_user
from sqlalchemy import case, func

from extensions import db
from models import Sale, SaleItem, Product, ProductCategory, Expense
from blueprints.expenses import profit_loss_for_period
from utils.decorators import admin_required

analytics_bp = Blueprint("analytics", __name__, url_prefix="/api/insights")


def _parse_period():
    """Return (year, month) from ?year=&month= args, clamped to current month."""
    today = date.today()
    try:
        y = int(request.args.get("year",  today.year))
        m = int(request.args.get("month", today.month))
        if not (1 <= m <= 12):
            raise ValueError
        if date(y, m, 1) > today.replace(day=1):
            return today.year, today.month
        return y, m
    except (TypeError, ValueError):
        return today.year, today.month


def _business_start(owner_id):
    """Return date(y, m, 1) of the earliest recorded sale or expense, or None."""
    first_sale = (
        db.session.query(func.min(Sale.sale_date))
        .filter(Sale.user_id == owner_id)
        .scalar()
    )
    first_exp = (
        db.session.query(func.min(Expense.expense_date))
        .filter(Expense.user_id == owner_id)
        .scalar()
    )
    # Sale.sale_date is DateTime; Expense.expense_date is Date — normalise both to date
    candidates = []
    if first_sale is not None:
        candidates.append(first_sale.date() if isinstance(first_sale, datetime) else first_sale)
    if first_exp is not None:
        candidates.append(first_exp)
    if not candidates:
        return None
    earliest = min(candidates)
    return date(earliest.year, earliest.month, 1)


@analytics_bp.route("", methods=["GET"])
@admin_required
def insights():
    owner_id   = current_user.owner_id
    today      = date.today()
    sel_year, sel_month = _parse_period()
    is_current = (sel_year == today.year and sel_month == today.month)

    month_start      = datetime(sel_year, sel_month, 1)
    next_month_start = datetime(sel_year, sel_month + 1, 1) if sel_month < 12 else datetime(sel_year + 1, 1, 1)
    prev_dt          = (month_start - timedelta(days=1)).replace(day=1)
    prev_month_start = datetime(prev_dt.year, prev_dt.month, 1)
    prev_month_end   = month_start

    this_pl = profit_loss_for_period(owner_id, month_start, next_month_start)
    last_pl = profit_loss_for_period(owner_id, prev_month_start, prev_month_end)

    has_data = (this_pl["total_sales"] > 0) or (this_pl["expenses_total"] > 0)

    def _pct(a, b):
        return round(float((a - b) / b * 100), 1) if b and b > 0 else 0.0

    rev_change = _pct(this_pl["revenue"],        last_pl["revenue"])
    exp_change = _pct(this_pl["expenses_total"], last_pl["expenses_total"])
    txn_change = _pct(this_pl["total_sales"],    last_pl["total_sales"])

    margin = float(this_pl["net_profit"] / this_pl["revenue"] * 100) if this_pl["revenue"] > 0 else 0.0

    ref_date           = date(sel_year, sel_month, 1)
    biz_start          = _business_start(owner_id)
    is_before_start    = biz_start is not None and ref_date < biz_start

    critical_stockouts = _stockout_projections(owner_id, today)      # always real-time stock
    slow_moving        = _slow_moving_products(owner_id, ref_date)

    if is_current:
        forecast_val, forecast_trend = _forecast_next_month(owner_id, today)
    else:
        forecast_val, forecast_trend = 0, 0.0

    expense_ratio         = float(this_pl["expenses_total"] / this_pl["revenue"] * 100) if this_pl["revenue"] > 0 else 0.0
    expense_ratio_warning = expense_ratio > 60
    revenue_growth        = rev_change > 5.0
    revenue_gain          = this_pl["revenue"] - last_pl["revenue"]

    charts = _build_insights_charts(owner_id, ref_date, this_pl["expenses_by_cat"])

    return jsonify({
        "period_label":    date(sel_year, sel_month, 1).strftime("%B %Y"),
        "is_current":      is_current,
        "is_before_start": is_before_start,
        "has_data":        has_data,
        "business_start":  {"year": biz_start.year, "month": biz_start.month} if biz_start else None,
        "kpis": {
            "revenue_display":      _short_money(this_pl["revenue"]),
            "revenue_change":       rev_change,
            "profit_display":       _short_money(this_pl["net_profit"]),
            "profit_margin":        round(margin, 1),
            "expenses_display":     _short_money(this_pl["expenses_total"]),
            "expense_change":       exp_change,
            "critical_alerts":      len(critical_stockouts),
            "revenue_gain_display": _short_money(revenue_gain),
            "total_transactions":   this_pl["total_sales"],
            "txn_change":           txn_change,
        },
        "priority_alerts": {
            "critical_stockouts":    critical_stockouts,
            "slow_moving":           slow_moving,
            "expense_ratio_warning": expense_ratio_warning,
            "expense_ratio":         round(expense_ratio, 1),
            "revenue_growth":        revenue_growth,
        },
        "forecast": {
            "value":   forecast_val,
            "display": _short_money(forecast_val),
            "trend":   forecast_trend,
        },
        "charts": charts,
    }), 200


# ── Insight calculations ──────────────────────────────────────────────────────

def _stockout_projections(owner_id, today):
    lookback_days = 14
    start_dt      = datetime.combine(today - timedelta(days=lookback_days), datetime.min.time())
    lookback      = Decimal(lookback_days)

    rows = (
        db.session.query(
            Product.product_id, Product.name, Product.quantity,
            func.coalesce(func.sum(
                case((Sale.sale_id.isnot(None), SaleItem.quantity), else_=Decimal("0"))
            ), 0).label("sold"),
        )
        .outerjoin(SaleItem, SaleItem.product_id == Product.product_id)
        .outerjoin(Sale,
            (SaleItem.sale_id == Sale.sale_id)
            & (Sale.user_id == owner_id)
            & (Sale.sale_date >= start_dt),
        )
        .filter(Product.user_id == owner_id, Product.is_deleted.is_(False))
        .group_by(Product.product_id, Product.name, Product.quantity)
        .all()
    )

    results = []
    for r in rows:
        sold = Decimal(r.sold or 0)
        qty  = Decimal(r.quantity or 0)
        if sold <= 0 or qty <= 0:
            continue
        daily_rate = sold / lookback
        days_left  = qty / daily_rate
        if days_left <= 10:
            results.append({
                "name":       r.name,
                "units_left": float(qty),
                "daily_rate": round(float(daily_rate), 1),
                "days_left":  round(float(days_left), 1),
            })
    results.sort(key=lambda x: x["days_left"])
    return results[:5]


def _slow_moving_products(owner_id, ref_date):
    # Use the last 30 days of the selected month as the lookback window
    if ref_date.month < 12:
        period_end = datetime(ref_date.year, ref_date.month + 1, 1)
    else:
        period_end = datetime(ref_date.year + 1, 1, 1)
    start_dt = period_end - timedelta(days=30)

    rows = (
        db.session.query(
            Product.product_id, Product.name, Product.quantity,
            func.coalesce(func.sum(
                case((Sale.sale_id.isnot(None), SaleItem.quantity), else_=Decimal("0"))
            ), 0).label("sold"),
        )
        .outerjoin(SaleItem, SaleItem.product_id == Product.product_id)
        .outerjoin(Sale,
            (SaleItem.sale_id == Sale.sale_id)
            & (Sale.user_id == owner_id)
            & (Sale.sale_date >= start_dt)
            & (Sale.sale_date < period_end),
        )
        .filter(
            Product.user_id == owner_id,
            Product.is_deleted.is_(False),
            Product.quantity > 0,
        )
        .group_by(Product.product_id, Product.name, Product.quantity)
        .all()
    )

    results = []
    for r in rows:
        if float(r.sold or 0) < 1:
            results.append({
                "name":         r.name,
                "units_stock":  float(r.quantity or 0),
                "units_sold_30d": round(float(r.sold or 0), 1),
            })
    results.sort(key=lambda x: -x["units_stock"])
    return results[:5]


def _forecast_next_month(owner_id, today):
    revenues = []
    for i in range(6, 0, -1):
        m, y = today.month - i, today.year
        while m <= 0:
            m += 12; y -= 1
        ms = datetime(y, m, 1)
        me = datetime(y, m + 1, 1) if m < 12 else datetime(y + 1, 1, 1)
        revenues.append(float(profit_loss_for_period(owner_id, ms, me)["revenue"]))

    if all(r == 0 for r in revenues):
        return 0, 0.0

    weights  = [1, 1, 2, 2, 3, 3]
    forecast = sum(r * w for r, w in zip(revenues, weights)) / sum(weights)

    month_start = datetime(today.year, today.month, 1)
    next_m      = datetime(today.year, today.month + 1, 1) if today.month < 12 else datetime(today.year + 1, 1, 1)
    current_rev = float(profit_loss_for_period(owner_id, month_start, next_m)["revenue"])
    trend = round((forecast - current_rev) / current_rev * 100, 1) if current_rev > 0 else 0.0

    return int(forecast), trend


def _build_insights_charts(owner_id, ref_date, expenses_by_cat):
    month_start = datetime(ref_date.year, ref_date.month, 1)
    next_m      = datetime(ref_date.year, ref_date.month + 1, 1) if ref_date.month < 12 else datetime(ref_date.year + 1, 1, 1)

    # ── Compare (6 months) + Profit Margin ───────────────────────────────────
    compare_labels, compare_rev, compare_exp = [], [], []
    margin_labels, margin_vals = [], []
    for i in range(5, -1, -1):
        m, y = ref_date.month - i, ref_date.year
        while m <= 0:
            m += 12; y -= 1
        ms = datetime(y, m, 1)
        me = datetime(y, m + 1, 1) if m < 12 else datetime(y + 1, 1, 1)
        pl = profit_loss_for_period(owner_id, ms, me)
        compare_labels.append(ms.strftime("%b"))
        compare_rev.append(int(pl["revenue"]))
        compare_exp.append(int(pl["expenses_total"]))
        margin_labels.append(ms.strftime("%b"))
        margin_vals.append(
            round(float(pl["net_profit"] / pl["revenue"] * 100), 1) if pl["revenue"] > 0 else 0
        )

    # ── Day-of-week average revenue ───────────────────────────────────────────
    day_labels  = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
    day_totals  = [Decimal("0")] * 7
    day_counts  = [0] * 7
    daily_totals = defaultdict(Decimal)

    for sd, amount in db.session.query(Sale.sale_date, Sale.total_amount).filter(
        Sale.user_id == owner_id,
        Sale.sale_date >= month_start,
        Sale.sale_date < next_m,
    ).all():
        daily_totals[sd.date()] += Decimal(amount or 0)

    for d, total in daily_totals.items():
        dow = d.weekday()
        day_totals[dow] += total
        day_counts[dow] += 1

    day_values = [int(day_totals[i] / day_counts[i]) if day_counts[i] > 0 else 0 for i in range(7)]

    # ── Top products by revenue ───────────────────────────────────────────────
    vel_rows = (
        db.session.query(Product.name, func.coalesce(func.sum(SaleItem.subtotal), 0).label("revenue"))
        .join(Product, SaleItem.product_id == Product.product_id)
        .join(Sale, SaleItem.sale_id == Sale.sale_id)
        .filter(Sale.user_id == owner_id, Sale.sale_date >= month_start,
                Sale.sale_date < next_m, Product.is_deleted.is_(False))
        .group_by(Product.product_id, Product.name)
        .order_by(func.sum(SaleItem.subtotal).desc())
        .limit(8).all()
    )

    # ── Gross Profit per Product ──────────────────────────────────────────────
    gp_rows = (
        db.session.query(
            Product.name,
            func.sum((Product.selling_price - Product.purchase_price) * SaleItem.quantity).label("gp"),
        )
        .join(SaleItem, SaleItem.product_id == Product.product_id)
        .join(Sale, SaleItem.sale_id == Sale.sale_id)
        .filter(Sale.user_id == owner_id, Sale.sale_date >= month_start,
                Sale.sale_date < next_m, Product.is_deleted.is_(False))
        .group_by(Product.product_id, Product.name)
        .order_by(func.sum((Product.selling_price - Product.purchase_price) * SaleItem.quantity).desc())
        .limit(8).all()
    )

    # ── Revenue by product category ───────────────────────────────────────────
    cat_rev_rows = (
        db.session.query(
            func.coalesce(ProductCategory.name, "Uncategorised").label("cat"),
            func.sum(SaleItem.subtotal).label("revenue"),
        )
        .join(Product, SaleItem.product_id == Product.product_id)
        .join(Sale, SaleItem.sale_id == Sale.sale_id)
        .outerjoin(ProductCategory, Product.category_id == ProductCategory.id)
        .filter(Sale.user_id == owner_id, Sale.sale_date >= month_start,
                Sale.sale_date < next_m, Product.is_deleted.is_(False))
        .group_by(ProductCategory.name)
        .order_by(func.sum(SaleItem.subtotal).desc())
        .all()
    )

    # ── Expense by category (from current month) ──────────────────────────────
    cat_exp_items = sorted(
        [(k, int(v)) for k, v in expenses_by_cat.items() if v > 0],
        key=lambda x: -x[1],
    )

    return {
        "compare":      {"labels": compare_labels, "revenue": compare_rev, "expenses": compare_exp},
        "margin":       {"labels": margin_labels,  "values":  margin_vals},
        "days":         {"labels": day_labels,     "values":  day_values},
        "velocity":     {"labels": [r.name for r in vel_rows], "values": [int(r.revenue) for r in vel_rows]},
        "gross_profit": {"labels": [r.name for r in gp_rows],  "values": [int(r.gp or 0) for r in gp_rows]},
        "cat_revenue":  {"labels": [r.cat for r in cat_rev_rows], "values": [int(r.revenue) for r in cat_rev_rows]},
        "cat_expenses": {"labels": [k for k, _ in cat_exp_items], "values": [v for _, v in cat_exp_items]},
    }


# ── Dynamic chart endpoints ───────────────────────────────────────────────────

@analytics_bp.route("/compare", methods=["GET"])
@admin_required
def compare_chart():
    try:
        months = max(1, min(int(request.args.get("months", 6)), 24))
    except (TypeError, ValueError):
        months = 6

    owner_id          = current_user.owner_id
    sel_year, sel_month = _parse_period()
    labels, rev, exp  = [], [], []

    for i in range(months - 1, -1, -1):
        m, y = sel_month - i, sel_year
        while m <= 0:
            m += 12; y -= 1
        ms = datetime(y, m, 1)
        me = datetime(y, m + 1, 1) if m < 12 else datetime(y + 1, 1, 1)
        pl = profit_loss_for_period(owner_id, ms, me)
        labels.append(ms.strftime("%b '%y") if months > 6 else ms.strftime("%b"))
        rev.append(int(pl["revenue"]))
        exp.append(int(pl["expenses_total"]))

    return jsonify({"labels": labels, "revenue": rev, "expenses": exp}), 200


@analytics_bp.route("/velocity", methods=["GET"])
@admin_required
def velocity_chart():
    try:
        months = max(1, min(int(request.args.get("months", 1)), 12))
    except (TypeError, ValueError):
        months = 1

    owner_id            = current_user.owner_id
    sel_year, sel_month = _parse_period()
    m, y                = sel_month - (months - 1), sel_year
    while m <= 0:
        m += 12; y -= 1
    period_start = datetime(y, m, 1)
    period_end   = datetime(sel_year, sel_month + 1, 1) if sel_month < 12 else datetime(sel_year + 1, 1, 1)

    rows = (
        db.session.query(
            Product.name,
            func.coalesce(func.sum(SaleItem.subtotal), 0).label("revenue"),
        )
        .join(Product, SaleItem.product_id == Product.product_id)
        .join(Sale, SaleItem.sale_id == Sale.sale_id)
        .filter(Sale.user_id == owner_id, Sale.sale_date >= period_start,
                Sale.sale_date < period_end, Product.is_deleted.is_(False))
        .group_by(Product.product_id, Product.name)
        .order_by(func.sum(SaleItem.subtotal).desc())
        .limit(8).all()
    )

    return jsonify({"labels": [r.name for r in rows], "values": [int(r.revenue) for r in rows]}), 200


def _short_money(value):
    v = float(value or 0)
    return f"{v:,.0f}"
