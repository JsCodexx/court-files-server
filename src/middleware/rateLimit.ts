import { NextFunction, Request, Response } from 'express';
import { AppError } from './errorHandler';

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

const SWEEP_EVERY = 200;
let hits = 0;

function clientKey(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0].trim();
  }
  return req.ip || req.socket.remoteAddress || 'unknown';
}

export function rateLimit(options: {
  windowMs: number;
  max: number;
  prefix: string;
}) {
  return (req: Request, _res: Response, next: NextFunction) => {
    hits += 1;
    if (hits % SWEEP_EVERY === 0) {
      const now = Date.now();
      for (const [key, bucket] of buckets) {
        if (bucket.resetAt <= now) buckets.delete(key);
      }
    }

    const id = `${options.prefix}:${clientKey(req)}`;
    const now = Date.now();
    const bucket = buckets.get(id);

    if (!bucket || bucket.resetAt <= now) {
      buckets.set(id, { count: 1, resetAt: now + options.windowMs });
      next();
      return;
    }

    if (bucket.count >= options.max) {
      next(
        new AppError('Too many requests. Please wait and try again.', 429)
      );
      return;
    }

    bucket.count += 1;
    next();
  };
}
