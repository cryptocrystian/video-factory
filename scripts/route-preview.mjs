import 'dotenv/config';
import pg from 'pg';

const { Client } = pg;

const routingClass = process.argv[2] || 'STANDARD_CINEMATIC_MOTION';
const resolution = process.argv[3] || null;
const audioArg = process.argv[4];
const audio = audioArg == null ? null : audioArg === 'true';
const includePremium = process.argv[5] === 'true';

if (!process.env.VIDEO_FACTORY_DB_URL) {
  throw new Error('VIDEO_FACTORY_DB_URL is required');
}

const client = new Client({ connectionString: process.env.VIDEO_FACTORY_DB_URL });
await client.connect();

try {
  const { rows } = await client.query(
    `select rule_priority, rule_role, canonical_model_slug, canonical_model_name,
            provider_slug, provider_model_key, pricing_basis, unit_price, currency,
            resolution, audio_included, promotion_name, reliability_score, latency_score
       from video_factory.get_route_candidates($1,$2,$3,$4,$5)`,
    ['synthetic-frontier-v1', routingClass, resolution, audio, includePremium]
  );

  console.table(rows);
  if (!rows.length) process.exitCode = 2;
} finally {
  await client.end();
}
