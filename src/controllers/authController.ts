import { Request, Response } from 'express';
import { z } from 'zod';
import { AuthenticatedRequest } from '../middleware/auth';
import { AppError, asyncHandler } from '../middleware/errorHandler';
import * as authService from '../services/authService';

const registerSchema = z.object({
  name: z.string().min(1),
  phone: z
    .string()
    .regex(/^03\d{9}$/, 'Phone must be exactly 11 digits (03XXXXXXXXX)'),
  email: z.string().email(),
  barAddress: z.string().min(1),
  password: z.string().min(6),
});

const verifySchema = z.object({
  phone: z.string().min(5),
  otp: z.string().min(4),
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
  newPassword: z.string().min(6),
});

export const register = asyncHandler(async (req: Request, res: Response) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError(parsed.error.issues[0]?.message || 'Invalid input');
  }

  const { otp } = await authService.registerDraft(parsed.data);
  res.status(201).json({
    ok: true,
    otp,
    phone: parsed.data.phone.trim(),
    message: 'Demo OTP generated. No SMS is sent.',
  });
});

export const verifyOtp = asyncHandler(async (req: Request, res: Response) => {
  const parsed = verifySchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError(parsed.error.issues[0]?.message || 'Invalid input');
  }

  const result = await authService.verifyOtp(parsed.data.phone, parsed.data.otp);
  res.json({ ok: true, ...result });
});

export const resendOtp = asyncHandler(async (req: Request, res: Response) => {
  const parsed = resendSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError(parsed.error.issues[0]?.message || 'Invalid input');
  }

  const { otp } = await authService.resendOtp(parsed.data.phone);
  res.json({
    ok: true,
    otp,
    phone: parsed.data.phone.trim(),
    message: 'Demo OTP regenerated. No SMS is sent.',
  });
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

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(6, 'Password must be at least 6 characters.'),
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
    res.json({ ok: true, message: 'Password updated.' });
  }
);
