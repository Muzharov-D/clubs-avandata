/**
 * Отпечаток идентичности команды: владение vs прямота передач vs прессинг vs
 * переходная угроза (вау 94, улучшение 62). По последнему разобранному матчу.
 */
import { num } from '../../utils/num';
import { ourSideKey, teamPpda } from '../../utils/analytics';
import './analytics.css';

function v(x) { return x == null ? 0 : typeof x === 'object' ? Number(x.value ?? x.total ?? 0) : Number(x) || 0; }
function clamp(n) { return Math.max(0, Math.min(100, n)); }

export default function TeamIdentityCard({ match }) {
  if (!match?.teamAggregates) return null;
  const { our } = ourSideKey(match);
  const possession = num(match.teamSummaryStats?.[our]?.possessionPct);
  const passes = match.teamAggregates.passes || {};
  const long = v(passes.long);
  const middle = v(passes.middle);
  const short = v(passes.short);
  const passVol = long + middle + short;
  const directness = passVol > 0 ? (long / passVol) * 100 : null;
  const { ours: ppda } = teamPpda(match);
  const pressIntensity = ppda != null ? clamp(((15 - ppda) / 15) * 100) : null;
  const counter = match.teamAggregates.attacks?.counterattacks || {};
  const transitionShots = v(counter.withShot);

  const rows = [
    possession != null && { label: 'Контроль мяча', val: clamp(possession), text: `${Math.round(possession)}% владения` },
    directness != null && { label: 'Прямота передач', val: clamp(directness), text: `${Math.round(directness)}% длинных` },
    pressIntensity != null && { label: 'Интенсивность прессинга', val: pressIntensity, text: `PPDA ${ppda.toFixed(1)}` },
  ].filter(Boolean);
  if (rows.length === 0) return null;

  // Короткая интерпретация стиля.
  const tags = [];
  if (possession != null && possession >= 55) tags.push('контроль мяча');
  else if (possession != null && possession < 45) tags.push('игра без мяча');
  if (directness != null && directness >= 18) tags.push('прямой стиль');
  if (pressIntensity != null && pressIntensity >= 55) tags.push('высокий прессинг');
  if (transitionShots >= 2) tags.push('опасные переходы');

  return (
    <section className="cd__panel reveal an">
      <div className="cd__panel-header">
        <h2 className="cd__panel-title">Идентичность команды</h2>
        <span className="cd__panel-sub">по последнему матчу · модель</span>
      </div>
      {rows.map((r) => (
        <div className="an-ident__row" key={r.label}>
          <span className="an-ident__lab">{r.label}</span>
          <span className="an-ident__track"><span className="an-ident__fill" style={{ width: `${r.val}%` }} /></span>
          <span className="an-ident__val">{r.text}</span>
        </div>
      ))}
      {tags.length > 0 && (
        <div className="an-chips" style={{ marginTop: 10 }}>
          {tags.map((t) => (<span className="an-chip" key={t}><span className="an-chip__val">{t}</span></span>))}
        </div>
      )}
      <div className="an-note">Профиль игрового стиля из агрегатов отчёта: владение, доля длинных передач, прессинг (PPDA), угроза в переходах.</div>
    </section>
  );
}
