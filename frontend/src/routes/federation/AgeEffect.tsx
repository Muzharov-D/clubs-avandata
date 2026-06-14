import { type CSSProperties } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../api/client';

interface AgeEffectData {
  region: { q1: number; q2: number; q3: number; q4: number; total: number };
  clubs: Array<{ slug: string; name: string; total: number; q1Pct: number | null }>;
}

const Q_LABELS = ['Q1 (янв–мар)', 'Q2 (апр–июн)', 'Q3 (июл–сен)', 'Q4 (окт–дек)'];

function skewColor(q1pct: number): string {
  if (q1pct >= 40) return 'var(--rating-poor, #d32f2f)';
  if (q1pct >= 33) return 'var(--rating-weak, #fb8c00)';
  if (q1pct >= 28) return 'var(--rating-ok, #fbc02d)';
  return 'var(--rating-good, #7cb342)';
}

/**
 * Относительный возрастной эффект (Эпик 6, FR21). Распределение по кварталам
 * рождения по региону (эталон 25%) + перекос по клубам (доля Q1). Обезличенно.
 */
export function FederationAgeEffect() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['federation', 'age-effect'],
    queryFn: () => api<AgeEffectData>('/federation/age-effect'),
  });

  const region = data?.region;
  const total = region?.total ?? 0;
  const qs = region ? [region.q1, region.q2, region.q3, region.q4] : [];
  const clubs = (data?.clubs ?? []).filter((c) => c.total > 0).sort((a, b) => (b.q1Pct ?? 0) - (a.q1Pct ?? 0));

  return (
    <div>
      <h1 style={titleStyle}>Возрастной эффект</h1>
      <p style={subStyle}>Распределение по кварталам рождения · обезличенно · эталон 25%</p>

      {isLoading && <div style={mutedBox}>Загрузка…</div>}
      {error && <div style={{ ...mutedBox, color: 'var(--danger)' }}>Не удалось загрузить</div>}
      {data && total === 0 && <div style={mutedBox}>Нет игроков с датой рождения.</div>}

      {region && total > 0 && (
        <>
          <div style={{ ...card, marginTop: 16 }}>
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 12 }}>По региону · {total} игроков</div>
            {qs.map((n, i) => {
              const pct = Math.round((n / total) * 100);
              return (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                  <span style={{ width: 110, fontSize: 12, color: 'var(--text-muted)' }}>{Q_LABELS[i]}</span>
                  <span style={barWrap}>
                    <span style={{ display: 'block', width: `${pct}%`, height: '100%', background: 'var(--brand-primary)' }} />
                    <span style={refLine} />
                  </span>
                  <span style={{ width: 64, textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontSize: 13 }}>{pct}% · {n}</span>
                </div>
              );
            })}
            <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 4 }}>
              Вертикальная линия — равномерное ожидание (25%). Перекос к Q1 = отбор более зрелых по году.
            </div>
          </div>

          {clubs.length > 0 && (
            <div style={{ ...card, marginTop: 12 }}>
              <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 10 }}>Перекос по клубам (доля Q1)</div>
              {clubs.map((c) => (
                <div key={c.slug} style={clubRow}>
                  <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 13 }}>{c.name}</span>
                  <span style={{ width: 90, height: 6, background: 'var(--bg-surface-2)', borderRadius: 3, overflow: 'hidden' }}>
                    <span style={{ display: 'block', width: `${c.q1Pct ?? 0}%`, height: '100%', background: skewColor(c.q1Pct ?? 0) }} />
                  </span>
                  <span style={{ width: 64, textAlign: 'right', fontSize: 12, color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums' }}>{c.q1Pct}% · {c.total}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

const titleStyle: CSSProperties = { fontFamily: 'var(--font-display, inherit)', fontSize: 20, fontWeight: 600, margin: 0 };
const subStyle: CSSProperties = { color: 'var(--text-muted)', fontSize: 13, marginTop: 4 };
const mutedBox: CSSProperties = { marginTop: 16, color: 'var(--text-muted)', fontSize: 14 };
const card: CSSProperties = { background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px' };
const barWrap: CSSProperties = { flex: 1, height: 18, background: 'var(--bg-surface-2)', borderRadius: 5, position: 'relative', overflow: 'hidden' };
const refLine: CSSProperties = { position: 'absolute', left: '25%', top: 0, bottom: 0, width: 1, background: 'var(--text-faint)' };
const clubRow: CSSProperties = { display: 'flex', alignItems: 'center', gap: 10, padding: '6px 0', borderBottom: '1px solid var(--border)' };
