import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';
import { ClubShield } from './ClubShield';
import { ClubCard } from './ClubCard';
import { useFedYear, yearQ, inDivision } from './avYear';
import { ratingLabel, rating10Color } from './ratings';
import { fmtStamp, plMesto } from './utils';
import './federation.css';

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

// Режим сортировки единой таблицы: по очкам (порядок первенства) или по
// абсолютному рейтингу AvanData (методика продукта, не нормируем). Ранг-колонка
// следует за активной сортировкой.
type SortMode = 'points' | 'rating';

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
  const [sort, setSort] = useState<SortMode>('points');
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

  // Сортировка отображения: «по очкам» — порядок первенства (как пришёл с бэка);
  // «по рейтингу AvanData» — по абсолютному рейтингу desc (строки без рейтинга — в
  // хвост). Δ и ranked не трогаем (считаются от турнирной позиции); меняется только
  // порядок строк и ранг-колонка, которая следует за активной сортировкой.
  const sortedRows = useMemo<CombRow[]>(() => {
    const rows = combined?.rows ?? [];
    if (sort === 'points') return rows;
    return rows.slice().sort((a, b) => (b.rating ?? -Infinity) - (a.rating ?? -Infinity));
  }, [combined, sort]);

  return (
    <section className="fed-card">
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <p className="fed-card__sub">
            {year == null
              ? 'Суммарно по всем возрастам — каждый отдельно, не единое первенство'
              : 'Позиция в первенстве против рейтинга AvanData — кто перевыполняет'}
          </p>
        </div>
        <span className="fed-badge fed-badge--accent">{division} лига</span>
      </div>
      {st.data && <DataBadge source={st.data.source} degraded={st.data.degraded} asOf={st.data.asOf} />}

      {/* Сегментный переключатель сортировки: порядок первенства ↔ рейтинг AvanData.
          Ранг-колонка следует за активной сортировкой; Δ остаётся от турнирной позиции. */}
      <div role="tablist" aria-label="Сортировка таблицы" style={{ display: 'flex', gap: 8, marginTop: 16 }}>
        <button type="button" role="tab" aria-selected={sort === 'points'} className={`fed-pill${sort === 'points' ? ' fed-pill--active' : ''}`} onClick={() => setSort('points')}>
          по очкам
        </button>
        <button type="button" role="tab" aria-selected={sort === 'rating'} className={`fed-pill${sort === 'rating' ? ' fed-pill--active' : ''}`} onClick={() => setSort('rating')}>
          по рейтингу AvanData
        </button>
      </div>

      {st.isLoading || cr.isLoading ? <div className="fed-skeleton" style={{ height: 240 }} />
        : !combined || sortedRows.length === 0 ? <div className="fed-note">Нет данных по выбранному фильтру.</div>
        : <CombinedTable rows={sortedRows} sort={sort} onClub={setSelectedClub} />}

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
    ? { cls: 'fed-badge--warning', text: 'Зеркало AvanData — данные могут быть неполными', tip: 'Официальный API ФФСПб был недоступен — показано зеркало, в нём бывают пропуски команд.' }
    : source === 'ffspb'
      ? { cls: 'fed-badge--success', text: 'Официальные данные ФФСПб', tip: 'Турнирная таблица получена напрямую из официального API ФФСПб.' }
      : { cls: '', text: 'Данные AvanData по возрастам', tip: 'Агрегат по всем годам рождения из базы AvanData.' };
  return (
    <div className={`fed-badge ${cfg.cls}`} style={{ marginTop: 12 }} title={cfg.tip}>
      <span style={{ marginRight: 4 }}>{degraded ? '⚠' : '●'}</span>
      <span>{cfg.text}</span>
      {stamp && <span className="fed-table__muted" style={{ marginLeft: 4 }}>· обновлено {stamp}</span>}
    </div>
  );
}

