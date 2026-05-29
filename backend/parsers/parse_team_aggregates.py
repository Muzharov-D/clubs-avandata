"""Team aggregates parser (v3): находит командные страницы по МАРКЕРУ секции,
а не по хардкод-номеру.

Почему: номера командных дашбордов в SportVisor-PDF плавают (зависят от числа
игроков → числа постраничных таблиц игроков перед ними). В Zenit-PDF командные
страницы — 18–26, а парсер раньше хардкодил 12–20 и читал таблицы игроков →
метки не находились → нули (xG, прессинг, перехваты). Теперь ищем страницу по
уникальной для дашборда подписи.

Delegates each section to a small per-section module under aggregates/.
mapImage path is built from MAPS_PREFIX env (default /assets/maps).
"""
import os
from lib.pdf_extract import extract_page_texts
from aggregates import shooting, set_pieces, possession, passes
from aggregates import attacks, recoveries, duels, pressing, positioning

# (key, parser, map-slug, [маркеры])
# ПЕРВИЧНЫЙ маркер — тег страницы-дашборда «Attack N/5» / «Defence N/4»: он
# уникален (нет ни на постраничных таблицах игроков, ни в заголовках колонок,
# где русские слова типа «Единоборства»/«Передачи» коллизятся). ВТОРИЧНЫЙ —
# уникальная русская подпись секции (на случай иного формата тега).
SECTIONS = [
    ("shooting",              shooting.parse,    "shooting",    ["Attack 1/5", "ОЖИДАЕМЫЕ ГОЛЫ"]),
    ("setPieces",             set_pieces.parse,  "set-pieces",  ["Attack 2/5", "Стандартные положения"]),
    ("possession",            possession.parse,  "possession",  ["Attack 3/5", "ВЛАДЕНИЯ (КОЛ-ВО)"]),
    ("passes",                passes.parse,      "passes",      ["Attack 4/5", "Распределение передач"]),
    ("attacks",               attacks.parse,     "attacks",     ["Attack 5/5", "Направления атак"]),
    ("recoveriesAndTackling", recoveries.parse,  "recoveries",  ["Defence 1/4", "Отборы и подборы"]),
    ("duels",                 duels.parse,       "duels",       ["Defence 2/4", "ВСЕГО ЕДИНОБОРСТВ"]),
    ("pressing",              pressing.parse,    "pressing",    ["Defence 3/4", "СРЕДНИЙ PPDA"]),
    ("positioning",           positioning.parse, "positioning", ["Defence 4/4", "Позиционная оборона"]),
]

# Запасной хардкод (старое поведение) — если маркеры не нашлись (другой формат PDF).
LEGACY_PAGES = {
    "shooting": 12, "setPieces": 13, "possession": 14, "passes": 15, "attacks": 16,
    "recoveriesAndTackling": 17, "duels": 18, "pressing": 19, "positioning": 20,
}


def _find_section_text(pages, markers):
    """pages = [(idx1based, text), ...]. Ищем маркеры ПО ПРИОРИТЕТУ: сначала
    первичный (уникальный тег дашборда «Defence N/4») по всем страницам, потом
    вторичный. Иначе вторичная русская подпись («Отборы и подборы») коллизится с
    заголовком колонки на странице игроков (идёт раньше) и берётся не та страница."""
    for marker in markers:
        for _idx, txt in pages:
            if marker in txt:
                return txt
    return None


def _passes_directional(pdf_path):
    """Координатный разбор НАПРАВЛЕННЫХ передач (страница «Attack 4/5»).

    Лейаут 2-колоночный с переносом подписей, линейный текст путает: «прогрессивные»
    он брал как «передачи вперёд» (147 вместо 62), «в фин. треть» — мимо (100 вместо 52).
    Берём слова с координатами: якорь на слово-метку в правой колонке (x≥150) и
    ближайшее по Y число в колонке значений (x∈[200,330] — не ось графика на x≈481)."""
    try:
        import pdfplumber
        with pdfplumber.open(pdf_path) as pdf:
            page = next((p for p in pdf.pages if "Attack 4/5" in (p.extract_text() or "")), None)
            if page is None:
                return {}
            words = [(w["x0"], w["top"], w["text"]) for w in page.extract_words()]
    except Exception:
        return {}

    def near(labels, y_tol=8):
        anchors = [y for x, y, t in words if t in labels and x >= 150]
        best = None
        for ly in anchors:
            for x, y, t in words:
                if not (200 <= x <= 330) or "%" in t:
                    continue
                try:
                    n = int(t)
                except ValueError:
                    continue
                if abs(y - ly) <= y_tol and (best is None or x < best[0]):
                    best = (x, n)
        return best[1] if best else None

    out = {}
    prog = near(["ПРОГРЕССИВНЫЕ"])
    fin = near(["ФИН.", "ТРЕТЬ"])
    if prog is not None:
        out["progressive"] = prog
    if fin is not None:
        out["toFinalThird"] = fin
    return out


def parse(pdf_path, match_id):
    prefix = os.environ.get("MAPS_PREFIX", "/assets/maps").rstrip("/")
    pages = extract_page_texts(pdf_path)            # [(1, text), (2, text), ...]
    by_idx = {idx: txt for idx, txt in pages}
    out = {}
    for key, parser, slug, markers in SECTIONS:
        text = _find_section_text(pages, markers)
        if text is None:
            text = by_idx.get(LEGACY_PAGES.get(key, 0), "")
        try:
            section = parser(text) if text else {}
        except Exception:
            section = {}
        section["mapImage"] = f"{prefix}/{match_id}-team-{slug}-map.png"
        out[key] = section
    # Координатный фикс направленных передач (линейный текст их путает).
    if isinstance(out.get("passes"), dict):
        out["passes"].update(_passes_directional(pdf_path))
    return out


if __name__ == "__main__":
    import argparse, json
    ap = argparse.ArgumentParser()
    ap.add_argument("pdf"); ap.add_argument("match_id")
    args = ap.parse_args()
    print(json.dumps(parse(args.pdf, args.match_id), ensure_ascii=False, indent=2))
