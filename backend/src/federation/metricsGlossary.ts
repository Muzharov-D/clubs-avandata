/**
 * Глоссарий показателей — ЕДИНСТВЕННЫЙ источник названий, описаний и групп событий
 * AvanData для интерфейса (сверен с руководством 2026-10-01, см. docs/GLOSSARY.md).
 *
 * Правила (СТРОГО):
 *  - технические названия AvanData («Передача +») в интерфейс не попадают никогда —
 *    только `name` и `description` отсюда (описание — по «?» над метрикой);
 *  - методика (очки и веса событий) нигде в интерфейсе не показывается; `polarity`
 *    говорит только «больше — лучше / меньше — лучше»;
 *  - фронт не держит своих названий — получает их из ответов API.
 */

export type MetricGroup = 'finishing' | 'creation' | 'possession' | 'defence' | 'errors' | 'goalkeeping';
export const GROUP_TITLE: Record<MetricGroup, string> = {
  finishing: 'Завершение', creation: 'Созидание', possession: 'Владение',
  defence: 'Оборона', errors: 'Ошибки', goalkeeping: 'Вратарь',
};

export interface MetricInfo {
  /** Тренерское название (единственное, что видит пользователь). */
  name: string;
  /** Короткая подпись для диаграмм. */
  short: string;
  /** Что это значит — показывается по «?». */
  description: string;
  group: MetricGroup;
  /** 1 — больше лучше, −1 — меньше лучше. */
  polarity: 1 | -1;
}

