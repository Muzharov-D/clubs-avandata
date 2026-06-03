/**
 * Засидить расписание тренировок для команды. По умолчанию — legirus-2010:
 * точное июньское расписание 2026, переданное тренером (12 занятий, все 90 мин,
 * поле «ЦФКСиЗ Василеостровского района»). См. массив PLAN.
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

// ISO со смещением МСК (+03:00) для конкретной даты и времени начала.
function iso(date: string, start: string): string {
  return `${date}T${start}:00+03:00`;
}

// Длительность в минутах по диапазону «HH:MM-HH:MM».
function durMin(start: string, end: string): number {
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  return eh * 60 + em - (sh * 60 + sm);
}

const VENUE = 'Нова Арена';

// Точное расписание на июнь 2026 (передано тренером). Все занятия — тип training.
const PLAN: { date: string; start: string; end: string; type: string }[] = [
  { date: '2026-06-02', start: '18:00', end: '19:30', type: 'training' }, // вт
  { date: '2026-06-04', start: '16:30', end: '18:00', type: 'training' }, // чт
  { date: '2026-06-05', start: '19:30', end: '21:00', type: 'training' }, // пт

  { date: '2026-06-09', start: '18:00', end: '19:30', type: 'training' }, // вт
  { date: '2026-06-10', start: '14:45', end: '16:15', type: 'training' }, // ср
  { date: '2026-06-12', start: '16:15', end: '17:45', type: 'training' }, // пт

  { date: '2026-06-16', start: '15:00', end: '16:30', type: 'training' }, // вт
  { date: '2026-06-18', start: '15:00', end: '16:30', type: 'training' }, // чт
  { date: '2026-06-19', start: '15:00', end: '16:30', type: 'training' }, // пт

  { date: '2026-06-23', start: '18:00', end: '19:30', type: 'training' }, // вт
  { date: '2026-06-25', start: '15:00', end: '16:30', type: 'training' }, // чт
  { date: '2026-06-26', start: '12:00', end: '13:30', type: 'training' }, // пт
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
        `INSERT INTO trainings (tenant_id, team_id, starts_at, duration_min, venue_id, venue_text, type)
         VALUES ($1, $2, $3, $4, 'seed', $5, $6)`,
        [tenant, team, iso(p.date, p.start), durMin(p.start, p.end), VENUE, p.type],
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
