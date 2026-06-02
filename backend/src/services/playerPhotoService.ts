/**
 * Заполнение фото игроков (players.photo_url) из ростеров FFSPB/joinsport.
 *
 * У SportVisor-отчёта фото нет — единственный авто-источник — FFSPB API
 * (listTeamPlayers по ext-id команды). Точное имя поля с фото в ответе НЕ
 * подтверждено (нет локальных creds), поэтому URL фото вытаскивается
 * АВТО-ДЕТЕКТОМ (перебор вероятных полей + любой image-URL). Сопоставление
 * игроков — по нормализованному имени (точное → по фамилии).
 *
 * Всё best-effort: при любой ошибке возвращаем пустой результат, синк не валим.
 */
import { listTeamPlayers } from './ffspbApi.js';
import { logger } from '../shared/logger.js';

export interface PhotoEntry {
  photoUrl: string | null;
  extId: string | null;
}
export interface PhotoIndex {
  byName: Map<string, PhotoEntry>;
  byLast: Map<string, PhotoEntry>;
  rosterSize: number;
  sampleKeys: string[];
}
interface Queryable {
  query: (text: string, params?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }>;
}

/** Канонический ключ имени: lower, ё→е, без пунктуации, схлопнутые пробелы. */
export function playerNameKey(fullName: unknown): string {
  return String(fullName ?? '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[.,]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Кандидаты в фамилию: первое и последнее слово (PDF даёт оба порядка). */
function lastTokens(fullName: unknown): string[] {
  const parts = playerNameKey(fullName).split(' ').filter(Boolean);
  if (!parts.length) return [];
  const out = [parts[parts.length - 1]!];
  if (parts.length > 1) out.push(parts[0]!);
  return out;
}

// Хост изображений Наградиона: поле player.photo — имя файла (person….jpg).
// Реальное фото лежит по пути images/normal/m/<file> (JPEG); без сегмента
// normal/m/ сервер отдаёт placeholder «изображение не найдено» (5КБ PNG, но 200).
const NAGRADION_IMG_BASE = 'https://img.nagradion.ru/images/normal/m/';

function isUrl(v: unknown): v is string {
  return typeof v === 'string' && /^https?:\/\//i.test(v);
}
function isImageUrl(v: unknown): v is string {
  return isUrl(v) && /\.(png|jpe?g|webp|gif)(\?|#|$)/i.test(v);
}

/**
 * URL фото игрока FFSPB. Основной кейс — поле `photo` = имя файла Наградиона
 * (строим полный URL). Плюс авто-детект на случай других форм ответа.
 */
export function extractPhoto(p: Record<string, unknown>): string | null {
  // 1) Наградион: photo = «person….jpg» → полный URL.
  const photoFile = p.photo;
  if (typeof photoFile === 'string' && photoFile.trim() && !/^https?:/i.test(photoFile)) {
    return NAGRADION_IMG_BASE + photoFile.trim();
  }
  // 2) Прямые URL-поля (если формат изменится).
  const DIRECT = ['photoSrc', 'photo', 'photoUrl', 'avatar', 'avatarSrc', 'image', 'imageSrc', 'picture', 'pictureSrc'];
  for (const k of DIRECT) if (isUrl(p[k])) return p[k] as string;

  for (const tk of ['thumbnails', 'thumbnail', 'photos', 'images', 'avatars']) {
    const t = p[tk];
    if (t && typeof t === 'object') {
      for (const v of Object.values(t as Record<string, unknown>)) if (isUrl(v)) return v as string;
    }
  }
  // Ключ намекает на фото и значение — URL.
  for (const [k, v] of Object.entries(p)) {
    if (/photo|avatar|image|thumb|pic/i.test(k) && isUrl(v)) return v as string;
  }
  // Последний шанс: любой image-URL.
  for (const v of Object.values(p)) if (isImageUrl(v)) return v as string;
  return null;
}

/** Имя игрока из объекта FFSPB: name | firstName + (surname|lastName). */
function ffspbFullName(p: Record<string, unknown>): string | null {
  if (typeof p.name === 'string' && p.name.trim()) return p.name;
  const fn = typeof p.firstName === 'string' ? p.firstName : '';
  // FFSPB отдаёт фамилию как `surname` (не `lastName`).
  const ln = typeof p.surname === 'string' ? p.surname
    : typeof p.lastName === 'string' ? p.lastName : '';
  const joined = [fn, ln].filter(Boolean).join(' ').trim();
  return joined || null;
}

/** Индекс { имя → фото } по ростеру команды (best-effort, пустой при ошибке). */
export async function buildTeamPhotoIndex(extTeamId: string | number): Promise<PhotoIndex> {
  const byName = new Map<string, PhotoEntry>();
  const byLast = new Map<string, PhotoEntry>();
  let rosterSize = 0;
  let sampleKeys: string[] = [];
  try {
    const players = (await listTeamPlayers(extTeamId)) as Array<Record<string, unknown>>;
    rosterSize = players.length;
    if (players[0]) sampleKeys = Object.keys(players[0]);
    for (const p of players) {
      const full = ffspbFullName(p);
      if (!full) continue;
      const entry: PhotoEntry = { photoUrl: extractPhoto(p), extId: p.id != null ? String(p.id) : null };
      const nk = playerNameKey(full);
      if (nk) byName.set(nk, entry);
      for (const lt of lastTokens(full)) if (lt) byLast.set(lt, entry);
      if (typeof p.lastName === 'string') byLast.set(playerNameKey(p.lastName), entry);
    }
  } catch (e) {
    logger.warn({ extTeamId, err: e instanceof Error ? e.message : String(e) }, '[photos] roster fetch failed');
  }
  return { byName, byLast, rosterSize, sampleKeys };
}

/** Резолв фото игрока: точное имя → по фамилии. */
export function resolvePhoto(fullName: unknown, index: Pick<PhotoIndex, 'byName' | 'byLast'>): PhotoEntry | null {
  const exact = index.byName.get(playerNameKey(fullName));
  if (exact?.photoUrl) return exact;
  for (const lt of lastTokens(fullName)) {
    const hit = index.byLast.get(lt);
    if (hit?.photoUrl) return hit;
  }
  return null;
}

/**
 * Заполняет photo_url игрокам tenant'а (только NULL) по ростерам указанных
 * команд FFSPB. Возвращает диагностику для само-проверки формата.
 */
export async function enrichTenantPhotos(
  conn: Queryable,
  tenantSlug: string,
  extTeamIds: Array<string | number>,
): Promise<{ filled: number; rosterSize: number; sampleKeys: string[]; withPhoto: number }> {
  const merged = { byName: new Map<string, PhotoEntry>(), byLast: new Map<string, PhotoEntry>() };
  let rosterSize = 0;
  let sampleKeys: string[] = [];
  let withPhoto = 0;
  for (const id of [...new Set(extTeamIds.map(String))]) {
    const idx = await buildTeamPhotoIndex(id);
    rosterSize += idx.rosterSize;
    if (!sampleKeys.length) sampleKeys = idx.sampleKeys;
    for (const [k, v] of idx.byName) { merged.byName.set(k, v); if (v.photoUrl) withPhoto++; }
    for (const [k, v] of idx.byLast) merged.byLast.set(k, v);
  }
  if (!merged.byName.size) return { filled: 0, rosterSize, sampleKeys, withPhoto };

  const { rows } = await conn.query(
    `SELECT id, full_name AS "fullName" FROM players WHERE tenant_id = $1 AND photo_url IS NULL`,
    [tenantSlug],
  );
  let filled = 0;
  for (const p of rows) {
    const hit = resolvePhoto(p.fullName, merged);
    if (!hit?.photoUrl) continue;
    await conn.query(
      `UPDATE players
          SET photo_url = $1,
              external_ids = external_ids || jsonb_build_object('ffspb', $2::text)
        WHERE id = $3 AND tenant_id = $4 AND photo_url IS NULL`,
      [hit.photoUrl, hit.extId, p.id, tenantSlug],
    );
    filled++;
  }
  return { filled, rosterSize, sampleKeys, withPhoto };
}

// ============================================================================
// Профиль игрока: позиция + дата рождения из того же ростера FFSPB.
//
// Имена полей позиции/ДР в ответе FFSPB НЕ подтверждены (нет локальных creds) —
// та же ситуация, что была с фото. Поэтому извлечение АВТО-ДЕТЕКТОМ (перебор
// вероятных полей + нормализация значения), а скрипт печатает sampleKeys и
// sampleValues для одно-прогонной диагностики формата.
// ============================================================================

export interface ProfileEntry {
  position: string | null;
  positionFull: string | null;
  birthDate: string | null; // нормализованный YYYY-MM-DD
}

// Достать строковое значение из поля, которое может быть строкой ИЛИ объектом
// ({name|title|fullName|label}) — FFSPB/Hydra иногда отдаёт вложенный ресурс.
function fieldString(v: unknown): string | null {
  if (typeof v === 'string') {
    const s = v.trim();
    // Пропускаем IRI-ссылки вида "/api/positions/3".
    return s && !/^\/api\//.test(s) ? s : null;
  }
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    for (const k of ['name', 'title', 'fullName', 'label', 'value']) {
      if (typeof o[k] === 'string' && (o[k] as string).trim()) return (o[k] as string).trim();
    }
  }
  return null;
}

const POSITION_FIELDS = [
  'positionName', 'positionFull', 'position', 'role', 'roleName', 'amplua',
  'playerPosition', 'gamePosition', 'positionTitle', 'post',
];

/** Полное название позиции игрока FFSPB (например «Левый защитник»). */
export function extractPositionFull(p: Record<string, unknown>): string | null {
  for (const k of POSITION_FIELDS) {
    const s = fieldString(p[k]);
    if (s) return s;
  }
  return null;
}

/** Короткий код позиции из полного названия (best-effort, RU). */
export function shortPosition(full: string | null): string | null {
  if (!full) return null;
  const f = full.toLowerCase();
  if (/вратар|голкип/.test(f)) return 'ВРТ';
  if (/защит|латер|фланг.*обор/.test(f)) return 'ЗАЩ';
  if (/полузащит|опорн|плеймейк|инсайд|вингер/.test(f)) return 'ПЗ';
  if (/напада|форвард|бомбардир/.test(f)) return 'НАП';
  // Уже короткое (ЛЗ/ЦЗ/ЦН и т.п.) — берём как код.
  return full.length <= 4 ? full.toUpperCase() : null;
}

const BIRTH_FIELDS = [
  'birthDate', 'birthday', 'dateOfBirth', 'dob', 'born', 'birth', 'dateBirth', 'birthdate',
];

/** Нормализация даты рождения к YYYY-MM-DD из строки/таймстампа. null если не дата. */
export function normalizeBirthDate(v: unknown): string | null {
  if (v == null) return null;
  // Unix timestamp (FFSPB отдаёт даты матчей как unix-секунды).
  if (typeof v === 'number' || (typeof v === 'string' && /^\d{9,13}$/.test(v))) {
    const n = Number(v);
    const ms = String(v).length >= 13 ? n : n * 1000;
    const d = new Date(ms);
    return plausibleBirth(d) ? iso(d) : null;
  }
  if (typeof v === 'string') {
    const s = v.trim();
    // ISO «1999-01-14...» или «1999-01-14»
    const isoM = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (isoM) { const d = new Date(`${isoM[1]}-${isoM[2]}-${isoM[3]}T00:00:00Z`); return plausibleBirth(d) ? iso(d) : null; }
    // «DD.MM.YYYY» / «DD/MM/YYYY»
    const ru = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/);
    if (ru) { const d = new Date(Date.UTC(+ru[3]!, +ru[2]! - 1, +ru[1]!)); return plausibleBirth(d) ? iso(d) : null; }
  }
  if (v && typeof v === 'object') {
    // Вложенный ресурс { date: '...' } или Hydra-обёртка.
    const inner = (v as Record<string, unknown>).date ?? (v as Record<string, unknown>).value;
    if (inner != null) return normalizeBirthDate(inner);
  }
  return null;
}

function plausibleBirth(d: Date): boolean {
  if (isNaN(d.getTime())) return false;
  const y = d.getUTCFullYear();
  return y >= 1980 && y <= 2025; // академия — юноши, но запас широкий
}
function iso(d: Date): string { return d.toISOString().slice(0, 10); }

/** Извлечь дату рождения игрока FFSPB (авто-детект поля). */
export function extractBirthDate(p: Record<string, unknown>): string | null {
  for (const k of BIRTH_FIELDS) {
    const d = normalizeBirthDate(p[k]);
    if (d) return d;
  }
  return null;
}

/** Кандидаты-значения для диагностики формата (печатает скрипт при 0 совпадений). */
function profileSampleValues(p: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of [...POSITION_FIELDS, ...BIRTH_FIELDS]) {
    if (p[k] !== undefined) out[k] = p[k];
  }
  return out;
}

