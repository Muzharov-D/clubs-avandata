import { createHash } from 'node:crypto';

/**
 * Каноническая идентификация игрока на загрузке отчёта.
 *
 * Корень дублей в старой схеме: id игрока = `sv-{team}-sha1(полное имя)`. Разное
 * написание одного человека («Максим Семёнов» vs «Семёнов Максим», ё vs е) →
 * разный хэш → новая строка при каждом перезаливе. Фото/позиции «слетали», т.к.
 * новый отчёт цеплялся к свежей пустой строке.
 *
 * Здесь — детерминированная идентификация, устойчивая к порядку слов и ё:
 *  - id НОВОГО игрока строится по КАНОНИЧЕСКОМУ КЛЮЧУ ФАМИЛИИ + номеру (а не по
 *    полному имени) → любое написание/порядок даёт тот же id;
 *  - входящий игрок отчёта сперва РЕЗОЛВИТСЯ к уже существующей записи базы
 *    (номер+фамилия → уникальная фамилия → полное имя), и только при отсутствии
 *    совпадения создаётся новая строка.
 *
 * Контракт «база строится из загрузок»: первая загрузка фиксирует игроков и
 * присваивает id, последующие — матчат к этой базе, добавляя лишь новых.
 */

/** Канонический ключ имени: lower, ё→е, без пунктуации, схлопнутые пробелы. */
export function nameKey(
  fullName: string,
  firstName?: string | null,
  lastName?: string | null,
): string {
  const base = firstName && lastName ? `${firstName} ${lastName}` : fullName || '';
  return normToken(base);
}

function normToken(s: string): string {
  return String(s ?? '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[.,]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Русские фамильные суффиксы — помогают выбрать фамильный токен независимо от
// порядка «Имя Фамилия» / «Фамилия Имя». Совпадает с правилом mergePlayerDups.
const SURNAME_RE = /(ов|ев|ёв|ин|ын|ский|ской|цкий|цкой|ко|ук|юк|ич|дзе|ян|швили|их|ых|ой|ая|ова|ева|ина)$/i;

/** Токен-заглушка: голый номер / «№NN» / «U16» — не содержательная часть имени. */
function isPlaceholderToken(t: string): boolean {
  return !t || /^№/.test(t) || /^\d+$/.test(t) || /^u\d{1,3}$/.test(t);
}

/**
 * Канонический ключ ФАМИЛИИ из полного имени. Устойчив к порядку слов и ё.
 * Эвристика: токен с фамильным суффиксом; иначе самый длинный содержательный
 * токен (имена-инициалы короче фамилий). Для пустого/заглушечного имени → ''
 * — такой игрок идентифицируется по НОМЕРУ (заглушку позже добивает реальное имя).
 */
export function surnameKey(fullName: string): string {
  const toks = normToken(fullName).split(' ').filter((t) => t && !isPlaceholderToken(t));
  if (!toks.length) return '';
  if (toks.length === 1) return toks[0]!;
  const surnameTok = toks.find((t) => SURNAME_RE.test(t));
  if (surnameTok) return surnameTok;
  return toks.reduce((a, b) => (b.length > a.length ? b : a));
}

/**
 * Детерминированный id новой записи игрока: фамилия + номер. Номер входит в
 * ключ, чтобы двух однофамильцев под разными № не схлопнуло в одну строку;
 * смена номера тем же игроком отлавливается резолвером (по уникальной фамилии)
 * ДО генерации id, поэтому к новому id это не приводит.
 */
export function canonicalId(teamId: string, sk: string, number: number | null): string {
  const basis = `${sk}|${number ?? ''}`;
  return `sv-${teamId}-${createHash('sha1').update(`${teamId}:${basis}`).digest('hex').slice(0, 10)}`;
}

export interface RosterEntry {
  id: string;
  number: number | null;
  fullName: string;
  firstName?: string | null;
  lastName?: string | null;
  position?: string | null;
}

export interface RosterIndex {
  entries: RosterEntry[];
  byNumSurname: Map<string, RosterEntry>;
  bySurname: Map<string, RosterEntry[]>;
  byNameKey: Map<string, RosterEntry>;
  byNumber: Map<number, RosterEntry>;
}

export function buildRosterIndex(rows: RosterEntry[]): RosterIndex {
  const idx: RosterIndex = {
    entries: [],
    byNumSurname: new Map(),
    bySurname: new Map(),
    byNameKey: new Map(),
    byNumber: new Map(),
  };
  for (const r of rows) indexAdd(idx, r);
  return idx;
}

/** Добавить запись в индекс (idempotent по id — обновляет существующую). */
export function indexAdd(idx: RosterIndex, entry: RosterEntry): void {
  const existing = idx.entries.findIndex((e) => e.id === entry.id);
  if (existing >= 0) idx.entries[existing] = entry;
  else idx.entries.push(entry);

  const sk = surnameKey(entry.fullName);
  if (sk) {
    if (entry.number != null) idx.byNumSurname.set(`${entry.number}|${sk}`, entry);
    const list = idx.bySurname.get(sk) ?? [];
    if (!list.some((e) => e.id === entry.id)) list.push(entry);
    idx.bySurname.set(sk, list);
  }
  const nk = nameKey(entry.fullName, entry.firstName, entry.lastName);
  if (nk) idx.byNameKey.set(nk, entry);
  if (entry.number != null && !idx.byNumber.has(entry.number)) idx.byNumber.set(entry.number, entry);
}

export interface ResolveInput {
  number: number | null;
  fullName: string;
  firstName?: string | null;
  lastName?: string | null;
}

export interface Resolution {
  /** id канонической записи (существующей при matched, новой иначе). null — заглушка без имени. */
  id: string | null;
  matched: boolean;
}

/**
 * Резолв игрока отчёта к существующей базе, иначе — новый детерминированный id.
 *  1. номер + фамилия (точно);
 *  2. фамилия уникальна в команде (страхует смену номера);
 *  3. полное имя (порядок/ё-устойчиво);
 *  4. нет совпадения → новый id по фамилии+номеру (или null, если имя-заглушка).
 */
export function resolvePlayerId(teamId: string, idx: RosterIndex, input: ResolveInput): Resolution {
  const sk = surnameKey(input.fullName);
  const nk = nameKey(input.fullName, input.firstName, input.lastName);
  const num = input.number;

  if (num != null && sk) {
    const hit = idx.byNumSurname.get(`${num}|${sk}`);
    if (hit) return { id: hit.id, matched: true };
  }
  if (sk) {
    const same = idx.bySurname.get(sk);
    if (same && same.length === 1) return { id: same[0]!.id, matched: true };
  }
  if (nk) {
    const hit = idx.byNameKey.get(nk);
    if (hit) return { id: hit.id, matched: true };
  }
  // 5. По номеру — ТОЛЬКО если запись под этим № является заглушкой (нет
  // фамилии): реальное имя добивает её, а не плодит вторую строку. Двух разных
  // игроков с одним № в разное время это НЕ сольёт (у заполненной — фамилия есть).
  if (num != null) {
    const byNum = idx.byNumber.get(num);
    if (byNum && !surnameKey(byNum.fullName)) return { id: byNum.id, matched: true };
  }
  return { id: sk ? canonicalId(teamId, sk, num) : null, matched: false };
}
