import { supabase } from '../db';
import { AppError } from '../middleware/errorHandler';
import { AuthSession, AuthUserResponse } from '../types';
import { signToken } from '../utils/jwt';
import { generateOtp, otpExpiresAt } from '../utils/otp';
import { hashPassword, verifyPassword } from '../utils/password';

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

  const session = toSession(row);
  return {
    token: signToken(session),
    user: toUserResponse(row),
  };
}

export async function forgotPassword(phone: string): Promise<{ otp: string }> {
  const trimmed = phone.trim();

  const { data: user, error } = await supabase
    .from('users')
    .select('id')
    .eq('phone', trimmed)
    .maybeSingle();

  if (error) throw new AppError(error.message, 500);
  if (!user) throw new AppError('No account found for this phone number.', 404);

  const otp = generateOtp();
  const { error: upsertError } = await supabase.from('password_resets').upsert(
    {
      phone: trimmed,
      otp,
      expires_at: otpExpiresAt(10).toISOString(),
      created_at: new Date().toISOString(),
    },
    { onConflict: 'phone' }
  );

  if (upsertError) throw new AppError(upsertError.message, 500);

  return { otp };
}

export async function resetPassword(
  phone: string,
  otp: string,
  newPassword: string
): Promise<void> {
  if (newPassword.length < 6) {
    throw new AppError('Password must be at least 6 characters.');
  }

  const trimmed = phone.trim();
  const { data: row, error } = await supabase
    .from('password_resets')
    .select('*')
    .eq('phone', trimmed)
    .maybeSingle();

  if (error) throw new AppError(error.message, 500);
  if (!row) throw new AppError('No password reset in progress.');

  if (new Date(row.expires_at).getTime() < Date.now()) {
    await supabase.from('password_resets').delete().eq('phone', trimmed);
    throw new AppError('OTP has expired. Please try again.');
  }

  if (row.otp !== otp.trim()) {
    throw new AppError('Invalid OTP. Please try again.');
  }

  const passwordHash = await hashPassword(newPassword);
  const { error: updateError } = await supabase
    .from('users')
    .update({ password_hash: passwordHash })
    .eq('phone', trimmed);

  if (updateError) throw new AppError(updateError.message, 500);

  await supabase.from('password_resets').delete().eq('phone', trimmed);
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
