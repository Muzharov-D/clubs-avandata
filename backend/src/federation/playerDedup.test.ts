import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normPlayerName, dedupPlayers, type DedupablePlayer } from './playerDedup.js';

const P = (id: number, name: string, birthYear: number | null, club: string, rating: number | null, mp: number): DedupablePlayer =>
  ({ id, name, birthYear, club, rating, mp });

test('normPlayerName: порядок слов неважен, ё=е', () => {
  assert.equal(normPlayerName('Иван Петров'), normPlayerName('Петров Иван'));
  assert.equal(normPlayerName('Артём Жёлтый'), normPlayerName('артем желтый'));
});

test('дубль (одинак. ФИО+г.р., разные id) сливается; рейтинг взвешен по матчам', () => {
  const out = dedupPlayers([
    P(1, 'Иван Петров', 2011, 'ФК А', 600, 2),  // 2 матча по 600 = 1200 очков
    P(2, 'Петров Иван', 2011, 'ФК Б', 800, 8),  // 8 матчей по 800 = 6400 очков
  ]);
  assert.equal(out.length, 1, 'две записи одного человека → одна');
  assert.equal(out[0]!.mp, 10, 'матчи суммируются (2+8)');
  assert.equal(out[0]!.rating, Math.round((1200 + 6400) / 10), 'рейтинг = взвешенное среднее (760)');
  assert.equal(out[0]!.club, 'ФК Б', 'представление — у записи с бОльшим числом матчей');
});

test('разный год рождения ИЛИ разное ФИО — НЕ сливаются', () => {
  const diffYear = dedupPlayers([P(1, 'Иван Петров', 2011, 'A', 600, 5), P(2, 'Иван Петров', 2012, 'B', 600, 5)]);
  assert.equal(diffYear.length, 2, 'разный г.р. → разные люди');
  const diffName = dedupPlayers([P(1, 'Иван Петров', 2011, 'A', 600, 5), P(2, 'Семён Сидоров', 2011, 'B', 600, 5)]);
  assert.equal(diffName.length, 2, 'разное ФИО → разные люди');
});

test('сортировка по рейтингу desc сохраняется', () => {
  const out = dedupPlayers([P(1, 'А А', 2011, 'X', 400, 3), P(2, 'Б Б', 2011, 'X', 800, 3), P(3, 'В В', 2011, 'X', 600, 3)]);
  assert.deepEqual(out.map((p) => p.rating), [800, 600, 400]);
});

test('игроки без рейтинга (mp=0) не ломают слияние', () => {
  const out = dedupPlayers([P(1, 'Иван Петров', 2011, 'A', null, 0), P(2, 'Иван Петров', 2011, 'A', 700, 4)]);
  assert.equal(out.length, 1);
  assert.equal(out[0]!.rating, 700, 'нулевой вклад не сдвигает рейтинг');
  assert.equal(out[0]!.mp, 4);
});
