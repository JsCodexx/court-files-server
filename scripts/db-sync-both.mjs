/**
 * Push Drizzle schema to every configured Postgres (local + production).
 *
 * Reads:
 *   - DATABASE_URL from .env (local / dev)
 *   - DATABASE_URL from .env.production (production Supabase), unless DATABASE_URL_PRODUCTION is set
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { config } from 'dotenv';
import { parse } from 'dotenv';

config({ path: '.env' });

function loadProductionDatabaseUrl() {
  if (process.env.DATABASE_URL_PRODUCTION?.trim()) {
    return process.env.DATABASE_URL_PRODUCTION.trim();
  }
  if (!existsSync('.env.production')) return '';
  const prod = parse(readFileSync('.env.production'));
  return (prod.DATABASE_URL || '').trim();
}

const targets = [
  { label: 'local (.env DATABASE_URL)', url: process.env.DATABASE_URL?.trim() },
  {
    label: 'production (.env.production DATABASE_URL)',
    url: loadProductionDatabaseUrl(),
  },
].filter((t) => t.url);

if (targets.length === 0) {
  console.error(
    'No DATABASE_URL found. Set DATABASE_URL in .env and/or .env.production (or DATABASE_URL_PRODUCTION).'
  );
  process.exit(1);
}

let failed = false;

for (const target of targets) {
  console.log(`\n=== db:sync → ${target.label} ===`);
  const result = spawnSync(
    process.platform === 'win32' ? 'npx.cmd' : 'npx',
    ['drizzle-kit', 'push', '--force'],
    {
      stdio: 'inherit',
      env: { ...process.env, DATABASE_URL: target.url },
      shell: process.platform === 'win32',
    }
  );
  if (result.status !== 0) {
    console.error(`Failed syncing ${target.label}`);
    failed = true;
  } else {
    console.log(`OK synced ${target.label}`);
  }
}

process.exit(failed ? 1 : 0);
