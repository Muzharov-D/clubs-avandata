/**
 * Сезонная пицца-витрина игрока — per-90 перцентиль против позиционного пула за
 * ВЕСЬ сезон (а не против состава одного матча). Это «общий» профиль игрока,
 * которого не хватало: одна узнаваемая радар-картинка отвечает на вопрос
 * «кто этот игрок по сезону». Деградирует, если season-данные недоступны
 * (эндпоинт только для тренеров) — тогда карточку не показываем.
 */
import { seasonPercentiles } from '../../utils/playerRoles';
import PizzaChart from '../PizzaChart';
import './analytics.css';

// Сезонные метрики — label/group/fmt для пиццы. КЛЮЧ совпадает с движком ролей
// (ROLE_METRICS), перцентиль и raw90 берём из ЕДИНОГО источника seasonPercentiles,
// чтобы пицца, «ДНК», «Перцентиль по сезону» и текст био показывали одно число.
const SEASON_METRICS = [
  { key: 'gi',          label: 'Гол+пас',      group: 'attack'  },
  { key: 'shots',       label: 'Удары',        group: 'attack'  },
  { key: 'keyPass',     label: 'Ключевые',     group: 'attack'  },
  { key: 'dribble',     label: 'Обводки',      group: 'attack'  },
  { key: 'tackle',      label: 'Отборы',       group: 'defence' },
  { key: 'interception',label: 'Перехваты',    group: 'defence' },
  { key: 'recovery',    label: 'Возвраты',     group: 'defence' },
  { key: 'duel',        label: 'Единоборства', group: 'defence' },
  { key: 'pressing',    label: 'Прессинг',     group: 'defence' },
  { key: 'distance',    label: 'Дистанция, км', group: 'fitness', fmt: (v) => (v / 1000).toFixed(1) },
];

function fmt90(v) {
  if (v == null || isNaN(v)) return '—';
  return v.toFixed(v >= 10 ? 0 : 1);
}

export default function SeasonProfileCard({ subject, seasonPlayers, basis = 90 }) {
  if (!subject || !Array.isArray(seasonPlayers) || seasonPlayers.length < 4) return null;

  // Единый источник: тот же пул/порог/сглаживание, что у «ДНК» и «Перцентиля».
  const sp = seasonPercentiles(subject, seasonPlayers, basis);
  if (!sp) return null;

  // Слайс — только если метрика есть в источнике (в пуле кто-то её набирал).
  const slices = SEASON_METRICS.map((m) => {
    const r = sp.byKey[m.key];
    if (!r) return null;
    return { axis: m.label, group: m.group, value: r.pct, displayValue: m.fmt ? m.fmt(r.raw90) : fmt90(r.raw90) };
  }).filter(Boolean);

  if (slices.length < 3) return null;

  const poolSize = sp.poolSize;

  return (
    <div className="card player-detail__pizza">
      <div className="player-detail__pizza-head">
        <div className="page-section-title">
          Профиль по сезону <span className="an-model-tag">за матч ({basis}′) · в сравнении с командой</span>
        </div>
      </div>
      <PizzaChart
        subjectName={`${subject.fullName || ''} · сезон`}
        subjectMeta={`Цифры — действия за матч (${basis}′), длина слайса — перцентиль среди ${poolSize} полевых игроков`}
        vsLabel="команды"
        slices={slices}
      />
    </div>
  );
}
