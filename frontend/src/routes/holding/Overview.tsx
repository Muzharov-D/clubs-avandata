import { Link, useNavigate } from 'react-router-dom';
import { FedError } from '../federation/FedState';
import { useHoldingProfile, useHoldingAnalytics, useHoldingChanges, useCanNote, num, pm, shortClub, fmtDay, LINE_TITLE, LIST_SHORT, NOTE_KIND, type TeamLeague, type HoldingAnalytics, type HoldingChanges, type LeaguePlayer } from './api';
import { useNotes } from './Notes';
import { HdLoading } from './HoldingShell';
import { useNavQuery, useScope, useScopeLabel, scopeAnalytics, scopeChanges, inScope } from './scope';
import { PlayerCard, TeamTile, PctCompare, teamIndex, surname } from './cards';
import { Beeswarm, IndexRing } from './viz';

/**
 * Брифинг — первый экран руководства, на визуальных блоках: плитки команд против лиги,
 * карточки игроков с кольцом индекса, рой «игроки холдинга среди всех сверстников»,
 * полосы селекции. Три вопроса недели: где мы, кто готов подняться, кого упускаем.
 */
export function HoldingOverview() {
  const profile = useHoldingProfile();
  const an = useHoldingAnalytics();
  const q = useNavQuery();
  const scope = useScope();
  const label = useScopeLabel();
  if (profile.error || an.error) return <FedError subject="Брифинг" />;
  if (!profile.data || !an.data) return <HdLoading />;
  const p = profile.data, a = scopeAnalytics(an.data, scope);
  const live = p.teams.every((t) => t.standingsSource === 'ffspb-live');
  const teams = a.teams.slice().sort((x, y) => (x.clubKey === y.clubKey ? y.year - x.year : x.clubKey.localeCompare(y.clubKey, 'ru')));
  const logoOf = new Map(p.teams.map((t) => [t.key, t.logo]));
  const under = teams.filter((t) => (t.overperformance ?? 0) < 0);
  const idxs = teams.map(teamIndex).filter((v): v is number => v != null);
  const holdIdx = idxs.length ? Math.round((idxs.reduce((x, y) => x + y, 0) / idxs.length) * 10) / 10 : null;
  const upCount = a.youth.ready.length + a.promote.length;

  return (
    <div className="hd-brief">
      {/* Шапка с главным выводом и тремя большими цифрами */}
      <header className="hd-teamhero hd-brief__hero">
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="hd-kicker">Брифинг · {new Date().toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })} · <b>{label ?? 'весь холдинг'}</b></div>
          <h1 className="hd-teamhero__title hd-brief__title">{headline(a, under.length)}</h1>
          <div className="hd-meta">
            <span><i className={`hd-meta__dot${live ? '' : ' hd-meta__dot--warn'}`} />{live ? 'Таблицы — по протоколам ФФСПб' : 'Часть таблиц — зеркало AvanData'}</span>
            <span>Показатели — по разобранным матчам AvanData</span>
            <span>Обновлено {new Date(p.asOf).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</span>
          </div>
        </div>
        <div className="hd-teamhero__stats">
          <div className="hd-bigstat"><span className="hd-bigstat__v hd-up">{upCount}</span><span className="hd-bigstat__l">готовы подняться</span><span className="hd-bigstat__s">{a.youth.ready.length} в молодёжку · {a.promote.length} в ФК Динамо</span></div>
          <div className="hd-bigstat"><span className={`hd-bigstat__v ${under.length ? 'hd-warn' : ''}`}>{under.length}<small>/{teams.length}</small></span><span className="hd-bigstat__l">играют сильнее места</span><span className="hd-bigstat__s">в таблице ниже, чем позволяет игра</span></div>
          <div className="hd-bigstat hd-bigstat--ring"><IndexRing value={holdIdx} size={86} stroke={7} /><span className="hd-bigstat__l">индекс составов</span></div>
        </div>
      </header>

      {/* 01 Где мы */}
      <section className="card an">
        <div className="page-section-title"><span className="hd-qnum">01</span> Где мы среди команд региона <span className="an-model-tag">место в таблице против уровня игры</span></div>
        <div className="hd-tiles">{teams.map((t) => <TeamTile key={t.key} t={t} q={q} logo={logoOf.get(t.key)} />)}</div>
        <div className="an-note">«По уровню игры» — место команды в дивизионе по средней оценке игроков за матч. Полоса — шкала мест: белая точка — место в таблице, голубая — по уровню игры. Жёлтый отрезок — команда играет сильнее, чем стоит в таблице (очков меньше, чем позволяет игра); зелёный — в таблице выше уровня игры.</div>
      </section>

      {/* 02 Кто готов подняться */}
      <section className="card an">
        <div className="page-section-title"><span className="hd-qnum">02</span> Кто готов подняться выше <Link to={`/holding/decisions${q}#youth`} className="hd-link" style={{ marginLeft: 'auto' }}>все решения →</Link></div>
        <UpGrid a={a} q={q} />
      </section>

      {/* Рой: игроки холдинга среди всех сверстников */}
      <Swarm a={a} />

      {/* 03 Кого упускает селекция */}
      <section className="card an">
        <div className="page-section-title"><span className="hd-qnum">03</span> Кого упускает селекция <span className="an-model-tag">в более слабых командах — сильнее нашей линии</span><Link to={`/holding/decisions${q}#selection`} className="hd-link" style={{ marginLeft: 'auto' }}>кандидаты →</Link></div>
        <Selection a={a} q={q} />
      </section>

      <Week q={q} />
      <Attention a={a} q={q} />
      <Reminders q={q} />
    </div>
  );
}

