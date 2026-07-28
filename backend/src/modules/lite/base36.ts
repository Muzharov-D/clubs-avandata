/**
 * БАЗОВЫЕ 36 ПОКАЗАТЕЛЕЙ АванДаты → ближайшая метрика SportVisor.
 *
 * Зачем таблица. Кабинет Lite стоит на 36 базовых показателях — это решение
 * владельца. Но у клуба-тенанта данные приходят из SportVisor, другим словарём.
 * Здесь зафиксировано, чем каждый из 36 меряется в клубных данных, и где
 * соответствие точное, а где приблизительное.
 *
 * Источники (оба сверены живьём 2026-07-28):
 *  - 36 показателей — `back.avandata.ru/event-types?limit=80`, ровно 36 записей;
 *  - словарь SportVisor — `stats` из match_players на живом матче Легируса
 *    (секции attack / defence / fitness, 41 + 22 + 10 ключей).
 *
 * `exact: false` — прямого счётчика в SportVisor нет, берём ближайший по смыслу.
 * Такие показатели В ОСИ КАБИНЕТА НЕ ИДУТ: тренеру нельзя показывать «Удар в
 * створ», если под ним на самом деле лежит другое число. Они здесь ради полноты
 * картины и как список того, что появится, когда клуб поедет на данных АванДаты.
 */

import { statField, statFieldTotal } from '../../shared/statValue.js';

export interface Base36Row {
  /** Название показателя как его зовёт АванДата. */
  title: string;
  category: 'attack' | 'defense' | 'general';
  /** Путь в `stats` SportVisor или null, если аналога нет вовсе. */
  sv: string | null;
  /** true — счётчик означает ровно то же; false — ближайший по смыслу. */
  exact: boolean;
  /** true — «меньше значит лучше» (потери, фолы, карточки). */
  inverse?: boolean;
}

export const BASE36: Base36Row[] = [
  // ── Атака ────────────────────────────────────────────────────────────────
  { title: 'Автогол',                        category: 'attack',  sv: 'attack.ownGoal',           exact: true, inverse: true },
  { title: 'Сохранение мяча под прессингом', category: 'attack',  sv: 'attack.lostBall',          exact: false, inverse: true },
  { title: 'Угловой удар',                   category: 'attack',  sv: 'attack.corner',           exact: true },
  { title: 'Дриблинг +',                     category: 'attack',  sv: 'attack.dribble',          exact: true },
  { title: 'Развитие голевого момента +',    category: 'attack',  sv: 'attack.secondAssist',     exact: false },
  { title: 'Создание голевого момента +',    category: 'attack',  sv: 'attack.keyPass',          exact: true },
  { title: 'Удар',                           category: 'attack',  sv: 'attack.shot',             exact: true },
  { title: 'Удар в створ',                   category: 'attack',  sv: null,                       exact: false },
  { title: 'Оффсайд',                        category: 'attack',  sv: 'attack.offside',          exact: true, inverse: true },
  { title: 'Передача +',                     category: 'attack',  sv: 'attack.passOnTarget',      exact: true },
  { title: 'Прессинг',                       category: 'attack',  sv: 'defence.pressing',        exact: true },

  // ── Оборона ──────────────────────────────────────────────────────────────
  { title: 'Блок',                           category: 'defense', sv: 'defence.blockedShot',     exact: true },
  { title: 'Контрпрессинг',                  category: 'defense', sv: 'defence.counterpressing', exact: true },
  { title: 'Дриблинг −',                     category: 'defense', sv: 'defence.dribbleAgainst',  exact: true, inverse: true },
  { title: 'Создание голевого момента −',    category: 'defense', sv: 'attack.technicalMistake', exact: false, inverse: true },
  { title: 'Опека',                          category: 'defense', sv: 'defence.duel',            exact: false },
  { title: 'Перехват',                       category: 'defense', sv: 'defence.interception',    exact: true },
  { title: 'Пропущенный гол',                category: 'defense', sv: null,                       exact: false, inverse: true },
  { title: 'Передача −',                     category: 'defense', sv: null,                       exact: false, inverse: true },
  { title: 'Развитие голевого момента −',    category: 'defense', sv: 'attack.loseOnOwnHalf',    exact: false, inverse: true },
  { title: 'Сейв 20',                        category: 'defense', sv: 'defence.save',            exact: false },
  { title: 'Сейв 50',                        category: 'defense', sv: 'defence.save',            exact: false },
  { title: 'Сейв 90',                        category: 'defense', sv: 'defence.save',            exact: false },
  { title: 'Сейв 150',                       category: 'defense', sv: 'defence.save',            exact: false },
  { title: 'Отбор',                          category: 'defense', sv: 'defence.tackle',          exact: true },
  { title: 'Вынос',                          category: 'defense', sv: 'defence.clearance',       exact: true },
  { title: 'Потеря под прессингом',          category: 'defense', sv: 'attack.lostBall',         exact: true, inverse: true },

  // ── Общие ────────────────────────────────────────────────────────────────
  { title: 'Фол',                            category: 'general', sv: 'defence.fouls',            exact: true, inverse: true },
  { title: 'Ошибка вратаря',                 category: 'general', sv: null,                       exact: false, inverse: true },
  { title: 'Грубая ошибка',                  category: 'general', sv: 'attack.technicalMistake', exact: false, inverse: true },
  { title: 'Выход на поле',                  category: 'general', sv: 'fitness.minutes',          exact: false },
  { title: 'Позиционная ошибка',             category: 'general', sv: null,                       exact: false, inverse: true },
  { title: 'Красная карточка',               category: 'general', sv: 'defence.redCards',         exact: true, inverse: true },
  { title: 'Жёлтая карточка',                category: 'general', sv: 'defence.yellowCards',      exact: true, inverse: true },
  { title: 'Замена',                         category: 'general', sv: null,                       exact: false },
  { title: 'Перестановка',                   category: 'general', sv: null,                       exact: false },
];

