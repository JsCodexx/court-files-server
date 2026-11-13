/**
 * One-off dev helper: reset subscription + payment rows for a user by email.
 * Usage: node scripts/reset-user-billing-dev.mjs user@example.com
 */
import { config } from 'dotenv';
import postgres from 'postgres';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
config({ path: path.join(root, '.env') });

const email = process.argv[2]?.trim();
if (!email) {
  console.error('Usage: node scripts/reset-user-billing-dev.mjs <email>');
  process.exit(1);
}

const DATABASE_URL = process.env.DATABASE_URL?.trim();
if (!DATABASE_URL) {
  console.error('DATABASE_URL missing in .env');
  process.exit(1);
}

const sql = postgres(DATABASE_URL);

try {
  const users = await sql`
    select id, email, subscription_status, subscription_expires_at
    from users
    where lower(email) = lower(${email})
  `;
  console.log('BEFORE users:', users);
  if (!users.length) {
    console.error('User not found');
    process.exit(1);
  }
  const uid = users[0].id;

  const subs = await sql`select * from subscriptions where user_id = ${uid}`;
  const pays = await sql`
    select id, plan_id, status, provider, amount_pkr, created_at
    from payments where user_id = ${uid} order by created_at
  `;
  const manual = await sql`
    select id, status, plan_id, created_at
    from manual_payment_requests where user_id = ${uid} order by created_at
  `;
  console.log('BEFORE subscriptions:', subs);
  console.log('BEFORE payments:', pays);
  console.log('BEFORE manual_payment_requests:', manual);

  await sql.begin(async (tx) => {
    await tx`delete from subscriptions where user_id = ${uid}`;
    await tx`delete from manual_payment_requests where user_id = ${uid}`;
    await tx`delete from payments where user_id = ${uid}`;
    await tx`
      update users set
        subscription_status = 'none',
        subscription_expires_at = null
      where id = ${uid}
    `;
  });

  const after = await sql`
    select id, email, subscription_status, subscription_expires_at from users where id = ${uid}
  `;
  const paysAfter = await sql`select count(*)::int as c from payments where user_id = ${uid}`;
  const manualAfter = await sql`select count(*)::int as c from manual_payment_requests where user_id = ${uid}`;
  console.log('AFTER user:', after);
  console.log('AFTER payment count:', paysAfter[0].c, 'manual count:', manualAfter[0].c);
  console.log(JSON.stringify({ ok: true, email, userId: uid }));
} finally {
  await sql.end();
}
