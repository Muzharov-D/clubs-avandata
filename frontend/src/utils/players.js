// PG может содержать дубликаты игроков (legacy + FFSPB-sync), у каждого
// один и тот же номер/имя. Поэтому findBy* выбирает «лучшего» из совпадений:
// сначала с фото и id-вида p01-..., потом просто с фото, потом любого.
// Без этого формация показывала инициалы вместо фоток когда FFSPB-дубликат
// без photo_url оказывался первым в массиве.
function pickBest(matches) {
  if (!matches || matches.length === 0) return null;
  if (matches.length === 1) return matches[0];
  // 1) legacy-id (p01-name) с фото
  const legacyWithPhoto = matches.find(
    (p) => typeof p.id === 'string' && p.id.startsWith('p') && !p.id.startsWith('ffspb-') && (p.photo || p.photoUrl),
  );
  if (legacyWithPhoto) return legacyWithPhoto;
  // 2) любой с фото
  const anyWithPhoto = matches.find((p) => p.photo || p.photoUrl);
  if (anyWithPhoto) return anyWithPhoto;
  // 3) legacy-id без фото
  const legacy = matches.find(
    (p) => typeof p.id === 'string' && p.id.startsWith('p') && !p.id.startsWith('ffspb-'),
  );
  return legacy || matches[0];
}

// Map shortName from formation/match-001 ("В. Воронков") -> playerId from players.json.
// Uses lastName + firstName initial. Fallback: search by lastName only.
export function findPlayerByShortName(shortName, playersList) {
  if (!shortName || !playersList) return null;
  // forms: "В. Воронков" or "Воронков В."
  const cleanName = shortName.replace(/\./g, '').trim();
  const parts = cleanName.split(/\s+/).filter(Boolean);
  if (parts.length < 2) return null;
  const a = parts[0];
  const b = parts[1];
  // initial.surname
  const isInitialFirst = a.length === 1;
  const initial = isInitialFirst ? a : b;
  const surname = isInitialFirst ? b : a;
  const surnameLower = surname.toLowerCase();
  const byBoth = playersList.filter(
    (p) =>
      typeof p.lastName === 'string' &&
      p.lastName.toLowerCase() === surnameLower &&
      typeof p.firstName === 'string' &&
      p.firstName.charAt(0).toLowerCase() === initial.toLowerCase(),
  );
  if (byBoth.length) return pickBest(byBoth);
  const bySurname = playersList.filter(
    (p) => typeof p.lastName === 'string' && p.lastName.toLowerCase() === surnameLower,
  );
  return pickBest(bySurname);
}

export function findPlayerByNumber(number, playersList) {
  if (number == null || !playersList) return null;
  const matches = playersList.filter((p) => p.number === number);
  return pickBest(matches);
}

export function getInitials(first, last) {
  const f = (first || '').charAt(0).toUpperCase();
  const l = (last || '').charAt(0).toUpperCase();
  return `${f}${l}`;
}

// «Фамилия И.» — короткое имя для UI где не помещается полное.
// Закусилов А., Татарченко Г., Воронков В.
// Если нет lastName — fallback на полное имя или ''.
export function shortName(first, last) {
  const ln = (last || '').trim();
  const fn = (first || '').trim();
  if (!ln && !fn) return '';
  if (!ln) return fn;
  const initial = fn.charAt(0).toUpperCase();
  return initial ? `${ln} ${initial}.` : ln;
}

// shortName из готового player-объекта или fullName-строки.
// Удобно вызывать на готовом player без необходимости разносить first/last.
export function shortNameFromPlayer(player) {
  if (!player) return '';
  if (player.lastName || player.firstName) {
    return shortName(player.firstName, player.lastName);
  }
  // Fallback: парсим fullName «Артём Закусилов» → «Закусилов А.»
  const parts = String(player.fullName || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '';
  if (parts.length === 1) return parts[0];
  const fn = parts[0];
  const ln = parts.slice(1).join(' ');
  return shortName(fn, ln);
}
