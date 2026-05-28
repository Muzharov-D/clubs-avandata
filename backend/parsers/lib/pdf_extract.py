"""Low-level pdfplumber helpers shared by Sportvisor parsers."""
import os
import re
import logging

import pdfplumber

LOG = logging.getLogger("parser.pdf_extract")


def extract_page_texts(pdf_path):
    """Return list of (page_index_1based, text) tuples for the whole PDF."""
    out = []
    with pdfplumber.open(pdf_path) as pdf:
        for i, page in enumerate(pdf.pages, 1):
            out.append((i, page.extract_text() or ""))
    return out


def extract_page_text(pdf_path, page_num):
    with pdfplumber.open(pdf_path) as pdf:
        if page_num < 1 or page_num > len(pdf.pages):
            return ""
        return pdf.pages[page_num - 1].extract_text() or ""


def extract_text_blocks(pdf_path):
    """Return [{page, x0, y0, x1, y1, text}] using pdfplumber word-level detection."""
    blocks = []
    with pdfplumber.open(pdf_path) as pdf:
        for i, page in enumerate(pdf.pages, 1):
            words = page.extract_words(keep_blank_chars=False) or []
            for w in words:
                blocks.append({
                    "page": i,
                    "x0": w["x0"], "y0": w["top"],
                    "x1": w["x1"], "y1": w["bottom"],
                    "text": w["text"],
                })
    return blocks


def render_page_png(pdf_path, page_num, out_path, resolution=200):
    """Render one page to PNG. Used by crop_maps."""
    os.makedirs(os.path.dirname(out_path) or ".", exist_ok=True)
    with pdfplumber.open(pdf_path) as pdf:
        if page_num < 1 or page_num > len(pdf.pages):
            return False
        page = pdf.pages[page_num - 1]
        page.to_image(resolution=resolution).save(out_path, format="PNG")
    return True


def render_all_pages(pdf_path, out_dir, resolution=200):
    """Render every page as p-N.png in out_dir."""
    os.makedirs(out_dir, exist_ok=True)
    saved = 0
    with pdfplumber.open(pdf_path) as pdf:
        for i, page in enumerate(pdf.pages, 1):
            out = os.path.join(out_dir, f"p-{i}.png")
            page.to_image(resolution=resolution).save(out, format="PNG")
            saved += 1
    return saved


_PCT_RE = re.compile(r"^(\d+(?:[\.,]\d+)?)\s*\((\d+)%\)$")


def parse_value_with_pct(s):
    """Parse '13 (69%)' -> {value:13, pct:69}; '8.4' -> {value:8.4, pct:null}; '0' -> {value:0, pct:null}."""
    if s is None:
        return {"value": 0, "pct": None}
    s = str(s).strip()
    if s == "" or s == "-":
        return {"value": 0, "pct": None}
    m = _PCT_RE.match(s)
    if m:
        v = m.group(1).replace(",", ".")
        v = float(v) if "." in v else int(v)
        return {"value": v, "pct": int(m.group(2))}
    if re.match(r"^-?\d+$", s):
        return {"value": int(s), "pct": None}
    if re.match(r"^-?\d+[\.,]\d+$", s):
        return {"value": float(s.replace(",", ".")), "pct": None}
    return {"value": s, "pct": None}


def parse_number(s):
    """Plain numeric token: int / float / None."""
    if s is None:
        return None
    s = str(s).strip()
    if s == "" or s == "-":
        return None
    if re.match(r"^-?\d+$", s):
        return int(s)
    if re.match(r"^-?\d+[\.,]\d+$", s):
        return float(s.replace(",", "."))
    return s


_RU_NUMBER_RE = re.compile(r"^(\d{1,3}(?:[\s ]\d{3})*)(?:[,\.](\d+))?$")


def parse_ru_number(s):
    """Russian formatted number: '1 234,5' -> 1234.5; '1234' -> 1234."""
    if s is None:
        return None
    s = str(s).strip()
    m = _RU_NUMBER_RE.match(s)
    if not m:
        return parse_number(s)
    intpart = re.sub(r"[\s ]", "", m.group(1))
    if m.group(2):
        return float(f"{intpart}.{m.group(2)}")
    return int(intpart)


_TOKEN_RE = re.compile(r"(\d+(?:[\.,]\d+)?\s*\(\d+%\))|(\d+(?:[\.,]\d+)?%)|(\d+(?:[\.,]\d+)?)|(\S+)")


def split_row_tokens(rest_text):
    """Split a row remainder into atomic tokens.

    Handles forms like '13 (69%)', '8.4', '0', '11778.00', '50%'.
    """
    tokens = []
    for m in _TOKEN_RE.finditer(rest_text):
        if m.group(1) is not None:
            tokens.append(re.sub(r"\s+", " ", m.group(1)))
        elif m.group(2) is not None:
            tokens.append(m.group(2))
        elif m.group(3) is not None:
            tokens.append(m.group(3))
        else:
            tokens.append(m.group(4))
    return tokens
