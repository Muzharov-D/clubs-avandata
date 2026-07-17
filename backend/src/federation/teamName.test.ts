import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normTeam, buildClubIndex, resolveTeam, type ClubCard } from './teamName.js';

// Контракт сшивки ФФСПб (имя в таблице) ↔ АванДата (имя в рейтинге).
// Левая колонка — как ФФСПб зовёт команду в таблице, правая — как АванДата в рейтинге.
// Они ДОЛЖНЫ свестись к одному ключу, иначе клуб двоится (баг 2012).
const MUST_JOIN: ReadonlyArray<readonly [string, string]> = [
  ['Звезда (Олимпийские надежды)', 'ФК Звезда 2012'],          // скобочная программа
  ['ФК Динамо-СПб', 'ФК Динамо 2012'],                          // город-квалификатор «-СПб»
  ['Зенит', 'ФК Зенит 2011'],                                   // «ФК» + год
  ['Алмаз-Антей', 'Алмаз Антей 2011'],                          // дефис ↔ пробел
  ['Московская застава - Кристалл', 'Московская застава-Кристалл 2011'], // дефис со/без пробелов
  ['Коломяги (Олимпийские надежды)', 'Коломяги (Олимпийские надежды) 2011'], // скобки с обеих сторон
  ['СШ Кировец Восхождение', 'СШ Кировец Восхождение 2012'],    // СШ сохраняется
  ['СШОР Зенит', 'СШОР Зенит 2011'],                            // СШОР сохраняется
];

// Эти пары — РАЗНЫЕ клубы, их НЕЛЬЗЯ схлопывать в один ключ.
const MUST_NOT_MERGE: ReadonlyArray<readonly [string, string]> = [
  ['Зенит', 'СШОР Зенит'],                                      // базовый клуб ≠ спортшкола
  ['СШ Кировец Восхождение', 'СШОР Зенит'],                     // СШ ≠ СШОР
  ['ФК Динамо 2012', 'Царское Село-Динамо 2012'],               // Динамо ≠ Царское Село-Динамо
  ['ФК Динамо-СПб', 'СШ Петроградского района - Динамо 2011'],  // Динамо ≠ СШ ПР Динамо
  ['ФК Звезда 2012', 'СШ №2 ВО Звезда 2012'],                   // Звезда ≠ СШ №2 ВО Звезда
];

test('пары источников сшиваются в один ключ', () => {
  for (const [ffspb, avandata] of MUST_JOIN) {
    const a = normTeam(ffspb), b = normTeam(avandata);
    assert.equal(a, b, `«${ffspb}» (→${a}) должно равняться «${avandata}» (→${b})`);
    assert.ok(a.length > 0, `ключ «${ffspb}» не должен быть пустым`);
  }
});

test('разные клубы НЕ схлопываются', () => {
  for (const [x, y] of MUST_NOT_MERGE) {
    assert.notEqual(normTeam(x), normTeam(y), `«${x}» и «${y}» не должны иметь одинаковый ключ (${normTeam(x)})`);
  }
});

test('конкретные ключи (фиксация нормализации)', () => {
  assert.equal(normTeam('Звезда (Олимпийские надежды)'), 'звезда');
  assert.equal(normTeam('ФК Динамо-СПб'), 'динамо');
  assert.equal(normTeam('ФК Зенит 2011'), 'зенит');
  assert.equal(normTeam('Алмаз-Антей'), 'алмаз антей');
  assert.equal(normTeam('Московская застава - Кристалл'), 'московская застава кристалл');
  assert.equal(normTeam('СШ Кировец Восхождение'), 'сш кировец восхождение'); // СШ не срезается
  assert.equal(normTeam('СШОР Зенит'), 'сшор зенит');                         // СШОР не срезается
  assert.equal(normTeam('«Зенит»'), 'зенит');                                 // кавычки
  assert.equal(normTeam('Зенит 2012 (Санкт-Петербург)'), 'зенит');            // скобка-город + год
});

test('идемпотентность: normTeam(normTeam(x)) === normTeam(x)', () => {
  for (const name of [...MUST_JOIN.flat(), ...MUST_NOT_MERGE.flat()]) {
    const once = normTeam(name);
    assert.equal(normTeam(once), once, `не идемпотентно на «${name}»`);
  }
});

