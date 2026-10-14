/**
 * One-off prod smoke: publishable Supabase REST vs Express API.
 * Usage: node scripts/smoke-prod-access.mjs
 * Reads .env.production from cwd parent (court_files_server).
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import jwt from 'jsonwebtoken';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const envPath = path.join(root, '.env.production');
const envText = fs.readFileSync(envPath, 'utf8');
const env = {};
for (const line of envText.split(/\r?\n/)) {
  const t = line.trim();
  if (!t || t.startsWith('#')) continue;
  const i = t.indexOf('=');
  if (i === -1) continue;
  env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
}

const SUPABASE_URL = env.SUPABASE_URL;
const PUBLISHABLE = env.SUPABASE_PUBLISHABLE_KEY;
const API = (env.API_PUBLIC_URL || 'https://api.clerkdiary.com').replace(/\/$/, '');
const JWT_SECRET = env.JWT_SECRET;

/** Known prod user for JWT smoke (email public in repo/docs). */
const SMOKE_USER = {
  userId: '8bcad53c-a92e-4aa6-a96b-b569a6a297ad',
  email: 'muhammadnomi425@gmail.com',
  tokenVersion: '1',
};

async function supabaseRest(table, select = 'id', key = PUBLISHABLE) {
  const url = `${SUPABASE_URL}/rest/v1/${table}?select=${select}&limit=3`;
  const res = await fetch(url, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
    },
  });
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text.slice(0, 200);
  }
  const count = Array.isArray(body) ? body.length : null;
  const denied =
    res.status === 401 ||
    res.status === 403 ||
    (typeof body === 'object' &&
      body !== null &&
      !Array.isArray(body) &&
      (body.code === '42501' || body.message?.includes?.('permission')));
  return { status: res.status, count, denied, hasRows: count > 0 };
}

async function apiGet(path, token) {
  const headers = { Accept: 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API}${path}`, { headers });
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text.slice(0, 200);
  }
  return { status: res.status, body };
}

const token = jwt.sign(
  {
    userId: SMOKE_USER.userId,
    email: SMOKE_USER.email,
    tokenVersion: SMOKE_USER.tokenVersion,
  },
  JWT_SECRET,
  { expiresIn: '1h', algorithm: 'HS256' }
);

async function safe(label, fn) {
  try {
    return await fn();
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

const SECRET = env.SUPABASE_SECRET_KEY;

const results = {
  supabase_users: await safe('supabase_users', () =>
    supabaseRest('users', 'id,email', PUBLISHABLE)
  ),
  supabase_cases: await safe('supabase_cases', () =>
    supabaseRest('cases', 'id,case_id', PUBLISHABLE)
  ),
  supabase_users_secret: await safe('supabase_users_secret', () =>
    supabaseRest('users', 'id', SECRET)
  ),
  api_health: await safe('api_health', () => apiGet('/api/health')),
  api_cases_no_auth: await safe('api_cases_no_auth', () => apiGet('/api/cases')),
  api_cases_with_jwt: await safe('api_cases_with_jwt', () =>
    apiGet('/api/cases', token)
  ),
};

function packSupabase(r) {
  if (r?.error) return { error: r.error };
  return {
    httpStatus: r.status,
    rowsReturned: r.count,
    blocked: r.denied || r.count === 0,
  };
}

function packApi(r) {
  if (r?.error) return { error: r.error };
  return { httpStatus: r.status, bodySummary: r.body?.ok ?? r.body?.error ?? r.body };
}

const casesAuth = results.api_cases_with_jwt?.body;
const caseCount = Array.isArray(casesAuth?.cases) ? casesAuth.cases.length : null;

console.log(
  JSON.stringify(
    {
      directSupabase: {
        publishableKey: {
          users: packSupabase(results.supabase_users),
          cases: packSupabase(results.supabase_cases),
        },
        secretKeySanityCheck: {
          users: packSupabase(results.supabase_users_secret),
          note: 'Server-only; should still read (bypasses RLS). Not compared in output.',
        },
      },
      expressApi: {
        health: packApi(results.api_health),
        casesWithoutToken: {
          ...packApi(results.api_cases_no_auth),
          rejectsAnonymous:
            results.api_cases_no_auth?.status === 401 ||
            results.api_cases_no_auth?.status === 403,
        },
        casesWithValidJwt: {
          ...packApi(results.api_cases_with_jwt),
          casesReturned: caseCount,
          works: results.api_cases_with_jwt?.status === 200 && caseCount !== null,
        },
      },
    },
    null,
    2
  )
);
