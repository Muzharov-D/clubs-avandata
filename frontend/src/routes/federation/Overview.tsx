import { type CSSProperties } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';
import { useAuth } from '../../contexts/AuthContext';

interface OverviewData {
  clubs: { total: number; paid: number; free: number };
  teams: number;
  players: number;
  matches: number;
}

/**
 * Обзор региона (Эпик 1, FR4–5). KPI + честный охват (клубы региона с разбивкой
 * база/глубина — слои НЕ суммируются в одну цифру). Данные: /federation/overview.
 */
export function FederationOverview() {
  const { federation } = useAuth() as { federation: { region?: string } | null };
  const { data, isLoading, error } = useQuery({
    queryKey: ['federation', 'overview'],
    queryFn: () => api<OverviewData>('/federation/overview'),
  });

  return (
    <div>
      <h1 style={titleStyle}>Обзор региона</h1>
      <p style={subStyle}>{federation?.region ?? 'Регион'} · детско-юношеский футбол</p>

      {isLoading && <div style={mutedBox}>Загрузка…</div>}
      {error && <div style={{ ...mutedBox, color: 'var(--danger)' }}>Не удалось загрузить данные</div>}

      {data && (
        <div style={kpiGrid}>
          <div style={{ ...cardStyle, borderColor: 'rgba(37,99,235,0.4)' }}>
            <div style={kpiLabel}>Клубы региона</div>
            <div style={kpiValue}>{data.clubs.total}</div>
            <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
              <span style={chipCyan}>{data.clubs.paid} на глубине</span>
              <span style={chipMuted}>{data.clubs.free} базовый план</span>
            </div>
          </div>
          <Kpi label="Команд" value={data.teams} />
          <Kpi label="Игроков в реестре" value={data.players} />
          <Kpi label="Матчей разобрано" value={data.matches} />
        </div>
      )}
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: number }) {
  return (
    <div style={cardStyle}>
      <div style={kpiLabel}>{label}</div>
      <div style={kpiValue}>{value}</div>
    </div>
  );
}

const titleStyle: CSSProperties = { fontFamily: 'var(--font-display, inherit)', fontSize: 20, fontWeight: 600, margin: 0 };
const subStyle: CSSProperties = { color: 'var(--text-muted)', fontSize: 13, marginTop: 4 };
const mutedBox: CSSProperties = { marginTop: 16, color: 'var(--text-muted)', fontSize: 14 };
const kpiGrid: CSSProperties = {
  marginTop: 16, display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12,
};
const cardStyle: CSSProperties = {
  background: 'var(--bg-surface)', border: '1px solid var(--border)',
  borderRadius: 10, padding: '12px 14px',
};
const kpiLabel: CSSProperties = { color: 'var(--text-muted)', fontSize: 12 };
const kpiValue: CSSProperties = {
  fontFamily: 'var(--font-display, inherit)', fontWeight: 600, fontSize: 26,
  fontVariantNumeric: 'tabular-nums', lineHeight: 1.15, marginTop: 2,
};
const chipCyan: CSSProperties = {
  fontSize: 10, color: 'var(--ink-on-bright, #06283d)', background: 'var(--accent-cyan, #22d3ee)',
  borderRadius: 5, padding: '1px 6px', fontWeight: 500,
};
const chipMuted: CSSProperties = {
  fontSize: 10, color: 'var(--text-muted)', border: '1px solid var(--border)',
  borderRadius: 5, padding: '1px 6px',
};
