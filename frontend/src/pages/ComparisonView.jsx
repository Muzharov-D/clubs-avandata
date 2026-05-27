import { useState } from 'react';
import { useApi } from '../hooks/useApi';
import { fetchMatch, fetchMatches } from '../services/api';
import { useTeam } from '../contexts/TeamContext';
import SectionTabs from '../components/SectionTabs';
import SoccerFieldImageMap from '../components/SoccerFieldImageMap';
import './ComparisonView.css';

const TONE_TABS = [
  { id: 'positive', label: 'Положительные' },
  { id: 'negative', label: 'Отрицательные' },
];

const POSITIVE_METRICS = [
  ['Удары всего',                ['shooting', 'totalShots']],
  ['Удары в створ',              ['shooting', 'shotsOnTarget']],
  ['xG',                         ['shooting', 'expectedGoals']],
  ['Прогрессивные передачи',     ['passes', 'progressive']],
  ['Передачи в финальную треть', ['passes', 'toFinalThird']],
  ['Кроссы',                     ['passes', 'crosses']],
  ['Угловые',                    ['setPieces', 'corners']],
  ['Отборы',                     ['recoveriesAndTackling', 'tacklesLine']],
  ['Перехваты',                  ['positioning', 'interceptions']],
  ['Прессинг',                   ['pressing', 'pressing']],
  ['Контрпрессинг',              ['pressing', 'counterpressing']],
  ['Возврат мяча',               ['recoveriesAndTackling', 'returns']],
];

const NEGATIVE_METRICS = [
  ['Потери',                              ['possession', 'losses']],
  ['Опасные потери на своей половине',    ['possession', 'dangerousLossesOwnHalf']],
  ['Технические ошибки',                  ['possession', 'technicalMistakes']],
  ['Офсайды',                             ['setPieces', 'offsides']],
  ['Жёлтые карточки',                     ['positioning', 'yellowCards']],
  ['Красные карточки',                    ['positioning', 'redCards']],
  ['Нарушения',                           ['positioning', 'fouls']],
  ['Удары против',                        ['positioning', 'shotsAgainst']],
  ['Заблокированные удары',               ['positioning', 'blockedShots']],
];

const SECTIONS = [
  { id: 'shooting',                title: 'Удары',           map: 'shooting' },
  { id: 'setPieces',               title: 'Стандарты',       map: 'setPieces' },
  { id: 'possession',              title: 'Владение',        map: null },
  { id: 'passes',                  title: 'Передачи',        map: 'passes' },
  { id: 'attacks',                 title: 'Атаки',           map: 'attacks' },
  { id: 'recoveriesAndTackling',   title: 'Отборы и возвраты', map: 'recoveriesAndTackling' },
  { id: 'duels',                   title: 'Единоборства',    map: 'duels' },
  { id: 'pressing',                title: 'Прессинг',        map: 'pressing' },
  { id: 'positioning',             title: 'Оборона',         map: 'positioning' },
];

function fmtVal(v) {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'object') {
    const parts = [];
    if (v.value !== undefined) parts.push(v.value);
    if (v.pct !== null && v.pct !== undefined) parts.push(`${v.pct}%`);
    return parts.join(' · ') || '—';
  }
  return v;
}

function getDeep(obj, keys) {
  return keys.reduce((acc, k) => (acc == null ? acc : acc[k]), obj);
}

