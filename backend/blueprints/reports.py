import html as _html
from datetime import datetime, date, timedelta
from io import BytesIO

from flask import Blueprint, request, jsonify, send_file
from flask_jwt_extended import current_user
from sqlalchemy.orm import joinedload
from reportlab.pdfgen import canvas as rl_canvas
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable,
)
from reportlab.lib.enums import TA_LEFT, TA_RIGHT, TA_CENTER

from extensions import db
from models import Sale, SaleItem, Expense
from blueprints.expenses import profit_loss_for_period
from utils.decorators import admin_required

reports_bp = Blueprint("reports", __name__, url_prefix="/api/reports")

# ── Brand palette ─────────────────────────────────────────────────────────────
_NAVY     = colors.HexColor("#1E3A5F")
_BRAND    = colors.HexColor("#2563EB")
_LIGHT    = colors.HexColor("#EFF6FF")
_MID      = colors.HexColor("#DBEAFE")
_SLATE    = colors.HexColor("#64748B")
_BORDER   = colors.HexColor("#CBD5E1")
_GREEN    = colors.HexColor("#16A34A")
_GREEN_BG = colors.HexColor("#F0FDF4")
_RED      = colors.HexColor("#DC2626")
_RED_BG   = colors.HexColor("#FEF2F2")
_WHITE    = colors.white
_BLACK    = colors.HexColor("#0F172A")
_ROW_ALT  = colors.HexColor("#F8FAFC")

# ── UI string translations (en / sw) ─────────────────────────────────────────
_TR = {
    "en": {
        "subtitle":       "Sales Analysis System",
        "statement_date": "Statement Date",
        "period":         "Period",
        "report_type":    "Report Type",
        "business_name":  "Business Name",
        "account_owner":  "Account Owner",
        "net_profit":     "Net Profit",
        "net_loss":       "Net Loss",
        "sales_sect":     "SALES TRANSACTIONS",
        "expense_sect":   "EXPENSE TRANSACTIONS",
        "financial_sect": "FINANCIAL SUMMARY",
        "col_sn":         "SN",
        "col_date":       "DATE",
        "col_details":    "DETAILS",
        "col_qty":        "QTY",
        "col_recorded":   "RECORDED BY",
        "col_amount":     "AMOUNT\n(TZS)",
        "col_balance":    "BOOK\nBALANCE",
        "col_category":   "CATEGORY",
        "col_desc":       "DESCRIPTION",
        "col_cumulative": "CUMULATIVE\n(TZS)",
        "total":          "TOTAL",
        "total_sales":    "Total Sales Transactions",
        "gross_revenue":  "Gross Revenue",
        "total_expenses": "Total Expenses",
        "no_sales":       "No sales recorded for this period.",
        "no_expenses":    "No expenses recorded for this period.",
        "disclaimer":     (
            "Kindly examine this statement carefully. Any discrepancies must be "
            "reported promptly. This document was generated automatically by the "
            "Sales Analysis System and requires no signature."
        ),
        "generated":      "Generated",
        "page":           "Page",
        "of":             "of",
        "type_labels": {
            "summary":  "Sales & Expenses Summary",
            "sales":    "Sales Report",
            "expenses": "Expenses Report",
            "profit":   "Profit & Loss Statement",
        },
        "expense_cats": {
            "Rent":           "Rent",
            "Utilities":      "Utilities",
            "Salaries":       "Salaries",
            "Purchase Costs": "Purchase Costs",
            "Miscellaneous":  "Miscellaneous",
        },
    },
    "sw": {
        "subtitle":       "Mfumo wa Uchambuzi wa Mauzo",
        "statement_date": "Tarehe ya Taarifa",
        "period":         "Kipindi",
        "report_type":    "Aina ya Ripoti",
        "business_name":  "Jina la Biashara",
        "account_owner":  "Mmiliki wa Akaunti",
        "net_profit":     "Faida Halisi",
        "net_loss":       "Hasara Halisi",
        "sales_sect":     "MIAMALA YA MAUZO",
        "expense_sect":   "MIAMALA YA MATUMIZI",
        "financial_sect": "MUHTASARI WA FEDHA",
        "col_sn":         "Na.",
        "col_date":       "TAREHE",
        "col_details":    "MAELEZO",
        "col_qty":        "IDADI",
        "col_recorded":   "ILIREKODIWA NA",
        "col_amount":     "KIASI\n(TZS)",
        "col_balance":    "SALIO\nLA AKAUNTI",
        "col_category":   "KATEGORIA",
        "col_desc":       "MAELEZO",
        "col_cumulative": "JUMLA\nINAYOKUSANYIKA",
        "total":          "JUMLA",
        "total_sales":    "Jumla ya Miamala ya Mauzo",
        "gross_revenue":  "Mapato Ghafi",
        "total_expenses": "Jumla ya Matumizi",
        "no_sales":       "Hakuna mauzo yaliyorekodiwa katika kipindi hiki.",
        "no_expenses":    "Hakuna matumizi yaliyorekodiwa katika kipindi hiki.",
        "disclaimer":     (
            "Tafadhali kagua taarifa hii kwa makini. Tofauti yoyote inapaswa "
            "kuripotiwa haraka. Hati hii ilitengenezwa kiotomatiki na Mfumo wa "
            "Uchambuzi wa Mauzo na haihitaji saini."
        ),
        "generated":      "Imetolewa",
        "page":           "Ukurasa",
        "of":             "kati ya",
        "type_labels": {
            "summary":  "Muhtasari wa Mauzo na Matumizi",
            "sales":    "Ripoti ya Mauzo",
            "expenses": "Ripoti ya Matumizi",
            "profit":   "Taarifa ya Faida na Hasara",
        },
        "expense_cats": {
            "Rent":           "Kodi",
            "Utilities":      "Huduma",
            "Salaries":       "Mishahara",
            "Purchase Costs": "Gharama za Ununuzi",
            "Miscellaneous":  "Mengineyo",
        },
    },
}


