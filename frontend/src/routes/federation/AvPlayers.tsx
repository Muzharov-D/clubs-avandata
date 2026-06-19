import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../../api/client';
import { PlayerAvatar } from './PlayerAvatar';
import { FedError, FedEmpty } from './FedState';
import { ratingColor } from './ratings';
import { useFedYear, fedQ } from './avYear';
import './avandata.css';

interface RPlayer { id: number; name: string; birthYear: number | null; position: string | null; club: string | null; clubLogo: string | null; photo?: string | null; rating: number | null; mp?: number }

const lastName = (s: string) => { const w = s.trim().split(/\s+/); return w.length > 1 ? w[w.length - 1] : s; };

// Амплуа игрока → слот сборной (точная карта позиций по ТЗ владельца).
// ЦЗ: центральные защитники · ПЗ/ЛЗ: фланговые защ./фулбеки · ЦП: ВСЕ
// опорные/центральные/атакующие полузащ. (вкл. «правый/левый атакующий») ·
// ПН/ЛН: фланговый полузащ.(вингер) ИЛИ фланговый нап. · ЦН: центрфорварды.
type Cat = 'GK' | 'LB' | 'CB' | 'RB' | 'CM' | 'LW' | 'CF' | 'RW';
const catOf = (pos: string | null): Cat | null => {
  const p = (pos ?? '').toLowerCase();
  if (/врат/.test(p)) return 'GK';
  if ((/защит/.test(p) || /фулбек/.test(p)) && !/полуз/.test(p)) {
    if (/центральн/.test(p)) return 'CB';
    if (/прав/.test(p)) return 'RB';
    if (/лев/.test(p)) return 'LB';
    return 'CB';
  }
  if (/полуз/.test(p)) {
    if (/опорн|атакующ|центральн/.test(p)) return 'CM';   // в центр поля
    if (/прав/.test(p)) return 'RW';                       // правый полузащитник = вингер
    if (/лев/.test(p)) return 'LW';
    return 'CM';
  }
  if (/напад/.test(p) || /форвард/.test(p)) {
    if (/центральн/.test(p)) return 'CF';
    if (/прав/.test(p)) return 'RW';
    if (/лев/.test(p)) return 'LW';
    return 'CF';
  }
  return null;
};
// Сторона амплуа — для раскладки внутри слотов одной категории (ЦЗ×2, ЦП×3).
const sideScore = (pos: string | null): number => {
  const p = (pos ?? '').toLowerCase();
  if (/прав/.test(p)) return 1;
  if (/лев/.test(p)) return -1;
  return 0;
};
const plMatch = (n: number) => { const a = n % 100, b = n % 10; if (a >= 11 && a <= 14) return 'матчей'; if (b === 1) return 'матч'; if (b >= 2 && b <= 4) return 'матча'; return 'матчей'; };

// 4-3-3 по ТЗ: ВРТ · ЛЗ-ЦЗ-ЦЗ-ПЗ · ЦП×3 · ЛН-ЦН-ПН (атака вверх). Слот = категория.
type Slot = { cat: Cat; l: number; t: number; tag: string };
const SLOTS: Slot[] = [
  { cat: 'GK', l: 50, t: 88, tag: 'ВРТ' },
  { cat: 'LB', l: 14, t: 70, tag: 'ЛЗ' }, { cat: 'CB', l: 38, t: 74, tag: 'ЦЗ' }, { cat: 'CB', l: 62, t: 74, tag: 'ЦЗ' }, { cat: 'RB', l: 86, t: 70, tag: 'ПЗ' },
  { cat: 'CM', l: 24, t: 50, tag: 'ЦП' }, { cat: 'CM', l: 50, t: 46, tag: 'ЦП' }, { cat: 'CM', l: 76, t: 50, tag: 'ЦП' },
  { cat: 'LW', l: 24, t: 24, tag: 'ЛН' }, { cat: 'CF', l: 50, t: 20, tag: 'ЦН' }, { cat: 'RW', l: 76, t: 24, tag: 'ПН' },
];

