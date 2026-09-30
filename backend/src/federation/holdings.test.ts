import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HOLDINGS, memberOf, ageTitleOf, outcomeFor, formOf, lineOf, pickXi, type HoldingMatch, type HoldingPlayer } from './holdings.js';

const dinamo = HOLDINGS.find((h) => h.slug === 'dinamo-spb')!;

test('memberOf: обе школы холдинга узнаются в написании обоих источников', () => {
  assert.equal(memberOf(dinamo, 'ФК Динамо 2011')?.label, 'ФК Динамо');          // AvanData
  assert.equal(memberOf(dinamo, 'ФК Динамо-СПб')?.label, 'ФК Динамо');            // ФФСПб
  assert.equal(memberOf(dinamo, 'Царское Село-Динамо 2013')?.label, 'Царское Село-Динамо');
  assert.equal(memberOf(dinamo, 'Царское Село-Динамо ')?.label, 'Царское Село-Динамо'); // хвостовой пробел
});

test('memberOf: чужие «Динамо» в холдинг не попадают', () => {
  assert.equal(memberOf(dinamo, 'СШ Петроградского района - Динамо 2011'), null);
  assert.equal(memberOf(dinamo, 'Динамо-Центр'), null);
  assert.equal(memberOf(dinamo, null), null);
});

test('ageTitleOf: «до N лет» из полного названия, иначе категория', () => {
  assert.equal(ageTitleOf('Первенство … среди команд юношей до 16 лет … — Высшая Лига', 'U16'), 'до 16 лет');
  assert.equal(ageTitleOf('Кубок', 'U16'), 'U16');
});

test('outcomeFor / formOf: итоги только по сыгранным, форма от старого к новому', () => {
  assert.equal(outcomeFor(2, 1, true), 'w');
  assert.equal(outcomeFor(0, 0, true), 'd');
  assert.equal(outcomeFor(0, 3, true), 'l');
  assert.equal(outcomeFor(0, 0, false), null);
  const mk = (i: number, o: HoldingMatch['outcome']): HoldingMatch => ({
    id: i, date: `2026-05-${String(20 - i).padStart(2, '0')}`, tour: i, age: 'U16', division: 'Высшая Лига',
    home: { name: 'a', logo: null, score: 0, isMember: true }, away: { name: 'b', logo: null, score: 0, isMember: false },
    outcome: o, played: o != null,
  });
  // matches идут от новых к старым: [null, w, l, d, w, w, l]
  assert.deepEqual(formOf([mk(0, null), mk(1, 'w'), mk(2, 'l'), mk(3, 'd'), mk(4, 'w'), mk(5, 'w'), mk(6, 'l')]), ['w', 'w', 'd', 'l', 'w']);
});

test('lineOf: роли AvanData раскладываются по линиям', () => {
  assert.equal(lineOf('Вратарь'), 'GK');
  assert.equal(lineOf('Левый фланг защиты'), 'DEF');
  assert.equal(lineOf('Центральный защитник'), 'DEF');
  assert.equal(lineOf('Опорная зона'), 'MID');
  assert.equal(lineOf('Атакующий полузащитник'), 'MID');
  assert.equal(lineOf('Левый фланг атаки'), 'FWD');
  assert.equal(lineOf('Нападающий'), 'FWD');
  assert.equal(lineOf(null), null);
});

test('pickXi: 1-4-3-3, только с рейтингом и ≥2 матчей, лучшие в линии', () => {
  const p = (id: number, position: string, rating: number | null, mp = 3): HoldingPlayer =>
    ({ id, name: `p${id}`, birthYear: 2011, position, rating, mp, photo: null, team: 't', clubKey: 'динамо', clubLabel: 'ФК Динамо', division: 'Высшая Лига' });
  const xi = pickXi([
    p(1, 'Вратарь', 500), p(2, 'Вратарь', 600), p(3, 'Вратарь', 700, 1),
    p(4, 'Центральный защитник', 400), p(5, 'Нападающий', 900), p(6, 'Нападающий', null),
    p(7, 'Опорная зона', 450),
  ]);
  assert.deepEqual(xi.map((l) => [l.line, l.players.map((x) => x.id)]), [['GK', [2]], ['DEF', [4]], ['MID', [7]], ['FWD', [5]]]);
});
