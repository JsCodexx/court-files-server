import { Request, Response } from 'express';
import { z } from 'zod';
import { AuthenticatedRequest } from '../middleware/auth';
import { AppError, asyncHandler } from '../middleware/errorHandler';
import * as authService from '../services/authService';
import {
  isDemoOtpInResponseEnabled,
  MIN_PASSWORD_LENGTH,
} from '../utils/env';

const passwordSchema = z
  .string()
  .min(
    MIN_PASSWORD_LENGTH,
    `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`
  );

const registerSchema = z.object({
  name: z.string().min(1),
  phone: z
    .string()
    .regex(/^03\d{9}$/, 'Phone must be exactly 11 digits (03XXXXXXXXX)'),
  email: z.string().email(),
  barAddress: z.string().min(1),
  password: passwordSchema,
});

const verifySchema = z.object({
  phone: z.string().min(5),
  otp: z.string().min(4).max(6),
});

const resendSchema = z.object({
  phone: z.string().min(5),
});

const loginSchema = z.object({
  emailOrPhone: z.string().min(1),
  password: z.string().min(1),
});

const forgotSchema = z.object({
  email: z.string().email(),
});

const resetSchema = z.object({
  token: z
    .string()
    .length(64)
    .regex(/^[a-f0-9]+$/i, 'Invalid reset token'),
  newPassword: passwordSchema,
});

export const register = asyncHandler(async (req: Request, res: Response) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError(parsed.error.issues[0]?.message || 'Invalid input');
  }

  const { otp } = await authService.registerDraft(parsed.data);
  const body: Record<string, unknown> = {
    ok: true,
    phone: parsed.data.phone.trim(),
    email: parsed.data.email.trim().toLowerCase(),
    message: 'We sent a verification code to your email.',
  };
  if (isDemoOtpInResponseEnabled()) {
    body.otp = otp;
    body.message =
      'Verification code emailed. Demo OTP is also included in this response.';
  }
  res.status(201).json(body);
});

export const verifyOtp = asyncHandler(async (req: Request, res: Response) => {
  const parsed = verifySchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError(parsed.error.issues[0]?.message || 'Invalid input');
  }

  const result = await authService.verifyOtp(parsed.data.phone, parsed.data.otp);
  res.json({
    ok: true,
    user: result.user,
    message: result.message,
  });
});

export const resendOtp = asyncHandler(async (req: Request, res: Response) => {
  const parsed = resendSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError(parsed.error.issues[0]?.message || 'Invalid input');
  }

  const { otp } = await authService.resendOtp(parsed.data.phone);
  const body: Record<string, unknown> = {
    ok: true,
    phone: parsed.data.phone.trim(),
    message: 'A new verification code has been sent to your email.',
  };
  if (isDemoOtpInResponseEnabled()) {
    body.otp = otp;
    body.message =
      'New verification code emailed. Demo OTP is also included in this response.';
  }
  res.json(body);
});

export const login = asyncHandler(async (req: Request, res: Response) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError(parsed.error.issues[0]?.message || 'Invalid input');
  }

  const result = await authService.login(
    parsed.data.emailOrPhone,
    parsed.data.password
  );
  res.json({ ok: true, ...result });
});

export const forgotPassword = asyncHandler(
  async (req: Request, res: Response) => {
    const parsed = forgotSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(parsed.error.issues[0]?.message || 'Invalid input');
    }

    await authService.forgotPassword(parsed.data.email);
    res.json({
      ok: true,
      message:
        'If an account exists for that email, we sent a reset link.',
    });
  }
);

export const resetPassword = asyncHandler(
  async (req: Request, res: Response) => {
    const parsed = resetSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError('This reset link is invalid or has expired.', 400);
    }

    await authService.resetPassword(
      parsed.data.token,
      parsed.data.newPassword
    );
    res.json({ ok: true, message: 'Password updated. You can now sign in.' });
  }
);

export const me = asyncHandler(async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  if (!authReq.user) throw new AppError('Authentication required', 401);

  const user = await authService.getMe(authReq.user.userId);
  res.json({ ok: true, user });
});

const verifyEmailSchema = z.object({
  token: z.string().length(64).regex(/^[a-f0-9]+$/i, 'Invalid token'),
});

const resendVerificationSchema = z.object({
  email: z.string().email(),
});

export const verifyEmail = asyncHandler(async (req: Request, res: Response) => {
  const parsed = verifyEmailSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError('Invalid or expired verification link.', 400);
  }
  await authService.verifyEmail(parsed.data.token);
  res.json({ ok: true, message: 'Email verified. You can now sign in.' });
});

export const resendVerification = asyncHandler(
  async (req: Request, res: Response) => {
    const parsed = resendVerificationSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(parsed.error.issues[0]?.message || 'Invalid input');
    }
    await authService.resendVerification(parsed.data.email);
    res.json({
      ok: true,
      message: 'If the email needs verification, we sent a new link.',
    });
  }
);

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: passwordSchema,
});

export const changePassword = asyncHandler(
  async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    if (!authReq.user) throw new AppError('Authentication required', 401);

    const parsed = changePasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(parsed.error.issues[0]?.message || 'Invalid input');
    }

    await authService.changePassword(
      authReq.user.userId,
      parsed.data.currentPassword,
      parsed.data.newPassword
    );
    res.json({
      ok: true,
      message: 'Password updated. Please sign in again.',
    });
  }
);
