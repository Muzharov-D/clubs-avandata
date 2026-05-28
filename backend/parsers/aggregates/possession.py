"""Possession aggregate (page 14): counts and per-third splits."""
import re
from ._helpers import flat, num


def _third(label_alts, f):
    for lab in label_alts:
        ms = re.findall(rf"{lab}\s+(\d+)", f)
        if len(ms) >= 2:
            return int(ms[0]), int(ms[1])
    return 0, 0


def parse(text):
    f = flat(text)
    p1, l1 = _third([r"IN FIRST THIRD", r"В 1-Й ТРЕТИ"], f)
    p2, l2 = _third([r"IN SECOND THIRD", r"ВО 2-Й ТРЕТИ"], f)
    p3, l3 = _third([r"IN THIRD THIRD", r"В 3-Й ТРЕТИ"], f)
    return {
        "possessionsCount": num([r"POSSESSIONS \(CNT\)", r"ВЛАДЕНИЯ \(КОЛ-ВО\)"], text, 0),
        "losses":           num([r"LOSSES", r"ПОТЕРИ"], text, 0),
        "byThird": {
            "first":  {"possessions": p1, "losses": l1},
            "second": {"possessions": p2, "losses": l2},
            "third":  {"possessions": p3, "losses": l3},
        },
    }
