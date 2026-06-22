import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';
import { ClubShield } from './ClubShield';
import { ClubCard } from './ClubCard';
import { useFedYear, yearQ, inDivision } from './avYear';
import { ratingLabel, rating10Color } from './ratings';
import './avandata.css';

interface StandRow { id: number; name: string; logo: string | null; played: number; won: number; drawn: number; lost: number; goalDiff: number; points: number }
interface RatingRow { id: number; name: string; logo: string | null; rating: number }
interface Group<T> { division: string; rows: T[] }
// Ответ /av/standings с провенансом: какой источник реально отдал таблицу и когда —
// чтобы честно показать «официальные ФФСПб» / «зеркало, может быть неполным».
interface StandingsResp { groups: Group<StandRow>[]; source?: 'ffspb' | 'mirror'; degraded?: boolean; asOf?: string }
// Строка единой таблицы: турнирная статистика + рейтинг AvanData + Δ (перевыполнение).
// Статы nullable: команда может быть в рейтинге, но ещё не в турнирной таблице
// (ranked=false) — её всё равно показываем, чтобы не «пропадала».
interface CombRow {
  id: number; name: string; logo: string | null;
  played: number | null; won: number | null; drawn: number | null; lost: number | null; goalDiff: number | null; points: number | null;
  rating: number | null; delta: number | null; ranked: boolean;
}
interface CombGroup { division: string; rows: CombRow[] }

const pm = (n: number) => (n > 0 ? `+${n}` : String(n));
// Дата+время выборки для бейджа свежести: «18 июн 14:32»
const fmtStamp = (iso?: string) => { if (!iso) return ''; try { return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(iso)); } catch { return ''; } };
// склонение «место»: 1 место · 2–4 места · 5+ мест (с учётом 11–14)
const plMesto = (n: number) => { const a = n % 100, b = n % 10; if (a >= 11 && a <= 14) return 'мест'; if (b === 1) return 'место'; if (b >= 2 && b <= 4) return 'места'; return 'мест'; };

const Sk = () => <div className="av-skeleton" style={{ height: 240 }} />;

/**
 * Турнирная таблица выбранной лиги — официальная картина первенства как секция
 * «Клубов»: позиция (И/В/Н/П · разница · очки) против рейтинга AvanData + Δ
 * (перевыполнение). Самонесущая, с собственным скелетоном: медленная первая
 * загрузка официальных ФФСПб не блокирует остальные блоки экрана «Клубы».
 *
 * Фильтры: год (когорта) — server-side через ?year; дивизион — клиентский фильтр
 * групп через inDivision (эндпоинт /av/standings читает только ?year), как и
 * прочие блоки «Клубов». Рейтинг — АБСОЛЮТНЫЙ (методика AvanData, не нормируем);
 * Δ — разница мест (целое: место по рейтингу − место в таблице).
 */
