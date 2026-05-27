// Утилиты для отображения дат человеко-понятно.
// Все функции принимают ISO-строку или Date, возвращают строку.

const MSK = { timeZone: 'Europe/Moscow' };

function toDate(input) {
  if (!input) return null;
  const d = input instanceof Date ? input : new Date(input);
  return Number.isNaN(d.getTime()) ? null : d;
}

// «14:00» — только время в МСК.
export function fmtTime(input) {
  const d = toDate(input);
  if (!d) return '—';
  return d.toLocaleTimeString('ru-RU', { ...MSK, hour: '2-digit', minute: '2-digit' });
}

// «18 мая» — короткая дата.
export function fmtDateShort(input) {
  const d = toDate(input);
  if (!d) return '—';
  return d.toLocaleDateString('ru-RU', { ...MSK, day: 'numeric', month: 'long' });
}

// «18 мая, 14:00».
export function fmtDateTime(input) {
  const d = toDate(input);
  if (!d) return '—';
  return d.toLocaleString('ru-RU', { ...MSK, day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
}

// «Сегодня в 14:00» / «Завтра в 14:00» / «Через 3 дня» / «В среду в 14:00» / «18 мая в 14:00».
// Логика: < 1 дня → «Сегодня/Завтра в HH:MM»; 1-6 дней → «В понедельник в HH:MM»;
//          7+ дней → «18 мая в 14:00»;
//          прошедшее: «Вчера в HH:MM» / «3 дня назад» / «18 мая».
const WEEKDAYS_PRELOC = ['воскресенье', 'понедельник', 'вторник', 'среду', 'четверг', 'пятницу', 'субботу'];
const WEEKDAYS_AGO    = ['воскресенье', 'понедельник', 'вторник', 'среду', 'четверг', 'пятницу', 'субботу'];

export function fmtRelative(input, now = new Date()) {
  const d = toDate(input);
  if (!d) return '—';
  const time = fmtTime(d);
  // Считаем разницу в МСК-днях (по календарной дате, не по часам).
  const dayDiff = mskDayDiff(d, now);

  if (dayDiff === 0) return `Сегодня в ${time}`;
  if (dayDiff === 1) return `Завтра в ${time}`;
  if (dayDiff === -1) return `Вчера в ${time}`;
  if (dayDiff > 1 && dayDiff <= 6) return `В ${WEEKDAYS_PRELOC[d.getDay()]} в ${time}`;
  if (dayDiff < -1 && dayDiff >= -6) return `${Math.abs(dayDiff)} дн. назад`;
  return `${fmtDateShort(d)} в ${time}`;
}

// Сколько ПОЛНЫХ календарных дней (МСК) между датой матча и now.
// Положительное — будущее, отрицательное — прошлое.
function mskDayDiff(date, now) {
  const toMskMidnight = (d) => {
    const mskStr = d.toLocaleString('en-CA', { timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit', day: '2-digit' });
    return new Date(mskStr + 'T00:00:00Z').getTime();
  };
  const dayMs = 24 * 60 * 60 * 1000;
  return Math.round((toMskMidnight(date) - toMskMidnight(now)) / dayMs);
}

// «До матча 3 дн. 14:22» — живой обратный отсчёт. Возвращает строку или null если уже начался.
// Секунды убраны: мобильный браузер часто throttle'ит setInterval(1s)
// (особенно в фоне или при низком заряде), из-за чего секунды
// «прыгали» неравномерно. Минутный шаг — плавный и достаточный
// для родителя.
export function fmtCountdown(input, now = new Date()) {
  const d = toDate(input);
  if (!d) return null;
  const ms = d.getTime() - now.getTime();
  if (ms <= 0) return null;
  const totalMin = Math.floor(ms / 60000);
  const days = Math.floor(totalMin / 1440);
  const hours = Math.floor((totalMin % 1440) / 60);
  const mins = totalMin % 60;
  const pad = (n) => String(n).padStart(2, '0');
  if (days > 0) return `${days} дн. ${pad(hours)}:${pad(mins)}`;
  return `${pad(hours)}:${pad(mins)}`;
}
