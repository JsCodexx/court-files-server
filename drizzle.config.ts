import { config } from 'dotenv';
import { defineConfig } from 'drizzle-kit';

config({ path: '.env' });

/**
 * Supabase transaction-mode pooler (IPv4, port 6543).
 * See DATABASE_URL in .env — user postgres.[project-ref], prepare: false in runtime client.
 */
export default defineConfig({
  schema: './src/db/schema/index.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL || '',
  },
});
