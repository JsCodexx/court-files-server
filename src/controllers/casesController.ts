import { Request, Response } from 'express';
import { z } from 'zod';
import { AuthenticatedRequest } from '../middleware/auth';
import { AppError, asyncHandler } from '../middleware/errorHandler';
import * as casesService from '../services/casesService';

/** Exactly 11 digits in local format: 03XXXXXXXXX (+92 is normalized to 0). */
function cleanPhone(v: string): string {
  let digits = v.replace(/\D/g, '');
  if (digits.startsWith('92') && digits.length === 12) {
    digits = `0${digits.slice(2)}`;
  }
  return digits;
}

const phoneField = z
  .string()
  .default('')
  .refine(
    (v) => v === '' || /^03\d{9}$/.test(cleanPhone(v)),
    'Phone must be exactly 11 digits (03XXXXXXXXX)'
  )
  .transform((v) => (v === '' ? '' : cleanPhone(v)));

const cnicField = z
  .string()
  .default('')
  .refine(
    (v) => v === '' || /^\d{13}$/.test(v.replace(/[\s-]/g, '')),
    'Invalid ID card number'
  )
  .transform((v) => {
    const digits = v.replace(/[\s-]/g, '');
    if (!/^\d{13}$/.test(digits)) return v;
    // Always store CNICs dash-separated: 31209-8736287-1
    return `${digits.slice(0, 5)}-${digits.slice(5, 12)}-${digits.slice(12)}`;
  });

const partySchema = z.object({
  name: z.string().trim().min(1),
  idCard: cnicField,
  phone: phoneField,
});

const clientSchema = z.object({
  name: z.string().default(''),
  address: z.string().default(''),
  phone: phoneField,
});

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const [y, m, d] = value.split('-').map(Number);
    // Local calendar day — Sunday is closed (getDay() === 0)
    return new Date(y, m - 1, d).getDay() !== 0;
  }, 'Hearings cannot be scheduled on Sunday');

const caseFields = z.object({
  caseId: z
    .string()
    .trim()
    .min(1)
    .max(50)
    .regex(/^[A-Za-z0-9\s./-]+$/, 'Invalid case ID'),
  category: z.enum([
    'Civil Courts',
    'Session Courts',
    'High Courts',
    'Supreme Courts',
    'Family Courts',
    'Magisterial Courts',
    'Others',
  ]),
  party1: partySchema,
  party2: partySchema,
  courtNumber: z.string().max(20).optional(),
  city: z.string().trim().min(1).max(100),
  judgeName: z.string().trim().min(1).max(100),
  advocateFor: z.enum(['Party 1', 'Party 2']),
  party1Advocate: z.string().max(100).default(''),
  party2Advocate: z.string().max(100).default(''),
  judgePersonId: z.string().uuid().nullable().optional(),
  party1AdvocateId: z.string().uuid().nullable().optional(),
  party2AdvocateId: z.string().uuid().nullable().optional(),
  nextDate: isoDate,
  proceeding: z.string().trim().min(1).max(200),
  remarks: z.string().max(1000).default(''),
  status: z.enum(['pending', 'decided', 'party_left']).optional(),
  statusRemarks: z.string().max(1000).optional(),
  client: clientSchema.default({ name: '', address: '', phone: '' }),
});

const caseSchema = caseFields.superRefine((data, ctx) => {
  if (data.status === 'decided' && !(data.statusRemarks ?? '').trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Remarks are required when marking a case as decided',
      path: ['statusRemarks'],
    });
  }
});

const hearingSchema = z.object({
  date: isoDate,
  proceeding: z.string().min(1).max(200),
  adjournmentReason: z.string().max(500).optional(),
  shortOrder: z.string().max(500).optional(),
  remarks: z.string().max(1000).optional(),
});

function userId(req: Request): string {
  const authReq = req as AuthenticatedRequest;
  if (!authReq.user) throw new AppError('Authentication required', 401);
  return authReq.user.userId;
}

export const list = asyncHandler(async (req: Request, res: Response) => {
  const data = await casesService.listCases(userId(req));
  res.json({ ok: true, cases: data });
});

