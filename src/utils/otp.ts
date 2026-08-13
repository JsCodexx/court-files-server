import { randomInt } from 'crypto';

export function generateOtp(): string {
  return String(randomInt(100000, 1000000));
}

export function otpExpiresAt(minutes = 10): Date {
  return new Date(Date.now() + minutes * 60 * 1000);
}
