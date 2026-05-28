/**
 * Seed: чистит всё (matches/match_players/players/calendar) + сеет фикстуру
 * Зенит U-15 vs СШОР Зенит U-15 (10 тур, 16.05.2026) и составы обеих команд.
 *
 * Команды берутся из БД по age_group=2011 и tenant_id (уже существуют).
 *
 * Запуск:
 *   cd backend && npx tsx src/scripts/seedZenitDerby.ts
 */
import 'dotenv/config';
import { pool } from '../db/client.js';

// ─── Состав ФК Зенит U-15 (с номерами + раунд 1) ──────────────────────────
type P = { num: number | null; first: string; last: string; pos: string; posFull: string; slug: string };

const ZENIT_FK_ROSTER: P[] = [
  // С номерами (из round-1 vs Динамо)
  { num: 5,  first: 'Егор',     last: 'Горяинов',     pos: 'ЦЗ', posFull: 'Центральный защитник', slug: 'goryainov' },
  { num: 9,  first: 'Владислав',last: 'Лисов',        pos: 'ЦН', posFull: 'Центральный нападающий',slug: 'lisov' },
  { num: 10, first: 'Иван',     last: 'Умнов',        pos: 'ЦП', posFull: 'Центральный полузащитник', slug: 'umnov' },
  { num: 14, first: 'Владимир', last: 'Вальков',      pos: 'ЦП', posFull: 'Центральный полузащитник', slug: 'valkov' },
  { num: 18, first: 'Владислав',last: 'Калинкин',     pos: 'ЦЗ', posFull: 'Центральный защитник', slug: 'kalinkin' },
  { num: 19, first: 'Григорий', last: 'Безруков',     pos: 'ПЗ', posFull: 'Правый защитник', slug: 'bezrukov' },
  { num: 29, first: 'Алексей',  last: 'Гайворонский', pos: 'ЦП', posFull: 'Центральный полузащитник', slug: 'gajvoronsky' },
  { num: 34, first: 'Марсель',  last: 'Аралов',       pos: 'ЛВ', posFull: 'Левый вингер', slug: 'aralov' },
  { num: 39, first: 'Артем',    last: 'Фомченков',    pos: 'ЦП', posFull: 'Центральный полузащитник', slug: 'fomchenkov' },
  { num: 43, first: 'Данила',   last: 'Сехин',        pos: 'ЦН', posFull: 'Центральный нападающий', slug: 'sehin' },
  { num: 44, first: 'Даниил',   last: 'Стеркин',      pos: 'ЦЗ', posFull: 'Центральный защитник', slug: 'sterkin' },
  // Без номеров (academy roster fc-zenit.ru)
  { num: null, first: 'Егор',     last: 'Гусев',          pos: 'ВР', posFull: 'Вратарь', slug: 'gusev' },
  { num: null, first: 'Аким',     last: 'Джиоку',         pos: 'ВР', posFull: 'Вратарь', slug: 'dzhioku' },
  { num: null, first: 'Никита',   last: 'Орехов',         pos: 'ВР', posFull: 'Вратарь', slug: 'orekhov' },
  { num: null, first: 'Александр',last: 'Трофимов',       pos: 'ЦЗ', posFull: 'Центральный защитник', slug: 'trofimov' },
  { num: null, first: 'Артём',    last: 'Ежов',           pos: 'ЦЗ', posFull: 'Центральный защитник', slug: 'ezhov' },
  { num: null, first: 'Руслан',   last: 'Будзе',          pos: 'ЦЗ', posFull: 'Центральный защитник', slug: 'budze' },
  { num: null, first: 'Артем',    last: 'Вершинин',       pos: 'ЦЗ', posFull: 'Центральный защитник', slug: 'vershinin' },
  { num: null, first: 'Иван',     last: 'Соглаев',        pos: 'ЦЗ', posFull: 'Центральный защитник', slug: 'soglaev' },
  { num: null, first: 'Андрей',   last: 'Погорелов',      pos: 'ПЗ', posFull: 'Правый защитник', slug: 'pogorelov' },
  { num: null, first: 'Марат',    last: 'Набиуллин',      pos: 'ПЗ', posFull: 'Правый защитник', slug: 'nabiullin' },
  { num: null, first: 'Клим',     last: 'Денисов',        pos: 'ПЗ', posFull: 'Правый защитник', slug: 'denisov-fk' },
  { num: null, first: 'Денис',    last: 'Гиндин',         pos: 'ЛЗ', posFull: 'Левый защитник', slug: 'gindin' },
  { num: null, first: 'Александр',last: 'Стрижаков',      pos: 'ЛЗ', posFull: 'Левый защитник', slug: 'strizhakov' },
  { num: null, first: 'Артем',    last: 'Щекин',          pos: 'ЦН', posFull: 'Центральный нападающий', slug: 'shchekin' },
  { num: null, first: 'Максим',   last: 'Рудачихин',      pos: 'ЦН', posFull: 'Центральный нападающий', slug: 'rudachikhin' },
  { num: null, first: 'Платон',   last: 'Фирсов',         pos: 'ЦН', posFull: 'Центральный нападающий', slug: 'firsov' },
];

