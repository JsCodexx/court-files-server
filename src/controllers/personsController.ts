import { Request, Response } from 'express';
import { z } from 'zod';
import { AppError, asyncHandler } from '../middleware/errorHandler';
import { AuthenticatedRequest } from '../middleware/auth';
import * as personsService from '../services/personsService';

function userId(req: Request): string {
  const authReq = req as AuthenticatedRequest;
  if (!authReq.user?.userId) {
    throw new AppError('Authentication required', 401);
  }
  return authReq.user.userId;
}

const roleSchema = z.enum(['judge', 'advocate']);

export const list = asyncHandler(async (req: Request, res: Response) => {
  const roleParse = roleSchema.optional().safeParse(req.query.role);
  const role = roleParse.success ? roleParse.data : undefined;
  const persons = await personsService.listPersons(userId(req), role);
  res.json({ ok: true, persons });
});

export const create = asyncHandler(async (req: Request, res: Response) => {
  const parsed = z
    .object({
      name: z.string().trim().min(1).max(100),
      role: roleSchema,
      phone: z.string().max(20).optional(),
    })
    .safeParse(req.body);

  if (!parsed.success) {
    throw new AppError(parsed.error.issues[0]?.message || 'Invalid input');
  }

  const person = await personsService.createPerson(userId(req), parsed.data);
  res.status(201).json({ ok: true, person });
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  const parsed = z
    .object({
      name: z.string().trim().min(1).max(100).optional(),
      phone: z.string().max(20).optional(),
    })
    .safeParse(req.body);

  if (!parsed.success) {
    throw new AppError(parsed.error.issues[0]?.message || 'Invalid input');
  }

  const person = await personsService.updatePerson(
    userId(req),
    String(req.params.id),
    parsed.data
  );
  res.json({ ok: true, person });
});
