from datetime import datetime, date, timedelta
from io import BytesIO

from flask import Blueprint, request, jsonify, send_file
from flask_jwt_extended import current_user

from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
)
from reportlab.lib.enums import TA_LEFT

from blueprints.expenses import profit_loss_for_period
from utils.decorators import admin_required

reports_bp = Blueprint("reports", __name__, url_prefix="/api/reports")



def resolve_period(period, date_from_str, date_to_str):
    """Returns (start_dt, end_dt, period_label, error_msg)."""
    today = date.today()
    err = None

    if period == "daily":
        start = today
        end = today + timedelta(days=1)
        label = today.strftime("%d %B %Y")
    elif period == "weekly":
        start = today - timedelta(days=6)
        end = today + timedelta(days=1)
        label = f"{start.strftime('%d %b')} – {today.strftime('%d %b %Y')}"
    elif period == "monthly":
        start = today.replace(day=1)
        if today.month == 12:
            end = date(today.year + 1, 1, 1)
        else:
            end = date(today.year, today.month + 1, 1)
        label = start.strftime("%B %Y")
    elif period == "custom":
        try:
            start = datetime.strptime(date_from_str, "%Y-%m-%d").date() if date_from_str else None
            end_inclusive = datetime.strptime(date_to_str, "%Y-%m-%d").date() if date_to_str else None
        except ValueError:
            return None, None, None, "Invalid date format."
        if not start or not end_inclusive:
            return None, None, None, "Please provide both 'From' and 'To' dates."
        if start > end_inclusive:
            return None, None, None, "Start date must be before end date."
        end = end_inclusive + timedelta(days=1)
        label = f"{start.strftime('%d %b %Y')} – {end_inclusive.strftime('%d %b %Y')}"
        if (end_inclusive - start).days > 365:
            err = "Large date ranges may take longer to generate."
    else:
        return None, None, None, "Unknown period."

    start_dt = datetime.combine(start, datetime.min.time())
    end_dt = datetime.combine(end, datetime.min.time())
    return start_dt, end_dt, label, err


#report building function
def build_report(owner_id, report_type, start_dt, end_dt, label):
    pl = profit_loss_for_period(owner_id, start_dt, end_dt)

    type_titles = {
        "summary":  "Sales & Expenses Summary",
        "sales":    "Sales Report",
        "expenses": "Expenses Report",
        "profit":   "Profit & Loss Statement",
    }

    show_revenue = report_type in ("summary", "sales", "profit")
    show_expenses = report_type in ("summary", "expenses", "profit")
    show_profit = report_type in ("summary", "profit")

    is_empty = (pl["total_sales"] == 0 and pl["expenses_total"] == 0)

    return {
        "title":           f"{type_titles.get(report_type, 'Report')} — {label}",
        "show_revenue":    show_revenue,
        "show_expenses":   show_expenses,
        "show_profit":     show_profit,
        "total_sales":     pl["total_sales"],
        "gross_revenue":   pl["revenue"],
        "avg_sale":        pl["avg_sale"],
        "expenses":        dict(pl["expenses_by_cat"]),
        "total_expenses":  pl["expenses_total"],
        "net_profit":      pl["net_profit"],
        "is_empty":        is_empty,
    }


def _report_to_json(report):
    #Convert Decimal-heavy report dict to JSON-friendly form.
    return {
        "title":          report["title"],
        "show_revenue":   report["show_revenue"],
        "show_expenses":  report["show_expenses"],
        "show_profit":    report["show_profit"],
        "total_sales":    report["total_sales"],
        "gross_revenue":  float(report["gross_revenue"]),
        "avg_sale":       float(report["avg_sale"]),
        "expenses":       {k: float(v) for k, v in report["expenses"].items()},
        "total_expenses": float(report["total_expenses"]),
        "net_profit":     float(report["net_profit"]),
        "is_empty":       report["is_empty"],
    }


@reports_bp.route("/preview", methods=["GET"])
@admin_required
def preview():
    report_type = request.args.get("type", "summary")
    period = request.args.get("period", "monthly")
    date_from = request.args.get("from", "")
    date_to = request.args.get("to", "")

    start_dt, end_dt, label, err = resolve_period(period, date_from, date_to)
    if err and "may take" not in err:
        return jsonify({"error": err}), 400

    report = build_report(current_user.owner_id, report_type, start_dt, end_dt, label)
    payload = _report_to_json(report)

    if err:  # warning, not blocking
        payload["warning"] = err

    return jsonify({"report": payload}), 200


@reports_bp.route("/download", methods=["GET"])
@admin_required
def download_pdf():
    """FR-24: generate PDF and stream to browser."""
    report_type = request.args.get("type", "summary")
    period = request.args.get("period", "monthly")
    date_from = request.args.get("from", "")
    date_to = request.args.get("to", "")

    start_dt, end_dt, label, err = resolve_period(period, date_from, date_to)
    if err and "may take" not in err:
        return jsonify({"error": err}), 400

    report = build_report(current_user.owner_id, report_type, start_dt, end_dt, label)

    if report["is_empty"]:
        return jsonify({"error": "No data to generate a report for this period."}), 400

    try:
        pdf_bytes = _render_pdf(report, current_user.business_name)
    except Exception:
        return jsonify({"error": "Report generation failed. Please try again."}), 500

    filename = f"report_{report_type}_{period}_{date.today().isoformat()}.pdf"
    return send_file(
        BytesIO(pdf_bytes),
        mimetype="application/pdf",
        as_attachment=True,
        download_name=filename,
    )


