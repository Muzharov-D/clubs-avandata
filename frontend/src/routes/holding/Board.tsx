import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { FedError } from '../federation/FedState';
import { useHoldingAnalytics, useHoldingProfile, useCoachPositions, groupOf, shortClub, GROUP_PLURAL, GROUP_SHORT, type LeaguePlayer, type PositionGroup } from './api';
import { HdLoading } from './HoldingShell';
import { useNavQuery, useScope, useScopeLabel } from './scope';
import { Pitch, SLOTS, GROUP_PLACES, lineup, toSlots, depthSlot, groupGames, placedNote, IndexRing, indexColor, type Placed, type SlotId } from './viz';

/** Только фамилия — для тесной вертикали; полное имя — в подсказке. */
const lastName = (name: string) => { const parts = name.trim().split(/\s+/); return parts[parts.length - 1] ?? name; };
const surname = (name: string) => { const parts = name.trim().split(/\s+/); return parts.length > 1 ? `${parts[parts.length - 1]} ${parts[0]![0]}.` : name; };
/** Школа — как в рое на брифинге: точка — ФК Динамо, кольцо — Царское Село. */
const ClubDot = ({ label }: { label: string }) => <i className={`hd-dot hd-slot__club${label.includes('Царское') ? ' hd-dot--ring' : ''}`} title={label.includes('Царское') ? 'Царское Село' : 'ФК Динамо'} />;
const WEAK = 6.5;   // шкала 5–10: ниже — слабое место
/** Сначала игроки с полноценной выборкой, затем по индексу: один яркий матч не ставит в основу. */
const byIndex = (a: LeaguePlayer, b: LeaguePlayer) => Number(!!a.lowSample) - Number(!!b.lowSample) || (b.index ?? -1) - (a.index ?? -1) || (b.minutes ?? 0) - (a.minutes ?? 0);
const SLOT_IDS = Object.keys(SLOTS) as SlotId[];
const GROUP_IDS = Object.keys(GROUP_PLACES) as PositionGroup[];
const active = (p: LeaguePlayer) => (p.minutes ?? 0) > 0 || p.mp > 0;

/** Тренерские позиции: игрок → специализации. */
function useCoachMap(): Map<number, Set<PositionGroup>> {
  const cp = useCoachPositions();
  return useMemo(() => {
    const m = new Map<number, Set<PositionGroup>>();
    for (const x of cp.data?.positions ?? []) (m.get(x.playerId) ?? m.set(x.playerId, new Set()).get(x.playerId)!).add(x.group);
    return m;
  }, [cp.data]);
}

/** Запасные специализации: своя позиция, затем кого ставит тренер, затем кто здесь выходил. */
function depthOf(players: LeaguePlayer[], starters: Map<number, PositionGroup>, coach: Map<number, Set<PositionGroup>>): Placed[] {
  const out: Placed[] = [];
  for (const p of players) {
    const home = groupOf(p);
    const startsAt = starters.get(p.id);
    if (startsAt) {
      // Игрок основы — в глубине только там, где его видит тренер (кроме места, где он уже в основе).
      for (const g of coach.get(p.id) ?? []) if (g !== startsAt) out.push({ p, slot: depthSlot(p, g), group: g, home, games: groupGames(p).get(g) ?? 0, how: 'coach' });
      continue;
    }
    const gs = new Map(groupGames(p));
    for (const g of coach.get(p.id) ?? []) if (!gs.has(g)) gs.set(g, 0);
    if (home && !gs.has(home)) gs.set(home, p.mp);
    for (const [g, n] of gs) out.push({ p, slot: depthSlot(p, g), group: g, home, games: n, how: home === g ? 'main' : coach.get(p.id)?.has(g) ? 'coach' : 'played' });
  }
  const order = { main: 0, coach: 1, played: 2 } as const;
  return out.sort((x, y) => order[x.how] - order[y.how] || byIndex(x.p, y.p));
}

