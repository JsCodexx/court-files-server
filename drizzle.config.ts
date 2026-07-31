import { defineConfig } from 'drizzle-kit';
import 'dotenv/config';

/** Optional: only used when DATABASE_URL is set for drizzle-kit */
export default defineConfig({
  schema: './src/db/schema/index.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL || '',
  },
});
