"""Attacks aggregate (page 16)."""
import re
from ._helpers import flat


def _first(label_alts, f):
    for lab in label_alts:
        m = re.search(rf"{lab}\s+(\d+)", f)
        if m:
            return int(m.group(1))
    return 0


def parse(text):
    f = flat(text)
    pos_count = _first([r"POSITIONAL ATTACKS", r"ПОЗИЦИОННЫЕ АТАКИ"], f)
    cnt_count = _first([r"COUNTERATTACKS", r"КОНТРАТАКИ"], f)
    ws = re.findall(r"(?:WITH SHOT|С УДАРОМ)\s+(\d+)", f)
    wg = re.findall(r"(?:WITH GOAL|С ГОЛОМ)\s+(\d+)", f)
    return {
        "positional":     {"count": pos_count, "withShot": int(ws[0]) if len(ws) >= 1 else 0, "withGoal": int(wg[0]) if len(wg) >= 1 else 0},
        "counterattacks": {"count": cnt_count, "withShot": int(ws[1]) if len(ws) >= 2 else 0, "withGoal": int(wg[1]) if len(wg) >= 2 else 0},
        "defenceBreakthroughs": _first([r"DEFENCE BREAKTHROUGHS", r"ПРОРЫВЫ ОБОРОНЫ"], f),
        "crossingMidfield":     _first([r"CROSSING MIDFIELD", r"ПЕРЕСЕЧЕНИЕ ЦЕНТРА"], f),
    }
