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
