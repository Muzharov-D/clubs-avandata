/** Финальная сверка моста /matches/{domainMatchId}→FFSPB + полная форма события. */
import 'dotenv/config';
import { regionResults } from '../federation/avandataSource.js';
import { authedGet } from '../services/avandataApi.js';
import { getMatch as ffspbGetMatch } from '../services/ffspbApi.js';

const AV_SEASON = 2;

async function main(): Promise<void> {
  const results = await regionResults(AV_SEASON);
  let matchedCount = 0;
  for (const m of results.slice(0, 5)) {
    const r = (await authedGet(`/matches/${m.id}`)) as Record<string, unknown>;
    const fid = String(r.linkToProtocol ?? '').match(/\/match\/(\d+)/)?.[1];
    if (!fid) { console.log(`av ${m.id}: нет ffspb-id в link`); continue; }
    const fm = (await ffspbGetMatch(fid)) as Record<string, unknown>;
    const avHome = (m.home.name.split(' ')[0] ?? '').toLowerCase();
    const ffHost = String(fm.hostName ?? '').toLowerCase();
    const ok = ffHost.includes(avHome) || avHome.includes(ffHost.split(' ')[0] ?? '');
    if (ok) matchedCount++;
    console.log(`av ${m.id} «${m.home.name} ${m.home.score}:${m.away.score} ${m.away.name}»  →  ffspb ${fid} «${fm.hostName} ${fm.resultHost}:${fm.resultGuest} ${fm.guestName}»  ${ok ? '✅ СОВПАЛ' : '❌ РАЗОШЁЛСЯ'}`);
  }
  console.log(`\nСовпало по хозяину: ${matchedCount}/5`);

  // Полная форма событий на первом матче
  const m0 = results[0]!;
  const r0 = (await authedGet(`/matches/${m0.id}`)) as Record<string, unknown>;
  const fid0 = String(r0.linkToProtocol ?? '').match(/\/match\/(\d+)/)?.[1]!;
  const fm0 = (await ffspbGetMatch(fid0)) as Record<string, unknown>;
  console.log(`\n=== ПОЛНАЯ ФОРМА СОБЫТИЙ matchId=${fid0} (${fm0.hostName} ${fm0.resultHost}:${fm0.resultGuest} ${fm0.guestName}) ===`);
  console.log('host @id:', (fm0.host as Record<string, unknown>)?.['@id'], '| guest @id:', (fm0.guest as Record<string, unknown>)?.['@id']);
  const events = (fm0.events as Record<string, unknown>[]) ?? [];
  console.log(`events: ${events.length}`);
  for (const e of events) console.log('  •', JSON.stringify(e));
  console.log('\nmatchReferees:', JSON.stringify(fm0.matchReferees));
  console.log('\nparticipatedOfficials[0..2]:', JSON.stringify((fm0.participatedOfficials as unknown[])?.slice(0, 3)));
  console.log('\nredCardCount:', fm0.redCardCount, '| yellowCardCount:', fm0.yellowCardCount, '| resultParts:', JSON.stringify(fm0.resultParts));
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