/** Событие AvanData → показатель. Технические (выход, замена, перестановка) — только для минут. */
export const EVENT_GLOSSARY: Record<string, MetricInfo> = {
  // ─── Завершение ───
  goal:              { name: 'Голы', short: 'Голы', description: 'Забитый мяч.', group: 'finishing', polarity: 1 },
  hitTarget:         { name: 'Удары в створ', short: 'В створ', description: 'Удар, который шёл в створ ворот (включая голы).', group: 'finishing', polarity: 1 },
  hit:               { name: 'Удары мимо', short: 'Мимо', description: 'Удар, который не попал в створ: мимо ворот или в блок.', group: 'finishing', polarity: 1 },
  // ─── Созидание ───
  goalMomentPlus:    { name: 'Созданные голевые моменты', short: 'Моменты', description: 'Игрок создал голевой момент для команды любым действием: передачей, обводкой, выходом.', group: 'creation', polarity: 1 },
  passPlus:          { name: 'Прогрессивные передачи', short: 'Прогр. передачи', description: 'Точная передача, которая продвигает мяч к воротам соперника.', group: 'creation', polarity: 1 },
  driblePlus:        { name: 'Успешные обводки', short: 'Обводки', description: 'Обыграл соперника один в один и сохранил мяч.', group: 'creation', polarity: 1 },
  corner:            { name: 'Подачи угловых', short: 'Угловые', description: 'Подача углового удара.', group: 'creation', polarity: 1 },
  // ─── Владение ───
  ballSave:          { name: 'Сохранение мяча под прессингом', short: 'Под прессингом', description: 'Удержал мяч, когда на него давил соперник.', group: 'possession', polarity: 1 },
  underPressure:     { name: 'Потери под прессингом', short: 'Потери под давлением', description: 'Потерял мяч под давлением соперника.', group: 'possession', polarity: -1 },
  passMinus:         { name: 'Неточные передачи', short: 'Неточные передачи', description: 'Передача, после которой мяч ушёл сопернику.', group: 'possession', polarity: -1 },
  dribleMinus:       { name: 'Неудачные обводки', short: 'Неудачные обводки', description: 'Попытка обводки, после которой мяч потерян.', group: 'possession', polarity: -1 },
  // ─── Оборона ───
  tackle:            { name: 'Отборы', short: 'Отборы', description: 'Отобрал мяч у соперника в единоборстве.', group: 'defence', polarity: 1 },
  interception:      { name: 'Перехваты', short: 'Перехваты', description: 'Перехватил передачу соперника.', group: 'defence', polarity: 1 },
  press:             { name: 'Прессинг', short: 'Прессинг', description: 'Надавил на соперника с мячом и вынудил его ошибиться.', group: 'defence', polarity: 1 },
  countrpress:       { name: 'Контрпрессинг', short: 'Контрпрессинг', description: 'Сразу надавил на соперника после потери мяча командой.', group: 'defence', polarity: 1 },
  takeaway:          { name: 'Выносы', short: 'Выносы', description: 'Выбил мяч из опасной зоны у своих ворот.', group: 'defence', polarity: 1 },
  block:             { name: 'Блоки в штрафной', short: 'Блоки', description: 'Заблокировал удар или передачу в своей штрафной площади.', group: 'defence', polarity: 1 },
  // ─── Ошибки ───
  rgmMinus:          { name: 'Сорванные голевые атаки', short: 'Сорв. атаки', description: 'Испортил развитие голевой атаки своей команды.', group: 'errors', polarity: -1 },
  goalMomentMinus:   { name: 'Упущенные голевые моменты', short: 'Упущ. моменты', description: 'Испортил создание голевого момента в атаке своей команды.', group: 'errors', polarity: -1 },
  guarding:          { name: 'Упущенная опека', short: 'Упущ. опека', description: 'Упустил своего игрока в обороне.', group: 'errors', polarity: -1 },
  positionalMistake: { name: 'Позиционные ошибки', short: 'Поз. ошибки', description: 'Неверно занял позицию, и соперник этим воспользовался.', group: 'errors', polarity: -1 },
  grossError:        { name: 'Грубые ошибки', short: 'Грубые ошибки', description: 'Ошибка, после которой у соперника гол или верный голевой момент.', group: 'errors', polarity: -1 },
  autogoal:          { name: 'Автоголы', short: 'Автоголы', description: 'Мяч, забитый в свои ворота.', group: 'errors', polarity: -1 },
  offside:           { name: 'Офсайды', short: 'Офсайды', description: 'Положение «вне игры».', group: 'errors', polarity: -1 },
  foul:              { name: 'Фолы', short: 'Фолы', description: 'Нарушение правил.', group: 'errors', polarity: -1 },
  yellowCard:        { name: 'Жёлтые карточки', short: 'Жёлтые', description: 'Предупреждение.', group: 'errors', polarity: -1 },
  redCard:           { name: 'Красные карточки', short: 'Красные', description: 'Удаление.', group: 'errors', polarity: -1 },
  // ─── Вратарь ───
  save20:            { name: 'Простые сейвы', short: 'Простые сейвы', description: 'Вратарь отразил несложный удар.', group: 'goalkeeping', polarity: 1 },
  save50:            { name: 'Средние сейвы', short: 'Средние сейвы', description: 'Вратарь отразил удар средней сложности.', group: 'goalkeeping', polarity: 1 },
  save90:            { name: 'Трудные сейвы', short: 'Трудные сейвы', description: 'Вратарь отразил трудный удар.', group: 'goalkeeping', polarity: 1 },
  save150:           { name: 'Невероятные сейвы', short: 'Невероятные', description: 'Вратарь отразил удар, который почти наверняка был бы голом.', group: 'goalkeeping', polarity: 1 },
  goalMistake:       { name: 'Ошибки вратаря', short: 'Ошибки вратаря', description: 'Ошибка вратаря, после которой у соперника был момент или гол.', group: 'goalkeeping', polarity: -1 },
  missedGoal:        { name: 'Пропущенные голы по вине вратаря', short: 'Пропущено', description: 'Пропущенный гол, ответственность за который на вратаре.', group: 'goalkeeping', polarity: -1 },
};

/** Технические события — только для подсчёта минут, в показатели не входят. */
export const TECHNICAL_EVENTS = new Set(['playerEnter', 'replacement', 'swap']);

export const metricInfo = (eventTypeId: string): MetricInfo | null => EVENT_GLOSSARY[eventTypeId] ?? null;

/**
 * Составные показатели профиля (ДНК, пицца, сильные стороны). Каждый — сумма событий
 * за полный матч своего возраста; `ratio` — доля (точность), а не частота.
 */
