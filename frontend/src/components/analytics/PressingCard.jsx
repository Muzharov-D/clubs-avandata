/**
 * Прессинг и PPDA — ключевая метрика топ-аналитики, которая считалась на бэке,
 * но нигде не показывалась (критика 4, улучшение 36, вау 72/88).
 * PPDA = пасы соперника на одно оборонительное действие; ниже = агрессивнее.
 */
import { teamPpda, interpretPpda, pressingVolume, lineHeight } from '../../utils/analytics';
import './analytics.css';

function f1(v) { return v == null ? '—' : Number(v).toFixed(1); }

export default function PressingCard({ match }) {
  if (!match) return null;
  const { ours, opp } = teamPpda(match);
  const interp = interpretPpda(ours, opp);
  const vol = pressingVolume(match.players || []);
  const line = lineHeight(match);
  if (ours == null && vol.pressing === 0) return null;

  // Интенсивность прессинга обратна PPDA (чем ниже PPDA — тем агрессивнее).
  // Доля «кто давил активнее» считается из обратных величин, не из сырого PPDA
  // (его «меньше = лучше» нелогично для тренера на глаз).
  const ourInt = ours > 0 ? 1 / ours : 0;
  const oppInt = opp > 0 ? 1 / opp : 0;
  const intSum = ourInt + oppInt;
  const ourShare = intSum > 0 ? Math.round((ourInt / intSum) * 100) : null;

  return (
    <div className="card an">
      <div className="page-section-title">Прессинг <span className="an-model-tag">отчёт</span></div>

      {/* Вердикт словами — впереди жаргона (PPDA уходит в детали ниже). */}
      {interp && (
        <div className="an-press__verdict">
          <div className={`an-press__level an-press__level--${interp.tone}`}>{interp.level}</div>
          {interp.note && <div className="an-press__note">{interp.note}</div>}
        </div>
      )}

      {/* Кто давил активнее — сравнительная полоса по интенсивности (1/PPDA). */}
      {ourShare != null && (
        <div className="an-press__compare">
          <div className="an-mom__bar" role="img" aria-label={`Прессинг: мы ${ourShare}%, соперник ${100 - ourShare}%`}>
            <div className="an-mom__half an-mom__half--1" style={{ width: `${ourShare}%` }}>{ourShare >= 16 ? `Мы ${ourShare}%` : ''}</div>
            <div className="an-mom__half an-mom__half--2" style={{ width: `${100 - ourShare}%` }}>{100 - ourShare >= 16 ? `Соперник ${100 - ourShare}%` : ''}</div>
          </div>
          <div className="an-press__note" style={{ marginTop: 6 }}>
            {ourShare > 53 ? 'Мы прессинговали активнее соперника.' : ourShare < 47 ? 'Соперник прессинговал активнее.' : 'Прессинг шёл на равных.'}
          </div>
        </div>
      )}

      {/* PPDA и объём — деталь, мелким. */}
      <div className="an-chips" style={{ marginTop: 12 }}>
        {ours != null && (
          <span className="an-chip"><span className="an-chip__label">наш PPDA</span><span className="an-chip__val">{f1(ours)}</span></span>
        )}
        {opp != null && (
          <span className="an-chip"><span className="an-chip__label">PPDA соперника</span><span className="an-chip__val">{f1(opp)}</span></span>
        )}
        {vol.pressing > 0 && (
          <span className="an-chip"><span className="an-chip__label">прессинг-действий</span><span className="an-chip__val">{vol.pressing}</span></span>
        )}
        {vol.counterpressing > 0 && (
          <span className="an-chip"><span className="an-chip__label">контрпрессинг</span><span className="an-chip__val">{vol.counterpressing}</span></span>
        )}
        {line && (
          <span className="an-chip"><span className="an-chip__label">линия отбора</span><span className="an-chip__val">{line.label} · {Math.round(line.highShare * 100)}% высоко</span></span>
        )}
      </div>

      <div className="an-note">
        PPDA — пасы соперника на одно наше оборонительное действие: чем ниже, тем
        агрессивнее прессинг. «Линия отбора» — где команда возвращает мяч (прокси
        по третям поля).
      </div>
    </div>
  );
}
