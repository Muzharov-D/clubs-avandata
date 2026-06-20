import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeMinutes, idTail } from './participationMath.js';

// p(id, bench, {replaceMin, replacedBy}) — одно участие в формате FFSPB.
const p = (id: number, bench: number | boolean, opts: Record<string, unknown> = {}) =>
  ({ request: `/api/players/${id}`, bench, ...opts });

test('idTail: из IRI-строки, из {@id}, из мусора/null', () => {
  assert.equal(idTail('/api/players/42'), 42);
  assert.equal(idTail({ '@id': '/api/teams/7' }), 7);
  assert.equal(idTail(null), null);
  assert.equal(idTail('нет числа'), null);
});

test('computeMinutes: стартер играет весь матч (70′)', () => {
  assert.equal(computeMinutes([p(1, 0)], 4200).get(1), 70);
});

test('computeMinutes: стартер при 90′-матче играет 90', () => {
  assert.equal(computeMinutes([p(1, 0)], 5400).get(1), 90);
});

test('computeMinutes: стартера заменили на 30′ — вышедший доигрывает 40′', () => {
  const m = computeMinutes([p(1, 0, { replaceMin: 30, replacedBy: '/api/players/2' }), p(2, 1)], 4200);
  assert.equal(m.get(1), 30); // стартер ушёл на 30'
  assert.equal(m.get(2), 40); // запасной вышел: 70 − 30
});

test('computeMinutes: запасной без выхода = 0', () => {
  assert.equal(computeMinutes([p(1, 0), p(9, 1)], 4200).get(9), 0);
});

test('computeMinutes: bench как boolean true → запас', () => {
  assert.equal(computeMinutes([p(1, true)], 4200).get(1), 0);
});

test('computeMinutes: нет длины матча → дефолт 70′', () => {
  assert.equal(computeMinutes([p(1, 0)], undefined).get(1), 70);
});

test('computeMinutes: replaceMin больше длины — капается на L', () => {
  assert.equal(computeMinutes([p(1, 0, { replaceMin: 200, replacedBy: '/api/players/2' })], 4200).get(1), 70);
});

test('computeMinutes: пустой вход → пустая карта', () => {
  assert.equal(computeMinutes([], 4200).size, 0);
});
