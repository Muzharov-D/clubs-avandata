"""Fallback ratings parser — reads any "Performance index ..." page текстом и
извлекает per-player ratings regex'ом.

Зачем: parse_team_tables рассчитан на конкретный формат таблиц Легируса
(10 колонок). Когда SportVisor генерит PDF с компактной таблицей
(7 колонок: Игрок Поз Мин Ср.оценка Фитнес Атака Защита) — таблично не
парсится, но текстово работает.

Output:
  {
    "overall":   { '01': {'overallIndex': 6.9, 'fitnessTotal':5.2, 'attackTotal':6.3, 'defenceTotal':6.8, 'minutes':83, 'name':'Изюмский Р.', 'position':'ВР'} },
    "fitness":   { '01': {'fitness':5.2, 'totalDistance':5, 'intensity':5 } },
    "attack":    {...},  # с Performance index Attack page
    "defence":   {...},
  }

Used as fallback в build_match.py if structured parser возвращает empty.
"""
import re
import pdfplumber


# matches: "01 Изюмский Р. ВР 83' 6.9 5.2 6.3 6.8" — overall section
RE_OVERALL = re.compile(
    r'^\s*(\d{1,2})\s+'                       # number
    r'(.+?)\s+'                               # name (greedy until position)
    r'(ВР|ЦЗ|ЛЗ|ПЗ|ЦОП|ЛЦП|ПЦП|ЦН|ЛН|ПН|ЛКЗ|ПКЗ|ВОП|КАП|ЛВ|ПВ|ОПЗ)\s+'  # position
    r"(\d+)'\s+"                              # minutes
    r'(\d+(?:\.\d+)?)\s+'                     # overall (avg rating)
    r'(\d+(?:\.\d+)?)\s+'                     # fitness
    r'(\d+(?:\.\d+)?)\s+'                     # attack
    r'(\d+(?:\.\d+)?)\s*$',                   # defence
    re.MULTILINE,
)

# matches: "01 Изюмский Р. ВР 83' 5.2 5 5" — fitness page (overall=fitness, then dist + intensity 0-10 scale)
RE_FITNESS = re.compile(
    r'^\s*(\d{1,2})\s+'
    r'(.+?)\s+'
    r'(ВР|ЦЗ|ЛЗ|ПЗ|ЦОП|ЛЦП|ПЦП|ЦН|ЛН|ПН|ЛКЗ|ПКЗ|ВОП|КАП|ЛВ|ПВ|ОПЗ)\s+'
    r"(\d+)'\s+"
    r'(\d+(?:\.\d+)?)\s+'
    r'(\d+(?:\.\d+)?)\s+'
    r'(\d+(?:\.\d+)?)\s*$',
    re.MULTILINE,
)


def parse(pdf_path):
    """Return dict {section: {num: {...}}}."""
    overall = {}
    fitness = {}
    attack  = {}
    defence = {}

    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            text = page.extract_text() or ''
            head = text[:200].lower()
            if 'performance index all' in head or 'performance index\nall' in head:
                for m in RE_OVERALL.finditer(text):
                    num, name, pos, mins, ovr, fit, atk, dfn = m.groups()
                    overall[num.zfill(2)] = {
                        'name': name.strip(),
                        'position': pos,
                        'minutes': int(mins),
                        'overallIndex': float(ovr),
                        'fitnessTotal': float(fit),
                        'attackTotal':  float(atk),
                        'defenceTotal': float(dfn),
                    }
            elif 'performance index fitness' in head or 'performance index\nfitness' in head:
                # last 3 cols on fitness page: fitness, distance(1-10), intensity(1-10)
                for m in RE_FITNESS.finditer(text):
                    num, _, _, _, fit, dist, intens = m.groups()
                    fitness[num.zfill(2)] = {
                        'fitness': float(fit),
                        'totalDistance': float(dist),
                        'intensity':     float(intens),
                    }
            elif 'performance index attack' in head or 'performance index\nattack' in head:
                for m in RE_FITNESS.finditer(text):
                    num, _, _, _, a1, a2, a3 = m.groups()
                    attack[num.zfill(2)] = {
                        'attack': float(a1), 'attack2': float(a2), 'attack3': float(a3),
                    }
            elif 'performance index defen' in head or 'performance index\ndefen' in head:
                for m in RE_FITNESS.finditer(text):
                    num, _, _, _, d1, d2, d3 = m.groups()
                    defence[num.zfill(2)] = {
                        'defence': float(d1), 'defence2': float(d2), 'defence3': float(d3),
                    }

    return {
        'overall': overall, 'fitness': fitness, 'attack': attack, 'defence': defence,
    }


if __name__ == '__main__':
    import sys, json
    path = sys.argv[1]
    out = parse(path)
    print(json.dumps({k: len(v) for k, v in out.items()}))
    if out['overall']:
        first = next(iter(out['overall'].values()))
        print('sample overall:', first)