/** Таланты региона — реестр + «Сборная региона» (лучшие по позициям на данных). */
export function FederationAvPlayers() {
  const { year, division } = useFedYear();
  const { data, isLoading, error } = useQuery({ queryKey: ['av', 'players', year, division], queryFn: () => api<{ players: RPlayer[] }>(`/federation/av/players${fedQ(year, division)}`) });
  const players = data?.players ?? [];
  const [club, setClub] = useState('all');
  const [qStr, setQStr] = useState('');
  const [peek, setPeek] = useState<RPlayer | null>(null);

  const clubs = useMemo(() => Array.from(new Set(players.map((p) => p.club).filter(Boolean))).sort() as string[], [players]);
  // «С рейтингом» — минимум 2 оценённых матча (рейтинг = среднее по матчам, не пик).
  const ratedTotal = useMemo(() => players.filter((p) => (p.mp ?? 0) >= 2).length, [players]);
  const shown = useMemo(() => {
    // При поиске ищем по всем; при обычном просмотре — только игроки с рейтингом (≥2 матчей).
    let list = qStr.trim() ? players : players.filter((p) => (p.mp ?? 0) >= 2);
    if (club !== 'all') list = list.filter((p) => p.club === club);
    if (qStr.trim()) { const q = qStr.toLowerCase(); list = list.filter((p) => p.name.toLowerCase().includes(q)); }
    return list.slice(0, 250);
  }, [players, club, qStr]);

  // Сборная региона: на каждый слот — лучшие игроки СВОЕЙ категории амплуа
  // (ЦЗ — 2, ЦП — 3, остальные — по 1). Без «добора»: нет правого защитника —
  // слот ПЗ пустой (честно показывает перекос состава).
  const xi = useMemo(() => {
    const empty = (): Record<Cat, RPlayer[]> => ({ GK: [], LB: [], CB: [], RB: [], CM: [], LW: [], CF: [], RW: [] });
    const byCat = empty();
    for (const p of players) if (p.rating != null && (p.mp ?? 0) >= 2) { const c = catOf(p.position); if (c) byCat[c].push(p); }
    const slotsByCat = empty() as unknown as Record<Cat, Slot[]>;
    SLOTS.forEach((s) => slotsByCat[s.cat].push(s));
    const pick = new Map<Slot, RPlayer>();
    (Object.keys(slotsByCat) as Cat[]).forEach((cat) => {
      const free = [...slotsByCat[cat]];
      const top = [...byCat[cat]].sort((a, b) => (b.rating as number) - (a.rating as number)).slice(0, free.length);
      // Внутри категории лучший первым берёт слот, ближайший к своей стороне
      // (для ЦЗ×2 и ЦП×3: левый-уклон — левее, правый — правее).
      for (const p of top) {
        const ideal = 50 + sideScore(p.position) * 36;
        let bi = 0, bd = Infinity;
        free.forEach((s, i) => { const d = Math.abs(s.l - ideal); if (d < bd) { bd = d; bi = i; } });
        const [s] = free.splice(bi, 1);
        if (s) pick.set(s, p);
      }
    });
    return SLOTS.map((s) => ({ ...s, player: pick.get(s) }));
  }, [players]);
  const xiFilled = xi.filter((s) => s.player).length;

  // Запасные сборной — лучшие за пределами стартовой XI: показываем глубину обоймы
  // региона (а не только 11 имён). По среднему рейтингу, ≥2 матчей, без тех, кто в XI.
  const bench = useMemo(() => {
    const xiIds = new Set(xi.map((s) => s.player?.id).filter((x): x is number => x != null));
    return players
      .filter((p) => p.rating != null && (p.mp ?? 0) >= 2 && !xiIds.has(p.id))
      .sort((a, b) => (b.rating as number) - (a.rating as number))
      .slice(0, 7);
  }, [players, xi]);

  // Восходящие — высокий рейтинг среди МЛАДШИХ когорт (честный сигнал «кто растёт»):
  // ядро работы федерации — заметить талант в младших, пока есть время дать ему ход.
  const rising = useMemo(() => {
    const rated = players.filter((p) => p.rating != null && p.birthYear != null && (p.mp ?? 0) >= 2);
    if (rated.length < 3) return [] as RPlayer[];
    const years = Array.from(new Set(rated.map((p) => p.birthYear!))).sort((a, b) => b - a);
    const young = new Set(years.slice(0, 2));
    return rated.filter((p) => young.has(p.birthYear!)).sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0)).slice(0, 12);
  }, [players]);
  const risingYears = useMemo(() => Array.from(new Set(rising.map((p) => p.birthYear!))).sort((a, b) => b - a), [rising]);

  return (
    <>
      <header className="av-head av-rise">
        <div className="av-head__l">
          <h1 className="av-title">Игроки региона</h1>
          <p className="av-sub">{players.length.toLocaleString('ru-RU')} разобранных игроков · клик → профиль</p>
        </div>
        <input className="av-search" placeholder="Поиск по имени…" value={qStr} onChange={(e) => setQStr(e.target.value)} />
      </header>

      {error && <FedError />}

      <div className="av-split av-rise">
        {/* Реестр */}
        <section className="av-surface av-pad-lg">
          <div className="av-section"><h2 className="av-section-title">Рейтинг игроков</h2></div>

          {clubs.length > 1 && (
            <select className="av-select" value={club} onChange={(e) => setClub(e.target.value)} aria-label="Фильтр по клубу">
              <option value="all">Все клубы ({clubs.length})</option>
              {clubs.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          )}

          {isLoading ? [0, 1, 2, 3, 4, 5, 6].map((i) => <div key={i} className="av-skeleton" style={{ height: 42, marginBottom: 8 }} />)
            : shown.length === 0 ? <FedEmpty icon="🎯">Никого не нашли по фильтру.</FedEmpty>
              : shown.map((p, i) => (
                <Link key={p.id} to={`/federation/players/${p.id}`} className="av-trow t-reg av-trow--link">
                  <span className="av-trow__rank">{i + 1}</span>
                  <PlayerAvatar name={p.name} photoUrl={p.photo} size={26} />
                  <div style={{ minWidth: 0 }}>
                    <div className="av-trow__name">{p.name}</div>
                    <div className="av-trow__meta">{p.club ?? '—'}{p.position ? ` · ${p.position}` : ''}{p.birthYear ? ` · ${p.birthYear}` : ''}</div>
                  </div>
                  <span className="av-rate" style={{ color: ratingColor(p.rating) }}>{p.rating ?? '—'}</span>
                </Link>
              ))}
          {!isLoading && !qStr.trim() && ratedTotal > shown.length && (
            <p className="av-cap">Показаны топ-{shown.length} из {ratedTotal.toLocaleString('ru-RU')} с рейтингом (≥2 матчей) — уточни клубом или поиском.</p>
          )}
        </section>

        {/* Сборная региона + восходящие */}
        <aside className="av-sticky">
          <section className="av-surface av-surface--feature av-pad-lg">
            <div className="av-section" style={{ marginBottom: 10 }}>
              <div>
                <h2 className="av-section-title">Лучшие игроки региона</h2>
                <p className="av-section-sub">Лучшие по реальным позициям · клик по игроку — карточка · пустой слот = нет игрока</p>
              </div>
            </div>
            {isLoading ? <div className="av-skeleton" style={{ aspectRatio: '4 / 5' }} /> : xiFilled < 4 ? (
              <div className="av-note">Мало разобранных игроков для сборной.</div>
            ) : (
              <div className="av-pitch">
                <svg className="av-pitch__field" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                  <defs>
                    <linearGradient id="av-grass" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#176b3c" /><stop offset="50%" stopColor="#0e4d2a" /><stop offset="100%" stopColor="#176b3c" />
                    </linearGradient>
                  </defs>
                  <rect x="0" y="0" width="100" height="100" fill="url(#av-grass)" />
                  {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => <rect key={i} x="0" y={i * 10} width="100" height="10" fill={i % 2 ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.07)'} />)}
                  <g fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="0.4">
                    <rect x="2" y="2" width="96" height="96" />
                    <line x1="2" y1="50" x2="98" y2="50" />
                    <circle cx="50" cy="50" r="9" />
                    <rect x="24" y="2" width="52" height="14" />
                    <rect x="38" y="2" width="24" height="5.5" />
                    <rect x="24" y="84" width="52" height="14" />
                    <rect x="38" y="92.5" width="24" height="5.5" />
                  </g>
                  <circle cx="50" cy="50" r="0.7" fill="rgba(255,255,255,0.5)" />
                </svg>
                {xi.map((s, idx) => {
                  const pl = s.player;
                  return pl ? (
                    <button key={idx} type="button" className="av-slot av-slot--filled av-slot--btn" style={{ left: `${s.l}%`, top: `${s.t}%` }} title={`${pl.name} · ${s.tag}`} onClick={() => setPeek(pl)}>
                      <span className="av-slot__node">
                        <PlayerAvatar name={pl.name} photoUrl={pl.photo} size={46} ring={s.cat === 'GK'} />
                        <span className="av-slot__badge" style={{ color: ratingColor(pl.rating) }}>{pl.rating}</span>
                      </span>
                      <span className="av-slot__name">{lastName(pl.name)}</span>
                    </button>
                  ) : (
                    <span key={idx} className="av-slot" style={{ left: `${s.l}%`, top: `${s.t}%` }}>
                      <span className="av-slot__empty" />
                      <span className="av-slot__tag">{s.tag}</span>
                    </span>
                  );
                })}
              </div>
            )}
            {!isLoading && xiFilled >= 4 && bench.length > 0 && (
              <div className="av-bench">
                <div className="av-bench__title">Запасные — ещё {bench.length} в обойме региона</div>
                <div className="av-bench__row">
                  {bench.map((p) => (
                    <button key={p.id} type="button" className="av-bench__chip" onClick={() => setPeek(p)} title={`${p.name}${p.position ? ` · ${p.position}` : ''}`}>
                      <PlayerAvatar name={p.name} photoUrl={p.photo} size={30} />
                      <span className="av-bench__id">
                        <span className="av-bench__name">{lastName(p.name)}</span>
                        <span className="av-bench__pos">{p.position ?? '—'}</span>
                      </span>
                      <span className="av-bench__rate" style={{ color: ratingColor(p.rating) }}>{p.rating}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </section>
        </aside>
      </div>

      {rising.length > 0 && (
        <section className="av-surface av-pad-lg av-rise">
          <div className="av-section">
            <div>
              <h2 className="av-section-title">Восходящие игроки</h2>
              <p className="av-section-sub">Сильнейшие в младших когортах{risingYears.length ? ` · ${risingYears.join(' · ')} г.р.` : ''} — кого регион обязан не потерять</p>
            </div>
          </div>
          <div className="av-rising-grid">
            {rising.map((p, i) => (
              <Link key={p.id} to={`/federation/players/${p.id}`} className="av-surface-soft av-rcard">
                <span className="av-rcard__rank">{i + 1}</span>
                <PlayerAvatar name={p.name} photoUrl={p.photo} size={42} />
                <div className="av-rcard__id">
                  <div className="av-rcard__name" title={p.name}>{p.name}</div>
                  <div className="av-rcard__meta">{p.club ?? '—'}{p.position ? ` · ${p.position}` : ''}</div>
                </div>
                <span className="av-rcard__year" title="год рождения">{p.birthYear}</span>
                <span className="av-rcard__rate" style={{ color: ratingColor(p.rating) }}>{p.rating}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      {peek && <XiPeek p={peek} onClose={() => setPeek(null)} />}
    </>
  );
}

/** Карточка игрока из «сборной» — открывается по клику на поле, без ухода со страницы. */
function XiPeek({ p, onClose }: { p: RPlayer; onClose: () => void }) {
  return (
    <div className="av-modal__backdrop" onClick={onClose} role="presentation">
      <div className="av-peek" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={p.name}>
        <button type="button" className="av-modal__close" onClick={onClose} aria-label="Закрыть">✕</button>
        <div className="av-peek__head">
          <PlayerAvatar name={p.name} photoUrl={p.photo} size={66} ring />
          <div style={{ minWidth: 0 }}>
            <div className="av-peek__name">{p.name}</div>
            <div className="av-peek__meta">{p.club ?? '—'}{p.position ? ` · ${p.position}` : ''}{p.birthYear ? ` · ${p.birthYear} г.р.` : ''}</div>
          </div>
          <span className="av-peek__rate" style={{ color: ratingColor(p.rating) }}>{p.rating ?? '—'}</span>
        </div>
        <div className="av-peek__foot">
          <span className="av-peek__mp">{p.mp ? `средний рейтинг за ${p.mp} ${plMatch(p.mp)}` : 'средний рейтинг по матчам'}</span>
          <Link to={`/federation/players/${p.id}`} className="av-link" onClick={onClose}>Открыть профиль →</Link>
        </div>
      </div>
    </div>
  );
}
