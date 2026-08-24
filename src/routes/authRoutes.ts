import { Router } from 'express';
import * as authController from '../controllers/authController';
import { requireAuth } from '../middleware/auth';
import { rateLimit } from '../middleware/rateLimit';

const router = Router();

const authWindow = 15 * 60 * 1000;

router.post(
  '/register',
  rateLimit({ windowMs: authWindow, max: 5, prefix: 'register' }),
  authController.register
);
router.post(
  '/verify-otp',
  rateLimit({ windowMs: authWindow, max: 10, prefix: 'verify-otp' }),
  authController.verifyOtp
);
router.post(
  '/resend-otp',
  rateLimit({ windowMs: authWindow, max: 5, prefix: 'resend-otp' }),
  authController.resendOtp
);
router.post(
  '/login',
  rateLimit({ windowMs: authWindow, max: 10, prefix: 'login' }),
  authController.login
);
router.post(
  '/forgot-password',
  rateLimit({ windowMs: authWindow, max: 5, prefix: 'forgot' }),
  authController.forgotPassword
);
router.post(
  '/reset-password',
  rateLimit({ windowMs: authWindow, max: 10, prefix: 'reset' }),
  authController.resetPassword
);
router.post(
  '/verify-email',
  rateLimit({ windowMs: authWindow, max: 10, prefix: 'verify-email' }),
  authController.verifyEmail
);
router.post(
  '/resend-verification',
  rateLimit({ windowMs: authWindow, max: 5, prefix: 'resend-verify' }),
  authController.resendVerification
);
router.get('/me', requireAuth, authController.me);
router.post(
  '/change-password',
  requireAuth,
  rateLimit({ windowMs: authWindow, max: 8, prefix: 'change-password' }),
  authController.changePassword
);

export default router;
