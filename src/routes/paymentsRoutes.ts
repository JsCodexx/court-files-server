import { Request, Response, Router } from 'express';
import { z } from 'zod';
import { AuthenticatedRequest, requireAuth } from '../middleware/auth';
import { AppError, asyncHandler } from '../middleware/errorHandler';
import * as paymentsService from '../services/paymentsService';
import { supabase } from '../db';

const router = Router();

function userId(req: Request): string {
  const authReq = req as AuthenticatedRequest;
  if (!authReq.user?.userId) throw new AppError('Authentication required', 401);
  return authReq.user.userId;
}

/**
 * EasyPaisa callback — NO requireAuth. Register before /:id.
 */
router.post(
  '/easypaisa/callback',
  asyncHandler(async (req: Request, res: Response) => {
    const result = await paymentsService.handleEasyPaisaCallback({
      ...req.query,
      ...req.body,
    });
    res.redirect(302, result.redirectUrl);
  })
);

router.get(
  '/easypaisa/callback',
  asyncHandler(async (req: Request, res: Response) => {
    const result = await paymentsService.handleEasyPaisaCallback({
      ...req.query,
    });
    res.redirect(302, result.redirectUrl);
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
    const email = String(req.query.email || '');
    const payment = await paymentsService.getGuestPayment(
      String(req.params.id),
      email
    );
    res.json({ ok: true, payment });
  })
);

router.post(
  '/guest-demo-confirm',
  asyncHandler(async (req: Request, res: Response) => {
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
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const list = await paymentsService.listPayments(userId(req));
    res.json({ ok: true, payments: list });
  })
);

router.post(
  '/initiate',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = z
      .object({
        planId: z.string().min(1),
        provider: z.enum(['easypaisa']).default('easypaisa'),
      })
      .safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(parsed.error.issues[0]?.message || 'Invalid input');
    }

    const uid = userId(req);
    const { data: user } = await supabase
      .from('users')
      .select('email, phone')
      .eq('id', uid)
      .maybeSingle();

    const result = await paymentsService.initiatePayment(uid, parsed.data.planId, {
      email: user?.email,
      phone: user?.phone,
    });

    res.status(201).json({ ok: true, ...result });
  })
);

router.post(
  '/demo-confirm',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
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
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    const id = String(req.params.id);
    const payment = await paymentsService.getPayment(userId(req), id);
    res.json({ ok: true, payment });
  })
);

export default router;
