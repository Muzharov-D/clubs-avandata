import { useEffect, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { FedError } from '../federation/FedState';
import { useHoldingAnalytics, num, pm, shortClub, shortPos, LINE_TITLE, GROUP_TITLE, groupOfPosition, type SelectionGroup, type HoldingAnalytics, type LeaguePlayer } from './api';
import { PlayerTable } from './parts';
import { HdLoading } from './HoldingShell';
import { useNavQuery, useScope, useScopeLabel, scopeAnalytics } from './scope';
import { plural } from './Overview';
import { PlayerCard, PctCompare, surname } from './cards';
import { indexColor } from './viz';

/**
 * Решения — списки, которые руководство закрывает действием, на карточках игроков:
 * кольцо индекса, позиция, команда, ярлык решения. Правило — одной фразой под заголовком;
 * полная таблица с сортировкой — под карточками.
 */
export function HoldingDecisions() {
  const an = useHoldingAnalytics();
  const q = useNavQuery();
  const scope = useScope();
  const label = useScopeLabel();
  const { hash } = useLocation();
  useEffect(() => {
    if (!hash || !an.data) return;
    const el = document.getElementById(hash.slice(1));
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [hash, an.data]);
  if (an.error) return <FedError subject="Решения" />;
  if (!an.data) return <HdLoading title="Считаем решения" text="Ставим каждого игрока в контекст его возраста и позиции по всему региону." />;
  const a: HoldingAnalytics = scopeAnalytics(an.data, scope);
  const th = a.thresholds;
  const youthAll = [...a.youth.ready, ...a.youth.watch, ...a.youth.rest];
  const slots = a.youthSlots;
  const selN = new Set(a.selection.flatMap((g) => g.candidates.map((c) => c.id))).size;

  const toc: Array<[string, string, number, 'up' | 'down' | 'warn' | 'brand']> = [
    ['youth', 'В молодёжку', a.youth.ready.length, 'up'],
    ['promote', 'ЦС → ФК Динамо', a.promote.length, 'up'],
    ['older', 'На возраст старше', a.olderAge.length, 'brand'],
    ['selection', 'Селекция', selN, 'brand'],
    ['losing', 'Кого теряем', a.losing.length, 'down'],
    ['risk', 'Зона риска', a.risk.length, 'warn'],
    ['lines', 'Слабые линии', a.weakLines.length, 'warn'],
  ];

  return (
    <div className="hd-brief">
      <header className="hd-teamhero hd-brief__hero">
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="hd-kicker">Решения · <b>{label ?? 'весь холдинг'}</b></div>
          <h1 className="hd-teamhero__title hd-brief__title">Кто готов подняться, кого упускаем, где теряем</h1>
          <div className="hd-meta"><span>Каждый список — по правилу относительно своего возраста и позиции в регионе; правило — под заголовком.</span></div>
        </div>
        <nav className="hd-dtoc" aria-label="Списки">
          {toc.map(([id, title, n, tone]) => <a key={id} href={`#${id}`} className={`hd-dtoc__item hd-dtoc__item--${tone}`}><b>{n}</b><span>{title}</span></a>)}
        </nav>
      </header>

      <Block id="youth" title="В молодёжную команду" tone="up" count={`готовы ${a.youth.ready.length} · присмотреться ${a.youth.watch.length} · мест ${slots}`}
        rule={<>{a.youthFromYear} г.р. и старше. <b>Готов</b> — топ-{th.youthReadyPct}% своего возраста в регионе и от {th.minMatchesReady} разобранных матчей; <b>присмотреться</b> — топ-{th.youthWatchPct}%. Номер — очередь на {slots} мест.</>}
        players={youthAll} q={q}
        card={(p, i) => <PlayerCard key={p.id} p={p} q={q} rank={i + 1} tag={i < slots ? `№${i + 1} в очереди` : a.youth.ready.some((x) => x.id === p.id) ? 'готов' : a.youth.watch.some((x) => x.id === p.id) ? 'присмотреться' : 'резерв'} tagTone={i < slots ? 'up' : a.youth.watch.some((x) => x.id === p.id) ? 'warn' : undefined} />}
        limit={Math.max(slots + 3, 8)} empty="Пока никто не проходит по порогам." />

      <Block id="promote" title="Из Царского Села в ФК Динамо" tone="up" count={`${a.promote.length}`}
        rule="Игроки Царского Села, которые по средней оценке за матч играют не хуже середины Высшей лиги своего возраста."
        players={a.promote} q={q} card={(p) => <PlayerCard key={p.id} p={p} q={q} tag="уровень Высшей лиги" tagTone="brand" />} empty="Сейчас никто из Царского Села не дотягивает до медианы Высшей лиги." />

      <Block id="older" title="Готовы играть на возраст старше" tone="brand" count={`${a.olderAge.length}`}
        rule="Внутри своей школы: по средней оценке за матч не слабее середины команды на год старше. На карточке — каким по силе он был бы там."
        players={a.olderAge} q={q} card={(p) => { const c = a.olderAge.find((x) => x.id === p.id); return <PlayerCard key={p.id} p={p} q={q} tag={c ? `${c.olderRank}-й из ${c.olderSize} в ${c.olderTeamName.replace(/^ФК |Царское Село-/, '')}` : ''} tagTone="brand" />; }}
        empty="Пока никто не проходит по медиане старшей команды." />

      <section id="selection" className="card an hd-dblock" style={{ scrollMarginTop: 120 }}>
        <div className="page-section-title">Кого упускает селекция <span className="an-model-tag">{selN} {plural(selN, 'кандидат', 'кандидата', 'кандидатов')}</span></div>
        <p className="hd-dblock__rule">Игроки других школ того же года из более слабой команды или лиги ниже, которые сильнее нашей линии на 10%+ (топ-35% региона). Без имён. «Сравнить» — бок о бок с лучшим игроком нашей линии.</p>
        {a.selection.length === 0 ? <div className="hd-empty">Сейчас в более слабых командах нет игроков сильнее наших линий.</div> : (
          <div className="hd-selcards">
            {a.selection.map((g) => <SelectionCard key={`${g.teamKey}:${g.line}`} g={g} q={q} best={a.teams.find((t) => t.key === g.teamKey)?.squad.filter((p) => p.line === g.line && p.rating != null).sort((x, y) => (y.rating as number) - (x.rating as number))[0] ?? null} />)}
          </div>
        )}
      </section>

      <Block id="losing" title="Кого теряем" tone="down" count={`${a.losing.length}`}
        rule={<>Падение формы — последние 3 матча ниже своего сезона на 2+ балла из 10 (с учётом минут). Вне ротации — команда играла, а игрок 3 разобранных матча подряд не попадал в состав.</>}
        players={a.losing} q={q} card={(p) => { const l = a.losing.find((x) => x.id === p.id); return <PlayerCard key={p.id} p={p} q={q} tag={l?.reason === 'trend' ? `форма ${p.formDelta != null ? pm(Math.round(p.formDelta * 10) / 10) : 'падает'}` : 'вне ротации'} tagTone="down" />; }}
        empty="Никто не выпадает: форма ровная, ротация стабильная." />

      <Block id="risk" title="Зона риска в ФК Динамо" tone="warn" count={`${a.risk.length}`}
        rule="Игроки ФК Динамо (Высшая лига), которые по средней оценке за матч играют слабее середины Первой лиги своего возраста."
        players={a.risk} q={q} card={(p) => <PlayerCard key={p.id} p={p} q={q} tag={p.rankRegion != null ? `${p.rankRegion}-й из ${p.sizeRegion} в регионе` : 'ниже Первой лиги'} tagTone="warn" />}
        empty="В ФК Динамо нет игроков ниже медианы Первой лиги." />

      <section id="lines" className="card an hd-dblock" style={{ scrollMarginTop: 120 }}>
        <div className="page-section-title">Линии против лиги</div>
        <p className="hd-dblock__rule">Средний рейтинг линии команды против средней по своему дивизиону; заметно — от {Math.round(th.lineGapRel * 100)}%. Середина полосы — уровень лиги.</p>
        <div className="hd-attn" style={{ gridTemplateColumns: '1fr 1fr' }}>
          <LineBars title="Слабее лиги" rows={a.weakLines} q={q} tone="down" />
          <LineBars title="Сильнее лиги" rows={a.strongLines} q={q} tone="up" />
        </div>
      </section>
    </div>
  );
}

function Block({ id, title, tone, count, rule, players, q, card, limit = 8, empty }: {
  id: string; title: string; tone: 'up' | 'down' | 'warn' | 'brand'; count: string; rule: ReactNode;
  players: LeaguePlayer[]; q: string; card: (p: LeaguePlayer, i: number) => ReactNode; limit?: number; empty: string;
}) {
  return (
    <section id={id} className={`card an hd-dblock hd-dblock--${tone}`} style={{ scrollMarginTop: 120 }}>
      <div className="page-section-title">{title} <span className="an-model-tag">{count}</span></div>
      <p className="hd-dblock__rule">{rule}</p>
      {players.length === 0 ? <div className="hd-empty">{empty}</div> : (
        <>
          <div className="hd-pcards">{players.slice(0, limit).map((p, i) => card(p, i))}</div>
          {players.length > limit && (
            <details className="hd-dblock__all">
              <summary>Все {players.length} — таблицей с сортировкой</summary>
              <PlayerTable players={players} rank emptyText={empty} />
            </details>
          )}
        </>
      )}
    </section>
  );
}

function LineBars({ title, rows, q, tone }: { title: string; rows: HoldingAnalytics['weakLines']; q: string; tone: 'up' | 'down' }) {
  return (
    <div>
      <div className="hd-attn__title">{title} <span className={`hd-${tone}`}>{rows.length}</span></div>
      {rows.length === 0 && <div className="hd-empty">Нет.</div>}
      {rows.map((l) => (
        <Link key={`${l.teamKey}${l.line}`} to={`/holding/teams/${encodeURIComponent(l.teamKey)}${q}`} className="hd-lineline hd-lineline--link">
          <span className="hd-lineline__t">{shortClub(l.clubLabel)} {l.year} · {l.title.toLowerCase()}</span>
          <span className="hd-lineline__bar"><span style={{ width: `${Math.min(100, Math.max(4, 50 + l.gapRel * 100))}%`, background: tone === 'down' ? 'var(--rating-poor)' : 'var(--rating-excellent)' }} /></span>
          <span className={`hd-lineline__v hd-${tone}`}>{pm(Math.round(l.gapRel * 100))}%</span>
        </Link>
      ))}
    </div>
  );
}

function SelectionCard({ g, q, best }: { g: SelectionGroup; q: string; best: LeaguePlayer | null }) {
  const c0 = g.candidates[0]!;
  return (
    <div className="hd-selcard">
      <div className="hd-selcard__head">
        <Link to={`/holding/teams/${encodeURIComponent(g.teamKey)}${q}`} style={{ color: 'inherit', textDecoration: 'none' }}><b>{shortClub(g.clubLabel)} {g.year}</b></Link> · {LINE_TITLE[g.line].toLowerCase()}
        <span className="hd-tag hd-tag--brand">{g.candidates.length} {plural(g.candidates.length, 'кандидат', 'кандидата', 'кандидатов')}</span>
      </div>
      <PctCompare ours={best?.pctRegion ?? null} theirs={c0.pctRegion} oursLabel={best ? `наш лучший · ${surname(best.name)}` : 'наш лучший'} theirsLabel="лучший кандидат" />
      <div className="hd-selcard__list">
        {g.candidates.map((c) => (
          <div key={c.id} className="hd-selcard__row">
            <span className="hd-selcard__who">{(() => { const gr = groupOfPosition(c.position); return gr ? GROUP_TITLE[gr] : shortPos(c.position); })()}<span className="hd-muted"> · {c.club}</span></span>
            <span className="hd-tag hd-tag--up">топ {c.pctRegion}%</span>
            <span className="hd-small" style={{ fontWeight: 800, color: indexColor(c.index) }} title="индекс сезона против своей специализации">{c.index != null ? c.index.toFixed(1) : '—'}</span>
            {best && <Link to={`/holding/compare?a=${best.id}&b=${c.id}${q ? '&' + q.slice(1) : ''}`} className="hd-link hd-small">сравнить</Link>}
          </div>
        ))}
      </div>
    </div>
  );
}
