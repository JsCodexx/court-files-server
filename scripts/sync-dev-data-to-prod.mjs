/**
 * Copy all public app data from dev (.env) → prod (.env.production).
 * Wipes production app rows first (not drizzle.__drizzle_migrations).
 *
 *   set CONFIRM_SYNC_DEV_TO_PROD=yes
 *   node scripts/sync-dev-data-to-prod.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import postgres from 'postgres';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function readDbUrl(filename) {
  const text = fs.readFileSync(path.join(root, filename), 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (t.startsWith('DATABASE_URL=')) return t.slice('DATABASE_URL='.length).trim();
  }
  return '';
}

if (process.env.CONFIRM_SYNC_DEV_TO_PROD !== 'yes') {
  console.error(
    'Refusing to run: set CONFIRM_SYNC_DEV_TO_PROD=yes to overwrite production data with dev.'
  );
  process.exit(1);
}

const devUrl = readDbUrl('.env');
const prodUrl = readDbUrl('.env.production');
if (!devUrl || !prodUrl) {
  console.error('DATABASE_URL missing in .env or .env.production');
  process.exit(1);
}

/** FK-safe insert order (parents before children). */
const TABLES = [
  'users',
  'app_settings',
  'pending_otps',
  'password_resets',
  'case_persons',
  'cases',
  'hearings',
  'case_bench_history',
  'user_proceedings',
  'user_cities',
  'payments',
  'subscriptions',
];

const dev = postgres(devUrl, { prepare: false, max: 1 });
const prod = postgres(prodUrl, { prepare: false, max: 1 });

function refFromUrl(url) {
  const m = url.match(/postgres\.([a-z0-9]+)/i);
  return m ? m[1] : 'unknown';
}

try {
  const truncateList = TABLES.join(', ');
  await prod.unsafe(`TRUNCATE TABLE ${truncateList} RESTART IDENTITY CASCADE`);

  const copied = {};

  for (const table of TABLES) {
    const existsDev = await dev`
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = ${table}
    `;
    if (existsDev.length === 0) {
      copied[table] = 0;
      continue;
    }

    const rows = await dev.unsafe(`SELECT * FROM "${table}"`);
    if (rows.length === 0) {
      copied[table] = 0;
      continue;
    }

    const existsProd = await prod`
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = ${table}
    `;
    if (existsProd.length === 0) {
      throw new Error(`Table ${table} missing on production — run migrate-prod first.`);
    }

    await prod`INSERT INTO ${prod(table)} ${prod(rows)}`;
    copied[table] = rows.length;
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        from: refFromUrl(devUrl),
        to: refFromUrl(prodUrl),
        rowCounts: copied,
        totalRows: Object.values(copied).reduce((a, b) => a + b, 0),
      },
      null,
      2
    )
  );
} catch (e) {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
} finally {
  await dev.end();
  await prod.end();
}
