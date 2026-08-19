import { Router } from 'express';
import authRoutes from './authRoutes';
import casesRoutes from './casesRoutes';
import personsRoutes from './personsRoutes';
import proceedingsRoutes from './proceedingsRoutes';

const router = Router();

router.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'court-files-server' });
});

router.use('/auth', authRoutes);
router.use('/cases', casesRoutes);
router.use('/persons', personsRoutes);
router.use('/proceedings', proceedingsRoutes);

export default router;
