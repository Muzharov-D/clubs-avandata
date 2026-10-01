import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { FedError } from '../federation/FedState';
import { useHoldingAnalytics, useHoldingProfile, shortClub, type LeaguePlayer } from './api';
import { HdLoading } from './HoldingShell';
import { useNavQuery, useScope, useScopeLabel } from './scope';
import { Pitch, SLOTS, slotOf, IndexRing, indexColor, type SlotId } from './viz';

const surname = (name: string) => { const parts = name.trim().split(/\s+/); return parts.length > 1 ? `${parts[parts.length - 1]} ${parts[0]![0]}.` : name; };
const clubTag = (label: string) => (label.includes('Царское') ? 'ЦС' : 'Д');
const WEAK = 4;
const byIndex = (a: LeaguePlayer, b: LeaguePlayer) => (b.index ?? -1) - (a.index ?? -1) || (b.minutes ?? 0) - (a.minutes ?? 0);

/**
 * Доска комплектования: поле со схемой, на каждой позиции — игроки холдинга.
 * «Вертикаль» (все годы): на позиции стопка лет 2013→2009 с лучшим игроком каждого года —
 * видно, где за кем никого нет. «Команда» (выбран год): состав на позиции по глубине.
 * Цвет — индекс сезона против сверстников своей позиции в регионе.
 */
