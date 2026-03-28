-- ============================================================
-- BACKFILL 2026-03-28
-- Brings older environments up to date with Safety Sprint 1/2,
-- server-side moderation hardening, and report anti-abuse rules.
-- ============================================================

-- ----------------------------------------------------------------
-- Profiles compatibility columns
-- ----------------------------------------------------------------
alter table public.profiles
  add column if not exists dm_friends_only boolean not null default false;

alter table public.profiles
  add column if not exists ban_reason text;

create or replace function public.current_user_is_banned()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select p.is_banned from public.profiles p where p.id = auth.uid()), false);
$$;

grant select (dm_friends_only) on table public.profiles to anon;
grant select (dm_friends_only) on table public.profiles to authenticated;

revoke select (ban_reason) on table public.profiles from anon;
revoke select (ban_reason) on table public.profiles from authenticated;
grant select (ban_reason) on table public.profiles to service_role;

-- ----------------------------------------------------------------
-- Safety Sprint 1: user blocks + DM restrictions
-- ----------------------------------------------------------------
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

grant select, insert, delete on table public.user_blocks to authenticated;
revoke all on table public.user_blocks from anon;

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

drop policy if exists direct_messages_insert on public.direct_messages;
drop policy if exists direct_messages_insert_sender_fix_v1 on public.direct_messages;
create policy direct_messages_insert
on public.direct_messages
for insert
to authenticated
with check (
  auth.uid() = sender_id
  and public.current_user_is_banned() is not true
  and public.can_send_direct_message(receiver_id)
);

drop policy if exists friends_insert on public.friends;
create policy friends_insert
on public.friends
for insert
to authenticated
with check (
  auth.uid() = user_id
  and public.current_user_is_banned() is not true
  and not public.has_blocked_user(friend_id)
  and not public.is_blocked_by_user(friend_id)
);

drop policy if exists direct_messages_select_participants_fix_v1 on public.direct_messages;
drop policy if exists direct_messages_update_sender_fix_v1 on public.direct_messages;
drop policy if exists direct_messages_delete_sender_fix_v1 on public.direct_messages;

-- ----------------------------------------------------------------
-- Security hardening: content length guardrails
-- ----------------------------------------------------------------
alter table public.feed_posts
  drop constraint if exists feed_posts_title_length_check;
alter table public.feed_posts
  add constraint feed_posts_title_length_check
  check (char_length(title) <= 200) not valid;

alter table public.feed_posts
  drop constraint if exists feed_posts_content_length_check;
alter table public.feed_posts
  add constraint feed_posts_content_length_check
  check (char_length(content) <= 12000) not valid;

alter table public.feed_comments
  drop constraint if exists feed_comments_content_length_check;
alter table public.feed_comments
  add constraint feed_comments_content_length_check
  check (char_length(content) <= 2000) not valid;

alter table public.rewear_posts
  drop constraint if exists rewear_posts_title_length_check;
alter table public.rewear_posts
  add constraint rewear_posts_title_length_check
  check (char_length(title) <= 200) not valid;

alter table public.rewear_posts
  drop constraint if exists rewear_posts_description_length_check;
alter table public.rewear_posts
  add constraint rewear_posts_description_length_check
  check (description is null or char_length(description) <= 5000) not valid;

alter table public.direct_messages
  drop constraint if exists direct_messages_content_length_check;
alter table public.direct_messages
  add constraint direct_messages_content_length_check
  check (char_length(content) <= 2000) not valid;

alter table public.group_messages
  drop constraint if exists group_messages_content_length_check;
alter table public.group_messages
  add constraint group_messages_content_length_check
  check (char_length(content) <= 2000) not valid;

alter table public.chat_group_messages
  drop constraint if exists chat_group_messages_content_length_check;
alter table public.chat_group_messages
  add constraint chat_group_messages_content_length_check
  check (char_length(content) <= 2000) not valid;

alter table public.groups
  drop constraint if exists groups_name_length_check;
alter table public.groups
  add constraint groups_name_length_check
  check (char_length(name) <= 120) not valid;

alter table public.groups
  drop constraint if exists groups_description_length_check;
alter table public.groups
  add constraint groups_description_length_check
  check (description is null or char_length(description) <= 1000) not valid;

alter table public.chat_groups
  drop constraint if exists chat_groups_name_length_check;
alter table public.chat_groups
  add constraint chat_groups_name_length_check
  check (char_length(name) <= 120) not valid;

