-- SKEBOB AI database foundation for Supabase (PostgreSQL)
-- Supabase Auth owns identities and sessions; do not create custom password/session tables.
-- Apply in the Supabase SQL Editor or as a migration after creating a project.

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.chat_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'Новый чат' check (char_length(title) <= 160),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.chat_conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
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

alter table public.profiles enable row level security;
alter table public.chat_conversations enable row level security;
alter table public.chat_messages enable row level security;

revoke all on table public.profiles, public.chat_conversations, public.chat_messages from anon, authenticated;
grant select, insert, update on table public.profiles to authenticated;
grant select, insert, update, delete on table public.chat_conversations to authenticated;
grant select, insert, delete on table public.chat_messages to authenticated;

create policy "Users read their own profile"
  on public.profiles for select to authenticated
  using ((select auth.uid()) = id);
create policy "Users create their own profile"
  on public.profiles for insert to authenticated
  with check ((select auth.uid()) = id);
create policy "Users update their own profile"
  on public.profiles for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

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
    and exists (
      select 1 from public.chat_conversations c
      where c.id = conversation_id and c.user_id = (select auth.uid())
    )
  );
create policy "Users delete their own messages"
  on public.chat_messages for delete to authenticated
  using ((select auth.uid()) = user_id);

-- Keep Supabase secret/service-role keys server-side only.
-- The public browser key is safe only with these policies and least-privilege grants.
