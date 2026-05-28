"""Parse Sportvisor page 1: match metadata + team summary stats.

Page 1 has a multi-column layout where labels (УГЛОВЫЕ/ШТРАФНЫЕ/ЖЕЛТЫЕ/КРАСНЫЕ etc.)
sit on one logical line and the numeric pair lives on the following line. We use
line-pairs to extract values reliably for Russian-language reports; English
reports (е.g. legacy 2010 PDF) follow the same anchor strategy.
"""
import re
import logging
from lib.pdf_extract import extract_page_text

LOG = logging.getLogger("parser.page1")

_TITLE_RE = re.compile(r"^(.+?)\s+(\d+):(\d+)\s+(.+)$")
_DATE_RE = re.compile(r"\b(\d{2}\.\d{2}\.\d{4})\b")
_NUM_TOKEN = re.compile(r"\d+(?:[\.,]\d+)?%?")  # 13, 13%, 2.5, 0.0, etc.


def _to_int(s):
    if s is None: return 0
    s = re.sub(r"[^\d-]", "", str(s))
    return int(s) if s and s != "-" else 0


def _to_float(s):
    if s is None: return 0.0
    try:
        return float(str(s).replace(",", "."))
    except ValueError:
        return 0.0


def _parse_pct(s):
    if s is None: return 0
    m = re.search(r"(\d+)\s*%", str(s))
    return int(m.group(1)) if m else 0


def _parse_pct_pair(text, label):
    line = next((l for l in text.split("\n") if label in l), None)
    if not line:
        return None, None
    m = re.search(rf"(\S+)\s+{label}\s+(\S+)", line)
    return (m.group(1), m.group(2)) if m else (None, None)


def _stats_for_side(text, anchor, side):
    line = next((l for l in text.split("\n") if anchor in l), None)
    if not line:
        return None
    parts = line.split(anchor)
    if len(parts) != 2:
        return None
    chunk = parts[0].strip().split() if side == "home" else parts[1].strip().split()
    return chunk


def _find_label_line(lines, *labels):
    """Return index of the first line containing any of the labels."""
    for i, l in enumerate(lines):
        if any(lbl in l for lbl in labels):
            return i
    return -1


def _nums_in(line, count=None):
    if not line: return []
    toks = _NUM_TOKEN.findall(line)
    return toks[:count] if count else toks


def _triple_below_label(lines, label_idx):
    """For a label-on-its-own-line ('УГЛОВЫЕ'), the next non-empty line carries
    `<h_total> <h_pct%> <h_succ> <a_total> <a_pct%> <a_succ>`.
    Returns (home_dict, away_dict) or (None, None)."""
    j = label_idx + 1
    while j < len(lines) and not lines[j].strip():
        j += 1
    if j >= len(lines):
        return None, None
    nums = _nums_in(lines[j], 6)
    if len(nums) < 6:
        return None, None
    return (
        {"total": _to_int(nums[0]), "accuracy": _parse_pct(nums[1]), "successful": _to_int(nums[2])},
        {"total": _to_int(nums[3]), "accuracy": _parse_pct(nums[4]), "successful": _to_int(nums[5])},
    )


def _resolve_away_team_id(name):
    import json, os
    teams_path = os.path.join(os.path.dirname(__file__), "..", "data", "teams.json")
    if not os.path.exists(teams_path):
        return None
    try:
        teams = json.load(open(teams_path, encoding="utf-8")).get("teams", [])
    except Exception:
        return None
    name = (name or "").strip()
    for t in teams:
        if t.get("name", "").strip() == name:
            return t["id"]
    return None


