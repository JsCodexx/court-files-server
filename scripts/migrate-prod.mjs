/**
 * Apply pending Drizzle migrations to production (.env.production).
 * Tolerates "already exists" for RLS policies / enable RLS when partially applied.
 */
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import postgres from 'postgres';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function readDbUrl() {
  const text = fs.readFileSync(path.join(root, '.env.production'), 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (t.startsWith('DATABASE_URL=')) return t.slice('DATABASE_URL='.length).trim();
  }
  return '';
}

const DATABASE_URL = readDbUrl();
if (!DATABASE_URL) {
  console.error('DATABASE_URL missing in .env.production');
  process.exit(1);
}

const journal = JSON.parse(
  fs.readFileSync(path.join(root, 'drizzle/meta/_journal.json'), 'utf8')
);

function migrationMeta(tag) {
  const entry = journal.entries.find((e) => e.tag === tag);
  if (!entry) throw new Error(`Missing journal entry: ${tag}`);
  const query = fs.readFileSync(path.join(root, 'drizzle', `${tag}.sql`), 'utf8');
  const hash = crypto.createHash('sha256').update(query).digest('hex');
  const statements = query
    .split(/--> statement-breakpoint\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  return { entry, hash, statements };
}

function ignorableMigrationError(msg) {
  const m = msg.toLowerCase();
  return (
    (m.includes('already exists') && m.includes('policy')) ||
    m.includes('already enabled') ||
    (m.includes('duplicate') && m.includes('column'))
  );
}

const sql = postgres(DATABASE_URL, { prepare: false, max: 1 });

try {
  const existing = await sql`SELECT hash FROM drizzle.__drizzle_migrations`;
  const applied = new Set(existing.map((r) => r.hash));

  const stamped = [];
  const executed = [];

  for (const { tag } of journal.entries) {
    const { entry, hash, statements } = migrationMeta(tag);
    if (applied.has(hash)) continue;

    for (const stmt of statements) {
      try {
        await sql.unsafe(stmt);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (!ignorableMigrationError(msg)) throw e;
      }
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
        target: 'production',
        executedSql: executed,
        message:
          executed.length === 0
            ? 'Production schema already up to date.'
            : 'Migrations applied.',
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
