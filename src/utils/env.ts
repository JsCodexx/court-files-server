const INSECURE_JWT_FALLBACK = 'dev-insecure-secret-change-me';

export function requireJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  const isProd = process.env.NODE_ENV === 'production';

  if (!secret || secret === INSECURE_JWT_FALLBACK) {
    if (isProd) {
      throw new Error(
        'JWT_SECRET must be set to a strong random value in production'
      );
    }
    return INSECURE_JWT_FALLBACK;
  }

  if (isProd && secret.length < 32) {
    throw new Error('JWT_SECRET must be at least 32 characters in production');
  }

  return secret;
}

/** Demo OTP in API responses — disabled in production by default. */
export function isDemoOtpInResponseEnabled(): boolean {
  if (process.env.DEMO_OTP_IN_RESPONSE === 'true') return true;
  if (process.env.DEMO_OTP_IN_RESPONSE === 'false') return false;
  return process.env.NODE_ENV !== 'production';
}

/**
 * Demo payment confirm + local checkout without RapidGateway.
 * Off in production unless explicitly enabled (never on live EC2).
 */
export function isDemoPaymentsEnabled(): boolean {
  if (process.env.DEMO_PAYMENTS_ENABLED === 'true') return true;
  if (process.env.DEMO_PAYMENTS_ENABLED === 'false') return false;
  return process.env.NODE_ENV !== 'production';
}

/** Comma-separated emails that always receive premium (internal testing). */
export function getDevPremiumEmails(): string[] {
  const raw =
    process.env.DEV_PREMIUM_EMAILS ??
    'muhammadnomi425@gmail.com,thej4joker@gmail.com,aliwheed@gmail.com';
  return raw
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isDevPremiumEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const normalized = email.trim().toLowerCase();
  return getDevPremiumEmails().includes(normalized);
}

export const MIN_PASSWORD_LENGTH = 8;
export const MAX_OTP_ATTEMPTS = 5;
