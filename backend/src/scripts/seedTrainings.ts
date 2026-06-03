/**
 * Засидить расписание тренировок для команды (чтобы экран «Тренировки» не был
 * пустым на показе). По умолчанию — legirus-2010: вт/чт/сб, 18:30, 90 мин,
 * несколько прошедших + ближайшие недели, плюс один командный сбор.
 *
 *   npm run seed:trainings                                  # legirus-2010
 *   npm run seed:trainings -- --tenant=legirus --team=legirus-2010
 *
 * trainings — tenant-scoped под RLS: нужен `SET app.bypass_rls = 'on'` на ТОМ ЖЕ
 * соединении (правило postgres-force-rls-script-access). Идемпотентно: перед
 * вставкой удаляет ранее засиженные строки (venue_id='seed') этой команды —
 * чистый ручной ввод тренера (venue_id IS NULL) не трогает.
 *
 * Читает DATABASE_URL из backend/.env.
 */
import 'dotenv/config';
import { pool } from '../db/client.js';

function arg(name: string, fallback: string): string {
  return process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=') ?? fallback;
}

// ISO со смещением МСК (+03:00) на N дней от сегодня, время HH:MM.
function isoAt(dayOffset: number, hh: number, mm: number): string {
  const d = new Date();
  d.setDate(d.getDate() + dayOffset);
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, '0');
  const da = String(d.getDate()).padStart(2, '0');
  const h = String(hh).padStart(2, '0');
  const m = String(mm).padStart(2, '0');
  return `${y}-${mo}-${da}T${h}:${m}:00+03:00`;
}

const VENUE = 'ЦФКСиЗ Василеостровского района';

// Расписание относительно сегодня: прошедшие + ближайшие. type из чек-листа
// схемы: training | extra | warmup | recovery | meet.
const PLAN: { off: number; hh: number; mm: number; type: string; notes: string }[] = [
  { off: -13, hh: 18, mm: 30, type: 'training', notes: 'Технико-тактическая: владение + быстрый переход' },
  { off: -11, hh: 18, mm: 30, type: 'training', notes: 'Прессинг и компактность линий' },
  { off: -9,  hh: 11, mm: 0,  type: 'training', notes: 'Стандарты + завершение' },
  { off: -6,  hh: 18, mm: 30, type: 'recovery', notes: 'Восстановление после матча: лёгкий бег, растяжка' },
  { off: -4,  hh: 18, mm: 30, type: 'training', notes: 'Игровые упражнения 4×4 / 7×7' },
  { off: -2,  hh: 18, mm: 30, type: 'training', notes: 'Предматчевая: розыгрыши, установка' },
  { off: 1,   hh: 18, mm: 30, type: 'training', notes: 'Тактика на ближайший тур' },
  { off: 3,   hh: 18, mm: 30, type: 'training', notes: 'Атака позиционная: ширина и забегания' },
  { off: 5,   hh: 11, mm: 0,  type: 'training', notes: 'Физическая подготовка + единоборства' },
  { off: 6,   hh: 19, mm: 0,  type: 'meet',     notes: 'Командный сбор: разбор видео матча' },
  { off: 8,   hh: 18, mm: 30, type: 'training', notes: 'Оборона: страховка и опека' },
  { off: 10,  hh: 18, mm: 30, type: 'training', notes: 'Завершение атак, удары' },
];

async function main(): Promise<void> {
  const tenant = arg('tenant', 'legirus');
  const team = arg('team', 'legirus-2010');

  const c = await pool.connect();
  try {
    await c.query("SET app.bypass_rls = 'on'");

    const teamRow = await c.query('SELECT id FROM teams WHERE id = $1 LIMIT 1', [team]);
    if (!teamRow.rows[0]) {
      console.error(`✗ Команда ${team} не найдена — отмена.`);
      process.exit(1);
    }

    const del = await c.query(
      "DELETE FROM trainings WHERE tenant_id = $1 AND team_id = $2 AND venue_id = 'seed'",
      [tenant, team],
    );
    if (del.rowCount) console.log(`· удалено ранее засиженных: ${del.rowCount}`);

    let inserted = 0;
    for (const p of PLAN) {
      await c.query(
        `INSERT INTO trainings (tenant_id, team_id, starts_at, duration_min, venue_id, venue_text, type, notes)
         VALUES ($1, $2, $3, 90, 'seed', $4, $5, $6)`,
        [tenant, team, isoAt(p.off, p.hh, p.mm), VENUE, p.type, p.notes],
      );
      inserted++;
    }
    console.log(`✓ Засижено тренировок: ${inserted} для ${team} (${VENUE})`);
  } finally {
    c.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error('seed:trainings failed:', err);
  process.exit(1);
});
