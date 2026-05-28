"""Build the final match JSON from a Sportvisor PDF.

Pipeline:
  1. parse_team_tables.parse_all   -> 10 per-player tables
  2. parse_page1.parse              -> match metadata + team summary stats
  3. Resolve dynamic ID_MAP from data/players.json by (teamId, number)
  4. Assemble per-player records (ratings, radar, stats, minutes, names)
  5. Stub teamAggregates/maps/splits paths (real cropping done by crop_maps.py)
  6. Write match-XXX.json + log

Usage:
  python build_match.py <input.pdf> <output.json> <team_id> <match_id>

Strategy B for unknown numbers: raise with a clear error so the operator
fixes the roster before retrying.
"""
import argparse, json, logging, os, sys

# Allow running both from parsers/ and from root
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import parse_team_tables
import parse_page1
import parse_team_aggregates


def _maps_prefix():
    return os.environ.get("MAPS_PREFIX", "/assets/maps").rstrip("/")


def _formation(pdf_path, team_id):
    try:
        from aggregates import formation as _f
        return _f.parse(pdf_path, team_id)
    except Exception:
        return None
import parse_player_splits

LOG = logging.getLogger("parser.build")
DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "data")
DEFAULT_PLAYERS_JSON = os.path.join(DATA_DIR, "players.json")


def _players_json_path():
    # ROSTER_JSON env override — для multi-tenant upload (tmp file)
    return os.environ.get("ROSTER_JSON") or DEFAULT_PLAYERS_JSON


def load_team_roster(team_id):
    """Return {number_str -> player_dict} for the given team."""
    pj = _players_json_path()
    if not os.path.exists(pj):
        raise FileNotFoundError(f"Roster file missing: {pj}")
    data = json.load(open(pj, encoding="utf-8"))
    roster = {}
    for p in data.get("players", []):
        if p.get("teamId") != team_id:
            continue
        n = str(p.get("number", "")).zfill(2)
        roster[n] = p
        # also accept un-padded
        roster[str(p.get("number", ""))] = p
    return roster


