import { Response } from 'express';
import { z } from 'zod';
import { AuthenticatedRequest } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import * as adminAuthService from '../services/adminAuthService';
import * as adminService from '../services/adminService';
import * as plansPricingService from '../services/plansPricingService';
import { MIN_PASSWORD_LENGTH } from '../utils/env';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const activeSchema = z.object({
  isActive: z.boolean(),
});

const planPricesSchema = z.object({
  monthlyAmountPkr: z.number().int().positive(),
  yearlyAmountPkr: z.number().int().positive(),
});

export const adminLogin = asyncHandler(async (req, res: Response) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ ok: false, message: 'Invalid login payload.' });
    return;
  }

  if (parsed.data.password.length < MIN_PASSWORD_LENGTH) {
    res.status(400).json({
      ok: false,
      message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
    });
    return;
  }

  const result = await adminAuthService.adminLogin(
    parsed.data.email,
    parsed.data.password
  );
  res.json({ ok: true, ...result });
});

export const listUsers = asyncHandler(
  async (_req: AuthenticatedRequest, res: Response) => {
    const users = await adminService.listUsers();
    res.json({ ok: true, users });
  }
);

export const patchUserActive = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const userId = String(req.params.userId || '');
    const parsed = activeSchema.safeParse(req.body);
    if (!parsed.success || !userId) {
      res.status(400).json({ ok: false, message: 'Invalid request.' });
      return;
    }

    const user = await adminService.setUserActive(userId, parsed.data.isActive);
    res.json({ ok: true, user });
  }
);

export const listPayments = asyncHandler(
  async (_req: AuthenticatedRequest, res: Response) => {
    const payments = await adminService.listPayments();
    res.json({ ok: true, payments });
  }
);

export const listSubscriptions = asyncHandler(
  async (_req: AuthenticatedRequest, res: Response) => {
    const subscriptions = await adminService.listSubscriptions();
    res.json({ ok: true, subscriptions });
  }
);

export const getPlanPrices = asyncHandler(
  async (_req: AuthenticatedRequest, res: Response) => {
    const prices = await plansPricingService.getPlanPriceSettings();
    const plans = await plansPricingService.listPlans();
    res.json({ ok: true, prices, plans });
  }
);

export const putPlanPrices = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const parsed = planPricesSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ ok: false, message: 'Invalid plan prices.' });
      return;
    }

    const prices = await plansPricingService.updatePlanPriceSettings(
      parsed.data
    );
    const plans = await plansPricingService.listPlans();
    res.json({ ok: true, prices, plans });
  }
);

export const getRevenue = asyncHandler(
  async (req: AuthenticatedRequest, res: Response) => {
    const monthsRaw = parseInt(String(req.query.months ?? '12'), 10);
    const months = Number.isFinite(monthsRaw)
      ? Math.min(36, Math.max(1, monthsRaw))
      : 12;
    const revenue = await adminService.revenueByMonth(months);
    res.json({ ok: true, revenue });
  }
);