// ─── Слова ────────────────────────────────────────────────────────────────────
export const plural = (n: number, one: string, few: string, many: string) => { const a = Math.abs(n) % 100, b = a % 10; if (a >= 11 && a <= 14) return many; if (b === 1) return one; if (b >= 2 && b <= 4) return few; return many; };
const teamTitle = (t: { clubLabel: string; year?: number; birthYear?: number }) => `${shortClub(t.clubLabel)} ${t.year ?? t.birthYear ?? ''}`;

function headline(a: HoldingAnalytics, under: number): string {
  const ready = a.youth.ready.length, promote = a.promote.length;
  const parts: string[] = [];
  if (ready) parts.push(`${ready} ${plural(ready, 'игрок готов', 'игрока готовы', 'игроков готовы')} в молодёжку`);
  if (promote) parts.push(`${promote} — в ФК Динамо`);
  if (under) parts.push(`${under} ${plural(under, 'команда играет', 'команды играют', 'команд играют')} сильнее своего места в таблице`);
  if (!parts.length) return 'Неделя без срочных решений';
  const s = parts.join(', ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ─── 02: карточки «готовы подняться» ──────────────────────────────────────────
function UpGrid({ a, q }: { a: HoldingAnalytics; q: string }) {
  const seen = new Set<number>();
  const rows: Array<{ p: LeaguePlayer; tag: string; tone: 'up' | 'brand' }> = [];
  for (const p of a.youth.ready) if (!seen.has(p.id)) { seen.add(p.id); rows.push({ p, tag: 'в молодёжку', tone: 'up' }); }
  for (const p of a.promote) if (!seen.has(p.id)) { seen.add(p.id); rows.push({ p, tag: '→ ФК Динамо', tone: 'brand' }); }
  const older = a.olderAge.filter((p) => !seen.has(p.id)).sort((x, y) => (y.index ?? -1) - (x.index ?? -1)).slice(0, Math.max(0, 8 - rows.length));
  if (!rows.length && !older.length) return <div className="hd-empty">Пока никто не проходит пороги.</div>;
  return (
    <div className="hd-pcards">
      {rows.slice(0, 8).map(({ p, tag, tone }) => <PlayerCard key={p.id} p={p} q={q} tag={tag} tagTone={tone} />)}
      {older.map((p) => <PlayerCard key={p.id} p={p} q={q} tag={`возраст старше · ${p.olderRank}-й в ${p.olderTeamName.replace(/^ФК |Царское Село-/, '')}`} tagTone="brand" />)}
    </div>
  );
}

// ─── Рой региона ──────────────────────────────────────────────────────────────
function Swarm({ a }: { a: HoldingAnalytics }) {
  const navigate = useNavigate();
  const q = useNavQuery();
  const scope = useScope();
  const rows = (a.swarm ?? []).filter((r) => !scope.year || r.year === scope.year);
  if (!rows.length) return null;
  return (
    <section className="card an">
      <div className="page-section-title">Игроки холдинга среди всех сверстников региона <span className="an-model-tag">индекс сезона · каждая точка — игрок с 45+ минутами</span></div>
      <div className="hd-swarm">
        {rows.map((r) => {
          const mine = r.points.filter((x) => x.mine && (!scope.club || (x.teamKey ?? '').startsWith(`${scope.club}:`)));
          const best = mine.slice().sort((x, y) => y.index - x.index).slice(0, 3);
          const cs = (x: { teamKey?: string }) => (x.teamKey ?? '').startsWith('царское');
          const nCs = mine.filter(cs).length, nD = mine.length - nCs;
          return (
            <div key={r.year} className="hd-swarm__row">
              <div className="hd-swarm__label">
                <b>{r.year}</b>
                <span>{mine.length} наших из {r.points.length}</span>
                {!scope.club && <span className="hd-swarm__clubs"><span><i className="hd-dot" />ФК Динамо — {nD}</span><span><i className="hd-dot hd-dot--ring" />Царское Село — {nCs}</span></span>}
                <span className="hd-swarm__best">{best.map((b) => `${surname(b.name ?? '')} ${b.index.toFixed(1)}`).join(' · ')}</span>
              </div>
              <Beeswarm points={r.points.map((x) => ({ id: x.id, value: x.index, mine: x.mine && mine.some((m) => m.id === x.id), ring: cs(x), label: x.name }))} height={124} onPick={(id) => navigate(`/holding/players/${id}${q}`)} />
            </div>
          );
        })}
      </div>
      <div className="an-note">Серые точки — все игроки этого года рождения в регионе; цветные — игроки холдинга: сплошные — ФК Динамо, кольца — Царское Село (цвет — индекс). Клик по цветной точке — профиль игрока. Индекс считается против своей группы позиций.</div>
    </section>
  );
}

// ─── 03: селекция ─────────────────────────────────────────────────────────────
function Selection({ a, q }: { a: HoldingAnalytics; q: string }) {
  const groups = a.selection.slice().sort((x, y) => x.candidates[0]!.pctRegion - y.candidates[0]!.pctRegion).slice(0, 6);
  if (!groups.length) return <div className="hd-empty">Сейчас в более слабых командах нет игроков сильнее наших линий.</div>;
  return (
    <div className="hd-selcards">
      {groups.map((g) => {
        const team = a.teams.find((t) => t.key === g.teamKey);
        const ours = team?.squad.filter((p) => p.line === g.line && p.pctRegion != null).sort((x, y) => (x.pctRegion as number) - (y.pctRegion as number))[0];
        const c = g.candidates[0]!;
        return (
          <Link key={`${g.teamKey}${g.line}`} to={`/holding/decisions${q}#selection`} className="hd-selcard">
            <div className="hd-selcard__head"><b>{teamTitle(g)}</b> · {LINE_TITLE[g.line].toLowerCase()}<span className="hd-tag hd-tag--brand">{g.candidates.length} {plural(g.candidates.length, 'кандидат', 'кандидата', 'кандидатов')}</span></div>
            <PctCompare ours={ours?.pctRegion ?? null} theirs={c.pctRegion} oursLabel={ours ? `наш лучший · ${surname(ours.name)}` : 'наш лучший'} theirsLabel={`кандидат · ${c.club}`} />
          </Link>
        );
      })}
    </div>
  );
}

// ─── За неделю ────────────────────────────────────────────────────────────────
function Week({ q }: { q: string }) {
  const ch = useHoldingChanges('week');
  const scope = useScope();
  const c = ch.data ? scopeChanges(ch.data, scope) : null;
  return (
    <section className="card an">
      <div className="page-section-title">Что изменилось <span className="an-model-tag">{c ? c.base.label : 'сравниваем…'}</span><Link to={`/holding/changes${q}`} className="hd-link" style={{ marginLeft: 'auto' }}>вся динамика →</Link></div>
      {!c ? <div className="hd-shimmer" style={{ height: 80 }} /> : <WeekChips c={c} q={q} />}
    </section>
  );
}

function WeekChips({ c, q }: { c: HoldingChanges; q: string }) {
  const chips: Array<{ id: number; name: string; text: string; tone: 'up' | 'down' | 'warn' }> = [];
  for (const l of c.lists) {
    const bad = l.key === 'losing' || l.key === 'risk';
    for (const p of l.entered) chips.push({ id: p.id, name: p.name, text: `вошёл: ${LIST_SHORT[l.key].toLowerCase()}`, tone: bad ? 'down' : 'up' });
  }
  for (const p of c.risers) chips.push({ id: p.id, name: p.name, text: `↑ топ ${p.pctBefore}% → ${p.pctRegion}%`, tone: 'up' });
  for (const p of c.fallers) chips.push({ id: p.id, name: p.name, text: `↓ топ ${p.pctBefore}% → ${p.pctRegion}%`, tone: 'down' });
  if (!chips.length && !c.lines.sagged.length) return <div className="hd-empty">За это время списки решений не изменились.</div>;
  return (
    <div className="hd-chips">
      {chips.slice(0, 12).map((x, i) => <Link key={`${x.id}${i}`} to={`/holding/players/${x.id}${q}`} className={`hd-chip hd-chip--${x.tone}`}><b>{surname(x.name)}</b><span>{x.text}</span></Link>)}
      {c.lines.sagged.slice(0, 3).map((l) => <span key={`${l.teamKey}${l.line}`} className="hd-chip hd-chip--warn"><b>{shortClub(l.clubLabel)} {l.year} · {l.title.toLowerCase()}</b><span>линия просела: {pm(Math.round((l.gapBefore ?? 0) * 100))}% → {pm(Math.round((l.gapNow ?? 0) * 100))}%</span></span>)}
    </div>
  );
}

// ─── Требует внимания ─────────────────────────────────────────────────────────
function Attention({ a, q }: { a: HoldingAnalytics; q: string }) {
  return (
    <section className="card an">
      <div className="page-section-title">Требует внимания <Link to={`/holding/decisions${q}#losing`} className="hd-link" style={{ marginLeft: 'auto' }}>подробно →</Link></div>
      <div className="hd-attn">
        <div>
          <div className="hd-attn__title">Кого теряем <span className="hd-down">{a.losing.length}</span></div>
          {a.losing.length === 0 ? <div className="hd-empty">Никого.</div> : <div className="hd-pcards hd-pcards--col">{a.losing.slice(0, 4).map((p) => <PlayerCard key={p.id} p={p} q={q} tag={p.reason === 'trend' ? `форма ${p.formDelta != null ? pm(Math.round(p.formDelta * 10) / 10) : ''}` : 'вне ротации'} tagTone="down" />)}</div>}
        </div>
        <div>
          <div className="hd-attn__title">Зона риска в ФК Динамо <span className="hd-warn">{a.risk.length}</span></div>
          {a.risk.length === 0 ? <div className="hd-empty">Никого.</div> : <div className="hd-pcards hd-pcards--col">{a.risk.slice(0, 4).map((p) => <PlayerCard key={p.id} p={p} q={q} tag="ниже медианы Первой лиги" tagTone="warn" />)}</div>}
        </div>
        <div>
          <div className="hd-attn__title">Слабые линии <span className="hd-warn">{a.weakLines.length}</span></div>
          {a.weakLines.slice(0, 6).map((l) => (
            <Link key={`${l.teamKey}${l.line}`} to={`/holding/teams/${encodeURIComponent(l.teamKey)}${q}`} className="hd-lineline hd-lineline--link">
              <span className="hd-lineline__t">{teamTitle(l)} · {l.title.toLowerCase()}</span>
              <span className="hd-lineline__bar" title="насколько линия слабее средней по своей лиге"><span style={{ width: `${Math.min(100, Math.max(6, -l.gapRel * 160))}%`, background: 'var(--rating-poor)' }} /></span>
              <span className="hd-lineline__v hd-down">{pm(Math.round(l.gapRel * 100))}%</span>
            </Link>
          ))}
          {a.weakLines.length === 0 && <div className="hd-empty">Нет.</div>}
        </div>
      </div>
    </section>
  );
}

// ─── Решения в работе ─────────────────────────────────────────────────────────
function Reminders({ q }: { q: string }) {
  const can = useCanNote();
  const notes = useNotes();
  const scope = useScope();
  if (!can) return null;
  const list = (notes.data?.notes ?? []).filter((n) => !n.closedAt && (!n.now || inScope(scope, { teamKey: n.now.teamKey }))).sort((x, y) => Number(y.due) - Number(x.due)).slice(0, 6);
  return (
    <section className="card an">
      <div className="page-section-title">Решения в работе <Link to={`/holding/journal${q}`} className="hd-link" style={{ marginLeft: 'auto' }}>журнал →</Link></div>
      {list.length === 0 ? <div className="hd-empty">Решений пока нет. Откройте игрока и запишите решение — кабинет напомнит о нём в нужный день.</div> : (
        <div className="hd-chips">
          {list.map((n) => (
            <Link key={n.id} to={`/holding/players/${n.playerId}${q}`} className={`hd-chip ${n.due ? 'hd-chip--warn' : 'hd-chip--brand'}`}>
              <b>{surname(n.playerName)} · {NOTE_KIND[n.kind]}</b>
              <span>{n.remindOn ? (n.due ? `пора вернуться · ${fmtDay(n.remindOn)}` : `напомнить ${fmtDay(n.remindOn)}`) : 'без напоминания'}{n.now?.rankRegion != null && n.rankAt != null ? ` · место ${n.rankAt}-е → ${n.now.rankRegion}-е` : ''}</span>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}

export type { TeamLeague };
