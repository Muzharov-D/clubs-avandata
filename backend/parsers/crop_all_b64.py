"""crop_all_b64.py — извлекает ВСЕ карты из SportVisor PDF и возвращает JSON
с base64-encoded PNG (data URL ready для frontend <img src>).

Без записи на диск (Render ephemeral) — всё в память → JSON.

Output JSON структура:
  {
    "teamMaps": {
      "shooting":   "data:image/png;base64,...",
      "set-pieces": "data:image/png;base64,...",
      "possession": "...",
      "passes":     "...",
      "attacks":    "...",
      "recoveries": "...",
      "duels":      "...",
      "pressing":   "...",
      "positioning":"..."
    },
    "formationImage": "data:image/png;base64,...",
    "playerMaps": {
      "<player-id>": {
        "attackMap": "data:image/png;base64,...",
        "heatmap":   "data:image/png;base64,..."
      },
      ...
    }
  }

Усл-я:
  - PDF большой → cropпим только thumbnails (200 DPI), не -full (300 DPI), чтобы
    база/payload не разбух (~30KB per image × ~50 images = ~1.5MB per матч).
  - Если crop падает на странице — продолжаем для остальных (best-effort).

Usage:
  python crop_all_b64.py <pdf> <match_id> <team_id> <output.json>

Roster source: env var ROSTER_JSON (как у build_match.py) или fallback на data/players.json.
"""
import argparse, base64, io, json, os, re, sys
import pdfplumber

