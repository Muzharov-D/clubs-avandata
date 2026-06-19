import 'dotenv/config';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
/**
 * SYNC «Карты потерь» из официального FFSPB (game-time%): запускать ЛОКАЛЬНО/где есть
 * доступ к stat.ffspb.org (с Render — IP-блок). Считает по каждой когорте и пулу:
 * реестр по кварталу рождения, медиана % игрового времени, доля «погребённых»
 * (<15%/<30% времени), доля вкладчиков (≥50%) — и пишет готовый агрегат в
 * src/federation/lossMap.generated.ts (бэкенд отдаёт его мгновенно, без живого FFSPB).
 * Обновление: npm run sync:lossmap.  «% времени» = минуты игрока / доступные минуты его команды.
 */
const TOKEN = process.env.FFSPB_API_KEY;
const BASE = (process.env.FFSPB_DIRECT || 'https://stat.ffspb.org/api').replace(/\/+$/, '');
const COHORTS = [44322, 44323, 44324, 44325, 44327];
const AV_SEASON = 2;

async function get<T = any>(path: string, tries = 3): Promise<T> {
  for (let i = 1; ; i++) { try { const r = await fetch(BASE + path, { headers: { Accept: 'application/ld+json', 'X-AUTH-TOKEN': String(TOKEN) }, signal: AbortSignal.timeout(40000) }); if (!r.ok) throw new Error(`${r.status}`); return (await r.json()) as T; } catch (e) { if (i >= tries) throw e; await new Promise((r) => setTimeout(r, 400 * i)); } }
}
const M = (d: any): any[] => d?.['hydra:member'] ?? d?.member ?? [];
const idOf = (x: any): number | null => { const s = typeof x === 'string' ? x : x?.['@id']; const m = s && String(s).match(/\/(\d+)$/); return m ? Number(m[1]) : null; };
async function pmap<T, R>(it: T[], lim: number, fn: (x: T) => Promise<R>): Promise<R[]> { const out: R[] = new Array(it.length); let i = 0; await Promise.all(Array.from({ length: Math.min(lim, it.length) }, async () => { while (i < it.length) { const k = i++; out[k] = await fn(it[k]!); } })); return out; }
const median = (a: number[]): number => { if (!a.length) return 0; const s = a.slice().sort((x, y) => x - y); return s[Math.floor(s.length / 2)]!; };

interface Row { q: number; year: number; pct: number; min: number; name: string; team: string }
interface QStat { q: number; roster: number; medianPct: number; buried15: number; buried30: number; contrib50: number }

function quartersOf(rows: Row[]): QStat[] {
  return [0, 1, 2, 3].map((qi) => {
    const s = rows.filter((r) => r.q === qi); const n = s.length || 1;
    const pc = (f: (p: number) => boolean) => Math.round(s.filter((r) => f(r.pct)).length / n * 100);
    return { q: qi + 1, roster: s.length, medianPct: Math.round(median(s.map((r) => r.pct)) * 100), buried15: pc((p) => p < 0.15), buried30: pc((p) => p < 0.30), contrib50: pc((p) => p >= 0.50) };
  });
}

