/**
 * Детальная аналитика по секциям — глубокий командный агрегат (среднее за период).
 * Перенесён с /club (витрина) на /analytics (океан): это аналитическая глубина,
 * а не статус «сейчас». Самодостаточен: свои стили + словарь полей, не зависит
 * от ClubDashboard.css.
 *
 * Данные: aggregates = agg.teamAggregates с backend (fetchMatchAggregate),
 * вид { sectionKey: { fieldKey: number | { value|pct } } }.
 */
import './TeamAggregatesGrid.css';
import { matchesWord } from '../../utils/num';

type AnyObj = Record<string, unknown>;

interface Props {
  aggregates?: Record<string, AnyObj> | null;
  matchCount?: number;
  periodLabel?: string;
}

const SECTION_TITLES: Record<string, string> = {
  shooting: 'Удары и реализация',
  passes: 'Передачи',
  possession: 'Владение мячом',
  attacks: 'Атаки',
  pressing: 'Прессинг',
  recoveriesAndTackling: 'Отборы и перехваты',
  duels: 'Единоборства',
  positioning: 'Позиционная игра',
  setPieces: 'Стандарты',
  fitness: 'Фитнес',
};

const FIELD_RU: Record<string, string> = {
  // shooting
  shots: 'Удары', onTarget: 'В створ', goals: 'Голы', byHead: 'Головой',
  totalShots: 'Удары', shotsOnTarget: 'В створ', expectedGoals: 'xG',
  avgShotDistance: 'Сред. дистанция удара',
  // passes
  total: 'Всего', successful: 'Точные', progressive: 'Прогрессивные',
  toFinalThird: 'В финальную треть', intoPenArea: 'В штрафную',
  crosses: 'Кроссы', keyPass: 'Ключевые', back: 'Назад', long: 'Длинные',
  short: 'Короткие', middle: 'Средние',
  forward: 'Вперёд', sideways: 'Поперечные',
  // attacks
  assists: 'Ассисты', goalActions: 'Голевые действия', dribble: 'Дриблинг',
  touchesInBox: 'Касания в штрафной', entriesInBox: 'Входы в штрафную',
  crossingMidfield: 'Переходы средней линии', defenceBreakthroughs: 'Прорывы обороны',
  // possession
  lostBall: 'Потери', technicalMistake: 'Брак', loseOnOwnHalf: 'Потери на своей',
  losses: 'Потери всего', possessionsCount: 'Владения',
  // recoveriesAndTackling
  tackle: 'Отборы', interception: 'Перехваты', recovery: 'Возвраты',
  tackleAndRecovery: 'Отбор+возврат', slidingTackles: 'Подкаты',
  returns: 'Возвраты', tacklesLine: 'Отборы на линии',
  recoveriesAndTackling: 'Возвраты и отборы', rebounds: 'Подборы',
  inFirstThird: 'В 1-й трети', inSecondThird: 'В средней', inThirdThird: 'В фин. трети',
  // duels
  duel: 'Выиграно дуэлей', aerialDuel: 'Выиграно воздушных', totalDuels: 'Всего дуэлей',
  aerialDuels: 'Воздушные дуэли',
  // pressing
  pressing: 'Прессинг', counterpressing: 'Контр-прессинг',
  // positioning
  clearance: 'Выносы', blockedShot: 'Блок-удары', positionPlay: 'Поз. игра',
  fouls: 'Фолы', yellowCard: 'Жёлтые', redCard: 'Красные', shotsAgainst: 'Удары по воротам',
  interceptions: 'Перехваты',
  // setPieces
  corner: 'Угловые', corners: 'Угловые', freeKick: 'Штрафные', freeKicks: 'Штрафные',
  freeKickShot: 'Штр. с ударом', penalty: 'Пенальти', throwing: 'Ауты', throwIns: 'Ауты',
  offsides: 'Офсайды', penaltyWithShot: 'Пенальти с ударом',
  // fitness — секция приходит с бэка англ. ключами; UI строго русский
  totalDistance: 'Общая дистанция', sprintDistance: 'Спринт-дистанция',
  averageSpeed: 'Средняя скорость', intenseRunning: 'Интенсивный бег',
  sprintsCount: 'Спринтов', sprintDistanceM: 'Спринт-дистанция',
};

function sectionTitle(k: string): string { return SECTION_TITLES[k] || k; }

function fieldLabel(k: string): string {
  if (FIELD_RU[k]) return FIELD_RU[k];
  return k.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase());
}

