"""Parse SportVisor/Наградион per-player CSV export → JSON в том же неймспейсе,
что и parse_zenit_full.py (группы attack/defence/fitness, английские ключи).

Формат входа (UTF-8):
  #Team: ...
  #Home team: ...
  #Guest Team: ...
  #Date: ...
  номер,имя,игровое время,<~130 русских колонок>
  5,Михаил Галицкий,82.0,46,37,80.4,...
  ...

Зачем: PDF-парсер извлекает те же числа, но его табличная экстракция хрупкая
(порядок колонок). CSV — структурированный эталон, поэтому служит источником
истины в мердже (см. upload/routes.ts). Компаунды собираются из троек
«значение, удачные, точность» в {total, successful, accuracy}.

Usage:
  python parse_csv.py <input.csv> <output.json>
"""
import argparse, csv, io, json, re, sys

# (group, key, total_col, successful_col|None, accuracy_col|None)
# Имена колонок — точно как в шапке CSV. Компаунд собирается если задан succ/acc.
MAPPING = [
    # ── attack: passing ──
    ('attack', 'pass',             'пас', 'удачные пасы', 'точность пасов'),
    ('attack', 'passForward',      'пасы вперед', 'удачные пасы вперед', 'точность пасов вперед'),
    ('attack', 'passBack',         'пасы назад', 'удачные пасы назад', 'точность пасов назад'),
    ('attack', 'passSideways',     'пасы поперек', 'удачные пасы поперек', 'точность пасов поперек'),
    ('attack', 'passShort',        'короткие пасы', 'удачные короткие пасы', 'точность коротких пасов'),
    ('attack', 'passMiddle',       'средние пасы', 'удачные средние пасы', 'точность средних пасов'),
    ('attack', 'passLong',         'длинные пасы', 'удачные длинные пасы', 'точность длинных пасов'),
    ('attack', 'intoPenArea',      'пасы в штрафную', 'удачные пасы в штрафную', 'точность пасов в штрафную'),
    ('attack', 'passToFinalThird', 'пасы в финальную треть', 'удачные пасы в финальную треть', 'точность пасов в финальную треть'),
    ('attack', 'progressivePass',  'прогрессивные пасы', 'удачные прогрессивные пасы', 'точность прогрессивных пасов'),
    ('attack', 'throughPass',      'разрезающие пасы', 'удачные разрезающие пасы', 'точность разрезающих пасов'),
    ('attack', 'keyPass',          'ключевые пасы', None, None),
    ('attack', 'cross',            'кроссы', 'удачные кроссы', 'точность кроссов'),
    ('attack', 'assist',           'голевые передачи', None, None),
    ('attack', 'secondAssist',     'предголевые передачи', None, None),
    ('attack', 'thirdAssist',      'третьи передачи (third assist)', None, None),
    ('attack', 'passOnTarget',     'передачи под удар в створ', None, None),
    ('attack', 'receivedPass',     'принятые пасы', None, None),
    ('attack', 'entriesInBox',     'входы в штрафную', None, None),
    ('attack', 'touchesInPenArea', 'касания мяча в штрафной', None, None),
    # ── attack: possession / losses ──
    ('attack', 'lostBall',                 'потери мяча', None, None),
    ('attack', 'loseOnOwnHalf',            'потери на своей половине', None, None),
    ('attack', 'dangerousLosesOnOwnHalf',  'опасные потери на своей половине', None, None),
    ('attack', 'technicalMistake',         'технические ошибки', None, None),
    ('attack', 'foulsSuffered',            'фолы на игроке', None, None),
    # ── attack: dribbling ──
    ('attack', 'dribble',          'дриблинг', 'удачный дриблинг', 'успешность дриблинга'),
    # ── attack: shooting ──
    ('attack', 'shot',             'удары', 'точные удары', 'точность ударов'),
    ('attack', 'byHead',           'удары головой', 'точные удары головой', 'точность ударов головой'),
    ('attack', 'goal',             'голы', None, None),
    ('attack', 'ownGoal',          'автоголы', None, None),
    ('attack', 'offside',          'офсайды', None, None),
    # ── attack: set pieces ──
    ('attack', 'penalty',          'пенальти', 'удачные пенальти', 'точность пенальти'),
    ('attack', 'freeKick',         'штрафные удары', 'удачные штрафные удары', 'точность штрафных ударов'),
    ('attack', 'directFreeKick',   'прямые штрафные', 'удачные прямые штрафные', 'точность прямых штрафных'),
    ('attack', 'corner',           'угловые', 'удачные угловые', 'точность угловых'),
    ('attack', 'throwing',         'ауты', 'удачные ауты', 'точность аутов'),
    # ── defence: tackling / recoveries ──
    ('defence', 'tackle',          'отборы', 'удачные отборы', 'успешность отборов'),
    ('defence', 'slidingTackles',  'подкаты', 'удачные подкаты', 'успешность подкатов'),
    ('defence', 'dribbleAgainst',  'дриблинги против', 'удачные дриблинги против', 'успешность дриблингов против'),
    ('defence', 'recovery',        'возвраты', None, None),
    ('defence', 'recoveryOpp',     'возвраты на чужой половине', None, None),
    ('defence', 'interception',    'перехваты', None, None),
    ('defence', 'rebounds',        'подборы', None, None),
    ('defence', 'reboundsOpp',     'подборы на чужой половине', None, None),
    # ── defence: positioning ──
    ('defence', 'clearance',       'выносы', 'точные выносы', 'точность выносов'),
    ('defence', 'blockedShot',     'заблокированные удары', None, None),
    # ── defence: duels ──
    ('defence', 'duel',            'дуэли', 'выигранные дуэли', 'успешность дуэлей'),
    ('defence', 'aerialDuel',      'воздушные дуэли', 'выигранные воздушные дуэли', 'успешность воздушных дуэлей'),
    # ── defence: pressing / discipline ──
    ('defence', 'pressing',        'прессинг', None, None),
    ('defence', 'counterpressing', 'контрпрессинг', None, None),
    ('defence', 'fouls',           'нарушения', None, None),
    ('defence', 'yellowCards',     'жёлтые карточки', None, None),
    ('defence', 'redCards',        'красные карточки', None, None),
    # ── defence: goalkeeping ──
    ('defence', 'save',            'сейвы', None, None),
    ('defence', 'goalkeeperExits', 'выходы вратаря', 'удачные выходы вратаря', 'точность выходов вратаря'),
    ('defence', 'shotsAgainst',    'удары против', 'удары против в створ', 'точность ударов против'),
    ('defence', 'goalKick',        'удары от ворот', 'удачные удары от ворот', 'точность ударов от ворот'),
    # ── fitness ──
    ('fitness', 'totalDistance',   'общая дистанция', None, None),
    ('fitness', 'speed_4_5_5',     'дистанции со скоростью 4-5.5м/с', None, None),
    ('fitness', 'speed_5_5_7',     'дистанции со скоростью 5.5-7м/с', None, None),
    ('fitness', 'speed_7plus',     'дистанции со скоростью > 7м/с', None, None),
    ('fitness', 'sprintDistance',  'дистанция спринтов', None, None),
    ('fitness', 'sprintsCount',    'количество спринтов', None, None),
    ('fitness', 'averageSpeed',    'средняя скорость', None, None),
    ('fitness', 'intenseRunning',  'интенсивный бег %', None, None),
    ('fitness', 'sprints',         'спринты', None, None),
    ('fitness', 'accelerations',   'ускорения', None, None),
    ('fitness', 'progressiveRuns', 'прогрессивные забегания', None, None),
]


