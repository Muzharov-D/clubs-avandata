/**
 * Позиции AvanData → группы позиций (утверждено руководством 2026-10-01, docs/GLOSSARY.md).
 *
 * В справочнике AvanData (/player-roles) 21 позиция; системные коды местами не совпадают
 * с названиями (например, код leftMidfielder = «Левый фулбек»), поэтому сопоставляем
 * ТОЛЬКО по названию. Группа — с кем игрок сравнивается (индекс, перцентили, ДНК) и где
 * стоит на доске комплектования (схема 4-3-3):
 *  - атакующие полузащитники (левый/правый/центральный) — одна позиция: сторону аналитики
 *    часто ставят по умолчанию;
 *  - опорные (опорный/левый/правый) — одна позиция;
 *  - фулбеки — к крайним защитникам; «левый/правый полузащитник» — к крайним нападающим;
 *  - левый/правый центральный нападающий — к центральным нападающим.
 */
export type PositionGroup = 'GK' | 'CB' | 'FB' | 'DM' | 'AM' | 'W' | 'ST';

export const GROUP_INFO: Record<PositionGroup, { title: string; peers: string; one: string; line: 'GK' | 'DEF' | 'MID' | 'FWD' }> = {
  GK: { title: 'Вратарь', peers: 'вратарей', one: 'вратарь', line: 'GK' },
  CB: { title: 'Центральный защитник', peers: 'центральных защитников', one: 'центральный защитник', line: 'DEF' },
  FB: { title: 'Крайний защитник', peers: 'крайних защитников', one: 'крайний защитник', line: 'DEF' },
  DM: { title: 'Опорный полузащитник', peers: 'опорных полузащитников', one: 'опорный полузащитник', line: 'MID' },
  AM: { title: 'Атакующий полузащитник', peers: 'атакующих полузащитников', one: 'атакующий полузащитник', line: 'MID' },
  W: { title: 'Крайний нападающий', peers: 'крайних нападающих', one: 'крайний нападающий', line: 'FWD' },
  ST: { title: 'Центральный нападающий', peers: 'центральных нападающих', one: 'центральный нападающий', line: 'FWD' },
};

/** Название позиции AvanData → группа. Порядок проверок важен: «полузащитник» содержит «защитник». */
export function positionGroup(position: string | null | undefined): PositionGroup | null {
  const p = (position ?? '').toLowerCase().trim();
  if (!p) return null;
  if (p.includes('вратар')) return 'GK';
  if (p.includes('опорн')) return 'DM';
  if (p.includes('атакующ')) return 'AM';
  if (p.includes('полузащит')) return 'W';                 // левый/правый полузащитник — край
  if (p.includes('центральный нападающ')) return 'ST';
  if (p.includes('нападающ') || p.includes('форвард')) return 'W';
  if (p.includes('центральный защит')) return 'CB';
  if (p.includes('защитник') || p.includes('фулбек')) return 'FB';
  return null;
}
