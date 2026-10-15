/**
 * Dev DB: record RLS migrations (0010–0012) as applied without running them,
 * then apply 0013 (superadmin columns + app_settings). No RLS on dev.
 *
 * Production: use npm run db:migrate (full chain, includes RLS migrations).
 */
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from 'dotenv';
import postgres from 'postgres';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
config({ path: path.join(root, '.env') });

const DATABASE_URL = process.env.DATABASE_URL?.trim();
if (!DATABASE_URL) {
  console.error('DATABASE_URL missing in .env');
  process.exit(1);
}

const SKIP_SQL_TAGS = new Set([
  '0010_enable_rls',
  '0011_rls_deny_public_api',
  '0012_revoke_anon_authenticated_grants',
]);

const journal = JSON.parse(
  fs.readFileSync(path.join(root, 'drizzle/meta/_journal.json'), 'utf8')
);

function migrationMeta(tag) {
  const entry = journal.entries.find((e) => e.tag === tag);
  if (!entry) throw new Error(`Missing journal entry: ${tag}`);
  const filePath = path.join(root, 'drizzle', `${tag}.sql`);
  const query = fs.readFileSync(filePath, 'utf8');
  const hash = crypto.createHash('sha256').update(query).digest('hex');
  const statements = query
    .split(/--> statement-breakpoint\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  return { entry, hash, statements, filePath };
}

const sql = postgres(DATABASE_URL, { prepare: false, max: 1 });

try {
  const existing = await sql`
    SELECT hash FROM drizzle.__drizzle_migrations
  `;
  const applied = new Set(existing.map((r) => r.hash));

  const stamped = [];
  const executed = [];

  for (const { tag } of journal.entries) {
    const { entry, hash, statements } = migrationMeta(tag);

    if (applied.has(hash)) continue;

    if (SKIP_SQL_TAGS.has(tag)) {
      await sql`
        INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
        VALUES (${hash}, ${entry.when})
      `;
      stamped.push(tag);
      applied.add(hash);
      continue;
    }

    for (const stmt of statements) {
      await sql.unsafe(stmt);
    }
    await sql`
      INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
      VALUES (${hash}, ${entry.when})
    `;
    executed.push(tag);
    applied.add(hash);
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        database: 'dev (DATABASE_URL from .env)',
        rlsMigrationsSkippedSql: [...SKIP_SQL_TAGS],
        stampedWithoutSql: stamped,
        executedSql: executed,
        note: 'RLS stays off on dev. Prod uses npm run db:migrate on the server.',
      },
      null,
      2
    )
  );
} catch (e) {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
} finally {
  await sql.end();
}
