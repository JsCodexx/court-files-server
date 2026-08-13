import { Router } from 'express';
import * as authController from '../controllers/authController';
import { requireAuth } from '../middleware/auth';
import { rateLimit } from '../middleware/rateLimit';

const router = Router();

router.post('/register', authController.register);
router.post('/verify-otp', authController.verifyOtp);
router.post('/resend-otp', authController.resendOtp);
router.post('/login', authController.login);
router.post(
  '/forgot-password',
  rateLimit({ windowMs: 15 * 60 * 1000, max: 5, prefix: 'forgot' }),
  authController.forgotPassword
);
router.post(
  '/reset-password',
  rateLimit({ windowMs: 15 * 60 * 1000, max: 10, prefix: 'reset' }),
  authController.resetPassword
);
router.get('/me', requireAuth, authController.me);
router.post(
  '/change-password',
  requireAuth,
  rateLimit({ windowMs: 15 * 60 * 1000, max: 8, prefix: 'change-password' }),
  authController.changePassword
);

export default router;
