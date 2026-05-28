/**
 * Пост-загрузочное обогащение свежезагруженного матча:
 *  1. Сопоставляет placeholder-игроков (id=sv-zenit-fk-2011-nXX) с реальными
 *     YFL-игроками по фамилии и пишет photo_url + external_ids.yfl + правильное
 *     ФИО в формате "Фамилия Имя".
 *  2. Бэкфилит 4 гола 10 тура (Зенит 4:0 СШОР) в matches.meta.events для
 *     самого свежего матча zenit-fk, чтобы хроника отобразилась.
 *
 * Запуск: cd backend && npx tsx src/scripts/applyPhotosAndEnrich.ts
 */
import 'dotenv/config';
import { pool } from '../db/client.js';

type YflPlayer = { last: string; first: string; yflId: string; photo: string | null };

// Маппинг по нормализованной фамилии (lowercase, без пробелов/дефисов)
const YFL: Record<string, YflPlayer> = {
  abu_hagras:   { last: 'Абу Хаграс',   first: 'Рашид',     yflId: '10274267', photo: 'https://st.joinsport.io/player/10274267/photo/69a8867bd584f_640x640.png' },
  ageev:        { last: 'Агеев',        first: 'Александр', yflId: '10274259', photo: 'https://st.joinsport.io/player/10274259/photo/69a8853b903a8_640x640.png' },
  aralov:       { last: 'Аралов',       first: 'Марсель',   yflId: '10277651', photo: 'https://st.joinsport.io/player/10277651/photo/69a8866f577d7_640x640.png' },
  bezrukov:     { last: 'Безруков',     first: 'Григорий',  yflId: '10277647', photo: 'https://st.joinsport.io/player/10277647/photo/69a885638e57f_640x640.png' },
  valkov:       { last: 'Вальков',      first: 'Владимир',  yflId: '10274260', photo: 'https://st.joinsport.io/player/10274260/photo/69a885710d34d_640x640.png' },
  gajvoronsky:  { last: 'Гайворонский', first: 'Алексей',   yflId: '10274268', photo: 'https://st.joinsport.io/player/10274268/photo/69a886a9e2b21_640x640.png' },
  goryainov:    { last: 'Горяинов',     first: 'Егор',      yflId: '10274266', photo: 'https://st.joinsport.io/player/10274266/photo/69a88631e3b42_640x640.png' },
  dolgodush:    { last: 'Долгодуш',     first: 'Макар',     yflId: '10277655', photo: 'https://st.joinsport.io/player/10277655/photo/69a88744a86eb_640x640.png' },
  zaitsev:      { last: 'Зайцев',       first: 'Никита',    yflId: '10274261', photo: 'https://st.joinsport.io/player/10274261/photo/69a885826c6a2_640x640.png' },
  izyumsky:     { last: 'Изюмский',     first: 'Родион',    yflId: '10274271', photo: 'https://st.joinsport.io/player/10274271/photo/69a887393fbd7_640x640.png' },
  kalinkin:     { last: 'Калинкин',     first: 'Владислав', yflId: '10277650', photo: 'https://st.joinsport.io/player/10277650/photo/69a885b9c3e84_640x640.png' },
  lipyansky:    { last: 'Липянский',    first: 'Александр', yflId: '10274262', photo: 'https://st.joinsport.io/player/10274262/photo/69a885bf5f7ea_640x640.png' },
  lisov:        { last: 'Лисов',        first: 'Владислав', yflId: '10274263', photo: 'https://st.joinsport.io/player/10274263/photo/69a885d026fae_640x640.png' },
  semak:        { last: 'Семак',        first: 'Савва',     yflId: '10274270', photo: 'https://st.joinsport.io/player/10274270/photo/69a886fc1a61f_640x640.png' },
  sehin:        { last: 'Сехин',        first: 'Данила',    yflId: '10274272', photo: 'https://st.joinsport.io/player/10274272/photo/69a887534169c_640x640.png' },
  sterkin:      { last: 'Стеркин',      first: 'Даниил',    yflId: '10277653', photo: 'https://st.joinsport.io/player/10277653/photo/69a886ea19853_640x640.png' },
  troshin:      { last: 'Трошин',       first: 'Михаил',    yflId: '10277652', photo: 'https://st.joinsport.io/player/10277652/photo/69a886b5701cd_640x640.png' },
  umnov:        { last: 'Умнов',        first: 'Иван',      yflId: '10274264', photo: 'https://st.joinsport.io/player/10274264/photo/69a885e291193_640x640.png' },
  fomchenkov:   { last: 'Фомченков',    first: 'Артем',     yflId: '8975688',  photo: 'https://st.joinsport.io/player/8975688/photo/69a88664d8142_640x640.png' },
  khrabry:      { last: 'Храбрый',      first: 'Илья',      yflId: '10274265', photo: 'https://st.joinsport.io/player/10274265/photo/69a8861b86d26_640x640.png' },
  yakovenko:    { last: 'Яковенко',     first: 'Данила',    yflId: '10274269', photo: 'https://st.joinsport.io/player/10274269/photo/69a886e02a65e_640x640.png' },
  // YFL без аватара
  efimov:       { last: 'Ефимов',       first: 'Владислав', yflId: '10357096', photo: null },
  lebedev:      { last: 'Лебедев',      first: 'Максим',    yflId: '10330602', photo: null },
  usachev:      { last: 'Усачев',       first: 'Матвей',    yflId: '',         photo: null },
};

