/**
 * Compare public schema + Drizzle migrations: .env (dev) vs .env.production (prod).
 * Usage: node scripts/compare-dev-prod-schema.mjs
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

function refFromUrl(url) {
  const m = url.match(/postgres\.([a-z0-9]+)/i);
  return m ? m[1] : 'unknown';
}

async function snapshot(url) {
  const sql = postgres(url, { prepare: false, max: 1 });
  try {
    const tables = await sql`
      SELECT c.relname AS table_name, c.relrowsecurity AS rls_enabled
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r'
      ORDER BY c.relname
    `;
    const columns = await sql`
      SELECT table_name, column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public'
      ORDER BY table_name, ordinal_position
    `;
    let migrations = [];
    try {
      migrations = await sql`
        SELECT id, hash, created_at FROM drizzle.__drizzle_migrations ORDER BY id
      `;
    } catch {
      migrations = [];
    }
    const policies = await sql`
      SELECT tablename, count(*)::int AS n
      FROM pg_policies WHERE schemaname = 'public'
      GROUP BY tablename ORDER BY tablename
    `;
    return { tables, columns, migrations, policies };
  } finally {
    await sql.end();
  }
}

const devUrl = readDbUrl('.env');
const prodUrl = readDbUrl('.env.production');
if (!devUrl || !prodUrl) {
  console.error('DATABASE_URL missing in .env or .env.production');
  process.exit(1);
}

const [dev, prod] = await Promise.all([snapshot(devUrl), snapshot(prodUrl)]);

const devTables = new Set(dev.tables.map((t) => t.table_name));
const prodTables = new Set(prod.tables.map((t) => t.table_name));
const onlyDev = [...devTables].filter((t) => !prodTables.has(t));
const onlyProd = [...prodTables].filter((t) => !devTables.has(t));

function colKey(c) {
  return `${c.table_name}.${c.column_name}:${c.data_type}:${c.is_nullable}`;
}
const devCols = new Set(dev.columns.map(colKey));
const prodCols = new Set(prod.columns.map(colKey));
const colsOnlyDev = [...devCols].filter((k) => !prodCols.has(k));
const colsOnlyProd = [...prodCols].filter((k) => !devCols.has(k));

const devM = dev.migrations.map((m) => `${m.id}:${m.hash.slice(0, 16)}`);
const prodM = prod.migrations.map((m) => `${m.id}:${m.hash.slice(0, 16)}`);

const rlsDiff = [];
for (const t of [...new Set([...devTables, ...prodTables])].sort()) {
  const d = dev.tables.find((x) => x.table_name === t)?.rls_enabled;
  const p = prod.tables.find((x) => x.table_name === t)?.rls_enabled;
  if (d !== p) rlsDiff.push({ table: t, devRls: d, prodRls: p });
}

const schemaMatch =
  onlyDev.length === 0 &&
  onlyProd.length === 0 &&
  colsOnlyDev.length === 0 &&
  colsOnlyProd.length === 0;

const migrationMatch =
  dev.migrations.length === prod.migrations.length &&
  devM.every((h, i) => h === prodM[i]);

console.log(
  JSON.stringify(
    {
      projects: { dev: refFromUrl(devUrl), prod: refFromUrl(prodUrl) },
      summary: {
        schemaInSync: schemaMatch,
        migrationsInSync: migrationMatch,
        rlsSettingsMatch: rlsDiff.length === 0,
        fullyInSync: schemaMatch && migrationMatch,
      },
      tables: {
        dev: [...devTables].sort(),
        prod: [...prodTables].sort(),
        onlyOnDev: onlyDev,
        onlyOnProd: onlyProd,
      },
      columnDiffs: {
        countOnlyDev: colsOnlyDev.length,
        countOnlyProd: colsOnlyProd.length,
        onlyOnDev: colsOnlyDev,
        onlyOnProd: colsOnlyProd,
      },
      migrations: {
        devApplied: dev.migrations.length,
        prodApplied: prod.migrations.length,
        expectedFromRepo: 14,
        devTagsApprox: devM,
        prodTagsApprox: prodM,
      },
      rls: {
        differingTables: rlsDiff,
        denyPolicyCount: {
          dev: dev.policies.reduce((s, p) => s + p.n, 0),
          prod: prod.policies.reduce((s, p) => s + p.n, 0),
        },
      },
      note: 'Dev intentionally skips RLS SQL (db:migrate:dev); prod should have RLS on. Schema columns should still match.',
    },
    null,
    2
  )
);
