import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';
import { PlayerAvatar } from './PlayerAvatar';
import { ClubShield } from './ClubShield';
import { FedError, FedEmpty } from './FedState';
import { ratingLabel, rating10Color } from './ratings';
import { useFedYear } from './avYear';
import { lastName, plMatch } from './utils';
import './federation.css';

type Line = 'GK' | 'DEF' | 'MID' | 'FWD';
interface XiPlayer {
  id: number; name: string; club: string | null; clubLogo: string | null; photo: string | null;
  line: Line; position: string | null; rating: number | null; mp: number; pct: number;
  year?: number; // присваивается только при сборке совокупной XI (когорта, из которой взят игрок)
}
interface Cohort { year: number; ratedCount: number; clubs: number; xi: XiPlayer[]; }

const LINE_TAG: Record<Line, string> = { GK: 'ВРТ', DEF: 'ЗАЩ', MID: 'ПЗ', FWD: 'НАП' };
const SLOTS: Record<Line, Array<{ l: number; t: number }>> = {
  GK: [{ l: 50, t: 88 }],
  DEF: [{ l: 14, t: 70 }, { l: 38, t: 74 }, { l: 62, t: 74 }, { l: 86, t: 70 }],
  MID: [{ l: 24, t: 50 }, { l: 50, t: 46 }, { l: 76, t: 50 }],
  FWD: [{ l: 24, t: 22 }, { l: 50, t: 18 }, { l: 76, t: 22 }],
};
const LINE_ORDER: Line[] = ['GK', 'DEF', 'MID', 'FWD'];
const pctRing = (pct: number): string =>
  pct >= 97 ? 'var(--success)' : pct >= 93 ? 'var(--accent)' : 'var(--text-secondary)';

