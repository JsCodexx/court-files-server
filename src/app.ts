import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { errorHandler } from './middleware/errorHandler';
import { rateLimit } from './middleware/rateLimit';
import routes from './routes';

const corsOrigin = process.env.CORS_ORIGIN || 'http://localhost:4400';

const app = express();
app.set('trust proxy', 1);

app.use(helmet());
app.use(
  cors({
    origin: corsOrigin.split(',').map((o) => o.trim()),
    credentials: true,
  })
);
app.use(express.json({ limit: '1mb' }));

// Global API rate limit — mitigates basic flooding / abuse
app.use(
  '/api',
  rateLimit({ windowMs: 60 * 1000, max: 120, prefix: 'global' })
);

app.use('/api', routes);

app.use(errorHandler);

export default app;
