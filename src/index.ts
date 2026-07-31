import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import { errorHandler } from './middleware/errorHandler';
import routes from './routes';

const app = express();
const port = Number(process.env.PORT) || 5500;
const corsOrigin = process.env.CORS_ORIGIN || 'http://localhost:3000';

app.use(
  cors({
    origin: corsOrigin.split(',').map((o) => o.trim()),
    credentials: true,
  })
);
app.use(express.json({ limit: '1mb' }));

app.use('/api', routes);

app.use(errorHandler);

app.listen(port, () => {
  console.log(`Court Files API listening on http://localhost:${port}`);
});