def assemble_player(num, overall_row, tables, roster, match_id, team_id):
    """Build one player JSON entry compliant with golden schema.

    Если игрок №num не в ростере — генерим placeholder ID.
    """
    canonical_num = str(int(num)).zfill(2)
    roster_entry = roster.get(num) or roster.get(canonical_num)
    if not roster_entry:
        pid = f"pdf-{team_id}-n{canonical_num}"
        pdf_name = overall_row.get("name") or f"№{num}"
        roster_entry = {
            "id": pid, "fullName": pdf_name, "firstName": "", "lastName": pdf_name,
            "position": overall_row.get("position") or "", "positionFull": "",
            "_pdfOnly": True,
        }
    else:
        pid = roster_entry["id"]
    radar_keys = [
        "tackling", "positioning", "duels", "pressing",
        "distance", "intensity", "forwardPlay", "possession", "dribbling",
        "shooting", "setPiece", "defenceTotal", "fitnessTotal", "attackTotal",
        "speed", "goalkeeping",
    ]
    radar = {k: overall_row.get(k) for k in radar_keys}

    pdf_position = overall_row.get("position") or roster_entry.get("position") or ""

    return {
        "id": pid,
        "number": int(num),
        "fullName":  roster_entry.get("fullName") or "",
        "lastName":  roster_entry.get("lastName") or "",
        "firstName": roster_entry.get("firstName") or "",
        "shortName": overall_row.get("name") or "",
        "position":  pdf_position,
        "positionFull": roster_entry.get("positionFull") or "",
        "minutes": overall_row.get("minutes"),
        "ratings": {
            "overall": overall_row.get("overallIndex"),
            "fitness": overall_row.get("fitnessTotal"),
            "attack":  overall_row.get("attackTotal"),
            "defence": overall_row.get("defenceTotal"),
        },
        "radar": radar,
        "stats": {
            "fitness":  tables["fitness"].get(num)  or tables["fitness"].get(canonical_num)  or {},
            "attack1":  tables["attack1"].get(num)  or tables["attack1"].get(canonical_num)  or {},
            "attack2":  tables["attack2"].get(num)  or tables["attack2"].get(canonical_num)  or {},
            "attack3":  tables["attack3"].get(num)  or tables["attack3"].get(canonical_num)  or {},
            "attack4":  tables["attack4"].get(num)  or tables["attack4"].get(canonical_num)  or {},
            "attack5":  tables["attack5"].get(num)  or tables["attack5"].get(canonical_num)  or {},
            "defence1": tables["defence1"].get(num) or tables["defence1"].get(canonical_num) or {},
            "defence2": tables["defence2"].get(num) or tables["defence2"].get(canonical_num) or {},
            "defence3": tables["defence3"].get(num) or tables["defence3"].get(canonical_num) or {},
        },
        "splits": {},  # filled below if splits present
        "maps": {
            "attackMap":     f"{_maps_prefix()}/{match_id}-{pid}-attack-map.png",
            "fitnessHeatmap": f"{_maps_prefix()}/{match_id}-{pid}-heatmap.png",
        },
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("input_pdf")
    ap.add_argument("output_json")
    ap.add_argument("team_id")
    ap.add_argument("match_id")
    args = ap.parse_args()

    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")

    if not os.path.exists(args.input_pdf):
        raise SystemExit(f"PDF not found: {args.input_pdf}")

    LOG.info("Stage 1/4: page1 metadata")
    page1 = parse_page1.parse(args.input_pdf, args.team_id, args.match_id)

    LOG.info("Stage 2/4: team tables")
    tables = parse_team_tables.parse_all(args.input_pdf)

    LOG.info("Stage 3/4: team aggregates (best-effort)")
    try:
        aggregates = parse_team_aggregates.parse(args.input_pdf, args.match_id)
    except Exception as e:
        LOG.warning("aggregates failed: %s — using stub", e)
        aggregates = {}

    LOG.info("Stage 4/4: player splits (best-effort)")
    try:
        splits = parse_player_splits.parse(args.input_pdf, args.team_id)
    except Exception as e:
        LOG.warning("splits failed: %s — empty", e)
        splits = {}

    roster = load_team_roster(args.team_id)
    if not roster:
        raise SystemExit(
            f"Ростер для команды {args.team_id} пуст. Добавьте игроков "
            f"в players.json перед загрузкой."
        )

    players = []
    missing = []
    for num, ovr in tables["overall"].items():
        try:
            entry = assemble_player(num, ovr, tables, roster, args.match_id, args.team_id)
        except KeyError as e:
            missing.append(str(e))
            continue
        canonical = str(int(num)).zfill(2)
        s = splits.get(num) or splits.get(canonical) or {}
        entry["splits"] = s.get("splits") if isinstance(s, dict) and "splits" in s else (s if isinstance(s, dict) else {})
        players.append(entry)

    if missing:
        LOG.warning("Players не сматчены через fallback: %s", missing)

    # Sort by overall rating desc, like golden
    players.sort(key=lambda p: -(p["ratings"]["overall"] or 0))

    # Average ratings
    rs = [p["ratings"] for p in players if p["ratings"].get("overall")]
    def _avg(k):
        if not rs: return None
        return round(sum((r[k] or 0) for r in rs) / len(rs), 2)

    match = {
        "id": args.match_id,
        "date": page1.get("date") or "",
        "season": "2025-2026",
        "homeTeam": {
            "id": page1.get("homeTeamId") or args.team_id,
            "name": page1.get("homeTeam") or "",
            "isOurTeam": True,
        },
        "awayTeam": {
            "id": page1.get("awayTeamId"),
            "name": page1.get("awayTeam") or "",
            "isOurTeam": False,
        },
        "score": page1.get("score") or {"home": 0, "away": 0},
        "teamSummaryStats": {
            "home": page1.get("homeStats") or {},
            "away": page1.get("awayStats") or {},
        },
        "formation": _formation(args.input_pdf, args.team_id) or page1.get("formation"),
        "formationImage": f"{_maps_prefix()}/{args.match_id}-formation-map.png",
        "formationImageFull": f"{_maps_prefix()}/{args.match_id}-formation-full.png",
        "teamAggregates": aggregates,
        "players": players,
        "guestTeamPlaceholder": page1.get("guestTeamPlaceholder"),
        "source": {
            "file": os.path.basename(args.input_pdf),
            "tool": "Sportvisor",
        },
        "teamAvgRatings": {
            "overall": _avg("overall"),
            "fitness": _avg("fitness"),
            "attack":  _avg("attack"),
            "defence": _avg("defence"),
        },
        "teamId": args.team_id,
    }

    out_dir = os.path.dirname(os.path.abspath(args.output_json)) or "."
    os.makedirs(out_dir, exist_ok=True)
    tmp = args.output_json + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(match, f, ensure_ascii=False, indent=2)
    os.replace(tmp, args.output_json)
    LOG.info("WROTE %s (%d players)", args.output_json, len(players))
    print(f"OK match-id={args.match_id} team-id={args.team_id} players={len(players)}")


if __name__ == "__main__":
    main()
