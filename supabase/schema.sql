-- SKEBOB AI database foundation for Supabase (PostgreSQL)
-- Account identity is Telegram-only. Telegram login must be verified server-side.
-- The trusted backend assigns an internal UUID and issues a short-lived signed JWT
-- whose "sub" claim is that UUID and whose "role" is "authenticated".
-- Never sign tokens in browser code or expose the signing secret.
-- Review the JWT signing-key approach with current Supabase project settings before launch.

create table if not exists public.app_users (
  id uuid primary key default gen_random_uuid(),
  telegram_user_id bigint not null unique,
  telegram_username text,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.chat_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users(id) on delete cascade,
  title text not null default 'Новый чат' check (char_length(title) <= 160),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.chat_conversations(id) on delete cascade,
  user_id uuid not null references public.app_users(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null check (char_length(content) between 1 and 12000),
  created_at timestamptz not null default now()
);

create index if not exists chat_conversations_user_updated_idx
  on public.chat_conversations (user_id, updated_at desc);
create index if not exists chat_messages_conversation_created_idx
  on public.chat_messages (conversation_id, created_at asc);
create index if not exists chat_messages_user_created_idx
  on public.chat_messages (user_id, created_at desc);

alter table public.app_users enable row level security;
alter table public.chat_conversations enable row level security;
alter table public.chat_messages enable row level security;

revoke all on table public.app_users, public.chat_conversations, public.chat_messages from anon, authenticated;
grant select on table public.app_users to authenticated;
grant select, insert, update, delete on table public.chat_conversations to authenticated;
grant select, insert, delete on table public.chat_messages to authenticated;

create policy "Users read their own profile"
  on public.app_users for select to authenticated
  using ((select auth.uid()) = id);

create policy "Users read their own conversations"
  on public.chat_conversations for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Users create their own conversations"
  on public.chat_conversations for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy "Users update their own conversations"
  on public.chat_conversations for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
create policy "Users delete their own conversations"
  on public.chat_conversations for delete to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users read their own messages"
  on public.chat_messages for select to authenticated
  using ((select auth.uid()) = user_id);
create policy "Users add their own messages"
  on public.chat_messages for insert to authenticated
  with check (
    (select auth.uid()) = user_id
    and role = 'user'
    and exists (
      select 1 from public.chat_conversations c
      where c.id = conversation_id and c.user_id = (select auth.uid())
    )
  );
create policy "Users delete their own messages"
  on public.chat_messages for delete to authenticated
  using ((select auth.uid()) = user_id);

-- The trusted Worker/backend, not browser clients, creates profiles and assistant messages.
-- Keep Supabase signing secrets and service credentials server-side only.
