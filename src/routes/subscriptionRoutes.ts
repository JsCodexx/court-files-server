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

export default router;
