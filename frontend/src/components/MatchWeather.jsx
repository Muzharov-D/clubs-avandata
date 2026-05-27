// Прогноз погоды на момент матча (OpenWeatherMap).
// Рендерится в модалке матча (таб «Обзор»), если у venue есть координаты.
// Поведение:
//   - матч > 5 дней   → placeholder "появится через N дней"
//   - матч ≤ 5 дней   → реальный прогноз от бэка
//   - нет ключа / API → placeholder "временно недоступен"
//   - нет координат   → ничего не рендерим (родитель проверяет hasCoords)

import { useEffect, useState } from 'react';
import './MatchWeather.css';

const API_BASE = (() => {
  const base = import.meta.env.VITE_API_BASE_URL || '';
  return String(base).replace(/\/+$/, '');
})();

// Русская плюрализация: plural(1, ['день','дня','дней']) → 'день'
function plural(n, forms) {
  const abs = Math.abs(n) % 100;
  const n1 = abs % 10;
  if (abs > 10 && abs < 20) return forms[2];
  if (n1 > 1 && n1 < 5) return forms[1];
  if (n1 === 1) return forms[0];
  return forms[2];
}

// Набор «ободряющих» сообщений по погодным условиям.
// Где указан author — это документированная цитата. Без author — общая мысль /
// народная мудрость. Никаких политиков, военных, спорных персон —
// только спортсмены, учёные, врачи, тренеры.
const ADVICE_POOL = {
  cold: [
    { text: 'Холодное поле — горячая игра. Команда быстро согреется в движении.' },
    { text: 'Самые тёплые победы рождаются на самых холодных полях.' },
    { text: 'Мороз — не препятствие, мороз — соавтор истории матча.' },
  ],
  cool: [
    { text: 'Идеальная футбольная погода — бегается без устали.' },
    { text: 'Прохлада: болельщикам плед, игрокам самое то.' },
    { text: 'Жизнь — как езда на велосипеде: чтобы держать равновесие, нужно двигаться.', author: 'Альберт Эйнштейн', role: 'физик' },
  ],
  hot: [
    { text: 'В такую жару каждый глоток воды на скамейке — тоже часть игры.' },
    { text: 'Жара испытывает выносливость. Кто терпит — тот побеждает.' },
    { text: 'В здоровом теле — здоровый дух.', author: 'Ювенал', role: 'римский поэт' },
  ],
  rain: [
    { text: 'Дождь не отменяет матч — он добавляет ему характера.' },
    { text: 'На мокром поле выигрывают те, кто крепче стоит на ногах.' },
    { text: 'Лучшие истории начинаются с фразы «а помнишь, как лило?».' },
  ],
  snow: [
    { text: 'Снег превращает обычный матч в незабываемый.' },
    { text: 'Под снегопадом счёт не главное — главное впечатления.' },
    { text: 'Зимний футбол — отдельный жанр, и он прекрасен.' },
  ],
  windy: [
    { text: 'Ветер выравнивает шансы — побеждает тот, кто лучше читает игру.' },
    { text: 'Сильный ветер — лучшая тренировка концентрации.' },
    { text: 'С таким ветром любой пас становится приключением.' },
  ],
  fine: [
    { text: 'Удачи команде на поле!' },
    { text: 'Поехали!', author: 'Юрий Гагарин', role: 'космонавт' },
    { text: 'Главное — не победа, а участие.', author: 'Пьер де Кубертен', role: 'основатель Олимпиад' },
  ],
};

function categoryFor(w) {
  if (!w) return null;
  const cond = (w.condition || '').toLowerCase();
  if (cond.includes('снег')) return 'snow';
  if (cond.includes('дожд') || cond.includes('ливен') || cond.includes('морос')) return 'rain';
  if (w.windMs >= 10) return 'windy';
  if (w.tempC <= 0) return 'cold';
  if (w.tempC <= 8) return 'cool';
  if (w.tempC >= 25) return 'hot';
  return 'fine';
}

// Стабильный детерминированный выбор: одна и та же цитата для одного и того же
// прогноза, не «прыгает» при перерендерах. Хеш строится из forecastFor (метка
// времени слота) — так каждый матч получает свою цитату.
function hash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function adviceFor(w) {
  const cat = categoryFor(w);
  if (!cat) return null;
  const pool = ADVICE_POOL[cat] || [];
  if (pool.length === 0) return null;
  const seed = hash(`${cat}|${w?.forecastFor || ''}`);
  return pool[seed % pool.length];
}

