import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../api/client';
import { toast } from '../../components/Toast';
import { GROUPS, GROUP_TITLE, groupOf, groupOfPosition, useCanNote, useCoachPositions, type LeaguePlayer, type PositionGroup } from './api';

const plMatch = (n: number) => { const a = n % 100, b = n % 10; if (a >= 11 && a <= 14) return 'матчей'; if (b === 1) return 'матч'; if (b >= 2 && b <= 4) return 'матча'; return 'матчей'; };

/**
 * Позиции игрока: основная специализация и где он выходил — по разметке матчей; плюс позиции,
 * на которых его хочет видеть тренер. Их проставляет руководство; доска комплектования ставит
 * игрока туда в первую очередь, если место в основе свободно, и показывает в глубине позиции.
 */
export function PlayerPositions({ p }: { p: LeaguePlayer }) {
  const can = useCanNote();
  const cp = useCoachPositions();
  const qc = useQueryClient();
  const home = groupOf(p);
  const played = new Map<PositionGroup, { n: number; titles: string[] }>();
  for (const r of p.roles?.length ? p.roles : p.position ? [{ title: p.position, n: p.mp }] : []) {
    const g = groupOfPosition(r.title); if (!g) continue;
    const e = played.get(g) ?? played.set(g, { n: 0, titles: [] }).get(g)!;
    e.n += r.n; e.titles.push(`${r.title.toLowerCase()} — ${r.n}`);
  }
  const coach = (cp.data?.positions ?? []).filter((x) => x.playerId === p.id);
  const coachSet = new Set(coach.map((x) => x.group));
  const options = GROUPS.filter((g) => g !== home && !coachSet.has(g));
  const done = () => qc.invalidateQueries({ queryKey: ['holding', 'positions'] });
  const add = useMutation({ mutationFn: (g: PositionGroup) => api(`/holding/players/${p.id}/positions/${g}`, { method: 'POST', body: {} }), onSuccess: () => { done(); toast.success('Позиция добавлена — доска комплектования её учтёт'); }, onError: () => toast.error('Не удалось сохранить позицию') });
  const del = useMutation({ mutationFn: (g: PositionGroup) => api(`/holding/players/${p.id}/positions/${g}`, { method: 'DELETE', body: {} }), onSuccess: done, onError: () => toast.error('Не удалось убрать позицию') });

  return (
    <div className="card an">
      <div className="page-section-title">Позиции <span className="an-model-tag">по разметке матчей и решению тренера</span></div>
      <div className="hd-pos">
        <div className="hd-pos__row">
          <span className="hd-pos__label">Основная</span>
          <span className="hd-pos__chips"><span className="hd-pos__chip hd-pos__chip--main">{home ? GROUP_TITLE[home] : '—'}</span></span>
        </div>
        <div className="hd-pos__row">
          <span className="hd-pos__label">Выходил</span>
          <span className="hd-pos__chips">
            {[...played].sort((a, b) => b[1].n - a[1].n).map(([g, e]) => (
              <span key={g} className="hd-pos__chip" title={e.titles.join('\n')}>{GROUP_TITLE[g]} <small>{e.n} {plMatch(e.n)}</small></span>
            ))}
            {played.size === 0 && <span className="hd-muted">нет разобранных матчей</span>}
          </span>
        </div>
        <div className="hd-pos__row">
          <span className="hd-pos__label">Видит тренер</span>
          <span className="hd-pos__chips">
            {coach.map((x) => (
              <span key={x.group} className="hd-pos__chip hd-pos__chip--coach" title={x.authorName ? `Добавил: ${x.authorName}` : undefined}>
                {GROUP_TITLE[x.group]}
                {can && <button type="button" className="hd-pos__x" aria-label={`Убрать позицию «${GROUP_TITLE[x.group]}»`} onClick={() => del.mutate(x.group)}>×</button>}
              </span>
            ))}
            {coach.length === 0 && !can && <span className="hd-muted">нет</span>}
            {can && options.length > 0 && (
              <select className="hd-pos__add" value="" disabled={add.isPending} onChange={(e) => { if (e.target.value) add.mutate(e.target.value as PositionGroup); }} aria-label="Добавить позицию">
                <option value="">+ добавить позицию</option>
                {options.map((g) => <option key={g} value={g}>{GROUP_TITLE[g]}</option>)}
              </select>
            )}
          </span>
        </div>
        <p className="hd-pos__hint">Позицию, на которой тренер хочет видеть игрока, доска комплектования учитывает в первую очередь: игрок встаёт туда, если место в основе свободно, и показывается в глубине позиции с жёлтой пунктирной меткой.</p>
      </div>
    </div>
  );
}
