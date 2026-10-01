import { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { FedError } from '../federation/FedState';
import { useHoldingAnalytics, num, pm, shortClub, shortPos, LINE_TITLE, type SelectionGroup, type HoldingAnalytics } from './api';
import { PlayerTable, SectionTitle, PageHead } from './parts';
import { HdLoading } from './HoldingShell';
import { useNavQuery, useScope, useScopeLabel, scopeAnalytics } from './scope';
import { plural } from './Overview';

/**
 * Решения — списки, которые руководство закрывает действием: молодёжка, переходы между
 * школами, на возраст старше, селекция, кого теряем, зона риска, линии. У каждого
 * списка — правило одной фразой с порогами.
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
  if (!an.data) return <HdLoading title="Считаем решения" text="Ставим каждого игрока в контекст его возраста по всему региону. Страница откроется сама." />;
  const a: HoldingAnalytics = scopeAnalytics(an.data, scope);
  const th = a.thresholds;
  const youthAll = [...a.youth.ready, ...a.youth.watch, ...a.youth.rest];
  const slots = a.youthSlots;
  const selN = new Set(a.selection.flatMap((g) => g.candidates.map((c) => c.id))).size;

  const toc: Array<[string, string, number, 'up' | 'down' | 'warn' | '']> = [
    ['youth', 'В молодёжку', a.youth.ready.length, 'up'],
    ['promote', 'ЦС → ФК Динамо', a.promote.length, 'up'],
    ['older', 'На возраст старше', a.olderAge.length, 'up'],
    ['selection', 'Селекция', selN, ''],
    ['losing', 'Кого теряем', a.losing.length, 'down'],
    ['risk', 'Зона риска', a.risk.length, 'warn'],
    ['lines', 'Линии', a.weakLines.length, 'warn'],
  ];

  return (
    <div>
      <PageHead kicker={<>Решения · <b>{label ?? 'весь холдинг'}</b></>} title="Кто готов подняться выше, кого упускаем, где теряем" lede="Каждый список собран по правилу относительно лиги и региона — правило написано под заголовком. Клик по игроку — его место в лиге, карточка для совета и решение." />

      <nav className="hd-toc" aria-label="Списки">
        {toc.map(([id, title, n, tone]) => (
          <a key={id} href={`#${id}`} className="hd-toc__item"><span>{title}</span><b className={tone ? `hd-${tone}` : undefined}>{n}</b></a>
        ))}
      </nav>

      <SectionTitle id="youth" right={`готовы ${a.youth.ready.length} · присмотреться ${a.youth.watch.length} · мест ${slots}`} sub={<>{a.youthFromYear} г.р. и старше. <b>Готов</b> — топ-{th.youthReadyPct}% своего возраста в регионе и от {th.minMatchesReady} разобранных матчей. <b>Присмотреться</b> — топ-{th.youthWatchPct}%. Первые {slots} — очередь на места.</>}>
        В молодёжную команду
      </SectionTitle>
      <PlayerTable players={youthAll} showTier rank limit={Math.max(slots * 2, 10)} emptyText="Пока никто не проходит по порогам." extraTitle="Очередь" extra={(p) => { const i = youthAll.findIndex((x) => x.id === p.id); return i < slots ? <span className="hd-tag hd-tag--up">№{i + 1}</span> : null; }} />

      <SectionTitle id="promote" right={`${a.promote.length} ${plural(a.promote.length, 'игрок', 'игрока', 'игроков')}`} sub={<>Игроки Царского Села (Первая лига) с рейтингом не ниже медианы Высшей лиги своего возраста — уже играют на уровне ФК Динамо. Медианы: {a.medians.map((m) => `${m.year} — ${m.top ?? '—'}`).join(', ')}.</>}>
        Из Царского Села в ФК Динамо
      </SectionTitle>
      <PlayerTable players={a.promote} emptyText="Сейчас никто из Царского Села не дотягивает до медианы Высшей лиги своего возраста." />

      <SectionTitle id="older" right={`${a.olderAge.length} ${plural(a.olderAge.length, 'игрок', 'игрока', 'игроков')}`} sub="Внутри своей школы: рейтинг не ниже медианы команды на год старше. Справа — каким по силе он был бы там.">
        Готовы играть на возраст старше
      </SectionTitle>
      <PlayerTable players={a.olderAge} emptyText="Пока никто не проходит по медиане старшей команды." extraTitle="В старшей команде" extra={(p) => { const c = a.olderAge.find((x) => x.id === p.id); return c ? <span>{c.olderRank}-й из {c.olderSize} <span className="hd-muted">в {c.olderTeamName}</span></span> : null; }} />

      <SectionTitle id="selection" right={`${selN} ${plural(selN, 'кандидат', 'кандидата', 'кандидатов')}`} sub="Игроки других школ того же года, которые играют в команде слабее нашей или лигой ниже, но сильнее нашей линии на 10% и больше (топ-35% региона). Без имён: где играет, амплуа, рейтинг, место. «Сравнить» — бок о бок с лучшим игроком нашей линии.">
        Кого упускает селекция
      </SectionTitle>
      {a.selection.length === 0 ? <div className="hd-empty">Сейчас в более слабых командах нет игроков, которые усилили бы наши линии.</div> : (
        <div className="hd-selgrid">
          {a.selection.map((g) => <SelectionCard key={`${g.teamKey}:${g.line}`} g={g} q={q} bestId={a.teams.find((t) => t.key === g.teamKey)?.squad.filter((p) => p.line === g.line && p.rating != null).sort((x, y) => (y.rating as number) - (x.rating as number))[0]?.id ?? null} />)}
        </div>
      )}

      <SectionTitle id="losing" right={`${a.losing.length}`} sub={<>Падение формы — последние матчи ниже своего сезона на {Math.round(-th.losingTrendRel * 100)}% и больше. Вне ротации — команда играла, а игрок 3 разобранных матча подряд не попадал в состав.</>}>
        Кого теряем
      </SectionTitle>
      <PlayerTable players={a.losing} showTier emptyText="Никто не выпадает: форма ровная, ротация стабильная." />

      <SectionTitle id="risk" right={`${a.risk.length}`} sub={<>Игроки ФК Динамо (Высшая лига) с рейтингом ниже медианы Первой лиги своего возраста. Медианы Первой лиги: {a.medians.map((m) => `${m.year} — ${m.first ?? '—'}`).join(', ')}.</>}>
        Зона риска в ФК Динамо
      </SectionTitle>
      <PlayerTable players={a.risk} emptyText="В ФК Динамо нет игроков ниже медианы Первой лиги." />

      <SectionTitle id="lines" sub={<>Средний рейтинг линии против средней по своему дивизиону; заметно — от {Math.round(th.lineGapRel * 100)}%. Слабая линия — где точечное усиление даст больше всего.</>}>
        Слабые и сильные линии
      </SectionTitle>
      <div className="hd-cols" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <LineList title="Слабее лиги" rows={a.weakLines} q={q} tone="down" empty="Нет линий заметно слабее лиги." />
        <LineList title="Сильнее лиги" rows={a.strongLines} q={q} tone="up" empty="Нет линий заметно сильнее лиги." />
      </div>
    </div>
  );
}

function LineList({ title, rows, q, tone, empty }: { title: string; rows: HoldingAnalytics['weakLines']; q: string; tone: 'up' | 'down'; empty: string }) {
  return (
    <div className="hd-col">
      <h3>{title} <span className={`hd-${tone}`}>{rows.length}</span></h3>
      <ul className="hd-list">
        {rows.map((l) => (
          <li key={`${l.teamKey}${l.line}`}>
            <Link to={`/holding/teams/${encodeURIComponent(l.teamKey)}${q}`}>{shortClub(l.clubLabel)} {l.year} · {l.title.toLowerCase()}</Link>
            <span className={`hd-${tone} hd-rating`}>{pm(Math.round(l.gapRel * 100))}%</span>
            <span className="hd-list__sub">{num(l.teamAvg)} против {num(l.divAvg)} в лиге</span>
          </li>
        ))}
        {rows.length === 0 && <li className="hd-muted">{empty}</li>}
      </ul>
    </div>
  );
}

function SelectionCard({ g, q, bestId }: { g: SelectionGroup; q: string; bestId: number | null }) {
  return (
    <section className="hd-block">
      <div className="hd-selcard__head">
        <h3 className="hd-selcard__title"><Link to={`/holding/teams/${encodeURIComponent(g.teamKey)}${q}`}>{shortClub(g.clubLabel)} {g.year}</Link> · {LINE_TITLE[g.line].toLowerCase()}</h3>
        <span className="hd-muted hd-small">наша линия: средний {g.ourAvg != null ? num(g.ourAvg) : '—'}, лучший {g.ourBest != null ? num(g.ourBest) : '—'}</span>
      </div>
      <table className="hd-table hd-table--tight">
        <thead><tr><th>Амплуа</th><th>Где играет</th><th className="num">Рейтинг</th><th>В регионе</th><th className="num">Матчей</th>{bestId != null && <th />}</tr></thead>
        <tbody>
          {g.candidates.map((c) => (
            <tr key={c.id}>
              <td>{shortPos(c.position)}</td>
              <td>{c.club}<span className="hd-team__sub">{c.division}</span></td>
              <td className="num hd-rating">{num(c.rating)}</td>
              <td><span className={`hd-tag ${c.pctRegion <= 10 ? 'hd-tag--up' : c.pctRegion <= 25 ? 'hd-tag--brand' : ''}`}>топ {c.pctRegion}%</span></td>
              <td className="num hd-muted">{c.mp}</td>
              {bestId != null && <td className="num"><Link to={`/holding/compare?a=${bestId}&b=${c.id}${q ? '&' + q.slice(1) : ''}`} className="hd-link" title="Бок о бок с лучшим игроком нашей линии по всем показателям">сравнить</Link></td>}
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
