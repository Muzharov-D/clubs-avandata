import { test } from 'node:test';
import assert from 'node:assert/strict';
import { holdingAccessExpired } from './holdings.js';

// Пилотный доступ Динамо: до 9 октября 2026, 9:00 МСК (= 06:00 UTC).
test('доступ Динамо открыт до 9 октября 9:00 МСК и закрыт с этого момента', () => {
  assert.equal(holdingAccessExpired('dinamo-spb', Date.parse('2026-10-09T05:59:59Z')), false);
  assert.equal(holdingAccessExpired('dinamo-spb', Date.parse('2026-10-09T06:00:00Z')), true);
  assert.equal(holdingAccessExpired('dinamo-spb', Date.parse('2026-10-10T00:00:00Z')), true);
});

test('без холдинга или без срока — не истекает', () => {
  assert.equal(holdingAccessExpired(null), false);
  assert.equal(holdingAccessExpired('no-such-holding', Date.parse('2030-01-01T00:00:00Z')), false);
});
