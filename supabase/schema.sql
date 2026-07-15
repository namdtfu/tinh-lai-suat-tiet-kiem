-- Run this file once in Supabase Dashboard > SQL Editor.
-- The browser only receives the publishable key. RLS below is the real data boundary.

create table if not exists public.user_app_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  schema_version integer not null default 1 check (schema_version > 0),
  data jsonb not null default '{}'::jsonb check (jsonb_typeof(data) = 'object'),
  updated_at timestamptz not null default now()
);

create or replace function public.set_user_app_state_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_user_app_state_updated_at on public.user_app_state;
create trigger set_user_app_state_updated_at
before insert or update on public.user_app_state
for each row execute function public.set_user_app_state_updated_at();

alter table public.user_app_state enable row level security;

revoke all on table public.user_app_state from anon;
grant select, insert, update, delete on table public.user_app_state to authenticated;

drop policy if exists "Users can read their own app state" on public.user_app_state;
create policy "Users can read their own app state"
on public.user_app_state
for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Users can create their own app state" on public.user_app_state;
create policy "Users can create their own app state"
on public.user_app_state
for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their own app state" on public.user_app_state;
create policy "Users can update their own app state"
on public.user_app_state
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete their own app state" on public.user_app_state;
create policy "Users can delete their own app state"
on public.user_app_state
for delete
to authenticated
using ((select auth.uid()) = user_id);

create index if not exists user_app_state_updated_at_idx
on public.user_app_state (updated_at desc);

-- Realtime Postgres Changes only emits events for tables in this publication.
do $$
begin
  if exists (
    select 1 from pg_publication where pubname = 'supabase_realtime'
  ) and not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'user_app_state'
  ) then
    execute 'alter publication supabase_realtime add table public.user_app_state';
  end if;
end;
$$;
