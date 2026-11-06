-- SKEBOB AI: opaque server-side sessions for Telegram accounts.
-- Apply this migration in Supabase SQL Editor before deploying quick-function.

create table if not exists public.app_sessions (
  token_hash text primary key check (char_length(token_hash) = 64),
  user_id uuid not null references public.app_users(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists app_sessions_user_id_idx
  on public.app_sessions (user_id);

create index if not exists app_sessions_expires_at_idx
  on public.app_sessions (expires_at);

alter table public.app_sessions enable row level security;
revoke all on table public.app_sessions from anon, authenticated;

-- Sessions are only read/written by the Edge Function using its server-side
-- SUPABASE_SERVICE_ROLE_KEY. Never expose that key in the website.