/**
 * Ключи SportVisor, за которыми стоит хоть один из 36. Оси кабинета берутся
 * ТОЛЬКО отсюда — так «Интенсивность» и прочая трекинговая физика физически не
 * может попасть в Lite: её нет ни в одной строке таблицы.
 *
 * Подпись оси называет метрику SportVisor (это и есть показанное число), а
 * таблица выше говорит, какому из 36 она соответствует и насколько точно.
 */
export const BASE36_SV_KEYS: ReadonlySet<string> = new Set(
  BASE36.filter((r) => r.sv).map((r) => r.sv as string),
);

/**
 * Значение метрики игрока из `stats` по пути «секция.ключ».
 *
 * 🔴 ДВЕ ЛОВУШКИ, обе поймал на живых данных.
 *
 * 1. SportVisor хранит попыточные счётчики НЕ числом, а объектом
 *    `{total, successful, accuracy}`. Читал только `value` — и получал нули там,
 *    где у игрока 16 ударов за шесть матчей. Разворачиваем теми же хелперами,
 *    что и остальной бэкенд (`shared/statValue`), иначе сезонные числа Lite
 *    разойдутся с числами разбора матча.
 *
 * 2. Нумерованных секций (`attack4`, `defence1`…) в БАЗЕ НЕТ ВОВСЕ — их
 *    достраивает `legirusAdapter` при выдаче одного матча. В сыром `mp.stats`,
 *    который читает кабинет, есть только плоские `attack` / `defence` / `fitness`.
 *
 * `mode: 'total'` — сколько было ПОПЫТОК (удары, обводки); иначе берём полезное
 * значение (successful → value → total), то есть удавшееся действие.
 */
export function statAt(stats: unknown, path: string, mode: 'total' | 'value' = 'value'): number {
  const [section, key] = path.split('.');
  if (!section || !key) return 0;
  const group = section as 'attack' | 'defence' | 'fitness';
  return mode === 'total' ? statFieldTotal(stats, group, key) : statField(stats, group, key);
}
