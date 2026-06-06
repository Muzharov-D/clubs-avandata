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
 * @typedef {{ id: string, label: string, hint?: string }} BlockDef
 * @typedef {{ id: string, label: string, route: string, icon?: string,
 *             match: (pathname: string) => boolean, blocks: BlockDef[] }} PageDef
 */

/** @type {PageDef[]} */
export const PAGES = [
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
      { id: 'season-record', label: 'Итог сезона (В-Н-П, форма)' },
      { id: 'team-season-analytics', label: 'Ключевые метрики' },
      { id: 'team-identity', label: 'Стиль игры' },
      { id: 'team-aggregates', label: 'Сводная статистика' },
      { id: 'season-trend', label: 'Тренд формы' },
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
      { id: 'squad-heatmap', label: 'Тепловая карта состава' },
      { id: 'stat-compare', label: 'Командная статистика' },
      { id: 'beeswarm', label: 'Распределение оценок и роли' },
      { id: 'xg', label: 'xG (ожидаемые голы)' },
      { id: 'pressing', label: 'Прессинг' },
      { id: 'timeline', label: 'Хроника матча' },
      { id: 'speed-zones', label: 'Физическая нагрузка' },
      { id: 'formation', label: 'Расстановка' },
      { id: 'match-leaders', label: 'Лидеры матча' },
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
      { id: 'season-percentile', label: 'Перцентили сезона' },
      { id: 'season-profile', label: 'Профиль-радар' },
      { id: 'dna', label: 'ДНК игрока' },
      { id: 'form', label: 'Форма (последние матчи)' },
      { id: 'role-fit', label: 'Роль и амплуа' },
      { id: 'attendance', label: 'Посещаемость' },
      { id: 'attack-split', label: 'Атака (детализация)' },
      { id: 'defence-split', label: 'Оборона (детализация)' },
      { id: 'fitness', label: 'Фитнес' },
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
      { id: 'season-summary', label: 'Информация по сезону' },
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
