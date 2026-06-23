import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyDivision, matchesDivision, DIVISION_ALIASES } from './division.js';

// Контракт классификации лиг. Левая колонка — как дивизион зовётся в названии турнира
// (включая спонсорские имена сезонов), правая — ожидаемый ключ лиги.
const MUST_CLASSIFY: ReadonlyArray<readonly [string, 'Высшая' | 'Первая']> = [
  ['Высшая лига', 'Высшая'],
  ['Лига Боброва', 'Высшая'],          // спонсорское имя высшей
  ['Высшая лига · 2011', 'Высшая'],
  ['Первая лига', 'Первая'],
  ['Лига Дементьева', 'Первая'],       // спонсорское имя первой
  ['ПЕРВАЯ ЛИГА', 'Первая'],           // регистр не важен
];

// Нижние эшелоны и неизвестное НЕ классифицируются (null) — рейтинг/минуты по ним не считаются.
const MUST_BE_NULL: readonly string[] = ['Вторая лига', 'Третья лига', 'Четвёртая лига', ''];

test('известные названия (и спонсорские) распознаются в свою лигу', () => {
  for (const [title, key] of MUST_CLASSIFY) {
    assert.equal(classifyDivision(title), key, `«${title}» должно классифицироваться как ${key}`);
    assert.ok(matchesDivision(title, key), `matchesDivision(«${title}», ${key}) должно быть true`);
  }
});

test('нижние эшелоны и пустое → null', () => {
  for (const title of MUST_BE_NULL) {
    assert.equal(classifyDivision(title), null, `«${title}» не должно попадать в Высшую/Первую`);
  }
});

test('Высшая ≠ Первая (название одной не совпадает с другой)', () => {
  assert.equal(classifyDivision('Высшая лига'), 'Высшая');
  assert.ok(!matchesDivision('Высшая лига', 'Первая'), 'Высшая не должна матчиться как Первая');
  assert.ok(!matchesDivision('Первая лига', 'Высшая'), 'Первая не должна матчиться как Высшая');
});

// Страж переименования (логика auditDivisions): если в наборе названий сезона нет НИ ОДНОГО,
// сопоставимого с ожидаемой лигой, — это симптом переименования (лига молча пропадёт).
test('страж ловит переименование: лига без совпадений среди названий сезона', () => {
  const renamedSeason = ['Лига Икс', 'Вторая лига', 'Третья лига']; // «Высшая»/«Первая» исчезли
  for (const key of Object.keys(DIVISION_ALIASES)) {
    const matched = renamedSeason.some((t) => matchesDivision(t, key));
    assert.equal(matched, false, `лига «${key}» НЕ должна находиться в переименованном сезоне → страж обязан сработать`);
  }
  // а в нормальном сезоне — находится
  const okSeason = ['Высшая лига', 'Первая лига', 'Вторая лига'];
  for (const key of Object.keys(DIVISION_ALIASES)) {
    assert.ok(okSeason.some((t) => matchesDivision(t, key)), `лига «${key}» должна находиться в нормальном сезоне`);
  }
});
