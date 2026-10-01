import { useMemo, useState } from 'react';
import { FedError } from '../federation/FedState';
import { useHoldingAnalytics, LINE_TITLE, shortClub, type Line } from './api';
import { PlayerTable, Kpi } from './parts';

/** Все игроки холдинга с рейтингом — единый реестр с фильтрами и сортировкой по любому столбцу. */
export function HoldingPlayersPage() {
  const an = useHoldingAnalytics();
  const [club, setClub] = useState('all');
  const [year, setYear] = useState('all');
  const [line, setLine] = useState<'all' | Line>('all');
  const [qStr, setQStr] = useState('');

  const players = an.data?.players ?? [];
  const clubs = useMemo(() => Array.from(new Set(players.map((p) => p.clubLabel))), [players]);
  const years = useMemo(() => Array.from(new Set(players.map((p) => p.birthYear))).sort((a, b) => b - a), [players]);
  const filtered = useMemo(() => players.filter((p) =>
    (club === 'all' || p.clubLabel === club) && (year === 'all' || String(p.birthYear) === year) && (line === 'all' || p.line === line)
    && (!qStr.trim() || p.name.toLowerCase().includes(qStr.trim().toLowerCase())),
  ), [players, club, year, line, qStr]);

  if (an.error) return <FedError subject="Игроки" />;
  if (an.isLoading || !an.data) return <div className="fed-skeleton" style={{ height: 500 }} />;
  const top10 = players.filter((p) => (p.pctRegion ?? 100) <= 10).length;
  const top25 = players.filter((p) => (p.pctRegion ?? 100) <= 25).length;

  return (
    <div>
      <div className="fed-hero" style={{ marginBottom: 16 }}>
        <h1 className="fed-hero__title" style={{ fontSize: 30 }}>Игроки холдинга</h1>
        <p className="fed-hero__sub" style={{ fontSize: 14 }}>Все игроки с рейтингом, каждый — на своём месте среди сверстников региона.</p>
      </div>
      <div className="fed-grid fed-grid--4 hold-kpi">
        <Kpi label="С рейтингом" value={players.length} sub="не меньше 2 разобранных матчей" />
        <Kpi label="Топ-10% региона" value={top10} sub="в своём возрасте" tone="good" />
        <Kpi label="Топ-25% региона" value={top25} sub="в своём возрасте" accent />
        <Kpi label="Ниже медианы лиги" value={players.filter((p) => p.rankDiv != null && p.rankDiv > p.sizeDiv / 2).length} sub="в своём дивизионе" tone="warn" />
      </div>

      <section className="fed-card">
        <div className="hc-filters">
          <input className="fed-input" placeholder="Поиск по имени…" value={qStr} onChange={(e) => setQStr(e.target.value)} style={{ flex: '1 1 200px', maxWidth: 280 }} />
          <select className="fed-select" value={club} onChange={(e) => setClub(e.target.value)} aria-label="Школа">
            <option value="all">Обе школы</option>
            {clubs.map((c) => <option key={c} value={c}>{shortClub(c)}</option>)}
          </select>
          <select className="fed-select" value={year} onChange={(e) => setYear(e.target.value)} aria-label="Год рождения">
            <option value="all">Все возраста</option>
            {years.map((y) => <option key={y} value={String(y)}>{y} г.р.</option>)}
          </select>
          <select className="fed-select" value={line} onChange={(e) => setLine(e.target.value as 'all' | Line)} aria-label="Линия">
            <option value="all">Все линии</option>
            {(['GK', 'DEF', 'MID', 'FWD'] as Line[]).map((l) => <option key={l} value={l}>{LINE_TITLE[l]}</option>)}
          </select>
          <span className="hc-muted">{filtered.length} из {players.length}</span>
        </div>
        <PlayerTable players={filtered} emptyText="По фильтрам никого нет." />
      </section>
    </div>
  );
}
