"""Per-player splits parser (M / 1 time / 2 time)."""
import re
from ._splits_keys import SPLITS_KEYS

_KEYS_BY_LEN = sorted(SPLITS_KEYS, key=len, reverse=True)
_VAL = r"(\d+(?:\.\d+)?%?)"


def _parse_val(s):
    if s is None:
        return 0
    s = s.strip()
    if s.endswith("%"):
        try:
            return {"pct": int(s[:-1])}
        except ValueError:
            return {"pct": 0}
    try:
        return int(s) if "." not in s else float(s)
    except ValueError:
        return 0


def parse_player(text):
    """Take a flattened player-page text, return splits dict ordered by golden."""
    flat = re.sub(r"\s+", " ", text or "")
    out = {}
    for key in _KEYS_BY_LEN:
        if key in out:
            continue
        pat = rf"(?<![\w&]){re.escape(key)}\s+{_VAL}\s+{_VAL}\s+{_VAL}"
        m = re.search(pat, flat)
        if m:
            out[key] = {
                "match":  _parse_val(m.group(1)),
                "first":  _parse_val(m.group(2)),
                "second": _parse_val(m.group(3)),
            }
    return {k: out[k] for k in SPLITS_KEYS if k in out}
