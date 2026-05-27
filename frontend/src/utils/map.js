// Единая утилита построения URL для Я.Карт.
//
// ВАЖНО: venues.json хранит координаты ПЛОСКО: { lat, lng } — НЕ { coords: { lat, lng } }.
// Если координат нет — возвращаем null и UI не показывает кнопку
// (НЕ делаем text-fallback вида ?text=Локомотив — таких стадионов в России 7,
// маршрут уедет не туда).

function hasCoords(venue) {
  return !!(venue && Number.isFinite(venue.lat) && Number.isFinite(venue.lng));
}

// URL для перехода в Я.Карты «к стадиону».
// Раньше использовали `?rtext=~lat,lng&rtt=auto` (от current location к точке) —
// но при universal-link переходе из браузера в нативное Я.Карты приложение
// параметр rtext часто терялся, app открывался с пустым запросом.
// Сейчас используем простой формат с placemark: app deep-link его сохраняет
// надёжно. Маршрут пользователь строит одним тапом «Поехали» уже в приложении.
export function buildRouteUrl(venue) {
  if (!hasCoords(venue)) return null;
  return `https://yandex.ru/maps/?ll=${venue.lng}%2C${venue.lat}&z=17&pt=${venue.lng}%2C${venue.lat}%2Cpm2rdm`;
}

// URL для ПРОСМОТРА точки на карте (центр + маркер). Используется для
// клика по мини-карте — не сразу строим маршрут, а показываем где это.
export function buildMapViewUrl(venue) {
  if (!hasCoords(venue)) return null;
  return `https://yandex.ru/maps/?ll=${venue.lng},${venue.lat}&z=16&pt=${venue.lng},${venue.lat},pm2rdm`;
}

// URL static-карты для embed-снапшота 600×260 (используется в модалке).
export function buildStaticMapUrl(venue, { w = 600, h = 260, z = 15 } = {}) {
  if (!hasCoords(venue)) return null;
  return `https://static-maps.yandex.ru/1.x/?ll=${venue.lng},${venue.lat}&z=${z}&size=${w},${h}&l=map&pt=${venue.lng},${venue.lat},pm2rdm`;
}

// Нативная deep-link схема Я.Карт: строит маршрут СРАЗУ от текущего
// местоположения до стадиона. В отличие от https://yandex.ru/maps/?rtext=...
// (universal link, теряет параметры при перехвате PWA → нативное приложение),
// схема yandexmaps:// открывает приложение напрямую и параметры сохраняет.
export function buildNativeRouteUrl(venue) {
  if (!hasCoords(venue)) return null;
  return `yandexmaps://build_route_on_map?lat_to=${venue.lat}&lon_to=${venue.lng}`;
}

// Гибрид-открытие маршрута: пробуем нативную схему yandexmaps://, и если
// приложение Я.Карт не установлено (страница осталась видимой через ~1.5с) —
// fallback на web-карту с точкой стадиона (там родитель тапнет «Поехали»).
//
// Как определяем что приложение открылось: при переходе в нативное приложение
// браузерная вкладка уходит в фон → срабатывает visibilitychange / pagehide /
// blur. Если ни одно не сработало — приложения нет, открываем web.
export function openYandexRoute(venue) {
  if (!hasCoords(venue)) return;
  const native = buildNativeRouteUrl(venue);
  const webFallback = buildMapViewUrl(venue);

  let switched = false;
  const markSwitched = () => { switched = true; };

  document.addEventListener('visibilitychange', markSwitched);
  window.addEventListener('pagehide', markSwitched);
  window.addEventListener('blur', markSwitched);

  // Пробуем открыть нативное приложение
  const t0 = Date.now();
  window.location.href = native;

  // Через 1.5 сек проверяем: если вкладка всё ещё активна и в фокусе —
  // приложение не открылось, уводим на web-карту.
  setTimeout(() => {
    document.removeEventListener('visibilitychange', markSwitched);
    window.removeEventListener('pagehide', markSwitched);
    window.removeEventListener('blur', markSwitched);
    // Доп. защита: если прошло заметно больше времени (телефон тормозил
    // на показе системного диалога) — не дёргаем fallback.
    const elapsed = Date.now() - t0;
    if (!switched && document.visibilityState === 'visible' && elapsed < 4000) {
      window.location.href = webFallback;
    }
  }, 1500);
}

export { hasCoords };
