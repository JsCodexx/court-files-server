/**
 * Upsert manual payment account details into dev (.env) and prod (.env.production).
 * Safe to re-run — overwrites manual_payment_accounts with current defaults.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import postgres from 'postgres';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function readDbUrl(envFile) {
  const filePath = path.join(root, envFile);
  if (!fs.existsSync(filePath)) return '';
  const text = fs.readFileSync(filePath, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (t.startsWith('DATABASE_URL=')) {
      return t.slice('DATABASE_URL='.length).trim();
    }
  }
  return '';
}

const ACCOUNTS_JSON = JSON.stringify({
  bank: {
    title: 'Bank of Punjab',
    accountName: 'Waheed Ali',
    accountNumber: '6040259783300018',
    bankName: 'Bank of Punjab',
  },
  easypaisa: {
    title: 'Easypaisa',
    accountName: 'Waheed Ali',
    accountNumber: '03027857887',
  },
  jazzcash: {
    title: 'JazzCash',
    accountName: 'Waheed Ali',
    accountNumber: '03027857887',
  },
  notice:
    'Transfer the exact plan amount (PKR). Keep your transaction / TID number — you will need it in the form below.',
  whatsappNumber: '03027857887',
});

async function upsert(label, databaseUrl) {
  const sql = postgres(databaseUrl, { prepare: false, max: 1 });
  try {
    await sql`
      INSERT INTO app_settings (key, value)
      VALUES ('manual_payment_accounts', ${ACCOUNTS_JSON})
      ON CONFLICT (key) DO UPDATE SET
        value = EXCLUDED.value,
        updated_at = now()
    `;
    await sql`
      INSERT INTO app_settings (key, value)
      VALUES ('manual_payment_enabled', 'true')
      ON CONFLICT (key) DO NOTHING
    `;
    const [row] = await sql`
      SELECT left(value, 80) AS preview
      FROM app_settings
      WHERE key = 'manual_payment_accounts'
    `;
    console.log(`${label}: saved manual_payment_accounts (${row?.preview ?? 'ok'}…)`);
  } finally {
    await sql.end();
  }
}

const targets = [
  { label: 'dev', url: readDbUrl('.env') },
  { label: 'production', url: readDbUrl('.env.production') },
];

let failed = false;
for (const { label, url } of targets) {
  if (!url) {
    console.error(`${label}: DATABASE_URL missing`);
    failed = true;
    continue;
  }
  try {
    await upsert(label, url);
  } catch (err) {
    console.error(`${label}:`, err.message || err);
    failed = true;
  }
}

process.exit(failed ? 1 : 0);
