"""Formation parser (page 1) — starters + substitutes from bold jersey numbers."""
import json, os, re
import pdfplumber

ROSTER = os.path.join(os.path.dirname(__file__), "..", "..", "data", "players.json")
_B2 = re.compile(r"^(\d)\1{4}(\d)\2{4}$")
_B1 = re.compile(r"^(\d)\1{4}$")
_INI = re.compile(r"^[А-ЯЁ]\.$")
_LAST = re.compile(r"^[А-ЯЁ][а-яё]+$")
_R = re.compile(r"^\d\.\d$")


def _dec(s):
    m = _B2.match(s)
    if m: return int(m.group(1) + m.group(2))
    m = _B1.match(s)
    return int(m.group(1)) if m else None


def _roster(team_id):
    try:
        d = json.load(open(ROSTER, encoding="utf-8"))
    except Exception:
        return {}
    return {p["number"]: p for p in d.get("players", []) if p.get("teamId") == team_id}


def parse(pdf_path, team_id):
    with pdfplumber.open(pdf_path) as pdf:
        ws = pdf.pages[0].extract_words(keep_blank_chars=False)
    bold = [{"n": _dec(w["text"]), "x": w["x0"], "y": w["top"]} for w in ws if _dec(w["text"]) is not None]
    if not bold:
        return None
    inis = [w for w in ws if _INI.match(w["text"])]
    lasts = [w for w in ws if _LAST.match(w["text"]) and len(w["text"]) > 2]
    rats = [{"v": float(w["text"]), "x": w["x0"], "y": w["top"]} for w in ws if _R.match(w["text"])]
    pairs = []
    for i in inis:
        c = [l for l in lasts if abs(l["top"] - i["top"]) < 3 and l["x0"] > i["x0"] and l["x0"] - i["x1"] < 8]
        if c:
            l = min(c, key=lambda x: x["x0"] - i["x1"])
            pairs.append({"s": f"{i['text']} {l['text']}", "x": i["x0"], "y": i["top"]})
    rby = _roster(team_id)
    out = []
    for b in bold:
        nm = [p for p in pairs if 5 < p["y"] - b["y"] < 22 and abs(p["x"] - b["x"]) < 35]
        # pick closest by X first, then by Y
        short = min(nm, key=lambda p: (abs(p["x"] - b["x"]), p["y"] - b["y"]))["s"] if nm else None
        rp = rby.get(b["n"])
        if rp:
            fn, ln = rp.get("firstName", ""), rp.get("lastName", "")
            expected = f"{fn[0]}. {ln}" if fn and ln else None
            if expected and short != expected:
                short = expected
        ry = [r for r in rats if 5 < r["y"] - b["y"] < 35 and abs(r["x"] - b["x"]) < 35]
        out.append({"number": b["n"], "shortName": short, "rating": ry[0]["v"] if ry else None, "y": b["y"]})
    starters = [{k: v for k, v in p.items() if k != "y"} for p in out if p["y"] < 340]
    subs = [{k: v for k, v in p.items() if k != "y"} for p in out if p["y"] >= 340]
    return {"starters": starters, "substitutes": subs} if starters else None
