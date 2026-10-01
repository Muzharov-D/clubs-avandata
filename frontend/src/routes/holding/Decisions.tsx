import { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { FedError } from '../federation/FedState';
import { ratingColor } from '../federation/ratings';
import { useHoldingAnalytics, useSlugQuery, num, pm, shortClub, shortPos, plMatch, type SelectionGroup } from './api';
import { PlayerTable, SectionTitle, Kpi } from './parts';

/**
 * Решения — списки, которые руководство закрывает действием: молодёжка, переходы между
 * школами, на возраст старше, селекция, кого теряем, зона риска, линии.
 * Каждый список объясняет своё правило словами и цифрами порогов.
 */
export function HoldingDecisions() {
  const an = useHoldingAnalytics();
  const q = useSlugQuery();
  const { hash } = useLocation();
  useEffect(() => {
    if (!hash || !an.data) return;
    const el = document.getElementById(hash.slice(1));
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [hash, an.data]);
  if (an.error) return <FedError subject="Решения" />;
  if (an.isLoading || !an.data) return <div><div className="fed-skeleton" style={{ height: 120, marginBottom: 20 }} /><div className="fed-skeleton" style={{ height: 400 }} /><p className="fed-note" style={{ marginTop: 12 }}>Считаем игроков относительно лиги по всем возрастам…</p></div>;
  const a = an.data;
  const th = a.thresholds;
  const youthAll = [...a.youth.ready, ...a.youth.watch, ...a.youth.rest];
  const slots = a.youthSlots;

  return (
    <div>
      <div className="fed-hero" style={{ marginBottom: 16 }}>
        <h1 className="fed-hero__title" style={{ fontSize: 30 }}>Решения</h1>
        <p className="fed-hero__sub" style={{ fontSize: 14 }}>Кто готов подняться выше, кого упускаем, где теряем. Всё относительно лиги и региона, а не внутри команды.</p>
      </div>

      <div className="fed-grid fed-grid--4 hold-kpi">
        <Kpi label="В молодёжную команду" value={a.youth.ready.length} sub={`готовы при ${slots} местах · ${a.youth.watch.length} присмотреться`} tone="good" />
        <Kpi label="Царское Село → ФК Динамо" value={a.promote.length} sub="выше медианы Высшей лиги своего возраста" />
        <Kpi label="На возраст старше" value={a.olderAge.length} sub="не ниже медианы старшей команды школы" />
        <Kpi label="Кого теряем" value={a.losing.length} sub={`падение формы или выпали из ротации`} tone={a.losing.length ? 'bad' : undefined} />
      </div>

      {/* Молодёжка */}
      <SectionTitle id="youth" sub={<>Возраста {a.youthFromYear} г.р. и старше. «Готов» — топ-{th.youthReadyPct}% региона своего возраста и не меньше {th.minMatchesReady} разобранных матчей; «присмотреться» — топ-{th.youthWatchPct}%. Мест в молодёжной команде — {slots}: первые {slots} строк с запасом, дальше — резерв.</>}>
        В молодёжную команду
      </SectionTitle>
      <section className="fed-card">
        <PlayerTable players={youthAll} showTier limit={Math.max(slots * 2, 10)} emptyText="Пока никто не проходит по порогам." extra={(p) => (youthAll.indexOf(p as never) < slots ? <span className="hc-tier hc-tier--ready" title={`в первых ${slots}`}>№{youthAll.indexOf(p as never) + 1}</span> : null)} />
      </section>

      {/* ЦС → Динамо */}
      <SectionTitle id="promote" sub={<>Игроки Царского Села (Первая лига), чей рейтинг не ниже медианы игроков Высшей лиги своего возраста — они уже играют на уровне основного «Динамо». Медианы по возрастам: {a.medians.map((m) => `${m.year}: ${m.top ?? '—'}`).join(' · ')}.</>}>
        Из Царского Села в ФК Динамо
      </SectionTitle>
      <section className="fed-card"><PlayerTable players={a.promote} emptyText="Сейчас никто из Царского Села не дотягивает до медианы Высшей лиги своего возраста." /></section>

      {/* На возраст старше */}
      <SectionTitle id="older" sub="Внутри своей школы: рейтинг не ниже медианы оценённых игроков команды на год старше. В скобках — каким по рейтингу он был бы там.">
        Готовы играть на возраст старше
      </SectionTitle>
      <section className="fed-card">
        <PlayerTable players={a.olderAge} emptyText="Пока никто не проходит по медиане старшей команды." extra={(p) => { const c = a.olderAge.find((x) => x.id === p.id); return c ? <span className="hc-muted hc-small">в «{c.olderTeamName}» был бы {c.olderRank}-м из {c.olderSize} (медиана {num(c.olderMedian)})</span> : null; }} />
      </section>

      {/* Селекция */}
      <SectionTitle id="selection" sub={<>Игроки других школ того же возраста, которые играют в команде слабее нашей (или лигой ниже) и при этом сильнее нашей линии на 10% и больше, из топ-35% региона. Без имён: команда, амплуа, рейтинг, место. Имена — в базе разборов по запросу.</>}>
        Кого упускает селекция
      </SectionTitle>
      {a.selection.length === 0 ? <div className="fed-note">Сейчас в более слабых командах нет игроков, которые усилили бы наши линии.</div> : (
        <div className="fed-grid fed-grid--2">
          {a.selection.map((g) => <SelectionCard key={`${g.teamKey}:${g.line}`} g={g} q={q} />)}
        </div>
      )}

      {/* Кого теряем */}
      <SectionTitle id="losing" sub={<>Падение формы — последние {3} оценённых матча ниже сезонного рейтинга на {Math.round(-th.losingTrendRel * 100)}% и больше (не меньше {th.minMatchesReady} матчей). Вне ротации — команда играла, а игрок не попадал в оценённые составы два тура и больше.</>}>
        Кого теряем
      </SectionTitle>
      <section className="fed-card"><PlayerTable players={a.losing} showTier emptyText="Никто не выпадает: форма ровная, ротация стабильная." /></section>

      {/* Зона риска */}
      <SectionTitle id="risk" sub={<>Игроки ФК Динамо (Высшая лига), чей рейтинг ниже медианы игроков Первой лиги своего возраста — уровень ниже даже второй лиги. Медианы Первой лиги: {a.medians.map((m) => `${m.year}: ${m.first ?? '—'}`).join(' · ')}.</>}>
        Зона риска в основном составе
      </SectionTitle>
      <section className="fed-card"><PlayerTable players={a.risk} emptyText="В ФК Динамо нет игроков ниже медианы Первой лиги." /></section>

      {/* Линии */}
      <SectionTitle id="lines" sub={<>Средний рейтинг линии команды против средней по её дивизиону; порог — {Math.round(th.lineGapRel * 100)}%. Слабые линии — где точечное усиление даст больше всего.</>}>
        Слабые и сильные линии
      </SectionTitle>
      <div className="fed-grid fed-grid--2">
        <section className="fed-card">
          <h3 className="fed-card__title">Слабее лиги</h3>
          {a.weakLines.length === 0 ? <div className="fed-note">Нет линий заметно слабее лиги.</div> : a.weakLines.map((l, i) => (
            <div key={i} className="fed-row" style={{ padding: '8px 4px' }}>
              <Link to={`/holding/teams/${encodeURIComponent(l.teamKey)}${q}`} className="fed-row__name" style={{ textDecoration: 'none', color: 'var(--text)' }}>{shortClub(l.clubLabel)} {l.year} · {l.title}</Link>
              <span className="hc-muted">{num(l.teamAvg)} против {num(l.divAvg)}</span>
              <span className="hc-over hc-over--down">{pm(Math.round(l.gapRel * 100))}%</span>
            </div>
          ))}
        </section>
        <section className="fed-card">
          <h3 className="fed-card__title">Сильнее лиги</h3>
          {a.strongLines.length === 0 ? <div className="fed-note">Нет линий заметно сильнее лиги.</div> : a.strongLines.map((l, i) => (
            <div key={i} className="fed-row" style={{ padding: '8px 4px' }}>
              <Link to={`/holding/teams/${encodeURIComponent(l.teamKey)}${q}`} className="fed-row__name" style={{ textDecoration: 'none', color: 'var(--text)' }}>{shortClub(l.clubLabel)} {l.year} · {l.title}</Link>
              <span className="hc-muted">{num(l.teamAvg)} против {num(l.divAvg)}</span>
              <span className="hc-over hc-over--up">{pm(Math.round(l.gapRel * 100))}%</span>
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}

function SelectionCard({ g, q }: { g: SelectionGroup; q: string }) {
  return (
    <section className="fed-card">
      <h3 className="fed-card__title"><Link to={`/holding/teams/${encodeURIComponent(g.teamKey)}${q}`} style={{ color: 'inherit', textDecoration: 'none' }}>{shortClub(g.clubLabel)} {g.year}</Link> · {g.title}</h3>
      <p className="fed-card__sub">Наша линия: средний {g.ourAvg != null ? num(g.ourAvg) : '—'}, лучший {g.ourBest != null ? num(g.ourBest) : '—'} ({g.ourN} с рейтингом)</p>
      <table className="fed-table hc-table">
        <thead><tr><th>Кто</th><th>Где играет</th><th className="fed-table__num">Рейтинг</th><th>Место в регионе</th><th>Тренд</th><th className="fed-table__num">Матчей</th></tr></thead>
        <tbody>
          {g.candidates.map((c, i) => (
            <tr key={i}>
              <td>{shortPos(c.position)}</td>
              <td>{c.club} <span className="hc-muted">· {c.division.replace(/\s*лига\s*/i, ' лига')}</span></td>
              <td className="fed-table__num hc-rating" style={{ color: ratingColor(c.rating) }}>{num(c.rating)}</td>
              <td><span className={`hc-pct ${c.pctRegion <= 10 ? 'hc-pct--elite' : c.pctRegion <= 25 ? 'hc-pct--good' : 'hc-pct--mid'}`}>топ {c.pctRegion}%</span> <span className="hc-muted hc-small">{c.rankRegion}-й</span></td>
              <td className={`hc-trend ${c.trend != null && c.trend / c.rating >= 0.08 ? 'hc-trend--up' : c.trend != null && c.trend / c.rating <= -0.08 ? 'hc-trend--down' : 'hc-trend--flat'}`}>{c.trend != null ? pm(c.trend) : '—'}</td>
              <td className="fed-table__num hc-muted">{c.mp} {plMatch(c.mp)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
