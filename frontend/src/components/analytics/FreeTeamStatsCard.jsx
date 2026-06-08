/**
 * FreeTeamStatsCard — free-нативная командная сводка матча.
 * Где на paid стоит «Командная статистика» (мы против соперника, с xG/владением),
 * на free стоит этот блок: только НАШИ честные free-метрики, без сравнения с
 * соперником (его на free сознательно нет). Дисциплина (фолы/карточки/офсайды)
 * собирается на уровне команды — это реальные данные, не нули.
 */
import { num } from '../../utils/num';
import './FreeImpactCard.css';

export default function FreeTeamStatsCard({ our, goals, conceded }) {
  if (!our) return null;
  const v = (x) => {
    const n = Number(num(x));
    return Number.isFinite(n) ? n : null;
  };

  const attack = [
    { label: 'Голы', value: v(goals), always: true },
    { label: 'Удары', value: v(our.shots?.total) },
    { label: 'Удары в створ', value: v(our.shots?.onTarget) },
    { label: 'Угловые', value: v(our.corners?.total) },
    { label: 'Удары со штрафных', value: v(our.freeKickShots) },
  ].filter((t) => t.always || (t.value != null && t.value > 0));

  const discipline = [
    { label: 'Пропущено', value: v(conceded), always: true, warn: true },
    { label: 'Нарушения', value: v(our.fouls), warn: true },
    { label: 'Жёлтые карточки', value: v(our.yellowCards), warn: true },
    { label: 'Красные карточки', value: v(our.redCards), warn: true },
    { label: 'Офсайды', value: v(our.offsides), warn: true },
  ].filter((t) => t.always || (t.value != null && t.value > 0));

  if (attack.length === 0 && discipline.length === 0) return null;

  return (
    <div className="card free-impact reveal" id="md-free-teamstats">
      <div className="page-section-title">Наша игра в цифрах</div>

      {attack.length > 0 && (
        <div className="free-impact__group">
          <div className="free-impact__group-label free-impact__group-label--attack">Атака</div>
          <div className="free-impact__tiles">
            {attack.map((t) => (
              <div className="free-impact__tile" key={t.label}>
                <div className="free-impact__tile-value">{t.value ?? '—'}</div>
                <div className="free-impact__tile-label">{t.label}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {discipline.length > 0 && (
        <div className="free-impact__group">
          <div className="free-impact__group-label free-impact__group-label--reliab">Дисциплина</div>
          <div className="free-impact__tiles">
            {discipline.map((t) => (
              <div className={`free-impact__tile${t.warn ? ' free-impact__tile--warn' : ''}`} key={t.label}>
                <div className="free-impact__tile-value">{t.value ?? '—'}</div>
                <div className="free-impact__tile-label">{t.label}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
