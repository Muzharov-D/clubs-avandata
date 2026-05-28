"""Player splits orchestrator: maps p21+ pages to player IDs and extracts splits.

Uses aggregates.splits.parse_player on each player page found via header anchor.
Returns {<num>: {"splits": <dict>}} compatible with build_match.py's existing flow.
"""
import json, os, re
import pdfplumber
from aggregates.splits import parse_player

ROSTER = os.path.join(os.path.dirname(__file__), "..", "data", "players.json")
HEADER_RE = re.compile(r"Player\s+Stats\s*[\u2013\u2014\-]\s*(.+?)\s*$")


def _roster_by_num(team_id):
    if not os.path.exists(ROSTER):
        return {}
    try:
        d = json.load(open(ROSTER, encoding="utf-8"))
    except Exception:
        return {}
    return {p["number"]: p for p in d.get("players", []) if p.get("teamId") == team_id}


def _match_name(name, roster_by_num):
    name = (name or "").strip()
    if not name:
        return None
    parts = name.split()
    for n, p in roster_by_num.items():
        full = (p.get("fullName") or "").strip()
        if full == name or full == f"{parts[-1]} {parts[0]}" if len(parts) == 2 else False:
            return n
    if len(parts) == 2:
        last1, first1 = parts
        for n, p in roster_by_num.items():
            ln = (p.get("lastName") or "").strip()
            fn = (p.get("firstName") or "").strip()
            if (ln == last1 and fn == first1) or (ln == first1 and fn == last1):
                return n
    return None


def parse(pdf_path, team_id=None):
    """Return {str(num): {"splits": dict, ...}}"""
    if not team_id:
        return {}
    rby = _roster_by_num(team_id)
    out = {}
    seen = set()
    with pdfplumber.open(pdf_path) as pdf:
        for pn in range(21, len(pdf.pages) + 1):
            page = pdf.pages[pn - 1]
            text = page.extract_text() or ""
            first = next((l for l in text.split("\n") if l.strip()), "")
            m = HEADER_RE.search(first)
            if not m:
                continue
            num = _match_name(m.group(1), rby)
            if not num or num in seen:
                continue
            seen.add(num)
            sp = parse_player(text)
            if sp:
                out[str(num).zfill(2)] = {"splits": sp}
                out[str(num)] = {"splits": sp}
    return out