/**
 * Заполняет players.position / position_full / birth_date (только NULL-поля) по
 * ростерам FFSPB. Сопоставление игроков — как у фото (точное имя → фамилия).
 * Возвращает диагностику для само-проверки формата.
 */
export async function enrichTenantProfiles(
  conn: Queryable,
  tenantSlug: string,
  extTeamIds: Array<string | number>,
): Promise<{
  filledPos: number; filledDob: number; rosterSize: number;
  withPos: number; withDob: number; sampleKeys: string[]; sampleValues: Record<string, unknown>;
}> {
  const byName = new Map<string, ProfileEntry>();
  const byLast = new Map<string, ProfileEntry>();
  let rosterSize = 0, withPos = 0, withDob = 0;
  let sampleKeys: string[] = [];
  let sampleValues: Record<string, unknown> = {};

  for (const id of [...new Set(extTeamIds.map(String))]) {
    let players: Array<Record<string, unknown>> = [];
    try {
      players = (await listTeamPlayers(id)) as Array<Record<string, unknown>>;
    } catch (e) {
      logger.warn({ extTeamId: id, err: e instanceof Error ? e.message : String(e) }, '[profiles] roster fetch failed');
      continue;
    }
    rosterSize += players.length;
    if (!sampleKeys.length && players[0]) {
      sampleKeys = Object.keys(players[0]);
      sampleValues = profileSampleValues(players[0]);
    }
    for (const p of players) {
      const full = ffspbFullName(p);
      if (!full) continue;
      const positionFull = extractPositionFull(p);
      const birthDate = extractBirthDate(p);
      const entry: ProfileEntry = { positionFull, position: shortPosition(positionFull), birthDate };
      if (positionFull) withPos++;
      if (birthDate) withDob++;
      const nk = playerNameKey(full);
      if (nk) byName.set(nk, entry);
      for (const lt of lastTokens(full)) if (lt) byLast.set(lt, entry);
      if (typeof p.surname === 'string') byLast.set(playerNameKey(p.surname), entry);
      else if (typeof p.lastName === 'string') byLast.set(playerNameKey(p.lastName), entry);
    }
  }

  if (!byName.size) return { filledPos: 0, filledDob: 0, rosterSize, withPos, withDob, sampleKeys, sampleValues };

  const resolve = (fullName: unknown): ProfileEntry | null => {
    const exact = byName.get(playerNameKey(fullName));
    if (exact) return exact;
    for (const lt of lastTokens(fullName)) {
      const hit = byLast.get(lt);
      if (hit) return hit;
    }
    return null;
  };

  const { rows } = await conn.query(
    `SELECT id, full_name AS "fullName", position, position_full AS "positionFull", birth_date AS "birthDate"
       FROM players
      WHERE tenant_id = $1 AND (position IS NULL OR position_full IS NULL OR birth_date IS NULL)`,
    [tenantSlug],
  );

  let filledPos = 0, filledDob = 0;
  for (const r of rows) {
    const hit = resolve(r.fullName);
    if (!hit) continue;
    const sets: string[] = [];
    const vals: unknown[] = [];
    let i = 1;
    if (r.position == null && hit.position) { sets.push(`position = $${i++}`); vals.push(hit.position); }
    if (r.positionFull == null && hit.positionFull) { sets.push(`position_full = $${i++}`); vals.push(hit.positionFull); }
    if (r.birthDate == null && hit.birthDate) { sets.push(`birth_date = $${i++}`); vals.push(hit.birthDate); }
    if (!sets.length) continue;
    vals.push(r.id, tenantSlug);
    await conn.query(
      `UPDATE players SET ${sets.join(', ')} WHERE id = $${i++} AND tenant_id = $${i}`,
      vals,
    );
    if (hit.positionFull || hit.position) filledPos++;
    if (r.birthDate == null && hit.birthDate) filledDob++;
  }

  return { filledPos, filledDob, rosterSize, withPos, withDob, sampleKeys, sampleValues };
}
