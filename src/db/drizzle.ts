import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error('DATABASE_URL must be set in .env');
}

/** Transaction pooler (port 6543) — prepared statements must be disabled */
export const pg = postgres(connectionString, {
  prepare: false,
  max: 10,
});

export const db = drizzle(pg, { schema });