def parse(pdf_path, team_id, match_id):
    text = extract_page_text(pdf_path, 1)
    if not text:
        raise ValueError("Page 1 is empty")
    lines = text.split("\n")
    out = {"matchId": match_id, "homeStats": {}, "awayStats": {}, "formation": None}

    # --- Title / score ---
    first_line = next((l.strip() for l in lines if l.strip()), "")
    m = _TITLE_RE.match(first_line)
    if m:
        out["homeTeam"] = m.group(1).strip()
        out["awayTeam"] = m.group(4).strip()
        out["score"] = {"home": int(m.group(2)), "away": int(m.group(3))}
    else:
        out["homeTeam"] = ""; out["awayTeam"] = ""
        out["score"] = {"home": 0, "away": 0}

    md = _DATE_RE.search(text)
    if md:
        d, mo, y = md.group(1).split(".")
        out["date"] = f"{y}-{mo}-{d}"
    else:
        out["date"] = ""

    out["homeTeamId"] = team_id
    out["awayTeamId"] = _resolve_away_team_id(out["awayTeam"])

    # --- Possession ---
    home_poss, away_poss = _parse_pct_pair(text, "ВЛАДЕНИЕ")
    out["homeStats"]["possessionPct"] = _parse_pct(home_poss)
    out["awayStats"]["possessionPct"] = _parse_pct(away_poss)

    # --- Shots (УДАРЫ) — same line: '13 69% 9 УДАРЫ 11 36% 4' ---
    h = _stats_for_side(text, "УДАРЫ", "home")
    a = _stats_for_side(text, "УДАРЫ", "away")
    if h and len(h) >= 3:
        out["homeStats"]["shots"] = {"total": _to_int(h[-3]), "accuracy": _parse_pct(h[-2]), "onTarget": _to_int(h[-1])}
    else:
        out["homeStats"]["shots"] = {"total": 0, "accuracy": 0, "onTarget": 0}
    if a and len(a) >= 3:
        out["awayStats"]["shots"] = {"total": _to_int(a[0]), "accuracy": _parse_pct(a[1]), "onTarget": _to_int(a[2])}
    else:
        out["awayStats"]["shots"] = {"total": 0, "accuracy": 0, "onTarget": 0}

    # --- xG: two layouts.
    # 2010 EN: 'home_val\nОЖИДАЕМЫЕ\naway_val' (split above/below)
    # 2011 RU: 'ОЖИДАЕМЫЕ\nhome_val away_val\nГОЛЫ (xG)' (both on next line)
    xg_idx = _find_label_line(lines, "ОЖИДАЕМЫЕ")
    h_val = a_val = None
    if xg_idx >= 0:
        for j in range(xg_idx+1, min(len(lines), xg_idx+4)):
            line_j = lines[j].strip()
            m_pair = re.fullmatch(r"(\d+(?:[\.,]\d+)?)\s+(\d+(?:[\.,]\d+)?)", line_j)
            if m_pair:
                h_val, a_val = m_pair.group(1), m_pair.group(2)
                break
            if line_j and re.fullmatch(r"\d+(?:[\.,]\d+)?", line_j):
                a_val = line_j
                break
        if h_val is None:
            h_val = next((lines[i].strip() for i in range(xg_idx-1, max(-1, xg_idx-4), -1)
                          if re.fullmatch(r"\d+(?:[\.,]\d+)?", lines[i].strip())), None)
    out["homeStats"]["expectedGoals"] = _to_float(h_val)
    out["awayStats"]["expectedGoals"] = _to_float(a_val)

    # --- Passes (ПАСЫ / ПЕРЕДАЧИ) — same line ---
    h = _stats_for_side(text, "ПАСЫ", "home") or _stats_for_side(text, "ПЕРЕДАЧИ", "home")
    a = _stats_for_side(text, "ПАСЫ", "away") or _stats_for_side(text, "ПЕРЕДАЧИ", "away")
    if h and len(h) >= 3:
        out["homeStats"]["passes"] = {"total": _to_int(h[-3]), "accuracy": _parse_pct(h[-2]), "successful": _to_int(h[-1])}
    else:
        out["homeStats"]["passes"] = {"total": 0, "accuracy": 0, "successful": 0}
    if a and len(a) >= 3:
        out["awayStats"]["passes"] = {"total": _to_int(a[0]), "accuracy": _parse_pct(a[1]), "successful": _to_int(a[2])}
    else:
        out["awayStats"]["passes"] = {"total": 0, "accuracy": 0, "successful": 0}

    # --- Free kick shots (ШТРАФНЫЕ): label on its own line, numbers below ---
    fk_idx = _find_label_line(lines, "ШТРАФНЫЕ")
    if fk_idx >= 0:
        # First, check if there's also "УДАРЫ" near (full label is "ШТРАФНЫЕ УДАРЫ")
        # Look at next 3 non-empty lines for two leading integers
        h_fk = a_fk = 0
        for j in range(fk_idx+1, min(len(lines), fk_idx+5)):
            nums = _nums_in(lines[j], 2)
            if len(nums) >= 2 and all("." not in n and "%" not in n for n in nums[:2]):
                h_fk, a_fk = _to_int(nums[0]), _to_int(nums[1])
                break
        out["homeStats"]["freeKickShots"] = h_fk
        out["awayStats"]["freeKickShots"] = a_fk
    else:
        out["homeStats"]["freeKickShots"] = 0
        out["awayStats"]["freeKickShots"] = 0

    # --- Corners (УГЛОВЫЕ): label on its own line, numbers (3+3) below ---
    co_idx = _find_label_line(lines, "УГЛОВЫЕ")
    if co_idx >= 0:
        h_corn, a_corn = _triple_below_label(lines, co_idx)
        out["homeStats"]["corners"] = h_corn or {"total": 0, "accuracy": 0, "successful": 0}
        out["awayStats"]["corners"] = a_corn or {"total": 0, "accuracy": 0, "successful": 0}
    else:
        out["homeStats"]["corners"] = {"total": 0, "accuracy": 0, "successful": 0}
        out["awayStats"]["corners"] = {"total": 0, "accuracy": 0, "successful": 0}

    # --- Fouls (НАРУШЕНИЯ) and offsides (ОФСАЙДЫ) — same line ---
    for label, key in [("НАРУШЕНИЯ", "fouls"), ("ОФСАЙДЫ", "offsides")]:
        h2, a2 = _parse_pct_pair(text, label)
        if h2 is None:
            line = next((l for l in lines if label in l), "")
            nums = re.findall(r"\d+", line)
            if len(nums) >= 2:
                h2, a2 = nums[0], nums[1]
        out["homeStats"][key] = _to_int(h2)
        out["awayStats"][key] = _to_int(a2)

    # --- Yellow / red cards: label "ЖЕЛТЫЕ" / "КРАСНЫЕ" on own line, numbers on following line ---
    yc_idx = _find_label_line(lines, "ЖЕЛТЫЕ")
    if yc_idx >= 0:
        h_yc = a_yc = 0
        for j in range(yc_idx+1, min(len(lines), yc_idx+4)):
            nums = _nums_in(lines[j], 2)
            if len(nums) >= 2 and all("." not in n and "%" not in n for n in nums[:2]):
                h_yc, a_yc = _to_int(nums[0]), _to_int(nums[1])
                break
        out["homeStats"]["yellowCards"] = h_yc
        out["awayStats"]["yellowCards"] = a_yc
    else:
        out["homeStats"]["yellowCards"] = 0
        out["awayStats"]["yellowCards"] = 0

    rc_idx = _find_label_line(lines, "КРАСНЫЕ")
    if rc_idx >= 0:
        h_rc = a_rc = 0
        for j in range(rc_idx+1, min(len(lines), rc_idx+4)):
            nums = _nums_in(lines[j], 2)
            if len(nums) >= 2 and all("." not in n and "%" not in n for n in nums[:2]):
                h_rc, a_rc = _to_int(nums[0]), _to_int(nums[1])
                break
        out["homeStats"]["redCards"] = h_rc
        out["awayStats"]["redCards"] = a_rc
    else:
        out["homeStats"]["redCards"] = 0
        out["awayStats"]["redCards"] = 0

    if "Нет данных об игроках команды" in text:
        out["guestTeamPlaceholder"] = (
            "Нет данных об игроках команды. Пожалуйста, укажите данные об игроках "
            "и их позициях для отображения схемы команды и расчёта точных рейтингов "
            "игроков по матчу"
        )
    return out


if __name__ == "__main__":
    import argparse, json
    ap = argparse.ArgumentParser()
    ap.add_argument("pdf"); ap.add_argument("output_json")
    ap.add_argument("team_id"); ap.add_argument("match_id")
    args = ap.parse_args()
    out = parse(args.pdf, args.team_id, args.match_id)
    with open(args.output_json, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)
    print(f"OK score={out.get('score')} date={out.get('date')}")
