/**
 * Применяет ТОЛЬКО YFL-фото (st.joinsport.io) для ФК Зенит U-15 и СШОР Зенит U-15.
 *
 * Источник: yflrussia.ru, тур 1060908, application pages обеих команд.
 * URL-паттерн: https://st.joinsport.io/player/<yflId>/photo/<hash>_640x640.png
 *
 * Действия:
 *   1. UPDATE photo_url = YFL для тех, кто есть на YFL с реальным фото
 *      → 11 ФК Зенит (из моего seed) + 2 СШОР Зенит
 *   2. UPDATE photo_url = NULL для остальных в seed → PlayerPhoto fallback на инициалы
 *      → 16 ФК Зенит академиков (нет на YFL) + 21 СШОР без аватара
 *   3. INSERT 10 новых ФК Зенит игроков, которые есть на YFL, но не в seed
 *      → Абу Хаграс, Агеев, Долгодуш, Зайцев, Изюмский, Липянский, Семак, Трошин,
 *        Храбрый, Яковенко
 *   4. INSERT 3 ФК Зенит без фото (Ефимов, Лебедев, Усачев — на YFL без аватара)
 *
 * Также записываем YFL playerYflId в external_ids.yfl для аудит-следа.
 *
 * Запуск: cd backend && npx tsx src/scripts/applyYflPhotos.ts
 */
import 'dotenv/config';
import { pool } from '../db/client.js';

// ─── ФК Зенит U-15: имеющиеся seed-игроки с YFL фото ──────────────────────
const FK_PHOTOS: Array<{ id: string; yflId: string; url: string }> = [
  { id: 'zfk-aralov',      yflId: '10277651', url: 'https://st.joinsport.io/player/10277651/photo/69a8866f577d7_640x640.png' },
  { id: 'zfk-bezrukov',    yflId: '10277647', url: 'https://st.joinsport.io/player/10277647/photo/69a885638e57f_640x640.png' },
  { id: 'zfk-valkov',      yflId: '10274260', url: 'https://st.joinsport.io/player/10274260/photo/69a885710d34d_640x640.png' },
  { id: 'zfk-gajvoronsky', yflId: '10274268', url: 'https://st.joinsport.io/player/10274268/photo/69a886a9e2b21_640x640.png' },
  { id: 'zfk-goryainov',   yflId: '10274266', url: 'https://st.joinsport.io/player/10274266/photo/69a88631e3b42_640x640.png' },
  { id: 'zfk-kalinkin',    yflId: '10277650', url: 'https://st.joinsport.io/player/10277650/photo/69a885b9c3e84_640x640.png' },
  { id: 'zfk-lisov',       yflId: '10274263', url: 'https://st.joinsport.io/player/10274263/photo/69a885d026fae_640x640.png' },
  { id: 'zfk-sehin',       yflId: '10274272', url: 'https://st.joinsport.io/player/10274272/photo/69a887534169c_640x640.png' },
  { id: 'zfk-sterkin',     yflId: '10277653', url: 'https://st.joinsport.io/player/10277653/photo/69a886ea19853_640x640.png' },
  { id: 'zfk-umnov',       yflId: '10274264', url: 'https://st.joinsport.io/player/10274264/photo/69a885e291193_640x640.png' },
  { id: 'zfk-fomchenkov',  yflId: '8975688',  url: 'https://st.joinsport.io/player/8975688/photo/69a88664d8142_640x640.png' },
];

// ─── СШОР Зенит U-15: только 2 имеют реальное фото на YFL ────────────────
const SH_PHOTOS: Array<{ id: string; yflId: string; url: string }> = [
  { id: 'zsh-baryakhtar', yflId: '9189040', url: 'https://st.joinsport.io/player/9189040/photo/68112a2709b4d_640x640.jpg' },
  { id: 'zsh-potapov',    yflId: '9563345', url: 'https://st.joinsport.io/player/9563345/photo/69a89446b1e3d_640x640.png' },
];

