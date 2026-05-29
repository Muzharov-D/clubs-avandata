"""Полный парсер SportVisor PDF (современный формат, любой размер состава).

Надёжность к 11..40 игрокам:
  • страницы находятся по подзаголовку-категории ("Performance index All" и т.д.),
    а НЕ по номеру страницы;
  • парсятся ВСЕ строки-игроки на странице (не фиксированные 17);
  • большой состав, разбитый на несколько страниц одной категории, собирается
    через аккумуляцию + safety-net продолжения (страница без подзаголовка, но с
    игровыми строками и тем же числом колонок → продолжение предыдущей категории);
  • позиция не используется как жёсткий фильтр (строка — игрок, если col0 = «NN Имя»
    и col2 ≈ минуты), поэтому необычные амплуа не теряются;
  • реальные имена (Имя Фамилия) и полное амплуа берутся со страниц per-player
    («8 Илья Храбрый | Центральный нападающий») и мерджатся по номеру.

Использует pdfplumber.extract_tables() — она устойчиво режет колонки даже там,
где extract_text() ломает многострочные заголовки.

Output:
  {
    "overall_meta": { '08': {name, firstName, lastName, position, positionFull, minutes} },
    "radar":  { '08': {overall, attackTotal, ...} },
    "fitness":{ '08': {totalDistance, ...} },
    "attack": { '08': {goal, shot, ...} },
    "defence":{ '08': {tackle, save, ...} },
  }
"""
import argparse, json, re, sys
import pdfplumber

# Известные коды амплуа — ТОЛЬКО подсказка/нормализация, не фильтр.
POSITIONS = {'ВР','ЦЗ','ЛЗ','ПЗ','ЦОП','ЛЦП','ПЦП','ЦН','ЛН','ПН','ЛКЗ','ПКЗ','ВОП','КАП','ЛВ','ПВ','ОПЗ','ОП'}

# (подстрока подзаголовка в lower, цель, колонки после «Мин» по порядку)
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

NUM_NAME_RE = re.compile(r'^\s*(\d{1,2})\s+(.+\S)\s*$')
MINUTES_RE = re.compile(r"^\s*(\d{1,3})\s*['’ʹ`]?\s*$")
# Заголовок per-player страницы: «… Player Stats – Макар Долгодуш».
# Берём ПОЛНОЕ имя отсюда (надёжно при любой вёрстке тела страницы).
TITLE_NAME_RE = re.compile(r'Player Stats\s*[–\-]\s*(.+?)\s*$')
INITIAL_RE = re.compile(r'^[А-ЯЁA-Z]\.?$')

# Группа сплит-метрики на per-player странице: «Name  Match  1time  2time».
# Имя — латиница (англ. метрики SportVisor), значения — целое/дробь/процент.
SPLIT_GROUP_RE = re.compile(
    r"([A-Za-z][A-Za-z&.'/\- ]*?)\s+(\d+(?:\.\d+)?%?)\s+(\d+(?:\.\d+)?%?)\s+(\d+(?:\.\d+)?%?)"
)


def _split_num(s):
    s = s.replace('%', '')
    try:
        return float(s) if '.' in s else int(s)
    except ValueError:
        return None


def parse_player_splits(text):
    """Per-player страница → {EnglishMetric: {match, first, second}}.
    Каждая строка тела содержит до 3 групп «Метрика M 1тайм 2тайм»."""
    splits = {}
    for line in (text or '').splitlines():
        for name, m, t1, t2 in SPLIT_GROUP_RE.findall(line):
            key = re.sub(r'\s+', ' ', name).strip()
            if not key or key in splits:
                continue
            vm, v1, v2 = _split_num(m), _split_num(t1), _split_num(t2)
            if vm is None:
                continue
            splits[key] = {'match': vm, 'first': v1, 'second': v2}
    return splits


def parse_compound(s):
    """Парсит ячейку в структурированный dict или число."""
    if s is None:
        return None
    s = str(s).strip()
    if s == '' or s == '-':
        return None

    if '|' in s:
        parts = [p.strip() for p in s.split('|')]
        try:
            if len(parts) == 2:
                left = float(parts[0]); right = float(parts[1])
                return {'value': left, 'total': right,
                        'accuracy': round(left / right * 100) if right > 0 else 0}
        except ValueError:
            pass

    m = re.match(r'^(\d+)%(\d+)$', s)
    if m:
        left, succ = m.group(1), int(m.group(2))
        best = None
        for split in range(1, len(left)):
            try:
                t = int(left[:split]); a = int(left[split:])
            except ValueError:
                continue
            if a > 100:
                continue
            expected = round(t * a / 100)
            diff = abs(expected - succ)
            score = diff + (0.1 if a == 0 and succ != 0 else 0)
            if best is None or score < best[2]:
                best = (t, a, score)
        if best is not None:
            return {'total': best[0], 'accuracy': best[1], 'successful': succ}
        if len(left) == 1:
            return {'total': int(left), 'accuracy': 0, 'successful': succ}

    s2 = s.replace(',', '.').replace('%', '')
    try:
        return float(s2) if '.' in s2 else int(s2)
    except ValueError:
        return None


def find_rule(page_text):
    text_lower = (page_text or '').lower()
    for r in PAGE_RULES:
        if r['h'] in text_lower:
            return r
    return None


def is_player_row(row):
    """Строка таблицы — это игрок? col0=«NN Имя», col2≈минуты (или пусто)."""
    if not row or len(row) < 4:
        return False
    c0 = str(row[0] or '').strip()
    m = NUM_NAME_RE.match(c0)
    if not m:
        return False
    # после номера должно идти имя (не только цифры)
    rest = m.group(2)
    if not re.search(r'[A-Za-zА-Яа-яЁё]', rest):
        return False
    c2 = str(row[2] or '').strip()
    return c2 == '' or MINUTES_RE.match(c2) is not None