export const getOne = asyncHandler(async (req: Request, res: Response) => {
  const data = await casesService.getCaseById(userId(req), String(req.params.id));
  res.json({ ok: true, case: data });
});

export const create = asyncHandler(async (req: Request, res: Response) => {
  const parsed = caseSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError(parsed.error.issues[0]?.message || 'Invalid input');
  }

  const created = await casesService.createCase(userId(req), parsed.data);
  res.status(201).json({ ok: true, case: created });
});

export const update = asyncHandler(async (req: Request, res: Response) => {
  const parsed = caseFields.partial().safeParse(req.body);
  if (!parsed.success) {
    throw new AppError(parsed.error.issues[0]?.message || 'Invalid input');
  }

  // Decided requires remarks (partial schema has no superRefine)
  if (
    parsed.data.status === 'decided' &&
    !(parsed.data.statusRemarks ?? '').trim()
  ) {
    throw new AppError('Remarks are required when marking a case as decided');
  }

  const updated = await casesService.updateCase(
    userId(req),
    String(req.params.id),
    parsed.data
  );
  res.json({ ok: true, case: updated });
});

export const addHearing = asyncHandler(async (req: Request, res: Response) => {
  const parsed = hearingSchema.safeParse(req.body);
  if (!parsed.success) {
    throw new AppError(parsed.error.issues[0]?.message || 'Invalid input');
  }

  const updated = await casesService.addHearing(
    userId(req),
    String(req.params.id),
    parsed.data
  );
  res.status(201).json({ ok: true, case: updated });
});

export const updateHearing = asyncHandler(
  async (req: Request, res: Response) => {
    const parsed = hearingSchema.partial().safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(parsed.error.issues[0]?.message || 'Invalid input');
    }

    const updated = await casesService.updateHearing(
      userId(req),
      String(req.params.id),
      String(req.params.hearingId),
      parsed.data
    );
    res.json({ ok: true, case: updated });
  }
);

export const removeHearing = asyncHandler(
  async (req: Request, res: Response) => {
    const updated = await casesService.deleteHearing(
      userId(req),
      String(req.params.id),
      String(req.params.hearingId)
    );
    res.json({ ok: true, case: updated });
  }
);

export const remove = asyncHandler(async (req: Request, res: Response) => {
  await casesService.deleteCase(userId(req), String(req.params.id));
  res.json({ ok: true });
});

export const today = asyncHandler(async (req: Request, res: Response) => {
  const data = await casesService.getToday(userId(req));
  res.json({ ok: true, cases: data });
});

export const tomorrow = asyncHandler(async (req: Request, res: Response) => {
  const data = await casesService.getTomorrow(userId(req));
  res.json({ ok: true, cases: data });
});

export const byCategory = asyncHandler(async (req: Request, res: Response) => {
  const category = decodeURIComponent(String(req.params.category));
  const allowed = [
    'Civil Courts',
    'Session Courts',
    'High Courts',
    'Supreme Courts',
    'Family Courts',
    'Magisterial Courts',
    'Others',
  ] as const;
  if (!(allowed as readonly string[]).includes(category)) {
    throw new AppError('Invalid court category');
  }

  const data = await casesService.getByCategory(
    userId(req),
    category as (typeof allowed)[number]
  );
  res.json({ ok: true, cases: data });
});

export const byDate = asyncHandler(async (req: Request, res: Response) => {
  const date = String(req.query.date || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new AppError('Query param date (YYYY-MM-DD) is required');
  }

  const data = await casesService.getByDate(userId(req), date);
  res.json({ ok: true, cases: data });
});

export const hearingDates = asyncHandler(async (req: Request, res: Response) => {
  const dates = await casesService.getDatesWithHearings(userId(req));
  res.json({ ok: true, dates });
});

export const search = asyncHandler(async (req: Request, res: Response) => {
  const q = String(req.query.q || '');
  const mode = String(req.query.mode || 'name');
  if (mode !== 'name' && mode !== 'caseId' && mode !== 'idCard') {
    throw new AppError('mode must be name, caseId, or idCard');
  }

  const data = await casesService.searchCases(userId(req), q, mode);
  res.json({ ok: true, cases: data });
});