export function BestXiBody() {
  const { year: globalYear } = useFedYear();
  const { data, isLoading, error } = useQuery({
    queryKey: ['av', 'best-xi'],
    queryFn: () => api<{ cohorts: Cohort[] }>('/federation/av/best-xi'),
  });
  const cohorts = useMemo(() => (data?.cohorts ?? []).slice().sort((a, b) => b.year - a.year), [data]);
  const [peek, setPeek] = useState<XiPlayer | null>(null);

  // «Все» (globalYear == null) → СОВОКУПНАЯ сборная региона: объединяем xi всех когорт
  // (каждый — топ-по-линии своей когорты, значит в союзе лежат сильнейшие региона по линии),
  // помечаем каждого годом его когорты, и в каждой линии берём top-N по АБСОЛЮТНОМУ рейтингу
  // (число слотов = SLOTS[line].length → 1 ВРТ / 4 ЗАЩ / 3 ПЗ / 3 НАП = 11).
  const unionXi = useMemo<XiPlayer[]>(() => {
    if (cohorts.length === 0) return [];
    const byLine: Record<Line, XiPlayer[]> = { GK: [], DEF: [], MID: [], FWD: [] };
    for (const cohort of cohorts) {
      for (const p of cohort.xi) byLine[p.line].push({ ...p, year: cohort.year });
    }
    const out: XiPlayer[] = [];
    for (const line of LINE_ORDER) {
      const top = byLine[line]
        .slice()
        .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))
        .slice(0, SLOTS[line].length);
      out.push(...top);
    }
    return out;
  }, [cohorts]);

  const isUnion = globalYear == null && cohorts.length > 0;
  const cohort = globalYear != null ? cohorts.find((c) => c.year === globalYear) ?? null : null;
  // xi для отрисовки: при «Все» — совокупная, иначе — выбранная когорта.
  const activeXi = isUnion ? unionXi : cohort?.xi ?? [];

  const placed = useMemo(() => {
    if (activeXi.length === 0) return [];
    const idx: Record<Line, number> = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
    const out: Array<{ slot: { l: number; t: number }; player: XiPlayer }> = [];
    for (const line of LINE_ORDER) {
      const inLine = activeXi.filter((p) => p.line === line);
      for (const player of inLine) {
        const slot = SLOTS[line][idx[line]++];
        if (slot) out.push({ slot, player });
      }
    }
    return out;
  }, [activeXi]);

  return (
    <>
      {error && <FedError />}

      <div className="fed-card" style={{ position: 'relative', overflow: 'hidden' }}>
        {isLoading ? (
          <div className="fed-skeleton" style={{ aspectRatio: '4 / 5' }} />
        ) : activeXi.length === 0 ? (
          <FedEmpty>Недостаточно разобранных игроков для формирования сборной.</FedEmpty>
        ) : (
          <>
            <div style={{ marginBottom: 16 }}>
              <h3 style={{ fontSize: 20, fontWeight: 400, margin: 0 }}>
                {isUnion ? 'Сборная региона · все возрасты' : `Сборная ${cohort!.year} года рождения`}
              </h3>
              <p className="fed-note">
                {isUnion
                  ? 'лучшие по рейтингу в каждой линии со всех когорт'
                  : `${cohort!.ratedCount.toLocaleString('ru-RU')} оценённых · ${cohort!.clubs} клубов`}
              </p>
            </div>

            {/* Pitch */}
            <div style={{ position: 'relative', aspectRatio: '4 / 5', borderRadius: 'var(--radius)', overflow: 'hidden', background: 'linear-gradient(180deg, #1a4a2a, #0e3d1f)' }}>
              <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} aria-hidden>
                <rect x="0" y="0" width="100" height="100" fill="url(#grass)" />
                <defs>
                  <linearGradient id="grass" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#1a4a2a" /><stop offset="50%" stopColor="#0e3d1f" /><stop offset="100%" stopColor="#1a4a2a" />
                  </linearGradient>
                </defs>
                {[0,1,2,3,4,5,6,7,8,9].map((i) => <rect key={i} x="0" y={i*10} width="100" height="10" fill={i%2 ? 'rgba(255,255,255,0.03)' : 'transparent'} />)}
                <g fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="0.4">
                  <rect x="2" y="2" width="96" height="96" />
                  <line x1="2" y1="50" x2="98" y2="50" />
                  <circle cx="50" cy="50" r="9" />
                  <rect x="24" y="2" width="52" height="14" />
                  <rect x="38" y="2" width="24" height="5.5" />
                  <rect x="24" y="84" width="52" height="14" />
                  <rect x="38" y="92.5" width="24" height="5.5" />
                </g>
              </svg>

              {placed.map(({ slot, player }) => {
                // В совокупной сборной ring по перцентилю не имеет смысла (игроки из разных
                // когорт) — красим обводку линией-нейтралью; чип «топ X%» меняем на герб + год.
                const ring = isUnion ? 'var(--text-secondary)' : pctRing(player.pct);
                const title = isUnion
                  ? `${player.name}${player.club ? ` · ${player.club}` : ''} · ${LINE_TAG[player.line]}${player.year ? ` · ${player.year} г.р.` : ''}`
                  : `${player.name}${player.club ? ` · ${player.club}` : ''} · ${LINE_TAG[player.line]} · топ ${player.pct}% линии`;
                return (
                  <button
                    key={player.id} type="button"
                    style={{ position: 'absolute', left: `${slot.l}%`, top: `${slot.t}%`, transform: 'translate(-50%, -50%)', zIndex: 2, background: 'none', border: 'none', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}
                    title={title}
                    onClick={() => setPeek(player)}
                  >
                    <span style={{ borderRadius: '50%', boxShadow: `0 0 0 2px ${ring}, 0 3px 7px rgba(0,0,0,0.55)`, display: 'block' }}>
                      <PlayerAvatar name={player.name} photoUrl={player.photo} size={46} ring={player.line === 'GK'} />
                      <span style={{ position: 'absolute', bottom: -4, right: -4, minWidth: 22, padding: '1px 4px', fontSize: 11, fontWeight: 800, background: 'rgba(8,12,20,0.92)', border: '1.5px solid rgba(255,255,255,0.16)', borderRadius: 7, color: rating10Color(player.rating) }}>{ratingLabel(player.rating)}</span>
                    </span>
                    <span style={{ fontSize: 10, fontWeight: 700, color: ring, textTransform: 'uppercase' }}>{LINE_TAG[player.line]}</span>
                    <span style={{ fontSize: 11, fontWeight: 600, color: '#fff', background: 'rgba(0,0,0,0.5)', padding: '2px 8px', borderRadius: 6, whiteSpace: 'nowrap' }}>{lastName(player.name)}</span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '2px 7px', borderRadius: 6, background: 'rgba(0,0,0,0.42)', whiteSpace: 'nowrap' }}>
                      <ClubShield name={player.club ?? player.name} logoUrl={player.clubLogo} size={15} />
                      {isUnion ? (
                        <span style={{ fontSize: 9.5, fontWeight: 700, color: '#fff', fontVariantNumeric: 'tabular-nums' }}>{player.year ? `${player.year} г.р.` : '—'}</span>
                      ) : (
                        <span style={{ fontSize: 9.5, fontWeight: 700, color: ring, fontVariantNumeric: 'tabular-nums' }}>топ {player.pct}% линии</span>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>

            <p className="fed-note" style={{ marginTop: 16 }}>
              {isUnion
                ? 'Совокупная сборная региона — сильнейшие по абсолютному рейтингу в каждой линии со всех возрастов. По данным разбора двух высших лиг.'
                : 'Перцентиль — позиция внутри линии среди оценённых игроков региона. По данным разбора двух высших лиг.'}
            </p>
          </>
        )}
      </div>

      {peek && <XiPeek p={peek} onClose={() => setPeek(null)} />}
    </>
  );
}

function XiPeek({ p, onClose }: { p: XiPlayer; onClose: () => void }) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 60, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: 32, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(6px)' }} onClick={onClose} role="presentation">
      <div className="fed-card" style={{ width: '100%', maxWidth: 400, position: 'relative', marginTop: 56 }} onClick={(e) => e.stopPropagation()} role="dialog" aria-label={p.name}>
        <button type="button" onClick={onClose} aria-label="Закрыть" style={{ position: 'absolute', top: 12, right: 14, width: 30, height: 30, borderRadius: 8, fontSize: 18, background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-secondary)', cursor: 'pointer' }}>✕</button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
          <PlayerAvatar name={p.name} photoUrl={p.photo} size={66} ring />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--text)' }}>{p.name}</div>
            <div className="fed-note">{p.club ?? '—'}{p.position ? ` · ${p.position}` : ''}{p.year ? ` · ${p.year} г.р.` : ` · топ ${p.pct}%`}</div>
          </div>
          <span style={{ marginLeft: 'auto', fontSize: 24, fontWeight: 700, color: rating10Color(p.rating) }}>{ratingLabel(p.rating)}</span>
        </div>
        <div className="fed-note">{p.mp ? `Средний рейтинг за ${p.mp} ${plMatch(p.mp)}` : 'Средний рейтинг по матчам'}</div>
      </div>
    </div>
  );
}
