import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  axesOfLine, defaultSharedMetrics, sanitizeMetrics, percentileOf, LINE_SETS,
} from './metrics.js';

/**
 * Видимость показателей — единственное место, где решается, что увидит ребёнок.
 * Поэтому тестируем именно отсечение: чужой ключ, ключ не своего амплуа и мусор
 * не должны просачиваться в кабинет игрока.
 */

test('у каждого амплуа ровно 6 осей, 3 из них главные', () => {
  for (const line of ['GK', 'DEF', 'MID', 'FWD'] as const) {
    const axes = axesOfLine(line);
    assert.equal(axes.length, 6, `${line}: осей должно быть 6`);
    assert.equal(new Set(axes).size, 6, `${line}: оси не должны повторяться`);
    assert.equal(LINE_SETS[line].focus.length, 3, `${line}: главных должно быть 3`);
  }
});

test('по умолчанию открыты три главных показателя амплуа', () => {
  assert.deepEqual(defaultSharedMetrics('FWD'), ['shooting', 'dribbling', 'forwardPlay']);
  // Амплуа не определено — показывать по позиции нечего, но экран не падает.
  assert.deepEqual(defaultSharedMetrics(null), []);
});

test('sanitizeMetrics отсекает всё, чего тренер не мог видеть', () => {
  // Ось чужого амплуа: «игра в воротах» защитнику не показывается.
  assert.deepEqual(sanitizeMetrics(['tackling', 'goalkeeping'], 'DEF'), ['tackling']);
  // Мусор и не-строки игнорируются, порядок сохраняется, дубли схлопываются.
  assert.deepEqual(
    sanitizeMetrics(['duels', 'duels', 42, null, 'нет-такой', 'positioning'], 'DEF'),
    ['duels', 'positioning'],
  );
  // Без амплуа и на не-массиве — пусто, а не исключение.
  assert.deepEqual(sanitizeMetrics(['tackling'], null), []);
  assert.deepEqual(sanitizeMetrics('tackling', 'DEF'), []);
  assert.deepEqual(sanitizeMetrics(undefined, 'MID'), []);
});

test('percentileOf: доля слабее + половина равных', () => {
  assert.equal(percentileOf(5, [1, 2, 3, 4]), 100);   // сильнее всех
  assert.equal(percentileOf(1, [1, 2, 3, 4]), 13);    // (0 + 0.5)/4 = 12.5 → 13
  assert.equal(percentileOf(3, [1, 3, 5]), 50);       // ровно посередине
  // «Полка» одинаковых значений не даёт ни 0, ни 100 — иначе весь состав
  // с одинаковым индексом оказался бы «лучше всех» разом.
  assert.equal(percentileOf(7, [7, 7, 7, 7]), 50);
  // Пустой пул и битое значение — 0, а не NaN в вёрстке.
  assert.equal(percentileOf(5, []), 0);
  assert.equal(percentileOf(Number.NaN, [1, 2]), 0);
});
