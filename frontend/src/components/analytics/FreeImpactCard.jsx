/**
 * FreeImpactCard — флагманский free-нативный блок профиля игрока.
 * Где на paid стоит «Продвинутые модельные метрики» (xG/xT), на free стоит этот
 * блок: честная эффективность и надёжность из реально собираемых free-метрик.
 * Никаких выдуманных порогов/вердиктов — только счётчики и прозрачные доли.
 */
import { freePlayerImpact, hasFreeImpact } from '../../utils/freeAnalytics';
import './FreeImpactCard.css';

function pct(ratio) {
  return ratio == null ? '—' : `${Math.round(ratio * 100)}%`;
}

export default function FreeImpactCard({ stats }) {
  const impact = freePlayerImpact(stats);
  if (!hasFreeImpact(impact)) return null;

  // Атакующие плитки показываем только если игрок бил/созидал — иначе у защитника
  // блок не засоряется нулями.
  const showAttack = impact.shots > 0 || impact.goalContributions > 0 || impact.chances > 0;
  const showDefence = impact.defActions > 0 || impact.beaten > 0;
  const showReliability = impact.losses > 0 || impact.dangerLosses > 0 || impact.beaten > 0;

  return (
    <div className="card free-impact reveal">
      <div className="page-section-title">Эффективность и надёжность</div>

      {showAttack && (
        <div className="free-impact__group">
          <div className="free-impact__group-label free-impact__group-label--attack">В атаке</div>
          <div className="free-impact__tiles">
            <Tile value={impact.goalContributions} label="Гол + пас" />
            <Tile value={pct(impact.shotConversion)} label="Конверсия ударов"
                  sub={impact.shots > 0 ? `${impact.goals} из ${impact.shots}` : 'не бил'} />
            <Tile value={impact.chances} label="Острые передачи" sub="ключевые + под удар" />
          </div>
        </div>
      )}

      {showDefence && (
        <div className="free-impact__group">
          <div className="free-impact__group-label free-impact__group-label--defence">В обороне</div>
          <div className="free-impact__tiles">
            <Tile value={impact.defActions} label="Оборонит. действия" sub="отборы + перехваты + подборы + выносы + блоки" />
            <Tile value={pct(impact.defReliability)} label="Надёжность 1в1"
                  sub={(impact.defActions + impact.beaten) > 0 ? `обыгран ${impact.beaten} раз` : '—'} />
          </div>
        </div>
      )}

      {showReliability && (
        <div className="free-impact__group">
          <div className="free-impact__group-label free-impact__group-label--reliab">Сохранность мяча</div>
          <div className="free-impact__tiles">
            <Tile value={impact.losses} label="Потери мяча" sub="брак + потери" tone="warn" />
            <Tile value={impact.dangerLosses} label="Опасные потери" sub="у своих ворот" tone="warn" />
          </div>
        </div>
      )}
    </div>
  );
}

function Tile({ value, label, sub, tone }) {
  return (
    <div className={`free-impact__tile${tone === 'warn' ? ' free-impact__tile--warn' : ''}`}>
      <div className="free-impact__tile-value">{value}</div>
      <div className="free-impact__tile-label">{label}</div>
      {sub && <div className="free-impact__tile-sub">{sub}</div>}
    </div>
  );
}
