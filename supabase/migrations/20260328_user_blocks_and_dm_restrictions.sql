-- ============================================================
-- SAFETY SPRINT 1 - user blocks + DM restrictions
-- 1) Add user_blocks table
-- 2) Add dm_friends_only profile setting
-- 3) Enforce DM and friend-request restrictions in RLS
-- ============================================================

alter table public.profiles
  add column if not exists dm_friends_only boolean not null default false;

grant select (dm_friends_only) on table public.profiles to anon;
grant select (dm_friends_only) on table public.profiles to authenticated;

create table if not exists public.user_blocks (
  blocking_user_id uuid not null references public.profiles(id) on delete cascade,
  blocked_user_id uuid not null references public.profiles(id) on delete cascade,
  reason text,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (blocking_user_id, blocked_user_id),
  constraint user_blocks_not_self check (blocking_user_id <> blocked_user_id)
);

create index if not exists user_blocks_blocked_idx
  on public.user_blocks(blocked_user_id, created_at desc);

alter table public.user_blocks enable row level security;

create or replace function public.are_friends(user_a uuid, user_b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.friends f
    where f.status = 'accepted'
      and (
        (f.user_id = user_a and f.friend_id = user_b)
        or (f.user_id = user_b and f.friend_id = user_a)
      )
  );
$$;

create or replace function public.has_blocked_user(target_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_blocks b
    where b.blocking_user_id = auth.uid()
      and b.blocked_user_id = target_user
  );
$$;

create or replace function public.is_blocked_by_user(other_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_blocks b
    where b.blocking_user_id = other_user
      and b.blocked_user_id = auth.uid()
  );
$$;

create or replace function public.can_send_direct_message(target_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select (
    auth.uid() is not null
    and target_user is not null
    and auth.uid() <> target_user
    and not public.has_blocked_user(target_user)
    and not public.is_blocked_by_user(target_user)
    and (
      coalesce((select not p.dm_friends_only from public.profiles p where p.id = target_user), true)
      or public.are_friends(auth.uid(), target_user)
    )
  );
$$;

drop policy if exists user_blocks_select_participants_or_moderation on public.user_blocks;
create policy user_blocks_select_participants_or_moderation
on public.user_blocks
for select
to authenticated
using (
  auth.uid() = blocking_user_id
  or auth.uid() = blocked_user_id
  or public.has_any_role(array['moderator_users', 'admin'])
);

drop policy if exists user_blocks_insert_self on public.user_blocks;
create policy user_blocks_insert_self
on public.user_blocks
for insert
to authenticated
with check (
  auth.uid() = blocking_user_id
  and public.current_user_is_banned() is not true
);

drop policy if exists user_blocks_delete_self_or_moderation on public.user_blocks;
create policy user_blocks_delete_self_or_moderation
on public.user_blocks
for delete
to authenticated
using (
  auth.uid() = blocking_user_id
  or public.has_any_role(array['moderator_users', 'admin'])
);

drop policy if exists direct_messages_insert_sender on public.direct_messages;
create policy direct_messages_insert_sender
on public.direct_messages
for insert
to authenticated
with check (
  auth.uid() = sender_id
  and public.current_user_is_banned() is not true
  and public.can_send_direct_message(receiver_id)
);

drop policy if exists friends_insert_self on public.friends;
create policy friends_insert_self
on public.friends
for insert
to authenticated
with check (
  auth.uid() = user_id
  and public.current_user_is_banned() is not true
  and not public.has_blocked_user(friend_id)
  and not public.is_blocked_by_user(friend_id)
);
