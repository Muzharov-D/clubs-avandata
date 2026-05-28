/**
 * Применяет URL фото игроков из stat.ffspb.org (NagradioN CDN) для команд
 * ФК Зенит U-15 и СШОР Зенит U-15.
 *
 * Источник: stat.ffspb.org (Федерация футбола СПб) → img.nagradion.ru/images/normal/m/*.jpg
 * Все 50/50 игроков найдены и сматчены агентом по фамилии+имени.
 *
 * Запуск:
 *   cd backend && npx tsx src/scripts/applyPlayerPhotos.ts
 */
import 'dotenv/config';
import { pool } from '../db/client.js';

// Маппинг: player.id → photo URL (NagradioN CDN, 260px+ портреты)
const PHOTOS: Record<string, string> = {
  // ─── ФК Зенит U-15 ────────────────────────────────────────────
  'zfk-gusev':         'https://img.nagradion.ru/images/normal/m/player17034340.jpg',
  'zfk-dzhioku':       'https://img.nagradion.ru/images/normal/m/player1044212252.jpg',
  'zfk-orekhov':       'https://img.nagradion.ru/images/normal/m/player1986391915.jpg',
  'zfk-trofimov':      'https://img.nagradion.ru/images/normal/m/player417686395.jpg',
  'zfk-ezhov':         'https://img.nagradion.ru/images/normal/m/player132154858.jpg',
  'zfk-budze':         'https://img.nagradion.ru/images/normal/m/player1399525787.jpg',
  'zfk-vershinin':     'https://img.nagradion.ru/images/normal/m/player1997944090.jpg',
  'zfk-soglaev':       'https://img.nagradion.ru/images/normal/m/player838359446.jpg',
  'zfk-pogorelov':     'https://img.nagradion.ru/images/normal/m/player784478850.jpg',
  'zfk-nabiullin':     'https://img.nagradion.ru/images/normal/m/player698739943.jpg',
  'zfk-denisov-fk':    'https://img.nagradion.ru/images/normal/m/player208266488.jpg',
  'zfk-gindin':        'https://img.nagradion.ru/images/normal/m/player487246948.jpg',
  'zfk-strizhakov':    'https://img.nagradion.ru/images/normal/m/player373730086.jpg',
  'zfk-shchekin':      'https://img.nagradion.ru/images/normal/m/player1566112574.jpg',
  'zfk-rudachikhin':   'https://img.nagradion.ru/images/normal/m/player1893964180.jpg',
  'zfk-firsov':        'https://img.nagradion.ru/images/normal/m/player577054626.jpg',
  'zfk-goryainov':     'https://img.nagradion.ru/images/normal/m/player1366553562.jpg',
  'zfk-lisov':         'https://img.nagradion.ru/images/normal/m/player1128005238.jpg',
  'zfk-valkov':        'https://img.nagradion.ru/images/normal/m/player1842941623.jpg',
  'zfk-fomchenkov':    'https://img.nagradion.ru/images/normal/m/player1827895090.jpg',
  'zfk-sehin':         'https://img.nagradion.ru/images/normal/m/player595541696.jpg',
  'zfk-sterkin':       'https://img.nagradion.ru/images/normal/m/player1135632935.jpg',
  'zfk-umnov':         'https://img.nagradion.ru/images/normal/m/player892287588.jpg',
  'zfk-kalinkin':      'https://img.nagradion.ru/images/normal/m/player337834634.jpg',
  'zfk-bezrukov':      'https://img.nagradion.ru/images/normal/m/player916078468.jpg',
  'zfk-gajvoronsky':   'https://img.nagradion.ru/images/normal/m/player1460587586.jpg',
  'zfk-aralov':        'https://img.nagradion.ru/images/normal/m/player772202689.jpg',
  // ─── СШОР Зенит U-15 ─────────────────────────────────────────
  'zsh-arkhipov':       'https://img.nagradion.ru/images/normal/m/player1756102397.jpg',
  'zsh-baryakhtar':     'https://img.nagradion.ru/images/normal/m/player1075830851.jpg',
  'zsh-bezusenko':      'https://img.nagradion.ru/images/normal/m/player1335586530.jpg',
  'zsh-goncharov':      'https://img.nagradion.ru/images/normal/m/player1094539162.jpg',
  'zsh-grishevsky':     'https://img.nagradion.ru/images/normal/m/player2048554148.jpg',
  'zsh-denisov-sh':     'https://img.nagradion.ru/images/normal/m/player1848083036.jpg',
  'zsh-efimov':         'https://img.nagradion.ru/images/normal/m/person965983767.jpg',
  'zsh-zheleznyakov':   'https://img.nagradion.ru/images/normal/m/player1528425220.jpg',
  'zsh-ivanov':         'https://img.nagradion.ru/images/normal/m/person669792931.jpg',
  'zsh-ilichev':        'https://img.nagradion.ru/images/normal/m/player455032756.jpg',
  'zsh-ketov':          'https://img.nagradion.ru/images/normal/m/player1399601684.jpg',
  'zsh-klimov':         'https://img.nagradion.ru/images/normal/m/player1270304605.jpg',
  'zsh-krasnoshchek':   'https://img.nagradion.ru/images/normal/m/player1416095969.jpg',
  'zsh-kuramagomedov':  'https://img.nagradion.ru/images/normal/m/player2107232392.jpg',
  'zsh-lipsyuk':        'https://img.nagradion.ru/images/normal/m/player500654221.jpg',
  'zsh-panov':          'https://img.nagradion.ru/images/normal/m/player620763592.jpg',
  'zsh-polin':          'https://img.nagradion.ru/images/normal/m/person714420012.jpg',
  'zsh-polyakov':       'https://img.nagradion.ru/images/normal/m/player810262990.jpg',
  'zsh-potapov':        'https://img.nagradion.ru/images/normal/m/player805260566.jpg',
  'zsh-pochtarev':      'https://img.nagradion.ru/images/normal/m/player176271155.jpg',
  'zsh-solovyov':       'https://img.nagradion.ru/images/normal/m/player499778048.jpg',
  'zsh-uzun':           'https://img.nagradion.ru/images/normal/m/player2087497536.jpg',
  'zsh-ertov':          'https://img.nagradion.ru/images/normal/m/player1456328570.jpg',
};

async function main() {
  let ok = 0, miss = 0;
  for (const [id, url] of Object.entries(PHOTOS)) {
    const res = await pool.query('UPDATE players SET photo_url = $1 WHERE id = $2', [url, id]);
    if (res.rowCount && res.rowCount > 0) ok++;
    else { miss++; console.warn('[photos] no row for id', id); }
  }
  console.log(`[photos] applied ${ok}/${Object.keys(PHOTOS).length} (missed ${miss})`);
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
