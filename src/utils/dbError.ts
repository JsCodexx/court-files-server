import { AppError } from '../middleware/errorHandler';

/** Log DB errors server-side; never expose Postgres/Supabase details to clients. */
export function throwDbError(
  error: { message: string } | null | undefined,
  context?: string
): never {
  console.error('Database error', context ?? '', error?.message);
  throw new AppError('Internal server error', 500);
}
