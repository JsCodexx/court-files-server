import { supabase } from '../db';
import { AppError } from '../middleware/errorHandler';
import { AuthSession, AuthUserResponse } from '../types';
import { signToken } from '../utils/jwt';
import { isMailConfigured, sendEmailVerification, sendPasswordResetEmail } from '../utils/mailer';
import { generateOtp, otpExpiresAt } from '../utils/otp';
import { hashPassword, verifyPassword } from '../utils/password';
import {
  generateResetToken,
  hashResetToken,
  resetExpiresAt,
  resetTtlMinutes,
} from '../utils/resetToken';

export interface RegisterInput {
  name: string;
  phone: string;
  email: string;
  barAddress: string;
  password: string;
}

interface UserRow {
  id: string;
  name: string;
  phone: string;
  email: string;
  bar_address: string;
  password_hash: string;
  email_verified: string;
  created_at: string;
}

function toSession(user: Pick<UserRow, 'id' | 'email' | 'name'>): AuthSession {
  return {
    userId: user.id,
    email: user.email,
    name: user.name,
  };
}

function toUserResponse(user: UserRow): AuthUserResponse {
  return {
    userId: user.id,
    email: user.email,
    name: user.name,
    phone: user.phone,
    barAddress: user.bar_address,
  };
}

export async function registerDraft(input: RegisterInput): Promise<{ otp: string }> {
  if (input.password.length < 6) {
    throw new AppError('Password must be at least 6 characters.');
  }

  const email = input.email.trim().toLowerCase();
  const phone = input.phone.trim();

  const { data: byEmail } = await supabase
    .from('users')
    .select('id')
    .eq('email', email)
    .maybeSingle();

  if (byEmail) {
    throw new AppError('Email is already registered.');
  }

  const { data: byPhone } = await supabase
    .from('users')
    .select('id')
    .eq('phone', phone)
    .maybeSingle();

  if (byPhone) {
    throw new AppError('Phone number is already registered.');
  }

  const otp = generateOtp();
  const passwordHash = await hashPassword(input.password);

  const { error } = await supabase.from('pending_otps').upsert(
    {
      phone,
      otp,
      name: input.name.trim(),
      email,
      bar_address: input.barAddress.trim(),
      password_hash: passwordHash,
      expires_at: otpExpiresAt(10).toISOString(),
      created_at: new Date().toISOString(),
    },
    { onConflict: 'phone' }
  );

  if (error) {
    throw new AppError(error.message, 500);
  }

  return { otp };
}

export async function verifyOtp(
  phone: string,
  otp: string
): Promise<{ token: string; user: AuthUserResponse }> {
  const { data: row, error } = await supabase
    .from('pending_otps')
    .select('*')
    .eq('phone', phone.trim())
    .maybeSingle();

  if (error) throw new AppError(error.message, 500);
  if (!row) throw new AppError('No registration in progress.');

  if (new Date(row.expires_at).getTime() < Date.now()) {
    await supabase.from('pending_otps').delete().eq('phone', phone.trim());
    throw new AppError('OTP has expired. Please register again.');
  }

  if (row.otp !== otp.trim()) {
    throw new AppError('Invalid OTP. Please try again.');
  }

  const { data: created, error: createError } = await supabase
    .from('users')
    .insert({
      name: row.name,
      phone: row.phone,
      email: row.email,
      bar_address: row.bar_address,
      password_hash: row.password_hash,
    })
    .select('*')
    .single();

  if (createError || !created) {
    throw new AppError(createError?.message || 'Failed to create user', 500);
  }

  await supabase.from('pending_otps').delete().eq('phone', phone.trim());

  // Send email verification
  if (isMailConfigured()) {
    const verifyToken = generateResetToken();
    const tokenHash = hashResetToken(verifyToken);
    await supabase.from('password_resets').upsert(
      {
        email: (created as UserRow).email,
        token_hash: tokenHash,
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        created_at: new Date().toISOString(),
      },
      { onConflict: 'email' }
    );
    const frontend = (process.env.FRONTEND_URL || 'http://localhost:4400').replace(/\/$/, '');
    const verifyUrl = `${frontend}/verify-email?token=${verifyToken}`;
    sendEmailVerification({
      to: (created as UserRow).email,
      name: (created as UserRow).name || 'Advocate',
      verifyUrl,
    }).catch((err) => console.error('Failed to send verification email:', err));
  }

  const session = toSession(created as UserRow);
  return {
    token: signToken(session),
    user: toUserResponse(created as UserRow),
  };
}

