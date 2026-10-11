import { NextFunction, Request, RequestHandler, Response } from 'express';
import { AuthSession } from '../types';
import { verifyToken } from '../utils/jwt';
import { AppError } from './errorHandler';
import { supabase } from '../db';
import { throwDbError } from '../utils/dbError';

export interface AuthenticatedRequest extends Request {
  user?: AuthSession;
}

type RequireAuthOptions = {
  /** Allow tokens for users who must change password ( /auth/me, /auth/change-password ). */
  allowBeforePasswordChange?: boolean;
};

async function runRequireAuth(
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction,
  options: RequireAuthOptions
): Promise<void> {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    next(new AppError('Authentication required', 401));
    return;
  }

  try {
    const token = header.slice('Bearer '.length).trim();
    req.user = verifyToken(token);

    const { data: user, error } = await supabase
      .from('users')
      .select('email_verified, token_version, must_change_password')
      .eq('id', req.user.userId)
      .maybeSingle();

    if (error) throwDbError(error, 'requireAuth');

    if (!user || user.email_verified !== 'true') {
      next(
        new AppError('Please verify your email before logging in.', 403)
      );
      return;
    }

    const dbVersion = String(user.token_version ?? '0');
    const tokenVersion = String(req.user.tokenVersion ?? '0');
    if (dbVersion !== tokenVersion) {
      next(new AppError('Session expired. Please sign in again.', 401));
      return;
    }

    const mustChange =
      String(user.must_change_password || 'false') === 'true';
    req.user.mustChangePassword = mustChange;

    if (mustChange && !options.allowBeforePasswordChange) {
      next(
        new AppError(
          'You must set a new password before using the app.',
          403
        )
      );
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

/** Standard auth — blocks API use until password change completes. */
export function requireAuth(options?: RequireAuthOptions): RequestHandler {
  const opts = options ?? {};
  return (req, res, next) => {
    void runRequireAuth(req as AuthenticatedRequest, res, next, opts);
  };
}

/** Same as requireAuth but allows must-change-password accounts (profile + change-password only). */
export const requireAuthAllowPasswordChange = requireAuth({
  allowBeforePasswordChange: true,
});
