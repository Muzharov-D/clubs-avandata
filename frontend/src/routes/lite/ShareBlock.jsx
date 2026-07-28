// «Что видит игрок» — тренер отмечает показатели и выдаёт вход в кабинет.
//
// Смысл раздела: кабинет игрока показывает НЕ всё, а то, что решил тренер.
// Список галочек и решение о видимости — здесь; сам отбор при отдаче данных
// игроку делает сервер (`GET /lite/me`), фронт ничего не прячет.
//
// По умолчанию открыты три главных показателя амплуа — те же, что подсвечены
// в пицце. Общий индекс скрыт: одна цифра «твой уровень 6.4» ребёнку ничего
// не объясняет и читается как приговор.

import { useEffect, useState } from 'react';
import { fetchPlayerShare, savePlayerShare, invitePlayer } from '../../services/api';

const ACCESS_TEXT = {
  none: 'Входа пока нет — игрок не увидит ни показателей, ни разбора.',
  invited: 'Приглашение отправлено, пароль ещё не задан.',
  expired: 'Срок приглашения истёк — выдайте ссылку заново.',
  active: 'Игрок заходит в свой кабинет.',
};

/** Копирование без буфера обмена — на случай http/старого браузера. */
async function copy(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export default function ShareBlock({ age, player }) {
  const [data, setData] = useState(null);
  const [picked, setPicked] = useState([]);
  const [overall, setOverall] = useState(false);
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(0);
  const [invite, setInvite] = useState(null);
  const [inviting, setInviting] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let alive = true;
    setData(null); setErr(''); setInvite(null); setCopied(false); setSavedAt(0);
    if (!age || !player?.id) return undefined;
    fetchPlayerShare(age, player.id)
      .then((d) => {
        if (!alive) return;
        setData(d);
        setPicked(d?.metrics ?? []);
        setOverall(Boolean(d?.showOverall));
      })
      .catch((e) => alive && setErr(String(e?.message ?? e)));
    return () => { alive = false; };
  }, [age, player?.id]);

  // Сохраняем сразу по клику: отдельная кнопка «Сохранить» на галочках —
  // лишний шаг, а тренер и так уходит с экрана после разбора.
  const persist = async (metrics, showOverall) => {
    setSaving(true); setErr('');
    try {
      await savePlayerShare(age, player.id, metrics, showOverall);
      setSavedAt(Date.now());
    } catch (e) {
      setErr(`Не сохранилось: ${String(e?.message ?? e)}`);
    } finally { setSaving(false); }
  };

  const toggle = (key) => {
    const next = picked.includes(key) ? picked.filter((k) => k !== key) : [...picked, key];
    setPicked(next);
    persist(next, overall);
  };

  const toggleOverall = () => {
    const next = !overall;
    setOverall(next);
    persist(picked, next);
  };

  const doInvite = async () => {
    setInviting(true); setErr(''); setCopied(false);
    try {
      const r = await invitePlayer(age, player.id);
      setInvite(r);
      setCopied(await copy(r.setupUrl));
      // Статус доступа поменялся — перечитываем, чтобы подпись не врала.
      fetchPlayerShare(age, player.id).then((d) => setData((p) => ({ ...(p ?? {}), access: d?.access })));
    } catch (e) {
      setErr(`Не удалось выдать доступ: ${String(e?.message ?? e)}`);
    } finally { setInviting(false); }
  };

  if (!age || !player?.id) return null;

  const access = data?.access;
  const axes = data?.axes ?? [];

  return (
    <section className="lite-share">
      <h3 className="lite-share__t">Что видит игрок</h3>
      <p className="lite-share__hint">
        Отметьте показатели, которые игрок увидит у себя. Остальные останутся только
        у вас — сервер их даже не отдаёт. Изменения сохраняются сразу.
      </p>

      {!data && !err && <p className="lite-note">Загружаем настройку…</p>}

      {axes.length > 0 && (
        <div className="lite-share__grid">
          {axes.map((a) => (
            <label key={a.key} className={`lite-chk${picked.includes(a.key) ? ' lite-chk--on' : ''}`}>
              <input
                type="checkbox"
                checked={picked.includes(a.key)}
                onChange={() => toggle(a.key)}
              />
              <span className="lite-chk__label">{a.label}</span>
              {a.focus && <span className="lite-chk__tag">главный</span>}
            </label>
          ))}
          <label className={`lite-chk lite-chk--wide${overall ? ' lite-chk--on' : ''}`}>
            <input type="checkbox" checked={overall} onChange={toggleOverall} />
            <span className="lite-chk__label">Общий индекс за сезон</span>
            <span className="lite-chk__note">по умолчанию скрыт</span>
          </label>
        </div>
      )}

      {data && axes.length === 0 && (
        <p className="lite-note">
          У игрока не определено амплуа — показывать по позиции нечего. Разбор
          текстом ниже он всё равно получит.
        </p>
      )}

      {picked.length === 0 && axes.length > 0 && (
        <p className="lite-note">Сейчас не открыто ни одного показателя — игрок увидит только ваш разбор.</p>
      )}

      <div className="lite-share__access">
        <div className="lite-share__status">
          <b>Вход в кабинет.</b>{' '}
          {access ? ACCESS_TEXT[access.status] : '—'}
          {access?.username && <> Логин: <code>{access.username}</code>.</>}
        </div>
        <button type="button" className="lite-btn lite-btn--ghost" onClick={doInvite} disabled={inviting}>
          {inviting ? 'Готовим…' : access?.status === 'active' ? 'Сбросить пароль' : 'Пригласить игрока'}
        </button>
      </div>

      {invite && (
        <div className="lite-share__invite">
          <p className="lite-share__invite-t">
            {copied ? 'Ссылка скопирована — отправьте её игроку.' : 'Скопируйте ссылку и отправьте её игроку.'}
            {' '}Действует 7 дней, открывается один раз.
          </p>
          <input className="lite-share__link" readOnly value={invite.setupUrl} onFocus={(e) => e.target.select()} />
          <p className="lite-note">
            Логин игрока: <b>{invite.username}</b>. Пароль он придумает сам по ссылке —
            вы его не увидите.
            {invite.renewed && ' Прежний пароль больше не работает.'}
          </p>
        </div>
      )}

      <div className="lite-share__foot">
        {saving && <span className="lite-note">Сохраняем…</span>}
        {!saving && savedAt > 0 && <span className="lite-fb__ok">Сохранено</span>}
        {err && <span className="lite-fb__err">{err}</span>}
      </div>
    </section>
  );
}
