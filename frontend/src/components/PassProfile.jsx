import './PassProfile.css';

/**
 * Профиль передач (в духе pass-sonar Opta): две раскладки — по направлению
 * (вперёд / поперёк / назад) и по длине (короткие / средние / длинные).
 * Сразу читается стиль игрока: progressive vs «безопасный поперёк/назад».
 *
 * Props: { forward, sideways, back, short, middle, long, total }
 */
function n(v) {
  if (v == null) return 0;
  if (typeof v === 'object') return Number(v.successful ?? v.value ?? v.total ?? 0) || 0;
  return Number(v) || 0;
}

function Stack({ segs }) {
  const total = segs.reduce((s, x) => s + x.v, 0);
  if (total <= 0) return null;
  return (
    <span className="pp__bar" role="img" aria-label={segs.map((s) => `${s.label} ${s.v}`).join(', ')}>
      {segs.map((s, i) => {
        const w = (s.v / total) * 100;
        return (
          <span key={i} className={`pp__seg pp__seg--${s.tone}`} style={{ width: `${w}%` }}>
            {w > 13 ? s.v : ''}
          </span>
        );
      })}
    </span>
  );
}

export default function PassProfile({ forward, sideways, back, short, middle, long, total }) {
  const f = n(forward), s = n(sideways), b = n(back);
  const sh = n(short), mi = n(middle), lo = n(long);
  const t = n(total) || f + s + b;
  if (f + s + b <= 0 && sh + mi + lo <= 0) return null;
  const fwdPct = f + s + b > 0 ? Math.round((f / (f + s + b)) * 100) : 0;

  return (
    <div className="pp">
      <div className="pp__head">
        <div><span className="pp__big">{t}</span><span className="pp__unit">точных передач</span></div>
        <div><span className="pp__big">{fwdPct}%</span><span className="pp__unit">вперёд</span></div>
      </div>
      {(f + s + b > 0) && (
        <div className="pp__row">
          <span className="pp__label">Направление</span>
          <Stack segs={[
            { label: 'Вперёд', v: f, tone: 'fwd' },
            { label: 'Поперёк', v: s, tone: 'side' },
            { label: 'Назад', v: b, tone: 'back' },
          ]} />
        </div>
      )}
      {(sh + mi + lo > 0) && (
        <div className="pp__row">
          <span className="pp__label">Длина</span>
          <Stack segs={[
            { label: 'Короткие', v: sh, tone: 'short' },
            { label: 'Средние', v: mi, tone: 'mid' },
            { label: 'Длинные', v: lo, tone: 'long' },
          ]} />
        </div>
      )}
      {(f + s + b > 0) && (
        <div className="pp__legend">
          <span className="pp__leg-cap">Направление:</span>
          <span><i className="pp__sw pp__sw--fwd" />вперёд</span>
          <span><i className="pp__sw pp__sw--side" />поперёк</span>
          <span><i className="pp__sw pp__sw--back" />назад</span>
        </div>
      )}
      {(sh + mi + lo > 0) && (
        <div className="pp__legend">
          <span className="pp__leg-cap">Длина:</span>
          <span><i className="pp__sw pp__sw--short" />короткие</span>
          <span><i className="pp__sw pp__sw--mid" />средние</span>
          <span><i className="pp__sw pp__sw--long" />длинные</span>
        </div>
      )}
    </div>
  );
}