// ─── Состав СШОР Зенит U-15 (все 2011 г.р.) ───────────────────────────────
const SSHOR_ROSTER: P[] = [
  { num: null, first: 'Константин',last: 'Архипов',       pos: 'ЦП', posFull: 'Центральный полузащитник', slug: 'arkhipov' },
  { num: null, first: 'Леонид',    last: 'Баряхтар',      pos: 'ПЗ', posFull: 'Правый защитник', slug: 'baryakhtar' },
  { num: null, first: 'Назар',     last: 'Безусенко',     pos: 'ЦН', posFull: 'Центральный нападающий', slug: 'bezusenko' },
  { num: null, first: 'Алексей',   last: 'Гончаров',      pos: 'ВР', posFull: 'Вратарь', slug: 'goncharov' },
  { num: null, first: 'Алексей',   last: 'Гришевский',    pos: 'ЦЗ', posFull: 'Центральный защитник', slug: 'grishevsky' },
  { num: null, first: 'Даниил',    last: 'Денисов',       pos: 'ЦН', posFull: 'Центральный нападающий', slug: 'denisov-sh' },
  { num: null, first: 'Роман',     last: 'Ефимов',        pos: 'ЦП', posFull: 'Центральный полузащитник', slug: 'efimov' },
  { num: null, first: 'Артем',     last: 'Железняков',    pos: 'ЦП', posFull: 'Центральный полузащитник', slug: 'zheleznyakov' },
  { num: null, first: 'Артем',     last: 'Иванов',        pos: 'ЦЗ', posFull: 'Центральный защитник', slug: 'ivanov' },
  { num: null, first: 'Роман',     last: 'Ильичев',       pos: 'ПВ', posFull: 'Правый вингер', slug: 'ilichev' },
  { num: null, first: 'Родион',    last: 'Кетов',         pos: 'ЦП', posFull: 'Центральный полузащитник', slug: 'ketov' },
  { num: null, first: 'Александр', last: 'Климов',        pos: 'ЛЗ', posFull: 'Левый защитник', slug: 'klimov' },
  { num: null, first: 'Илья',      last: 'Краснощек',     pos: 'ЦЗ', posFull: 'Центральный защитник', slug: 'krasnoshchek' },
  { num: null, first: 'Артур',     last: 'Курамагомедов', pos: 'ВР', posFull: 'Вратарь', slug: 'kuramagomedov' },
  { num: null, first: 'Кирилл',    last: 'Липсюк',        pos: 'ЦП', posFull: 'Центральный полузащитник', slug: 'lipsyuk' },
  { num: null, first: 'Арсений',   last: 'Панов',         pos: 'ЛВ', posFull: 'Левый вингер', slug: 'panov' },
  { num: null, first: 'Федор',     last: 'Полин',         pos: 'ЦЗ', posFull: 'Центральный защитник', slug: 'polin' },
  { num: null, first: 'Константин',last: 'Поляков',       pos: 'ПЗ', posFull: 'Правый защитник', slug: 'polyakov' },
  { num: null, first: 'Владислав', last: 'Потапов',       pos: 'ЦН', posFull: 'Центральный нападающий', slug: 'potapov' },
  { num: null, first: 'Никита',    last: 'Почтарев',      pos: 'ЦП', posFull: 'Центральный полузащитник', slug: 'pochtarev' },
  { num: null, first: 'Иван',      last: 'Соловьев',      pos: 'ПВ', posFull: 'Правый вингер', slug: 'solovyov' },
  { num: null, first: 'Егор',      last: 'Узун',          pos: 'ЦП', posFull: 'Центральный полузащитник', slug: 'uzun' },
  { num: null, first: 'Рамазан',   last: 'Эртов',         pos: 'ЦН', posFull: 'Центральный нападающий', slug: 'ertov' },
];

