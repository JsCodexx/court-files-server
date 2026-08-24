import jwt from 'jsonwebtoken';
import { AuthSession } from '../types';
import { requireJwtSecret } from './env';

const JWT_SECRET = requireJwtSecret();
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';
const JWT_ALGORITHM = 'HS256' as const;

export function signToken(session: AuthSession): string {
  return jwt.sign(session, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN,
    algorithm: JWT_ALGORITHM,
  } as jwt.SignOptions);
}

export function verifyToken(token: string): AuthSession {
  return jwt.verify(token, JWT_SECRET, {
    algorithms: [JWT_ALGORITHM],
  }) as AuthSession;
}
