import { Link, useNavigate } from 'react-router-dom';
import { ClubShield } from '../federation/ClubShield';
import { Matrix, HoldingSkeleton } from '../federation/HoldingView';
import { FedError } from '../federation/FedState';
import { fmtStamp, shortName } from '../federation/utils';
import { ratingColor } from '../federation/ratings';
import { useHoldingProfile, useHoldingAnalytics, useSlugQuery, num, pm, shortClub, shortPos, placeWord, type TeamLeague, type LeaguePlayer } from './api';
import { Kpi, SectionTitle } from './parts';

/**
 * Обзор — первый экран руководства. Отвечает на три вопроса недели:
 * где мы среди команд региона, кто готов подняться выше, что требует решения.
 */
export function HoldingOverview() {
  const profile = useHoldingProfile();
  const an = useHoldingAnalytics();
  const navigate = useNavigate();
  const q = useSlugQuery();
  if (profile.error || an.error) return <FedError subject="Кабинет холдинга" />;
  if (profile.isLoading || !profile.data) return <HoldingSkeleton />;
  const p = profile.data;
  const a = an.data;
  const live = p.teams.every((t) => t.standingsSource === 'ffspb-live');
  const degraded = p.teams.some((t) => t.standingsDegraded);

  const teamsSorted = (a?.teams ?? []).slice().sort((x, y) => (y.year - x.year) || x.clubLabel.localeCompare(y.clubLabel, 'ru'));
  const youthTop = a ? [...a.youth.ready, ...a.youth.watch].slice(0, 5) : [];
  const overBest = teamsSorted.filter((t) => t.overperformance != null && t.overperformance > 0).length;
  const underCount = teamsSorted.filter((t) => t.overperformance != null && t.overperformance < 0).length;

  return (
    <div>
      <header className="hold-hero">
        <div className="hold-hero__logos">{p.members.map((m) => <ClubShield key={m.key} name={m.label} logoUrl={m.logo} size={64} />)}</div>
        <div className="hold-hero__text">
          <div className="hold-hero__kicker">{p.region} · сезон {p.season === 2 ? 2026 : p.season}</div>
          <h1 className="hold-hero__title">{p.name}</h1>
          <p className="hold-hero__sub">
            {p.members.map((m, i) => <span key={m.key}>{i > 0 ? ' и ' : ''}<b>{m.label}</b> ({m.teams} команд)</span>)}
            {' · '}{p.years[p.years.length - 1]}–{p.years[0]} г.р. · Высшая и Первая лига
          </p>
          <div className="hold-hero__badges">
            <span className={`fed-badge ${live ? 'fed-badge--success' : degraded ? 'fed-badge--warning' : 'fed-badge--success'}`}>
              {live ? '● Таблицы и результаты — по протоколам ФФСПб' : degraded ? '⚠ Часть таблиц — зеркало AvanData, протоколы догружаются' : '● Официальные таблицы ФФСПб'}
            </span>
            <span className="fed-badge">обновлено {fmtStamp(p.asOf)}</span>
          </div>
        </div>
      </header>

      {/* Где мы — четыре числа */}
      <div className="fed-grid fed-grid--4 hold-kpi">
        <Kpi label="Команд в Первенстве" value={p.summary.teams} sub={p.summary.byDivision.map((d) => `${d.teams} · ${d.division}`).join(' · ')} />
        <Kpi label="Выше своего рейтинга" value={a ? overBest : '…'} sub={a ? `команд играют выше места по рейтингу · ${underCount} ниже` : 'считаем'} tone={a && underCount > overBest ? 'warn' : undefined} />
        <Kpi label="В топ-30 своей лиги" value={p.summary.inTop30} sub={`игроков среди 30 сильнейших своего возраста · ${p.summary.rated} с рейтингом`} accent />
        <Kpi label="Готовы подняться выше" value={a ? a.youth.ready.length + a.promote.length : '…'} sub={a ? `${a.youth.ready.length} в молодёжку · ${a.promote.length} из Царского Села в ФК Динамо` : 'считаем'} tone="good" />
      </div>

      {/* Что требует решения */}
      <SectionTitle sub="Списки собраны автоматически из рейтингов относительно лиги. Клик — полный список с обоснованием.">Что требует решения</SectionTitle>
      {an.isLoading || !a ? <div className="fed-skeleton" style={{ height: 180 }} /> : (
        <div className="hc-cards">
          <DecisionCard to={`/holding/decisions${q}#youth`} title="В молодёжную команду" count={a.youth.ready.length} note={`готовы · ещё ${a.youth.watch.length} присмотреться`} players={youthTop} />
          <DecisionCard to={`/holding/decisions${q}#promote`} title="Из Царского Села в ФК Динамо" count={a.promote.length} note="рейтинг выше медианы Высшей лиги" players={a.promote.slice(0, 4)} />
          <DecisionCard to={`/holding/decisions${q}#losing`} title="Кого теряем" count={a.losing.length} note="падение формы или вне ротации" players={a.losing.slice(0, 4)} tone="bad" />
          <DecisionCard to={`/holding/decisions${q}#lines`} title="Слабые линии" count={a.weakLines.length} note="линии заметно ниже своей лиги" lines={a.weakLines.slice(0, 4)} tone="warn" />
        </div>
      )}

      {/* Команды относительно лиги */}
      <SectionTitle sub="Место в таблице против места по рейтингу AvanData: если по рейтингу выше, чем в таблице — команда недобирает очки при своём составе.">Где мы среди команд региона</SectionTitle>
      {an.isLoading || !a ? <div className="fed-skeleton" style={{ height: 300 }} /> : (
        <section className="fed-card" style={{ padding: 8 }}>
          <table className="fed-table hc-teams-table">
            <thead>
              <tr><th>Команда</th><th>Лига</th><th className="fed-table__num">Место</th><th className="fed-table__num">По рейтингу</th><th>Итог</th><th className="fed-table__num">Средний класс</th><th className="fed-table__num">Лига</th><th>Линии</th></tr>
            </thead>
            <tbody>
              {teamsSorted.map((t) => <TeamRow key={t.key} t={t} onOpen={() => navigate(`/holding/teams/${encodeURIComponent(t.key)}${q}`)} />)}
            </tbody>
          </table>
        </section>
      )}

      {/* Вертикаль */}
      <SectionTitle sub="Место, очки, рейтинг и форма каждой команды. Клик — страница команды.">Вертикаль холдинга</SectionTitle>
      <Matrix data={p} selectedKey={null} onSelect={(k) => navigate(`/holding/teams/${encodeURIComponent(k)}${q}`)} />

      <p className="fed-note" style={{ marginTop: 20 }}>
        Рейтинг игрока — среднее по разобранным матчам (база разборов AvanData); место — среди игроков своего года рождения с рейтингом. Таблицы и результаты — по протоколам ФФСПб.
      </p>
    </div>
  );
}

