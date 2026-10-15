import { NextFunction, RequestHandler, Response } from 'express';
import { AuthenticatedRequest } from './auth';
import { verifyAdminToken } from '../utils/jwt';
import { AppError } from './errorHandler';
import { supabase } from '../db';
import { throwDbError } from '../utils/dbError';

/**
 * Guards all /api/admin/* routes except POST /auth/login.
 * Requires admin JWT + live DB check (is_superadmin, is_active, token_version).
 */
async function runRequireSuperAdmin(
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction
): Promise<void> {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    next(new AppError('Authentication required', 401));
    return;
  }

  try {
    const token = header.slice('Bearer '.length).trim();
    req.user = verifyAdminToken(token);

    const { data: user, error } = await supabase
      .from('users')
      .select('email_verified, token_version, is_superadmin, is_active')
      .eq('id', req.user.userId)
      .maybeSingle();

    if (error) throwDbError(error, 'requireSuperAdmin');

    if (!user || user.email_verified !== 'true') {
      next(new AppError('Authentication required', 401));
      return;
    }

    if (String(user.is_superadmin || 'false') !== 'true') {
      next(new AppError('Superadmin access required', 403));
      return;
    }

    if (String(user.is_active || 'true') === 'false') {
      next(new AppError('This account has been deactivated.', 403));
      return;
    }

    const dbVersion = String(user.token_version ?? '0');
    const tokenVersion = String(req.user.tokenVersion ?? '0');
    if (dbVersion !== tokenVersion) {
      next(new AppError('Session expired. Please sign in again.', 401));
      return;
    }

    next();
  } catch (e) {
    if (e instanceof AppError) {
      next(e);
      return;
    }
    next(new AppError('Invalid or expired token', 401));
  }
}

export function requireSuperAdmin(): RequestHandler {
  return (req, res, next) => {
    void runRequireSuperAdmin(req as AuthenticatedRequest, res, next).catch(
      next
    );
  };
}