// ─── resolveTeam: стыковка команды турнира с карточкой клуба ─────────────────

// Карточки клубов из getClubList (как в AvanData): верное написание + рабочий герб.
// «Московская застава - Кристалл» намеренно с префиксом школы — точного ключа НЕТ.
const CARDS: ClubCard[] = [
  { title: 'Алмаз-Антей', logo: 'almaz.png' },
  { title: 'СШ Кировец-Восхождение', logo: 'kirovets.png' },
  { title: 'ФК Зенит', logo: 'zenit.png' },
  { title: 'СШОР Зенит', logo: 'sshor-zenit.png' },
  { title: 'СШОР №1 Московская застава - Кристалл', logo: 'kristall.png' },
];
const IDX = buildClubIndex(CARDS);

test('resolveTeam: точный ключ → написание и герб карточки (реестр роняет дефис и logoUrl)', () => {
  // getTeamsList отдаёт «Алмаз Антей 2011» без дефиса, logoUrl=NULL → берём карточку.
  assert.deepEqual(resolveTeam(IDX, 'Алмаз Антей 2011', null), { name: 'Алмаз-Антей', logo: 'almaz.png' });
  assert.deepEqual(resolveTeam(IDX, 'СШ Кировец Восхождение 2012', null), { name: 'СШ Кировец-Восхождение', logo: 'kirovets.png' });
});

test('resolveTeam: свой герб приоритетнее карточного', () => {
  assert.deepEqual(resolveTeam(IDX, 'Алмаз Антей 2011', 'own.png'), { name: 'Алмаз-Антей', logo: 'own.png' });
});

test('resolveTeam: только ЧАСТИЧНОЕ совпадение → НЕ подставляем (Московская застава)', () => {
  // Карточка — более широкий ярлык «СШОР №1 …»; точного ключа нет → имя из фида как есть.
  const r = resolveTeam(IDX, 'Московская застава-Кристалл 2011', 'feed.png');
  assert.equal(r.name, 'Московская застава-Кристалл 2011');
  assert.equal(r.logo, 'feed.png');
});

test('resolveTeam: разные клубы не путаются (Зенит ≠ СШОР Зенит)', () => {
  // «Зенит» ⊂ «сшор зенит», но подстрочный матч запрещён — только точный ключ.
  assert.equal(resolveTeam(IDX, 'ФК Зенит 2011', null).name, 'ФК Зенит');
  assert.equal(resolveTeam(IDX, 'СШОР Зенит 2011', null).name, 'СШОР Зенит');
  assert.equal(resolveTeam(IDX, 'ФК Зенит 2011', null).logo, 'zenit.png');
  assert.equal(resolveTeam(IDX, 'СШОР Зенит 2011', null).logo, 'sshor-zenit.png');
});

test('resolveTeam: клуба нет в реестре → имя и герб из фида', () => {
  assert.deepEqual(resolveTeam(IDX, 'Родина 2011', 'rodina.png'), { name: 'Родина 2011', logo: 'rodina.png' });
  assert.deepEqual(resolveTeam(IDX, null, null), { name: '', logo: null });
});

// ГЛАВНЫЙ инвариант: подстановка карточки НЕ двигает ключ сшивки (иначе клуб задвоится —
// баг 2012). Совпадение по ключу гарантирует это, тест фиксирует гарантию.
test('resolveTeam НЕ меняет ключ сшивки: normTeam(resolveTeam(...).name) === normTeam(raw)', () => {
  const corpus = [...MUST_JOIN.flat(), ...MUST_NOT_MERGE.flat(),
    'Алмаз Антей 2011', 'СШ Кировец Восхождение 2012', 'Московская застава-Кристалл 2011', 'Родина 2011'];
  for (const name of corpus) {
    assert.equal(normTeam(resolveTeam(IDX, name, null).name), normTeam(name),
      `«${name}»: resolveTeam сдвинул ключ сшивки`);
  }
});

test('buildClubIndex: при коллизии ключа предпочитает карточку с гербом', () => {
  const idx = buildClubIndex([{ title: 'Алмаз-Антей', logo: null }, { title: 'Алмаз Антей', logo: 'x.png' }]);
  assert.equal(idx.get('алмаз антей')?.logo, 'x.png');
});
