"""crop_player_maps.py — render per-player heatmap & attack-map crops.

Player pages start at p21+ in the PDF. Each page header contains:
  "<date> <home> <score> <away> Player Stats – <Имя> <Фамилия>"

We map header names to player.id via players.json (matched by teamId,
and by either "first last" or "last first" name order).

Each player page has 6 images:
  - 3 small icon-sized images at the top (section icons)
  - 3 medium images (~95×142):
      img0 (top-centre, near y=77)  : radar chart
      img1 (right-bottom, near y=386): defence/positioning heatmap
      img2 (left-bottom, near y=395) : attack heatmap

We crop only img1 and img2 (with margin) to get clean tactical maps:
  match-XXX-<player-id>-attack-map.png  <- left-bottom field
  match-XXX-<player-id>-heatmap.png     <- right-bottom field
"""
import argparse, json, os, re, sys
import pdfplumber

PARSERS_DIR = os.path.dirname(os.path.abspath(__file__))
PLAYERS_JSON = os.path.join(PARSERS_DIR, "..", "data", "players.json")

HEADER_RE = re.compile(r"Player\s+Stats\s*[\u2013\u2014\-]\s*(.+?)\s*$")

# Margin to capture point markers + axis labels around each image.
MX = 20
MY = 20


def load_roster(team_id):
    if not os.path.exists(PLAYERS_JSON):
        return []
    data = json.load(open(PLAYERS_JSON, encoding="utf-8"))
    return [p for p in data.get("players", []) if p.get("teamId") == team_id]


def match_player_by_name(name, roster):
    name = (name or "").strip()
    if not name:
        return None
    for p in roster:
        if (p.get("fullName") or "").strip() == name:
            return p
    parts = name.split()
    if len(parts) == 2:
        swapped = f"{parts[1]} {parts[0]}"
        for p in roster:
            if (p.get("fullName") or "").strip() == swapped:
                return p
    if parts:
        for p in roster:
            if (p.get("lastName") or "").strip() == parts[0]:
                return p
        for p in roster:
            if (p.get("firstName") or "").strip() == parts[0]:
                return p
    return None


def _safe_bbox(img, page, mx=MX, my=MY):
    return (
        max(0, img["x0"] - mx),
        max(0, img["top"] - my),
        min(page.width, img["x1"] + mx),
        min(page.height, img["bottom"] + my),
    )


def render(pdf_path, out_dir, match_id, team_id):
    os.makedirs(out_dir, exist_ok=True)
    roster = load_roster(team_id)
    if not roster:
        print(f"  WARN: empty roster for {team_id}", file=sys.stderr)
        return []

    saved = []
    seen = set()
    with pdfplumber.open(pdf_path) as pdf:
        for pn in range(21, len(pdf.pages) + 1):
            page = pdf.pages[pn - 1]
            text = page.extract_text() or ""
            first = next((l for l in text.split("\n") if l.strip()), "")
            m = HEADER_RE.search(first)
            if not m:
                continue
            name = m.group(1).strip()
            player = match_player_by_name(name, roster)
            if not player:
                print(f"  p{pn}: no roster match for {name!r}", file=sys.stderr)
                continue
            pid = player["id"]
            if pid in seen:
                continue
            seen.add(pid)

            medium = sorted(
                [i for i in page.images if (i["x1"] - i["x0"]) > 60],
                key=lambda i: (i["top"], i["x0"]),
            )
            # Expect: [radar (top), defence (right-bottom), attack (left-bottom)]
            # Sort by (y, x): top → right-bottom → left-bottom (since right has bigger x)
            # Actually y=386 then y=395 — both bottom. Distinguish by x:
            #   small x => attack   (left)
            #   large x => heatmap  (right)
            attack_img = None
            heat_img = None
            for img in medium:
                if img["top"] > 300:  # bottom row
                    if img["x0"] < page.width / 2:
                        attack_img = img
                    else:
                        heat_img = img

            if attack_img:
                bbox = _safe_bbox(attack_img, page)
                out = os.path.join(out_dir, f"{match_id}-{pid}-attack-map.png")
                page.crop(bbox).to_image(resolution=200).save(out, format="PNG")
                page.crop(bbox).to_image(resolution=300).save(
                    os.path.join(out_dir, f"{match_id}-{pid}-attack-map-full.png"),
                    format="PNG",
                )
                saved.append(out)
            if heat_img:
                bbox = _safe_bbox(heat_img, page)
                out = os.path.join(out_dir, f"{match_id}-{pid}-heatmap.png")
                page.crop(bbox).to_image(resolution=200).save(out, format="PNG")
                page.crop(bbox).to_image(resolution=300).save(
                    os.path.join(out_dir, f"{match_id}-{pid}-heatmap-full.png"),
                    format="PNG",
                )
                saved.append(out)

    return saved


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("pdf")
    ap.add_argument("maps_dir")
    ap.add_argument("match_id")
    ap.add_argument("team_id", nargs="?", default=None)
    args = ap.parse_args()
    if not args.team_id:
        print("crop_player_maps: team_id is required", file=sys.stderr)
        return 1
    saved = render(args.pdf, args.maps_dir, args.match_id, args.team_id)
    print(f"crop_player_maps OK: {len(saved)} unique-area files for {args.team_id}")


if __name__ == "__main__":
    main()
