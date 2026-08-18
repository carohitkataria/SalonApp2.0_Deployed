"""
invoice_html.py — Server-side HTML invoice renderer.

Replaces the old reportlab PDF as the customer-facing invoice (the WhatsApp link
opens this HTML). Every visible string / toggle comes from a settings snapshot
embedded on the invoice record at generation time, so a reprint of an old
invoice is never altered by later settings changes.

Public API:
    INVOICE_SETTINGS_DEFAULTS      – dict of defaults for every settings key
    resolve_invoice_settings(salon)– merge defaults + salon doc
    number_to_words_inr(amount)    – "Three Thousand … Rupees Only"
    make_qr_data_url(text)         – base64 PNG data URL (or "")
    render_invoice_html(inv)       – full self-contained HTML string
"""
from __future__ import annotations

import base64
import io
import html
from typing import Any, Dict

# ---------------------------------------------------------------------------
# Settings defaults (mirrors INVOICE_SETTINGS_BUILD.md §2)
# ---------------------------------------------------------------------------
INVOICE_SETTINGS_DEFAULTS: Dict[str, Any] = {
    # Branding
    "signature_url": "",
    "print_signature": True,
    "signatory_label": "Authorised Signatory",
    # Document
    "title_mode": "auto",           # auto | invoice | tax
    "show_place_of_supply": True,
    "invoice_prefix": "INV-",
    "next_invoice_no": 1000,
    # Tax (existing keys)
    "is_gst_registered": True,
    "gstin": "",
    "gst_rate": 18,
    "prices_include_tax": False,
    "show_sac_column": True,
    "sac_code": "999721",
    # Totals
    "show_amount_in_words": True,
    "show_discount_line": True,
    "show_tip": True,
    "round_off_invoice": True,
    # Loyalty
    "show_payment_mode": True,
    "show_points": True,
    "show_wallet_balance": True,
    # Offers
    "show_offers": True,
    "offers_heading": "Just for you",
    "max_offers": 4,
    # QR
    "show_qr": True,
    "qr_type": "link",              # link | upi
    "qr_caption_title": "Scan for your digital copy",
    "qr_caption_body": "Opens this invoice online — share, download or reprint anytime.",
    # Text
    "thank_you": "Thank you for visiting {salon} \u2728",
    "footer_note": "Payment received in full. Goods/services once rendered are non-refundable.",
    "disclaimer": "This is a computer-generated invoice and does not require a physical signature.",
}


def resolve_invoice_settings(salon: Dict[str, Any]) -> Dict[str, Any]:
    """Merge defaults with whatever the salon doc has (flat keys)."""
    s = dict(INVOICE_SETTINGS_DEFAULTS)
    salon = salon or {}
    for k in INVOICE_SETTINGS_DEFAULTS:
        if salon.get(k) is not None:
            s[k] = salon[k]
    # is_gst_registered defaults True in spec, but salon default is False — honour salon.
    s["is_gst_registered"] = bool(salon.get("is_gst_registered", False))
    s["gstin"] = salon.get("gstin") or ""
    return s


# ---------------------------------------------------------------------------
# Number to words (Indian numbering)
# ---------------------------------------------------------------------------
_ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
         "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen",
         "Seventeen", "Eighteen", "Nineteen"]
_TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"]


