/**
 * Apply RLS migrations (0010–0012) to the DB in .env.production.
 * Cursor Supabase MCP may be linked to dev — use this for prod explicitly.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import postgres from 'postgres';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const envText = fs.readFileSync(path.join(root, '.env.production'), 'utf8');
let DATABASE_URL = '';
for (const line of envText.split(/\r?\n/)) {
  const t = line.trim();
  if (t.startsWith('DATABASE_URL=')) {
    DATABASE_URL = t.slice('DATABASE_URL='.length).trim();
    break;
  }
}
if (!DATABASE_URL) {
  console.error('DATABASE_URL missing in .env.production');
  process.exit(1);
}

const files = [
  '0010_enable_rls.sql',
  '0011_rls_deny_public_api.sql',
  '0012_revoke_anon_authenticated_grants.sql',
];

function statementsFromFile(name) {
  const raw = fs.readFileSync(path.join(root, 'drizzle', name), 'utf8');
  return raw
    .split(/--> statement-breakpoint\r?\n/)
    .map((s) => s.replace(/^--[^\n]*\n/gm, '').trim())
    .filter(Boolean);
}

const sql = postgres(DATABASE_URL, { prepare: false, max: 1 });

try {
  for (const file of files) {
    for (const stmt of statementsFromFile(file)) {
      try {
        await sql.unsafe(stmt);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.includes('already exists') && msg.includes('policy')) continue;
        throw e;
      }
    }
  }

  const rows = await sql`
    SELECT c.relname AS table_name, c.relrowsecurity AS rls_enabled
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
    ORDER BY c.relname
  `;

  const policyCount = await sql`
    SELECT count(*)::int AS n FROM pg_policies WHERE schemaname = 'public'
  `;

  console.log(
    JSON.stringify(
      {
        ok: true,
        projectHint: DATABASE_URL.includes('hmnhjtorvojbtgybhddi')
          ? 'production'
          : 'check ref in DATABASE_URL',
        tables: rows,
        allRlsOn: rows.every((r) => r.rls_enabled === true),
        denyPolicyCount: policyCount[0]?.n ?? 0,
      },
      null,
      2
    )
  );
} finally {
  await sql.end();
}
