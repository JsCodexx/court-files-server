import { Request, Response, Router } from 'express';
import { z } from 'zod';
import { AuthenticatedRequest, requireAuth } from '../middleware/auth';
import { AppError, asyncHandler } from '../middleware/errorHandler';
import * as proceedingsService from '../services/proceedingsService';

const router = Router();
router.use(requireAuth);

function userId(req: Request): string {
  const authReq = req as AuthenticatedRequest;
  if (!authReq.user?.userId) throw new AppError('Authentication required', 401);
  return authReq.user.userId;
}

router.get(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const list = await proceedingsService.listProceedings(userId(req));
    res.json({ ok: true, proceedings: list });
  })
);

router.post(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const parsed = z
      .object({ label: z.string().trim().min(1).max(200) })
      .safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(parsed.error.issues[0]?.message || 'Invalid input');
    }
    const item = await proceedingsService.addProceeding(
      userId(req),
      parsed.data.label
    );
    res.status(201).json({ ok: true, proceeding: item });
  })
);

export default router;
