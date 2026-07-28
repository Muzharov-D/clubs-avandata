import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  AXES, LINE_SETS, axesOfLine, defaultLineSet, sanitizeLineSet, sanitizeMetrics,
  percentileOf, perMatch, axisIsFromBase36, MIN_AXES, MAX_AXES, MAX_FOCUS,
} from './metrics.js';
import { BASE36, BASE36_SV_KEYS, statAt } from './base36.js';

const LINES = ['GK', 'DEF', 'MID', 'FWD'] as const;

/**
 * Кабинет Lite обязан стоять на базовых 36. Владелец поймал живьём, что шестой
 * осью у всех амплуа стояла «Интенсивность», которой среди 36 нет вовсе. Эти
 * тесты держат границу набора, чтобы такое не вернулось.
 */

test('в таблице ровно 36 базовых показателей', () => {
  assert.equal(BASE36.length, 36);
});

test('каждая ось кабинета стоит на одном из 36', () => {
  for (const key of Object.keys(AXES)) {
    assert.ok(axisIsFromBase36(key), `ось ${key} не найдена в таблице базовых 36`);
    assert.ok(BASE36_SV_KEYS.has(key), `ключ ${key} не из словаря соответствий`);
  }
});

test('трекинговой физики в осях нет — её нет среди 36', () => {
  // «Интенсивность» и «Объём бега» — сводные индексы SportVisor, не события.
  for (const key of Object.keys(AXES)) {
    assert.ok(!key.startsWith('fitness.'), `${key}: физика в кабинет не идёт`);
  }
  for (const bad of ['intensity', 'distance', 'fitness.intenseRunning', 'fitness.totalDistance']) {
    assert.equal(axisIsFromBase36(bad) && !!AXES[bad], false, `${bad} не должен быть осью`);
  }
});

test('у каждого амплуа ровно 6 осей, 3 из них главные, у всех есть подпись', () => {
  for (const line of LINES) {
    const axes = axesOfLine(line);
    assert.equal(axes.length, 6, `${line}: осей должно быть 6`);
    assert.equal(new Set(axes).size, 6, `${line}: оси не должны повторяться`);
    assert.equal(LINE_SETS[line].focus.length, 3, `${line}: главных должно быть 3`);
    for (const key of axes) {
      assert.ok(AXES[key]?.label, `${line}: у оси ${key} нет подписи`);
      assert.ok(AXES[key]?.hint, `${line}: у оси ${key} нет пояснения`);
    }
  }
});

test('умолчание амплуа — шесть осей, три главных', () => {
  const set = defaultLineSet('FWD');
  assert.deepEqual(set.focus, ['attack.shot', 'attack.dribble', 'attack.keyPass']);
  assert.equal(set.axes.length, 6);
});

test('набор от тренера проверяется каталогом и границами', () => {
  const базовый = ['attack.shot', 'defence.tackle', 'defence.duel', 'attack.pass'];

  assert.deepEqual(sanitizeLineSet(базовый, ['attack.shot']), {
    axes: базовый,
    focus: ['attack.shot'],
  });

  // Главные не выбраны — берём первые три: пустой фокус оставил бы и пиццу без
  // акцентов, и игрока без открытых по умолчанию показателей.
  assert.deepEqual(sanitizeLineSet(базовый, [])?.focus,
    ['attack.shot', 'defence.tackle', 'defence.duel']);

  // Мусор и неизвестные ключи вылетают, дубли схлопываются.
  assert.deepEqual(
    sanitizeLineSet(
      ['attack.shot', 'attack.shot', 'intensity', 42, 'defence.tackle', 'defence.duel', 'attack.pass'],
      null,
    )?.axes,
    базовый,
  );

  // Слишком мало и слишком много — отказ, а не тихая починка: тренер должен
  // увидеть, что набор не принят.
  assert.equal(sanitizeLineSet(['attack.shot', 'defence.tackle'], []), null);
  assert.equal(sanitizeLineSet(Object.keys(AXES), []), null);
  assert.equal(sanitizeLineSet('не массив', []), null);

  // Главных больше предела — тоже отказ.
  const пять = ['attack.shot', 'defence.tackle', 'defence.duel', 'attack.pass', 'defence.save'];
  assert.equal(sanitizeLineSet(пять, пять), null);
  assert.ok(MIN_AXES < MAX_AXES && MAX_FOCUS < MAX_AXES);
});

