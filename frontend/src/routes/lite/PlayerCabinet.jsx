// Кабинет игрока — то, что тренер решил показать, и его разбор.
//
// Здесь сознательно НЕТ ни командных топов, ни чужих карточек, ни глубокой
// аналитики: игрок видит себя и разговор со своим тренером. Набор показателей
// приходит уже отфильтрованным с сервера (`GET /lite/me`) — прятать что-то на
// клиенте было бы фикцией.
//
// Пиццу здесь не рисуем: открытых осей может быть одна-две, и радар из двух
// лучей — не форма, а обман зрения. Полосы честнее.

import { useEffect, useState } from 'react';
import { fetchMyLite, answerMyFeedback } from '../../services/api';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { LINE_PLURAL } from './liteMetrics';
import './playerCabinet.css';

const initials = (name) => (name || '?').split(' ').filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase();

const fmtDate = (s) => {
  const d = new Date(s);
  return Number.isNaN(+d) ? '' : d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
};

/** Один показатель: сколько это в среднем за матч + место среди своих. */
function MetricRow({ m, lineLabel, peersCount }) {
  const pct = Math.max(0, Math.min(100, Number(m.percentile) || 0));
  return (
    <div className={`pc-metric${m.focus ? ' pc-metric--focus' : ''}`}>
      <div className="pc-metric__head">
        <span className="pc-metric__name">
          {m.label}
          {m.hint && <span className="pc-metric__hint">{m.hint}</span>}
        </span>
        <span className="pc-metric__val">
          {m.value == null ? '—' : Number(m.value).toFixed(1)}
          <span className="pc-metric__unit">за матч</span>
        </span>
      </div>
      <div className="pc-metric__bar" role="presentation">
        <span className="pc-metric__fill" style={{ width: `${pct}%` }} />
      </div>
      {m.value != null && peersCount > 1 && (
        <div className="pc-metric__note">
          В среднем у {lineLabel} команды — {Number(m.average ?? 0).toFixed(1)}
        </div>
      )}
    </div>
  );
}

/** Разбор тренера и ответ игрока — единица цикла: прочитал, подумал, ответил. */
function FeedbackItem({ item, onAnswered }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const send = async () => {
    const t = text.trim();
    if (!t || busy) return;
    setBusy(true); setErr('');
    try {
      const r = await answerMyFeedback(item.id, t);
      onAnswered(item.id, r?.playerText ?? t, r?.playerRespondedAt ?? new Date().toISOString());
      setText('');
    } catch (e) {
      setErr(`Не отправилось: ${String(e?.message ?? e)}`);
    } finally { setBusy(false); }
  };

  return (
    <li className="pc-fb__item">
      <div className="pc-fb__meta">Разбор тренера · {fmtDate(item.createdAt)}</div>
      <p className="pc-fb__coach">{item.coachText}</p>

      {item.playerText ? (
        <p className="pc-fb__mine"><b>Твой ответ:</b> {item.playerText}</p>
      ) : (
        <div className="pc-fb__reply">
          <label className="pc-fb__label" htmlFor={`ans-${item.id}`}>
            Напиши, как это видишь ты
          </label>
          <textarea
            id={`ans-${item.id}`}
            className="pc-fb__area"
            rows={3}
            maxLength={4000}
            placeholder="Что получалось, что было тяжело, что попробуешь в следующий раз"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <div className="pc-fb__row">
            <button type="button" className="pc-btn" onClick={send} disabled={busy || !text.trim()}>
              {busy ? 'Отправляем…' : 'Ответить тренеру'}
            </button>
            {err && <span className="pc-err">{err}</span>}
          </div>
        </div>
      )}
    </li>
  );
}

export default function PlayerCabinet() {
  useDocumentTitle('Мой разбор');
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    let alive = true;
    fetchMyLite()
      .then((d) => alive && setData(d))
      .catch((e) => alive && setErr(String(e?.message ?? e)));
    return () => { alive = false; };
  }, []);

  const onAnswered = (id, playerText, respondedAt) => {
    setData((prev) => (prev ? {
      ...prev,
      feedback: prev.feedback.map((f) => (f.id === id
        ? { ...f, playerText, playerRespondedAt: respondedAt } : f)),
    } : prev));
  };

  if (err) return <div className="pc"><p className="pc-err">Не удалось загрузить: {err}</p></div>;
  if (!data) return <div className="pc"><p className="pc-note">Загружаем…</p></div>;

  const { player, metrics = [], feedback = [], line, peersCount, overall } = data;
  const unanswered = feedback.filter((f) => !f.playerText).length;

  return (
    <div className="pc">
      <header className="pc-head">
        <span className="pc-ava">
          {player.photoUrl
            ? <img src={player.photoUrl} alt="" />
            : <span className="pc-ava__ini">{initials(player.fullName)}</span>}
        </span>
        <div className="pc-head__main">
          <h1 className="pc-name">{player.fullName}</h1>
          <p className="pc-meta">
            {player.positionDetail || 'Амплуа не задано'} · матчей {player.matches} ·
            {' '}в среднем {player.minutesPerMatch} мин на поле
          </p>
        </div>
        {overall != null && (
          <div className="pc-overall">
            <b>{Number(overall).toFixed(1)}</b>
            <span>общий</span>
          </div>
        )}
      </header>

      {unanswered > 0 && (
        <p className="pc-badge">
          {unanswered === 1 ? 'Тренер написал тебе разбор — прочитай и ответь.'
            : `Тренер написал тебе ${unanswered} разбора — прочитай и ответь.`}
        </p>
      )}

      <section className="pc-block">
        <h2 className="pc-block__t">Мои показатели</h2>
        {metrics.length > 0 ? (
          <>
            <div className="pc-metrics">
              {metrics.map((m) => (
                <MetricRow
                  key={m.key}
                  m={m}
                  /* Родительный падеж множественного: «у 90% нападающих», а не
                     «у 90% нападающий» — подпись амплуа тут не годится. */
                  lineLabel={LINE_PLURAL[line] ?? 'игроков команды'}
                  peersCount={peersCount}
                />
              ))}
            </div>
            <p className="pc-note">
              Цифра — сколько это в среднем за матч, рядом — среднее у ребят твоего
              амплуа в команде. Полоса показывает место среди них. Какие показатели
              открыты, выбирает тренер.
            </p>
          </>
        ) : (
          <p className="pc-note">
            Тренер пока не открыл показатели. Как только откроет — они появятся здесь.
          </p>
        )}
      </section>

      <section className="pc-block">
        <h2 className="pc-block__t">Разбор от тренера</h2>
        {feedback.length > 0 ? (
          <ul className="pc-fb">
            {feedback.map((f) => <FeedbackItem key={f.id} item={f} onAnswered={onAnswered} />)}
          </ul>
        ) : (
          <p className="pc-note">Разборов пока нет. Здесь появится то, что напишет тренер.</p>
        )}
      </section>
    </div>
  );
}
