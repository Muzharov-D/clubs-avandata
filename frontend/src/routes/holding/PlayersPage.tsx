import { useMemo, useState } from 'react';
import { FedError } from '../federation/FedState';
import { useHoldingAnalytics, GROUPS, GROUP_PLURAL, groupOf, type PositionGroup } from './api';
import { useScope, useScopeLabel, inScope } from './scope';
import { PlayerTable, Kpi } from './parts';

/** Все игроки холдинга с рейтингом — единый реестр с фильтрами и сортировкой по любому столбцу. */
export function HoldingPlayersPage() {
  const an = useHoldingAnalytics();
  const scope = useScope();
  const label = useScopeLabel();
  const [group, setGroup] = useState<'all' | PositionGroup>('all');
  const [qStr, setQStr] = useState('');

  // Школа и год — из общего переключателя сверху; здесь — поиск и специализация.
  const players = useMemo(() => (an.data?.players ?? []).filter((p) => inScope(scope, p)), [an.data, scope]);
  const filtered = useMemo(() => players.filter((p) =>
    (group === 'all' || groupOf(p) === group)
    && (!qStr.trim() || p.name.toLowerCase().includes(qStr.trim().toLowerCase())),
  ), [players, group, qStr]);

  if (an.error) return <FedError subject="Игроки" />;
  if (an.isLoading || !an.data) return <div className="fed-skeleton" style={{ height: 500 }} />;
  const top10 = players.filter((p) => (p.pctRegion ?? 100) <= 10).length;
  const top25 = players.filter((p) => (p.pctRegion ?? 100) <= 25).length;

  return (
    <div>
      <div className="fed-hero" style={{ marginBottom: 16 }}>
        <h1 className="fed-hero__title" style={{ fontSize: 30 }}>Игроки холдинга</h1>
        <p className="fed-hero__sub" style={{ fontSize: 14 }}>{label ?? 'Весь холдинг'} · каждый — на своём месте среди сверстников региона. Сортировка — по индексу сезона; столбцы сортируются по клику.</p>
      </div>
      <div className="fed-grid fed-grid--4 hold-kpi">
        <Kpi label="Игроков с оценкой" value={players.filter((p) => p.index != null).length} sub={`от двух полных матчей · б/о: ${players.filter((p) => p.index == null).length}`} />
        <Kpi label="Топ-10% региона" value={top10} sub="в своём возрасте" tone="good" />
        <Kpi label="Топ-25% региона" value={top25} sub="в своём возрасте" accent />
        <Kpi label="Ниже медианы лиги" value={players.filter((p) => p.rankDiv != null && p.rankDiv > p.sizeDiv / 2).length} sub="в своём дивизионе" tone="warn" />
      </div>

      <section className="fed-card">
        <div className="hc-filters">
          <input className="fed-input" placeholder="Поиск по имени…" value={qStr} onChange={(e) => setQStr(e.target.value)} style={{ flex: '1 1 200px', maxWidth: 280 }} />
          <select className="fed-select" value={group} onChange={(e) => setGroup(e.target.value as 'all' | PositionGroup)} aria-label="Специализация">
            <option value="all">Все позиции</option>
            {GROUPS.map((g) => <option key={g} value={g}>{GROUP_PLURAL[g]}</option>)}
          </select>
          <span className="hc-muted">{filtered.length} из {players.length}</span>
        </div>
        <PlayerTable players={filtered} emptyText="По фильтрам никого нет." />
      </section>
    </div>
  );
}
