import crypto from 'crypto';

/**
 * Rapid Gateway / RapidPay — OAuth then hosted checkout.
 * Token: POST https://secure.rapid-gateway.com/oauth2/token
 *   client_id = merchant id, client_secret = API key
 * Pay: POST https://secure.rapid-gateway.com/rapid/process-transaction
 *      application/x-www-form-urlencoded; success is a redirect URL
 *      to https://secure.rapid-gateway.com/?<jwt>
 */

type TokenCache = { accessToken: string; expiresAtMs: number };

let tokenCache: TokenCache | null = null;

export function isRapidGatewayConfigured(): boolean {
  return Boolean(
    process.env.RAPIDGATEWAY_API_KEY?.trim() &&
      process.env.RAPIDGATEWAY_MERCHANT_ID?.trim()
  );
}

export function rapidGatewayApiBase(): string {
  return (
    process.env.RAPIDGATEWAY_API_BASE?.replace(/\/$/, '') ||
    'https://secure.rapid-gateway.com'
  );
}

export function rapidGatewayMerchantId(): string {
  return String(process.env.RAPIDGATEWAY_MERCHANT_ID || '').trim();
}

/** Local 03XXXXXXXXX as required by Rapid hosted checkout. */
export function toLocal03Phone(phone: string): string {
  const digits = phone.trim().replace(/[^\d]/g, '');
  if (/^03\d{9}$/.test(digits)) return digits;
  if (/^923\d{9}$/.test(digits)) return `0${digits.slice(2)}`;
  if (/^3\d{9}$/.test(digits)) return `0${digits}`;
  return phone.trim();
}

/** E.164 +92… (webhooks / wallets). */
export function toE164PkPhone(phone: string): string {
  const local = toLocal03Phone(phone);
  if (/^03\d{9}$/.test(local)) return `+92${local.slice(1)}`;
  return phone.trim();
}

export function paymentMethods(): string[] {
  const raw = process.env.RAPIDGATEWAY_METHODS?.trim();
  if (raw) {
    return raw
      .split(',')
      .map((m) => m.trim())
      .filter(Boolean);
  }
  return ['easypaisa', 'jazzcash', 'card', 'raast', 'wallet'];
}

async function parseJsonResponse(
  res: Response
): Promise<Record<string, unknown>> {
  const text = await res.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error(
      `RapidGateway returned non-JSON (${res.status}): ${text.slice(0, 240)}`
    );
  }
}

function pickString(obj: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const v = obj[key];
    if (typeof v === 'string' && v.trim()) return v.trim();
    if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  }
  return '';
}

function cacheToken(json: Record<string, unknown>): string | null {
  const token = pickString(json, [
    'access_token',
    'accessToken',
    'token',
    'bearerToken',
  ]);
  if (!token) return null;
  const expiresIn = Number(json.expires_in || json.expiresIn || 3600);
  tokenCache = {
    accessToken: token,
    expiresAtMs: Date.now() + Math.max(60, expiresIn) * 1000,
  };
  return token;
}

/**
 * Exchange merchant id (client_id) + API key (client_secret) for a Bearer token.
 * Endpoint confirmed by merchant tester: https://secure.rapid-gateway.com/oauth2/token
 */
