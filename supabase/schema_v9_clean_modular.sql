-- TEB-App: clean modular PostgreSQL schema for Supabase
-- Source of truth: current application code usage (src/**)
-- This script is intended for a fresh rebuild.

begin;

create extension if not exists pgcrypto;
create extension if not exists "uuid-ossp";
create extension if not exists pg_trgm;

-- ---------------------------------------------------------
-- Cleanup (safe for rebuilds)
-- ---------------------------------------------------------

drop trigger if exists on_auth_user_created on auth.users;

drop table if exists public.push_subscriptions cascade;
drop table if exists public.user_badges cascade;
drop table if exists public.reports cascade;
drop table if exists public.chat_group_messages cascade;
drop table if exists public.chat_group_members cascade;
drop table if exists public.chat_groups cascade;
drop table if exists public.group_messages cascade;
drop table if exists public.group_members cascade;
drop table if exists public.groups cascade;
drop table if exists public.friends cascade;
drop table if exists public.direct_messages cascade;
drop table if exists public.rewear_posts cascade;
drop table if exists public.feed_votes cascade;
drop table if exists public.feed_comments cascade;
drop table if exists public.feed_posts cascade;
drop table if exists public.profiles cascade;

drop function if exists public.handle_new_user() cascade;
drop function if exists public.set_updated_at() cascade;
drop function if exists public.current_user_roles() cascade;
drop function if exists public.has_any_role(text[]) cascade;
drop function if exists public.current_user_is_banned() cascade;
drop function if exists public.is_chat_group_member(uuid) cascade;
drop function if exists public.is_chat_group_admin(uuid) cascade;
drop function if exists public.recompute_feed_post_vote_counts() cascade;
drop function if exists public.apply_feed_vote_counters() cascade;
drop function if exists public.apply_feed_comment_counts() cascade;

-- ---------------------------------------------------------
-- Core module
-- ---------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  full_name text not null,
  role text not null default 'student',
  roles text[] not null default array['student']::text[],
  teb_gabki integer not null default 0,
  is_banned boolean not null default false,
  banned_until timestamptz,
  is_private boolean not null default false,
  avatar_url text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint profiles_role_check check (
    role in (
      'student',
      'teacher',
      'tutor',
      'freelancer',
      'editor',
      'moderator_content',
      'moderator_users',
      'su_member',
      'admin'
    )
  ),
  constraint profiles_roles_not_empty check (coalesce(array_length(roles, 1), 0) > 0),
  constraint profiles_teb_gabki_non_negative check (teb_gabki >= 0)
);

-- ---------------------------------------------------------
-- Feed module
-- ---------------------------------------------------------

create table public.feed_posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  content text not null,
  category text not null default 'News',
  image_url text,
  upvotes integer not null default 0,
  downvotes integer not null default 0,
  comment_count integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.feed_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.feed_posts(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  content text not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.feed_votes (
  post_id uuid not null references public.feed_posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  vote_type text not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (post_id, user_id),
  constraint feed_votes_type_check check (vote_type in ('up', 'down'))
);

-- ---------------------------------------------------------
-- ReWear module
-- ---------------------------------------------------------

create table public.rewear_posts (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  description text,
  price_teb_gabki numeric(10,2) not null default 0,
  price_pln numeric(10,2) not null default 0,
  item_type text not null default 'item',
  image_url text,
  status text not null default 'active',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint rewear_posts_item_type_check check (item_type in ('item', 'tutoring', 'service')),
  constraint rewear_posts_status_check check (status in ('active', 'sold', 'archived')),
  constraint rewear_posts_price_non_negative check (price_teb_gabki >= 0 and price_pln >= 0)
);

-- ---------------------------------------------------------
-- Messaging and social module
-- ---------------------------------------------------------

create table public.direct_messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles(id) on delete cascade,
  receiver_id uuid not null references public.profiles(id) on delete cascade,
  conversation_id uuid generated always as (
    uuid_generate_v5(
      '00000000-0000-0000-0000-000000000001'::uuid,
      case
        when sender_id::text < receiver_id::text then sender_id::text || ':' || receiver_id::text
        else receiver_id::text || ':' || sender_id::text
      end
    )
  ) stored,
  content text not null,
  is_deleted boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint direct_messages_not_self check (sender_id <> receiver_id)
);

create table public.friends (
  user_id uuid not null references public.profiles(id) on delete cascade,
  friend_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (user_id, friend_id),
  constraint friends_not_self check (user_id <> friend_id),
  constraint friends_status_check check (status in ('pending', 'accepted', 'blocked'))
);

create table public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  category text not null default 'Inne',
  creator_id uuid not null references public.profiles(id) on delete cascade,
  is_approved boolean not null default false,
  is_locked boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.group_members (
  group_id uuid not null references public.groups(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default timezone('utc', now()),
  primary key (group_id, user_id)
);

create table public.group_messages (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  content text not null,
  is_deleted boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.chat_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  image_url text,
  creator_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table public.chat_group_members (
  group_id uuid not null references public.chat_groups(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member',
  nickname text,
  joined_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (group_id, user_id),
  constraint chat_group_members_role_check check (role in ('admin', 'member'))
);

create table public.chat_group_messages (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.chat_groups(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  content text not null,
  is_deleted boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

-- ---------------------------------------------------------
-- Moderation and utility module
-- ---------------------------------------------------------

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  reported_entity_type text not null,
  reported_entity_id uuid not null,
  reason text not null,
  context jsonb,
  status text not null default 'pending',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint reports_status_check check (status in ('pending', 'resolved', 'dismissed')),
  constraint reports_entity_type_check check (
    reported_entity_type in (
      'feed_post',
      'feed_comment',
      'rewear_post',
      'group_message',
      'direct_message',
      'chat_group_message',
      'group',
      'chat_group',
      'profile'
    )
  )
);

create table public.user_badges (
  user_id uuid not null references public.profiles(id) on delete cascade,
  badge_type text not null,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (user_id, badge_type),
  constraint user_badges_type_check check (
    badge_type in ('pres_tech', 'pres_liceum', 'top_rich', 'helper', 'beta_tester')
  )
);

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles(id) on delete cascade,
  subscription_json jsonb not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

-- ---------------------------------------------------------
-- Indexes (query-driven)
-- ---------------------------------------------------------

create index profiles_created_at_idx on public.profiles(created_at desc);
create index profiles_public_ranking_idx on public.profiles(teb_gabki desc) where is_private = false;
create index profiles_full_name_trgm_idx on public.profiles using gin (full_name gin_trgm_ops);

create index feed_posts_created_at_idx on public.feed_posts(created_at desc);
create index feed_posts_author_id_idx on public.feed_posts(author_id);
create index feed_comments_post_created_idx on public.feed_comments(post_id, created_at asc);
create index feed_comments_author_idx on public.feed_comments(author_id);
create index feed_votes_user_id_idx on public.feed_votes(user_id);

create index rewear_posts_status_created_idx on public.rewear_posts(status, created_at desc);
create index rewear_posts_seller_id_idx on public.rewear_posts(seller_id);
create index rewear_posts_item_type_idx on public.rewear_posts(item_type);

create index direct_messages_sender_receiver_created_idx on public.direct_messages(sender_id, receiver_id, created_at asc);
create index direct_messages_receiver_sender_created_idx on public.direct_messages(receiver_id, sender_id, created_at asc);
create index direct_messages_conversation_created_idx on public.direct_messages(conversation_id, created_at asc);

create unique index friends_pair_unique_idx on public.friends (
  least(user_id::text, friend_id::text),
  greatest(user_id::text, friend_id::text)
);
create index friends_user_status_idx on public.friends(user_id, status);
create index friends_friend_status_idx on public.friends(friend_id, status);

create index groups_approved_created_idx on public.groups(is_approved, created_at desc);
create index groups_creator_idx on public.groups(creator_id);
create index group_members_user_idx on public.group_members(user_id);
create index group_messages_group_created_idx on public.group_messages(group_id, created_at asc);
create index group_messages_sender_idx on public.group_messages(sender_id);

create index chat_groups_creator_idx on public.chat_groups(creator_id);
create index chat_group_members_user_idx on public.chat_group_members(user_id);
create index chat_group_members_group_role_idx on public.chat_group_members(group_id, role);
create index chat_group_messages_group_created_idx on public.chat_group_messages(group_id, created_at asc);
create index chat_group_messages_sender_idx on public.chat_group_messages(sender_id);

create index reports_status_created_idx on public.reports(status, created_at desc);
create index reports_entity_idx on public.reports(reported_entity_type, reported_entity_id);
create index reports_reporter_idx on public.reports(reporter_id);

-- ---------------------------------------------------------
-- Generic helpers and triggers
-- ---------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create trigger trg_profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create trigger trg_feed_posts_set_updated_at
before update on public.feed_posts
for each row execute function public.set_updated_at();

create trigger trg_feed_comments_set_updated_at
before update on public.feed_comments
for each row execute function public.set_updated_at();

create trigger trg_feed_votes_set_updated_at
before update on public.feed_votes
for each row execute function public.set_updated_at();

create trigger trg_rewear_posts_set_updated_at
before update on public.rewear_posts
for each row execute function public.set_updated_at();

create trigger trg_direct_messages_set_updated_at
before update on public.direct_messages
for each row execute function public.set_updated_at();

create trigger trg_friends_set_updated_at
before update on public.friends
for each row execute function public.set_updated_at();

create trigger trg_groups_set_updated_at
before update on public.groups
for each row execute function public.set_updated_at();

create trigger trg_group_messages_set_updated_at
before update on public.group_messages
for each row execute function public.set_updated_at();

create trigger trg_chat_groups_set_updated_at
before update on public.chat_groups
for each row execute function public.set_updated_at();

create trigger trg_chat_group_members_set_updated_at
before update on public.chat_group_members
for each row execute function public.set_updated_at();

create trigger trg_chat_group_messages_set_updated_at
before update on public.chat_group_messages
for each row execute function public.set_updated_at();

create trigger trg_reports_set_updated_at
before update on public.reports
for each row execute function public.set_updated_at();

create trigger trg_push_subscriptions_set_updated_at
before update on public.push_subscriptions
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------
-- Auth bootstrap
-- ---------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (
    id,
    email,
    full_name,
    role,
    roles,
    teb_gabki,
    is_banned,
    is_private
  )
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data->>'full_name', split_part(coalesce(new.email, 'User'), '@', 1), 'User'),
    'student',
    array['student']::text[],
    0,
    false,
    false
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- ---------------------------------------------------------
-- Permission helper functions
-- ---------------------------------------------------------

create or replace function public.current_user_roles()
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select p.roles from public.profiles p where p.id = auth.uid()), array['student']::text[]);
$$;

create or replace function public.has_any_role(required_roles text[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from unnest(public.current_user_roles()) as r
    where r = any(required_roles)
  );
$$;

create or replace function public.current_user_is_banned()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select p.is_banned from public.profiles p where p.id = auth.uid()), false);
$$;

create or replace function public.is_chat_group_member(gid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.chat_group_members cgm
    where cgm.group_id = gid
      and cgm.user_id = auth.uid()
  );
$$;

create or replace function public.is_chat_group_admin(gid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.chat_group_members cgm
    where cgm.group_id = gid
      and cgm.user_id = auth.uid()
      and cgm.role = 'admin'
  );
$$;

-- ---------------------------------------------------------
-- Feed counter maintenance
-- ---------------------------------------------------------

create or replace function public.recompute_feed_post_vote_counts()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_post_id uuid;
begin
  target_post_id := coalesce(new.post_id, old.post_id);

  update public.feed_posts fp
  set
    upvotes = coalesce((
      select count(*)
      from public.feed_votes fv
      where fv.post_id = target_post_id
        and fv.vote_type = 'up'
    ), 0),
    downvotes = coalesce((
      select count(*)
      from public.feed_votes fv
      where fv.post_id = target_post_id
        and fv.vote_type = 'down'
    ), 0),
    updated_at = timezone('utc', now())
  where fp.id = target_post_id;

  return null;
end;
$$;

create trigger trg_feed_votes_recompute_counters
after insert or update or delete on public.feed_votes
for each row execute function public.recompute_feed_post_vote_counts();

create or replace function public.apply_feed_comment_counts()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_post_id uuid;
begin
  target_post_id := coalesce(new.post_id, old.post_id);

  update public.feed_posts fp
  set
    comment_count = coalesce((
      select count(*)
      from public.feed_comments fc
      where fc.post_id = target_post_id
    ), 0),
    updated_at = timezone('utc', now())
  where fp.id = target_post_id;

  return null;
end;
$$;

create trigger trg_feed_comments_recompute_count
after insert or delete on public.feed_comments
for each row execute function public.apply_feed_comment_counts();

-- ---------------------------------------------------------
-- RLS
-- ---------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.feed_posts enable row level security;
alter table public.feed_comments enable row level security;
alter table public.feed_votes enable row level security;
alter table public.rewear_posts enable row level security;
alter table public.direct_messages enable row level security;
alter table public.friends enable row level security;
alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.group_messages enable row level security;
alter table public.chat_groups enable row level security;
alter table public.chat_group_members enable row level security;
alter table public.chat_group_messages enable row level security;
alter table public.reports enable row level security;
alter table public.user_badges enable row level security;
alter table public.push_subscriptions enable row level security;

-- profiles
create policy profiles_select_authenticated
on public.profiles
for select
to authenticated
using (true);

create policy profiles_insert_self
on public.profiles
for insert
to authenticated
with check (auth.uid() = id);

create policy profiles_update_self
on public.profiles
for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

create policy profiles_update_admin_and_mod_users
on public.profiles
for update
to authenticated
using (public.has_any_role(array['admin', 'moderator_users']))
with check (public.has_any_role(array['admin', 'moderator_users']));

-- feed_posts
create policy feed_posts_read_all
on public.feed_posts
for select
to anon, authenticated
using (true);

create policy feed_posts_insert_editor_mod_admin
on public.feed_posts
for insert
to authenticated
with check (
  auth.uid() = author_id
  and public.current_user_is_banned() is not true
  and public.has_any_role(array['editor', 'moderator_content', 'admin'])
);

create policy feed_posts_update_author_or_moderation
on public.feed_posts
for update
to authenticated
using (
  auth.uid() = author_id
  or public.has_any_role(array['moderator_content', 'admin'])
)
with check (
  auth.uid() = author_id
  or public.has_any_role(array['moderator_content', 'admin'])
);

create policy feed_posts_delete_author_or_moderation
on public.feed_posts
for delete
to authenticated
using (
  auth.uid() = author_id
  or public.has_any_role(array['moderator_content', 'admin'])
);

-- feed_comments
create policy feed_comments_read_all
on public.feed_comments
for select
to anon, authenticated
using (true);

create policy feed_comments_insert_owner
on public.feed_comments
for insert
to authenticated
with check (
  auth.uid() = author_id
  and public.current_user_is_banned() is not true
);

create policy feed_comments_update_owner_or_moderation
on public.feed_comments
for update
to authenticated
using (
  auth.uid() = author_id
  or public.has_any_role(array['moderator_content', 'admin'])
)
with check (
  auth.uid() = author_id
  or public.has_any_role(array['moderator_content', 'admin'])
);

create policy feed_comments_delete_owner_or_moderation
on public.feed_comments
for delete
to authenticated
using (
  auth.uid() = author_id
  or public.has_any_role(array['moderator_content', 'admin'])
);

-- feed_votes
create policy feed_votes_read_authenticated
on public.feed_votes
for select
to authenticated
using (true);

create policy feed_votes_insert_self
on public.feed_votes
for insert
to authenticated
with check (
  auth.uid() = user_id
  and public.current_user_is_banned() is not true
);

create policy feed_votes_update_self
on public.feed_votes
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy feed_votes_delete_self
on public.feed_votes
for delete
to authenticated
using (auth.uid() = user_id);

-- rewear_posts
create policy rewear_posts_select_policy
on public.rewear_posts
for select
to authenticated
using (
  status = 'active'
  or seller_id = auth.uid()
  or public.has_any_role(array['moderator_content', 'moderator_users', 'admin'])
);

create policy rewear_posts_insert_owner_with_role_guard
on public.rewear_posts
for insert
to authenticated
with check (
  auth.uid() = seller_id
  and public.current_user_is_banned() is not true
  and (
    item_type = 'item'
    or (item_type = 'tutoring' and public.has_any_role(array['tutor', 'admin']))
    or (item_type = 'service' and public.has_any_role(array['freelancer', 'admin']))
  )
);

create policy rewear_posts_update_owner_or_moderation
on public.rewear_posts
for update
to authenticated
using (
  auth.uid() = seller_id
  or public.has_any_role(array['moderator_content', 'admin'])
)
with check (
  auth.uid() = seller_id
  or public.has_any_role(array['moderator_content', 'admin'])
);

create policy rewear_posts_delete_owner_or_moderation
on public.rewear_posts
for delete
to authenticated
using (
  auth.uid() = seller_id
  or public.has_any_role(array['moderator_content', 'admin'])
);

-- direct_messages
create policy direct_messages_select_participants_or_moderation
on public.direct_messages
for select
to authenticated
using (
  auth.uid() = sender_id
  or auth.uid() = receiver_id
  or public.has_any_role(array['moderator_content', 'moderator_users', 'admin'])
);

create policy direct_messages_insert_sender
on public.direct_messages
for insert
to authenticated
with check (
  auth.uid() = sender_id
  and public.current_user_is_banned() is not true
);

create policy direct_messages_update_sender_or_moderation
on public.direct_messages
for update
to authenticated
using (
  auth.uid() = sender_id
  or public.has_any_role(array['moderator_content', 'moderator_users', 'admin'])
)
with check (
  auth.uid() = sender_id
  or public.has_any_role(array['moderator_content', 'moderator_users', 'admin'])
);

create policy direct_messages_delete_sender_or_moderation
on public.direct_messages
for delete
to authenticated
using (
  auth.uid() = sender_id
  or public.has_any_role(array['moderator_content', 'moderator_users', 'admin'])
);

-- friends
create policy friends_select_participants
on public.friends
for select
to authenticated
using (
  auth.uid() = user_id
  or auth.uid() = friend_id
  or public.has_any_role(array['moderator_users', 'admin'])
);

create policy friends_insert_self
on public.friends
for insert
to authenticated
with check (
  auth.uid() = user_id
  and public.current_user_is_banned() is not true
);

create policy friends_update_participants
on public.friends
for update
to authenticated
using (
  auth.uid() = user_id
  or auth.uid() = friend_id
  or public.has_any_role(array['moderator_users', 'admin'])
)
with check (
  auth.uid() = user_id
  or auth.uid() = friend_id
  or public.has_any_role(array['moderator_users', 'admin'])
);

create policy friends_delete_participants
on public.friends
for delete
to authenticated
using (
  auth.uid() = user_id
  or auth.uid() = friend_id
  or public.has_any_role(array['moderator_users', 'admin'])
);

-- groups (public communities)
create policy groups_select_visible
on public.groups
for select
to authenticated
using (
  is_approved = true
  or creator_id = auth.uid()
  or public.has_any_role(array['moderator_content', 'moderator_users', 'admin'])
);

create policy groups_insert_creator
on public.groups
for insert
to authenticated
with check (
  auth.uid() = creator_id
  and public.current_user_is_banned() is not true
);

create policy groups_update_creator_or_moderation
on public.groups
for update
to authenticated
using (
  creator_id = auth.uid()
  or public.has_any_role(array['moderator_users', 'admin'])
)
with check (
  creator_id = auth.uid()
  or public.has_any_role(array['moderator_users', 'admin'])
);

create policy groups_delete_creator_or_moderation
on public.groups
for delete
to authenticated
using (
  creator_id = auth.uid()
  or public.has_any_role(array['moderator_users', 'admin'])
);

-- group_members
create policy group_members_select_authenticated
on public.group_members
for select
to authenticated
using (true);

create policy group_members_insert_self_or_moderation
on public.group_members
for insert
to authenticated
with check (
  (auth.uid() = user_id and public.current_user_is_banned() is not true)
  or public.has_any_role(array['moderator_users', 'admin'])
);

create policy group_members_delete_self_or_moderation
on public.group_members
for delete
to authenticated
using (
  auth.uid() = user_id
  or public.has_any_role(array['moderator_users', 'admin'])
);

-- group_messages
create policy group_messages_select_visible_groups
on public.group_messages
for select
to authenticated
using (
  exists (
    select 1
    from public.groups g
    where g.id = group_id
      and (
        g.is_approved = true
        or g.creator_id = auth.uid()
        or public.has_any_role(array['moderator_content', 'moderator_users', 'admin'])
      )
  )
);

create policy group_messages_insert_members_only
on public.group_messages
for insert
to authenticated
with check (
  auth.uid() = sender_id
  and public.current_user_is_banned() is not true
  and exists (
    select 1
    from public.groups g
    join public.group_members gm on gm.group_id = g.id
    where g.id = group_id
      and gm.user_id = auth.uid()
      and g.is_locked = false
  )
);

create policy group_messages_update_sender_or_moderation
on public.group_messages
for update
to authenticated
using (
  auth.uid() = sender_id
  or public.has_any_role(array['moderator_content', 'moderator_users', 'admin'])
)
with check (
  auth.uid() = sender_id
  or public.has_any_role(array['moderator_content', 'moderator_users', 'admin'])
);

create policy group_messages_delete_sender_or_moderation
on public.group_messages
for delete
to authenticated
using (
  auth.uid() = sender_id
  or public.has_any_role(array['moderator_content', 'moderator_users', 'admin'])
);

-- chat_groups (private groups)
create policy chat_groups_select_member_or_moderation
on public.chat_groups
for select
to authenticated
using (
  creator_id = auth.uid()
  or public.is_chat_group_member(id)
  or public.has_any_role(array['moderator_content', 'moderator_users', 'admin'])
);

create policy chat_groups_insert_creator
on public.chat_groups
for insert
to authenticated
with check (
  creator_id = auth.uid()
  and public.current_user_is_banned() is not true
);

create policy chat_groups_update_admin_or_moderation
on public.chat_groups
for update
to authenticated
using (
  creator_id = auth.uid()
  or public.is_chat_group_admin(id)
  or public.has_any_role(array['moderator_content', 'moderator_users', 'admin'])
)
with check (
  creator_id = auth.uid()
  or public.is_chat_group_admin(id)
  or public.has_any_role(array['moderator_content', 'moderator_users', 'admin'])
);

create policy chat_groups_delete_admin_or_moderation
on public.chat_groups
for delete
to authenticated
using (
  creator_id = auth.uid()
  or public.is_chat_group_admin(id)
  or public.has_any_role(array['moderator_content', 'moderator_users', 'admin'])
);

-- chat_group_members
create policy chat_group_members_select_member_or_moderation
on public.chat_group_members
for select
to authenticated
using (
  public.is_chat_group_member(group_id)
  or public.has_any_role(array['moderator_content', 'moderator_users', 'admin'])
);

create policy chat_group_members_insert_creator_or_group_admin
on public.chat_group_members
for insert
to authenticated
with check (
  (
    exists (
      select 1
      from public.chat_groups cg
      where cg.id = group_id
        and cg.creator_id = auth.uid()
    )
    and user_id = auth.uid()
  )
  or public.is_chat_group_admin(group_id)
  or public.has_any_role(array['moderator_content', 'moderator_users', 'admin'])
);

create policy chat_group_members_update_group_admin_or_moderation
on public.chat_group_members
for update
to authenticated
using (
  public.is_chat_group_admin(group_id)
  or public.has_any_role(array['moderator_content', 'moderator_users', 'admin'])
)
with check (
  public.is_chat_group_admin(group_id)
  or public.has_any_role(array['moderator_content', 'moderator_users', 'admin'])
);

create policy chat_group_members_delete_self_admin_or_moderation
on public.chat_group_members
for delete
to authenticated
using (
  auth.uid() = user_id
  or public.is_chat_group_admin(group_id)
  or public.has_any_role(array['moderator_content', 'moderator_users', 'admin'])
);

-- chat_group_messages
create policy chat_group_messages_select_member_or_moderation
on public.chat_group_messages
for select
to authenticated
using (
  public.is_chat_group_member(group_id)
  or public.has_any_role(array['moderator_content', 'moderator_users', 'admin'])
);

create policy chat_group_messages_insert_member_only
on public.chat_group_messages
for insert
to authenticated
with check (
  auth.uid() = sender_id
  and public.current_user_is_banned() is not true
  and public.is_chat_group_member(group_id)
);

create policy chat_group_messages_update_sender_admin_or_moderation
on public.chat_group_messages
for update
to authenticated
using (
  auth.uid() = sender_id
  or public.is_chat_group_admin(group_id)
  or public.has_any_role(array['moderator_content', 'moderator_users', 'admin'])
)
with check (
  auth.uid() = sender_id
  or public.is_chat_group_admin(group_id)
  or public.has_any_role(array['moderator_content', 'moderator_users', 'admin'])
);

create policy chat_group_messages_delete_sender_admin_or_moderation
on public.chat_group_messages
for delete
to authenticated
using (
  auth.uid() = sender_id
  or public.is_chat_group_admin(group_id)
  or public.has_any_role(array['moderator_content', 'moderator_users', 'admin'])
);

-- reports
create policy reports_insert_reporter
on public.reports
for insert
to authenticated
with check (auth.uid() = reporter_id);

create policy reports_select_moderation
on public.reports
for select
to authenticated
using (public.has_any_role(array['moderator_content', 'moderator_users', 'admin']));

create policy reports_update_moderation
on public.reports
for update
to authenticated
using (public.has_any_role(array['moderator_content', 'moderator_users', 'admin']))
with check (public.has_any_role(array['moderator_content', 'moderator_users', 'admin']));

create policy reports_delete_moderation
on public.reports
for delete
to authenticated
using (public.has_any_role(array['moderator_content', 'moderator_users', 'admin']));

-- user_badges
create policy user_badges_select_self_or_admin
on public.user_badges
for select
to authenticated
using (
  auth.uid() = user_id
  or public.has_any_role(array['admin'])
);

create policy user_badges_insert_self_or_admin
on public.user_badges
for insert
to authenticated
with check (
  auth.uid() = user_id
  or public.has_any_role(array['admin'])
);

create policy user_badges_delete_self_or_admin
on public.user_badges
for delete
to authenticated
using (
  auth.uid() = user_id
  or public.has_any_role(array['admin'])
);

-- push_subscriptions
create policy push_subscriptions_select_self_or_admin
on public.push_subscriptions
for select
to authenticated
using (
  auth.uid() = user_id
  or public.has_any_role(array['admin'])
);

create policy push_subscriptions_insert_self
on public.push_subscriptions
for insert
to authenticated
with check (auth.uid() = user_id);

create policy push_subscriptions_update_self_or_admin
on public.push_subscriptions
for update
to authenticated
using (
  auth.uid() = user_id
  or public.has_any_role(array['admin'])
)
with check (
  auth.uid() = user_id
  or public.has_any_role(array['admin'])
);

create policy push_subscriptions_delete_self_or_admin
on public.push_subscriptions
for delete
to authenticated
using (
  auth.uid() = user_id
  or public.has_any_role(array['admin'])
);

commit;