def _two(n: int) -> str:
    if n < 20:
        return _ONES[n]
    return (_TENS[n // 10] + (" " + _ONES[n % 10] if n % 10 else "")).strip()


def _three(n: int) -> str:
    h = n // 100
    r = n % 100
    out = ""
    if h:
        out += _ONES[h] + " Hundred"
        if r:
            out += " "
    if r:
        out += _two(r)
    return out


def number_to_words_inr(amount: float) -> str:
    try:
        amount = float(amount or 0)
    except Exception:
        amount = 0.0
    rupees = int(amount)
    paise = int(round((amount - rupees) * 100))
    if rupees == 0:
        words = "Zero"
    else:
        parts = []
        crore = rupees // 10000000
        rupees %= 10000000
        lakh = rupees // 100000
        rupees %= 100000
        thousand = rupees // 1000
        rupees %= 1000
        hundred = rupees
        if crore:
            parts.append(_two(crore) + " Crore")
        if lakh:
            parts.append(_two(lakh) + " Lakh")
        if thousand:
            parts.append(_two(thousand) + " Thousand")
        if hundred:
            parts.append(_three(hundred))
        words = " ".join(p for p in parts if p)
    out = f"{words} Rupees"
    if paise:
        out += f" and {_two(paise)} Paise"
    return out + " Only"


# ---------------------------------------------------------------------------
# QR helper
# ---------------------------------------------------------------------------
def make_qr_data_url(text: str) -> str:
    if not text:
        return ""
    try:
        import qrcode
        qr = qrcode.QRCode(border=1, box_size=4)
        qr.add_data(text)
        qr.make(fit=True)
        img = qr.make_image(fill_color="#1b1240", back_color="white")
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()
    except Exception:
        return ""


# ---------------------------------------------------------------------------
# Rendering helpers
# ---------------------------------------------------------------------------
def _rupee(n: Any) -> str:
    try:
        v = float(n or 0)
    except Exception:
        v = 0.0
    return "\u20b9" + f"{v:,.2f}"


def _e(v: Any) -> str:
    return html.escape(str(v if v is not None else ""))


def _resolve_title(settings: Dict[str, Any]) -> str:
    mode = (settings.get("title_mode") or "auto").lower()
    if mode == "invoice":
        return "Invoice"
    if mode == "tax":
        return "Tax Invoice"
    return "Tax Invoice" if settings.get("is_gst_registered") else "Invoice"


_CSS = """
*{box-sizing:border-box;margin:0;padding:0}
body{background:#eef0f6;font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#211a3b;padding:24px 12px;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.controls{max-width:820px;margin:0 auto 16px;display:flex;gap:12px;align-items:center;flex-wrap:wrap}
.controls .primary{background:#6C4FE0;color:#fff;border:none;padding:10px 18px;border-radius:10px;font-weight:700;font-size:14px;cursor:pointer;box-shadow:0 8px 20px rgba(108,79,224,.28)}
.controls .primary:hover{background:#5b3fd1}
.controls .hint{color:#7a749a;font-size:12.5px;margin-left:auto}
.sheet{max-width:820px;margin:0 auto;background:#fff;border-radius:18px;box-shadow:0 24px 60px rgba(28,26,54,.16);overflow:hidden;display:flex;flex-direction:column}
.pad{padding:34px 40px 0;display:flex;flex-direction:column;flex:1}
.head{display:flex;justify-content:space-between;gap:24px;flex-wrap:wrap}
.brand{display:flex;gap:14px}
.logo{width:56px;height:56px;border-radius:14px;background:linear-gradient(135deg,#6C4FE0,#a07bff);display:grid;place-items:center;flex:none;overflow:hidden}
.logo img{width:100%;height:100%;object-fit:contain}
.logo svg{width:30px;height:30px;fill:none;stroke:#fff;stroke-width:2;stroke-linecap:round}
.brand-name{font-size:22px;font-weight:800;letter-spacing:-.02em;color:#1b1240}
.brand-sub{font-size:12.5px;color:#8b84a8;font-weight:600;margin-top:2px}
.brand-meta{font-size:11.5px;color:#7a749a;line-height:1.6;margin-top:8px}
.gstin{font-weight:700;color:#5b3fd1}
.doc{text-align:right;min-width:220px}
.doc-title{font-size:20px;font-weight:800;color:#1b1240;letter-spacing:-.01em}
.doc-grid{display:grid;grid-template-columns:auto auto;gap:2px 14px;justify-content:end;margin-top:10px}
.doc-grid dt{font-size:11px;color:#8b84a8;text-align:right;font-weight:600}
.doc-grid dd{font-size:12.5px;font-weight:700;color:#211a3b;text-align:right}
.paid-badge{display:inline-flex;align-items:center;gap:6px;background:#e6f7ee;color:#12a05c;font-weight:800;font-size:12px;padding:5px 12px;border-radius:20px;margin-top:12px}
.paid-badge svg{width:14px;height:14px;fill:none;stroke:#12a05c;stroke-width:3;stroke-linecap:round;stroke-linejoin:round}
.rule{height:1px;background:#ece9f5;margin:22px 0}
.parties{display:grid;grid-template-columns:repeat(3,1fr);gap:18px}
.party h4{font-size:10.5px;text-transform:uppercase;letter-spacing:.1em;color:#a49dbf;font-weight:800;margin-bottom:7px}
.p-name{font-size:14px;font-weight:800;color:#1b1240}
.p-row{font-size:12px;color:#7a749a;margin-top:2px}
.tier{display:inline-block;margin-top:6px;background:#fdf0d6;color:#a5741a;font-size:11px;font-weight:800;padding:3px 9px;border-radius:20px}
table{width:100%;border-collapse:collapse;margin-top:24px}
thead th{font-size:10.5px;text-transform:uppercase;letter-spacing:.08em;color:#a49dbf;font-weight:800;text-align:left;padding:0 8px 10px;border-bottom:2px solid #ece9f5}
thead th.num,tbody td.num{text-align:right}
tbody td{padding:12px 8px;border-bottom:1px solid #f2f0f8;font-size:13px;vertical-align:top}
.idx{color:#b7b0cf;font-weight:700;margin-right:8px}
.svc-name{font-weight:700;color:#1b1240}
.svc-desc{font-size:11.5px;color:#9a93b5;margin-top:2px}
.stylist{font-size:12.5px;color:#4b4468;font-weight:600}
.disc-cell{color:#12a05c;font-weight:700}
.disc-pct{font-size:10.5px;color:#12a05c;font-weight:700}
.muted-dash{color:#c4bedb;font-weight:600}
.made-by{margin-top:14px;text-align:center;font-size:11px;color:#a49dbf;line-height:1.6}
.made-by a{color:#6C4FE0;font-weight:700;text-decoration:none}
.sac{color:#8b84a8;font-weight:600}
.foot-grid{display:grid;grid-template-columns:1fr 300px;gap:28px;margin-top:22px}
.in-words{font-size:12px;color:#7a749a;line-height:1.6}
.in-words b{color:#211a3b}
.side-note{margin-top:16px;display:flex;flex-direction:column;gap:8px}
.chip{display:flex;justify-content:space-between;align-items:center;background:#f7f6fc;border:1px solid #eeecf7;border-radius:10px;padding:8px 12px}
.chip.gold{background:#fdf7ea;border-color:#f3e6c4}
.c-l{display:flex;align-items:center;gap:7px;font-size:12px;color:#7a749a;font-weight:600}
.c-l svg{width:15px;height:15px;fill:none;stroke:#9a93b5;stroke-width:2}
.chip.gold .c-l svg{stroke:#c99a2e;fill:#f6d98a}
.c-v{font-size:13px;font-weight:800;color:#211a3b}
.totals{display:flex;flex-direction:column;gap:7px}
.t-row{display:flex;justify-content:space-between;font-size:13px}
.t-row.muted{color:#7a749a}
.t-row.disc{color:#12a05c;font-weight:700}
.t-row .num{font-variant-numeric:tabular-nums}
.grand{margin-top:12px;background:linear-gradient(135deg,#6C4FE0,#8a6bff);color:#fff;border-radius:14px;padding:14px 16px;text-align:right}
.g-label{font-size:11px;text-transform:uppercase;letter-spacing:.08em;opacity:.85;font-weight:700}
.g-amt{font-size:26px;font-weight:800;letter-spacing:-.02em;margin-top:2px}
.g-mode{font-size:11.5px;opacity:.85;margin-top:2px}
.offers{margin-top:26px;background:#f7f6fc;border:1px dashed #d9d3ee;border-radius:14px;padding:16px 18px}
.offers h4{display:flex;align-items:center;gap:8px;font-size:13px;font-weight:800;color:#5b3fd1;margin-bottom:10px}
.offers h4 svg{width:16px;height:16px;fill:none;stroke:#6C4FE0;stroke-width:2}
.offer-list{display:flex;flex-direction:column;gap:8px}
.offer{display:flex;gap:9px;font-size:12.5px;color:#4b4468;line-height:1.5}
.offer .dot{width:7px;height:7px;border-radius:50%;background:#6C4FE0;margin-top:6px;flex:none}
.offer b{color:#211a3b}
.code{background:#ece7fb;color:#5b3fd1;font-weight:800;font-size:11px;padding:1px 7px;border-radius:6px;font-family:ui-monospace,monospace}
.sheet-foot{margin-top:26px;background:#faf9fd;border-top:1px solid #ece9f5;padding:22px 40px}
.foot-inner{display:flex;gap:24px;align-items:flex-start;flex-wrap:wrap}
.qr-wrap{display:flex;gap:12px;align-items:center;flex:none}
.qr-wrap img{width:78px;height:78px;border-radius:8px;background:#fff;padding:4px;border:1px solid #ece9f5}
.qr-cap{font-size:11px;color:#8b84a8;max-width:150px;line-height:1.5}
.qr-cap b{display:block;color:#211a3b;font-size:12px;margin-bottom:2px}
.thanks{flex:1;min-width:220px;text-align:right;margin-left:auto}
.ty{font-size:14px;font-weight:800;color:#1b1240}
.terms{font-size:11px;color:#9a93b5;margin-top:6px;line-height:1.6}
.sig{margin-top:18px;display:inline-block;text-align:center}
.sig img{height:40px;object-fit:contain;display:block;margin:0 auto 4px}
.sig .line{width:170px;border-top:1px solid #b7b0cf;margin-bottom:5px}
.sig .lbl{font-size:11px;color:#7a749a;font-weight:700}
@media print{body{background:#fff;padding:0}.controls{display:none}.sheet{box-shadow:none;border-radius:0;max-width:100%}}
@media(max-width:640px){.parties{grid-template-columns:1fr}.foot-grid{grid-template-columns:1fr}.pad{padding:22px 20px 0}.sheet-foot{padding:20px}.thanks{text-align:left;margin-left:0}}
"""


def render_invoice_html(inv: Dict[str, Any]) -> str:
    settings = resolve_invoice_settings(inv.get("settings") or {})
    salon = inv.get("salon") or {}
    cust = inv.get("customer") or {}
    served = inv.get("served_by") or {}
    is_gst = bool(settings.get("is_gst_registered"))
    show_sac = is_gst and bool(settings.get("show_sac_column"))
    title = _resolve_title(settings)

    # ---- brand block ----
    logo_html = (
        f'<img src="{_e(salon.get("logo_url"))}" alt="logo"/>'
        if salon.get("logo_url")
        else '<svg viewBox="0 0 24 24"><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/>'
             '<line x1="20" y1="4" x2="8.12" y2="15.88"/><line x1="14.47" y1="14.48" x2="20" y2="20"/>'
             '<line x1="8.12" y1="8.12" x2="12" y2="12"/></svg>'
    )
    meta_lines = []
    if salon.get("address"):
        meta_lines.append(_e(salon.get("address")))
    contact = " \u00b7 ".join([x for x in [salon.get("phone"), salon.get("email")] if x])
    if contact:
        meta_lines.append(_e(contact))
    if is_gst and settings.get("gstin"):
        meta_lines.append(f'<span class="gstin">GSTIN: {_e(settings.get("gstin"))}</span>')
    meta_html = "<br>".join(meta_lines)

    # ---- doc grid ----
    doc_rows = [
        f"<dt>Invoice #</dt><dd>{_e(inv.get('invoice_no'))}</dd>",
        f"<dt>Date &amp; time</dt><dd>{_e(inv.get('date'))} \u00b7 {_e(inv.get('time'))}</dd>",
    ]
    if is_gst and settings.get("show_place_of_supply") and salon.get("place_of_supply"):
        doc_rows.append(f"<dt>Place of supply</dt><dd>{_e(salon.get('place_of_supply'))}</dd>")

    paid_mode = inv.get("payment_mode") or "Cash"
    paid_badge = (
        f'<div class="paid-badge"><svg viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"/></svg> '
        f'PAID \u00b7 {_e(str(paid_mode).upper())}</div>'
    )

    # ---- parties ----
    tier = cust.get("tier")
    party_cust = (
        '<div class="party"><h4>Billed to</h4>'
        f'<div class="p-name">{_e(cust.get("name") or "Walk-in")}</div>'
        + (f'<div class="p-row">{_e(cust.get("phone"))}</div>' if cust.get("phone") else "")
        + (f'<div class="p-row">Guest ID \u00b7 {_e(cust.get("guest_id"))}</div>' if cust.get("guest_id") else "")
        + "</div>"
    )
    party_served = (
        '<div class="party"><h4>Served by</h4>'
        f'<div class="p-name">{_e(served.get("name") or "Salon")}</div>'
        + (f'<div class="p-row">{_e(served.get("role"))}</div>' if served.get("role") else "")
        + "</div>"
    )
    salon_party_rows = [f'<div class="p-name">{_e(salon.get("branch_name") or "Main Branch")}</div>']
    if is_gst and salon.get("place_of_supply"):
        salon_party_rows.append(f'<div class="p-row">{_e(salon.get("place_of_supply"))}</div>')
    if is_gst and settings.get("gstin"):
        salon_party_rows.append(f'<div class="p-row">GSTIN {_e(settings.get("gstin"))}</div>')
    party_salon = '<div class="party"><h4>Salon</h4>' + "".join(salon_party_rows) + "</div>"
    parties_html = f'<div class="parties">{party_cust}{party_served}{party_salon}</div>'

    # ---- line items ----
    head_cells = ["<th>Service</th>", "<th>Stylist</th>"]
    if show_sac:
        head_cells.append("<th>SAC</th>")
    head_cells += ["<th class='num'>Qty</th>", "<th class='num'>Price</th>",
                   "<th class='num'>Discount</th>", "<th class='num'>Amount</th>"]
    rows_html = ""
    for i, it in enumerate(inv.get("items") or [], 1):
        desc = f'<div class="svc-desc">{_e(it.get("desc"))}</div>' if it.get("desc") else ""
        stylist_td = f'<td class="stylist">{_e(it.get("stylist") or "—")}</td>'
        sac_td = f'<td class="sac num">{_e(it.get("sac") or settings.get("sac_code"))}</td>' if show_sac else ""
        _disc = float(it.get("discount") or 0)
        if _disc > 0:
            _pct = it.get("discount_pct")
            _pct_lbl = f' <span class="disc-pct">({_e(int(_pct))}%)</span>' if _pct else ""
            disc_cell = f'\u2212 {_rupee(_disc)}{_pct_lbl}'
        else:
            disc_cell = '<span class="muted-dash">\u2014</span>'
        rows_html += (
            "<tr>"
            f'<td><span class="idx">{i}.</span><span class="svc-name">{_e(it.get("name"))}</span>{desc}</td>'
            f"{stylist_td}"
            f"{sac_td}"
            f'<td class="num">{int(it.get("qty") or 1)}</td>'
            f'<td class="num">{_rupee(it.get("rate"))}</td>'
            f'<td class="num disc-cell">{disc_cell}</td>'
            f'<td class="num">{_rupee(it.get("amount"))}</td>'
            "</tr>"
        )
    table_html = f"<table><thead><tr>{''.join(head_cells)}</tr></thead><tbody>{rows_html}</tbody></table>"

    # ---- totals ----
    t_rows = [f'<div class="t-row muted"><span>Subtotal</span><span class="num">{_rupee(inv.get("subtotal"))}</span></div>']
    if settings.get("show_discount_line") and float(inv.get("discount_amount") or 0) > 0:
        lbl = _e(inv.get("discount_label") or "Discount")
        t_rows.append(f'<div class="t-row disc"><span>{lbl}</span><span class="num">\u2212 {_rupee(inv.get("discount_amount"))}</span></div>')
    if is_gst:
        val_label = "Taxable value"
        t_rows.append(f'<div class="t-row"><span>{val_label}</span><span class="num">{_rupee(inv.get("taxable_value"))}</span></div>')
        if float(inv.get("igst") or 0) > 0:
            t_rows.append(f'<div class="t-row muted"><span>IGST @ {_e(inv.get("igst_rate"))}%</span><span class="num">{_rupee(inv.get("igst"))}</span></div>')
        else:
            t_rows.append(f'<div class="t-row muted"><span>CGST @ {_e(inv.get("cgst_rate"))}%</span><span class="num">{_rupee(inv.get("cgst"))}</span></div>')
            t_rows.append(f'<div class="t-row muted"><span>SGST @ {_e(inv.get("sgst_rate"))}%</span><span class="num">{_rupee(inv.get("sgst"))}</span></div>')
    else:
        t_rows.append(f'<div class="t-row"><span>Value</span><span class="num">{_rupee(inv.get("taxable_value") or inv.get("subtotal"))}</span></div>')
    if settings.get("show_tip") and float(inv.get("tip") or 0) > 0:
        t_rows.append(f'<div class="t-row muted"><span>Tip</span><span class="num">{_rupee(inv.get("tip"))}</span></div>')
    if settings.get("round_off_invoice") and abs(float(inv.get("round_off") or 0)) > 0.001:
        ro = float(inv.get("round_off") or 0)
        sign = "+" if ro >= 0 else "\u2212"
        t_rows.append(f'<div class="t-row muted"><span>Round off</span><span class="num">{sign} {_rupee(abs(ro))}</span></div>')
    grand_label = "Total (incl. GST)" if is_gst else "Total"
    grand_block = (
        '<div class="grand">'
        f'<div class="g-label">{grand_label}</div>'
        f'<div class="g-amt num">{_rupee(inv.get("grand_total"))}</div>'
        f'<div class="g-mode">Paid via {_e(paid_mode)}</div>'
        "</div>"
    )
    totals_html = f'<div class="totals">{"".join(t_rows)}{grand_block}</div>'

    # ---- side notes (words + loyalty chips) ----
    left_bits = ""
    if settings.get("show_amount_in_words"):
        words = inv.get("amount_in_words") or number_to_words_inr(inv.get("grand_total"))
        left_bits += f'<div class="in-words">Amount in words: <b>{_e(words)}</b></div>'
    chips = ""
    if settings.get("show_points") and (inv.get("loyalty_points") is not None):
        chips += (
            '<div class="chip gold"><span class="c-l"><svg viewBox="0 0 24 24"><polygon points="12 2 15 9 22 9 16 14 18 21 12 17 6 21 8 14 2 9 9 9"/></svg> Loyalty points earned</span>'
            f'<span class="c-v">+{int(inv.get("loyalty_points") or 0)} pts</span></div>'
        )
    if settings.get("show_wallet_balance") and (inv.get("wallet_balance") is not None):
        chips += (
            '<div class="chip"><span class="c-l"><svg viewBox="0 0 24 24"><path d="M21 12V7H5a2 2 0 0 1 0-4h14v4"/><path d="M3 5v14a2 2 0 0 0 2 2h16v-5"/><path d="M18 12a2 2 0 0 0 0 4h4v-4z"/></svg> Salon wallet balance</span>'
            f'<span class="c-v">{_rupee(inv.get("wallet_balance"))}</span></div>'
        )
    if chips:
        left_bits += f'<div class="side-note">{chips}</div>'
    foot_grid_html = f'<div class="foot-grid"><div>{left_bits}</div>{totals_html}</div>'

    # ---- offers ----
    offers_html = ""
    offers = inv.get("offers") or []
    if settings.get("show_offers") and offers:
        items = ""
        for o in offers[: int(settings.get("max_offers") or 4)]:
            code = f' <span class="code">[{_e(o.get("code"))}]</span>' if o.get("code") else ""
            desc = _e(o.get("description")) if o.get("description") else ""
            items += f'<div class="offer"><span class="dot"></span><span><b>{_e(o.get("title"))}</b>{" — " + desc if desc else ""}{code}</span></div>'
        offers_html = (
            '<div class="offers"><h4><svg viewBox="0 0 24 24"><path d="M20 12v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-6"/><path d="M2 7h20v5H2z"/><path d="M12 22V7"/></svg>'
            f'{_e(settings.get("offers_heading"))}</h4><div class="offer-list">{items}</div></div>'
        )

    # ---- footer (QR + thanks + signature) ----
    qr_html = ""
    if settings.get("show_qr") and inv.get("qr_url"):
        qr_html = (
            '<div class="qr-wrap">'
            f'<img src="{_e(inv.get("qr_url"))}" alt="QR"/>'
            f'<div class="qr-cap"><b>{_e(settings.get("qr_caption_title"))}</b>{_e(settings.get("qr_caption_body"))}</div>'
            "</div>"
        )
    salon_name = salon.get("name") or "our salon"
    thank_you = (settings.get("thank_you") or "").replace("{salon}", salon_name)
    sig_inner = ""
    if settings.get("print_signature"):
        if settings.get("signature_url"):
            sig_inner += f'<img src="{_e(settings.get("signature_url"))}" alt="signature"/>'
        sig_inner += '<div class="line"></div>'
    else:
        sig_inner += '<div class="line"></div>'
    sig_inner += f'<div class="lbl">{_e(settings.get("signatory_label"))}</div>'
    thanks_html = (
        '<div class="thanks">'
        f'<div class="ty">{_e(thank_you)}</div>'
        f'<div class="terms">{_e(settings.get("footer_note"))}<br>{_e(settings.get("disclaimer"))}</div>'
        f'<div class="sig">{sig_inner}</div>'
        "</div>"
    )
    foot_html = f'<div class="sheet-foot"><div class="foot-inner">{qr_html}{thanks_html}</div>' \
                '<div class="made-by">Created with <a href="https://salonhub.in" target="_blank" rel="noopener">SalonHub</a> \u00b7 ' \
                'Book &amp; manage your salon at <a href="https://salonhub.in" target="_blank" rel="noopener">salonhub.in</a></div></div>'

    brand_sub = _e(salon.get("sub") or "")
    return f"""<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>{_e(salon.get("name") or "Salon")} — Invoice {_e(inv.get("invoice_no"))}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap" rel="stylesheet">
<style>{_CSS}</style></head><body>
<div class="controls">
  <button class="primary" onclick="window.print()">\u29c9 Print / Save as PDF</button>
  <span class="hint">Screen controls won't appear on the printed invoice.</span>
</div>
<div class="sheet">
  <div class="pad">
    <div class="head">
      <div class="brand">
        <div class="logo">{logo_html}</div>
        <div>
          <div class="brand-name">{_e(salon.get("name") or "Salon")}</div>
          {f'<div class="brand-sub">{brand_sub}</div>' if brand_sub else ''}
          <div class="brand-meta">{meta_html}</div>
        </div>
      </div>
      <div class="doc">
        <div class="doc-title">{_e(title)}</div>
        <dl class="doc-grid">{''.join(doc_rows)}</dl>
        {paid_badge}
      </div>
    </div>
    <div class="rule"></div>
    {parties_html}
    {table_html}
    {foot_grid_html}
    {offers_html}
  </div>
  {foot_html}
</div>
</body></html>"""
