/**
 * FreeImpactCard — флагманский free-нативный блок профиля игрока.
 * Где на paid стоит «Продвинутые модельные метрики» (xG/xT), на free стоит этот
 * блок: честная эффективность и надёжность из реально собираемых free-метрик.
 * Никаких выдуманных порогов/вердиктов — только счётчики и прозрачные доли.
 */
import { freePlayerImpact, hasFreeImpact, freeSeasonImpact, freeTeamSeason } from '../../utils/freeAnalytics';
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

/**
 * FreeSeasonImpactCard — та же идея «Эффективность и надёжность», но на вкладке
 * СЕЗОН: из плоского сезонного субъекта (seasonPlayers entry). Меньше плиток —
 * у сезонного агрегата нет потерь/обыгранностей, только позитив + конверсия.
 */
export function FreeSeasonImpactCard({ subject }) {
  const im = freeSeasonImpact(subject);
  if (!im) return null;
  const showAttack = im.shots > 0 || im.goalContributions > 0 || im.keyPass > 0 || im.dribble > 0;
  const showDefence = im.defActions > 0 || im.duels > 0;
  if (!showAttack && !showDefence) return null;
  return (
    <div className="card free-impact reveal">
      <div className="page-section-title">Эффективность за сезон <span className="an-model-tag">всего по разобранным матчам</span></div>
      {showAttack && (
        <div className="free-impact__group">
          <div className="free-impact__group-label free-impact__group-label--attack">В атаке</div>
          <div className="free-impact__tiles">
            <Tile value={im.goalContributions} label="Гол + пас" />
            <Tile value={pct(im.shotConversion)} label="Конверсия ударов"
                  sub={im.shots > 0 ? `${im.goals} из ${im.shots}` : 'не бил'} />
            <Tile value={im.keyPass} label="Ключевые передачи" />
            <Tile value={im.dribble} label="Обводки" />
          </div>
        </div>
      )}
      {showDefence && (
        <div className="free-impact__group">
          <div className="free-impact__group-label free-impact__group-label--defence">В обороне</div>
          <div className="free-impact__tiles">
            <Tile value={im.defActions} label="Оборонит. действия" sub="отборы + перехваты + подборы" />
            <Tile value={im.duels} label="Единоборства" />
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * FreeTeamSeasonCard — командная эффективность/дисциплина за сезон на /analytics.
 * Хедлайн-сводка над детальным агрегатом: конверсия, прицел, дисциплина.
 */
export function FreeTeamSeasonCard({ teamAggregates, periodLabel }) {
  const t = freeTeamSeason(teamAggregates);
  if (!t) return null;
  const r1 = (v) => (Number.isInteger(v) ? v : Math.round(v * 10) / 10);
  const attack = [
    { v: r1(t.goals), label: 'Голы', show: t.goals > 0 },
    { v: pct(t.shotConversion), label: 'Конверсия ударов', sub: t.shots > 0 ? `${r1(t.goals)} из ${r1(t.shots)}` : null, show: t.shots > 0 },
    { v: pct(t.shotAccuracy), label: 'Прицел (в створ)', sub: t.shots > 0 ? `${r1(t.onTarget)} из ${r1(t.shots)}` : null, show: t.shots > 0 },
    { v: r1(t.corners), label: 'Угловые', show: t.corners > 0 },
  ].filter((x) => x.show);
  const discipline = [
    { v: r1(t.fouls), label: 'Нарушения', show: t.fouls > 0, warn: true },
    { v: r1(t.yellow), label: 'Жёлтые карточки', show: t.yellow > 0, warn: true },
    { v: r1(t.red), label: 'Красные карточки', show: t.red > 0, warn: true },
    { v: r1(t.offsides), label: 'Офсайды', show: t.offsides > 0, warn: true },
  ].filter((x) => x.show);
  if (attack.length === 0 && discipline.length === 0) return null;
  return (
    <div className="card free-impact reveal">
      <div className="page-section-title">Эффективность команды <span className="an-model-tag">в среднем за матч{periodLabel ? ` · ${periodLabel}` : ''}</span></div>
      {attack.length > 0 && (
        <div className="free-impact__group">
          <div className="free-impact__group-label free-impact__group-label--attack">Атака</div>
          <div className="free-impact__tiles">
            {attack.map((x) => <Tile key={x.label} value={x.v} label={x.label} sub={x.sub} />)}
          </div>
        </div>
      )}
      {discipline.length > 0 && (
        <div className="free-impact__group">
          <div className="free-impact__group-label free-impact__group-label--reliab">Дисциплина</div>
          <div className="free-impact__tiles">
            {discipline.map((x) => <Tile key={x.label} value={x.v} label={x.label} tone="warn" />)}
          </div>
        </div>
      )}
    </div>
  );
}
