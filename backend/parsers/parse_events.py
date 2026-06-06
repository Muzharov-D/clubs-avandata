"""parse_events.py — best-effort парсер хроники матча из SportVisor PDF.

Хроника — обычно страница 2 или 3 PDF, формат строк (SportVisor русский):
  "15' ⚽ Иванов Иван"                     → гол
  "23' 🟨 Петров Пётр"                     → жёлтая
  "67' 🟥 Сидоров"                         → красная
  "65' Замена: Кузнецов ↔ Орлов"           → замена
  "78' Гол: Михайлов (асс. Васильев)"     → гол с ассистом
  "пенальти", "автогол", и т.п.

Output:
  {
    "events": [
      { "minute": 15, "type": "goal", "player": "Иванов Иван", "team": "home|away|unknown" },
      { "minute": 23, "type": "yellow_card", "player": "Петров Пётр", ... },
      { "minute": 65, "type": "substitution", "playerOut": "Кузнецов", "playerIn": "Орлов", ... },
      ...
    ]
  }

Usage:
  python parse_events.py <pdf> <output.json>
"""
import argparse, json, re, sys
import pdfplumber

# Минута + хвост строки
LINE_RE = re.compile(r"^\s*(\d{1,3})\s*[′ʹ'`′ʼ]?\s*(?:\+\s*(\d+))?\s*[.\)\-—]?\s*(.+)$")

# Шаблоны (порядок ВАЖЕН — проверяем сверху вниз)
PATTERNS = [
    ('goal',         re.compile(r'(?:гол|⚽|⚪|🥅)', re.I)),
    ('penalty',      re.compile(r'(?:пенальти|penalty)', re.I)),
    ('own_goal',     re.compile(r'(?:автогол|own\s+goal)', re.I)),
    # ВНИМАНИЕ: НЕ использовать «Y C»/«R C» — они ловят коды позиций (RCB/RCMF/
    # LCB) в строках рейтингов как карточки. Только явные слова/эмодзи.
    ('yellow_card',  re.compile(r'(?:жёлт|желт|🟨)', re.I)),
    ('red_card',     re.compile(r'(?:красн|🟥)', re.I)),
    ('substitution', re.compile(r'(?:замен|sub|↔|⇄)', re.I)),
]

ASSIST_RE = re.compile(r'\(\s*(?:асс\.?|assist[:\s]*)\s*([^\)]+)\)', re.I)

# Имя игрока — Cyrillic words, до конца строки или до скобок/эмодзи
NAME_RE = re.compile(r'([А-ЯЁ][а-яё]+(?:\s+[А-ЯЁ][а-яё]+)*)')

SUB_RE = re.compile(r'([А-ЯЁ][а-яё]+(?:\s+[А-ЯЁ][а-яё]+)*)\s*(?:[↔⇄→←]|вместо|на)\s*([А-ЯЁ][а-яё]+(?:\s+[А-ЯЁ][а-яё]+)*)')


def parse_event_line(line: str):
    """Возвращает event dict или None."""
    line = line.strip()
    if not line:
        return None
    m = LINE_RE.match(line)
    if not m:
        return None
    minute = int(m.group(1))
    extra = m.group(2)  # для +N добавленных минут
    rest = m.group(3).strip()
    if minute > 120:
        return None  # вряд ли реальная минута

    # Отсекаем НЕ-события (парсер сканирует и рейтинг-страницы):
    #  • строка рейтинга игрока «Галицкий М. RCB 77' 7.8 9.2 6.6 8.3» — код
    #    позиции + минуты со штрихом, либо ≥2 дробных оценки;
    #  • стат-подпись «КРАСНЫЕ КАРТОЧКИ 0» / «ВСЕГО УДАРОВ» — метка раздела, не событие.
    if re.search(r"\b[A-Za-z]{2,4}\b\s+\d{1,3}\s*['′ʹ`’]", rest):
        return None
    if len(re.findall(r"\b\d+[.,]\d\b", rest)) >= 2:
        return None
    if re.search(r"КАРТОЧ(?:КИ|ЕК)|ФОЛЫ|ВСЕГО\s+УДАР|ПЕРЕДАЧ|ВЛАДЕНИ|ОФСАЙД|ПРЕССИНГ|ОТБОР|ОЖИДАЕМ|ГОЛЫ\s*\(|xG|УГЛОВЫ|ШТРАФНЫ", rest, re.I):
        return None

    # Определяем тип
    event_type = None
    for tname, pat in PATTERNS:
        if pat.search(rest):
            event_type = tname
            break
    if not event_type:
        return None  # не распознали

    event = {
        'minute': minute,
        'extra':  int(extra) if extra else 0,
        'type':   event_type,
        'raw':    rest[:120],
    }

    if event_type == 'substitution':
        sub = SUB_RE.search(rest)
        if sub:
            event['playerOut'] = sub.group(1).strip()
            event['playerIn']  = sub.group(2).strip()
        else:
            names = NAME_RE.findall(rest)
            if len(names) >= 2:
                event['playerOut'] = names[0]
                event['playerIn']  = names[1]
            elif names:
                event['player'] = names[0]
    else:
        names = NAME_RE.findall(rest)
        if names:
            event['player'] = names[0]
            asst = ASSIST_RE.search(rest)
            if asst:
                event['assist'] = asst.group(1).strip()

    return event


def parse(pdf_path):
    out = {'events': []}
    with pdfplumber.open(pdf_path) as pdf:
        # Ищем event'ы на страницах 1-4 (обычно хроника на 2-3 в Zenit-формате).
        for pn in range(1, min(5, len(pdf.pages)) + 1):
            try:
                page = pdf.pages[pn - 1]
                text = page.extract_text() or ''
                for line in text.split('\n'):
                    ev = parse_event_line(line)
                    if ev:
                        out['events'].append(ev)
            except Exception as e:
                print(f"  WARN: events page {pn} failed: {e}", file=sys.stderr)

    # Сортировка + дедуп
    out['events'].sort(key=lambda e: (e['minute'], e.get('extra', 0)))
    # Простой дедуп: одинаковая (minute, type, player) — игнорируем повтор
    seen = set()
    unique = []
    for ev in out['events']:
        key = (ev['minute'], ev['type'], ev.get('player') or ev.get('playerOut') or '')
        if key in seen:
            continue
        seen.add(key)
        unique.append(ev)
    out['events'] = unique

    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('pdf')
    ap.add_argument('output_json')
    args = ap.parse_args()
    data = parse(args.pdf)
    with open(args.output_json, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f"parse_events OK: {len(data['events'])} events")


if __name__ == '__main__':
    main()