export async function resendOtp(phone: string): Promise<{ otp: string }> {
  const { data: row, error } = await supabase
    .from('pending_otps')
    .select('id')
    .eq('phone', phone.trim())
    .maybeSingle();

  if (error) throw new AppError(error.message, 500);
  if (!row) throw new AppError('No registration in progress.');

  const otp = generateOtp();
  const { error: updateError } = await supabase
    .from('pending_otps')
    .update({
      otp,
      expires_at: otpExpiresAt(10).toISOString(),
    })
    .eq('phone', phone.trim());

  if (updateError) throw new AppError(updateError.message, 500);

  return { otp };
}

export async function login(
  emailOrPhone: string,
  password: string
): Promise<{ token: string; user: AuthUserResponse }> {
  const identifier = emailOrPhone.trim();

  let query = supabase.from('users').select('*');
  if (identifier.includes('@')) {
    query = query.eq('email', identifier.toLowerCase());
  } else {
    query = query.eq('phone', identifier);
  }

  const { data: user, error } = await query.maybeSingle();

  if (error) throw new AppError(error.message, 500);
  if (!user) throw new AppError('Invalid credentials.', 401);

  const row = user as UserRow;
  const valid = await verifyPassword(password, row.password_hash);
  if (!valid) throw new AppError('Invalid credentials.', 401);

  if (row.email_verified !== 'true') {
    throw new AppError('Please verify your email before logging in.', 403);
  }

  const session = toSession(row);
  return {
    token: signToken(session),
    user: toUserResponse(row),
  };
}

export async function verifyEmail(token: string): Promise<void> {
  const tokenHash = hashResetToken(token.trim());
  const { data: row, error } = await supabase
    .from('password_resets')
    .select('*')
    .eq('token_hash', tokenHash)
    .maybeSingle();

  if (error) throw new AppError(error.message, 500);
  if (!row) throw new AppError('Invalid or expired verification link.', 400);

  if (new Date(row.expires_at).getTime() < Date.now()) {
    await supabase.from('password_resets').delete().eq('id', row.id);
    throw new AppError('Verification link has expired. Please request a new one.', 400);
  }

  const { error: updateError } = await supabase
    .from('users')
    .update({ email_verified: 'true' })
    .eq('email', row.email);

  if (updateError) throw new AppError(updateError.message, 500);

  await supabase.from('password_resets').delete().eq('email', row.email);
}

export async function resendVerification(email: string): Promise<void> {
  if (!isMailConfigured()) {
    throw new AppError('Email service is temporarily unavailable.', 503);
  }

  const normalized = email.trim().toLowerCase();
  const { data: user } = await supabase
    .from('users')
    .select('id, name, email, email_verified')
    .eq('email', normalized)
    .maybeSingle();

  if (!user || user.email_verified === 'true') return;

  const verifyToken = generateResetToken();
  const tokenHash = hashResetToken(verifyToken);
  await supabase.from('password_resets').upsert(
    {
      email: normalized,
      token_hash: tokenHash,
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      created_at: new Date().toISOString(),
    },
    { onConflict: 'email' }
  );

  const frontend = (process.env.FRONTEND_URL || 'http://localhost:4400').replace(/\/$/, '');
  const verifyUrl = `${frontend}/verify-email?token=${verifyToken}`;
  await sendEmailVerification({
    to: user.email,
    name: user.name || 'Advocate',
    verifyUrl,
  });
}

const RESET_COOLDOWN_MS = 60 * 1000;
const GENERIC_RESET_INVALID =
  'This reset link is invalid or has expired.';

