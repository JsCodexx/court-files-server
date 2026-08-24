-- Private per-clerk proceeding labels.
-- Run in the Supabase SQL editor.

create table if not exists public.user_proceedings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  label text not null,
  created_at timestamptz not null default now()
);

create unique index if not exists idx_user_proceedings_user_label
  on public.user_proceedings (user_id, lower(trim(label)));

alter table public.user_proceedings enable row level security;
