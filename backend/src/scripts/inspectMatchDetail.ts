/**
 * Разведка формы детали матча (back.avandata.ru `/ffspb-portal/matches/{id}`).
 * ТОЛЬКО ЧТЕНИЕ. Берёт реальные матчи из regionResults, тянет сырую деталь,
 * печатает структуру — чтобы спроектировать трансформер для экрана детали матча.
 *   npx tsx src/scripts/inspectMatchDetail.ts
 */
import 'dotenv/config';
import { regionResults } from '../federation/avandataSource.js';
import { getMatchDetail, isAvandataConfigured } from '../services/avandataApi.js';

const AV_SEASON = 2;

function shape(v: unknown, depth = 0, key = ''): string {
  const pad = '  '.repeat(depth);
  if (v === null) return `${pad}${key}: null`;
  if (Array.isArray(v)) {
    const head = `${pad}${key}: Array(${v.length})`;
    if (v.length === 0) return head;
    return head + '\n' + shape(v[0], depth + 1, '[0]');
  }
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>;
    const keys = Object.keys(o);
    const head = `${pad}${key}{} keys: ${keys.join(', ')}`;
    // углубляемся в первые 1-2 уровня по «интересным» ключам
    if (depth >= 3) return head;
    const interesting = keys.filter((k) => /team|player|event|score|card|best|stat|goal|home|away|host|guest|result|rating/i.test(k));
    const kids = interesting.slice(0, 8).map((k) => shape(o[k], depth + 1, k)).join('\n');
    return head + (kids ? '\n' + kids : '');
  }
  const s = typeof v === 'string' ? `"${v.slice(0, 40)}"` : String(v);
  return `${pad}${key}: ${typeof v} = ${s}`;
}

async function main(): Promise<void> {
  if (!isAvandataConfigured()) { console.error('AVANDATA_API_KEY не задан в .env — прерываю.'); process.exit(1); }
  const results = await regionResults(AV_SEASON);
  console.log(`Матчей-результатов: ${results.length}`);
  const sample = results.slice(0, 4);
  for (const m of sample) {
    console.log(`\n=== МАТЧ ${m.id} · ${m.age} · ${m.division} · ${m.home.name} ${m.home.score}:${m.away.score} ${m.away.name} ===`);
    const detail = await getMatchDetail(m.id);
    if (!detail) { console.log('  деталь = null'); continue; }
    console.log(shape(detail, 0, 'root'));
    // распечатать «сырое» для первого матча целиком (усечённо) — чтобы видеть значения
    if (m === sample[0]) {
      console.log('\n--- RAW (первые 4500 симв) ---');
      console.log(JSON.stringify(detail).slice(0, 4500));
    }
  }
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
