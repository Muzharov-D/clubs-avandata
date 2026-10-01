import { Link } from 'react-router-dom';
import { shortName } from '../federation/utils';
import { useHoldingChanges, LIST_SHORT, type ListChange } from './api';
import { SectionTitle } from './parts';

/** Обзор: «за неделю» — главные сдвиги одной строкой на список, клик — полная динамика. */
export function WeekTeaser({ q }: { q: string }) {
  const ch = useHoldingChanges('week');
  const c = ch.data;
  const moved = c?.lists.filter((l) => l.entered.length || l.left.length) ?? [];
  return (
    <>
      <SectionTitle sub={c ? <>Сравнение: {c.base.label}. <Link to={`/holding/changes${q}`} className="fed-link">Вся динамика →</Link></> : 'Сравниваем с прошлой неделей…'}>Что изменилось</SectionTitle>
      {!c ? <div className="fed-skeleton" style={{ height: 90 }} /> : (
        <Link to={`/holding/changes${q}`} className="fed-card hc-week">
          {moved.length === 0 && c.risers.length === 0 && c.fallers.length === 0 && c.lines.sagged.length === 0
            ? <span className="hc-muted">За это время списки решений не изменились.</span>
            : (
              <div className="hc-week__grid">
                {moved.map((l) => <WeekList key={l.key} l={l} />)}
                {c.risers.length > 0 && <div className="hc-week__item"><b className="hc-delta--up">↑ {c.risers.length}</b> выросли: {c.risers.slice(0, 3).map((p) => shortName(p.name)).join(', ')}</div>}
                {c.fallers.length > 0 && <div className="hc-week__item"><b className="hc-delta--down">↓ {c.fallers.length}</b> упали: {c.fallers.slice(0, 3).map((p) => shortName(p.name)).join(', ')}</div>}
                {c.lines.sagged.length > 0 && <div className="hc-week__item"><b style={{ color: 'var(--warning)' }}>{c.lines.sagged.length}</b> {c.lines.sagged.length === 1 ? 'линия просела' : 'линии просели'}: {c.lines.sagged.slice(0, 2).map((l) => `${l.year} ${l.title.toLowerCase()}`).join(', ')}</div>}
              </div>
            )}
        </Link>
      )}
    </>
  );
}

function WeekList({ l }: { l: ListChange }) {
  const bits: string[] = [];
  if (l.entered.length) bits.push(`+${l.entered.length} (${l.entered.slice(0, 2).map((p) => shortName(p.name)).join(', ')}${l.entered.length > 2 ? ` и ещё ${l.entered.length - 2}` : ''})`);
  if (l.left.length) bits.push(`−${l.left.length}`);
  return <div className="hc-week__item"><b>{LIST_SHORT[l.key]}</b>: {l.before} → {l.now} · {bits.join(' · ')}</div>;
}