export async function getRapidAccessToken(forceRefresh = false): Promise<string> {
  if (!isRapidGatewayConfigured()) {
    throw new Error('RapidGateway is not configured');
  }

  if (
    !forceRefresh &&
    tokenCache &&
    tokenCache.expiresAtMs > Date.now() + 30_000
  ) {
    return tokenCache.accessToken;
  }

  const tokenUrl =
    process.env.RAPIDGATEWAY_TOKEN_URL?.trim() ||
    'https://secure.rapid-gateway.com/oauth2/token';
  const merchantId = rapidGatewayMerchantId();
  const apiKey = process.env.RAPIDGATEWAY_API_KEY!.trim();
  const scope =
    process.env.RAPIDGATEWAY_OAUTH_SCOPE?.trim() || 'read openid profile';
  const basic = Buffer.from(`${merchantId}:${apiKey}`).toString('base64');

  // Match Rapid portal tester: client_id + client_secret (+ grant_type).
  const attempts: Array<{
    headers: Record<string, string>;
    body: string;
  }> = [
    {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: merchantId,
        client_secret: apiKey,
      }).toString(),
    },
    {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: merchantId,
        client_secret: apiKey,
        scope,
      }).toString(),
    },
    {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
        Authorization: `Basic ${basic}`,
      },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
      }).toString(),
    },
    {
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        grant_type: 'client_credentials',
        client_id: merchantId,
        client_secret: apiKey,
      }),
    },
  ];

  let lastError = 'Unable to obtain RapidGateway access token';

  for (const attempt of attempts) {
    try {
      const res = await fetch(tokenUrl, {
        method: 'POST',
        headers: attempt.headers,
        body: attempt.body,
      });
      const json = await parseJsonResponse(res);
      const token = cacheToken(json);
      if (res.ok && token) return token;
      lastError =
        pickString(json, ['error_description', 'error', 'message', 'detail']) ||
        `Token HTTP ${res.status}`;
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
  }

  throw new Error(`RapidGateway OAuth failed: ${lastError}`);
}

export interface CreateRapidPaymentInput {
  amountPkr: number;
  merchantTransactionId: string;
  customer: { email: string; phone: string; name?: string };
  successUrl: string;
  failureUrl: string;
  checkoutUrl: string;
  description?: string;
}

export interface CreateRapidPaymentResult {
  id: string;
  checkoutUrl: string;
  raw: Record<string, unknown>;
}

function todayYmd(): string {
  return new Date().toISOString().slice(0, 10);
}

function buildProcessTransactionForm(
  input: CreateRapidPaymentInput
): URLSearchParams {
  const merchantName =
    process.env.RAPIDGATEWAY_MERCHANT_NAME?.trim() || 'Court Files';
  const form = new URLSearchParams();
  form.set('MERCHANT_ID', rapidGatewayMerchantId());
  form.set('MERCHANT_NAME', merchantName);
  form.set('TXNAMT', Number(input.amountPkr).toFixed(2));
  form.set('CURRENCY_CODE', 'PKR');
  form.set('BASKET_ID', input.merchantTransactionId.slice(0, 64));
  form.set('CUSTOMER_MOBILE_NO', toLocal03Phone(input.customer.phone));
  form.set('CUSTOMER_EMAIL_ADDRESS', input.customer.email);
  form.set('SUCCESS_URL', input.successUrl);
  form.set('FAILURE_URL', input.failureUrl);
  form.set('CHECKOUT_URL', input.checkoutUrl);
  form.set('TXNDESC', (input.description || 'Court Files subscription').slice(0, 80));
  form.set('ORDER_DATE', todayYmd());
  form.set('PROCCODE', '0');
  form.set('VERSION', process.env.RAPIDGATEWAY_VERSION?.trim() || 'MY_VER_1.0');
  return form;
}

