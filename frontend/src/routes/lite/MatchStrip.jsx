// «По матчам» — динамика игрока и сравнение двух матчей.
//
// ПОЧЕМУ НЕ ПИЦЦА ЗА МАТЧ. Профиль сверху остаётся сезонным: на одном матче
// выборка — шум, и форма пиццы прыгала бы от тура к туру. Динамику показываем
// отдельно и честно — рядом чисел, где каждый матч сравнивается с тем, как
// игрок обычно играет.
//
// Стрелка у числа — не «хорошо/плохо», а «выше или ниже своего обычного».
// Все оси кабинета устроены так, что больше значит лучше.

import { useEffect, useState } from 'react';
import { fetchPlayerMatches } from '../../services/api';

const RESULT_LABEL = { W: 'В', D: 'Н', L: 'П' };

const fmtDay = (s) => {
  const d = new Date(s);
  return Number.isNaN(+d) ? '—' : d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
};

/** Отклонение от сезонного среднего игрока: показываем только заметное. */
function delta(value, average) {
  const d = Number(value) - Number(average);
  if (!Number.isFinite(d) || Math.abs(d) < 0.35) return null;
  return d > 0 ? 'up' : 'down';
}

const num = (v) => (Number.isFinite(Number(v)) ? Number(v).toFixed(1) : '—');

export default function MatchStrip({ age, player }) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [picked, setPicked] = useState([]);

  useEffect(() => {
    let alive = true;
    setData(null); setErr(''); setPicked([]);
    if (!age || !player?.id) return undefined;
    fetchPlayerMatches(age, player.id)
      .then((d) => alive && setData(d))
      .catch((e) => alive && setErr(String(e?.message ?? e)));
    return () => { alive = false; };
  }, [age, player?.id]);

  // Выбираем не больше двух: сравнение «матч с матчем», а не таблица на весь сезон.
  const toggle = (id) => {
    setPicked((prev) => (prev.includes(id)
      ? prev.filter((x) => x !== id)
      : [...prev, id].slice(-2)));
  };

  if (err) return <p className="lite-note">Динамика по матчам недоступна: {err}</p>;
  if (!data) return <p className="lite-note">Загружаем матчи…</p>;

  const { matches = [], axes = [] } = data;
  if (!matches.length) {
    return (
      <section className="lm">
        <h3 className="lm__t">По матчам</h3>
        <p className="lite-note">Разобранных матчей пока нет — динамика появится после первого.</p>
      </section>
    );
  }

  const focus = axes.filter((a) => a.focus);
  const pair = picked.map((id) => matches.find((m) => m.matchId === id)).filter(Boolean);

  return (
    <section className="lm">
      <div className="lm__head">
        <h3 className="lm__t">По матчам</h3>
        <p className="lm__hint">
          {pair.length === 2
            ? 'Ниже — разница между выбранными матчами. Нажмите ещё раз, чтобы снять.'
            : 'Стрелка — выше или ниже обычного для игрока. Выберите два матча, чтобы сравнить.'}
        </p>
      </div>

      <div className="lm__row">
        {matches.map((m) => (
          <button
            type="button"
            key={m.matchId}
            className={`lm-card${picked.includes(m.matchId) ? ' lm-card--on' : ''}`}
            onClick={() => toggle(m.matchId)}
            aria-pressed={picked.includes(m.matchId)}
          >
            <div className="lm-card__top">
              <span className="lm-card__date">{fmtDay(m.date)}</span>
              {m.result && (
                <span className={`lm-card__res lm-card__res--${m.result}`}>
                  {RESULT_LABEL[m.result]}
                </span>
              )}
            </div>
            <div className="lm-card__opp" title={m.opponent}>{m.opponent}</div>
            <div className="lm-card__score">{m.score ?? '—'} · {m.minutes} мин</div>

            <div className="lm-card__vals">
              {focus.map((a) => {
                const v = m.values?.[a.key] ?? 0;
                const d = delta(v, a.average);
                return (
                  <div key={a.key} className="lm-val">
                    <span className="lm-val__ax">{a.label}</span>
                    <span className="lm-val__n">
                      {num(v)}
                      {d && <i className={`lm-val__d lm-val__d--${d}`}>{d === 'up' ? '↑' : '↓'}</i>}
                    </span>
                  </div>
                );
              })}
            </div>
          </button>
        ))}
      </div>

      {pair.length === 2 && (
        <div className="lm-diff">
          <div className="lm-diff__head">
            <span>{fmtDay(pair[0].date)} · {pair[0].opponent}</span>
            <span>{fmtDay(pair[1].date)} · {pair[1].opponent}</span>
          </div>
          {axes.map((a) => {
            const a0 = Number(pair[0].values?.[a.key] ?? 0);
            const a1 = Number(pair[1].values?.[a.key] ?? 0);
            const diff = Number((a1 - a0).toFixed(1));
            return (
              <div key={a.key} className={`lm-diff__row${a.focus ? ' lm-diff__row--focus' : ''}`}>
                <span className="lm-diff__ax">{a.label}</span>
                <span className="lm-diff__v">{num(a0)}</span>
                <span className={`lm-diff__delta${diff > 0 ? ' up' : diff < 0 ? ' down' : ''}`}>
                  {diff > 0 ? `+${diff}` : diff < 0 ? diff : '='}
                </span>
                <span className="lm-diff__v">{num(a1)}</span>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