# ── Period resolver ───────────────────────────────────────────────────────────
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
        end = date(today.year + 1, 1, 1) if today.month == 12 else date(today.year, today.month + 1, 1)
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


# ── Transaction fetchers ──────────────────────────────────────────────────────
def _fetch_sales(owner_id, start_dt, end_dt):
    sales = (
        db.session.query(Sale)
        .options(
            joinedload(Sale.items).joinedload(SaleItem.product),
            joinedload(Sale.recorder),
        )
        .filter(
            Sale.user_id == owner_id,
            Sale.sale_date >= start_dt,
            Sale.sale_date < end_dt,
        )
        .order_by(Sale.sale_date)
        .all()
    )
    rows = []
    running = 0.0
    for i, s in enumerate(sales, 1):
        item_names = [item.product.name for item in s.items if item.product]
        item_qtys  = [
            f"{int(item.quantity) if item.quantity == int(item.quantity) else float(item.quantity)} {item.product.unit or 'pcs'}"
            for item in s.items if item.product
        ]
        running += float(s.total_amount)
        rows.append({
            "sn":          i,
            "date":        s.sale_date.strftime("%Y-%m-%d"),
            "details":     item_names or ["—"],
            "qty":         item_qtys  or ["—"],
            "recorded_by": s.recorder.full_name if s.recorder else "—",
            "amount":      float(s.total_amount),
            "cumulative":  running,
        })
    return rows


def _fetch_expenses(owner_id, start_dt, end_dt):
    expenses = (
        db.session.query(Expense)
        .filter(
            Expense.user_id == owner_id,
            Expense.expense_date >= start_dt.date(),
            Expense.expense_date < end_dt.date(),
        )
        .order_by(Expense.expense_date)
        .all()
    )
    rows = []
    running = 0.0
    for i, e in enumerate(expenses, 1):
        running += float(e.amount)
        rows.append({
            "sn": i,
            "date": e.expense_date.strftime("%Y-%m-%d"),
            "category": e.category,
            "description": e.description or "—",
            "amount": float(e.amount),
            "cumulative": running,
        })
    return rows


# ── Report builder ────────────────────────────────────────────────────────────
_TYPE_LABELS = {
    "summary":  "Sales & Expenses Summary",
    "sales":    "Sales Report",
    "expenses": "Expenses Report",
    "profit":   "Profit & Loss Statement",
}