def to_num(s):
    """'46' → 46, '80.4' → 80.4, '' → None. Дробное с .0 → int."""
    if s is None:
        return None
    s = str(s).strip().replace(',', '.')
    if s == '' or s == '-':
        return None
    try:
        f = float(s)
    except ValueError:
        return None
    return int(f) if f == int(f) else round(f, 2)


def build_value(row, total_col, succ_col, acc_col):
    """Скаляр или компаунд {total, successful, accuracy} по тройке колонок."""
    total = to_num(row.get(total_col))
    if total is None:
        return None
    if succ_col is None and acc_col is None:
        return total
    succ = to_num(row.get(succ_col)) if succ_col else None
    acc = to_num(row.get(acc_col)) if acc_col else None
    out = {'total': total}
    if succ is not None:
        out['successful'] = succ
    if acc is not None:
        out['accuracy'] = acc
    # Если ни succ, ни acc не пришли — отдаём просто число (как PDF для скаляров).
    return out if len(out) > 1 else total


def parse(csv_path):
    with open(csv_path, encoding='utf-8-sig') as f:
        lines = f.readlines()

    meta = {}
    data_lines = []
    for ln in lines:
        if ln.startswith('#'):
            m = re.match(r'^#\s*([^:]+):\s*(.+)$', ln.strip())
            if m:
                meta[m.group(1).strip().lower()] = m.group(2).strip()
        else:
            data_lines.append(ln)

    reader = csv.DictReader(io.StringIO(''.join(data_lines)))
    headers = reader.fieldnames or []

    players = []
    for row in reader:
        num_raw = row.get('номер')
        if num_raw is None or str(num_raw).strip() == '':
            continue
        try:
            number = str(int(float(num_raw))).zfill(2)
        except (ValueError, TypeError):
            continue
        name = (row.get('имя') or '').strip()
        minutes = to_num(row.get('игровое время'))
        if isinstance(minutes, float):
            minutes = int(minutes)

        stats = {'attack': {}, 'defence': {}, 'fitness': {}}
        for group, key, tcol, scol, acol in MAPPING:
            v = build_value(row, tcol, scol, acol)
            if v is not None:
                stats[group][key] = v

        players.append({
            'number': number,
            'name': name,
            'minutes': minutes,
            'stats': stats,
            'raw': {h: row.get(h) for h in headers if h not in ('номер', 'имя')},
        })

    score = None
    for k in ('result', 'score', 'счет', 'счёт'):
        if k in meta:
            mm = re.match(r'(\d+)\s*[:-]\s*(\d+)', meta[k])
            if mm:
                score = {'home': int(mm.group(1)), 'away': int(mm.group(2))}
                break

    return {
        'match': {
            'homeTeam':     meta.get('home team') or meta.get('team'),
            'awayTeam':     meta.get('guest team'),
            'date':         meta.get('date'),
            'score':        score,
            'source':       'csv',
            'columnsCount': len(headers),
        },
        'players': players,
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('input_csv')
    ap.add_argument('output_json')
    args = ap.parse_args()
    data = parse(args.input_csv)
    with open(args.output_json, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    if not data['players']:
        print('WARN: 0 players parsed — проверь, что в CSV есть колонка «номер»', file=sys.stderr)
    print(f"OK columns={data['match']['columnsCount']} players={len(data['players'])}", file=sys.stderr)


if __name__ == '__main__':
    main()
