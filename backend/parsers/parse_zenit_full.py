"""Полный парсер SportVisor PDF (Zenit/современный формат).

Использует pdfplumber.extract_tables() — берёт вторую таблицу на странице
(первая всегда заголовок). Decode'ит compound-значения:
  "1233%4"   → {total: 12, accuracy: 33, successful: 4}
  "5 | 27"   → {successful: 5, total: 27}
  "10%0"     → {total: 10, accuracy: 0, successful: 0}
  "0"        → {value: 0}
  "5.2"      → {value: 5.2}

Output:
  {
    "overall_meta": { '01': {name, position, minutes} },
    "radar":  { '01': {16 radar fields} },
    "fitness":{ '01': {totalDistance, sprints, ...} },
    "attack": { '01': {goal, shot, assist, ..., 30+ fields} },
    "defence":{ '01': {tackle, interception, save, ...} },
  }
"""
import argparse, json, re
import pdfplumber

POSITIONS = {'ВР','ЦЗ','ЛЗ','ПЗ','ЦОП','ЛЦП','ПЦП','ЦН','ЛН','ПН','ЛКЗ','ПКЗ','ВОП','КАП','ЛВ','ПВ','ОПЗ'}

# (header_substring_lowercase, target, columns_after_min_in_order)
PAGE_RULES = [
    {'h': 'performance index all',     't': 'radar',   'cols': ['overall','fitnessTotal','attackTotal','defenceTotal']},
    {'h': 'performance index fitness', 't': 'radar',   'cols': ['fitnessRating','distance','intensity']},
    {'h': 'performance index attack',  't': 'radar',   'cols': ['attackRating','forwardPlay','possession','dribbling','shooting','setPiece']},
    {'h': 'performance index defence', 't': 'radar',   'cols': ['defenceRating','tackling','positioning','duels','pressing','goalkeeping']},
    {'h': 'fitness distance',          't': 'fitness', 'cols': ['totalDistance','speed_4_5_5','speed_5_5_7','speed_7plus']},
    {'h': 'fitness intensity',         't': 'fitness', 'cols': ['sprintDistance','sprintsCount','intenseRunning','averageSpeed']},
    {'h': 'attack forward play',       't': 'attack',  'cols': ['passProgressing','intoPenArea','progressivePass','passToFinalThird','keyPass','cross','entriesInBox','assist','secondAssist','thirdAssist','passOnTarget','offside']},
    {'h': 'attack possession',         't': 'attack',  'cols': ['pass','passForward','passBack','passSideways','passShort','passMiddle','passLong','touchesInPenArea','receivedPass','foulsSuffered','loseOnOwnHalf','dangerousLosesOnOwnHalf','ownGoal','lostBall','technicalMistake']},
    {'h': 'attack dribbling',          't': 'attack',  'cols': ['dribble','dribbleProgressing']},
    {'h': 'attack shooting',           't': 'attack',  'cols': ['goal','goalActions','shot','byHead']},
    {'h': 'attack set pieces',         't': 'attack',  'cols': ['freeKickShot','freeKick','directFreeKick','directFreeKickShot','penalty','corner','throwing']},
    {'h': 'defence tackling',          't': 'defence', 'cols': ['tackle','slidingTackles','dribbleAgainst','recovery','recoveryOpp','interception']},
    {'h': 'defence positioning',       't': 'defence', 'cols': ['positionPlay','dangerousLossOwn','clearance','blockedShot']},
    {'h': 'defence duels',             't': 'defence', 'cols': ['duel','aerialDuel','duelWon']},
    {'h': 'defence pressing',          't': 'defence', 'cols': ['pressing','counterpressing']},
    {'h': 'defence goalkeeping',       't': 'defence', 'cols': ['save','goalkeeperExits','shotsAgainst','goalKick','shortGoalKicks','longGoalKicks']},
]