const AGG_KEY_LABELS = {
  // shooting (page 12)
  totalShots: 'Удары всего',
  avgShotDistance: 'Средняя дистанция удара, м',
  shotsOnTarget: 'Удары в створ',
  expectedGoals: 'xG',
  goalActions: 'Голевые моменты',
  shotsByHead: 'Удары головой',
  freeKickShots: 'Удары со штрафных',

  // setPieces (page 13)
  throwIns: 'Вбрасывания',
  freeKicks: 'Штрафные',
  freeKicksWithShot: 'Штрафные с ударом',
  penalty: 'Пенальти',
  corners: 'Угловые',
  offsides: 'Офсайды',
  directFreeKicks: 'Прямые штрафные',

  // possession (page 14)
  possessionsCount: 'Кол-во владений',
  losses: 'Потери',
  byThird: 'Владение по третям',
  dangerousLossesOwnHalf: 'Опасные потери на своей половине',
  technicalMistakes: 'Технические ошибки',
  averagePossessionTime: 'Среднее время владения, с',
  possessionPct: 'Владение, %',

  // passes (page 15)
  forward: 'Передачи вперёд',
  back: 'Передачи назад',
  sideways: 'Передачи в сторону',
  short: 'Короткие передачи',
  middle: 'Средние передачи',
  long: 'Длинные передачи',
  progressive: 'Прогрессивные передачи',
  toFinalThird: 'Передачи в финальную треть',
  crosses: 'Кроссы',
  goalKicks: 'Удары от ворот',
  oppda: 'OPPDA',
  passesPerMinute: 'Передач в минуту',
  totalPasses: 'Всего передач',
  passAccuracy: 'Точность передач, %',

  // attacks (page 16)
  positional: 'Позиционные атаки',
  counterattacks: 'Контратаки',
  defenceBreakthroughs: 'Прорывы обороны',
  crossingMidfield: 'Прохождения средней линии',
  attacksTotal: 'Всего атак',

  // recoveriesAndTackling (page 17)
  thirdLow: 'Возвраты — своя треть',
  thirdMid: 'Возвраты — средняя треть',
  thirdHigh: 'Возвраты — чужая треть',
  recoveries: 'Возвраты мяча',
  returns: 'Возвраты',
  tacklesLine: 'Отборы',
  recoveriesByThird: 'Возвраты по третям',

  // duels (page 18)
  totalDuels: 'Единоборств всего',
  aerialDuels: 'Воздушные дуэли',
  groundDuels: 'Дуэли в земле',

  // pressing (page 19)
  pressing: 'Прессинг',
  counterpressing: 'Контрпрессинг',
  averagePPDA: 'Средний PPDA',

  // positioning (page 20)
  shotsAgainst: 'Удары против',
  interceptions: 'Перехваты',
  clearance: 'Выносы',
  fouls: 'Нарушения',
  yellowCards: 'Жёлтые карточки',
  redCards: 'Красные карточки',
  blockedShots: 'Заблокированные удары',
  saves: 'Сейвы',
};

function prettyKey(k) {
  if (AGG_KEY_LABELS[k]) return AGG_KEY_LABELS[k];
  // fallback: camelCase → "Camel case" — на случай новых ключей
  const s = String(k).replace(/([a-z])([A-Z])/g, '$1 $2');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export default function ComparisonView() {
  const { selectedTeamId } = useTeam();
  const matchesRes = useApi(() => fetchMatches(selectedTeamId), [selectedTeamId]);
  const lastMatchId = matchesRes.data?.matches?.[0]?.id;
  const matchRes = useApi(() => (lastMatchId ? fetchMatch(lastMatchId) : Promise.resolve(null)), [lastMatchId]);
  const [tone, setTone] = useState('positive');

  const match = matchRes.data;
  const ta = match?.teamAggregates || {};
  const metrics = tone === 'positive' ? POSITIVE_METRICS : NEGATIVE_METRICS;

  if (matchRes.loading || matchesRes.loading) return <div className="empty-state">Загрузка…</div>;
  if (!match) return <div className="empty-state">Нет данных о матчах</div>;

  return (
    <div className="page comparison-view">
      <div className="comparison-view__topbar">
        <SectionTabs tabs={TONE_TABS} active={tone} onChange={setTone} />
        <span className="comparison-view__hint">Источник: {match.homeTeam?.name} vs {match.awayTeam?.name}</span>
      </div>

      <div className="card">
        <div className="page-section-title">
          {tone === 'positive' ? 'Положительные метрики команды' : 'Отрицательные метрики команды'}
        </div>
        <div className="comparison-view__metrics">
          {metrics.map(([label, path], i) => {
            const v = getDeep(ta, path);
            return (
              <div className="comparison-metric" key={i}>
                <span className="comparison-metric__label">{label}</span>
                <span className={`comparison-metric__value comparison-metric__value--${tone}`}>
                  {fmtVal(v)}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="page-section-title comparison-view__sections-title">
        Командные дашборды (9 секций · pages 12-20 PDF)
      </div>
      <div className="comparison-view__sections">
        {SECTIONS.map((sec) => {
          const data = ta[sec.id];
          const map = data?.mapImage;
          return (
            <div className="card comparison-section" key={sec.id}>
              <div className="comparison-section__head">
                <span className="comparison-section__title">{sec.title}</span>
              </div>
              <div className="comparison-section__body">
                <div className="comparison-section__metrics">
                  {data ? (
                    Object.entries(data)
                      .filter(([k]) => k !== 'mapImage')
                      .map(([k, v]) => (
                        <div className="comparison-section__row" key={k}>
                          <span className="comparison-section__row-label">{prettyKey(k)}</span>
                          <span className="comparison-section__row-value">{fmtVal(v)}</span>
                        </div>
                      ))
                  ) : (
                    <div className="empty-state">Нет данных</div>
                  )}
                </div>
                {map && (
                  <SoccerFieldImageMap src={map} title="Карта" height={280} />
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
