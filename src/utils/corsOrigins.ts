/** Normalize browser Origin / configured URL for set comparison (no trailing slash). */
export function normalizeOrigin(value: string): string {
  return value.trim().replace(/\/+$/, '');
}

/** Comma-separated `CORS_ORIGIN` — must list every frontend origin that calls the API in the browser. */
export function getCorsAllowlist(): string[] {
  const raw =
    process.env.CORS_ORIGIN ||
    'http://localhost:4400,http://localhost:5173';
  const origins = raw
    .split(',')
    .map(normalizeOrigin)
    .filter(Boolean);
  return [...new Set(origins)];
}

/** Warn in production if FRONTEND_URL is missing from the CORS allowlist (common misconfig). */
export function assertCorsMatchesFrontend(): void {
  if (process.env.NODE_ENV !== 'production') return;

  const allowlist = new Set(getCorsAllowlist());
  const frontend = process.env.FRONTEND_URL?.trim();
  if (!frontend) return;

  const normalized = normalizeOrigin(frontend);
  if (!allowlist.has(normalized)) {
    console.warn(
      `[cors] FRONTEND_URL (${normalized}) is not in CORS_ORIGIN. Browser checkout and login may fail until both match.`
    );
  }
}
