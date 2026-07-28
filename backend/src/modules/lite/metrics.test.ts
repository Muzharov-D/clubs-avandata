import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  AXES, LINE_SETS, axesOfLine, defaultSharedMetrics, sanitizeMetrics,
  percentileOf, perMatch, axisIsFromBase36,
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

test('по умолчанию открыты три главных показателя амплуа', () => {
  assert.deepEqual(defaultSharedMetrics('FWD'), ['attack.shot', 'attack.dribble', 'attack.keyPass']);
  assert.deepEqual(defaultSharedMetrics(null), []);
});

test('sanitizeMetrics отсекает всё, чего тренер не мог видеть', () => {
  // Ось чужого амплуа: сейвы защитнику не показываются.
  assert.deepEqual(sanitizeMetrics(['defence.tackle', 'defence.save'], 'DEF'), ['defence.tackle']);
  // Старые ключи радара из прежней настройки отсеиваются молча.
  assert.deepEqual(sanitizeMetrics(['intensity', 'shooting', 'defence.duel'], 'DEF'), ['defence.duel']);
  // Мусор и не-строки игнорируются, дубли схлопываются, порядок сохраняется.
  assert.deepEqual(
    sanitizeMetrics(['defence.duel', 'defence.duel', 42, null, 'нет-такой', 'defence.clearance'], 'DEF'),
    ['defence.duel', 'defence.clearance'],
  );
  assert.deepEqual(sanitizeMetrics(['defence.tackle'], null), []);
  assert.deepEqual(sanitizeMetrics('defence.tackle', 'DEF'), []);
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

test('percentileOf: доля слабее + половина равных', () => {
  assert.equal(percentileOf(5, [1, 2, 3, 4]), 100);
  assert.equal(percentileOf(1, [1, 2, 3, 4]), 13);   // (0 + 0.5)/4 = 12.5 → 13
  assert.equal(percentileOf(3, [1, 3, 5]), 50);
  // «Полка» одинаковых значений не даёт ни 0, ни 100.
  assert.equal(percentileOf(7, [7, 7, 7, 7]), 50);
  assert.equal(percentileOf(5, []), 0);
  assert.equal(percentileOf(Number.NaN, [1, 2]), 0);
});
