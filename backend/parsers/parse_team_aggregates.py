"""Team aggregates parser (v2): real numeric extraction.

Delegates each section to a small per-section module under aggregates/.
Each module is < 1.5 KB to avoid the FS-truncation issue on the workspace
mount. mapImage path is built from MAPS_PREFIX env (default /assets/maps).
On Render set MAPS_PREFIX=/api/maps so files served from /var/data/maps.
"""
import os
from lib.pdf_extract import extract_page_text
from aggregates import shooting, set_pieces, possession, passes
from aggregates import attacks, recoveries, duels, pressing, positioning

SECTIONS = [
    ("shooting",              12, shooting.parse,    "shooting"),
    ("setPieces",             13, set_pieces.parse,  "set-pieces"),
    ("possession",            14, possession.parse,  "possession"),
    ("passes",                15, passes.parse,      "passes"),
    ("attacks",               16, attacks.parse,     "attacks"),
    ("recoveriesAndTackling", 17, recoveries.parse,  "recoveries"),
    ("duels",                 18, duels.parse,       "duels"),
    ("pressing",              19, pressing.parse,    "pressing"),
    ("positioning",           20, positioning.parse, "positioning"),
]


def parse(pdf_path, match_id):
    prefix = os.environ.get("MAPS_PREFIX", "/assets/maps").rstrip("/")
    out = {}
    for key, page_num, parser, slug in SECTIONS:
        text = extract_page_text(pdf_path, page_num)
        try:
            section = parser(text) if text else {}
        except Exception:
            section = {}
        section["mapImage"] = f"{prefix}/{match_id}-team-{slug}-map.png"
        out[key] = section
    return out


if __name__ == "__main__":
    import argparse, json
    ap = argparse.ArgumentParser()
    ap.add_argument("pdf"); ap.add_argument("match_id")
    args = ap.parse_args()
    print(json.dumps(parse(args.pdf, args.match_id), ensure_ascii=False, indent=2))
