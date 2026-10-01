import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';
import { FedError } from '../federation/FedState';
import { PlayerAvatar } from '../federation/PlayerAvatar';
import { ratingColor } from '../federation/ratings';
import { num, shortClub, fmtDay, plMatch, LINE_TITLE, groupTitle, NOTE_KIND, useSlugQuery, type CardResponse, type CardMetric, type NoteKind } from './api';
import { indexColor } from './viz';
import { PlayerMetricsTable } from './parts';
import { PlayerNotes } from './Notes';

/**
 * Карточка кандидата для решения — одна страница на игрока для тренерского совета.
 * Вывод словами, факты с порогами, сильные/слабые стороны против амплуа в лиге,
 * последние матчи, решения руководства. Печать — в PDF через «Печать» браузера.
 */
export function HoldingCardPage() {
  const { id = '' } = useParams();
  const q = useSlugQuery();
  const card = useQuery({
    queryKey: ['holding', 'card', id, q],
    queryFn: () => api<CardResponse | { status: 'warming' }>(`/holding/players/${encodeURIComponent(id)}/card${q}`),
    refetchInterval: (s) => { const d = s.state.data; return d && ('status' in d || d.metricsStatus === 'warming') ? 10_000 : false; },
    refetchIntervalInBackground: true,
  });
  if (card.error) return <FedError subject="Карточка кандидата" />;
  const d = card.data && !('status' in card.data) ? card.data : null;
  if (!d) return <div><div className="fed-skeleton" style={{ height: 180, marginBottom: 16 }} /><div className="fed-skeleton" style={{ height: 420 }} /></div>;
  const p = d.player, c = d.card;
  const suggested: NoteKind | undefined = c.decisions[0]?.startsWith('в молодёжную') || c.decisions[0]?.startsWith('кандидат в молодёжную') ? 'youth' : c.decisions.some((x) => x.startsWith('из Царского')) ? 'promote' : c.decisions.some((x) => x.startsWith('на возраст')) ? 'older' : undefined;
  const openNotes = d.notes.filter((n) => !n.closedAt);

  return (
    <div className="hc-card-page">
      <div className="hc-card-page__bar hc-noprint">
        <Link to={`/holding/players/${p.id}${q}`} className="fed-link">← К игроку</Link>
        <Link to={`/holding/compare?a=${p.id}${q ? '&' + q.slice(1) : ''}`} className="fed-link">Сравнить с другим игроком</Link>
        <button type="button" className="hc-btn hc-btn--primary" onClick={() => window.print()}>Печать / PDF</button>
      </div>

      <article className="hc-sheet">
        <header className="hc-sheet__head">
          <PlayerAvatar name={p.name} photoUrl={d.photo} size={84} />
          <div style={{ minWidth: 0, flex: 1 }}>
            <div className="hold-hero__kicker">Карточка кандидата · тренерский совет</div>
            <h1 className="hc-sheet__name">{p.name}</h1>
            <div className="hc-sheet__meta">
              {shortClub(p.clubLabel)} {p.birthYear}{d.birthDate ? ` · родился ${new Date(d.birthDate).toLocaleDateString('ru-RU')}` : ''} · {groupTitle(p)} · {p.division}
            </div>
          </div>
          <div className="hc-sheet__rating">
            <div className="hc-sheet__rating-value" style={{ color: indexColor(p.index) }}>{p.index != null ? p.index.toFixed(1) : '—'}</div>
            <div className="hc-muted hc-small">индекс сезона · {p.mp} {plMatch(p.mp)}</div>
          </div>
        </header>

        <section className={`hc-verdict hc-verdict--${c.verdict.tone}`}>
          <div className="hc-verdict__headline">{c.verdict.headline}</div>
          <p className="hc-verdict__summary">{c.verdict.summary}</p>
        </section>

        <div className="hc-sheet__grid">
          <section>
            <h3 className="hc-sheet__h">На чём основан вывод</h3>
            <ul className="hc-facts">
              {c.facts.map((f, i) => <li key={i} className={f.tone ? `hc-facts--${f.tone}` : undefined}>{f.text}</li>)}
            </ul>
          </section>
          <section>
            <h3 className="hc-sheet__h">Последние матчи</h3>
            <SeriesBars series={c.series} lineAvg={p.lineAvgDiv} />
            {c.stability && <p className="hc-muted hc-small" style={{ marginTop: 6 }}>Выше среднего по амплуа в лиге — {c.stability.aboveLine} из {c.stability.rated}{c.stability.streak > 0 ? ` · последние ${c.stability.streak} подряд` : ''}. Линия — среднее по амплуа в дивизионе.</p>}
          </section>
        </div>

        <div className="hc-sheet__grid">
          <section>
            <h3 className="hc-sheet__h">Сильнее амплуа лиги</h3>
            <MetricList rows={c.strengths} empty={d.metricsStatus === 'warming' ? 'Считаем показатели когорты…' : 'Ни в одном показателе не входит в верхнюю четверть амплуа.'} good />
          </section>
          <section>
            <h3 className="hc-sheet__h">Слабее амплуа лиги</h3>
            <MetricList rows={c.weaknesses} empty={d.metricsStatus === 'warming' ? 'Считаем показатели когорты…' : 'Ни в одном показателе не в нижней четверти амплуа.'} />
          </section>
        </div>

        {openNotes.length > 0 && (
          <section className="hc-sheet__notes">
            <h3 className="hc-sheet__h">Решения руководства</h3>
            {openNotes.map((n) => <div key={n.id} className="hc-small">· <b>{NOTE_KIND[n.kind]}</b>{n.text ? ` — ${n.text}` : ''} <span className="hc-muted">({fmtDay(n.createdAt)}{n.remindOn ? `, вернуться ${fmtDay(n.remindOn)}` : ''})</span></div>)}
          </section>
        )}

        <footer className="hc-sheet__foot">
          Места — среди игроков {p.birthYear} г.р. региона с рейтингом (от 2 разобранных матчей). Показатели — за матч против игроков того же амплуа в дивизионе. Данные AvanData и протоколы ФФСПб на {fmtDay(d.asOf)}.
        </footer>
      </article>

      {d.metrics && d.metrics.rows.length > 0 && (
        <details className="fed-card hc-print-break" style={{ marginTop: 18 }} open>
          <summary className="hc-sheet__h" style={{ cursor: 'pointer' }}>Все показатели против амплуа в лиге · {d.metrics.matches} {plMatch(d.metrics.matches)}</summary>
          <PlayerMetricsTable rows={d.metrics.rows} peers={1} />
        </details>
      )}

      <div className="hc-noprint"><PlayerNotes player={p} suggested={suggested} /></div>
    </div>
  );
}

