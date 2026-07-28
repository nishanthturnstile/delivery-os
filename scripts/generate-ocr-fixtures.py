#!/usr/bin/env python3
"""Generate synthetic OCR fixture images and ground truth for M3 evaluation.

Output: tests/fixtures/m3/ocr/*.png + *.gt.json
"""

import hashlib
import json
import os
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

FIXTURE_DIR = Path("tests/fixtures/m3/ocr")
FIXTURE_VERSION = "m3-ocr-synthetic-v1"
FONT_DIR = Path("/usr/share/fonts/truetype")
PAGE_W, PAGE_H = 1224, 1584
MARGIN = 48
LINE_H = 28


def _font(size=16):
    candidates = [
        FONT_DIR / "liberation" / "LiberationSerif-Regular.ttf",
        FONT_DIR / "dejavu" / "DejaVuSerif.ttf",
        FONT_DIR / "liberation" / "LiberationSans-Regular.ttf",
    ]
    for p in candidates:
        if p.exists():
            return ImageFont.truetype(str(p), size)
    return ImageFont.load_default()


def _font_bold(size=18):
    candidates = [
        FONT_DIR / "liberation" / "LiberationSerif-Bold.ttf",
        FONT_DIR / "dejavu" / "DejaVuSerif-Bold.ttf",
        FONT_DIR / "liberation" / "LiberationSans-Bold.ttf",
    ]
    for p in candidates:
        if p.exists():
            return ImageFont.truetype(str(p), size)
    return _font(size)


def _draw_text(draw, x, y, text, font, color=(0, 0, 0)):
    draw.text((x, y), text, font=font, fill=color)
    return y + LINE_H


def _bbox(draw, x, y, text, font):
    bbox = draw.textbbox((x, y), text, font=font)
    return [bbox[0], bbox[1], bbox[2], bbox[3]]


def _wrap(text, font, draw, max_w):
    words = text.split()
    lines = []
    for w in words:
        if not lines:
            lines.append(w)
        else:
            candidate = lines[-1] + " " + w
            bw = draw.textbbox((0, 0), candidate, font=font)[2]
            if bw <= max_w:
                lines[-1] = candidate
            else:
                lines.append(w)
    return lines


def _save(name, img, blocks):
    FIXTURE_DIR.mkdir(parents=True, exist_ok=True)
    path_png = FIXTURE_DIR / f"{name}.png"
    path_gt = FIXTURE_DIR / f"{name}.gt.json"
    img.save(str(path_png))
    with open(path_png, "rb") as f:
        sha = hashlib.sha256(f.read()).hexdigest()
    gt = {
        "schemaVersion": "1",
        "fixtureVersion": FIXTURE_VERSION,
        "format": name,
        "sha256": sha,
        "width": PAGE_W,
        "height": PAGE_H,
        "blocks": blocks,
    }
    with open(path_gt, "w") as f:
        json.dump(gt, f, indent=2)
    print(f"  {name}.png ({len(blocks)} blocks) sha256={sha[:16]}...")


def _draw_text_block(draw, x, y, text, font, color=(0, 0, 0)):
    start_y = y
    lines = _wrap(text, font, draw, PAGE_W - 2 * MARGIN)
    right = x
    for line in lines:
        draw.text((x, y), line, font=font, fill=color)
        right = max(right, draw.textbbox((x, y), line, font=font)[2])
        y += LINE_H
    polygon = [x, start_y, right, start_y, right, y, x, y]
    y += 12
    return y, polygon

def generate_clean_scan():
    img = Image.new("RGB", (PAGE_W, PAGE_H), "white")
    draw = ImageDraw.Draw(img)
    font = _font(16)
    bold = _font_bold(18)
    x, y = MARGIN, MARGIN
    blocks = []

    text_heading = "Purchase Order Terms and Conditions"
    bw = draw.textbbox((x, y), text_heading, font=bold)
    draw.text((x, y), text_heading, font=bold, fill=(0, 0, 0))
    blocks.append({
        "text": text_heading,
        "kind": "HEADING",
        "critical": False,
        "polygon": [bw[0], bw[1], bw[2], bw[1], bw[2], bw[3], bw[0], bw[3]],
    })
    y += 44

    paras = [
        "All deliveries must be scheduled at least 48 hours in advance using the approved procurement portal",
        "Payment terms are net thirty days from the date of a correctly rendered invoice",
        "Force majeure events must be documented and submitted within five business days of the event onset",
    ]
    for para in paras:
        y, polygon = _draw_text_block(draw, x, y, para, font)
        blocks.append({
            "text": para,
            "kind": "PARAGRAPH",
            "critical": True,
            "polygon": polygon,
        })

    _save("clean-scan", img, blocks)


