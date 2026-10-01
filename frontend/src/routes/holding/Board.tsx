import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { FedError } from '../federation/FedState';
import { useHoldingAnalytics, useHoldingProfile, shortClub, type LeaguePlayer } from './api';
import { HdLoading } from './HoldingShell';
import { useNavQuery, useScope, useScopeLabel } from './scope';
import { Pitch, SLOTS, SLOT_SHORT, lineup, placedNote, slotGames, slotOf, IndexRing, indexColor, type Placed, type SlotId } from './viz';

const surname = (name: string) => { const parts = name.trim().split(/\s+/); return parts.length > 1 ? `${parts[parts.length - 1]} ${parts[0]![0]}.` : name; };
const clubTag = (label: string) => (label.includes('Царское') ? 'ЦС' : 'Д');
const WEAK = 6.5;   // шкала 5–10: ниже — слабое место
const byIndex = (a: LeaguePlayer, b: LeaguePlayer) => (b.index ?? -1) - (a.index ?? -1) || (b.minutes ?? 0) - (a.minutes ?? 0);

/**
 * Доска комплектования: поле со схемой, на каждой позиции — игроки холдинга.
 * Основа каждой команды собирается по всем позициям, на которых игроки выходили (viz.lineup),
 * поэтому место пустует, только если на нём действительно никто не играл.
 * «Вертикаль» (все годы): на позиции стопка лет 2013→2009 с лучшим игроком каждого года.
 * «Команда» (выбран год): основа и глубина на позиции. Год — команды, а не рождения.
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
    // Основа каждой команды по схеме: игрок встаёт туда, где реально играет; пустых мест,
    // если кто-то на позиции выходил, не остаётся. По году — лучшие основы обеих школ.
    // Год — команды, за которую играет (не год рождения: игрок может выступать за старших или младших).
    const teamYear = new Map(teams.map((t) => [t.key, t.year]));
    const yearOf = (p: LeaguePlayer) => teamYear.get(p.teamKey) ?? p.birthYear;
    const placed = new Map<SlotId, Placed[]>();
    const depth = new Map<SlotId, Placed[]>();
    for (const t of teams) {
      const players = t.squad.filter((p) => (p.minutes ?? 0) > 0 || p.mp > 0);
      const lu = lineup(players, byIndex);
      const starters = new Set([...lu.values()].flat().map((x) => x.p.id));
      for (const [slot, xs] of lu) (placed.get(slot) ?? placed.set(slot, []).get(slot)!).push(...xs);
      // Глубина: запасные со своей позицией здесь, затем кто здесь выходил.
      for (const p of players) {
        if (starters.has(p.id)) continue;
        const home = slotOf(p.position);
        for (const [slot, n] of slotGames(p)) (depth.get(slot) ?? depth.set(slot, []).get(slot)!).push({ p, slot, home, games: n, how: home === slot ? 'main' : 'played' });
      }
    }
    for (const xs of placed.values()) xs.sort((x, y) => byIndex(x.p, y.p));
    for (const xs of depth.values()) xs.sort((x, y) => (x.how === 'main' ? 0 : 1) - (y.how === 'main' ? 0 : 1) || byIndex(x.p, y.p));
    // Позиции, на которых почти никто не играет (схема команды, а не дыра), не рисуем.
    const used = (Object.keys(SLOTS) as SlotId[]).filter((sl) => new Set((placed.get(sl) ?? []).map((x) => yearOf(x.p))).size >= Math.min(2, years.length));
    return { years, placed, depth, yearOf, clubs: new Set(teams.map((t) => t.clubKey)).size, used };
  }, [an.data, scope.club]);

  if (an.error) return <FedError subject="Комплектование" />;
  if (!data || !profile.data) return <HdLoading title="Расставляем по полю" text="Собираем игроков холдинга по позициям и годам." />;
  const teamMode = scope.year != null;
  const ageOf = (y: number) => profile.data?.teams.find((t) => t.year === y)?.ageTitle ?? '';

  // Где тонко: позиция × год без игрока или с индексом ниже 4.
  const gaps: Array<{ slot: SlotId; year: number; best: LeaguePlayer | null }> = [];
  const strong: Array<{ slot: SlotId; year: number; best: LeaguePlayer }> = [];
  const ofYear = (slot: SlotId, y: number) => (data.placed.get(slot) ?? []).filter((x) => data.yearOf(x.p) === y).map((x) => x.p);
  const shown = teamMode ? (Object.keys(SLOTS) as SlotId[]).filter((sl) => ofYear(sl, scope.year as number).length > 0 || data.used.includes(sl)) : data.used;
  for (const slot of shown) for (const y of (teamMode ? [scope.year as number] : data.years)) {
    const xs = ofYear(slot, y);
    const best = xs[0] ?? null;
    // Не хватает игроков на места основы или последний из основы слабый.
    const weakest = xs[SLOTS[slot].places - 1] ?? null;
    if (!weakest || (weakest.index != null && weakest.index < WEAK)) gaps.push({ slot, year: y, best: weakest });
    else if (best.index != null && best.index >= 9) strong.push({ slot, year: y, best });
  }

  return (
    <div className="hd-board">
      <header className="hd-pagehead">
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="hd-kicker">Комплектование · <b>{label ?? 'весь холдинг'}</b></div>
          <h1 className="hd-h1">{teamMode ? `Состав ${scope.year} г.р. по позициям` : 'Вертикаль по позициям: кто за кем'}</h1>
          <p className="hd-lede">{teamMode
            ? 'На каждой позиции — основа и замена по глубине. Цвет — индекс сезона против сверстников своей позиции в регионе. Метка рядом с фамилией — основная позиция игрока, если он закрывает эту.'
            : 'На каждой позиции — лучший игрок каждого года, от младших к старшим. Игрок стоит там, где реально выходит; метка рядом с фамилией — его основная позиция. Красное — слабое место.'}</p>
        </div>
        <div className="hd-board__legend">
          {[[9.5, 'топ региона'], [8.5, 'сильный'], [7.5, 'середина'], [6.5, 'слабее'], [5.5, 'проблема']].map(([v, t]) => <span key={t as string}><i style={{ background: indexColor(v as number) }} />{t as string}</span>)}
        </div>
      </header>

      <Pitch className="hd-board__pitch">
        {shown.map((slot) => {
          const s = SLOTS[slot];
          const list = data.placed.get(slot) ?? [];
          return (
            <div key={slot} className={`hd-slot${s.places > 1 ? ' hd-slot--wide' : ''}`} style={{ left: `${s.x}%`, top: `${s.y}%` }}>
              <div className="hd-slot__title">{s.title}{s.places > 1 ? ` · ${s.places} места` : ''}</div>
              {teamMode ? (
                <TeamSlot players={[...list, ...(data.depth.get(slot) ?? [])].filter((x) => data.yearOf(x.p) === scope.year)} q={q} showClub={data.clubs > 1} places={s.places * data.clubs} />
              ) : (
                <div className="hd-slot__years">
                  {data.years.flatMap((y) => {
                    const xs = list.filter((x) => data.yearOf(x.p) === y);
                    // На позиции столько строк, сколько мест в основе (у центральных полузащитников — две).
                    return Array.from({ length: s.places }, (_, i) => {
                      const cell = xs[i];
                      const best = cell?.p;
                      const note = cell ? placedNote(cell) : null;
                      return (
                        <div key={`${y}-${i}`} className={`hd-slot__row${!best ? ' hd-slot__row--gap' : best.index != null && best.index < WEAK ? ' hd-slot__row--weak' : ''}${i > 0 ? ' hd-slot__row--cont' : ''}`}>
                          <span className="hd-slot__year" title={ageOf(y)}>{i === 0 ? String(y).slice(2) : ''}</span>
                          {best ? (
                            <Link to={`/holding/players/${best.id}${q}`} className="hd-slot__name" title={`${best.name} · ${shortClub(best.clubLabel)} ${best.birthYear}${note ? ` · ${note}` : ` · ${best.position ?? ''}`}`}>
                              {data.clubs > 1 && <span className="hd-slot__club">{clubTag(best.clubLabel)}</span>}{surname(best.name)}
                            </Link>
                          ) : <span className="hd-slot__name hd-slot__none">никого</span>}
                          <span className="hd-slot__altcell">{cell?.home && cell.how !== 'main' && <span className="hd-slot__alt" title={note ?? undefined}>{SLOT_SHORT[cell.home]}</span>}</span>
                          <span className="hd-slot__idx" style={{ color: indexColor(best?.index) }}>{best?.index != null ? best.index.toFixed(1) : '—'}</span>
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
          {gaps.length === 0 ? <div className="hd-muted">На всех позициях есть игрок с индексом от 6.5.</div> : (
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
          <div className="page-section-title">Где сильно <span className="an-model-tag">индекс 9+</span></div>
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

function TeamSlot({ players, q, showClub, places = 1 }: { players: Placed[]; q: string; showClub: boolean; places?: number }) {
  if (!players.length) return <div className="hd-slot__empty">никого</div>;
  const shown = places + 2;
  return (
    <div className="hd-slot__team">
      {players.slice(0, shown).map((x, i) => {
        const note = placedNote(x);
        return (
          <Link key={x.p.id} to={`/holding/players/${x.p.id}${q}`} className={`hd-slot__player${i < places ? ' hd-slot__player--first' : ''}`} title={`${x.p.name} · ${note ?? x.p.position ?? ''} · ${x.p.minutes ?? 0} мин`}>
            <IndexRing value={x.p.index} size={i < places ? 40 : 30} stroke={i < places ? 4 : 3} />
            <span className="hd-slot__pname">{showClub && <span className="hd-slot__club">{clubTag(x.p.clubLabel)}</span>}{surname(x.p.name)}</span>
            {x.home && x.how !== 'main' && <span className="hd-slot__alt">{SLOT_SHORT[x.home]}</span>}
          </Link>
        );
      })}
      {players.length > shown && <span className="hd-slot__more">ещё {players.length - shown}</span>}
    </div>
  );
}

/** Состав одной команды на поле (страница команды): позиции по глубине, цвет — индекс. */
export function TeamPitch({ players, q }: { players: LeaguePlayer[]; q: string }) {
  const active = players.filter((p) => (p.minutes ?? 0) > 0 || p.mp > 0);
  const lu = lineup(active, byIndex);
  const starters = new Set([...lu.values()].flat().map((x) => x.p.id));
  const bySlot = new Map<SlotId, Placed[]>([...lu].map(([s, xs]) => [s, [...xs]]));
  for (const p of active) {
    if (starters.has(p.id)) continue;
    const home = slotOf(p.position);
    for (const [slot, n] of slotGames(p)) bySlot.get(slot)!.push({ p, slot, home, games: n, how: home === slot ? 'main' : 'played' });
  }
  const slots = (Object.keys(SLOTS) as SlotId[]).filter((s) => bySlot.get(s)!.length > 0);
  return (
    <Pitch className="hd-board__pitch hd-teampitch">
      {slots.map((slot) => {
        const [start, rest] = [bySlot.get(slot)!.slice(0, lu.get(slot)!.length), bySlot.get(slot)!.slice(lu.get(slot)!.length)];
        rest.sort((x, y) => (x.how === 'main' ? 0 : 1) - (y.how === 'main' ? 0 : 1) || byIndex(x.p, y.p));
        return (
          <div key={slot} className={`hd-slot${SLOTS[slot].places > 1 ? ' hd-slot--wide' : ''}`} style={{ left: `${SLOTS[slot].x}%`, top: `${SLOTS[slot].y}%` }}>
            <div className="hd-slot__title">{SLOTS[slot].title}</div>
            <TeamSlot players={[...start, ...rest]} q={q} showClub={false} places={SLOTS[slot].places} />
          </div>
        );
      })}
    </Pitch>
  );
}
