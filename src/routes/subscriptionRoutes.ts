import { Router } from 'express';
import { AuthenticatedRequest, requireAuth } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import * as subscriptionService from '../services/subscriptionService';

const router = Router();

router.get(
  '/status',
  requireAuth(),
  asyncHandler(async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user!.userId;
    const status = await subscriptionService.getSubscriptionStatus(userId);
    res.json({ ok: true, subscription: status });
  })
);

/** Full subscription row (plan, periods, payment links). Status/expiry cache is on user. */
router.get(
  '/profile',
  requireAuth(),
  asyncHandler(async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const userId = authReq.user!.userId;
    const profile =
      await subscriptionService.getSubscriptionProfileForUser(userId);
    res.json({ ok: true, profile });
  })
);

export default router;