-- ----------------------------------------------------------------
-- Security hardening: server-side profanity filtering
-- ----------------------------------------------------------------
create or replace function public.normalize_for_filter(p_text text)
returns text
language sql
immutable
set search_path = public
as $$
  select regexp_replace(
    translate(
      replace(
        replace(
          replace(
            replace(
              replace(
                replace(
                  replace(lower(coalesce(p_text, '')), '@', 'a'),
                  '4',
                  'a'
                ),
                '3',
                'e'
              ),
              '0',
              'o'
            ),
            '1',
            'i'
          ),
          '!',
          'i'
        ),
        '$',
        's'
      ),
      'ąćęłńóśżź',
      'acelnoszz'
    ),
    '[^a-z]+',
    '',
    'g'
  );
$$;

create or replace function public.has_profanity(p_text text)
returns boolean
language plpgsql
immutable
set search_path = public
as $$
declare
  normalized text := public.normalize_for_filter(p_text);
  banned_patterns text[] := array[
    'k+u+r+w+a+',
    'k+u+r+w+y+',
    'k+u+r+w+i+',
    'w+y+p+i+e+r+d+a+l+a+c+',
    's+p+i+e+r+d+a+l+a+c+',
    'p+i+e+r+d+o+l+(i+c|i+l|o+n|e+n|a+)?',
    'j+e+b+(a+c|i+e|a+n|n+i+e|n+y|n+a|n+e|a+)?',
    'c+h+u+j+(a|e|o|u|y)?',
    'h+u+j+(a|e|o|u|y)?',
    'p+i+z+d+(a|e|o|u|y|z+i+e)?',
    's+k+u+r+w+y+s+y+n+',
    'k+u+t+a+s+(a|e|o|u|y)?',
    'c+w+e+l+(a|e|o|u|y)?',
    'p+e+d+a+l+(a|e|o|u|y)?',
    'd+z+i+w+k+(a|e|o|u|y|i)?',
    's+u+k+(a|i|e|o|u|y)',
    's+u+c+z+(a|e|o|y)?',
    'z+j+e+b+(a|e|i|y|a+n+y)?',
    'p+o+j+e+b+(a|e|i|y|a+n+y)?',
    'p+r+z+y+j+e+b+(a|e|i|y|a+n+y)?'
  ];
  pattern text;
begin
  if normalized = '' then
    return false;
  end if;

  foreach pattern in array banned_patterns loop
    if normalized ~ pattern then
      return true;
    end if;
  end loop;

  return false;
end;
$$;

create or replace function public.enforce_clean_content()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_table_name = 'feed_posts' then
    if public.has_profanity(new.title) or public.has_profanity(new.content) then
      raise exception 'Content contains prohibited language';
    end if;
  elsif tg_table_name = 'feed_comments' then
    if public.has_profanity(new.content) then
      raise exception 'Content contains prohibited language';
    end if;
  elsif tg_table_name = 'rewear_posts' then
    if public.has_profanity(new.title) or public.has_profanity(split_part(coalesce(new.description, ''), '|META:', 1)) then
      raise exception 'Content contains prohibited language';
    end if;
  elsif tg_table_name = 'profiles' then
    if public.has_profanity(new.full_name) or public.has_profanity(coalesce(new.ban_reason, '')) then
      raise exception 'Content contains prohibited language';
    end if;
  elsif tg_table_name = 'groups' then
    if public.has_profanity(new.name) or public.has_profanity(new.description) then
      raise exception 'Content contains prohibited language';
    end if;
  elsif tg_table_name = 'chat_groups' then
    if public.has_profanity(new.name) then
      raise exception 'Content contains prohibited language';
    end if;
  elsif tg_table_name = 'group_messages' then
    if public.has_profanity(new.content) then
      raise exception 'Content contains prohibited language';
    end if;
  elsif tg_table_name = 'chat_group_messages' then
    if public.has_profanity(new.content) then
      raise exception 'Content contains prohibited language';
    end if;
  elsif tg_table_name = 'direct_messages' then
    if public.has_profanity(new.content) then
      raise exception 'Content contains prohibited language';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_feed_posts_clean_content on public.feed_posts;
create trigger trg_feed_posts_clean_content
before insert or update of title, content on public.feed_posts
for each row
execute function public.enforce_clean_content();

drop trigger if exists trg_feed_comments_clean_content on public.feed_comments;
create trigger trg_feed_comments_clean_content
before insert or update of content on public.feed_comments
for each row
execute function public.enforce_clean_content();

