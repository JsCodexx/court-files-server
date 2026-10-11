import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { errorHandler } from './middleware/errorHandler';
import { rateLimit } from './middleware/rateLimit';
import routes from './routes';
import {
  getCorsAllowlist,
  normalizeOrigin,
} from './utils/corsOrigins';

const corsAllowlist = new Set(getCorsAllowlist());

const app = express();
app.set('trust proxy', 1);

app.use(
  helmet({
    // SPA on clerkdiary.com fetches api.clerkdiary.com — default same-origin CORP blocks reads.
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);
app.use(
  cors({
    origin(origin, callback) {
      // Webhooks (RapidGateway), health checks, curl — no Origin header.
      if (!origin) {
        callback(null, true);
        return;
      }
      if (corsAllowlist.has(normalizeOrigin(origin))) {
        callback(null, true);
        return;
      }
      callback(null, false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    maxAge: 86400,
  })
);
app.use(
  express.json({
    limit: '1mb',
    verify: (req, _res, buf) => {
      // Keep raw bytes for RapidGateway webhook HMAC verification.
      (req as express.Request & { rawBody?: Buffer }).rawBody = buf;
    },
  })
);

// Global API rate limit — mitigates basic flooding / abuse
const apiRateMax =
  process.env.NODE_ENV === 'production' ? 120 : 600;
app.use(
  '/api',
  rateLimit({ windowMs: 60 * 1000, max: apiRateMax, prefix: 'global' })
);

app.use('/api', routes);

app.use(errorHandler);

export default app;