export function HoldingBoard() {
  const an = useHoldingAnalytics();
  const profile = useHoldingProfile();
  const scope = useScope();
  const label = useScopeLabel();
  const q = useNavQuery();

  const data = useMemo(() => {
    const a = an.data; if (!a) return null;
    const teams = a.teams.filter((t) => (!scope.club || t.clubKey === scope.club));
    const years = [...new Set(teams.map((t) => t.year))].sort((x, y) => y - x);
    const players = teams.flatMap((t) => t.squad).filter((p) => (p.minutes ?? 0) > 0 || p.mp > 0);
    const bySlot = new Map<SlotId, LeaguePlayer[]>();
    for (const p of players) { const s = slotOf(p.position); if (s) (bySlot.get(s) ?? bySlot.set(s, []).get(s)!).push(p); }
    // Позиции, на которых в разметке почти никто не играет (схема команды, а не дыра), не рисуем.
    const used = (Object.keys(SLOTS) as SlotId[]).filter((sl) => new Set((bySlot.get(sl) ?? []).map((p) => p.birthYear)).size >= Math.min(2, years.length));
    return { years, bySlot, clubs: new Set(teams.map((t) => t.clubKey)).size, used };
  }, [an.data, scope.club]);

  if (an.error) return <FedError subject="Комплектование" />;
  if (!data || !profile.data) return <HdLoading title="Расставляем по полю" text="Собираем игроков холдинга по позициям и годам." />;
  const teamMode = scope.year != null;
  const ageOf = (y: number) => profile.data?.teams.find((t) => t.year === y)?.ageTitle ?? '';

  // Где тонко: позиция × год без игрока или с индексом ниже 4.
  const gaps: Array<{ slot: SlotId; year: number; best: LeaguePlayer | null }> = [];
  const strong: Array<{ slot: SlotId; year: number; best: LeaguePlayer }> = [];
  const shown = teamMode ? (Object.keys(SLOTS) as SlotId[]).filter((sl) => (data.bySlot.get(sl) ?? []).some((p) => p.birthYear === scope.year) || data.used.includes(sl)) : data.used;
  for (const slot of shown) for (const y of (teamMode ? [scope.year as number] : data.years)) {
    const best = (data.bySlot.get(slot) ?? []).filter((p) => p.birthYear === y).sort(byIndex)[0] ?? null;
    if (!best || (best.index != null && best.index < WEAK)) gaps.push({ slot, year: y, best });
    else if (best.index != null && best.index >= 8) strong.push({ slot, year: y, best });
  }

  return (
    <div className="hd-board">
      <header className="hd-pagehead">
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="hd-kicker">Комплектование · <b>{label ?? 'весь холдинг'}</b></div>
          <h1 className="hd-h1">{teamMode ? `Состав ${scope.year} г.р. по позициям` : 'Вертикаль по позициям: кто за кем'}</h1>
          <p className="hd-lede">{teamMode
            ? 'На каждой позиции — игроки по глубине. Цвет — индекс сезона против сверстников своей позиции в регионе.'
            : 'На каждой позиции — лучший игрок каждого года, от младших к старшим. Пустое или красное место — там, где за этим игроком никого нет.'}</p>
        </div>
        <div className="hd-board__legend">
          {[[9, 'топ региона'], [7, 'сильный'], [5, 'середина'], [3, 'слабее'], [1, 'проблема']].map(([v, t]) => <span key={t as string}><i style={{ background: indexColor(v as number) }} />{t as string}</span>)}
        </div>
      </header>

      <Pitch className="hd-board__pitch">
        {shown.map((slot) => {
          const s = SLOTS[slot];
          const list = (data.bySlot.get(slot) ?? []);
          return (
            <div key={slot} className="hd-slot" style={{ left: `${s.x}%`, top: `${s.y}%` }}>
              <div className="hd-slot__title">{s.title}</div>
              {teamMode ? (
                <TeamSlot players={list.filter((p) => p.birthYear === scope.year).sort(byIndex)} q={q} showClub={data.clubs > 1} />
              ) : (
                <div className="hd-slot__years">
                  {data.years.map((y) => {
                    const best = list.filter((p) => p.birthYear === y).sort(byIndex)[0];
                    const depth = list.filter((p) => p.birthYear === y).length;
                    return (
                      <div key={y} className={`hd-slot__row${!best ? ' hd-slot__row--gap' : best.index != null && best.index < WEAK ? ' hd-slot__row--weak' : ''}`}>
                        <span className="hd-slot__year" title={ageOf(y)}>{String(y).slice(2)}</span>
                        {best ? (
                          <Link to={`/holding/players/${best.id}${q}`} className="hd-slot__name" title={`${best.name} · ${shortClub(best.clubLabel)} ${best.birthYear} · ${best.position ?? ''}${depth > 1 ? ` · ещё ${depth - 1} на позиции` : ''}`}>
                            {data.clubs > 1 && <span className="hd-slot__club">{clubTag(best.clubLabel)}</span>}{surname(best.name)}
                          </Link>
                        ) : <span className="hd-slot__name hd-slot__none">никого</span>}
                        <span className="hd-slot__idx" style={{ color: indexColor(best?.index) }}>{best?.index != null ? best.index.toFixed(1) : '—'}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </Pitch>

      <div className="hd-board__cols">
        <section className="card an">
          <div className="page-section-title">Где тонко <span className="an-model-tag">{gaps.length}</span></div>
          {gaps.length === 0 ? <div className="hd-muted">На всех позициях есть игрок с индексом от 4.</div> : (
            <ul className="hd-list">
              {gaps.sort((x, y) => y.year - x.year).map((g) => (
                <li key={`${g.slot}${g.year}`}>
                  <span><b>{SLOTS[g.slot].title}</b> · {g.year} г.р.</span>
                  <span className={g.best ? 'hd-warn' : 'hd-down'} style={{ fontWeight: 700 }}>{g.best ? `${surname(g.best.name)} ${g.best.index?.toFixed(1)}` : 'нет игрока'}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="card an">
          <div className="page-section-title">Где сильно <span className="an-model-tag">индекс 8+</span></div>
          {strong.length === 0 ? <div className="hd-muted">Пока нет позиций с игроком уровня топа региона.</div> : (
            <ul className="hd-list">
              {strong.sort((x, y) => (y.best.index ?? 0) - (x.best.index ?? 0)).map((g) => (
                <li key={`${g.slot}${g.year}`}>
                  <span><Link to={`/holding/players/${g.best.id}${q}`}>{g.best.name}</Link> <span className="hd-muted hd-small">· {SLOTS[g.slot].title.toLowerCase()} · {g.year}</span></span>
                  <span className="hd-up" style={{ fontWeight: 800 }}>{g.best.index?.toFixed(1)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function TeamSlot({ players, q, showClub }: { players: LeaguePlayer[]; q: string; showClub: boolean }) {
  if (!players.length) return <div className="hd-slot__empty">никого</div>;
  return (
    <div className="hd-slot__team">
      {players.slice(0, 3).map((p, i) => (
        <Link key={p.id} to={`/holding/players/${p.id}${q}`} className={`hd-slot__player${i === 0 ? ' hd-slot__player--first' : ''}`} title={`${p.name} · ${p.position ?? ''} · ${p.minutes ?? 0} мин`}>
          <IndexRing value={p.index} size={i === 0 ? 40 : 30} stroke={i === 0 ? 4 : 3} />
          <span className="hd-slot__pname">{showClub && <span className="hd-slot__club">{clubTag(p.clubLabel)}</span>}{surname(p.name)}</span>
        </Link>
      ))}
      {players.length > 3 && <span className="hd-slot__more">ещё {players.length - 3}</span>}
    </div>
  );
}

/** Состав одной команды на поле (страница команды): позиции по глубине, цвет — индекс. */
export function TeamPitch({ players, q }: { players: LeaguePlayer[]; q: string }) {
  const bySlot = new Map<SlotId, LeaguePlayer[]>();
  for (const p of players) { const s = slotOf(p.position); if (s) (bySlot.get(s) ?? bySlot.set(s, []).get(s)!).push(p); }
  const slots = (Object.keys(SLOTS) as SlotId[]).filter((s) => bySlot.has(s));
  return (
    <Pitch className="hd-board__pitch hd-teampitch">
      {slots.map((slot) => (
        <div key={slot} className="hd-slot" style={{ left: `${SLOTS[slot].x}%`, top: `${SLOTS[slot].y}%` }}>
          <div className="hd-slot__title">{SLOTS[slot].title}</div>
          <TeamSlot players={(bySlot.get(slot) ?? []).slice().sort(byIndex)} q={q} showClub={false} />
        </div>
      ))}
    </Pitch>
  );
}