async function postProcessTransaction(
  url: string,
  accessToken: string,
  formBody: string
): Promise<Response> {
  return fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json, text/plain, */*',
      'X-Merchant-Id': rapidGatewayMerchantId(),
    },
    body: formBody,
    redirect: 'manual',
  });
}

export async function createRapidPayment(
  input: CreateRapidPaymentInput
): Promise<CreateRapidPaymentResult> {
  if (!isRapidGatewayConfigured()) {
    throw new Error('RapidGateway is not configured');
  }

  const accessToken = await getRapidAccessToken();
  const base = rapidGatewayApiBase();
  const path =
    process.env.RAPIDGATEWAY_PAYMENT_PATH?.trim() ||
    '/rapid/process-transaction';
  const url = path.startsWith('http')
    ? path
    : `${base}${path.startsWith('/') ? '' : '/'}${path}`;

  const formBody = buildProcessTransactionForm(input).toString();
  const res = await postProcessTransaction(url, accessToken, formBody);

  // One retry on auth failure with fresh token
  if (res.status === 401 || res.status === 403) {
    const retryToken = await getRapidAccessToken(true);
    const retry = await postProcessTransaction(url, retryToken, formBody);
    return finalizePaymentResponse(retry, input.merchantTransactionId);
  }

  return finalizePaymentResponse(res, input.merchantTransactionId);
}

function looksLikeHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value.trim());
}

function extractCheckoutUrl(
  res: Response,
  text: string,
  json: Record<string, unknown>
): string {
  const location = res.headers.get('location') || res.headers.get('Location') || '';
  if (looksLikeHttpUrl(location)) return location.trim();

  const data =
    (json.data as Record<string, unknown> | undefined) ||
    (json.result as Record<string, unknown> | undefined) ||
    json;

  const fromJson = pickString(data, [
    'checkout_url',
    'checkoutUrl',
    'redirect_url',
    'redirectUrl',
    'paymentUrl',
    'payment_url',
    'url',
    'href',
  ]);
  if (looksLikeHttpUrl(fromJson)) return fromJson;

  const trimmed = text.trim();
  if (looksLikeHttpUrl(trimmed) && !trimmed.includes('\n') && trimmed.length < 4000) {
    return trimmed;
  }

  const quoted = trimmed.match(/https?:\/\/secure\.rapid-gateway\.com\/\?[A-Za-z0-9._=-]+/);
  if (quoted?.[0]) return quoted[0];

  const anySecure = trimmed.match(/https?:\/\/[^\s"'<>]+/);
  if (anySecure?.[0] && /rapid-gateway\.com/i.test(anySecure[0])) {
    return anySecure[0];
  }

  return '';
}

async function finalizePaymentResponse(
  res: Response,
  merchantTransactionId: string
): Promise<CreateRapidPaymentResult> {
  const text = await res.text();
  let json: Record<string, unknown> = {};
  if (text) {
    try {
      json = JSON.parse(text) as Record<string, unknown>;
    } catch {
      json = {};
    }
  }

  const redirected = res.status >= 300 && res.status < 400;
  const checkoutUrl = extractCheckoutUrl(res, text, json);

  if (!res.ok && !redirected) {
    const data =
      (json.data as Record<string, unknown> | undefined) ||
      (json.result as Record<string, unknown> | undefined) ||
      json;
    const msg =
      pickString(json, ['message', 'error', 'error_description', 'detail']) ||
      pickString(data, ['message', 'error', 'detail']) ||
      (text ? text.slice(0, 240) : `RapidGateway HTTP ${res.status}`);
    throw new Error(msg);
  }

  if (!checkoutUrl) {
    throw new Error(
      `RapidGateway response missing checkout URL (HTTP ${res.status}). Body: ${text.slice(0, 200) || 'empty'}`
    );
  }

  const id = pickString(json, [
    'id',
    'payment_id',
    'paymentId',
    'gatewayTxnRef',
    'transactionId',
    'txnId',
    'transactionReference',
  ]);

  return {
    id: id || merchantTransactionId,
    checkoutUrl,
    raw: Object.keys(json).length ? json : { location: checkoutUrl },
  };
}

/**
 * Verify X-RapidGateway-Signature (HMAC-SHA256 uppercase hex of timestamp + "." + rawBody).
 * Fail closed when live gateway keys or production env — secret is required.
 */
export function verifyRapidWebhookSignature(input: {
  timestamp: string;
  rawBody: string;
  signature: string;
}): boolean {
  const salt = process.env.RAPIDGATEWAY_WEBHOOK_SECRET?.trim();
  if (!salt) {
    const failClosed =
      isRapidGatewayConfigured() || process.env.NODE_ENV === 'production';
    if (failClosed) {
      console.error(
        'RAPIDGATEWAY_WEBHOOK_SECRET not set — rejecting webhook (fail closed)'
      );
      return false;
    }
    console.warn(
      'RAPIDGATEWAY_WEBHOOK_SECRET not set — accepting webhook in local dev only'
    );
    return true;
  }
  if (!input.timestamp || !input.signature) return false;

  const ts = Number(input.timestamp);
  if (!Number.isFinite(ts)) return false;
  if (Math.abs(Math.floor(Date.now() / 1000) - ts) > 300) return false;

  const expected = crypto
    .createHmac('sha256', salt)
    .update(`${input.timestamp}.${input.rawBody}`)
    .digest('hex')
    .toUpperCase();

  const a = Buffer.from(expected);
  const b = Buffer.from(String(input.signature).toUpperCase());
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
