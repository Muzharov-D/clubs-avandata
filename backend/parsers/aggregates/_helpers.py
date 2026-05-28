"""Shared helpers for aggregates parsers."""
import re


def flat(text):
    return re.sub(r"\s+", " ", text or "")


def _split_glued(combined, succ):
    for plen in (3, 2, 1):
        if len(combined) < plen:
            continue
        vstr = combined[:-plen] or "0"
        pstr = combined[-plen:]
        try:
            v, p = int(vstr), int(pstr)
        except ValueError:
            continue
        if 0 <= p <= 100:
            return {"value": v, "pct": p, "successful": succ}
    return None


def vps(label_alts, text):
    f = flat(text)
    for lab in label_alts:
        m = re.search(rf"{lab}[^\d]*?(\d+)\s+(\d+)%\s*(\d+)", f)
        if m:
            v, p, s = int(m.group(1)), int(m.group(2)), int(m.group(3))
            if 0 <= p <= 100:
                return {"value": v, "pct": p, "successful": s}
        m = re.search(rf"{lab}[^\d]*?(\d+)%\s*(\d+)", f)
        if m:
            r = _split_glued(m.group(1), int(m.group(2)))
            if r:
                return r
        m = re.search(rf"{lab}[^\d-]*(\d+)\b", f)
        if m:
            return {"value": int(m.group(1)), "pct": 0, "successful": 0}
    return None


def vps_before(label, text):
    """Find the LAST '<v> <pct>% <s>' triple BEFORE the label."""
    f = flat(text)
    idx = f.find(label)
    if idx < 0:
        return None
    region = f[:idx]
    matches = list(re.finditer(r"(\d+)\s+(\d+)%\s*(\d+)", region))
    if not matches:
        return None
    m = matches[-1]
    v, p, s = int(m.group(1)), int(m.group(2)), int(m.group(3))
    if 0 <= p <= 100:
        return {"value": v, "pct": p, "successful": s}
    return None


def num(label_alts, text, fallback=0):
    f = flat(text)
    for lab in label_alts:
        m = re.search(rf"{lab}[^\d-]*(-?\d+(?:[\.,]\d+)?)", f)
        if m:
            v = m.group(1).replace(",", ".")
            return float(v) if "." in v else int(v)
    return fallback


def zero():
    return {"value": 0, "pct": 0, "successful": 0}