def build_report(owner_id, report_type, start_dt, end_dt, label):
    pl = profit_loss_for_period(owner_id, start_dt, end_dt)

    show_revenue  = report_type in ("summary", "sales", "profit")
    show_expenses = report_type in ("summary", "expenses", "profit")
    show_profit   = report_type == "profit"

    sales_rows   = _fetch_sales(owner_id, start_dt, end_dt) if show_revenue else []
    expense_rows = _fetch_expenses(owner_id, start_dt, end_dt) if show_expenses else []

    return {
        "title":         f"{_TYPE_LABELS.get(report_type, 'Report')} — {label}",
        "type_key":      report_type,
        "type_label":    _TYPE_LABELS.get(report_type, "Report"),
        "period_label":  label,
        "show_revenue":  show_revenue,
        "show_expenses": show_expenses,
        "show_profit":   show_profit,
        "total_sales":   pl["total_sales"],
        "gross_revenue": pl["revenue"],
        "avg_sale":      pl["avg_sale"],
        "expenses":      dict(pl["expenses_by_cat"]),
        "total_expenses":pl["expenses_total"],
        "net_profit":    pl["net_profit"],
        "is_empty":      (pl["total_sales"] == 0 and pl["expenses_total"] == 0),
        "sales_rows":    sales_rows,
        "expense_rows":  expense_rows,
    }


def _report_to_json(report):
    return {
        "title":          report["title"],
        "type_key":       report["type_key"],
        "type_label":     report["type_label"],
        "period_label":   report["period_label"],
        "show_revenue":   report["show_revenue"],
        "show_expenses":  report["show_expenses"],
        "show_profit":    report["show_profit"],
        "total_sales":    report["total_sales"],
        "gross_revenue":  float(report["gross_revenue"]),
        "expenses":       {k: float(v) for k, v in report["expenses"].items()},
        "total_expenses": float(report["total_expenses"]),
        "net_profit":     float(report["net_profit"]),
        "is_empty":       report["is_empty"],
        "sales_rows":     report["sales_rows"],
        "expense_rows":   report["expense_rows"],
    }


# ── Routes ────────────────────────────────────────────────────────────────────
@reports_bp.route("/preview", methods=["GET"])
@admin_required
def preview():
    report_type = request.args.get("type", "summary")
    period      = request.args.get("period", "monthly")
    date_from   = request.args.get("from", "")
    date_to     = request.args.get("to", "")

    start_dt, end_dt, label, err = resolve_period(period, date_from, date_to)
    if err and "may take" not in err:
        return jsonify({"error": err}), 400

    report = build_report(current_user.owner_id, report_type, start_dt, end_dt, label)
    payload = _report_to_json(report)
    payload["business_name"] = current_user.business_name
    payload["owner_name"]    = current_user.full_name
    if err:
        payload["warning"] = err
    return jsonify({"report": payload}), 200


@reports_bp.route("/download", methods=["GET"])
@admin_required
def download_pdf():
    report_type = request.args.get("type", "summary")
    period      = request.args.get("period", "monthly")
    date_from   = request.args.get("from", "")
    date_to     = request.args.get("to", "")
    lang        = request.args.get("lang", "en")

    start_dt, end_dt, label, err = resolve_period(period, date_from, date_to)
    if err and "may take" not in err:
        return jsonify({"error": err}), 400

    report = build_report(current_user.owner_id, report_type, start_dt, end_dt, label)
    if report["is_empty"]:
        return jsonify({"error": "No data to generate a report for this period."}), 400

    try:
        pdf_bytes = _render_pdf(report, current_user.business_name, current_user.full_name, lang)
    except Exception:
        import traceback; traceback.print_exc()
        return jsonify({"error": "Report generation failed. Please try again."}), 500

    filename = f"report_{report_type}_{period}_{date.today().isoformat()}.pdf"
    return send_file(
        BytesIO(pdf_bytes),
        mimetype="application/pdf",
        as_attachment=True,
        download_name=filename,
    )


