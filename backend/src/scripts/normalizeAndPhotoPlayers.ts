/**
 * 1) Нормализует все имена ФК Зенит / СШОР Зенит в формат "Фамилия Имя".
 * 2) Подтягивает YFL-фото по фамилии (из агентского списка).
 * 3) Записывает external_ids.yfl где нашли.
 *
 * Источник имён+фото: yflrussia.ru/tournament/1060908 → application pages.
 * Маппинг — по нормализованной фамилии (Cyrillic, lowercase).
 *
 * Запуск: cd backend && npx tsx src/scripts/normalizeAndPhotoPlayers.ts
 */
import 'dotenv/config';
import { pool } from '../db/client.js';

// ─── YFL-данные: ФАМИЛИЯ → {first, lastFull, yflId, photo} ────────────────
type YflEntry = { lastFull: string; first: string; yflId: string; photo: string | null };
const YFL: Record<string, YflEntry> = {
  // ФК Зенит — 21 с фото + 3 без
  'абухаграс':   { lastFull: 'Абу Хаграс',  first: 'Рашид',     yflId: '10274267', photo: 'https://st.joinsport.io/player/10274267/photo/69a8867bd584f_640x640.png' },
  'агеев':       { lastFull: 'Агеев',       first: 'Александр', yflId: '10274259', photo: 'https://st.joinsport.io/player/10274259/photo/69a8853b903a8_640x640.png' },
  'аралов':      { lastFull: 'Аралов',      first: 'Марсель',   yflId: '10277651', photo: 'https://st.joinsport.io/player/10277651/photo/69a8866f577d7_640x640.png' },
  'безруков':    { lastFull: 'Безруков',    first: 'Григорий',  yflId: '10277647', photo: 'https://st.joinsport.io/player/10277647/photo/69a885638e57f_640x640.png' },
  'вальков':     { lastFull: 'Вальков',     first: 'Владимир',  yflId: '10274260', photo: 'https://st.joinsport.io/player/10274260/photo/69a885710d34d_640x640.png' },
  'гайворонский':{ lastFull: 'Гайворонский',first: 'Алексей',   yflId: '10274268', photo: 'https://st.joinsport.io/player/10274268/photo/69a886a9e2b21_640x640.png' },
  'горяинов':    { lastFull: 'Горяинов',    first: 'Егор',      yflId: '10274266', photo: 'https://st.joinsport.io/player/10274266/photo/69a88631e3b42_640x640.png' },
  'долгодуш':    { lastFull: 'Долгодуш',    first: 'Макар',     yflId: '10277655', photo: 'https://st.joinsport.io/player/10277655/photo/69a88744a86eb_640x640.png' },
  'зайцев':      { lastFull: 'Зайцев',      first: 'Никита',    yflId: '10274261', photo: 'https://st.joinsport.io/player/10274261/photo/69a885826c6a2_640x640.png' },
  'изюмский':    { lastFull: 'Изюмский',    first: 'Родион',    yflId: '10274271', photo: 'https://st.joinsport.io/player/10274271/photo/69a887393fbd7_640x640.png' },
  'калинкин':    { lastFull: 'Калинкин',    first: 'Владислав', yflId: '10277650', photo: 'https://st.joinsport.io/player/10277650/photo/69a885b9c3e84_640x640.png' },
  'липянский':   { lastFull: 'Липянский',   first: 'Александр', yflId: '10274262', photo: 'https://st.joinsport.io/player/10274262/photo/69a885bf5f7ea_640x640.png' },
  'лисов':       { lastFull: 'Лисов',       first: 'Владислав', yflId: '10274263', photo: 'https://st.joinsport.io/player/10274263/photo/69a885d026fae_640x640.png' },
  'семак':       { lastFull: 'Семак',       first: 'Савва',     yflId: '10274270', photo: 'https://st.joinsport.io/player/10274270/photo/69a886fc1a61f_640x640.png' },
  'сехин':       { lastFull: 'Сехин',       first: 'Данила',    yflId: '10274272', photo: 'https://st.joinsport.io/player/10274272/photo/69a887534169c_640x640.png' },
  'стеркин':     { lastFull: 'Стеркин',     first: 'Даниил',    yflId: '10277653', photo: 'https://st.joinsport.io/player/10277653/photo/69a886ea19853_640x640.png' },
  'трошин':      { lastFull: 'Трошин',      first: 'Михаил',    yflId: '10277652', photo: 'https://st.joinsport.io/player/10277652/photo/69a886b5701cd_640x640.png' },
  'умнов':       { lastFull: 'Умнов',       first: 'Иван',      yflId: '10274264', photo: 'https://st.joinsport.io/player/10274264/photo/69a885e291193_640x640.png' },
  'фомченков':   { lastFull: 'Фомченков',   first: 'Артем',     yflId: '8975688',  photo: 'https://st.joinsport.io/player/8975688/photo/69a88664d8142_640x640.png' },
  'храбрый':     { lastFull: 'Храбрый',     first: 'Илья',      yflId: '10274265', photo: 'https://st.joinsport.io/player/10274265/photo/69a8861b86d26_640x640.png' },
  'яковенко':    { lastFull: 'Яковенко',    first: 'Данила',    yflId: '10274269', photo: 'https://st.joinsport.io/player/10274269/photo/69a886e02a65e_640x640.png' },
  // YFL без аватара (только имена)
  'ефимов':      { lastFull: 'Ефимов',      first: 'Владислав', yflId: '10357096', photo: null },
  'лебедев':     { lastFull: 'Лебедев',     first: 'Максим',    yflId: '10330602', photo: null },
  'усачев':      { lastFull: 'Усачев',      first: 'Матвей',    yflId: '',         photo: null },
};