async function cohortRows(tid: number): Promise<{ label: string; year: number; rows: Row[] }> {
  const info = await get<any>(`/tournaments/${tid}`).catch(() => ({}));
  const label = info.juniorAgeTitle || info.name || `турнир ${tid}`;
  const teamName = new Map<number, string>(); const teams: number[] = [];
  try { for (const g of M(await get(`/standings?tournament=/api/tournaments/${tid}`))) for (const row of (g.teams ?? [])) { const id = idOf(row.team) ?? idOf(row); if (id) { teams.push(id); teamName.set(id, row.teamName ?? row.team?.name ?? '?'); } } } catch { /* */ }

  const reg = new Map<number, { q: number; year: number; team: number; name: string }>();
  await pmap(teams, 6, async (tm) => {
    try { for (const p of M(await get(`/players?team=/api/teams/${tm}&itemsPerPage=100`))) {
      const pid = idOf(p); if (pid == null) continue;
      const d = p.birthDate ?? p.member?.birthDate; if (!d) continue;
      const dt = new Date(String(d)); if (Number.isNaN(dt.getTime())) continue;
      if (!reg.has(pid)) reg.set(pid, { q: Math.floor(dt.getUTCMonth() / 3), year: dt.getUTCFullYear(), team: tm, name: `${p.surname ?? p.member?.surname ?? '?'} ${p.firstName ?? p.member?.firstName ?? ''}`.trim() });
    } } catch { /* */ }
  });

  const minByP = new Map<number, number>(); const teamAvail = new Map<number, number>();
  const mids = M(await get(`/matches?tournament_id=${tid}&itemsPerPage=100`)).map(idOf).filter(Boolean) as number[];
  await pmap(mids, 6, async (mid) => {
    let det: any; try { det = await get(`/matches/${mid}`); } catch { return; }
    const pp = det.participatedPlayers ?? []; if (!pp.length) return;
    const L = (Number(det.length) || 4200) / 60;
    const h = idOf(det.host), g = idOf(det.guest);
    if (h) teamAvail.set(h, (teamAvail.get(h) ?? 0) + L);
    if (g) teamAvail.set(g, (teamAvail.get(g) ?? 0) + L);
    const offMin = new Map<number, number>();
    for (const p of pp) { if (Number(p.replaceMin) > 0) { const rep = idOf(p.replacedBy); if (rep != null) offMin.set(rep, Number(p.replaceMin)); } }
    for (const p of pp) {
      const pid = idOf(p.request); if (pid == null) continue;
      const bench = Number(p.bench) === 1;
      const mins = !bench ? (Number(p.replaceMin) > 0 ? Math.min(L, Number(p.replaceMin)) : L) : (offMin.has(pid) ? Math.max(0, L - offMin.get(pid)!) : 0);
      minByP.set(pid, (minByP.get(pid) ?? 0) + mins);
    }
  });

  const rows: Row[] = [];
  for (const [pid, r] of reg) {
    const avail = teamAvail.get(r.team) ?? 0; if (avail <= 0) continue;
    const min = minByP.get(pid) ?? 0;
    rows.push({ q: r.q, year: r.year, pct: min / avail, min, name: r.name, team: teamName.get(r.team) ?? '?' });
  }
  // год когорты = мода года рождения реестра
  const yc = new Map<number, number>(); for (const r of rows) yc.set(r.year, (yc.get(r.year) ?? 0) + 1);
  const year = [...yc.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 0;
  return { label, year, rows };
}

async function main() {
  if (!TOKEN) { console.error('FFSPB_API_KEY не задан в .env'); process.exit(1); }
  console.log('sync loss-map из', BASE, '· когорты', COHORTS.join(','));
  const all: Row[] = [];
  const cohorts: Array<{ year: number; label: string; roster: number; byQuarter: QStat[] }> = [];
  for (const tid of COHORTS) {
    const { label, year, rows } = await cohortRows(tid);
    if (!rows.length) { console.log(`  ${tid} ${label}: пусто, пропуск`); continue; }
    all.push(...rows);
    cohorts.push({ year, label, roster: rows.length, byQuarter: quartersOf(rows) });
    console.log(`  ${tid} ${label} (${year}): реестр ${rows.length}, Q4 погребены<15% ${quartersOf(rows)[3]!.buried15}%`);
  }
  cohorts.sort((a, b) => b.year - a.year);
  // примеры погребённых Q4 (<10% времени) — публичные имена FFSPB
  const examples = all.filter((r) => r.q === 3 && r.pct < 0.10).sort((a, b) => a.pct - b.pct).slice(0, 8)
    .map((r) => ({ name: r.name, team: r.team, pct: Math.round(r.pct * 100), year: r.year }));

  const data = {
    generatedAt: new Date().toISOString(),
    season: AV_SEASON,
    note: '% времени = минуты игрока / доступные минуты его команды; реестр = заявка (FFSPB /players?team=)',
    pooled: { roster: all.length, byQuarter: quartersOf(all) },
    cohorts,
    examplesBuriedQ4: examples,
  };
  const out = resolve(import.meta.dirname, '../federation/lossMap.generated.ts');
  const body = `// AUTO-GENERATED by scripts/syncLossMap.ts — НЕ РЕДАКТИРОВАТЬ вручную.\n// Обновить: npm run sync:lossmap (нужен доступ к stat.ffspb.org + FFSPB_API_KEY).\n\nexport interface LossQuarter { q: number; roster: number; medianPct: number; buried15: number; buried30: number; contrib50: number }\nexport interface LossCohort { year: number; label: string; roster: number; byQuarter: LossQuarter[] }\nexport interface LossMap {\n  generatedAt: string; season: number; note: string;\n  pooled: { roster: number; byQuarter: LossQuarter[] };\n  cohorts: LossCohort[];\n  examplesBuriedQ4: Array<{ name: string; team: string; pct: number; year: number }>;\n}\n\nexport const LOSS_MAP: LossMap = ${JSON.stringify(data, null, 2)};\n`;
  writeFileSync(out, body, 'utf8');
  console.log(`\n✓ записано ${out}`);
  console.log(`пул: реестр ${all.length} · Q1 погребены<15% ${data.pooled.byQuarter[0]!.buried15}% vs Q4 ${data.pooled.byQuarter[3]!.buried15}%`);
}
main().then(() => process.exit(0)).catch((e) => { console.error('ERR:', e?.message || e); process.exit(1); });
