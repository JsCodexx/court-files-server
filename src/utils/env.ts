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

export const MIN_PASSWORD_LENGTH = 8;
export const MAX_OTP_ATTEMPTS = 5;
