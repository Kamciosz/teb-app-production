-- ============================================================
-- SAFETY SPRINT 2 - moderation audit log + punishment appeals
-- Also hardens profile self-updates so users cannot change
-- restricted moderation/system fields via direct API calls.
-- ============================================================

alter table public.profiles
  add column if not exists ban_reason text;

grant select (ban_reason) on table public.profiles to authenticated;

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

drop trigger if exists trg_punishment_appeals_set_updated_at on public.punishment_appeals;
create trigger trg_punishment_appeals_set_updated_at
before update on public.punishment_appeals
for each row
execute function public.set_updated_at();

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