# Командные страницы — те же 9 что в crop_maps.py
TEAM_PAGES = [
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

# Формация — обычно страница 3 или 4 в Zenit-формате (надо найти эвристикой:
# страница с одним большим image без таблицы рейтингов)
FORMATION_PAGE_CANDIDATES = [3, 4, 5]

HEADER_RE = re.compile(r"Player\s+Stats\s*[–—\-]\s*(.+?)\s*$")

MARGIN_X = 28
MARGIN_Y = 28
PLAYER_MARGIN = 20
THUMB_DPI = 200


def _safe_bbox(x0, top, x1, bottom, page, mx=MARGIN_X, my=MARGIN_Y):
    return (
        max(0, x0 - mx),
        max(0, top - my),
        min(page.width, x1 + mx),
        min(page.height, bottom + my),
    )


def _crop_b64(page, bbox, dpi=THUMB_DPI):
    """Crop bbox from page, return base64 data URL (PNG)."""
    img = page.crop(bbox).to_image(resolution=dpi)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    b64 = base64.b64encode(buf.getvalue()).decode("ascii")
    return f"data:image/png;base64,{b64}"


def _team_bbox(page):
    """Largest image на странице — но только если она достаточно большая,
    чтобы быть реальной картой/диаграммой, а не логотипом или axis-tick'ом.
    Возвращает None если ничего подходящего нет (вместо guess fallback'а,
    который кропал случайный регион → пустые карточки на frontend).
    """
    if not page.images:
        return None
    # Кандидаты — только медиум+ изображения (не иконки/логотипы/axis-ticks).
    # 180×120 — эмпирически достаточно чтобы захватить реальный chart canvas.
    candidates = [
        i for i in page.images
        if (i["x1"] - i["x0"]) >= 180 and (i["bottom"] - i["top"]) >= 120
    ]
    if not candidates:
        return None
    # Карта поля — ПОРТРЕТ (выше, чем шире; реально ≈520×728px, AR w/h≈0.71).
    # На страницах-дашбордах самый большой image — широкий bar-chart: по площади
    # он выигрывал и давал landscape-«обрезок таблицы» (мусор, который frontend
    # потом скрывал → пустая карточка). Берём только портретные кандидаты
    # (h >= 1.15×w); если их нет — на странице нет карты поля, возвращаем None.
    portrait = [
        i for i in candidates
        if (i["bottom"] - i["top"]) >= 1.15 * (i["x1"] - i["x0"])
    ]
    if not portrait:
        return None
    img = max(portrait, key=lambda i: (i["x1"] - i["x0"]) * (i["bottom"] - i["top"]))
    return _safe_bbox(img["x0"], img["top"], img["x1"], img["bottom"], page)


def crop_team_maps(pdf):
    out = {}
    for pn, slug in TEAM_PAGES:
        if pn > len(pdf.pages):
            continue
        try:
            page = pdf.pages[pn - 1]
            bbox = _team_bbox(page)
            if bbox is None:
                # Страница без реального chart canvas — пропускаем, чтобы на
                # frontend'е не появилась карточка с осями без данных.
                print(f"  skip team map p{pn} ({slug}): no usable image", file=sys.stderr)
                continue
            out[slug] = _crop_b64(page, bbox)
        except Exception as e:
            print(f"  WARN: team map p{pn} ({slug}) failed: {e}", file=sys.stderr)
    return out


def crop_formation(pdf):
    """Эвристика: ищем страницу с одним большим image и текстом "Стартовый состав"
    или "Formation" или просто 4-3-3 в первой строке.
    """
    for pn in FORMATION_PAGE_CANDIDATES:
        if pn > len(pdf.pages):
            continue
        try:
            page = pdf.pages[pn - 1]
            text = (page.extract_text() or "").lower()
            looks_like_formation = (
                "стартов" in text or "состав" in text or
                "formation" in text or
                re.search(r"\b\d-\d-\d(-\d)?\b", text)  # 4-3-3, 4-2-3-1
            )
            big_imgs = [i for i in page.images if (i["x1"] - i["x0"]) > 200 and (i["bottom"] - i["top"]) > 200]
            if looks_like_formation and big_imgs:
                img = max(big_imgs, key=lambda i: (i["x1"] - i["x0"]) * (i["bottom"] - i["top"]))
                bbox = _safe_bbox(img["x0"], img["top"], img["x1"], img["bottom"], page)
                return _crop_b64(page, bbox)
        except Exception as e:
            print(f"  WARN: formation p{pn} failed: {e}", file=sys.stderr)
    return None


def load_roster(team_id):
    pj = os.environ.get("ROSTER_JSON") or os.path.join(
        os.path.dirname(__file__), "..", "data", "players.json"
    )
    if not os.path.exists(pj):
        return []
    data = json.load(open(pj, encoding="utf-8"))
    return [p for p in data.get("players", []) if p.get("teamId") == team_id]


def match_player_by_name(name, roster):
    n = (name or "").strip()
    if not n:
        return None
    for p in roster:
        if (p.get("fullName") or "").strip() == n:
            return p
    parts = n.split()
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


def crop_player_maps(pdf, team_id):
    """Per-player attack & heatmap crops от p21+."""
    roster = load_roster(team_id)
    out = {}
    if not roster:
        print(f"  WARN: empty roster for {team_id}", file=sys.stderr)
        return out

    for pn in range(21, len(pdf.pages) + 1):
        try:
            page = pdf.pages[pn - 1]
            text = page.extract_text() or ""
            first = next((l for l in text.split("\n") if l.strip()), "")
            m = HEADER_RE.search(first)
            if not m:
                continue
            name = m.group(1).strip()
            player = match_player_by_name(name, roster)
            if not player:
                continue
            pid = player["id"]
            if pid in out:
                continue

            medium = sorted(
                [i for i in page.images if (i["x1"] - i["x0"]) > 60],
                key=lambda i: (i["top"], i["x0"]),
            )
            attack_img = None
            heat_img = None
            for img in medium:
                if img["top"] > 300:  # bottom row
                    if img["x0"] < page.width / 2:
                        attack_img = img
                    else:
                        heat_img = img

            entry = {}
            if attack_img:
                bbox = _safe_bbox(attack_img["x0"], attack_img["top"],
                                  attack_img["x1"], attack_img["bottom"],
                                  page, mx=PLAYER_MARGIN, my=PLAYER_MARGIN)
                entry["attackMap"] = _crop_b64(page, bbox)
            if heat_img:
                bbox = _safe_bbox(heat_img["x0"], heat_img["top"],
                                  heat_img["x1"], heat_img["bottom"],
                                  page, mx=PLAYER_MARGIN, my=PLAYER_MARGIN)
                entry["heatmap"] = _crop_b64(page, bbox)

            if entry:
                out[pid] = entry
        except Exception as e:
            print(f"  WARN: player p{pn} failed: {e}", file=sys.stderr)

    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("pdf")
    ap.add_argument("match_id")
    ap.add_argument("team_id")
    ap.add_argument("output_json")
    args = ap.parse_args()

    result = {"teamMaps": {}, "formationImage": None, "playerMaps": {}}
    with pdfplumber.open(args.pdf) as pdf:
        print(f"crop_all_b64: PDF {len(pdf.pages)} pages", file=sys.stderr)
        result["teamMaps"] = crop_team_maps(pdf)
        result["formationImage"] = crop_formation(pdf)
        result["playerMaps"] = crop_player_maps(pdf, args.team_id)

    with open(args.output_json, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False)

    sizes = []
    for v in result["teamMaps"].values(): sizes.append(len(v))
    if result["formationImage"]: sizes.append(len(result["formationImage"]))
    for pid, m in result["playerMaps"].items():
        for v in m.values(): sizes.append(len(v))
    total_mb = sum(sizes) / 1024 / 1024
    print(
        f"crop_all_b64 OK: {len(result['teamMaps'])} team maps + "
        f"{'1' if result['formationImage'] else '0'} formation + "
        f"{len(result['playerMaps'])} players × maps. "
        f"Total payload: {total_mb:.2f} MB."
    )


if __name__ == "__main__":
    main()