# PDF RENDERING (unchanged from original)

def _render_pdf(report, business_name):
    buf = BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=A4,
        leftMargin=20*mm, rightMargin=20*mm,
        topMargin=20*mm, bottomMargin=20*mm,
        title=report["title"],
    )

    styles = getSampleStyleSheet()
    h_title = ParagraphStyle(
        "ReportTitle", parent=styles["Title"],
        fontSize=18, textColor=colors.HexColor("#0F172A"),
        alignment=TA_LEFT, spaceAfter=4,
    )
    h_sub = ParagraphStyle(
        "ReportSub", parent=styles["Normal"],
        fontSize=10, textColor=colors.HexColor("#64748B"),
        alignment=TA_LEFT, spaceAfter=18,
    )
    h_section = ParagraphStyle(
        "Section", parent=styles["Heading2"],
        fontSize=11, textColor=colors.HexColor("#64748B"),
        spaceBefore=14, spaceAfter=8,
    )
    normal = styles["Normal"]

    story = []

    story.append(Paragraph(report["title"], h_title))
    story.append(Paragraph(
        f"Business: <b>{business_name}</b> &nbsp; · &nbsp; "
        f"Generated {date.today().strftime('%d %B %Y')}",
        h_sub,
    ))

    if report["show_revenue"]:
        story.append(Paragraph("REVENUE", h_section))
        data = [
            ["Total Sales Transactions", f"{report['total_sales']:,}"],
            ["Gross Revenue",            f"TZS {report['gross_revenue']:,.0f}"],
            ["Average Sale Value",       f"TZS {report['avg_sale']:,.0f}"],
        ]
        story.append(_two_col_table(data))

    if report["show_expenses"]:
        story.append(Paragraph("EXPENSES", h_section))
        rows = []
        for cat, amt in report["expenses"].items():
            rows.append([cat, f"TZS {amt:,.0f}"])
        if rows:
            rows.append(["Total Expenses", f"TZS {report['total_expenses']:,.0f}"])
        else:
            rows.append(["(no expenses recorded)", ""])
        story.append(_two_col_table(rows, last_bold=True))

    if report["show_profit"]:
        story.append(Spacer(1, 14))
        profit = report["net_profit"]
        label = "NET PROFIT" if profit >= 0 else "NET LOSS"
        color = colors.HexColor("#16A34A") if profit >= 0 else colors.HexColor("#DC2626")
        bg    = colors.HexColor("#F0FDF4") if profit >= 0 else colors.HexColor("#FEF2F2")
        tbl = Table([[label, f"TZS {abs(profit):,.0f}"]],
                    colWidths=[100*mm, 60*mm])
        tbl.setStyle(TableStyle([
            ("BACKGROUND", (0,0), (-1,-1), bg),
            ("TEXTCOLOR",  (0,0), (0,0), colors.HexColor("#0F172A")),
            ("TEXTCOLOR",  (1,0), (1,0), color),
            ("FONTNAME",   (0,0), (-1,-1), "Helvetica-Bold"),
            ("FONTSIZE",   (0,0), (0,0), 13),
            ("FONTSIZE",   (1,0), (1,0), 16),
            ("ALIGN",      (1,0), (1,0), "RIGHT"),
            ("VALIGN",     (0,0), (-1,-1), "MIDDLE"),
            ("TOPPADDING", (0,0), (-1,-1), 12),
            ("BOTTOMPADDING",(0,0),(-1,-1), 12),
            ("LEFTPADDING",(0,0), (-1,-1), 14),
            ("RIGHTPADDING",(0,0),(-1,-1), 14),
        ]))
        story.append(tbl)

    

    doc.build(story)
    return buf.getvalue()


def _two_col_table(data, last_bold=False):
    t = Table(data, colWidths=[100*mm, 60*mm])
    style = [
        ("FONTNAME",  (0,0), (-1,-1), "Helvetica"),
        ("FONTSIZE",  (0,0), (-1,-1), 10),
        ("ALIGN",     (1,0), (1,-1), "RIGHT"),
        ("LINEBELOW", (0,0), (-1,-1), 0.3, colors.HexColor("#E2E8F0")),
        ("TOPPADDING",(0,0), (-1,-1), 6),
        ("BOTTOMPADDING",(0,0), (-1,-1), 6),
    ]
    if last_bold:
        style.append(("FONTNAME", (0,-1), (-1,-1), "Helvetica-Bold"))
        style.append(("LINEABOVE",(0,-1), (-1,-1), 1, colors.HexColor("#0F172A")))
    t.setStyle(TableStyle(style))
    return t
