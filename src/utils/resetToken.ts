import { createHash, randomBytes, randomInt, timingSafeEqual } from 'crypto';

const RESET_TTL_MINUTES = Number(process.env.RESET_TOKEN_TTL_MINUTES || 15);

export function generateOtp(): string {
  return String(randomInt(100000, 1000000));
}

export function generateResetToken(): string {
  return randomBytes(32).toString('hex');
}

export function hashResetToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export function resetTokenMatches(token: string, tokenHash: string): boolean {
  const a = Buffer.from(hashResetToken(token.trim()), 'hex');
  const b = Buffer.from(tokenHash, 'hex');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function resetExpiresAt(minutes = RESET_TTL_MINUTES): Date {
  return new Date(Date.now() + minutes * 60 * 1000);
}

export function resetTtlMinutes(): number {
  return RESET_TTL_MINUTES;
}