def parse_compound(s):
    """Parse one cell value into structured dict or simple number.

    Examples:
      "0"        → 0
      "5.2"      → 5.2
      "5 | 27"   → {value: 5, total: 27}
      "1233%4"   → {total: 12, accuracy: 33, successful: 4}
      "1100%1"   → {total: 1, accuracy: 100, successful: 1}
      "10%0"     → {total: 1, accuracy: 0, successful: 0}  (best fit)
    """
    if s is None: return None
    s = str(s).strip()
    if s == '' or s == '-': return None

    # "X | Y" — successful | total
    if '|' in s:
        parts = [p.strip() for p in s.split('|')]
        try:
            if len(parts) == 2:
                left = float(parts[0])
                right = float(parts[1])
                return {'value': left, 'total': right,
                        'accuracy': round(left / right * 100) if right > 0 else 0}
        except ValueError:
            pass

    # "TOTAL_ACC%SUCC" compound
    m = re.match(r'^(\d+)%(\d+)$', s)
    if m:
        left, succ = m.group(1), int(m.group(2))
        best = None
        for split in range(1, len(left)):
            try:
                t = int(left[:split])
                a = int(left[split:])
            except ValueError:
                continue
            if a > 100: continue
            expected = round(t * a / 100)
            diff = abs(expected - succ)
            score = diff + (0.1 if a == 0 and succ != 0 else 0)
            if best is None or score < best[2]:
                best = (t, a, score)
        if best is not None:
            return {'total': best[0], 'accuracy': best[1], 'successful': succ}
        # Edge: e.g. "0%0" — single digit left
        if len(left) == 1:
            return {'total': int(left), 'accuracy': 0, 'successful': succ}

    # Plain integer or float
    s2 = s.replace(',', '.').replace('%', '')
    try:
        if '.' in s2:
            return float(s2)
        return int(s2)
    except ValueError:
        return None


def find_rule(headers, page_text):
    text_lower = page_text.lower()
    for r in PAGE_RULES:
        if r['h'] in text_lower:
            return r
    return None


def parse_row(row, cols):
    """row from extract_tables: ['01 Изюмский Р.', 'ВР', "83'", 'val1', ...]"""
    if not row or len(row) < 4: return None
    name_cell = row[0]
    if not name_cell: return None
    name_cell = str(name_cell).strip()

    m = re.match(r'^\s*(\d{1,2})\s+(.+)$', name_cell)
    if not m: return None
    num = m.group(1).zfill(2)
    name = m.group(2).strip()

    pos = (row[1] or '').strip()
    if pos not in POSITIONS: return None

    mins_cell = (row[2] or '').strip()
    mm = re.match(r"^(\d+)'?$", mins_cell)
    minutes = int(mm.group(1)) if mm else None

    # Values start at column 3. Map to cols list.
    raw_vals = row[3:]
    fields = {}
    for col_name, raw in zip(cols, raw_vals):
        v = parse_compound(raw)
        if v is not None:
            fields[col_name] = v

    return {'num': num, 'name': name, 'position': pos, 'minutes': minutes, 'fields': fields}


def parse(pdf_path):
    out = {'overall_meta': {}, 'radar': {}, 'fitness': {}, 'attack': {}, 'defence': {}}

    with pdfplumber.open(pdf_path) as pdf:
        for page_idx, page in enumerate(pdf.pages):
            text = page.extract_text() or ''
            rule = find_rule(None, text)
            if not rule: continue

            tables = page.extract_tables()
            if not tables: continue
            # Берём ВТОРУЮ таблицу (первая — header), либо первую с >5 cols
            data_table = None
            for t in tables:
                if t and len(t) > 1 and len(t[0]) >= 5:
                    data_table = t
                    break
            if not data_table: continue

            # Skip header row
            for row in data_table[1:]:
                pr = parse_row(row, rule['cols'])
                if not pr: continue
                num = pr['num']
                if num not in out['overall_meta']:
                    out['overall_meta'][num] = {
                        'name': pr['name'], 'position': pr['position'], 'minutes': pr['minutes'],
                    }
                target = rule['t']
                out[target].setdefault(num, {}).update(pr['fields'])

    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('input_pdf')
    ap.add_argument('output_json')
    args = ap.parse_args()
    data = parse(args.input_pdf)
    with open(args.output_json, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f"OK players={len(data['overall_meta'])} "
          f"radar={len(data['radar'])} fitness={len(data['fitness'])} "
          f"attack={len(data['attack'])} defence={len(data['defence'])}")


if __name__ == '__main__':
    main()
