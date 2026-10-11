import { NextFunction, RequestHandler, Response } from 'express';
import { assertCanAccessApp } from '../services/subscriptionService';
import { AuthenticatedRequest } from './auth';
import { AppError } from './errorHandler';

/** Blocks app use when free case limit exceeded and subscription is not active. */
export function requireAppAccess(): RequestHandler {
  return (req, res, next) => {
    void runAppAccess(req as AuthenticatedRequest, res, next);
  };
}

async function runAppAccess(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  if (!req.user?.userId) {
    next(new AppError('Authentication required', 401));
    return;
  }
  try {
    await assertCanAccessApp(req.user.userId);
    next();
  } catch (e) {
    next(e);
  }
}
