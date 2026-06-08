// Реестр блоков конструктора — единственный источник истины.
//
// Описывает все настраиваемые страницы и их блоки/графики. По нему строятся:
//   • экран-хаб «Конструктор» (ConstructorPage),
//   • подписи блоков в режиме редактирования (Block),
//   • привязка live-pathname → pageId (ConstructorToggle).
//
// КОНТРАКТ: block.id здесь обязан совпадать с id в обёртке <Block page id> на
// странице. page = стабильный короткий id страницы (не маршрут) — он же ключ в
// сохранённом конфиге видимости. Навигацию и контролы (anchor-меню, селектор
// периода, список матчей) НЕ оборачиваем — их в реестре нет.

/**
 * @typedef {{ id: string, label: string, hint?: string, minPlan?: 'paid' }} BlockDef
 * @typedef {{ id: string, label: string, route: string, icon?: string,
 *             match: (pathname: string) => boolean, blocks: BlockDef[] }} PageDef
 *
 * minPlan: 'paid' — блок строится на платных метриках (xG, физика, хитмапы) и на
 * тарифе 'free' СКРЫТ полностью (см. Block.jsx). Остальные блоки доступны всем —
 * «урезаемые» сами показывают меньше, т.к. free-данные не содержат платных метрик.
 */

/** @type {PageDef[]} */
export const PAGES = [
  {
    id: 'nav',
    label: 'Левое меню',
    route: '',
    icon: '☰',
    // Не отдельная страница — настраивается только в хабе /constructor.
    // Блоки = пункты бокового меню; SidebarNav прячет пункт по isVisible('nav', id).
    match: () => false,
    blocks: [
      { id: 'club', label: 'Клуб' },
      { id: 'analytics', label: 'Аналитика' },
      { id: 'matches', label: 'Матчи' },
      { id: 'calendar', label: 'Календарь' },
      { id: 'trainings', label: 'Тренировки' },
      { id: 'players', label: 'Игроки' },
      { id: 'load', label: 'Нагрузка' },
    ],
  },
  {
    id: 'club',
    label: 'Клуб (дашборд)',
    route: '/club',
    icon: '🏆',
    match: (p) => p === '/club' || p === '/',
    blocks: [
      { id: 'next-match', label: 'Следующий матч' },
      { id: 'last-match', label: 'Последний матч' },
      { id: 'opponent-preview', label: 'Превью соперника' },
      { id: 'season-rating', label: 'Рейтинг сезона' },
      { id: 'best-player', label: 'Лучший игрок сезона' },
      { id: 'top5', label: 'Топ-5 по рейтингу' },
      { id: 'standings', label: 'Турнирная таблица' },
      { id: 'roster', label: 'Состав по линиям' },
    ],
  },
  {
    id: 'analytics',
    label: 'Аналитика',
    route: '/analytics',
    icon: '◉',
    match: (p) => p === '/analytics',
    blocks: [
      { id: 'team-info', label: 'Карточка команды' },
      { id: 'season-record', label: 'Итоги по матчам (В-Н-П)' },
      { id: 'season-ratings', label: 'Сводные рейтинги' },
      { id: 'key-stats', label: 'Показатели за матч' },
      { id: 'season-trend', label: 'Сезонная форма (тренд)' },
      { id: 'team-aggregates', label: 'Детальная статистика' },
      { id: 'team-season-analytics', label: 'xG-аналитика сезона', minPlan: 'paid' },
      { id: 'team-identity', label: 'Стиль игры', minPlan: 'paid' },
      { id: 'season-leaders', label: 'Лидеры сезона' },
    ],
  },
  {
    id: 'match',
    label: 'Матч (разбор)',
    route: '/matches/:matchId',
    icon: '⚽',
    // detail-страница матча: /matches/<id> (но не сам список /matches)
    match: (p) => /^\/matches\/[^/]+$/.test(p),
    blocks: [
      { id: 'team-ratings', label: 'Рейтинги команды' },
      { id: 'squad-heatmap', label: 'Тепловая карта состава', minPlan: 'paid' },
      { id: 'stat-compare', label: 'Командная статистика', minPlan: 'paid' },
      { id: 'beeswarm', label: 'Распределение оценок и роли' },
      { id: 'xg', label: 'xG (ожидаемые голы)', minPlan: 'paid' },
      { id: 'pressing', label: 'Прессинг' },
      { id: 'set-pieces', label: 'Стандарты и удары' },
      { id: 'insights', label: 'Ключевые выводы', minPlan: 'paid' },
      { id: 'timeline', label: 'Хроника матча' },
      { id: 'momentum', label: 'Импульс по таймам', minPlan: 'paid' },
      { id: 'half-split', label: 'Динамика по таймам' },
      { id: 'speed-zones', label: 'Физическая нагрузка', minPlan: 'paid' },
      { id: 'formation', label: 'Расстановка' },
      { id: 'breakdowns', label: 'Лидеры матча (голы/пасы/отборы)' },
      { id: 'match-leaders', label: 'Расширенные лидеры матча' },
      { id: 'match-vs-season', label: 'Матч против сезона' },
      { id: 'impact-motm', label: 'Вклад и лучший игрок' },
    ],
  },
  {
    id: 'player',
    label: 'Профиль игрока',
    route: '/players/:playerId',
    icon: '👤',
    // профиль конкретного игрока, но не /players/rating и /players/compare
    match: (p) => /^\/players\/(?!rating$|compare$)[^/]+$/.test(p),
    blocks: [
      { id: 'pizza', label: 'Пицца-чарт' },
      { id: 'season-percentile', label: 'Перцентили сезона', minPlan: 'paid' },
      { id: 'season-profile', label: 'Профиль-радар', minPlan: 'paid' },
      { id: 'dna', label: 'ДНК игрока', minPlan: 'paid' },
      { id: 'overview-info-bio', label: 'Инфо об игроке + биография' },
      { id: 'trend', label: 'Динамика по сезону' },
      { id: 'form', label: 'Форма (последние матчи)' },
      { id: 'role-fit', label: 'Роль и амплуа', minPlan: 'paid' },
      { id: 'attendance', label: 'Посещаемость' },
      { id: 'attack-split', label: 'Атака (детализация)' },
      { id: 'defence-split', label: 'Оборона (детализация)' },
      { id: 'fitness', label: 'Фитнес', minPlan: 'paid' },
      { id: 'match-ratings', label: 'Матч — рейтинги' },
      { id: 'match-advanced', label: 'Матч — продвинутые метрики', minPlan: 'paid' },
      { id: 'match-best-badges', label: 'Матч — лучший в команде' },
      { id: 'match-heatmap', label: 'Матч — тепловая карта', minPlan: 'paid' },
      { id: 'match-speed-zones', label: 'Матч — зоны интенсивности', minPlan: 'paid' },
      { id: 'match-pass-profile', label: 'Матч — профиль передач', minPlan: 'paid' },
      { id: 'match-halves', label: 'Матч — по таймам' },
    ],
  },
  {
    id: 'matches',
    label: 'Матчи (список)',
    route: '/matches',
    icon: '⚽',
    match: (p) => p === '/matches',
    blocks: [
      { id: 'last-match', label: 'Сводка последнего матча' },
      { id: 'team-vs-season', label: 'Командные показатели против сезона' },
      { id: 'squad-heatmap', label: 'Тепловая карта состава', minPlan: 'paid' },
    ],
  },
  // Примечание: /trainings — это список тренировок + модалка посещаемости,
  // отдельных «блоков-графиков» для скрытия там пока нет. Появятся виджеты —
  // добавим страницу сюда.
];

/** Найти страницу реестра по live-pathname. */
export function resolvePage(pathname) {
  return PAGES.find((pg) => pg.match(pathname)) || null;
}

/** Страница реестра по стабильному id. */
export function getPage(pageId) {
  return PAGES.find((pg) => pg.id === pageId) || null;
}

/** Подпись блока (для режима редактирования и хаба); fallback — сам id. */
export function blockLabel(pageId, blockId) {
  const pg = getPage(pageId);
  return pg?.blocks.find((b) => b.id === blockId)?.label || blockId;
}

/** Минимальный тариф блока: 'paid' (скрыт на free) или undefined (доступен всем). */
export function blockMinPlan(pageId, blockId) {
  const pg = getPage(pageId);
  return pg?.blocks.find((b) => b.id === blockId)?.minPlan;
}
