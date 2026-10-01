/**
 * Позиции AvanData → группы позиций (утверждено руководством 2026-10-01, docs/GLOSSARY.md).
 *
 * В справочнике AvanData (/player-roles) 21 позиция; системные коды местами не совпадают
 * с названиями (например, код leftMidfielder = «Левый фулбек»), поэтому сопоставляем
 * ТОЛЬКО по названию. Группа — специализация, с кем игрок сравнивается (индекс, перцентили,
 * ДНК) и на какие места схемы 4-3-3 встаёт на доске. Сторона (левый/правый) не важна —
 * её аналитики часто ставят по умолчанию (решение руководства 2026-10-01):
 *  - центральные защитники; крайние защитники (с фулбеками);
 *  - центральные полузащитники — опорные и атакующие вместе (в опорную зону на доске встаёт
 *    тот, у кого сильнее игра в обороне);
 *  - крайние нападающие (с «левым/правым полузащитником»); центральные нападающие.
 */
export type PositionGroup = 'GK' | 'CB' | 'FB' | 'CM' | 'W' | 'ST';
/** Старые группы из сохранённых расчётов (до объединения полузащиты) → текущие. */
export const normGroup = (g: string | null | undefined): PositionGroup | null =>
  g == null ? null : g === 'DM' || g === 'AM' ? 'CM' : (g as PositionGroup);

export const GROUP_INFO: Record<PositionGroup, { title: string; peers: string; one: string; line: 'GK' | 'DEF' | 'MID' | 'FWD' }> = {
  GK: { title: 'Вратарь', peers: 'вратарей', one: 'вратарь', line: 'GK' },
  CB: { title: 'Центральный защитник', peers: 'центральных защитников', one: 'центральный защитник', line: 'DEF' },
  FB: { title: 'Крайний защитник', peers: 'крайних защитников', one: 'крайний защитник', line: 'DEF' },
  CM: { title: 'Центральный полузащитник', peers: 'центральных полузащитников', one: 'центральный полузащитник', line: 'MID' },
  W: { title: 'Крайний нападающий', peers: 'крайних нападающих', one: 'крайний нападающий', line: 'FWD' },
  ST: { title: 'Центральный нападающий', peers: 'центральных нападающих', one: 'центральный нападающий', line: 'FWD' },
};

/** Название позиции AvanData → группа. Порядок проверок важен: «полузащитник» содержит «защитник». */
export function positionGroup(position: string | null | undefined): PositionGroup | null {
  const p = (position ?? '').toLowerCase().trim();
  if (!p) return null;
  if (p.includes('вратар')) return 'GK';
  if (p.includes('опорн') || p.includes('атакующ') || p.includes('центральный полузащит')) return 'CM';
  if (p.includes('полузащит')) return 'W';                 // левый/правый полузащитник — край
  if (p.includes('центральный нападающ')) return 'ST';
  if (p.includes('нападающ') || p.includes('форвард')) return 'W';
  if (p.includes('центральный защит')) return 'CB';
  if (p.includes('защитник') || p.includes('фулбек')) return 'FB';
  return null;
}