function DecisionCard({ to, title, count, note, players, lines, tone }: { to: string; title: string; count: number; note: string; players?: LeaguePlayer[]; lines?: Array<{ clubLabel: string; year: number; title: string; gapRel: number }>; tone?: 'bad' | 'warn' }) {
  return (
    <Link to={to} className="fed-card hc-card">
      <div className="hc-card__head"><span className="hc-card__title">{title}</span><span className="hc-card__count" style={tone === 'bad' ? { color: 'var(--danger)' } : tone === 'warn' ? { color: 'var(--warning)' } : undefined}>{count}</span></div>
      <div className="fed-note" style={{ marginTop: -4 }}>{note}</div>
      <div className="hc-card__list">
        {players?.map((p) => <div key={p.id} className="hc-card__row"><b title={p.name}>{shortName(p.name)}</b><span className="hc-muted" style={{ textAlign: 'right' }}>{shortClub(p.clubLabel).replace('ФК ', '')} {p.birthYear} · {p.line ? { GK: 'вр', DEF: 'защ', MID: 'пз', FWD: 'нап' }[p.line] : '—'} · <span style={{ color: ratingColor(p.rating) }}>{p.rating ?? '—'}</span></span></div>)}
        {lines?.map((l, i) => <div key={i} className="hc-card__row"><b>{shortClub(l.clubLabel)} {l.year} · {l.title}</b><span className="hc-muted">{Math.round(l.gapRel * 100)}% к лиге</span></div>)}
        {(players?.length === 0 || lines?.length === 0) && <span className="hc-muted">пока никого</span>}
      </div>
      <span className="hc-card__more">Открыть список →</span>
    </Link>
  );
}

function TeamRow({ t, onOpen }: { t: TeamLeague; onOpen: () => void }) {
  const over = t.overperformance;
  const verdict = over == null ? '—' : over > 0 ? `перевыполняет на ${over}` : over < 0 ? `недобирает ${-over}` : 'по рейтингу';
  return (
    <tr onClick={onOpen} style={{ cursor: 'pointer' }}>
      <td><b>{shortClub(t.clubLabel)} {t.year}</b> <span className="hc-muted">{t.ageTitle}</span></td>
      <td><span className={`fed-badge ${t.divisionKey === 'Высшая' ? 'hold-badge--top' : 'hold-badge--first'}`}>{t.division.replace(/\s*лига\s*/i, ' лига')}</span></td>
      <td className="fed-table__num">{placeWord(t.place, t.placeSize)}</td>
      <td className="fed-table__num">{t.ratingRank != null ? `${t.ratingRank}-е из ${t.ratingSize}` : '—'}</td>
      <td><span className={`hc-over ${over != null && over > 0 ? 'hc-over--up' : over != null && over < 0 ? 'hc-over--down' : ''}`}>{verdict}</span></td>
      <td className="fed-table__num" style={{ color: ratingColor(t.avgRating) }}>{t.avgRating != null ? num(t.avgRating) : '—'}</td>
      <td className="fed-table__num hc-muted">{t.divAvgRating != null ? `${num(t.divAvgRating)} · ${t.divRankByAvg ?? '—'}-е из ${t.divTeams}` : '—'}</td>
      <td><div className="hc-lines">{t.lines.filter((l) => l.verdict && l.verdict !== 'ok').map((l) => <span key={l.line} className={`hc-linepill hc-linepill--${l.verdict}`}>{l.title} {l.gapRel != null ? pm(Math.round(l.gapRel * 100)) + '%' : ''}</span>)}{t.lines.every((l) => !l.verdict || l.verdict === 'ok') && <span className="hc-linepill">ровно</span>}</div></td>
    </tr>
  );
}
