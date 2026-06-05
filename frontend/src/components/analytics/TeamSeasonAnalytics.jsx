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
import { formLetterRu, matchesWord } from '../../utils/num';
import { AnimatedNumber, Reveal, StaggerList } from '../motion';
import { Sparkline } from '../Sparkline';
import './analytics.css';

// teamSummaryStats-значение приходит как число или { value } / { pct }.
function readNum(v) {
  if (v == null) return null;
  if (typeof v === 'object') return v.value != null ? Number(v.value) : v.pct != null ? Number(v.pct) : null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// Метрики «океана» — динамика по турам (старое→новое). Цвет = группа.
const TREND_METRICS = [
  { key: 'goals', label: 'Голы',      color: 'var(--rating-good)',   fmt: (v) => String(Math.round(v)) },
  { key: 'xg',    label: 'xG',        color: 'var(--brand-primary)', fmt: (v) => v.toFixed(2) },
  { key: 'poss',  label: 'Владение',  color: 'var(--brand-accent)',  fmt: (v) => Math.round(v) + '%' },
  { key: 'shots', label: 'Удары',     color: '#8b5cf6',              fmt: (v) => String(Math.round(v)) },
];

/** Словесный вердикт по разнице факт-очков и ожидаемых (без сырого числа удачи). */
function luckVerdict(luck) {
  if (luck <= -0.5) return 'Заслужили больше, чем взяли';
  if (luck >= 0.5) return 'Эффективная реализация — очков больше, чем по xG';
  return 'Результат по игре';
}

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

  // «Океан» — динамика ключевых командных метрик по турам (старое→новое).
  const trend = useMemo(() => {
    return details
      .map((d) => {
        const { our } = ourSideKey(d);
        const ts = d.teamSummaryStats?.[our] || {};
        const gF = our === 'home' ? d.score?.home : d.score?.away;
        return {
          date: d.date,
          oppName: our === 'home' ? d.away : d.home,
          goals: gF != null ? Number(gF) : null,
          xg: teamXg(d, our),
          poss: readNum(ts.possessionPct),
          shots: readNum(ts.shots?.total),
        };
      })
      .filter((s) => s.date != null)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [details]);

  if (!rows.length) return null;

  const sum = rows.reduce((a, r) => ({
    xgF: a.xgF + (r.xgF || 0), xgA: a.xgA + (r.xgA || 0), gF: a.gF + (r.gF || 0),
    xpts: a.xpts + (r.xpts || 0),
    // actual суммируем ТОЛЬКО где есть xpts — «удача» = actual−xpts должна
    // сравнивать одно подмножество матчей (иначе вердикт ложный).
    actual: a.actual + (r.xpts != null && r.actual != null ? r.actual : 0),
    // Счётчики матчей именно с этим xG — чтобы делить xG/матч на верное N.
    nXgF: a.nXgF + (r.xgF != null ? 1 : 0),
    nXgA: a.nXgA + (r.xgA != null ? 1 : 0),
  }), { xgF: 0, xgA: 0, gF: 0, xpts: 0, actual: 0, nXgF: 0, nXgA: 0 });
  const n = rows.length;
  const fin = finishing(sum.gF, sum.xgF);
  const luck = sum.actual - sum.xpts;
  const form = [...rows].slice(0, 5).reverse();

  return (
    <section className="cd__panel reveal an">
      <div className="cd__panel-header">
        <h2 className="cd__panel-title">xG-аналитика сезона</h2>
        <span className="cd__panel-sub">{n} {matchesWord(n)} с xG · модель</span>
      </div>

      <Reveal variant="slide-up" duration={0.7}>
        <div className="an-hero">
          <div className="an-hero__val">
            <AnimatedNumber value={sum.xpts} format={(v) => v.toFixed(1)} stiffness={90} damping={26} />
          </div>
          <div className="an-hero__lab">ожидаемые очки за сезон</div>
          <div
            className="an-hero__verdict"
            style={{ color: luck >= 0.5 ? 'var(--an-pos)' : luck <= -0.5 ? 'var(--an-neg)' : 'var(--an-muted)' }}
          >
            {luckVerdict(luck)}
          </div>

          <div className="an-hero__support">
            <div className="an-badge" title={`против ${f2(sum.xgA / (sum.nXgA || 1))}`}>
              <span className="an-badge__lab">xG/матч</span>
              <span className="an-badge__val">
                <AnimatedNumber value={sum.xgF / (sum.nXgF || 1)} format={(v) => v.toFixed(2)} />
              </span>
            </div>
            <div className="an-badge" title={`${sum.gF} голов при xG ${f1(sum.xgF)}`}>
              <span className="an-badge__lab">реализация</span>
              <span
                className="an-badge__val"
                style={{ color: fin > 0 ? 'var(--an-pos)' : fin < 0 ? 'var(--an-neg)' : undefined }}
              >
                {signed(fin)}
              </span>
            </div>
            <div className="an-badge">
              <span className="an-badge__lab">факт очков</span>
              <span className="an-badge__val">
                <AnimatedNumber value={sum.actual} format={(v) => String(Math.round(v))} />
              </span>
            </div>
          </div>

          <div className="an-hero__form">
            <span className="an-badge__lab">форма · {form.length} {matchesWord(form.length)}</span>
            <StaggerList speed="tight" as="div" className="an-form-dots">
              {form.map((r) => (
                <span key={r.id} className={`an-season__res an-season__res--${r.result || 'D'}`}>{formLetterRu(r.result)}</span>
              ))}
            </StaggerList>
          </div>
        </div>
      </Reveal>

      {trend.length >= 2 && (
        <div className="an-trends" style={{ marginTop: 18, paddingTop: 16, borderTop: '1px solid var(--card-border, rgba(255,255,255,0.07))' }}>
          <div className="page-section-title" style={{ marginBottom: 10 }}>
            Тренды по турам <span className="an-model-tag">{trend.length} {matchesWord(trend.length)} · от старого к новому</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {TREND_METRICS.map((m) => {
              const clean = trend.map((s) => s[m.key]).filter((v) => v != null);
              if (clean.length < 2) return null;
              const last = clean[clean.length - 1];
              const first = clean[0];
              const delta = last - first;
              const up = delta > 0;
              const flat = Math.abs(delta) < (m.key === 'xg' ? 0.05 : 0.5);
              const dCol = flat ? 'var(--an-muted)' : up ? 'var(--an-pos)' : 'var(--an-neg)';
              return (
                <div key={m.key} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ flex: '0 0 84px', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-muted, #9fb0d0)' }}>{m.label}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <Sparkline values={clean} color={m.color} width={240} height={30} />
                  </div>
                  <span style={{ flex: '0 0 52px', textAlign: 'right', fontWeight: 700, fontSize: '0.95rem' }}>{m.fmt(last)}</span>
                  <span style={{ flex: '0 0 56px', textAlign: 'right', fontSize: '0.78rem', fontWeight: 700, color: dCol }}>
                    {flat ? '→' : up ? '▲' : '▼'} {m.fmt(Math.abs(delta))}
                  </span>
                </div>
              );
            })}
          </div>
          <div className="an-note" style={{ marginTop: 8 }}>
            Динамика командных метрик по сыгранным турам — куда движется игра, а не одна точка. Дельта — последний тур против первого.
          </div>
        </div>
      )}

      {/* Список матчей — в ТОМ ЖЕ направлении, что тренды-спарклайны: от старого
          к новому. rows отсортированы DESC (новые сверху), поэтому reverse(). */}
      <div className="an-season__list">
        {[...rows].reverse().map((r) => (
          <div className="an-season__row" key={r.id} onClick={() => navigate(`/matches/${r.id}`)}>
            <span className="an-season__opp">{r.oppName || 'Соперник'}{r.gF != null ? ` · ${r.gF}:${r.gA}` : ''}</span>
            <span className="an-season__xg">xG {f2(r.xgF)}–{f2(r.xgA)}</span>
            <span className={`an-season__res an-season__res--${r.result || 'D'}`}>{formLetterRu(r.result)}</span>
          </div>
        ))}
      </div>
      <div className="an-note">Ожидаемые очки и заслуженность — модель (двойной Пуассон по командному xG из отчётов). Реализация &gt;0 — забивали больше, чем наигрывали по моментам.</div>
    </section>
  );
}
