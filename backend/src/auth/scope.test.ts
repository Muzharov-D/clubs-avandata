import { test } from 'node:test';
import assert from 'node:assert/strict';
import { teamWriteScope, callupWriteScope, canReadClubAnalytics } from './scope.js';

// teamWriteScope (матчи/тренировки) ----------------------------------------
test('teamWriteScope: head_coach → любая команда', () => {
  assert.equal(teamWriteScope('head_coach', null), 'all');
});
test('teamWriteScope: team_coach со своей командой → ownTeam', () => {
  assert.deepEqual(teamWriteScope('team_coach', 'legirus-2010'), { ownTeam: 'legirus-2010' });
});
test('teamWriteScope: team_coach без teamId → deny (fail-closed)', () => {
  assert.equal(teamWriteScope('team_coach', null), 'deny');
  assert.equal(teamWriteScope('team_coach', undefined), 'deny');
});
test('teamWriteScope: спортдиректор (read-only) → deny на запись', () => {
  assert.equal(teamWriteScope('sporting_director', 'legirus-2010'), 'deny');
});
test('teamWriteScope: игрок/неизвестная роль → deny', () => {
  assert.equal(teamWriteScope('player', 'legirus-2010'), 'deny');
  assert.equal(teamWriteScope(undefined, null), 'deny');
});

// callupWriteScope (составы на матч) ---------------------------------------
test('callupWriteScope: head_coach → любой возраст', () => {
  assert.equal(callupWriteScope('head_coach', null, 'legirus', '2010'), 'all');
});
test('callupWriteScope: team_coach своей возрастной → ownTeam', () => {
  assert.deepEqual(callupWriteScope('team_coach', 'legirus-2010', 'legirus', '2010'), { ownTeam: 'legirus-2010' });
});
test('callupWriteScope: team_coach чужого возраста → deny', () => {
  assert.equal(callupWriteScope('team_coach', 'legirus-2010', 'legirus', '2011'), 'deny');
});
test('callupWriteScope: team_coach без teamId → deny', () => {
  assert.equal(callupWriteScope('team_coach', null, 'legirus', '2010'), 'deny');
});

// canReadClubAnalytics (сводка/таланты/карта потерь) -----------------------
test('canReadClubAnalytics: club-wide роли — да', () => {
  assert.equal(canReadClubAnalytics('head_coach'), true);
  assert.equal(canReadClubAnalytics('sporting_director'), true);
  assert.equal(canReadClubAnalytics('platform_admin'), true);
});
test('canReadClubAnalytics: игрок и тренер команды — нет', () => {
  assert.equal(canReadClubAnalytics('player'), false);
  assert.equal(canReadClubAnalytics('team_coach'), false);
  assert.equal(canReadClubAnalytics(undefined), false);
});
