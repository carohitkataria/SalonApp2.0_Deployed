"""
Invoice Generation Service
Generates PDF invoices for completed bookings
"""
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_CENTER
from datetime import datetime
import io
import logging

logger = logging.getLogger(__name__)

def generate_invoice_pdf(invoice_data):
    """
    Generate invoice PDF
    
    invoice_data should contain:
    - salon: {name, address, gstin, logo_url}
    - customer: {name, phone}
    - invoice_no: str
    - date: str
    - services: [{name, price, discount, amount}]
    - subtotal: float
    - cgst: float (optional)
    - sgst: float (optional)
    - total: float
    - payment_method: str
    - is_tax_invoice: bool
    """
    
    buffer = io.BytesIO()
    
    # Create PDF
    doc = SimpleDocTemplate(buffer, pagesize=A4,
                           rightMargin=40, leftMargin=40,
                           topMargin=40, bottomMargin=40)
    
    elements = []
    styles = getSampleStyleSheet()
    
    # Custom styles
    title_style = ParagraphStyle(
        'CustomTitle',
        parent=styles['Heading1'],
        fontSize=24,
        textColor=colors.HexColor('#1e3a5f'),
        spaceAfter=30,
        alignment=TA_CENTER,
        fontName='Helvetica-Bold'
    )
    
    header_style = ParagraphStyle(
        'CustomHeader',
        parent=styles['Normal'],
        fontSize=12,
        textColor=colors.HexColor('#1e3a5f'),
        alignment=TA_CENTER,
        spaceAfter=20
    )
    
    # Add salon logo if available
    salon = invoice_data.get('salon', {})
    if salon.get('logo_url'):
        try:
            # In production, download and use the logo
            # For now, we'll skip the logo
            pass
        except Exception as e:
            logger.warning(f"Could not add logo: {e}")
    
    # Salon Name
    salon_name = Paragraph(f"<b>{salon.get('salon_name', 'Salon')}</b>", title_style)
    elements.append(salon_name)
    
    # Salon Address
    address = Paragraph(f"{salon.get('address', '')}", header_style)
    elements.append(address)
    
    # GSTIN if tax invoice
    if invoice_data.get('is_tax_invoice') and salon.get('gstin'):
        gstin = Paragraph(f"GSTIN: {salon.get('gstin')}", header_style)
        elements.append(gstin)
    
    elements.append(Spacer(1, 20))
    
    # Invoice Title
    invoice_title = "TAX INVOICE" if invoice_data.get('is_tax_invoice') else "INVOICE"
    title = Paragraph(f"<b>{invoice_title}</b>", 
                     ParagraphStyle('InvoiceTitle', 
                                   parent=styles['Heading1'],
                                   fontSize=20,
                                   textColor=colors.HexColor('#1e3a5f'),
                                   spaceAfter=20,
                                   alignment=TA_CENTER,
                                   fontName='Helvetica-Bold'))
    elements.append(title)
    
    elements.append(Spacer(1, 20))
    
    # Invoice details
    invoice_info = [
        [Paragraph("<b>Invoice No:</b>", styles['Normal']), 
         invoice_data.get('invoice_no', 'N/A'),
         Paragraph("<b>Date:</b>", styles['Normal']), 
         invoice_data.get('date', datetime.now().strftime('%d/%m/%Y'))]
    ]
    
    info_table = Table(invoice_info, colWidths=[100, 150, 80, 150])
    info_table.setStyle(TableStyle([
        ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
        ('FONTNAME', (0, 0), (-1, -1), 'Helvetica'),
        ('FONTSIZE', (0, 0), (-1, -1), 10),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 12),
    ]))
    elements.append(info_table)
    
    elements.append(Spacer(1, 20))
    
    # Customer details
    customer = invoice_data.get('customer', {})
    customer_info = [
        [Paragraph(f"<b>Billed To:</b> {customer.get('name', 'Customer')}", styles['Normal'])],
        [Paragraph(f"<b>Mobile:</b> {customer.get('phone', '')}", styles['Normal'])]
    ]
    
    customer_table = Table(customer_info, colWidths=[480])
    customer_table.setStyle(TableStyle([
        ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
        ('FONTNAME', (0, 0), (-1, -1), 'Helvetica'),
        ('FONTSIZE', (0, 0), (-1, -1), 10),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
    ]))
    elements.append(customer_table)
    
    elements.append(Spacer(1, 20))
    
    # Services table
    table_data = [
        [Paragraph('<b>Sr. No.</b>', styles['Normal']),
         Paragraph('<b>Description</b>', styles['Normal']),
         Paragraph('<b>Price (₹)</b>', styles['Normal']),
         Paragraph('<b>Discount (%)</b>', styles['Normal']),
         Paragraph('<b>Amount (₹)</b>', styles['Normal'])]
    ]
    
    services = invoice_data.get('services', [])
    for idx, service in enumerate(services, 1):
        table_data.append([
            str(idx),
            service.get('name', ''),
            f"{service.get('price', 0):.2f}",
            f"{service.get('discount', 0)}%",
            f"{service.get('amount', 0):.2f}"
        ])
    
    # Service table
    service_table = Table(table_data, colWidths=[60, 180, 80, 80, 80])
    service_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1e3a5f')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 11),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
        ('BACKGROUND', (0, 1), (-1, -1), colors.beige),
        ('GRID', (0, 0), (-1, -1), 1, colors.black),
        ('FONTNAME', (0, 1), (-1, -1), 'Helvetica'),
        ('FONTSIZE', (0, 1), (-1, -1), 10),
        ('ALIGN', (2, 1), (-1, -1), 'RIGHT'),
    ]))
    elements.append(service_table)
    
    elements.append(Spacer(1, 20))
    
    # Totals table
    subtotal = invoice_data.get('subtotal', 0)
    total = invoice_data.get('total', 0)
    
    totals_data = [
        ['', '', '', Paragraph('<b>Subtotal:</b>', styles['Normal']), f"₹ {subtotal:.2f}"]
    ]
    
    # Add tax breakdown if tax invoice
    if invoice_data.get('is_tax_invoice'):
        cgst = invoice_data.get('cgst', 0)
        sgst = invoice_data.get('sgst', 0)
        tax_rate = invoice_data.get('tax_rate', 9)
        
        totals_data.extend([
            ['', '', '', Paragraph(f'<b>CGST @ {tax_rate}%:</b>', styles['Normal']), f"₹ {cgst:.2f}"],
            ['', '', '', Paragraph(f'<b>SGST @ {tax_rate}%:</b>', styles['Normal']), f"₹ {sgst:.2f}"],
            ['', '', '', Paragraph('<b>Total Tax:</b>', styles['Normal']), f"₹ {cgst + sgst:.2f}"]
        ])
    
    totals_data.append(['', '', '', '', ''])  # Spacer row
    
    totals_table = Table(totals_data, colWidths=[60, 180, 80, 80, 80])
    totals_table.setStyle(TableStyle([
        ('ALIGN', (3, 0), (-1, -1), 'RIGHT'),
        ('FONTNAME', (3, 0), (-1, -1), 'Helvetica'),
        ('FONTSIZE', (3, 0), (-1, -1), 10),
        ('BOTTOMPADDING', (3, 0), (-1, -1), 8),
    ]))
    elements.append(totals_table)
    
    # Grand total
    grand_total_data = [
        ['', '', '', Paragraph('<b>Grand Total:</b>', 
                              ParagraphStyle('GrandTotal', 
                                           parent=styles['Normal'],
                                           fontSize=14,
                                           fontName='Helvetica-Bold')),
         Paragraph(f'<b>₹ {total:.2f}</b>',
                  ParagraphStyle('GrandTotalAmount',
                               parent=styles['Normal'],
                               fontSize=14,
                               fontName='Helvetica-Bold'))]
    ]
    
    grand_total_table = Table(grand_total_data, colWidths=[60, 180, 80, 80, 80])
    grand_total_table.setStyle(TableStyle([
        ('BACKGROUND', (3, 0), (-1, -1), colors.HexColor('#1e3a5f')),
        ('TEXTCOLOR', (3, 0), (-1, -1), colors.whitesmoke),
        ('ALIGN', (3, 0), (-1, -1), 'RIGHT'),
        ('PADDING', (3, 0), (-1, -1), 12),
    ]))
    elements.append(grand_total_table)
    
    elements.append(Spacer(1, 30))
    
    # Payment method
    payment_method = invoice_data.get('payment_method', 'Cash')
    payment = Paragraph(f"<b>Payment Method:</b> {payment_method}", styles['Normal'])
    elements.append(payment)
    
    elements.append(Spacer(1, 30))
    
    # Thank you message
    thank_you = Paragraph(f"<i>Thank you for visiting {salon.get('salon_name', 'our salon')}!</i>",
                         ParagraphStyle('ThankYou',
                                      parent=styles['Normal'],
                                      fontSize=14,
                                      textColor=colors.HexColor('#1e3a5f'),
                                      alignment=TA_CENTER,
                                      fontName='Helvetica-Oblique'))
    elements.append(thank_you)
    
    elements.append(Spacer(1, 20))
    
    # Terms and conditions
    terms_title = Paragraph("<b>Terms & Conditions:</b>", styles['Normal'])
    elements.append(terms_title)
    
    terms = [
        "- Products and Memberships once sold cannot be refunded, exchanged or transferred.",
        "- Salon management reserves the right to admission.",
        "- Only 1 benefit can be used at a time."
    ]
    
    for term in terms:
        term_para = Paragraph(term, 
                             ParagraphStyle('Terms',
                                          parent=styles['Normal'],
                                          fontSize=9,
                                          leftIndent=10,
                                          spaceAfter=5))
        elements.append(term_para)
    
    # Build PDF
    doc.build(elements)
    
    # Get PDF data
    pdf_data = buffer.getvalue()
    buffer.close()
    
    return pdf_data


def save_invoice_pdf(pdf_data, filename):
    """Save PDF to file"""
    filepath = f"/tmp/{filename}"
    with open(filepath, 'wb') as f:
        f.write(pdf_data)
    return filepath