/** Сократить любую фамилию до lookup-ключа: lower-case, без пробелов и дефисов. */
function lastKey(s: string): string {
  return s.toLowerCase().replace(/[\s\-]/g, '').trim();
}

/** Из full_name "Имя Фамилия" ИЛИ "Фамилия Имя" вернуть гипотезу {last, first}. */
function splitName(fullName: string): { last: string; first: string } | null {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length < 2) return null;
  // Если ПЕРВОЕ слово совпало с YFL-фамилией → формат "Фамилия Имя"
  if (YFL[lastKey(parts[0]!)]) {
    return { last: parts[0]!, first: parts.slice(1).join(' ') };
  }
  // Иначе пробуем "Имя Фамилия" — берём последние слова как фамилию
  // Случай "Имя Двойная Фамилия" (Абу Хаграс): пробуем последние 2 слова
  const last2 = parts.slice(-2).join(' ');
  if (YFL[lastKey(last2)]) {
    return { last: last2, first: parts.slice(0, -2).join(' ') };
  }
  // Стандарт "Имя Фамилия"
  return { last: parts[parts.length - 1]!, first: parts.slice(0, -1).join(' ') };
}

async function main() {
  for (const slug of ['zenit-fk', 'zenit-sshor']) {
    const { rows } = await pool.query<{ id: string; full_name: string; number: number | null }>(
      `SELECT id, full_name, number FROM players WHERE tenant_id = $1 ORDER BY number NULLS LAST`,
      [slug],
    );
    console.log(`\n${slug}: ${rows.length} игроков`);

    let updated = 0, photoApplied = 0, yflLinked = 0;
    for (const p of rows) {
      const split = splitName(p.full_name);
      if (!split) { console.log(`  ?  ${p.full_name} (id=${p.id}) — не распознал`); continue; }

      const ykey = lastKey(split.last);
      const yfl = YFL[ykey];

      // Если есть YFL — используем КАНОНИЧЕСКОЕ написание (lastFull + first)
      const canonicalLast = yfl?.lastFull ?? split.last;
      const canonicalFirst = yfl?.first ?? split.first;
      const fullCanon = `${canonicalLast} ${canonicalFirst}`.trim();

      const sets: string[] = ['full_name = $1', 'last_name = $2', 'first_name = $3'];
      const vals: unknown[] = [fullCanon, canonicalLast, canonicalFirst];
      let i = 4;

      if (yfl?.photo) { sets.push(`photo_url = $${i++}`); vals.push(yfl.photo); photoApplied++; }
      if (yfl?.yflId) {
        sets.push(`external_ids = COALESCE(external_ids,'{}'::jsonb) || jsonb_build_object('yfl', $${i++}::text)`);
        vals.push(yfl.yflId);
        yflLinked++;
      }

      vals.push(p.id);
      const r = await pool.query(`UPDATE players SET ${sets.join(', ')} WHERE id = $${i}`, vals);
      if (r.rowCount) updated++;
      const tag = yfl ? (yfl.photo ? 'YFL+фото' : 'YFL без фото') : 'не на YFL';
      console.log(`  ✓ #${p.number ?? '—'}  ${p.full_name} → ${fullCanon}  [${tag}]`);
    }
    console.log(`  итого: ${updated} updated, ${photoApplied} с фото, ${yflLinked} с YFL-id`);
  }
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