function CombinedTable({ rows, sort, onClub }: { rows: CombRow[]; sort: SortMode; onClub: (id: number) => void }) {
  // Ранг следует за активной сортировкой: по очкам — место в первенстве (ranked),
  // по рейтингу — позиция среди клубов с рейтингом (строки без рейтинга — «—»).
  let rRank = 0;
  // Read-only вердикт лиги: синтез колонки Δ в слова (Δ — санкционированный критерий
  // «место↔рейтинг», без нормализации/медианы). Недовыполняющие = состав сильнее результата.
  const over = rows.filter((r) => r.delta != null && r.delta > 0).length;
  const under = rows.filter((r) => r.delta != null && r.delta < 0).length;
  return (
    <div style={{ marginTop: 16 }}>
      <table className="fed-table">
        <thead>
          <tr>
            <th style={{ width: 40 }} />
            <th />
            <th>Команда</th>
            <th className="fed-table__num">И</th>
            <th className="fed-table__num">В</th>
            <th className="fed-table__num">Н</th>
            <th className="fed-table__num">П</th>
            <th className="fed-table__num">±</th>
            <th className="fed-table__num">ОЧ</th>
            <th>Рейтинг</th>
            <th className="fed-table__num">Δ</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            // Номер строки по активной сортировке.
            const hasRank = sort === 'points' ? r.ranked : r.rating != null;
            const rankNo = sort === 'points' ? i + 1 : (r.rating != null ? ++rRank : null);
            return (
            <tr key={r.id} onClick={() => onClub(r.id)} style={{ cursor: 'pointer' }}>
              <td className="fed-table__num" style={{ color: hasRank ? ((rankNo ?? 99) <= 3 ? 'var(--accent)' : undefined) : 'var(--text-secondary)' }} title={hasRank ? undefined : (sort === 'points' ? 'Рейтинг есть, но команда ещё не играла' : 'Нет рейтинга AvanData')}>
                {hasRank ? rankNo : '—'}
              </td>
              <td><ClubShield name={r.name} logoUrl={r.logo} size={22} /></td>
              <td>
                <div className="fed-row__name" title={r.name}>{r.name}</div>
              </td>
              <td className="fed-table__muted">{r.played ?? '—'}</td>
              <td className="fed-table__num">{r.won ?? '—'}</td>
              <td className="fed-table__num">{r.drawn ?? '—'}</td>
              <td className="fed-table__num">{r.lost ?? '—'}</td>
              <td className="fed-table__num" style={{ color: r.goalDiff == null ? undefined : r.goalDiff > 0 ? 'var(--success)' : r.goalDiff < 0 ? 'var(--danger)' : undefined }}>
                {r.goalDiff == null ? '—' : pm(r.goalDiff)}
              </td>
              <td className="fed-table__num" style={{ fontWeight: 700 }}>{r.points ?? '—'}</td>
              <td style={{ color: rating10Color(r.rating) }} title="Клубный рейтинг AvanData (сумма рейтингов игроков)">{ratingLabel(r.rating)}</td>
              <td><DeltaChip delta={r.delta} /></td>
            </tr>
            );
          })}
        </tbody>
      </table>
      {(over > 0 || under > 0) && (
        <p className="fed-note" style={{ marginTop: 12, borderLeft: '3px solid var(--accent)', paddingLeft: 12 }}>
          <b>Вердикт лиги:</b> перевыполняют рейтинг — {over}, недовыполняют — {under}.{' '}
          {under > 0
            ? 'Недовыполняющие: состав сильнее результата. Вероятно, вопросы с тренировками или игровым временем.'
            : 'Все клубы реализуют свой состав.'}
        </p>
      )}
      <p className="fed-note">
        <b>Рейтинг</b> — клубный рейтинг AvanData (сумма рейтингов игроков). <b>Δ</b> — место в таблице против места по рейтингу: {' '}
        <span className="fed-badge fed-badge--success">▲</span> перевыполняет, {' '}
        <span className="fed-badge fed-badge--danger">▼</span> недовыполняет относительно своего рейтинга. Строки с «—» — есть рейтинг, но пока нет матчей в таблице.
      </p>
    </div>
  );
}

// Δ-чип: на сколько мест команда выше (перевыполняет) / ниже (недовыполняет) своего рейтинга.
function DeltaChip({ delta }: { delta: number | null }) {
  if (delta == null) return <span className="fed-table__muted">—</span>;
  if (delta === 0) return <span className="fed-table__muted" title="Совпадает со своим рейтингом">0</span>;
  const up = delta > 0, n = Math.abs(delta);
  return (
    <span className={up ? 'fed-badge fed-badge--success' : 'fed-badge fed-badge--danger'}
      title={up ? `Выше своего рейтинга на ${n} ${plMesto(n)} — перевыполняет` : `Ниже своего рейтинга на ${n} ${plMesto(n)} — недовыполняет`}>
      {up ? '▲' : '▼'}{n}
    </span>
  );
}
