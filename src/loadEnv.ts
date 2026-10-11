import dotenv from 'dotenv';
import path from 'path';

/** Load `.env` from project root (not process.cwd()) so PM2 always picks up secrets. */
dotenv.config({ path: path.resolve(__dirname, '../.env') });