// ─── ФК Зенит: новые YFL-зарегистрированные, которых не было в seed ──────
type NewP = { slug: string; first: string; last: string; pos: string; posFull: string; yflId: string; photo: string | null };
const FK_NEW: NewP[] = [
  { slug: 'abu-hagras',  first: 'Рашид',     last: 'Абу Хаграс',  pos: 'ЦП', posFull: 'Центральный полузащитник', yflId: '10274267', photo: 'https://st.joinsport.io/player/10274267/photo/69a8867bd584f_640x640.png' },
  { slug: 'ageev',       first: 'Александр', last: 'Агеев',       pos: 'ЦЗ', posFull: 'Центральный защитник',     yflId: '10274259', photo: 'https://st.joinsport.io/player/10274259/photo/69a8853b903a8_640x640.png' },
  { slug: 'dolgodush',   first: 'Макар',     last: 'Долгодуш',    pos: 'ЦП', posFull: 'Центральный полузащитник', yflId: '10277655', photo: 'https://st.joinsport.io/player/10277655/photo/69a88744a86eb_640x640.png' },
  { slug: 'zaitsev',     first: 'Никита',    last: 'Зайцев',      pos: 'ВР', posFull: 'Вратарь',                  yflId: '10274261', photo: 'https://st.joinsport.io/player/10274261/photo/69a885826c6a2_640x640.png' },
  { slug: 'izyumsky',    first: 'Родион',    last: 'Изюмский',    pos: 'ВР', posFull: 'Вратарь',                  yflId: '10274271', photo: 'https://st.joinsport.io/player/10274271/photo/69a887393fbd7_640x640.png' },
  { slug: 'lipyansky',   first: 'Александр', last: 'Липянский',   pos: 'ЦЗ', posFull: 'Центральный защитник',     yflId: '10274262', photo: 'https://st.joinsport.io/player/10274262/photo/69a885bf5f7ea_640x640.png' },
  { slug: 'semak',       first: 'Савва',     last: 'Семак',       pos: 'ЦН', posFull: 'Центральный нападающий',   yflId: '10274270', photo: 'https://st.joinsport.io/player/10274270/photo/69a886fc1a61f_640x640.png' },
  { slug: 'troshin',     first: 'Михаил',    last: 'Трошин',      pos: 'ЦП', posFull: 'Центральный полузащитник', yflId: '10277652', photo: 'https://st.joinsport.io/player/10277652/photo/69a886b5701cd_640x640.png' },
  { slug: 'khrabry',     first: 'Илья',      last: 'Храбрый',     pos: 'ЦН', posFull: 'Центральный нападающий',   yflId: '10274265', photo: 'https://st.joinsport.io/player/10274265/photo/69a8861b86d26_640x640.png' },
  { slug: 'yakovenko',   first: 'Данила',    last: 'Яковенко',    pos: 'ЦЗ', posFull: 'Центральный защитник',     yflId: '10274269', photo: 'https://st.joinsport.io/player/10274269/photo/69a886e02a65e_640x640.png' },
  // YFL-зарегистрированные без аватара
  { slug: 'efimov-fk',   first: 'Владислав', last: 'Ефимов',      pos: 'ПЗ', posFull: 'Правый защитник',          yflId: '10357096', photo: null },
  { slug: 'lebedev',     first: 'Максим',    last: 'Лебедев',     pos: 'ЦП', posFull: 'Центральный полузащитник', yflId: '10330602', photo: null },
  { slug: 'usachev',     first: 'Матвей',    last: 'Усачев',      pos: 'ЦЗ', posFull: 'Центральный защитник',     yflId: '',         photo: null },
];

