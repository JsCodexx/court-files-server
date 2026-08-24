import { NextFunction, Request, Response } from 'express';
import { AuthSession } from '../types';
import { verifyToken } from '../utils/jwt';
import { AppError } from './errorHandler';
import { supabase } from '../db';
import { throwDbError } from '../utils/dbError';

export interface AuthenticatedRequest extends Request {
  user?: AuthSession;
}

export async function requireAuth(
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
    req.user = verifyToken(token);

    const { data: user, error } = await supabase
      .from('users')
      .select('email_verified, token_version')
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

    next();
  } catch (e) {
    if (e instanceof AppError) {
      next(e);
      return;
    }
    next(new AppError('Invalid or expired token', 401));
  }
}
