import { supabase } from '../db';
import { AppError } from '../middleware/errorHandler';
import { AuthUserResponse } from '../types';
import { throwDbError } from '../utils/dbError';
import { signAdminToken } from '../utils/jwt';
import { verifyPassword } from '../utils/password';

interface AdminUserRow {
  id: string;
  name: string;
  phone: string;
  email: string;
  bar_address: string;
  password_hash: string;
  email_verified: string;
  token_version?: string | null;
  must_change_password?: string | null;
  is_active?: string | null;
  is_superadmin?: string | null;
}

function parseTokenVersion(raw: string | number | null | undefined): number {
  const n = parseInt(String(raw ?? '0'), 10);
  return Number.isFinite(n) ? n : 0;
}

function toAdminUserResponse(user: AdminUserRow): AuthUserResponse {
  return {
    userId: user.id,
    email: user.email,
    name: user.name,
    phone: user.phone,
    barAddress: user.bar_address,
    tokenVersion: parseTokenVersion(user.token_version),
    mustChangePassword: false,
    role: 'superadmin',
  };
}

export async function adminLogin(
  email: string,
  password: string
): Promise<{ token: string; user: AuthUserResponse }> {
  const normalized = email.trim().toLowerCase();
  const { data: user, error } = await supabase
    .from('users')
    .select('*')
    .eq('email', normalized)
    .maybeSingle();

  if (error) throwDbError(error, 'adminLogin');
  if (!user) throw new AppError('Invalid credentials.', 401);

  const row = user as AdminUserRow;
  if (String(row.is_superadmin || 'false') !== 'true') {
    throw new AppError('Invalid credentials.', 401);
  }

  const valid = await verifyPassword(password, row.password_hash);
  if (!valid) throw new AppError('Invalid credentials.', 401);

  if (row.email_verified !== 'true') {
    throw new AppError('Please verify your email before logging in.', 403);
  }

  if (String(row.is_active || 'true') === 'false') {
    throw new AppError('This account has been deactivated.', 403);
  }

  return {
    token: signAdminToken({
      userId: row.id,
      email: row.email,
      name: row.name,
      tokenVersion: parseTokenVersion(row.token_version),
    }),
    user: toAdminUserResponse(row),
  };
}