def count_player_rows(table):
    return sum(1 for r in table[1:] if is_player_row(r)) if table and len(table) > 1 else 0


def pick_data_table(page):
    """Лучшая таблица страницы = с максимумом игровых строк (>=5 колонок)."""
    best, best_n = None, 0
    for t in page.extract_tables() or []:
        if not t or len(t) < 2 or len(t[0]) < 5:
            continue
        n = count_player_rows(t)
        if n > best_n:
            best, best_n = t, n
    return best


def parse_row(row, cols):
    if not is_player_row(row):
        return None
    m = NUM_NAME_RE.match(str(row[0]).strip())
    num = m.group(1).zfill(2)
    name = m.group(2).strip()

    pos = str(row[1] or '').strip()
    mm = MINUTES_RE.match(str(row[2] or '').strip())
    minutes = int(mm.group(1)) if mm else None

    fields = {}
    for col_name, raw in zip(cols, row[3:]):
        v = parse_compound(raw)
        if v is not None:
            fields[col_name] = v
    return {'num': num, 'name': name, 'position': pos, 'minutes': minutes, 'fields': fields}


def split_short(short):
    """«Долгодуш М.» → (surname='Долгодуш', initial='М'); «Абу Хаграс Р.» → ('Абу Хаграс','Р')."""
    toks = (short or '').split()
    if toks and INITIAL_RE.match(toks[-1]):
        return ' '.join(toks[:-1]), toks[-1][0]
    return short or '', ''


def match_full_name(short, fulls):
    """Сопоставляет короткое имя из таблицы с полным из заголовка per-player.
    Возвращает (fullName, firstName, lastName) или None.
    Рус. формат полного имени: «Имя Фамилия[ Фамилия2]»."""
    surname, initial = split_short(short)
    sl = surname.lower()
    # 1) точное: фамилия совпадает + инициал имени совпадает
    for full in fulls:
        ft = full.split()
        if len(ft) < 2:
            continue
        first, last = ft[0], ' '.join(ft[1:])
        if last.lower() == sl and initial and first[:1].lower() == initial.lower():
            return full, first, last
    # 2) fallback: единственное совпадение по фамилии
    cand = []
    for full in fulls:
        ft = full.split()
        if len(ft) >= 2 and ' '.join(ft[1:]).lower() == sl:
            cand.append(full)
    if len(cand) == 1:
        ft = cand[0].split()
        return cand[0], ft[0], ' '.join(ft[1:])
    return None


def parse(pdf_path):
    out = {'overall_meta': {}, 'radar': {}, 'fitness': {}, 'attack': {}, 'defence': {}, 'splits': {}}
    full_names = set()       # полные имена со страниц per-player (из заголовка)
    splits_by_name = {}      # fullName -> {metric: {match, first, second}}

    with pdfplumber.open(pdf_path) as pdf:
        last_rule, last_ncols = None, 0
        for page in pdf.pages:
            text = page.extract_text() or ''
            first_line = text.splitlines()[0] if text else ''

            # per-player страница: полное имя из заголовка «… Player Stats – Имя Фамилия»
            mt = TITLE_NAME_RE.search(first_line)
            if mt:
                full = re.sub(r'\s+', ' ', mt.group(1).strip())
                full_names.add(full)
                sp = parse_player_splits(text)
                if sp:
                    splits_by_name[full] = sp
                continue

            rule = find_rule(text)
            data_table = pick_data_table(page)

            if not rule:
                # safety-net продолжения категории (большой состав на 2+ страницах):
                # та же ширина таблицы + есть игровые строки → продолжаем предыдущую.
                if (last_rule and data_table and count_player_rows(data_table) >= 1
                        and abs(len(data_table[0]) - last_ncols) <= 1):
                    rule = last_rule
                else:
                    continue
            if not data_table:
                continue

            last_rule, last_ncols = rule, len(data_table[0])
            for row in data_table[1:]:
                pr = parse_row(row, rule['cols'])
                if not pr:
                    continue
                num = pr['num']
                meta = out['overall_meta'].setdefault(num, {'name': pr['name'], 'position': pr['position'], 'minutes': pr['minutes']})
                if not meta.get('minutes') and pr['minutes']:
                    meta['minutes'] = pr['minutes']
                if pr['position'] and not meta.get('position'):
                    meta['position'] = pr['position']
                out[rule['t']].setdefault(num, {}).update(pr['fields'])

    # Обогащаем реальными ФИО: сопоставляем короткое имя из таблицы («Долгодуш М.»)
    # с полным из заголовка per-player («Макар Долгодуш») по фамилии+инициалу.
    fulls = list(full_names)
    for num, meta in out['overall_meta'].items():
        matched = match_full_name(meta.get('name', ''), fulls)
        if matched:
            full, first, last = matched
            meta['name'] = full
            meta['firstName'] = first
            meta['lastName'] = last
            if full in splits_by_name:
                out['splits'][num] = splits_by_name[full]

    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('input_pdf')
    ap.add_argument('output_json')
    args = ap.parse_args()
    data = parse(args.input_pdf)
    with open(args.output_json, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    named = sum(1 for m in data['overall_meta'].values() if m.get('firstName'))
    print(f"OK players={len(data['overall_meta'])} named={named} splits={len(data['splits'])} "
          f"radar={len(data['radar'])} fitness={len(data['fitness'])} "
          f"attack={len(data['attack'])} defence={len(data['defence'])}", file=sys.stderr)


if __name__ == '__main__':
    main()
