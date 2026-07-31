import { NextFunction, Request, Response } from 'express';
import { AuthSession } from '../types';
import { verifyToken } from '../utils/jwt';
import { AppError } from './errorHandler';

export interface AuthenticatedRequest extends Request {
  user?: AuthSession;
}

export function requireAuth(
  req: AuthenticatedRequest,
  _res: Response,
  next: NextFunction
): void {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    next(new AppError('Authentication required', 401));
    return;
  }

  try {
    const token = header.slice('Bearer '.length).trim();
    req.user = verifyToken(token);
    next();
  } catch {
    next(new AppError('Invalid or expired token', 401));
  }
}
