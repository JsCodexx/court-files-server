import jwt from 'jsonwebtoken';
import { AuthSession } from '../types';
import { requireJwtSecret } from './env';
import { AppError } from '../middleware/errorHandler';

const JWT_SECRET = requireJwtSecret();
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';
const JWT_ALGORITHM = 'HS256' as const;

function signSession(session: AuthSession): string {
  return jwt.sign(session, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN,
    algorithm: JWT_ALGORITHM,
  } as jwt.SignOptions);
}

function verifyRaw(token: string): AuthSession {
  return jwt.verify(token, JWT_SECRET, {
    algorithms: [JWT_ALGORITHM],
  }) as AuthSession;
}

/** Court Files mobile/web app (advocate accounts). */
export function signAppToken(
  session: Omit<AuthSession, 'tokenType' | 'role'>
): string {
  return signSession({
    ...session,
    tokenType: 'app',
    role: 'user',
  });
}

/** Superadmin dashboard only — must not be accepted by requireAuth. */
export function signAdminToken(
  session: Omit<AuthSession, 'tokenType' | 'role' | 'mustChangePassword'>
): string {
  return signSession({
    ...session,
    tokenType: 'admin',
    role: 'superadmin',
    mustChangePassword: false,
  });
}

/** @deprecated Use signAppToken or signAdminToken */
export function signToken(session: AuthSession): string {
  return signSession(session);
}

export function verifyAppToken(token: string): AuthSession {
  const session = verifyRaw(token);

  if (session.tokenType === 'admin' || session.role === 'superadmin') {
    throw new AppError(
      'This token is for the admin dashboard only. Sign in via the Court Files app.',
      403
    );
  }

  return session;
}

export function verifyAdminToken(token: string): AuthSession {
  const session = verifyRaw(token);

  if (session.tokenType !== 'admin' || session.role !== 'superadmin') {
    throw new AppError('Superadmin access required', 403);
  }

  return session;
}

/** Low-level verify — prefer verifyAppToken / verifyAdminToken. */
export function verifyToken(token: string): AuthSession {
  return verifyRaw(token);
}