test('sanitizeMetrics отсекает всё, чего нет в наборе амплуа', () => {
  const набор = ['defence.tackle', 'defence.duel', 'defence.clearance'];
  assert.deepEqual(sanitizeMetrics(['defence.tackle', 'defence.save'], набор), ['defence.tackle']);
  // Старые ключи радара из прежней настройки отсеиваются молча.
  assert.deepEqual(sanitizeMetrics(['intensity', 'shooting', 'defence.duel'], набор), ['defence.duel']);
  assert.deepEqual(
    sanitizeMetrics(['defence.duel', 'defence.duel', 42, null, 'нет-такой', 'defence.clearance'], набор),
    ['defence.duel', 'defence.clearance'],
  );
  assert.deepEqual(sanitizeMetrics(['defence.tackle'], []), []);
  assert.deepEqual(sanitizeMetrics('defence.tackle', набор), []);
});

test('statAt разворачивает compound-объекты SportVisor', () => {
  // Счётчики приходят объектом {total, successful} — читая только `value`,
  // кабинет показывал «Удары 0» игроку, у которого 16 ударов за шесть матчей.
  const stats = {
    attack: { shot: { total: 4, successful: 1 }, keyPass: 3, dribble: { total: 5, successful: 2 } },
    defence: { tackle: { successful: 2, total: 6 }, save: 0 },
  };
  assert.equal(statAt(stats, 'attack.shot', 'total'), 4);       // попытки
  assert.equal(statAt(stats, 'attack.shot'), 1);                // удавшиеся
  assert.equal(statAt(stats, 'attack.dribble', 'total'), 5);
  assert.equal(statAt(stats, 'attack.keyPass'), 3);             // простое число
  assert.equal(statAt(stats, 'defence.tackle'), 2);
  assert.equal(statAt(stats, 'defence.save'), 0);
  assert.equal(statAt(stats, 'defence.нетТакого'), 0);
  assert.equal(statAt(null, 'attack.shot'), 0);
  assert.equal(statAt(stats, 'кривой-путь'), 0);
});

test('попыточные оси считают попытки, остальные — удавшееся', () => {
  // Удары и обводки — активность: тренеру важно, что игрок пробовал.
  assert.equal(AXES['attack.shot']?.mode, 'total');
  assert.equal(AXES['attack.dribble']?.mode, 'total');
  // Вынос либо состоялся, либо нет — поле successful у него не заполняют.
  assert.equal(AXES['defence.clearance']?.mode, 'total');
  // Отбор и передача — только удавшиеся: отобрал, а не «пытался отобрать».
  assert.equal(AXES['defence.tackle']?.mode, undefined);
  assert.equal(AXES['attack.pass']?.mode, undefined);
});

test('perMatch — среднее за матч, а не сумма за сезон', () => {
  // Сумма сделала бы лидером того, кто просто чаще выходил.
  assert.equal(perMatch(12, 6), 2);
  assert.equal(perMatch(5, 2), 2.5);
  assert.equal(perMatch(0, 6), 0);
  assert.equal(perMatch(7, 0), 0);   // матчей нет — не делим на ноль
});

test('у осей «меньше — лучше» шкала перевёрнута', () => {
  // Фолов больше всех → слайс должен быть КОРОТКИМ, иначе длина читается
  // наоборот и худший по дисциплине выглядит лучшим.
  assert.equal(percentileOf(5, [1, 2, 3, 4]), 100);
  assert.equal(percentileOf(5, [1, 2, 3, 4], true), 0);
  assert.equal(percentileOf(1, [1, 2, 3, 4], true), 87);
});

test('percentileOf: доля слабее + половина равных', () => {
  assert.equal(percentileOf(5, [1, 2, 3, 4]), 100);
  assert.equal(percentileOf(1, [1, 2, 3, 4]), 13);   // (0 + 0.5)/4 = 12.5 → 13
  assert.equal(percentileOf(3, [1, 3, 5]), 50);
  // «Полка» одинаковых значений не даёт ни 0, ни 100.
  assert.equal(percentileOf(7, [7, 7, 7, 7]), 50);
  assert.equal(percentileOf(5, []), 0);
  assert.equal(percentileOf(Number.NaN, [1, 2]), 0);
});