# ── Footer canvas: stamps "Page X of Y" after full build ─────────────────────
class _FooterCanvas(rl_canvas.Canvas):
    def __init__(self, *args, **kwargs):
        self._biz  = kwargs.pop("biz_name", "")
        self._tr   = kwargs.pop("tr", _TR["en"])
        rl_canvas.Canvas.__init__(self, *args, **kwargs)
        self._pages = []

    def showPage(self):
        self._pages.append(dict(self.__dict__))
        self._startPage()

    def save(self):
        total = len(self._pages)
        for i, state in enumerate(self._pages, 1):
            self.__dict__.update(state)
            self._stamp_footer(i, total)
            rl_canvas.Canvas.showPage(self)
        rl_canvas.Canvas.save(self)

    def _stamp_footer(self, page_num, total):
        self.saveState()
        y = 10 * mm
        w = A4[0]
        self.setStrokeColor(_BORDER)
        self.setLineWidth(0.4)
        self.line(15 * mm, y + 5 * mm, w - 15 * mm, y + 5 * mm)
        self.setFont("Helvetica", 7.5)
        self.setFillColor(_SLATE)
        self.drawString(15 * mm, y, self._biz)
        ts = datetime.now().strftime("%d %B %Y  %H:%M")
        self.drawCentredString(w / 2, y, f"{self._tr['generated']}: {ts}")
        self.drawRightString(w - 15 * mm, y, f"{self._tr['page']} {page_num} {self._tr['of']} {total}")
        self.restoreState()