const SEASON = '2025-2026';
const AGE_GROUP = '2011';

// 10 тур ЮФЛ U-15 — суббота 16 мая 2026, домашний для ФК Зенит
const MATCH_DATE = '2026-05-16T13:00:00+03:00';
const VENUE = 'Тренировочная база «Смена», Санкт-Петербург';

async function main() {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');

    // Wipe всё для обоих тенантов (сохраняем teams + tenants + users)
    for (const slug of ['zenit-fk', 'zenit-sshor']) {
      await c.query('DELETE FROM match_players WHERE tenant_id=$1', [slug]);
      await c.query('DELETE FROM matches       WHERE tenant_id=$1', [slug]);
      await c.query('DELETE FROM calendar      WHERE tenant_id=$1', [slug]);
      await c.query('DELETE FROM calendar_meta WHERE tenant_id=$1', [slug]);
      await c.query('DELETE FROM players       WHERE tenant_id=$1', [slug]);
    }
    console.log('[seedDerby] wiped: match_players, matches, calendar, calendar_meta, players');

    // Узнаём team_id для каждого tenant'а
    const { rows: teamRows } = await c.query(
      `SELECT id, tenant_id, name FROM teams
        WHERE tenant_id = ANY($1::text[]) AND age_group=$2`,
      [['zenit-fk', 'zenit-sshor'], AGE_GROUP],
    );
    const teamByTenant: Record<string, { id: string; name: string }> = {};
    for (const t of teamRows) teamByTenant[t.tenant_id] = { id: t.id, name: t.name };
    if (!teamByTenant['zenit-fk'] || !teamByTenant['zenit-sshor']) {
      throw new Error(`teams not found for both tenants (age_group=${AGE_GROUP})`);
    }
    console.log('[seedDerby] teams:', teamByTenant);

    // Players: ФК Зенит
    for (const p of ZENIT_FK_ROSTER) {
      const id = `zfk-${p.slug}`;
      await c.query(
        `INSERT INTO players
           (id, tenant_id, team_id, full_name, first_name, last_name, number, position, position_full)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [id, 'zenit-fk', teamByTenant['zenit-fk']!.id,
         `${p.last} ${p.first}`, p.first, p.last, p.num, p.pos, p.posFull],
      );
    }
    // Players: СШОР Зенит
    for (const p of SSHOR_ROSTER) {
      const id = `zsh-${p.slug}`;
      await c.query(
        `INSERT INTO players
           (id, tenant_id, team_id, full_name, first_name, last_name, number, position, position_full)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [id, 'zenit-sshor', teamByTenant['zenit-sshor']!.id,
         `${p.last} ${p.first}`, p.first, p.last, p.num, p.pos, p.posFull],
      );
    }
    console.log(`[seedDerby] inserted: ${ZENIT_FK_ROSTER.length} ФК Зенит + ${SSHOR_ROSTER.length} СШОР Зенит игроков`);

    // Calendar fixture для обоих тенантов
    const extId = 'yfl-5483466';
    for (const slug of ['zenit-fk', 'zenit-sshor']) {
      await c.query(
        `INSERT INTO calendar
           (tenant_id, age_group, season, ext_match_id, match_date,
            home_team, away_team, is_our_match, venue, round, tournament, source_url)
         VALUES ($1,$2,$3,$4,$5,$6,$7,TRUE,$8,$9,$10,$11)`,
        [slug, AGE_GROUP, SEASON, extId, MATCH_DATE,
         'ФК Зенит U-15', 'СШОР Зенит U-15', VENUE, '10 тур', 'league',
         'https://yflrussia.ru/match/5483466'],
      );
      await c.query(
        `INSERT INTO calendar_meta (tenant_id, age_group, season, title, parser_hint)
         VALUES ($1,$2,$3,$4,$5)`,
        [slug, AGE_GROUP, SEASON, 'ЮФЛ U-15', 'yfl'],
      );
    }
    console.log('[seedDerby] calendar: 10 тур, 16.05.2026, ФК Зенит vs СШОР Зенит — для обоих tenants');

    await c.query('COMMIT');
    console.log('[seedDerby] OK');
  } catch (e) {
    await c.query('ROLLBACK');
    throw e;
  } finally {
    c.release();
    await pool.end();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