drop trigger if exists trg_rewear_posts_clean_content on public.rewear_posts;
create trigger trg_rewear_posts_clean_content
before insert or update of title, description on public.rewear_posts
for each row
execute function public.enforce_clean_content();

drop trigger if exists trg_profiles_clean_content on public.profiles;
create trigger trg_profiles_clean_content
before insert or update of full_name, ban_reason on public.profiles
for each row
execute function public.enforce_clean_content();

drop trigger if exists trg_groups_clean_content on public.groups;
create trigger trg_groups_clean_content
before insert or update of name, description on public.groups
for each row
execute function public.enforce_clean_content();

drop trigger if exists trg_chat_groups_clean_content on public.chat_groups;
create trigger trg_chat_groups_clean_content
before insert or update of name on public.chat_groups
for each row
execute function public.enforce_clean_content();

drop trigger if exists trg_group_messages_clean_content on public.group_messages;
create trigger trg_group_messages_clean_content
before insert or update of content on public.group_messages
for each row
execute function public.enforce_clean_content();

drop trigger if exists trg_chat_group_messages_clean_content on public.chat_group_messages;
create trigger trg_chat_group_messages_clean_content
before insert or update of content on public.chat_group_messages
for each row
execute function public.enforce_clean_content();

drop trigger if exists trg_direct_messages_clean_content on public.direct_messages;
create trigger trg_direct_messages_clean_content
before insert or update of content on public.direct_messages
for each row
execute function public.enforce_clean_content();

-- ----------------------------------------------------------------
-- Safety Sprint 2: moderation audit log + punishment appeals
-- ----------------------------------------------------------------
create table if not exists public.moderation_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references public.profiles(id) on delete set null,
  target_user_id uuid references public.profiles(id) on delete set null,
  action_type text not null,
  target_entity_type text,
  target_entity_id text,
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  is_visible_to_target boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  constraint moderation_audit_log_action_type_check check (
    action_type in (
      'ban',
      'unban',
      'roles_updated',
      'report_resolved',
      'report_dismissed',
      'group_approved',
      'group_rejected',
      'appeal_submitted',
      'appeal_approved',
      'appeal_rejected'
    )
  )
);

create index if not exists moderation_audit_log_created_idx
  on public.moderation_audit_log(created_at desc);

create index if not exists moderation_audit_log_target_idx
  on public.moderation_audit_log(target_user_id, created_at desc);

create index if not exists moderation_audit_log_actor_idx
  on public.moderation_audit_log(actor_user_id, created_at desc);

