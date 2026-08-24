import { Router } from 'express';
import authRoutes from './authRoutes';
import casesRoutes from './casesRoutes';
import citiesRoutes from './citiesRoutes';
import personsRoutes from './personsRoutes';

const router = Router();

router.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'court-files-server' });
});

router.use('/auth', authRoutes);
router.use('/cases', casesRoutes);
router.use('/persons', personsRoutes);
router.use('/cities', citiesRoutes);

export default router;
