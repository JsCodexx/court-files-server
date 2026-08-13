import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import { errorHandler } from './middleware/errorHandler';
import routes from './routes';

const corsOrigin = process.env.CORS_ORIGIN || 'http://localhost:3000';

const app = express();
app.set('trust proxy', 1);

app.use(
  cors({
    origin: corsOrigin.split(',').map((o) => o.trim()),
    credentials: true,
  })
);
app.use(express.json({ limit: '1mb' }));

app.use('/api', routes);

app.use(errorHandler);

export default app;
