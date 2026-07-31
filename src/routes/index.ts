import { Router } from 'express';
import authRoutes from './authRoutes';
import casesRoutes from './casesRoutes';

const router = Router();

router.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'court-files-server' });
});

router.use('/auth', authRoutes);
router.use('/cases', casesRoutes);

export default router;
