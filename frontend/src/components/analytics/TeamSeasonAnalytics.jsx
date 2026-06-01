/**
 * Сезонная xG-аналитика команды: ожидаемые очки (xPTS) vs фактические, xG
 * за/против, реализация, индекс везения, форма по результатам и xG-строка по
 * каждому матчу. Покрывает критики 15/16, улучшения 50/63, вау 51/71/78/95.
 *
 * Лениво дозагружает детали матчей (с teamSummaryStats) — defer, как MatchDetail.
 */
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchMatch } from '../../services/api';
import { ourSideKey, teamXg, expectedPoints, finishing } from '../../utils/analytics';
import './analytics.css';

function f1(v) { return v == null ? '—' : Number(v).toFixed(1); }
function f2(v) { return v == null ? '—' : Number(v).toFixed(2); }
function signed(v, d = 1) { if (v == null) return '—'; const n = Number(v); return `${n > 0 ? '+' : ''}${n.toFixed(d)}`; }

export default function TeamSeasonAnalytics({ matches }) {
  const navigate = useNavigate();
  const idsKey = useMemo(() => (matches || []).map((m) => m.id).join('|'), [matches]);
  const [details, setDetails] = useState([]);

  useEffect(() => {
    if (!matches?.length) { setDetails([]); return; }
    let cancelled = false;
    const handle = setTimeout(() => {
      Promise.all(matches.map((m) => fetchMatch(m.id).catch(() => null)))
        .then((res) => { if (!cancelled) setDetails(res.filter(Boolean)); });
    }, 1200);
    return () => { cancelled = true; clearTimeout(handle); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey]);

  const rows = useMemo(() => {
    return details
      .map((d) => {
        const { our, opp } = ourSideKey(d);
        const xgF = teamXg(d, our);
        const xgA = teamXg(d, opp);
        if (xgF == null && xgA == null) return null;
        const gF = our === 'home' ? d.score?.home : d.score?.away;
        const gA = our === 'home' ? d.score?.away : d.score?.home;
        const xpts = xgF != null && xgA != null ? expectedPoints(xgF, xgA) : null;
        const actual = gF != null && gA != null ? (gF > gA ? 3 : gF === gA ? 1 : 0) : null;
        const oppName = our === 'home' ? d.away : d.home;
        return { id: d.id, date: d.date, oppName, xgF, xgA, gF, gA, xpts, actual,
          result: actual == null ? null : actual === 3 ? 'W' : actual === 1 ? 'D' : 'L' };
      })
      .filter(Boolean)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [details]);

  if (!rows.length) return null;

  const sum = rows.reduce((a, r) => ({
    xgF: a.xgF + (r.xgF || 0), xgA: a.xgA + (r.xgA || 0), gF: a.gF + (r.gF || 0),
    xpts: a.xpts + (r.xpts || 0), actual: a.actual + (r.actual || 0),
  }), { xgF: 0, xgA: 0, gF: 0, xpts: 0, actual: 0 });
  const n = rows.length;
  const fin = finishing(sum.gF, sum.xgF);
  const luck = sum.actual - sum.xpts;
  const form = [...rows].slice(0, 5).reverse();

  return (
    <section className="cd__panel reveal an">
      <div className="cd__panel-header">
        <h2 className="cd__panel-title">xG-аналитика сезона</h2>
        <span className="cd__panel-sub">{n} матчей с xG · модель</span>
      </div>

      <div className="an-season__head">
        <div className="an-season__kpi">
          <div className="an-season__kpi-val">{f1(sum.xpts)}</div>
          <div className="an-season__kpi-lab">ожидаемые очки</div>
          <div className="an-season__kpi-sub">факт {sum.actual} · {luck >= 0 ? 'повезло ' : 'недобор '}{signed(luck)}</div>
        </div>
        <div className="an-season__kpi">
          <div className="an-season__kpi-val">{f2(sum.xgF / n)}</div>
          <div className="an-season__kpi-lab">xG за матч</div>
          <div className="an-season__kpi-sub">против {f2(sum.xgA / n)}</div>
        </div>
        <div className="an-season__kpi">
          <div className="an-season__kpi-val" style={{ color: fin > 0 ? 'var(--an-pos)' : fin < 0 ? 'var(--an-neg)' : undefined }}>{signed(fin)}</div>
          <div className="an-season__kpi-lab">реализация (Г−xG)</div>
          <div className="an-season__kpi-sub">{sum.gF} голов при xG {f1(sum.xgF)}</div>
        </div>
        <div className="an-season__kpi">
          <div className="an-form-dots">
            {form.map((r) => (
              <span key={r.id} className={`an-season__res an-season__res--${r.result || 'D'}`}>{r.result || '–'}</span>
            ))}
          </div>
          <div className="an-season__kpi-lab" style={{ marginTop: 8 }}>форма (5 матчей)</div>
        </div>
      </div>

      <div className="an-season__list">
        {rows.map((r) => (
          <div className="an-season__row" key={r.id} onClick={() => navigate(`/matches/${r.id}`)}>
            <span className="an-season__opp">{r.oppName || 'Соперник'}{r.gF != null ? ` · ${r.gF}:${r.gA}` : ''}</span>
            <span className="an-season__xg">xG {f2(r.xgF)}–{f2(r.xgA)}</span>
            <span className={`an-season__res an-season__res--${r.result || 'D'}`}>{r.result || '–'}</span>
          </div>
        ))}
      </div>
      <div className="an-note">Ожидаемые очки и заслуженность — модель (двойной Пуассон по командному xG из отчётов). Реализация &gt;0 — забивали больше, чем наигрывали по моментам.</div>
    </section>
  );
}
