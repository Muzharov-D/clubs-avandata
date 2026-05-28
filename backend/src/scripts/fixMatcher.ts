import 'dotenv/config';
import { pool } from '../db/client.js';

async function main() {
  const config = {
    ourMatcher: 'Легирус',
    season: '2025-2026',
    tournaments: {
      '2010': { leagueId: '44333', cupId: '44345' },
      '2011': { leagueId: '44334', cupId: '44346' },
      '2012': { leagueId: '44335', cupId: '44347' },
      '2013': { leagueId: '44336', cupId: '44348' },
      '2014': { leagueId: '44337' },
      '2015': { leagueId: '44338' },
      '2016': { leagueId: '44339' },
    },
  };

  console.log('Sending ourMatcher:', JSON.stringify(config.ourMatcher), 'bytes:', Buffer.from(config.ourMatcher).toString('hex'));

  const res = await pool.query(
    `UPDATE tenants SET provider_config = $1::jsonb, updated_at = NOW() WHERE slug = $2 RETURNING slug, provider_config->>'ourMatcher' AS matcher`,
    [JSON.stringify(config), 'legirus'],
  );
  console.log('Updated:', res.rows[0]);
  await pool.end();
}

main().catch((err) => { console.error('failed:', err.message || err); process.exit(1); });
