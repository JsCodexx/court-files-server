-- Hashed email reset tokens (replaces plaintext phone OTP).
-- Run in the Supabase SQL editor.

drop table if exists public.password_resets;

create table public.password_resets (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create index idx_password_resets_expires_at on public.password_resets (expires_at);

alter table public.password_resets enable row level security;