export function StandingsBody() {
  const { year, division } = useFedYear();
  const q = yearQ(year);
  const [selectedClub, setSelectedClub] = useState<number | null>(null);
  const st = useQuery({ queryKey: ['av', 'standings', year], queryFn: () => api<StandingsResp>(`/federation/av/standings${q}`) });
  const cr = useQuery({ queryKey: ['av', 'club-ratings', year], queryFn: () => api<{ groups: Group<RatingRow>[] }>(`/federation/av/club-ratings${q}`) });

  // Единая таблица выбранной лиги: турнирная позиция + рейтинг AvanData + Δ.
  // Δ = место по рейтингу − место в таблице: >0 клуб ВЫШЕ своего рейтинга
  // (перевыполняет), <0 НИЖЕ (недовыполняет). Дивизион фильтрует группы клиентски.
  const combined = useMemo<CombGroup | null>(() => {
    const sg = (st.data?.groups ?? []).find((g) => inDivision(g.division, division));
    const cg = (cr.data?.groups ?? []).find((g) => inDivision(g.division, division));
    if (!sg && !cg) return null;
    const standRows = sg?.rows ?? [];
    const rVal = new Map<number, number>();
    (cg?.rows ?? []).forEach((r) => rVal.set(r.id, r.rating));
    // Место по рейтингу считаем СРЕДИ команд таблицы — тот же знаменатель, что и
    // место по очкам, иначе Δ врёт, когда в рейтинге есть «лишняя» команда.
    const ratingRank = new Map<number, number>();
    [...standRows].sort((a, b) => (rVal.get(b.id) ?? -Infinity) - (rVal.get(a.id) ?? -Infinity))
      .forEach((r, i) => { if (rVal.has(r.id)) ratingRank.set(r.id, i + 1); });
    const ranked: CombRow[] = standRows.map((r, i) => {
      const rr = ratingRank.get(r.id);
      return { id: r.id, name: r.name, logo: r.logo, played: r.played, won: r.won, drawn: r.drawn, lost: r.lost, goalDiff: r.goalDiff, points: r.points, rating: rVal.has(r.id) ? rVal.get(r.id)! : null, delta: rr != null ? rr - (i + 1) : null, ranked: true };
    });
    // Команды с рейтингом, но ещё без турнирной таблицы — показываем отдельно (не теряем).
    const inStand = new Set(standRows.map((r) => r.id));
    const extra: CombRow[] = (cg?.rows ?? []).filter((r) => !inStand.has(r.id))
      .map((r) => ({ id: r.id, name: r.name, logo: r.logo, played: null, won: null, drawn: null, lost: null, goalDiff: null, points: null, rating: r.rating, delta: null, ranked: false }));
    return { division: (sg ?? cg)!.division, rows: [...ranked, ...extra] };
  }, [st.data, cr.data, division]);

  return (
    <section className="av-surface av-pad-lg av-rise">
      <div className="av-section">
        <div>
          <h2 className="av-section-title">Турнирная таблица</h2>
          <p className="av-section-sub" style={{ margin: '2px 0 0' }}>
            {year == null
              ? 'Свод по всем годам рождения — суммарно по когортам, не единое первенство'
              : 'Позиция в первенстве против рейтинга AvanData — кто перевыполняет'}
          </p>
        </div>
        <span className="av-divtag">{division} лига</span>
      </div>
      {st.data && <DataBadge source={st.data.source} degraded={st.data.degraded} asOf={st.data.asOf} />}
      {st.isLoading || cr.isLoading ? <Sk />
        : !combined || combined.rows.length === 0 ? <div className="av-note">Нет данных по выбранному фильтру.</div>
        : <CombinedTable g={combined} onClub={setSelectedClub} />}

      {selectedClub != null && <ClubCard clubId={selectedClub} onClose={() => setSelectedClub(null)} />}
    </section>
  );
}

// Бейдж провенанса данных: честно говорит, ОТКУДА таблица и КОГДА снята. Молчаливый
// фолбэк на зеркало (бывает неполным) теперь виден, а не прячется.
function DataBadge({ source, degraded, asOf }: { source?: 'ffspb' | 'mirror'; degraded?: boolean; asOf?: string }) {
  if (!source) return null;
  const stamp = fmtStamp(asOf);
  const cfg = degraded
    ? { cls: 'av-dbadge--warn', icon: '⚠', text: 'Зеркало AvanData — данные могут быть неполными', tip: 'Официальный API ФФСПб был недоступен — показано зеркало, в нём бывают пропуски команд.' }
    : source === 'ffspb'
      ? { cls: 'av-dbadge--ok', icon: '●', text: 'Официальные данные ФФСПб', tip: 'Турнирная таблица получена напрямую из официального API ФФСПб.' }
      : { cls: 'av-dbadge--muted', icon: '●', text: 'Свод AvanData по когортам', tip: 'Агрегат по всем годам рождения из базы AvanData.' };
  return (
    <div className={`av-dbadge ${cfg.cls}`} title={cfg.tip}>
      <span className="av-dbadge__dot">{cfg.icon}</span>
      <span>{cfg.text}</span>
      {stamp && <span className="av-dbadge__stamp">· обновлено {stamp}</span>}
    </div>
  );
}