/**
 * Доска комплектования: поле со схемой 4-3-3, на каждом месте — игроки холдинга.
 * Отбор — по специализациям (центральные и крайние защитники, центральные полузащитники,
 * крайние и центральные нападающие), сторона не важна: фланг — по тому, где игрок чаще выходил,
 * в опорную зону — центральный полузащитник, сильнее всех в обороне (viz.lineup / toSlots).
 * «Вертикаль» (все годы): на месте стопка лет 2013→2009. «Команда» (выбран год): основа и глубина.
 * Год — команды, а не рождения.
 */
export function HoldingBoard() {
  const an = useHoldingAnalytics();
  const profile = useHoldingProfile();
  const scope = useScope();
  const label = useScopeLabel();
  const q = useNavQuery();
  const coach = useCoachMap();

  const data = useMemo(() => {
    const a = an.data; if (!a) return null;
    const teams = a.teams.filter((t) => (!scope.club || t.clubKey === scope.club));
    const years = [...new Set(teams.map((t) => t.year))].sort((x, y) => y - x);
    // Основа каждой команды по специализациям; по году — лучшие основы обеих школ.
    const startersByYear = new Map<number, Map<PositionGroup, Placed[]>>();
    const teamSlots = new Map<number, Map<SlotId, Placed[]>>();   // режим «Команда»: основы школ на местах
    const depthByYear = new Map<number, Placed[]>();
    for (const t of teams) {
      const players = t.squad.filter(active);
      const lu = lineup(players, byIndex, coach);
      const starters = new Map([...lu.values()].flat().map((x) => [x.p.id, x.group] as [number, PositionGroup]));
      const ys = startersByYear.get(t.year) ?? startersByYear.set(t.year, new Map()).get(t.year)!;
      for (const [g, xs] of lu) (ys.get(g) ?? ys.set(g, []).get(g)!).push(...xs);
      const ts = teamSlots.get(t.year) ?? teamSlots.set(t.year, new Map(SLOT_IDS.map((s) => [s, []]))).get(t.year)!;
      for (const [s, xs] of toSlots(lu)) ts.get(s)!.push(...xs);
      (depthByYear.get(t.year) ?? depthByYear.set(t.year, []).get(t.year)!).push(...depthOf(players, starters, coach));
    }
    const best = new Map<number, Map<SlotId, Placed[]>>();
    for (const [y, byGroup] of startersByYear) {
      const top = new Map<PositionGroup, Placed[]>();
      for (const [g, xs] of byGroup) top.set(g, xs.slice().sort((a, b) => byIndex(a.p, b.p)).slice(0, GROUP_PLACES[g]));
      best.set(y, toSlots(top));
    }
    return { years, best, teamSlots, depthByYear, startersByYear, clubs: new Set(teams.map((t) => t.clubKey)).size };
  }, [an.data, scope.club, coach]);

  if (an.error) return <FedError subject="Комплектование" />;
  if (!data || !profile.data) return <HdLoading title="Расставляем по полю" text="Собираем игроков холдинга по позициям и годам." />;
  const teamMode = scope.year != null;
  const ageOf = (y: number) => profile.data?.teams.find((t) => t.year === y)?.ageTitle ?? '';

  // Где тонко / где сильно — по специализациям: не хватает игроков на места основы или последний из основы слабый.
  const gaps: Array<{ g: PositionGroup; year: number; weakest: LeaguePlayer | null }> = [];
  const strong: Array<{ g: PositionGroup; year: number; best: LeaguePlayer }> = [];
  for (const y of (teamMode ? [scope.year as number] : data.years)) for (const g of GROUP_IDS) {
    const xs = (data.startersByYear.get(y)?.get(g) ?? []).map((x) => x.p).sort(byIndex).slice(0, GROUP_PLACES[g]);
    const weakest = xs[GROUP_PLACES[g] - 1] ?? null;
    if (!weakest || (weakest.index != null && weakest.index < WEAK)) gaps.push({ g, year: y, weakest });
    if (xs[0]?.index != null && xs[0].index >= 9) strong.push({ g, year: y, best: xs[0] });
  }

  return (
    <div className="hd-board">
      <header className="hd-pagehead">
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="hd-kicker">Комплектование · <b>{label ?? 'весь холдинг'}</b></div>
          <h1 className="hd-h1">{teamMode ? `Состав ${scope.year} г.р. по позициям` : 'Вертикаль по позициям: кто за кем'}</h1>
          <p className="hd-lede">{teamMode
            ? 'Основа и замена на каждой позиции схемы 4-3-3. Цвет — индекс сезона против сверстников своей специализации в регионе. Метка рядом с фамилией — основная позиция игрока, если он закрывает другую.'
            : 'На каждой позиции — лучший игрок каждого года, от младших к старшим. Отбор — по специализации, сторона не важна; в опорную зону встаёт центральный полузащитник, сильнее всех в обороне. Красное — слабое место.'}</p>
        </div>
        <div className="hd-board__legend">
          {[[9.5, 'топ региона'], [8.5, 'сильный'], [7.5, 'середина'], [6.5, 'слабее'], [5.5, 'проблема']].map(([v, t]) => <span key={t as string}><i style={{ background: indexColor(v as number) }} />{t as string}</span>)}
          {data.clubs > 1 && <span><i className="hd-dot" />ФК Динамо <i className="hd-dot hd-dot--ring" style={{ marginLeft: 6 }} />Царское Село</span>}
          <span><b className="hd-slot__alt">ЦЗ</b> основная позиция</span>
          <span><b className="hd-slot__alt hd-slot__alt--coach">ЦЗ</b> ставит тренер</span>
        </div>
      </header>

      <Pitch className="hd-board__pitch">
        {SLOT_IDS.map((slot) => {
          const s = SLOTS[slot];
          return (
            <div key={slot} className={`hd-slot${s.places > 1 ? ' hd-slot--wide' : ''}`} style={{ left: `${s.x}%`, top: `${s.y}%` }}>
              <div className="hd-slot__title">{s.title}{s.places > 1 ? ` · ${s.places} места` : ''}</div>
              {teamMode ? (
                <TeamSlot players={[...(data.teamSlots.get(scope.year as number)?.get(slot) ?? []).sort((a, b) => byIndex(a.p, b.p)), ...(data.depthByYear.get(scope.year as number) ?? []).filter((x) => x.slot === slot)]} q={q} showClub={data.clubs > 1} places={s.places * data.clubs} />
              ) : (
                <div className="hd-slot__years">
                  {data.years.flatMap((y) => {
                    const xs = data.best.get(y)?.get(slot) ?? [];
                    // На месте столько строк, сколько мест в основе (у центральных полузащитников — две).
                    return Array.from({ length: s.places }, (_, i) => {
                      const cell = xs[i];
                      const best = cell?.p;
                      const note = cell ? placedNote(cell) : null;
                      return (
                        <div key={`${y}-${i}`} className={`hd-slot__row${!best ? ' hd-slot__row--gap' : best.index != null && best.index < WEAK ? ' hd-slot__row--weak' : ''}${i > 0 ? ' hd-slot__row--cont' : ''}`}>
                          <span className="hd-slot__year" title={ageOf(y)}>{i === 0 ? String(y).slice(2) : ''}</span>
                          {best ? (
                            <Link to={`/holding/players/${best.id}${q}`} className="hd-slot__name" title={`${best.name} · ${shortClub(best.clubLabel)} ${best.birthYear}${note ? ` · ${note}` : ''}`}>
                              {data.clubs > 1 && <ClubDot label={best.clubLabel} />}{lastName(best.name)}
                            </Link>
                          ) : <span className="hd-slot__name hd-slot__none">никого</span>}
                          <span className="hd-slot__altcell">{cell && <Mark x={cell} note={note} />}</span>
                          <span className={`hd-slot__idx${best?.lowSample ? ' hd-slot__idx--low' : ''}`} style={{ color: indexColor(best?.index) }} title={best?.lowSample ? 'без оценки: на поле меньше двух полных матчей' : undefined}>{best?.index != null ? best.index.toFixed(1) : best?.lowSample ? 'б/о' : '—'}</span>
                        </div>
                      );
                    });
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
          {gaps.length === 0 ? <div className="hd-muted">На всех позициях основы — игроки с индексом от 6.5.</div> : (
            <ul className="hd-list">
              {gaps.sort((x, y) => y.year - x.year).map((g) => (
                <li key={`${g.g}${g.year}`}>
                  <span><b>{GROUP_PLURAL[g.g]}</b> · {g.year} г.р.</span>
                  <span className={g.weakest ? 'hd-warn' : 'hd-down'} style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>{g.weakest ? `${surname(g.weakest.name)} ${g.weakest.index?.toFixed(1) ?? '—'}` : 'нет игрока'}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="card an">
          <div className="page-section-title">Где сильно <span className="an-model-tag">индекс 9+</span></div>
          {strong.length === 0 ? <div className="hd-muted">Пока нет позиций с игроком уровня топа региона.</div> : (
            <ul className="hd-list">
              {strong.sort((x, y) => (y.best.index ?? 0) - (x.best.index ?? 0)).map((g) => (
                <li key={`${g.g}${g.year}`}>
                  <span><Link to={`/holding/players/${g.best.id}${q}`}>{g.best.name}</Link> <span className="hd-muted hd-small">· {GROUP_PLURAL[g.g].toLowerCase()} · {g.year}</span></span>
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

/** Метка игрока не в своей специализации: его основная позиция (пунктир — поставил тренер). */
function Mark({ x, note }: { x: Placed; note: string | null }) {
  if (x.how === 'main' || !x.home) return null;
  return <span className={`hd-slot__alt${x.how === 'coach' ? ' hd-slot__alt--coach' : ''}`} title={note ?? undefined}>{GROUP_SHORT[x.home]}</span>;
}

function TeamSlot({ players, q, showClub, places = 1 }: { players: Placed[]; q: string; showClub: boolean; places?: number }) {
  if (!players.length) return <div className="hd-slot__empty">никого</div>;
  const shown = places + 2;
  return (
    <div className="hd-slot__team">
      {players.slice(0, shown).map((x, i) => {
        const note = placedNote(x);
        return (
          <Link key={`${x.p.id}${x.group}`} to={`/holding/players/${x.p.id}${q}`} className={`hd-slot__player${i < places ? ' hd-slot__player--first' : ''}`} title={`${x.p.name}${note ? ` · ${note}` : ''} · ${x.p.minutes ?? 0} мин`}>
            <IndexRing value={x.p.index} size={i < places ? 40 : 30} stroke={i < places ? 4 : 3} low={x.p.lowSample} />
            <span className="hd-slot__pname">{showClub && <ClubDot label={x.p.clubLabel} />}{surname(x.p.name)}</span>
            <Mark x={x} note={note} />
          </Link>
        );
      })}
      {players.length > shown && <span className="hd-slot__more">ещё {players.length - shown}</span>}
    </div>
  );
}

/** Состав одной команды на поле (страница команды): основа и глубина, цвет — индекс. */
export function TeamPitch({ players, q }: { players: LeaguePlayer[]; q: string }) {
  const coach = useCoachMap();
  const list = players.filter(active);
  const lu = lineup(list, byIndex, coach);
  const starters = new Map([...lu.values()].flat().map((x) => [x.p.id, x.group] as [number, PositionGroup]));
  const slots = toSlots(lu);
  const depth = depthOf(list, starters, coach);
  return (
    <Pitch className="hd-board__pitch hd-teampitch">
      {SLOT_IDS.map((slot) => (
        <div key={slot} className={`hd-slot${SLOTS[slot].places > 1 ? ' hd-slot--wide' : ''}`} style={{ left: `${SLOTS[slot].x}%`, top: `${SLOTS[slot].y}%` }}>
          <div className="hd-slot__title">{SLOTS[slot].title}</div>
          <TeamSlot players={[...(slots.get(slot) ?? []), ...depth.filter((x) => x.slot === slot)]} q={q} showClub={false} places={SLOTS[slot].places} />
        </div>
      ))}
    </Pitch>
  );
}