def generate_degraded_scan():
    from PIL import ImageFilter
    import random
    random.seed(42)

    img_base = Image.new("RGB", (PAGE_W, PAGE_H), "white")
    draw = ImageDraw.Draw(img_base)
    font = _font(16)
    bold = _font_bold(18)
    x, y = MARGIN, MARGIN
    blocks = []

    text_heading = "Invoice Processing Guidelines"
    bw = draw.textbbox((x, y), text_heading, font=bold)
    draw.text((x, y), text_heading, font=bold, fill=(0, 0, 0))
    blocks.append({
        "text": text_heading,
        "kind": "HEADING",
        "critical": False,
        "polygon": [bw[0], bw[1], bw[2], bw[1], bw[2], bw[3], bw[0], bw[3]],
    })
    y += 44

    paras = [
        "All invoices must be submitted in PDF format through the accounts payable portal",
        "Approved invoices are processed on the next scheduled payment run following the twenty-fifth day of each month",
        "Disputed amounts must be flagged within five business days of invoice receipt",
    ]
    for para in paras:
        y, polygon = _draw_text_block(draw, x, y, para, font)
        blocks.append({
            "text": para,
            "kind": "PARAGRAPH",
            "critical": True,
            "polygon": polygon,
        })

    img = img_base.rotate(0.15, expand=False, fillcolor="white")
    img = img.filter(ImageFilter.GaussianBlur(radius=0.3))

    _save("degraded-scan", img, blocks)


def generate_multi_column():
    img = Image.new("RGB", (PAGE_W, PAGE_H), "white")
    draw = ImageDraw.Draw(img)
    font = _font(16)
    bold = _font_bold(18)
    x, y = MARGIN, MARGIN
    blocks = []

    heading = "Project Status Dashboard"
    bw = draw.textbbox((x, y), heading, font=bold)
    draw.text((x, y), heading, font=bold, fill=(0, 0, 0))
    blocks.append({
        "text": heading,
        "kind": "HEADING",
        "critical": False,
        "polygon": [bw[0], bw[1], bw[2], bw[1], bw[2], bw[3], bw[0], bw[3]],
    })
    y += 44

    items = [
        "Design review for the authentication module is complete and pending sign-off from the security team",
        "Database migration scripts for the project registry schema are under active development",
        "Client portal wireframes have been shared with the design team for accessibility review",
        "Load testing for the OCR ingestion pipeline was conducted with twenty concurrent document jobs",
    ]

    for item in items:
        y, polygon = _draw_text_block(draw, x, y, item, font)
        blocks.append({
            "text": item,
            "kind": "PARAGRAPH",
            "critical": True,
            "polygon": polygon,
        })

    _save("multi-column", img, blocks)