const rankCls = (i: number) => `av-trow__rank${i < 3 ? ` av-trow__rank--${i + 1}` : ''}`;

function CombinedTable({ g, onClub }: { g: CombGroup; onClub: (id: number) => void }) {
  return (
    <div className="av-ctable">
      <div className="av-trow t-comb av-trow--cols">
        <span /><span />
        <span className="av-colh av-colh--l">Команда</span>
        <span className="av-trow__stats av-six"><span>И</span><span>В</span><span>Н</span><span>П</span><span>±</span><span>ОЧ</span></span>
        <span className="av-colh">Рейтинг</span>
        <span className="av-colh av-colh--c">Δ</span>
      </div>
      {g.rows.map((r, i) => (
        <button type="button" key={r.id} onClick={() => onClub(r.id)} className={`av-trow t-comb av-trow--btn${i === 0 && r.ranked ? ' av-trow--lead' : ''}${r.ranked ? '' : ' av-trow--ghost'}`}>
          <span className={r.ranked ? rankCls(i) : 'av-trow__rank'} title={r.ranked ? undefined : 'Есть рейтинг, но ещё нет в турнирной таблице'}>{r.ranked ? i + 1 : '—'}</span>
          <ClubShield name={r.name} logoUrl={r.logo} size={22} />
          <span className="av-trow__name" title={r.name}>{r.name}</span>
          <span className="av-trow__stats av-six">
            <span className="av-dim">{r.played ?? '—'}</span><span>{r.won ?? '—'}</span><span>{r.drawn ?? '—'}</span><span>{r.lost ?? '—'}</span>
            <span className={r.goalDiff == null ? 'av-dim' : r.goalDiff > 0 ? 'av-pos' : r.goalDiff < 0 ? 'av-neg' : 'av-dim'}>{r.goalDiff == null ? '—' : pm(r.goalDiff)}</span>
            <span className="av-trow__pts">{r.points ?? '—'}</span>
          </span>
          {/* Рейтинг AvanData — АБСОЛЮТНОЕ значение методики (ratingLabel, не нормируем);
              цвет-смысл — по нормализованной 0–10 шкале (rating10Color). */}
          <span className="av-crate" style={{ color: rating10Color(r.rating) }} title="Клубный рейтинг AvanData (сумма рейтингов игроков)">{ratingLabel(r.rating)}</span>
          <DeltaChip delta={r.delta} />
        </button>
      ))}
      <p className="av-table-legend">
        <b>Рейтинг</b> — клубный рейтинг AvanData (сумма рейтингов игроков).&ensp;<b>Δ</b> — место в таблице против места по рейтингу:&nbsp;
        <span className="av-delta av-delta--up av-delta--inline">▲</span> перевыполняет,&nbsp;
        <span className="av-delta av-delta--down av-delta--inline">▼</span> недовыполняет относительно своего рейтинга.&ensp;Строки с «—» — есть рейтинг, но пока нет матчей в таблице.
      </p>
    </div>
  );
}

// Δ-чип: на сколько мест команда выше (перевыполняет) / ниже (недовыполняет) своего рейтинга.
function DeltaChip({ delta }: { delta: number | null }) {
  if (delta == null) return <span className="av-delta av-delta--zero">—</span>;
  if (delta === 0) return <span className="av-delta av-delta--zero" title="Ровно на уровне своего рейтинга">0</span>;
  const up = delta > 0, n = Math.abs(delta);
  return (
    <span className={`av-delta ${up ? 'av-delta--up' : 'av-delta--down'}`}
      title={up ? `Выше своего рейтинга на ${n} ${plMesto(n)} — перевыполняет` : `Ниже своего рейтинга на ${n} ${plMesto(n)} — недовыполняет`}>
      {up ? '▲' : '▼'}{n}
    </span>
  );
}
