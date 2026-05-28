"""crop_maps.py — render team-level Sportvisor pages as PNG heatmaps.

Each Sportvisor PDF has 9 team-aggregate pages (12-20):
  p12 shooting  | p13 setPieces  | p14 possession | p15 passes
  p16 attacks   | p17 recoveriesAndTackling
  p18 duels     | p19 pressing   | p20 positioning

For each page we crop ONLY the heatmap/chart region (not the full page),
using the embedded page-image bbox as anchor (with a small margin) when
present, and falling back to the right-half chart area for pages without
an image (p14 — possession bars).

Two output sizes per section:
  -map.png   thumbnail for match-detail cards   (200 DPI)
  -full.png  high-res for lightbox              (300 DPI)

Output naming aligned with match.json mapImage paths:
  match-XXX-team-shooting-map.png  / -shooting-full.png
  match-XXX-team-set-pieces-map.png / ...
"""
import argparse, os, sys
import pdfplumber

PAGES = [
    (12, "shooting"),
    (13, "set-pieces"),
    (14, "possession"),
    (15, "passes"),
    (16, "attacks"),
    (17, "recoveries"),
    (18, "duels"),
    (19, "pressing"),
    (20, "positioning"),
]

# Margin around embedded image bbox to capture point markers + axis labels
MARGIN_X = 28
MARGIN_Y = 28


def heatmap_bbox(page):
    """Return (x0, top, x1, bottom) for the heatmap/chart on this page."""
    if page.images:
        img = max(page.images, key=lambda i: (i["x1"] - i["x0"]) * (i["bottom"] - i["top"]))
        return (
            max(0, img["x0"] - MARGIN_X),
            max(0, img["top"] - MARGIN_Y),
            min(page.width, img["x1"] + MARGIN_X),
            min(page.height, img["bottom"] + MARGIN_Y),
        )
    # Pages without image (e.g. possession) — bars are in the right half.
    return (440, 130, page.width - 30, 460)


def render(pdf_path, out_dir, match_id, dpi_thumb=200, dpi_full=300):
    os.makedirs(out_dir, exist_ok=True)
    saved = []
    with pdfplumber.open(pdf_path) as pdf:
        for pn, slug in PAGES:
            if pn > len(pdf.pages):
                print(f"  WARN: PDF has only {len(pdf.pages)} pages, skipping p{pn}", file=sys.stderr)
                continue
            page = pdf.pages[pn - 1]
            bbox = heatmap_bbox(page)
            cropped = page.crop(bbox)
            for variant, dpi in [("map", dpi_thumb), ("full", dpi_full)]:
                out = os.path.join(out_dir, f"{match_id}-team-{slug}-{variant}.png")
                cropped.to_image(resolution=dpi).save(out, format="PNG")
                saved.append(out)
    return saved


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("pdf"); ap.add_argument("maps_dir"); ap.add_argument("match_id")
    args = ap.parse_args()
    saved = render(args.pdf, args.maps_dir, args.match_id)
    print(f"crop_maps OK: {len(saved)} files written to {args.maps_dir}")


if __name__ == "__main__":
    main()
