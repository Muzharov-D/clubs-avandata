import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';
import { PlayerAvatar } from './PlayerAvatar';
import { FedError, FedEmpty } from './FedState';
import { ratingLabel, rating10Color } from './ratings';
import { useFedYear } from './avYear';
import './avandata.css';

/**
 * «Сборная региона» — лучшая XI (схема 1-4-3-3) по КОГОРТЕ года рождения,
 * собранная ВЖИВУЮ из рейтингов AvanData (оценённые игроки 2 верхних лиг
 * Первенства). Источник — /federation/av/best-xi (богатый мульти-клубный расчёт),
 * НЕ клубная БД. Селектор когорт (2013→2009) — клиентский, по умолчанию младшая.
 */

type Line = 'GK' | 'DEF' | 'MID' | 'FWD';
interface XiPlayer {
  id: number; name: string; club: string | null; clubLogo: string | null; photo: string | null;
  line: Line; position: string | null; rating: number | null; mp: number; pct: number;
}
interface Cohort { year: number; ratedCount: number; clubs: number; xi: XiPlayer[]; }

const lastName = (s: string) => { const w = s.trim().split(/\s+/); return w.length > 1 ? w[w.length - 1] : s; };

// Аббревиатура линии для подписи слота (русские, без англицизмов).
const LINE_TAG: Record<Line, string> = { GK: 'ВРТ', DEF: 'ЗАЩ', MID: 'ПЗ', FWD: 'НАП' };

// Координаты слотов схемы 1-4-3-3 на вертикальном поле (ВРТ снизу, НАП сверху).
// Порядок внутри линии совпадает с порядком, в котором их кладёт бэкенд (топ-рейтинг).
const SLOTS: Record<Line, Array<{ l: number; t: number }>> = {
  GK: [{ l: 50, t: 88 }],
  DEF: [{ l: 14, t: 70 }, { l: 38, t: 74 }, { l: 62, t: 74 }, { l: 86, t: 70 }],
  MID: [{ l: 24, t: 50 }, { l: 50, t: 46 }, { l: 76, t: 50 }],
  FWD: [{ l: 24, t: 22 }, { l: 50, t: 18 }, { l: 76, t: 22 }],
};
const LINE_ORDER: Line[] = ['GK', 'DEF', 'MID', 'FWD'];

// Кольцо/акцент по перцентилю внутри линии — ТОЛЬКО токены (white-label).
const pctRing = (pct: number): string =>
  pct >= 97 ? 'var(--av-success)' : pct >= 93 ? 'var(--av-accent)' : 'var(--av-text-dim)';

const plMatch = (n: number) => { const a = n % 100, b = n % 10; if (a >= 11 && a <= 14) return 'матчей'; if (b === 1) return 'матч'; if (b >= 2 && b <= 4) return 'матча'; return 'матчей'; };

export function FederationBestXi() {
  return (
    <>
      <header className="av-head av-rise">
        <div className="av-head__l">
          <h1 className="av-title">Сборная региона</h1>
          <p className="av-sub">Лучшие по индексу внутри линии · схема 1-4-3-3</p>
        </div>
      </header>
      <BestXiBody />
    </>
  );
}

/**
 * Тело «Сборной региона» — поле 1-4-3-3 по выбранной когорте. Следует ГЛОБАЛЬНОМУ
 * фильтру года (useFedYear): «все» → самая младшая когорта (там ядро работы
 * федерации). Рейтинги нормализованы в шкалу 0–10 (rating10Color/ratingLabel),
 * сырые сотни AvanData не показываем. Заголовок-секции внутри, без шапки экрана —
 * чтобы встраивать в «Таланты».
 */
