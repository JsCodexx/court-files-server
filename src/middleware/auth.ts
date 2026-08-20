import { NextFunction, Request, Response } from 'express';
import { AuthSession } from '../types';
import { verifyToken } from '../utils/jwt';
import { AppError } from './errorHandler';
import { supabase } from '../db';

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
      .select('email_verified')
      .eq('id', req.user.userId)
      .maybeSingle();

    if (error) throw error;

    // Block unverified accounts even if the JWT is otherwise valid.
    if (!user || user.email_verified !== 'true') {
      next(
        new AppError(
          'Please verify your email before logging in.',
          403
        )
      );
      return;
    }

    next();
  } catch (e) {
    next(
      new AppError(
        e instanceof Error ? e.message : 'Invalid or expired token',
        401
      )
    );
  }
}