function lookupByLastName(rawLast: string): YflPlayer | undefined {
  const key = rawLast.toLowerCase().replace(/[\s\-]/g, '');
  for (const k of Object.keys(YFL)) {
    const flat = YFL[k]!.last.toLowerCase().replace(/[\s\-]/g, '');
    if (flat === key) return YFL[k];
  }
  return undefined;
}

/** "Иван Умнов" / "Умнов Иван" → {last, first} с матчем по YFL. */
function splitAndMatch(fullName: string): { last: string; first: string; yfl?: YflPlayer } {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length < 2) return { last: parts[0] || '', first: '' };

  // Пробуем "Имя Фамилия" (PDF-формат): берём ПОСЛЕДНЕЕ слово как фамилию
  const lastCandidate = parts[parts.length - 1];
  const lastYfl = lastCandidate ? lookupByLastName(lastCandidate) : undefined;
  if (lastYfl) return { last: lastYfl.last, first: parts.slice(0, -1).join(' '), yfl: lastYfl };

  // Двойная фамилия "Абу Хаграс" — две последние
  if (parts.length >= 3) {
    const last2 = parts.slice(-2).join(' ');
    const yfl2 = lookupByLastName(last2);
    if (yfl2) return { last: yfl2.last, first: parts.slice(0, -2).join(' '), yfl: yfl2 };
  }

  // Формат "Фамилия Имя": берём ПЕРВОЕ слово как фамилию
  const firstCandidate = parts[0];
  const firstYfl = firstCandidate ? lookupByLastName(firstCandidate) : undefined;
  if (firstYfl) return { last: firstYfl.last, first: parts.slice(1).join(' '), yfl: firstYfl };

  return { last: lastCandidate || '', first: parts.slice(0, -1).join(' ') };
}

async function main() {
  // ─── 1. Photos + name normalization для всех игроков zenit-fk ──────────
  const { rows } = await pool.query<{ id: string; full_name: string }>(
    `SELECT id, full_name FROM players WHERE tenant_id = 'zenit-fk'`,
  );
  let photoApplied = 0, nameFixed = 0, yflLinked = 0;
  for (const p of rows) {
    const { last, first, yfl } = splitAndMatch(p.full_name);
    const canonicalFull = `${last} ${first}`.trim();
    const sets: string[] = ['full_name = $1', 'last_name = $2', 'first_name = $3'];
    const vals: unknown[] = [canonicalFull, last, first];
    let i = 4;
    if (yfl?.photo) { sets.push(`photo_url = $${i++}`); vals.push(yfl.photo); photoApplied++; }
    if (yfl?.yflId) {
      sets.push(`external_ids = COALESCE(external_ids,'{}'::jsonb) || jsonb_build_object('yfl', $${i++}::text)`);
      vals.push(yfl.yflId);
      yflLinked++;
    }
    vals.push(p.id);
    const r = await pool.query(`UPDATE players SET ${sets.join(', ')} WHERE id = $${i}`, vals);
    if (r.rowCount && canonicalFull !== p.full_name) nameFixed++;
    console.log(`  ${p.id}: "${p.full_name}" → "${canonicalFull}"${yfl?.photo ? ' [фото]' : yfl ? ' [YFL без фото]' : ' [не найден на YFL]'}`);
  }
  console.log(`\nИтого: ${nameFixed} имён нормализовано, ${photoApplied} фото, ${yflLinked} YFL-id привязано.`);

  // ─── 2. Backfill 4 голов в matches.meta.events для свежего zenit-fk матча ─
  const MATCH_EVENTS = [
    { minute: 7,  type: 'goal', player: 'Лисов Владислав',  assist: 'Храбрый Илья', team: 'home' },
    { minute: 40, type: 'goal', player: 'Зайцев Никита',                              team: 'home' },
    { minute: 48, type: 'goal', player: 'Лисов Владислав',  assist: 'Зайцев Никита', team: 'home' },
    { minute: 80, type: 'goal', player: 'Храбрый Илья',                               team: 'home' },
  ];
  const matchRes = await pool.query<{ id: string }>(
    `SELECT id FROM matches WHERE tenant_id='zenit-fk' ORDER BY uploaded_at DESC NULLS LAST LIMIT 1`,
  );
  if (matchRes.rows[0]) {
    const matchId = matchRes.rows[0].id;
    await pool.query(
      `UPDATE matches SET meta = COALESCE(meta,'{}'::jsonb) || jsonb_build_object('events', $1::jsonb)
        WHERE id = $2`,
      [JSON.stringify(MATCH_EVENTS), matchId],
    );
    console.log(`\nMatch ${matchId}: 4 гола записаны в meta.events.`);
  } else {
    console.log('\nНет матчей zenit-fk — events не записаны.');
  }

  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
