// Блок «Тебя вызвали на матч» для игрока на ClubPage.
// Показывает только callup'ы со status != 'pending' (т.е. реально отправленные тренером).
// Кнопки: «Иду» (confirmed) / «Не смогу» — раскрывает выбор причины (excused/declined).

import { useEffect, useState } from 'react';
import { isLegirus } from '../utils/legirus';
import { fetchMyCallups, respondCallup } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
import './MyCallups.css';

function fmt(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('ru-RU', {
    day: '2-digit', month: 'short',
    hour: '2-digit', minute: '2-digit',
  });
}
function shortName(name) {
  if (!name) return '—';
  return String(name).replace(/\s*\((ЦФКСиЗ ВО|ГБУ ДО)[^)]*\)\s*/i, '').trim();
}

const STATUS_TEXT = {
  called: 'Жду ответа',
  confirmed: 'Иду ✓',
  declined: 'Не смогу',
  excused: 'Уваж. причина',
};

export default function MyCallups() {
  const { isPlayer, user } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);
  const [expanded, setExpanded] = useState(null); // ageGroup-extMatchId — раскрыт ли «Не смогу»
  const [err, setErr] = useState(null);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const r = await fetchMyCallups();
      // Скрываем pending — это «черновик» состава у тренера, ещё не отправлен призыв
      const real = (r.callups || []).filter((c) => c.status !== 'pending');
      setItems(real);
    } catch (e) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { if (isPlayer) load(); }, [isPlayer, user?.playerId]);

  if (!isPlayer) return null;
  if (loading) return null;
  if (items.length === 0) return null;

  async function respond(callup, status) {
    const key = callup.ageGroup + '-' + callup.extMatchId;
    setBusy(key);
    try {
      await respondCallup(callup.ageGroup, callup.extMatchId, status, null);
      setExpanded(null);
      await load();
    } catch (e) {
      alert(e.message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="my-callups">
      <div className="my-callups__head">
        <h3>🏁 Тебя вызвали на матч</h3>
        <span>{items.length}</span>
      </div>
      <div className="my-callups__list">
        {items.map((c) => {
          const m = c.match || {};
          const ourHome = isLegirus(m.home);
          const opp = ourHome ? m.away : m.home;
          const oppShield = ourHome ? m.awayShield : m.homeShield;
          const key = c.ageGroup + '-' + c.extMatchId;
          const myStatus = c.status;
          const isExpanded = expanded === key;
          const showAnswer = myStatus !== 'called';

          return (
            <article key={c.id} className={`my-callup my-callup--${myStatus}`}>
              <div className="my-callup__row">
                <div className="my-callup__opp">
                  {oppShield && <img src={oppShield} alt="" className="my-callup__shield" />}
                  <div>
                    <div className="my-callup__opp-name">
                      {ourHome ? '🏠 ' : '✈️ '}{shortName(opp)}
                    </div>
                    <div className="my-callup__date">{fmt(m.date)}</div>
                    {m.venue && <div className="my-callup__venue">📍 {m.venue}</div>}
                  </div>
                </div>
                {m.tournament === 'cup' && <span className="my-callup__badge">Кубок</span>}
              </div>

              {!isExpanded && (
                <div className="my-callup__buttons">
                  <button
                    className={`my-callup__btn my-callup__btn--go ${myStatus === 'confirmed' ? 'is-on' : ''}`}
                    disabled={busy === key}
                    onClick={() => respond(c, 'confirmed')}
                  >
                    <span className="my-callup__btn-icon">✓</span>
                    <span>Иду</span>
                  </button>
                  <button
                    className={`my-callup__btn my-callup__btn--no ${(myStatus === 'declined' || myStatus === 'excused') ? 'is-on' : ''}`}
                    disabled={busy === key}
                    onClick={() => setExpanded(key)}
                  >
                    <span className="my-callup__btn-icon">✗</span>
                    <span>Не смогу</span>
                  </button>
                </div>
              )}

              {isExpanded && (
                <div className="my-callup__expand">
                  <div className="my-callup__expand-title">Почему не сможешь?</div>
                  <button
                    className="my-callup__expand-btn my-callup__expand-btn--excused"
                    disabled={busy === key}
                    onClick={() => respond(c, 'excused')}
                  >
                    <b>Уважительная причина</b>
                    <span>школа, болезнь, семейные дела</span>
                  </button>
                  <button
                    className="my-callup__expand-btn my-callup__expand-btn--declined"
                    disabled={busy === key}
                    onClick={() => respond(c, 'declined')}
                  >
                    <b>Просто не получится</b>
                    <span>тренер увидит — может попросить чем заменить</span>
                  </button>
                  <button
                    className="my-callup__expand-cancel"
                    onClick={() => setExpanded(null)}
                  >Отмена</button>
                </div>
              )}

              {showAnswer && !isExpanded && (
                <div className="my-callup__hint">
                  Ваш ответ: <b>{STATUS_TEXT[myStatus] || myStatus}</b>. Можно изменить.
                </div>
              )}
            </article>
          );
        })}
      </div>
      {err && <div className="my-callups__err">{err}</div>}
    </section>
  );
}