// OpenWeatherMap free plan: forecast до 5 суток вперёд. Дальше — нет данных.
const MAX_FORECAST_DAYS = 5;

export default function MatchWeather({ lat, lng, atIso }) {
  const [data, setData] = useState(null);
  const [loaded, setLoaded] = useState(false);

  // Сколько дней до матча — определяет, есть ли смысл ходить за прогнозом.
  const daysUntil = atIso ? (new Date(atIso).getTime() - Date.now()) / 86400000 : 0;
  const tooFar = daysUntil > MAX_FORECAST_DAYS;

  useEffect(() => {
    if (!lat || !lng) return;
    if (tooFar) { setLoaded(true); return; } // не дёргаем API если матч за пределами окна

    let cancelled = false;
    const url = `${API_BASE}/api/public/weather?lat=${lat}&lng=${lng}` + (atIso ? `&at=${encodeURIComponent(atIso)}` : '');
    fetch(url)
      .then((r) => r.json().catch(() => null))
      .then((d) => { if (!cancelled) { setData(d); setLoaded(true); } })
      .catch(() => { if (!cancelled) setLoaded(true); });
    return () => { cancelled = true; };
  }, [lat, lng, atIso, tooFar]);

  // Матч за пределами 5-дневного окна — показываем placeholder с объяснением,
  // чтобы юзер не думал «почему на этом матче погоды нет, а на том есть».
  if (tooFar) {
    const showAt = Math.ceil(daysUntil - MAX_FORECAST_DAYS);
    return (
      <div className="match-weather match-weather--soon">
        <span className="match-weather__soon-icon" aria-hidden>🌦</span>
        <span className="match-weather__soon-text">
          Прогноз погоды появится {showAt === 1 ? 'через сутки' : `через ${showAt} ${plural(showAt, ['день', 'дня', 'дней'])}`}
          {' '}— за 5 дней до матча.
        </span>
      </div>
    );
  }

  if (!loaded) return null;

  // Бэк теперь возвращает { error: '...' } при проблемах. Показываем
  // компактный placeholder с человеко-понятной причиной — иначе родитель
  // видит «у одного матча погода есть, у другого нет» и не понимает почему.
  if (!data || data.error) {
    const errCode = data?.error;
    let message;
    if (errCode === 'no_api_key' || errCode === 'invalid_api_key') {
      message = 'Прогноз погоды временно недоступен';
    } else if (errCode === 'rate_limited') {
      message = 'Прогноз обновляется — загляните чуть позже';
    } else if (errCode === 'out_of_window') {
      // На всякий случай — фронт сам должен поймать tooFar выше
      message = 'Прогноз появится ближе к дате матча';
    } else {
      // network_error / upstream_5xx / etc
      message = 'Прогноз погоды временно недоступен';
    }
    return (
      <div className="match-weather match-weather--soon">
        <span className="match-weather__soon-icon" aria-hidden>🌦</span>
        <span className="match-weather__soon-text">{message}</span>
      </div>
    );
  }

  const advice = adviceFor(data);

  return (
    <div className="match-weather">
      <div className="match-weather__main">
        {data.iconUrl && (
          <img
            src={data.iconUrl}
            alt={data.condition}
            className="match-weather__icon"
            width="56"
            height="56"
            onError={(e) => { e.currentTarget.style.display = 'none'; }}
          />
        )}
        <div className="match-weather__temp">
          <span className="match-weather__t">{data.tempC > 0 ? '+' : ''}{data.tempC}°</span>
          <span className="match-weather__feels">по ощущениям {data.feelsC > 0 ? '+' : ''}{data.feelsC}°</span>
        </div>
        <div className="match-weather__cond">
          <div className="match-weather__cond-text">{data.condition}</div>
          <div className="match-weather__sub">
            ветер {data.windMs} м/с
            {data.humidity != null ? ` · влажность ${data.humidity}%` : ''}
          </div>
        </div>
      </div>
      {advice && (
        <div className="match-weather__advice" aria-label="Совет">
          <div className="match-weather__advice-text">{advice.text}</div>
          {advice.author && (
            <div className="match-weather__advice-author">
              — {advice.author}{advice.role ? `, ${advice.role}` : ''}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
