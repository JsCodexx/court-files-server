import dotenv from 'dotenv';
import path from 'path';

/**
 * Load `.env` from project root (not process.cwd()) so PM2 always picks up secrets.
 * Public URLs (CORS_ORIGIN, FRONTEND_URL, API_PUBLIC_URL) live here — not in ecosystem.config.cjs.
 */
dotenv.config({ path: path.resolve(__dirname, '../.env') });