/** Числовое значение поля агрегата: number | { value } | { pct } → { val, suffix }. */
function readVal(v: unknown): { val: number | null; suffix: string } {
  if (typeof v === 'number') return { val: v, suffix: '' };
  if (v && typeof v === 'object') {
    const o = v as AnyObj;
    if (typeof o.value === 'number') return { val: Number(o.value), suffix: '' };
    if (typeof o.pct === 'number') return { val: Number(o.pct), suffix: '%' };
  }
  return { val: null, suffix: '' };
}

// Поля-«ставки», которым осмысленна дробь (xG, дистанция удара). Остальное —
// счётные действия: «48,67 дуэлей» режет глаз тренеру, округляем до целого.
const DECIMAL_KEYS = new Set(['expectedGoals', 'xG', 'avgShotDistance']);

// Прячем во всех агрегатных гридах:
//  - PPDA (averagePPDA/oppda) — слишком сложная метрика для тренера;
//  - recoveriesAndTackling.interception (синг.) — это СУММА, дублирует
//    positioning.interceptions (мн.) под тем же лейблом «Перехваты»; по решению
//    оставляем 74 (positioning.interceptions), сумму прячем.
const HIDDEN_KEYS = new Set(['averagePPDA', 'averagePpda', 'oppda', 'interception']);

function fmtAggVal(k: string, val: number, suffix: string): string {
  // Дроби — с ТОЧКОЙ, как во всём UI (1.83, 6.9), не запятая ru-RU: на одной
  // странице рядом «1.77 xG» — разнобой запятая/точка резал глаз. Целые —
  // с разделителем тысяч.
  if (suffix === '%' || DECIMAL_KEYS.has(k)) return String(Math.round(val * 100) / 100);
  return Math.round(val).toLocaleString('ru-RU');
}

function AggregateCard({ title, data }: { title: string; data: AnyObj }) {
  // Дедуп по русскому лейблу — оставляем макс (interception vs interceptions).
  type Entry = { k: string; label: string; val: number; suffix: string };
  const bucket = new Map<string, Entry>();
  for (const [k, v] of Object.entries(data || {})) {
    if (k === 'mapImage' || HIDDEN_KEYS.has(k)) continue;
    const { val, suffix } = readVal(v);
    if (val == null || val === 0) continue;
    const label = fieldLabel(k);
    const prev = bucket.get(label);
    if (!prev || prev.val < val) bucket.set(label, { k, label, val, suffix });
  }
  const entries = Array.from(bucket.values()).sort((a, b) => b.val - a.val).slice(0, 6);
  if (entries.length === 0) return null;
  // Бар укоренён в 0: честная доля от max (проценты — от 100).
  const max = entries.reduce((m, e) => Math.max(m, e.suffix === '%' ? 100 : e.val), 0) || 1;
  return (
    <div className="tag-card">
      <div className="tag-card__title">{title}</div>
      {entries.map(({ k, label, val, suffix }) => {
        const pct = Math.min(100, Math.round((val / max) * 100));
        return (
          <div key={k} className="tag-row">
            <div className="tag-row__head">
              <span className="tag-row__key">{label}</span>
              <span className="tag-row__val">{fmtAggVal(k, val, suffix)}{suffix}</span>
            </div>
            <span className="tag-row__bar" aria-hidden><span className="tag-row__bar-fill" style={{ width: `${pct}%` }} /></span>
          </div>
        );
      })}
    </div>
  );
}

export default function TeamAggregatesGrid({ aggregates, matchCount, periodLabel }: Props) {
  if (!aggregates) return null;
  // Только секции с хотя бы одной значимой числовой записью.
  const meaningful = Object.entries(aggregates).filter(([, v]) => {
    if (!v || typeof v !== 'object') return false;
    return Object.entries(v).some(([k, x]) => {
      if (k === 'mapImage' || HIDDEN_KEYS.has(k)) return false;
      const { val } = readVal(x);
      return typeof val === 'number' && val > 0;
    });
  });
  if (meaningful.length === 0) return null;
  const sub = matchCount && matchCount > 0
    ? `количество действий · среднее за ${periodLabel || 'период'}, ${matchCount} ${matchesWord(matchCount)}`
    : `количество действий · ${meaningful.length} категорий с данными`;
  return (
    <div className="tag">
      <div className="page-section-title">Детальная аналитика по секциям <span className="tag__sub">{sub}</span></div>
      <div className="tag__grid">
        {meaningful.map(([key, vals]) => (
          <AggregateCard key={key} title={sectionTitle(key)} data={vals as AnyObj} />
        ))}
      </div>
    </div>
  );
}
