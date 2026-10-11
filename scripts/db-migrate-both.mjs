/**
 * Run drizzle-kit migrate against local + production DATABASE_URL (same targets as db:sync).
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { config, parse } from 'dotenv';

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
  { label: 'local', url: process.env.DATABASE_URL?.trim() },
  { label: 'production', url: loadProductionDatabaseUrl() },
].filter((t) => t.url);

if (targets.length === 0) {
  console.error('No DATABASE_URL configured.');
  process.exit(1);
}

let failed = false;
for (const target of targets) {
  console.log(`\n=== db:migrate → ${target.label} ===`);
  const result = spawnSync(
    process.platform === 'win32' ? 'npx.cmd' : 'npx',
    ['drizzle-kit', 'migrate'],
    {
      stdio: 'inherit',
      env: { ...process.env, DATABASE_URL: target.url },
      shell: process.platform === 'win32',
    }
  );
  if (result.status !== 0) failed = true;
}

process.exit(failed ? 1 : 0);