export interface ProfileMetric {
  key: string; name: string; short: string; description: string; group: MetricGroup; polarity: 1 | -1;
  events: string[];
  /** Доля: num/(num+den) событий, а не «за матч». */
  ratio?: { num: string[]; den: string[] };
}
export const OUTFIELD_PROFILE: ProfileMetric[] = [
  { key: 'goals', name: 'Голы', short: 'Голы', description: 'Забитые мячи за полный матч своего возраста.', group: 'finishing', polarity: 1, events: ['goal'] },
  { key: 'shots', name: 'Удары', short: 'Удары', description: 'Все удары — в створ и мимо — за полный матч своего возраста.', group: 'finishing', polarity: 1, events: ['hitTarget', 'hit'] },
  { key: 'chances', name: 'Созданные голевые моменты', short: 'Моменты', description: 'Голевые моменты, созданные для команды, за полный матч своего возраста.', group: 'creation', polarity: 1, events: ['goalMomentPlus'] },
  { key: 'progPasses', name: 'Прогрессивные передачи', short: 'Прогр. передачи', description: 'Точные передачи, продвигающие мяч к воротам соперника, за полный матч своего возраста.', group: 'creation', polarity: 1, events: ['passPlus'] },
  { key: 'dribbles', name: 'Успешные обводки', short: 'Обводки', description: 'Обыгрыши один в один с сохранением мяча за полный матч своего возраста.', group: 'creation', polarity: 1, events: ['driblePlus'] },
  { key: 'security', name: 'Игра под прессингом', short: 'Под прессингом', description: 'Доля удержанных мячей под давлением: сохранения против потерь под прессингом.', group: 'possession', polarity: 1, events: [], ratio: { num: ['ballSave'], den: ['underPressure'] } },
  { key: 'accuracy', name: 'Надёжность передач', short: 'Надёжн. передач', description: 'Доля удачных передач: прогрессивные против неточных.', group: 'possession', polarity: 1, events: [], ratio: { num: ['passPlus'], den: ['passMinus'] } },
  { key: 'ballWin', name: 'Отборы и перехваты', short: 'Отбор мяча', description: 'Отборы и перехваты за полный матч своего возраста.', group: 'defence', polarity: 1, events: ['tackle', 'interception'] },
  { key: 'pressing', name: 'Прессинг', short: 'Прессинг', description: 'Прессинг и контрпрессинг, вынудившие соперника ошибиться, за полный матч своего возраста.', group: 'defence', polarity: 1, events: ['press', 'countrpress'] },
  { key: 'clearances', name: 'Выносы и блоки', short: 'Выносы, блоки', description: 'Выносы из опасной зоны и блоки в своей штрафной за полный матч своего возраста.', group: 'defence', polarity: 1, events: ['takeaway', 'block'] },
  { key: 'mistakes', name: 'Ошибки', short: 'Без ошибок', description: 'Сорванные атаки, упущенные моменты и опека, позиционные и грубые ошибки за полный матч своего возраста. Чем меньше, тем лучше.', group: 'errors', polarity: -1, events: ['rgmMinus', 'goalMomentMinus', 'guarding', 'positionalMistake', 'grossError', 'autogoal'] },
];
export const GK_PROFILE: ProfileMetric[] = [
  { key: 'saves', name: 'Сейвы', short: 'Сейвы', description: 'Все отражённые удары за полный матч своего возраста.', group: 'goalkeeping', polarity: 1, events: ['save20', 'save50', 'save90', 'save150'] },
  { key: 'hardSaves', name: 'Трудные сейвы', short: 'Трудные', description: 'Трудные и невероятные сейвы за полный матч своего возраста.', group: 'goalkeeping', polarity: 1, events: ['save90', 'save150'] },
  { key: 'gkErrors', name: 'Ошибки вратаря', short: 'Без ошибок', description: 'Ошибки вратаря и голы по его вине за полный матч своего возраста. Чем меньше, тем лучше.', group: 'goalkeeping', polarity: -1, events: ['goalMistake', 'missedGoal'] },
  { key: 'progPasses', name: 'Прогрессивные передачи', short: 'Прогр. передачи', description: 'Точные передачи, продвигающие мяч вперёд, за полный матч своего возраста.', group: 'creation', polarity: 1, events: ['passPlus'] },
  { key: 'accuracy', name: 'Надёжность передач', short: 'Надёжн. передач', description: 'Доля удачных передач: прогрессивные против неточных.', group: 'possession', polarity: 1, events: [], ratio: { num: ['passPlus'], den: ['passMinus'] } },
  { key: 'clearances', name: 'Выносы и блоки', short: 'Выносы, блоки', description: 'Выносы и блоки за полный матч своего возраста.', group: 'defence', polarity: 1, events: ['takeaway', 'block'] },
];
