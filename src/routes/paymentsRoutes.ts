import { Request, Response, Router } from 'express';
import { z } from 'zod';
import { AuthenticatedRequest, requireAuth } from '../middleware/auth';
import { isDemoPaymentsEnabled } from '../utils/env';
import { AppError, asyncHandler } from '../middleware/errorHandler';
import { rateLimit } from '../middleware/rateLimit';
import * as paymentsService from '../services/paymentsService';
import { supabase } from '../db';

const router = Router();

const authWindow = 15 * 60 * 1000;

function userId(req: Request): string {
  const authReq = req as AuthenticatedRequest;
  if (!authReq.user?.userId) throw new AppError('Authentication required', 401);
  return authReq.user.userId;
}

/**
 * Rapid Gateway webhook — NO requireAuth. Register before /:id.
 * Configure this URL in the Rapid Gateway portal:
 * https://api.clerkdiary.com/api/payments/rapidgateway/webhook
 */
router.post(
  '/rapidgateway/webhook',
  asyncHandler(async (req: Request, res: Response) => {
    const rawBody =
      (req as Request & { rawBody?: Buffer }).rawBody?.toString('utf8') ||
      JSON.stringify(req.body ?? {});
    const result = await paymentsService.handleRapidGatewayWebhook({
      headers: req.headers as Record<string, string | string[] | undefined>,
      rawBody,
      body: (req.body || {}) as Record<string, unknown>,
    });
    res.status(result.httpStatus).json({ ok: result.httpStatus < 400, message: result.message });
  })
);

router.get(
  '/plans',
  asyncHandler(async (_req: Request, res: Response) => {
    res.json({ ok: true, plans: paymentsService.listPlans() });
  })
);

/** Guest checkout — no login required before payment. */
router.post(
  '/guest-checkout',
  rateLimit({ windowMs: authWindow, max: 8, prefix: 'guest-checkout' }),
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = z
      .object({
        planId: z.string().min(1),
        name: z.string().min(1),
        email: z.string().email(),
        phone: z.string().min(10),
      })
      .safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(parsed.error.issues[0]?.message || 'Invalid input');
    }
    const result = await paymentsService.initiateGuestPayment(parsed.data);
    res.status(201).json({ ok: true, ...result });
  })
);

router.get(
  '/guest/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = z
      .object({
        id: z.string().uuid(),
        email: z.string().email(),
      })
      .safeParse({
        id: String(req.params.id),
        email: String(req.query.email || ''),
      });
    if (!parsed.success) {
      throw new AppError(parsed.error.issues[0]?.message || 'Invalid input');
    }
    const payment = await paymentsService.getGuestPayment(
      parsed.data.id,
      parsed.data.email
    );
    res.json({ ok: true, payment });
  })
);

router.post(
  '/guest-demo-confirm',
  asyncHandler(async (req: Request, res: Response) => {
    if (!isDemoPaymentsEnabled()) {
      throw new AppError('Demo payments are disabled.', 403);
    }
    const parsed = z
      .object({
        paymentId: z.string().uuid(),
        email: z.string().email(),
      })
      .safeParse(req.body);
    if (!parsed.success) throw new AppError('Invalid input');
    const payment = await paymentsService.confirmGuestDemoPayment(
      parsed.data.paymentId,
      parsed.data.email
    );
    res.json({ ok: true, payment });
  })
);

router.get(
  '/',
  requireAuth(),
  asyncHandler(async (req: Request, res: Response) => {
    const list = await paymentsService.listPayments(userId(req));
    res.json({ ok: true, payments: list });
  })
);

router.post(
  '/initiate',
  requireAuth(),
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = z
      .object({
        planId: z.string().min(1),
        provider: z.enum(['rapidgateway']).default('rapidgateway'),
      })
      .safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(parsed.error.issues[0]?.message || 'Invalid input');
    }

    const uid = userId(req);
    const { data: user } = await supabase
      .from('users')
      .select('email, phone, name')
      .eq('id', uid)
      .maybeSingle();

    const result = await paymentsService.initiatePayment(uid, parsed.data.planId, {
      email: user?.email,
      phone: user?.phone,
      name: user?.name,
    });

    res.status(201).json({ ok: true, ...result });
  })
);

router.post(
  '/demo-confirm',
  requireAuth(),
  asyncHandler(async (req: Request, res: Response) => {
    if (!isDemoPaymentsEnabled()) {
      throw new AppError('Demo payments are disabled.', 403);
    }
    const parsed = z.object({ paymentId: z.string().uuid() }).safeParse(req.body);
    if (!parsed.success) throw new AppError('Invalid payment id');
    const payment = await paymentsService.confirmDemoPayment(
      userId(req),
      parsed.data.paymentId
    );
    res.json({ ok: true, payment });
  })
);

router.get(
  '/:id',
  requireAuth(),
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = z.object({ id: z.string().uuid() }).safeParse({
      id: String(req.params.id),
    });
    if (!parsed.success) {
      throw new AppError('Invalid payment id');
    }
    const payment = await paymentsService.getPayment(
      userId(req),
      parsed.data.id
    );
    res.json({ ok: true, payment });
  })
);

export default router;