export function BestXiBody() {
  const { year: globalYear } = useFedYear();
  const { data, isLoading, error } = useQuery({
    queryKey: ['av', 'best-xi'],
    queryFn: () => api<{ cohorts: Cohort[] }>('/federation/av/best-xi'),
  });
  const cohorts = useMemo(() => (data?.cohorts ?? []).slice().sort((a, b) => b.year - a.year), [data]);
  const [peek, setPeek] = useState<XiPlayer | null>(null);
  // Активная когорта: глобальный год (если он есть среди когорт), иначе младшая.
  const active = (globalYear != null ? cohorts.find((c) => c.year === globalYear) : null) ?? cohorts[0] ?? null;

  // Раскладываем XI когорты по слотам схемы: внутри каждой линии — по порядку с бэка.
  const placed = useMemo(() => {
    if (!active) return [];
    const idx: Record<Line, number> = { GK: 0, DEF: 0, MID: 0, FWD: 0 };
    const out: Array<{ slot: { l: number; t: number }; player: XiPlayer }> = [];
    for (const line of LINE_ORDER) {
      const inLine = active.xi.filter((p) => p.line === line);
      for (const player of inLine) {
        const slot = SLOTS[line][idx[line]++];
        if (slot) out.push({ slot, player });
      }
    }
    return out;
  }, [active]);

  return (
    <>
      {error && <FedError />}

      <section className="av-surface av-surface--feature av-pad-lg av-rise">
        {isLoading ? (
          <div className="av-skeleton" style={{ aspectRatio: '4 / 5' }} />
        ) : !active || active.xi.length === 0 ? (
          <FedEmpty>Мало разобранных игроков для сборной этой когорты.</FedEmpty>
        ) : (
          <>
            <div className="av-section" style={{ marginBottom: 12 }}>
              <div>
                <h2 className="av-section-title">Сборная {active.year} года рождения</h2>
                <p className="av-section-sub">
                  {active.ratedCount.toLocaleString('ru-RU')} оценённых · {active.clubs} {active.clubs === 1 ? 'клуб' : 'клубов'}
                  {globalYear == null ? ' · «Все» → младшая когорта; выбери год сверху' : ''} · клик по игроку — карточка
                </p>
              </div>
            </div>

            <div className="av-pitch">
              <svg className="av-pitch__field" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                <defs>
                  <linearGradient id="bestxi-grass" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#176b3c" /><stop offset="50%" stopColor="#0e4d2a" /><stop offset="100%" stopColor="#176b3c" />
                  </linearGradient>
                </defs>
                <rect x="0" y="0" width="100" height="100" fill="url(#bestxi-grass)" />
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

              {placed.map(({ slot, player }) => {
                const ring = pctRing(player.pct);
                return (
                  <button
                    key={player.id} type="button"
                    className="av-slot av-slot--filled av-slot--btn"
                    style={{ left: `${slot.l}%`, top: `${slot.t}%` }}
                    title={`${player.name} · ${LINE_TAG[player.line]} · топ ${player.pct}%`}
                    onClick={() => setPeek(player)}
                  >
                    <span className="av-slot__node" style={{ borderRadius: '50%', boxShadow: `0 0 0 2px ${ring}, 0 3px 7px rgba(0,0,0,0.55)` }}>
                      <PlayerAvatar name={player.name} photoUrl={player.photo} size={46} ring={player.line === 'GK'} />
                      <span className="av-slot__badge" style={{ color: rating10Color(player.rating) }}>{ratingLabel(player.rating)}</span>
                    </span>
                    <span className="av-slot__tag" style={{ color: ring }}>{LINE_TAG[player.line]}</span>
                    <span className="av-slot__name">{lastName(player.name)}</span>
                    <span
                      className="av-slot__name"
                      style={{ fontSize: 9, fontWeight: 600, color: 'var(--av-text-dim)', background: 'rgba(0,0,0,0.42)' }}
                    >
                      {player.club ?? '—'} · топ {player.pct}%
                    </span>
                  </button>
                );
              })}
            </div>

            <p className="av-cap" style={{ marginTop: 14 }}>
              Перцентиль — место внутри линии среди оценённых региона. По разбору верхних 2 лиг (AvanData).
            </p>
          </>
        )}
      </section>

      {peek && <XiPeek p={peek} onClose={() => setPeek(null)} />}
    </>
  );
}

/** Карточка игрока из сборной — по клику на поле, без ухода со страницы. */
function XiPeek({ p, onClose }: { p: XiPlayer; onClose: () => void }) {
  return (
    <div className="av-modal__backdrop" onClick={onClose} role="presentation">
      <div className="av-peek" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={p.name}>
        <button type="button" className="av-modal__close" onClick={onClose} aria-label="Закрыть">✕</button>
        <div className="av-peek__head">
          <PlayerAvatar name={p.name} photoUrl={p.photo} size={66} ring />
          <div style={{ minWidth: 0 }}>
            <div className="av-peek__name">{p.name}</div>
            <div className="av-peek__meta">{p.club ?? '—'}{p.position ? ` · ${p.position}` : ''} · топ {p.pct}% в линии</div>
          </div>
          <span className="av-peek__rate" style={{ color: rating10Color(p.rating) }}>{ratingLabel(p.rating)}</span>
        </div>
        <div className="av-peek__foot">
          <span className="av-peek__mp">{p.mp ? `средний рейтинг (0–10) за ${p.mp} ${plMatch(p.mp)}` : 'средний рейтинг по матчам'}</span>
        </div>
      </div>
    </div>
  );
}