function MetricList({ rows, empty, good }: { rows: CardMetric[]; empty: string; good?: boolean }) {
  if (!rows.length) return <p className="hc-muted hc-small">{empty}</p>;
  const f = (x: number | null) => (x == null ? '—' : x.toLocaleString('ru-RU', { maximumFractionDigits: 2 }));
  return (
    <ul className="hc-mlist">
      {rows.map((m) => (
        <li key={m.id}>
          <span className="hc-mlist__title">{m.title}{m.negative ? <span className="hc-muted"> (меньше — лучше)</span> : null}</span>
          <span className="hc-mlist__num"><b>{f(m.perMatch)}</b> <span className="hc-muted">против {f(m.lineAvgDiv)}</span></span>
          <span className={`hc-pct ${good ? 'hc-pct--elite' : 'hc-pct--low'}`}>{good ? `лучше ${m.pctileDiv}%` : `хуже ${100 - m.pctileDiv}%`}</span>
        </li>
      ))}
    </ul>
  );
}

/** Столбики рейтинга по матчам и линия среднего по амплуа в лиге. */
function SeriesBars({ series, lineAvg }: { series: CardResponse['card']['series']; lineAvg: number | null }) {
  if (!series.length) return <p className="hc-muted hc-small">Оценённых матчей нет.</p>;
  const max = Math.max(lineAvg ?? 0, ...series.map((s) => s.rating), 1);
  return (
    <div className="hc-bars" role="img" aria-label="Рейтинг по матчам">
      {lineAvg != null && <div className="hc-bars__line" style={{ bottom: `${(lineAvg / max) * 100}%` }} title="среднее по амплуа в лиге" />}
      {series.map((s, i) => (
        <div key={i} className="hc-bars__col" title={`${s.tour}-й тур`}>
          <div className={`hc-bars__bar${s.aboveLine ? ' hc-bars__bar--up' : s.aboveLine === false ? ' hc-bars__bar--down' : ''}`} style={{ height: `${Math.max(2, (s.rating / max) * 100)}%` }} />
          <span className="hc-bars__tour">{s.tour}</span>
        </div>
      ))}
    </div>
  );
}
