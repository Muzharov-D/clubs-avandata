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
  const interp = interpretPpda(ours);
  const vol = pressingVolume(match.players || []);
  const line = lineHeight(match);
  if (ours == null && vol.pressing === 0) return null;

  return (
    <div className="card an">
      <div className="page-section-title">Прессинг и PPDA <span className="an-model-tag">отчёт</span></div>
      <div className="an-press__grid">
        <div className="an-press__cell">
          <div className="an-press__num">{f1(ours)}</div>
          <div className="an-press__lab">наш PPDA (наше давление)</div>
          {interp && (
            <>
              <div className={`an-press__level an-press__level--${interp.tone}`}>{interp.level}</div>
              <div className="an-press__note">{interp.note}</div>
            </>
          )}
        </div>
        <div className="an-press__cell">
          <div className="an-press__num">{f1(opp)}</div>
          <div className="an-press__lab">PPDA соперника (его давление на нас)</div>
          {opp != null && ours != null && (
            <div className="an-press__note">
              {ours < opp
                ? 'Мы прессинговали активнее соперника.'
                : ours > opp
                  ? 'Соперник прессинговал нас активнее.'
                  : 'Равная борьба за прессинг.'}
            </div>
          )}
        </div>
      </div>

      {(vol.pressing > 0 || line) && (
        <div className="an-chips" style={{ marginTop: 12 }}>
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
      )}

      <div className="an-note">
        PPDA и интенсивность прессинга — из агрегатов отчёта. «Линия отбора» —
        прокси по распределению возвратов мяча по третям поля.
      </div>
    </div>
  );
}
