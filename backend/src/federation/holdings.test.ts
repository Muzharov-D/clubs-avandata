import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HOLDINGS, memberOf, ageTitleOf, outcomeFor, formOf, lineOf, pickXi, ffIdOf, type HoldingMatch, type HoldingPlayer } from './holdings.js';
import { tableFromMatches, normalizeMatch, findTeam, type FfMatch } from './ffspbLive.js';

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
    outcome: o, played: o != null, avId: i, ffId: null, technical: false,
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

test('ffIdOf: id матча ФФСПб из ссылки AvanData', () => {
  assert.equal(ffIdOf({ ffspbMatchIdInfo: { inner: 1045, outter: '/api/matches/3845578' } }), 3845578);
  assert.equal(ffIdOf({ ffspbMatchIdInfo: null }), null);
  assert.equal(ffIdOf({}), null);
});

test('normalizeMatch: done=4 — результат, done=1 — счёта нет', () => {
  const base = { id: 1, stageId: 81781, tourId: 3, publicDate: '2026-05-20T16:30:00+03:00', host: { id: 10, name: 'ФК Динамо-СПб', logoSrc: 'x' }, guest: { id: 11, name: 'ФК Зенит' } };
  const done = normalizeMatch({ ...base, done: 4, resultHost: 2, resultGuest: 1 })!;
  assert.equal(done.done, true); assert.equal(done.hs, 2); assert.equal(done.as, 1); assert.equal(done.home.logo, 'x');
  const todo = normalizeMatch({ ...base, done: 1, resultHost: null, resultGuest: null })!;
  assert.equal(todo.done, false); assert.equal(todo.hs, null);
  assert.equal(normalizeMatch({ id: 5 }), null);
});

test('tableFromMatches: очки, разница, личные встречи среди равных, только своя стадия', () => {
  const t = (id: number, name: string): FfMatch['home'] => ({ id, name, logo: null, clubId: null });
  const A = t(1, 'А'), B = t(2, 'Б'), C = t(3, 'В'), Z = t(9, 'Чужая');
  const m = (id: number, home: FfMatch['home'], away: FfMatch['home'], hs: number | null, as: number | null, stageId = 100): FfMatch =>
    ({ id, stageId, tour: 1, date: '2026-05-01T00:00:00.000Z', home, away, hs, as, done: hs != null, technical: false });
  const rows = tableFromMatches([
    m(1, A, B, 1, 0),      // А 3 очка
    m(2, B, C, 2, 2),      // Б 1, В 1
    m(3, C, A, 3, 0),      // В 4 (3+1), А 3
    m(4, A, C, null, null),// не сыгран
    m(5, Z, A, 9, 0, 200), // другая стадия — игнор
  ], 100);
  assert.deepEqual(rows.map((r) => [r.name, r.played, r.points, r.goalDiff]), [['В', 2, 4, 3], ['А', 2, 3, -2], ['Б', 2, 1, -1]]);
  // равные очки → личная встреча решает: Б и В по 4 (В выиграла у Б)
  const rows2 = tableFromMatches([m(1, B, C, 0, 1), m(2, C, A, 0, 2), m(3, A, B, 0, 3), m(4, B, A, 1, 0)], null);
  // Б: 3+3=6, А: 3, В: 3 — А и В равны, В выиграла у... нет матча А-В со счётом в пользу В; А выиграла у В → А выше
  assert.deepEqual(rows2.map((r) => [r.name, r.points]), [['Б', 6], ['А', 3], ['В', 3]]);
  assert.equal(findTeam(rows2.length ? [m(1, B, C, 0, 1)] : [], 'в')?.team.name, 'В');
});