create table if not exists public.punishment_appeals (
  id uuid primary key default gen_random_uuid(),
  appellant_user_id uuid not null references public.profiles(id) on delete cascade,
  audit_log_id uuid not null references public.moderation_audit_log(id) on delete cascade,
  punishment_type text not null default 'ban',
  message text not null,
  status text not null default 'pending',
  resolution_note text,
  resolved_by uuid references public.profiles(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint punishment_appeals_status_check check (status in ('pending', 'approved', 'rejected', 'withdrawn')),
  constraint punishment_appeals_type_check check (punishment_type in ('ban', 'other')),
  constraint punishment_appeals_message_len check (char_length(message) between 20 and 2000)
);

create index if not exists punishment_appeals_status_idx
  on public.punishment_appeals(status, created_at desc);

create index if not exists punishment_appeals_appellant_idx
  on public.punishment_appeals(appellant_user_id, created_at desc);

create unique index if not exists punishment_appeals_one_pending_idx
  on public.punishment_appeals(audit_log_id)
  where status = 'pending';

revoke all on table public.moderation_audit_log from anon;
revoke all on table public.punishment_appeals from anon;
grant select on table public.moderation_audit_log to authenticated;
grant select, insert, update on table public.punishment_appeals to authenticated;

create or replace function public.set_punishment_appeal_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists trg_punishment_appeals_set_updated_at on public.punishment_appeals;
create trigger trg_punishment_appeals_set_updated_at
before update on public.punishment_appeals
for each row
execute function public.set_punishment_appeal_updated_at();

create or replace function public.log_moderation_event(
  p_actor_user_id uuid,
  p_target_user_id uuid,
  p_action_type text,
  p_target_entity_type text default null,
  p_target_entity_id text default null,
  p_reason text default null,
  p_metadata jsonb default '{}'::jsonb,
  p_is_visible_to_target boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into public.moderation_audit_log (
    actor_user_id,
    target_user_id,
    action_type,
    target_entity_type,
    target_entity_id,
    reason,
    metadata,
    is_visible_to_target
  )
  values (
    p_actor_user_id,
    p_target_user_id,
    p_action_type,
    p_target_entity_type,
    p_target_entity_id,
    nullif(trim(coalesce(p_reason, '')), ''),
    coalesce(p_metadata, '{}'::jsonb),
    coalesce(p_is_visible_to_target, false)
  )
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.enforce_safe_profile_self_update()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if auth.uid() = old.id
     and not public.has_any_role(array['admin', 'moderator_users']) then
    if new.role is distinct from old.role
       or new.roles is distinct from old.roles
       or new.teb_gabki is distinct from old.teb_gabki
       or new.is_banned is distinct from old.is_banned
       or new.banned_until is distinct from old.banned_until
       or coalesce(new.ban_reason, '') is distinct from coalesce(old.ban_reason, '') then
      raise exception 'Restricted profile fields cannot be changed directly';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_profiles_safe_self_update on public.profiles;
create trigger trg_profiles_safe_self_update
before update on public.profiles
for each row
execute function public.enforce_safe_profile_self_update();

create or replace function public.audit_profile_moderation_changes()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if auth.uid() is null or not public.has_any_role(array['admin', 'moderator_users']) then
    return new;
  end if;

  if old.is_banned is distinct from new.is_banned
     or old.banned_until is distinct from new.banned_until
     or coalesce(old.ban_reason, '') is distinct from coalesce(new.ban_reason, '') then
    perform public.log_moderation_event(
      auth.uid(),
      new.id,
      case when new.is_banned then 'ban' else 'unban' end,
      'profile',
      new.id::text,
      case when new.is_banned then new.ban_reason else coalesce(new.ban_reason, old.ban_reason) end,
      jsonb_build_object(
        'previous_is_banned', old.is_banned,
        'new_is_banned', new.is_banned,
        'previous_banned_until', old.banned_until,
        'new_banned_until', new.banned_until
      ),
      true
    );
  end if;

  if old.roles is distinct from new.roles or old.role is distinct from new.role then
    perform public.log_moderation_event(
      auth.uid(),
      new.id,
      'roles_updated',
      'profile',
      new.id::text,
      null,
      jsonb_build_object(
        'old_role', old.role,
        'new_role', new.role,
        'old_roles', old.roles,
        'new_roles', new.roles
      ),
      false
    );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_profiles_audit_moderation_changes on public.profiles;
create trigger trg_profiles_audit_moderation_changes
after update on public.profiles
for each row
execute function public.audit_profile_moderation_changes();

create or replace function public.audit_report_status_changes()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if auth.uid() is null or not public.has_any_role(array['admin', 'moderator_users', 'moderator_content']) then
    return new;
  end if;

  if old.status is distinct from new.status and new.status in ('resolved', 'dismissed') then
    perform public.log_moderation_event(
      auth.uid(),
      null,
      case when new.status = 'resolved' then 'report_resolved' else 'report_dismissed' end,
      'report',
      new.id::text,
      new.reason,
      jsonb_build_object(
        'reported_entity_type', new.reported_entity_type,
        'reported_entity_id', new.reported_entity_id,
        'reporter_id', new.reporter_id,
        'status', new.status
      ),
      false
    );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_reports_audit_status_changes on public.reports;
create trigger trg_reports_audit_status_changes
after update on public.reports
for each row
execute function public.audit_report_status_changes();

create or replace function public.audit_group_moderation_changes()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if auth.uid() is null or not public.has_any_role(array['admin', 'moderator_users']) then
    return new;
  end if;

  if old.is_approved is distinct from new.is_approved and new.is_approved = true then
    perform public.log_moderation_event(
      auth.uid(),
      new.creator_id,
      'group_approved',
      'group',
      new.id::text,
      null,
      jsonb_build_object('group_name', new.name),
      false
    );
  end if;

  return new;
end;
$$;

drop trigger if exists trg_groups_audit_moderation_changes on public.groups;
create trigger trg_groups_audit_moderation_changes
after update on public.groups
for each row
execute function public.audit_group_moderation_changes();

create or replace function public.audit_group_moderation_deletes()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if auth.uid() is null or not public.has_any_role(array['admin', 'moderator_users']) then
    return old;
  end if;

  if old.is_approved = false then
    perform public.log_moderation_event(
      auth.uid(),
      old.creator_id,
      'group_rejected',
      'group',
      old.id::text,
      null,
      jsonb_build_object('group_name', old.name),
      false
    );
  end if;

  return old;
end;
$$;

drop trigger if exists trg_groups_audit_moderation_deletes on public.groups;
create trigger trg_groups_audit_moderation_deletes
before delete on public.groups
for each row
execute function public.audit_group_moderation_deletes();

create or replace function public.can_submit_punishment_appeal(p_audit_log_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.moderation_audit_log mal
    where mal.id = p_audit_log_id
      and mal.target_user_id = auth.uid()
      and mal.action_type = 'ban'
      and mal.is_visible_to_target = true
  )
  and not exists (
    select 1
    from public.punishment_appeals pa
    where pa.audit_log_id = p_audit_log_id
      and pa.status = 'pending'
  );
$$;

create or replace function public.audit_punishment_appeal_submission()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  perform public.log_moderation_event(
    new.appellant_user_id,
    new.appellant_user_id,
    'appeal_submitted',
    'appeal',
    new.id::text,
    new.message,
    jsonb_build_object(
      'audit_log_id', new.audit_log_id,
      'punishment_type', new.punishment_type
    ),
    true
  );

  return new;
end;
$$;

drop trigger if exists trg_punishment_appeals_audit_insert on public.punishment_appeals;
create trigger trg_punishment_appeals_audit_insert
after insert on public.punishment_appeals
for each row
execute function public.audit_punishment_appeal_submission();

create or replace function public.resolve_punishment_appeal(
  p_appeal_id uuid,
  p_new_status text,
  p_resolution_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_appeal public.punishment_appeals%rowtype;
begin
  if not public.has_any_role(array['admin', 'moderator_users']) then
    raise exception 'Insufficient permissions';
  end if;

  if p_new_status not in ('approved', 'rejected') then
    raise exception 'Invalid appeal status';
  end if;

  select *
  into v_appeal
  from public.punishment_appeals
  where id = p_appeal_id
  for update;

  if not found then
    raise exception 'Appeal not found';
  end if;

  if v_appeal.status <> 'pending' then
    raise exception 'Appeal already resolved';
  end if;

  update public.punishment_appeals
  set status = p_new_status,
      resolution_note = nullif(trim(coalesce(p_resolution_note, '')), ''),
      resolved_by = auth.uid(),
      resolved_at = timezone('utc', now())
  where id = p_appeal_id
  returning * into v_appeal;

  if p_new_status = 'approved' and v_appeal.punishment_type = 'ban' then
    update public.profiles
    set is_banned = false,
        banned_until = null,
        ban_reason = null
    where id = v_appeal.appellant_user_id;
  end if;

  perform public.log_moderation_event(
    auth.uid(),
    v_appeal.appellant_user_id,
    case when p_new_status = 'approved' then 'appeal_approved' else 'appeal_rejected' end,
    'appeal',
    v_appeal.id::text,
    v_appeal.resolution_note,
    jsonb_build_object(
      'audit_log_id', v_appeal.audit_log_id,
      'punishment_type', v_appeal.punishment_type,
      'status', v_appeal.status
    ),
    true
  );

  return jsonb_build_object(
    'id', v_appeal.id,
    'status', v_appeal.status,
    'resolved_by', v_appeal.resolved_by,
    'resolved_at', v_appeal.resolved_at
  );
end;
$$;

revoke all on function public.resolve_punishment_appeal(uuid, text, text) from public;
grant execute on function public.resolve_punishment_appeal(uuid, text, text) to authenticated;

alter table public.moderation_audit_log enable row level security;
alter table public.punishment_appeals enable row level security;

drop policy if exists moderation_audit_log_select_moderation_or_target on public.moderation_audit_log;
create policy moderation_audit_log_select_moderation_or_target
on public.moderation_audit_log
for select
to authenticated
using (
  public.has_any_role(array['admin', 'moderator_users', 'moderator_content'])
  or (is_visible_to_target = true and target_user_id = auth.uid())
);

drop policy if exists punishment_appeals_select_owner_or_moderation on public.punishment_appeals;
create policy punishment_appeals_select_owner_or_moderation
on public.punishment_appeals
for select
to authenticated
using (
  auth.uid() = appellant_user_id
  or public.has_any_role(array['admin', 'moderator_users'])
);

drop policy if exists punishment_appeals_insert_owner on public.punishment_appeals;
create policy punishment_appeals_insert_owner
on public.punishment_appeals
for insert
to authenticated
with check (
  auth.uid() = appellant_user_id
  and public.can_submit_punishment_appeal(audit_log_id)
);

drop policy if exists punishment_appeals_update_moderation on public.punishment_appeals;
create policy punishment_appeals_update_moderation
on public.punishment_appeals
for update
to authenticated
using (public.has_any_role(array['admin', 'moderator_users']))
with check (public.has_any_role(array['admin', 'moderator_users']));

-- ----------------------------------------------------------------
-- Reports anti-abuse backfill
-- ----------------------------------------------------------------
create or replace function public.validate_and_limit_report_insert()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  recent_count integer;
  duplicate_exists boolean;
  recent_type_exists boolean;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if new.reporter_id <> auth.uid() then
    raise exception 'Invalid reporter identity';
  end if;

  select count(*)
    into recent_count
  from public.reports r
  where r.reporter_id = new.reporter_id
    and r.created_at >= timezone('utc', now()) - interval '24 hours';

  if recent_count >= 5 then
    raise exception 'Przekroczono dzienny limit zgłoszeń (5/24h). Spróbuj później.';
  end if;

  select exists (
    select 1
    from public.reports r
    where r.reporter_id = new.reporter_id
      and r.reported_entity_type = new.reported_entity_type
      and r.created_at >= timezone('utc', now()) - interval '5 minutes'
  )
    into recent_type_exists;

  if recent_type_exists then
    raise exception 'Odczekaj chwilę przed kolejnym zgłoszeniem tego typu (5 min).';
  end if;

  select exists (
    select 1
    from public.reports r
    where r.reporter_id = new.reporter_id
      and r.reported_entity_type = new.reported_entity_type
      and r.reported_entity_id = new.reported_entity_id
      and r.created_at >= timezone('utc', now()) - interval '12 hours'
  )
    into duplicate_exists;

  if duplicate_exists then
    raise exception 'To zgłoszenie było już niedawno wysłane. Spróbuj później.';
  end if;

  case new.reported_entity_type
    when 'feed_post' then
      if not exists (select 1 from public.feed_posts p where p.id = new.reported_entity_id) then
        raise exception 'Nieprawidłowe zgłoszenie: wpis Feed nie istnieje.';
      end if;
    when 'feed_comment' then
      if not exists (select 1 from public.feed_comments c where c.id = new.reported_entity_id) then
        raise exception 'Nieprawidłowe zgłoszenie: komentarz Feed nie istnieje.';
      end if;
    when 'rewear_post' then
      if not exists (select 1 from public.rewear_posts rp where rp.id = new.reported_entity_id) then
        raise exception 'Nieprawidłowe zgłoszenie: wpis ReWear nie istnieje.';
      end if;
    when 'group_message' then
      if not exists (select 1 from public.group_messages gm where gm.id = new.reported_entity_id) then
        raise exception 'Nieprawidłowe zgłoszenie: wiadomość grupowa nie istnieje.';
      end if;
    when 'direct_message' then
      if not exists (select 1 from public.direct_messages dm where dm.id = new.reported_entity_id) then
        raise exception 'Nieprawidłowe zgłoszenie: wiadomość prywatna nie istnieje.';
      end if;
    when 'chat_group_message' then
      if not exists (select 1 from public.chat_group_messages cgm where cgm.id = new.reported_entity_id) then
        raise exception 'Nieprawidłowe zgłoszenie: wiadomość czatu grupowego nie istnieje.';
      end if;
    when 'group' then
      if not exists (select 1 from public.groups g where g.id = new.reported_entity_id) then
        raise exception 'Nieprawidłowe zgłoszenie: grupa nie istnieje.';
      end if;
    when 'chat_group' then
      if not exists (select 1 from public.chat_groups cg where cg.id = new.reported_entity_id) then
        raise exception 'Nieprawidłowe zgłoszenie: czat grupowy nie istnieje.';
      end if;
    when 'profile' then
      if not exists (select 1 from public.profiles pr where pr.id = new.reported_entity_id) then
        raise exception 'Nieprawidłowe zgłoszenie: profil nie istnieje.';
      end if;
    else
      raise exception 'Nieobsługiwany typ zgłoszenia.';
  end case;

  return new;
end;
$$;

drop trigger if exists trg_reports_validate_and_limit_insert on public.reports;
create trigger trg_reports_validate_and_limit_insert
before insert on public.reports
for each row
execute function public.validate_and_limit_report_insert();

create index if not exists reports_reporter_created_idx
  on public.reports(reporter_id, created_at desc);

create index if not exists reports_reporter_entity_created_idx
  on public.reports(reporter_id, reported_entity_type, reported_entity_id, created_at desc);