def generate_table():
    img = Image.new("RGB", (PAGE_W, PAGE_H), "white")
    draw = ImageDraw.Draw(img)
    font = _font(14)
    bold = _font_bold(16)
    x, y = MARGIN, MARGIN
    blocks = []

    heading = "Invoice Line Items"
    bw = draw.textbbox((x, y), heading, font=bold)
    draw.text((x, y), heading, font=bold, fill=(0, 0, 0))
    blocks.append({
        "text": heading, "kind": "HEADING",
        "critical": False,
        "polygon": [bw[0], bw[1], bw[2], bw[1], bw[2], bw[3], bw[0], bw[3]]
    })
    y += 44

    headers = ["Item", "Quantity", "Unit Price", "Total"]
    rows_data = [
        ("Steel brackets (M8)", "24", "3.50", "84.00"),
        ("Hex bolts 10mm", "100", "0.45", "45.00"),
        ("Rubber gasket \u2014 A series", "12", "8.20", "98.40"),
        ("Hydraulic hose 6ft", "6", "22.50", "135.00"),
        ("Pressure gauge 0-100 PSI", "4", "37.00", "148.00"),
        ("Copper tubing 1/2in x 10ft", "10", "14.75", "147.50"),
        ("Brass adapter 3/4in NPT", "30", "2.10", "63.00"),
    ]

    col_widths = [360, 140, 180, 180]
    col_xs = []
    cx = MARGIN
    for cw in col_widths:
        col_xs.append(cx)
        cx += cw

    def draw_cell(text, row_y, is_header=False, is_data=False):
        f = bold if is_header else font
        for ci, cx_start in enumerate(col_xs):
            cell = headers[ci] if is_header else text if is_data else ""
            if is_data:
                cell = text
            bw = draw.textbbox((cx_start + 8, row_y + 4), cell, font=f)
            draw.text((cx_start + 8, row_y + 4), cell, font=f, fill=(0, 0, 0))
            blocks.append({
                "text": cell, "kind": "TABLE_CELL",
                "table": 0,
                "row": (row_y - y - 44) // 32 + (0 if is_header else 1),
                "cell": ci,
                "polygon": [
                    cx_start, row_y, cx_start + col_widths[ci], row_y,
                    cx_start + col_widths[ci], row_y + 32, cx_start, row_y + 32
                ]
            })
        return row_y + 32

    row_y = y
    for hi, h in enumerate(headers):
        bw = draw.textbbox((col_xs[hi] + 8, row_y + 4), h, font=bold)
        draw.text((col_xs[hi] + 8, row_y + 4), h, font=bold, fill=(0, 0, 0))
        blocks.append({
            "text": h, "kind": "TABLE_CELL",
            "critical": True,
            "table": 0, "row": 0, "cell": hi,
            "polygon": [
                col_xs[hi], row_y, col_xs[hi] + col_widths[hi], row_y,
                col_xs[hi] + col_widths[hi], row_y + 32, col_xs[hi], row_y + 32
            ]
        })
    row_y += 32

    for ri, row_data in enumerate(rows_data):
        for ci in range(len(col_xs)):
            r = [col_xs[ci], row_y, col_xs[ci] + col_widths[ci], row_y + 32]
            draw.rectangle(r, outline=(180, 180, 180), width=1)
        for ci, cell_text in enumerate(row_data):
            bw = draw.textbbox((col_xs[ci] + 8, row_y + 4), cell_text, font=font)
            draw.text((col_xs[ci] + 8, row_y + 4), cell_text, font=font, fill=(0, 0, 0))
            blocks.append({
                "text": cell_text, "kind": "TABLE_CELL",
                "critical": True,
                "table": 0, "row": ri + 1, "cell": ci,
                "polygon": [
                    col_xs[ci], row_y, col_xs[ci] + col_widths[ci], row_y,
                    col_xs[ci] + col_widths[ci], row_y + 32, col_xs[ci], row_y + 32
                ]
            })
        row_y += 32

    _save("table", img, blocks)


def generate_mixed_pdf():
    img = Image.new("RGB", (PAGE_W, PAGE_H), "white")
    draw = ImageDraw.Draw(img)
    font = _font(16)
    bold = _font_bold(18)
    x, y = MARGIN, MARGIN
    blocks = []

    heading_text = "ACME SUPPLY CO. - Shipment Confirmation"
    bw = draw.textbbox((x, y), heading_text, font=bold)
    draw.text((x, y), heading_text, font=bold, fill=(0, 0, 0))
    blocks.append({
        "text": heading_text,
        "kind": "HEADING",
        "critical": False,
        "polygon": [bw[0], bw[1], bw[2], bw[1], bw[2], bw[3], bw[0], bw[3]],
    })
    y += 44

    section_heading = "Order PO-2026-0842"
    bw = draw.textbbox((x, y), section_heading, font=_font(16))
    draw.text((x, y), section_heading, font=_font(16), fill=(0, 0, 0))
    blocks.append({
        "text": section_heading,
        "kind": "HEADING",
        "critical": False,
        "polygon": [bw[0], bw[1], bw[2], bw[1], bw[2], bw[3], bw[0], bw[3]],
    })
    y += 40

    paras = [
        "This document confirms that the referenced purchase order has been fulfilled and the shipment is scheduled for delivery",
        "Order summary: 7 line items, total 186 units, gross weight approximately 42 kg",
    ]
    for para in paras:
        y, polygon = _draw_text_block(draw, x, y, para, font)
        blocks.append({
            "text": para,
            "kind": "PARAGRAPH",
            "critical": True,
            "polygon": polygon,
        })

    _save("mixed-pdf", img, blocks)


def main():
    FIXTURE_DIR.mkdir(parents=True, exist_ok=True)
    print("Generating synthetic OCR fixtures...")
    generate_clean_scan()
    generate_degraded_scan()
    generate_multi_column()
    generate_table()
    generate_mixed_pdf()
    print(f"Done. {len(list(FIXTURE_DIR.glob('*.png')))} images in {FIXTURE_DIR}/")


if __name__ == "__main__":
    main()
