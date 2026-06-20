import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lossQuarters, median } from './lossMapMath.js';

test('median: нечётная длина', () => assert.equal(median([3, 1, 2]), 2));
test('median: пусто → 0', () => assert.equal(median([]), 0));

test('lossQuarters: пусто → hasData=false, 4 квартала с метками Q1..Q4', () => {
  const r = lossQuarters([]);
  assert.equal(r.hasData, false);
  assert.equal(r.roster, 0);
  assert.equal(r.byQuarter.length, 4);
  assert.equal(r.byQuarter[0]!.roster, 0);
  assert.equal(r.byQuarter[0]!.q, 1);
  assert.equal(r.byQuarter[3]!.q, 4);
});

test('lossQuarters: buried<15% и contrib≥50% по квартилю', () => {
  const pts = [
    { q: 3, pct: 0.05, name: 'A', team: 'T' },
    { q: 3, pct: 0.10, name: 'B', team: 'T' },
    { q: 0, pct: 0.80, name: 'C', team: 'T' },
  ];
  const r = lossQuarters(pts);
  assert.equal(r.byQuarter[3]!.roster, 2);
  assert.equal(r.byQuarter[3]!.buried15, 100); // оба <15%
  assert.equal(r.byQuarter[0]!.contrib50, 100);
  assert.equal(r.byQuarter[0]!.medianPct, 80);
});

test('lossQuarters: примеры — только Q4 <15%, по возрастанию, максимум 6', () => {
  const pts = Array.from({ length: 8 }, (_, i) => ({ q: 3, pct: 0.01 * (i + 1), name: `P${i}`, team: 'T' }));
  const r = lossQuarters(pts);
  assert.equal(r.examplesBuried.length, 6);       // капается на 6
  assert.equal(r.examplesBuried[0]!.pct, 1);      // 0.01 → 1%, самый низкий первым
});

test('lossQuarters: medianPct округляется (чётная длина → верхний средний)', () => {
  const r = lossQuarters([
    { q: 0, pct: 0.333, name: 'A', team: 'T' },
    { q: 0, pct: 0.667, name: 'B', team: 'T' },
  ]);
  assert.equal(r.byQuarter[0]!.medianPct, 67); // median = 0.667 → 67
});