# ── PDF renderer ──────────────────────────────────────────────────────────────
def _render_pdf(report, business_name, owner_name, lang="en"):
    tr  = _TR.get(lang, _TR["en"])
    buf = BytesIO()
    pw  = A4[0] - 30 * mm  # 180 mm usable width

    base = getSampleStyleSheet()["Normal"]

    def _ps(name, **kw):
        return ParagraphStyle(name, parent=base, **kw)

    P_biz_name  = _ps("BizName",  fontSize=18, textColor=_WHITE,  fontName="Helvetica-Bold", leading=22)
    P_biz_sub   = _ps("BizSub",   fontSize=9,  textColor=colors.HexColor("#93C5FD"), fontName="Helvetica", leading=13)
    P_hdr_right = _ps("HdrRight", fontSize=8.5, textColor=_WHITE, fontName="Helvetica", leading=14, alignment=TA_RIGHT)
    P_sect      = _ps("Sect",     fontSize=9,  textColor=_NAVY,  fontName="Helvetica-Bold", leading=12, spaceBefore=6, spaceAfter=3)
    P_lbl       = _ps("Lbl",      fontSize=9,  textColor=_SLATE, fontName="Helvetica-Bold", leading=13)
    P_val       = _ps("Val",      fontSize=9,  textColor=_BLACK, fontName="Helvetica",      leading=13)
    P_th        = _ps("TH",       fontSize=8,  textColor=_WHITE, fontName="Helvetica-Bold", leading=10, alignment=TA_CENTER)
    P_td        = _ps("TD",       fontSize=8,  textColor=_BLACK, fontName="Helvetica",      leading=10, wordWrap="CJK")
    P_td_r      = _ps("TDR",      fontSize=8,  textColor=_BLACK, fontName="Helvetica",      leading=10, alignment=TA_RIGHT)
    P_td_c      = _ps("TDC",      fontSize=8,  textColor=_BLACK, fontName="Helvetica",      leading=10, alignment=TA_CENTER)
    P_tot       = _ps("Tot",      fontSize=8,  textColor=_BLACK, fontName="Helvetica-Bold", leading=10, alignment=TA_RIGHT)
    P_note      = _ps("Note",     fontSize=7,  textColor=_SLATE, fontName="Helvetica-Oblique", leading=10)

    type_label = tr["type_labels"].get(report.get("type_key", ""), report["type_label"])
    now_str    = datetime.now().strftime("%Y-%m-%d  %H:%M:%S")
    story      = []

    # ── 1. HEADER BAND ───────────────────────────────────────────────────────
    left_cell = [
        Paragraph(_html.escape(business_name.upper()), P_biz_name),
        Paragraph(tr["subtitle"], P_biz_sub),
    ]
    right_cell = [
        Paragraph(f"<b>{tr['statement_date']}:</b>   {now_str}", P_hdr_right),
        Paragraph(f"<b>{tr['period']}:</b>   {_html.escape(report['period_label'])}", P_hdr_right),
        Paragraph(f"<b>{tr['report_type']}:</b>   {type_label}", P_hdr_right),
    ]
    hdr_tbl = Table([[left_cell, right_cell]], colWidths=[pw * 0.55, pw * 0.45])
    hdr_tbl.setStyle(TableStyle([
        ("BACKGROUND",    (0, 0), (-1, -1), _NAVY),
        ("TOPPADDING",    (0, 0), (-1, -1), 11),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 11),
        ("LEFTPADDING",   (0, 0), (0, 0),   14),
        ("RIGHTPADDING",  (1, 0), (1, 0),   14),
        ("VALIGN",        (0, 0), (-1, -1), "MIDDLE"),
    ]))
    story.append(hdr_tbl)
    story.append(Spacer(1, 4 * mm))

    # ── 2. STATEMENT INFO BOX ─────────────────────────────────────────────────
    type_key   = report.get("type_key", "summary")
    profit     = float(report["net_profit"])
    is_profit  = profit >= 0
    pl_key     = "net_profit" if is_profit else "net_loss"
    P_val_pl   = _ps("ValPL", fontSize=9, fontName="Helvetica-Bold", leading=13,
                     textColor=_GREEN if is_profit else _RED)
    P_val_blue = _ps("ValBL", fontSize=9, fontName="Helvetica-Bold", leading=13,
                     textColor=_NAVY)

    N_STATIC = 4
    info_rows = [
        [Paragraph(tr["business_name"], P_lbl), Paragraph(_html.escape(business_name), P_val)],
        [Paragraph(tr["account_owner"], P_lbl), Paragraph(_html.escape(owner_name), P_val)],
        [Paragraph(tr["report_type"],   P_lbl), Paragraph(type_label, P_val)],
        [Paragraph(tr["period"],        P_lbl), Paragraph(_html.escape(report["period_label"]), P_val)],
    ]

    if type_key == "profit":
        hl_data = [(tr[pl_key],          f"TZS {abs(profit):,.0f}",                          P_val_pl,   _GREEN_BG if is_profit else _RED_BG)]
    elif type_key == "sales":
        hl_data = [(tr["gross_revenue"], f"TZS {float(report['gross_revenue']):,.0f}",        P_val_blue, _MID)]
    elif type_key == "expenses":
        hl_data = [(tr["total_expenses"],f"TZS {float(report['total_expenses']):,.0f}",       P_val_blue, _MID)]
    else:  # summary
        hl_data = [
            (tr["gross_revenue"],  f"TZS {float(report['gross_revenue']):,.0f}",  P_val_blue, _MID),
            (tr["total_expenses"], f"TZS {float(report['total_expenses']):,.0f}", P_val_blue, _LIGHT),
        ]

    for label, val_str, val_style, _ in hl_data:
        info_rows.append([Paragraph(label, P_lbl), Paragraph(val_str, val_style)])

    info_style_cmds = [
        ("BACKGROUND",    (0, 0), (0, -1),           _ROW_ALT),
        ("TOPPADDING",    (0, 0), (-1, -1),           5),
        ("BOTTOMPADDING", (0, 0), (-1, -1),           5),
        ("LEFTPADDING",   (0, 0), (-1, -1),           8),
        ("RIGHTPADDING",  (0, 0), (-1, -1),           8),
        ("LINEBELOW",     (0, 0), (-1, N_STATIC - 1), 0.3, _BORDER),
        ("LINEAFTER",     (0, 0), (0, -1),            0.5, _BORDER),
        ("BOX",           (0, 0), (-1, -1),           0.8, _BORDER),
    ]
    for i, (_, _, _, bg) in enumerate(hl_data):
        info_style_cmds.append(("BACKGROUND", (0, N_STATIC + i), (-1, N_STATIC + i), bg))

    info_tbl = Table(info_rows, colWidths=[pw * 0.38, pw * 0.62])
    info_tbl.setStyle(TableStyle(info_style_cmds))
    story.append(info_tbl)
    story.append(Spacer(1, 5 * mm))

    # ── 3. SALES TRANSACTIONS ────────────────────────────────────────────────
    # SN(8) + DATE(22) + DETAILS(60) + QTY(12) + RECORDED BY(26) + AMOUNT(26) + BALANCE(26) = 180 mm
    SALES_COLS = [8*mm, 22*mm, 60*mm, 12*mm, 26*mm, 26*mm, 26*mm]

    if report["show_revenue"]:
        story.append(Paragraph(tr["sales_sect"], P_sect))
        if report.get("sales_rows"):
            hdr_row = [
                Paragraph(tr["col_sn"],       P_th),
                Paragraph(tr["col_date"],     P_th),
                Paragraph(tr["col_details"],  P_th),
                Paragraph(tr["col_qty"],      P_th),
                Paragraph(tr["col_recorded"], P_th),
                Paragraph(tr["col_amount"],   P_th),
                Paragraph(tr["col_balance"],  P_th),
            ]
            tbl_rows = [hdr_row]
            for r in report["sales_rows"]:
                names = r.get("details") or ["—"]
                qtys  = r.get("qty")     or ["—"]
                details_html = "<br/>".join(_html.escape(n) for n in names)
                qty_html     = "<br/>".join(_html.escape(q) for q in qtys)
                tbl_rows.append([
                    Paragraph(str(r["sn"]),              P_td_c),
                    Paragraph(r["date"],                 P_td),
                    Paragraph(details_html,              P_td),
                    Paragraph(qty_html,                  P_td_c),
                    Paragraph(_html.escape(r["recorded_by"]), P_td),
                    Paragraph(f"{r['amount']:,.0f}",     P_td_r),
                    Paragraph(f"{r['cumulative']:,.0f}", P_td_r),
                ])
            tbl_rows.append([
                Paragraph("", P_td), Paragraph("", P_td), Paragraph("", P_td),
                Paragraph("", P_td),
                Paragraph(tr["total"], P_tot),
                Paragraph(f"{float(report['gross_revenue']):,.0f}", P_tot),
                Paragraph("", P_td),
            ])
            t = Table(tbl_rows, colWidths=SALES_COLS, repeatRows=1)
            t.setStyle(_base_table_style(len(tbl_rows)))
            story.append(t)
        else:
            story.append(Paragraph(tr["no_sales"], P_note))
        story.append(Spacer(1, 5 * mm))

    # ── 4. EXPENSE TRANSACTIONS ───────────────────────────────────────────────
    # SN(8) + DATE(22) + CATEGORY(30) + DESCRIPTION(68) + AMOUNT(26) + CUMULATIVE(26) = 180 mm
    EXP_COLS = [8*mm, 22*mm, 30*mm, 68*mm, 26*mm, 26*mm]

    if report["show_expenses"]:
        story.append(Paragraph(tr["expense_sect"], P_sect))
        if report.get("expense_rows"):
            hdr_row = [
                Paragraph(tr["col_sn"],         P_th),
                Paragraph(tr["col_date"],       P_th),
                Paragraph(tr["col_category"],   P_th),
                Paragraph(tr["col_desc"],       P_th),
                Paragraph(tr["col_amount"],     P_th),
                Paragraph(tr["col_cumulative"], P_th),
            ]
            tbl_rows = [hdr_row]
            for r in report["expense_rows"]:
                cat_label = tr["expense_cats"].get(r["category"], r["category"])
                tbl_rows.append([
                    Paragraph(str(r["sn"]),              P_td_c),
                    Paragraph(r["date"],                 P_td),
                    Paragraph(_html.escape(cat_label),   P_td),
                    Paragraph(_html.escape(r["description"]), P_td),
                    Paragraph(f"{r['amount']:,.0f}",     P_td_r),
                    Paragraph(f"{r['cumulative']:,.0f}", P_td_r),
                ])
            tbl_rows.append([
                Paragraph("", P_td), Paragraph("", P_td), Paragraph("", P_td),
                Paragraph(tr["total"], P_tot),
                Paragraph(f"{float(report['total_expenses']):,.0f}", P_tot),
                Paragraph("", P_td),
            ])
            t = Table(tbl_rows, colWidths=EXP_COLS, repeatRows=1)
            t.setStyle(_base_table_style(len(tbl_rows)))
            story.append(t)
        else:
            story.append(Paragraph(tr["no_expenses"], P_note))
        story.append(Spacer(1, 5 * mm))

    # ── 5. FINANCIAL SUMMARY / P&L ────────────────────────────────────────────
    if report["show_profit"]:
        story.append(Paragraph(tr["financial_sect"], P_sect))

        pl_color  = _GREEN if is_profit else _RED
        pl_bg     = _GREEN_BG if is_profit else _RED_BG
        pl_label  = tr["net_profit"].upper() if is_profit else tr["net_loss"].upper()

        P_pl_lbl = _ps("PLlbl", fontSize=11, textColor=pl_color, fontName="Helvetica-Bold", leading=16)
        P_pl_val = _ps("PLval", fontSize=14, textColor=pl_color, fontName="Helvetica-Bold", leading=20, alignment=TA_RIGHT)

        sum_rows = []
        if report["show_revenue"]:
            sum_rows += [
                [Paragraph(tr["total_sales"],   P_lbl), Paragraph(f"{report['total_sales']:,}", P_val)],
                [Paragraph(tr["gross_revenue"], P_lbl), Paragraph(f"TZS {float(report['gross_revenue']):,.0f}", P_val)],
            ]
        if report["show_expenses"]:
            for cat, amt in report["expenses"].items():
                cat_label = tr["expense_cats"].get(cat, cat)
                sum_rows.append([Paragraph(_html.escape(cat_label), P_lbl), Paragraph(f"TZS {float(amt):,.0f}", P_val)])
            sum_rows.append([Paragraph(tr["total_expenses"], P_lbl), Paragraph(f"TZS {float(report['total_expenses']):,.0f}", P_val)])
        sum_rows.append([Paragraph(pl_label, P_pl_lbl), Paragraph(f"TZS {abs(profit):,.0f}", P_pl_val)])

        sum_tbl = Table(sum_rows, colWidths=[pw * 0.55, pw * 0.45])
        sum_tbl.setStyle(TableStyle([
            ("TOPPADDING",    (0, 0), (-1, -2), 5),
            ("BOTTOMPADDING", (0, 0), (-1, -2), 5),
            ("TOPPADDING",    (0, -1), (-1, -1), 9),
            ("BOTTOMPADDING", (0, -1), (-1, -1), 9),
            ("LEFTPADDING",   (0, 0), (-1, -1), 8),
            ("RIGHTPADDING",  (0, 0), (-1, -1), 8),
            ("ALIGN",         (1, 0), (1, -1),  "RIGHT"),
            ("LINEBELOW",     (0, 0), (-1, -2), 0.3, _BORDER),
            ("BOX",           (0, 0), (-1, -1), 0.8, _BORDER),
            ("BACKGROUND",    (0, -1), (-1, -1), pl_bg),
            ("LINEABOVE",     (0, -1), (-1, -1), 1.5, pl_color),
        ]))
        story.append(sum_tbl)
        story.append(Spacer(1, 4 * mm))

    # ── 6. DISCLAIMER ─────────────────────────────────────────────────────────
    story.append(HRFlowable(width="100%", thickness=0.4, color=_BORDER))
    story.append(Spacer(1, 2 * mm))
    story.append(Paragraph(tr["disclaimer"], P_note))

    # ── BUILD ─────────────────────────────────────────────────────────────────
    doc = SimpleDocTemplate(
        buf, pagesize=A4,
        leftMargin=15 * mm, rightMargin=15 * mm,
        topMargin=15 * mm, bottomMargin=22 * mm,
        title=report["title"],
    )
    biz = business_name
    doc.build(
        story,
        canvasmaker=lambda *a, **kw: _FooterCanvas(*a, biz_name=biz, tr=tr, **kw),
    )
    return buf.getvalue()


def _base_table_style(n_rows):
    """Common TableStyle for transaction tables: light-blue header, alternating rows, bold totals."""
    ts = [
        ("BACKGROUND",    (0, 0), (-1, 0),  _NAVY),
        ("TEXTCOLOR",     (0, 0), (-1, 0),  _WHITE),
        ("FONTNAME",      (0, 0), (-1, 0),  "Helvetica-Bold"),
        ("FONTSIZE",      (0, 0), (-1, -1), 8),
        ("TOPPADDING",    (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("LEFTPADDING",   (0, 0), (-1, -1), 4),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 4),
        ("GRID",          (0, 0), (-1, -1), 0.3, _BORDER),
        ("VALIGN",        (0, 0), (-1, -1), "TOP"),
        ("BACKGROUND",    (0, -1), (-1, -1), _MID),
        ("FONTNAME",      (0, -1), (-1, -1), "Helvetica-Bold"),
        ("LINEABOVE",     (0, -1), (-1, -1), 1.0, _NAVY),
    ]
    for i in range(1, n_rows - 1):
        if i % 2 == 0:
            ts.append(("BACKGROUND", (0, i), (-1, i), _LIGHT))
    return TableStyle(ts)