export async function forgotPassword(email: string): Promise<void> {
  if (!isMailConfigured()) {
    throw new AppError('Password reset is temporarily unavailable.', 503);
  }

  const normalized = email.trim().toLowerCase();
  // Same CPU work whether or not the account exists (timing).
  const token = generateResetToken();
  const tokenHash = hashResetToken(token);

  const { data: user, error } = await supabase
    .from('users')
    .select('id, name, email')
    .eq('email', normalized)
    .maybeSingle();

  if (error) throw new AppError(error.message, 500);
  if (!user) return;

  const { data: existing, error: existingError } = await supabase
    .from('password_resets')
    .select('created_at')
    .eq('email', normalized)
    .maybeSingle();

  if (existingError) throw new AppError(existingError.message, 500);

  if (
    existing &&
    Date.now() - new Date(existing.created_at).getTime() < RESET_COOLDOWN_MS
  ) {
    return;
  }

  const { error: upsertError } = await supabase.from('password_resets').upsert(
    {
      email: normalized,
      token_hash: tokenHash,
      expires_at: resetExpiresAt().toISOString(),
      created_at: new Date().toISOString(),
    },
    { onConflict: 'email' }
  );

  if (upsertError) throw new AppError(upsertError.message, 500);

  const frontend = (process.env.FRONTEND_URL || 'http://localhost:4400').replace(
    /\/$/,
    ''
  );
  const resetUrl = `${frontend}/reset-password?token=${token}`;

  try {
    await sendPasswordResetEmail({
      to: user.email,
      name: user.name || 'Advocate',
      resetUrl,
      ttlMinutes: resetTtlMinutes(),
    });
  } catch (err) {
    console.error('Failed to send password reset email:', err);
    await supabase.from('password_resets').delete().eq('email', normalized);
  }
}

export async function resetPassword(
  token: string,
  newPassword: string
): Promise<void> {
  if (newPassword.length < 6) {
    throw new AppError('Password must be at least 6 characters.');
  }

  const tokenHash = hashResetToken(token.trim());
  const { data: row, error } = await supabase
    .from('password_resets')
    .select('*')
    .eq('token_hash', tokenHash)
    .maybeSingle();

  if (error) throw new AppError(error.message, 500);
  if (!row) throw new AppError(GENERIC_RESET_INVALID, 400);

  if (new Date(row.expires_at).getTime() < Date.now()) {
    await supabase.from('password_resets').delete().eq('id', row.id);
    throw new AppError(GENERIC_RESET_INVALID, 400);
  }

  const passwordHash = await hashPassword(newPassword);
  const { error: updateError } = await supabase
    .from('users')
    .update({ password_hash: passwordHash })
    .eq('email', row.email);

  if (updateError) throw new AppError(updateError.message, 500);

  await supabase.from('password_resets').delete().eq('email', row.email);
}

export async function getMe(userId: string): Promise<AuthUserResponse> {
  const { data: user, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', userId)
    .maybeSingle();

  if (error) throw new AppError(error.message, 500);
  if (!user) throw new AppError('User not found', 404);

  return toUserResponse(user as UserRow);
}

export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string
): Promise<void> {
  if (newPassword.length < 6) {
    throw new AppError('Password must be at least 6 characters.');
  }
  if (currentPassword === newPassword) {
    throw new AppError(
      'New password must be different from the current password.'
    );
  }

  const { data: user, error } = await supabase
    .from('users')
    .select('id, email, password_hash')
    .eq('id', userId)
    .maybeSingle();

  if (error) throw new AppError(error.message, 500);
  if (!user) throw new AppError('User not found', 404);

  const valid = await verifyPassword(currentPassword, user.password_hash);
  if (!valid) {
    throw new AppError('Current password is incorrect.');
  }

  const passwordHash = await hashPassword(newPassword);
  const { error: updateError } = await supabase
    .from('users')
    .update({ password_hash: passwordHash })
    .eq('id', userId);

  if (updateError) throw new AppError(updateError.message, 500);

  await supabase.from('password_resets').delete().eq('email', user.email);
}
