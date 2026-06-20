import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseTeams } from './onboardParse.js';

test('parseTeams: одна команда без кубка', () => {
  assert.deepEqual(parseTeams('2010:44324:420631'),
    [{ ageGroup: '2010', tournamentId: '44324', ffspbTeamId: '420631', cupId: null }]);
});
test('parseTeams: с кубком', () => {
  assert.deepEqual(parseTeams('2010:44324:420631:50001'),
    [{ ageGroup: '2010', tournamentId: '44324', ffspbTeamId: '420631', cupId: '50001' }]);
});
test('parseTeams: несколько команд + пробелы', () => {
  const r = parseTeams('2010:1:2, 2011:3:4');
  assert.equal(r.length, 2);
  assert.equal(r[1]!.ageGroup, '2011');
});
test('parseTeams: пустая строка → ошибка', () => {
  assert.throws(() => parseTeams(''), /пуст/);
});
test('parseTeams: неполный формат → ошибка', () => {
  assert.throws(() => parseTeams('2010:44324'), /плохой формат/);
});