async function main() {
  // 1) UPDATE имеющиеся ФК Зенит — заменяем NagradioN на YFL для совпавших, NULL для остальных
  const fkKeep = new Set(FK_PHOTOS.map((p) => p.id));
  for (const p of FK_PHOTOS) {
    const r = await pool.query(
      `UPDATE players
          SET photo_url = $1,
              external_ids = COALESCE(external_ids, '{}'::jsonb) || jsonb_build_object('yfl', $2::text)
        WHERE id = $3`,
      [p.url, p.yflId, p.id],
    );
    console.log(`  ФК Зенит ✓ ${p.id} → YFL/${p.yflId} (${r.rowCount} row)`);
  }
  // Остальные ФК Зенит (академики, нет на YFL) — обнуляем фото
  const fkNullRes = await pool.query(
    `UPDATE players SET photo_url = NULL
       WHERE tenant_id = 'zenit-fk' AND id NOT IN (${[...fkKeep].map((_, i) => `$${i + 1}`).join(',')})`,
    [...fkKeep],
  );
  console.log(`  ФК Зенит — обнулено фото у академиков: ${fkNullRes.rowCount}`);

  // 2) UPDATE СШОР Зенит — только 2 совпали, остальным NULL
  const shKeep = new Set(SH_PHOTOS.map((p) => p.id));
  for (const p of SH_PHOTOS) {
    const r = await pool.query(
      `UPDATE players
          SET photo_url = $1,
              external_ids = COALESCE(external_ids, '{}'::jsonb) || jsonb_build_object('yfl', $2::text)
        WHERE id = $3`,
      [p.url, p.yflId, p.id],
    );
    console.log(`  СШОР Зенит ✓ ${p.id} → YFL/${p.yflId} (${r.rowCount} row)`);
  }
  const shNullRes = await pool.query(
    `UPDATE players SET photo_url = NULL
       WHERE tenant_id = 'zenit-sshor' AND id NOT IN (${[...shKeep].map((_, i) => `$${i + 1}`).join(',')})`,
    [...shKeep],
  );
  console.log(`  СШОР Зенит — обнулено фото у остальных: ${shNullRes.rowCount}`);

  // 3) INSERT новые YFL-игроки ФК Зенит, которых не было в seed
  const { rows: teamRow } = await pool.query(
    `SELECT id FROM teams WHERE tenant_id='zenit-fk' AND age_group='2011' LIMIT 1`,
  );
  if (!teamRow[0]) throw new Error('ФК Зенит U-15 team not found');
  const fkTeamId = teamRow[0].id as string;

  for (const p of FK_NEW) {
    const id = `zfk-${p.slug}`;
    const r = await pool.query(
      `INSERT INTO players
         (id, tenant_id, team_id, full_name, first_name, last_name, position, position_full,
          photo_url, external_ids)
       VALUES ($1,'zenit-fk',$2,$3,$4,$5,$6,$7,$8,$9::jsonb)
       ON CONFLICT (id) DO UPDATE
         SET photo_url = EXCLUDED.photo_url,
             external_ids = players.external_ids || EXCLUDED.external_ids`,
      [id, fkTeamId, `${p.last} ${p.first}`, p.first, p.last, p.pos, p.posFull,
       p.photo, JSON.stringify(p.yflId ? { yfl: p.yflId } : {})],
    );
    const tag = p.photo ? 'YFL фото' : 'без фото';
    console.log(`  ФК Зенит + ${id} (${tag}, yfl=${p.yflId || '—'}) — ${r.rowCount} row`);
  }

  const { rows: tot } = await pool.query(
    `SELECT tenant_id,
            COUNT(*) FILTER (WHERE photo_url IS NOT NULL) AS with_photo,
            COUNT(*) FILTER (WHERE photo_url IS NULL)     AS no_photo,
            COUNT(*) AS total
       FROM players
      WHERE tenant_id IN ('zenit-fk','zenit-sshor')
      GROUP BY tenant_id ORDER BY tenant_id`,
  );
  console.log('\nИтог:');
  for (const t of tot) console.log(`  ${t.tenant_id}: ${t.with_photo} с фото / ${t.no_photo} без / ${t.total} всего`);

  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
