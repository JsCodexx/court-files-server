import { Router } from 'express';
import * as adminController from '../controllers/adminController';
import { requireSuperAdmin } from '../middleware/requireSuperAdmin';
import { rateLimit } from '../middleware/rateLimit';

const router = Router();

const authWindow = 15 * 60 * 1000;

/** Public — no Bearer token. */
router.options('/auth/login', (_req, res) => {
  res.sendStatus(204);
});

router.post(
  '/auth/login',
  rateLimit({ windowMs: authWindow, max: 10, prefix: 'admin-login' }),
  adminController.adminLogin
);

/** All routes below require admin JWT + DB superadmin check. */
const protectedAdmin = Router();
protectedAdmin.use(requireSuperAdmin());
protectedAdmin.use(
  rateLimit({
    windowMs: 60 * 1000,
    max: process.env.NODE_ENV === 'production' ? 90 : 300,
    prefix: 'admin-api',
  })
);

protectedAdmin.get('/users', adminController.listUsers);
protectedAdmin.patch('/users/:userId/active', adminController.patchUserActive);
protectedAdmin.get('/payments', adminController.listPayments);
protectedAdmin.get('/subscriptions', adminController.listSubscriptions);
protectedAdmin.get('/plans/prices', adminController.getPlanPrices);
protectedAdmin.put('/plans/prices', adminController.putPlanPrices);
protectedAdmin.get('/revenue', adminController.getRevenue);
protectedAdmin.get(
  '/manual-payment-requests',
  adminController.listManualPaymentRequests
);
protectedAdmin.post(
  '/manual-payment-requests/:id/approve',
  adminController.approveManualPaymentRequest
);
protectedAdmin.post(
  '/manual-payment-requests/:id/reject',
  adminController.rejectManualPaymentRequest
);
protectedAdmin.get(
  '/manual-payment-settings',
  adminController.getManualPaymentSettings
);
protectedAdmin.put(
  '/manual-payment-settings',
  adminController.putManualPaymentSettings
);

protectedAdmin.use((_req, res) => {
  res.status(404).json({ ok: false, error: 'Not found' });
});

router.use(protectedAdmin);

export default router;
