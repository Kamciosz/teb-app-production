-- ============================================================
-- ReWear messaging + favorites/interested flow
-- 1) Separate marketplace messaging from TEB Talk
-- 2) Add favorites/interested relation with privacy-first RLS
-- 3) Extend moderation/reporting and content guardrails
-- ============================================================

create table if not exists public.rewear_interests (
  post_id uuid not null references public.rewear_posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (post_id, user_id)
);

create table if not exists public.rewear_conversations (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.rewear_posts(id) on delete cascade,
  seller_id uuid not null references public.profiles(id) on delete cascade,
  buyer_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'active',
  last_message_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint rewear_conversations_status_check check (status in ('active', 'closed')),
  constraint rewear_conversations_not_self check (seller_id <> buyer_id),
  constraint rewear_conversations_unique_buyer_per_post unique (post_id, buyer_id)
);

create table if not exists public.rewear_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.rewear_conversations(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  content text not null,
  is_deleted boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists rewear_interests_user_created_idx
  on public.rewear_interests(user_id, created_at desc);

create index if not exists rewear_interests_post_created_idx
  on public.rewear_interests(post_id, created_at desc);

create index if not exists rewear_conversations_seller_last_message_idx
  on public.rewear_conversations(seller_id, last_message_at desc);

create index if not exists rewear_conversations_buyer_last_message_idx
  on public.rewear_conversations(buyer_id, last_message_at desc);

create index if not exists rewear_conversations_post_idx
  on public.rewear_conversations(post_id, created_at desc);

create index if not exists rewear_messages_conversation_created_idx
  on public.rewear_messages(conversation_id, created_at asc);

create index if not exists rewear_messages_sender_created_idx
  on public.rewear_messages(sender_id, created_at desc);

alter table public.rewear_interests enable row level security;
alter table public.rewear_conversations enable row level security;
alter table public.rewear_messages enable row level security;

grant select, insert, delete on table public.rewear_interests to authenticated;
grant select on table public.rewear_conversations to authenticated;
grant select, insert, update on table public.rewear_messages to authenticated;
revoke all on table public.rewear_interests from anon;
revoke all on table public.rewear_conversations from anon;
revoke all on table public.rewear_messages from anon;

alter table public.rewear_messages
  drop constraint if exists rewear_messages_content_length_check;
alter table public.rewear_messages
  add constraint rewear_messages_content_length_check
  check (char_length(content) <= 2000) not valid;

create or replace function public.can_access_rewear_conversation(conv_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.rewear_conversations rc
    where rc.id = conv_id
      and (
        public.has_any_role(array['admin', 'moderator_users'])
        or (
          auth.uid() = rc.seller_id
          and not public.has_blocked_user(rc.buyer_id)
          and not public.is_blocked_by_user(rc.buyer_id)
        )
        or (
          auth.uid() = rc.buyer_id
          and not public.has_blocked_user(rc.seller_id)
          and not public.is_blocked_by_user(rc.seller_id)
        )
      )
  );
$$;

create or replace function public.start_rewear_conversation(p_post_id uuid, p_initial_message text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  target_post public.rewear_posts%rowtype;
  next_conversation_id uuid;
  safe_initial_message text := nullif(btrim(coalesce(p_initial_message, '')), '');
begin
  if actor_id is null then
    raise exception 'Authentication required';
  end if;

  if public.current_user_is_banned() then
    raise exception 'Twoje konto nie moze rozpoczynac rozmow.';
  end if;

  select *
    into target_post
  from public.rewear_posts rp
  where rp.id = p_post_id;

  if not found then
    raise exception 'Ogłoszenie nie istnieje.';
  end if;

  if target_post.seller_id = actor_id then
    raise exception 'Nie mozesz rozpocząć rozmowy z własnym ogłoszeniem.';
  end if;

  if target_post.status <> 'active' then
    raise exception 'To ogloszenie nie przyjmuje nowych rozmow.';
  end if;

  if public.has_blocked_user(target_post.seller_id) or public.is_blocked_by_user(target_post.seller_id) then
    raise exception 'Nie mozna rozpocząć rozmowy z tym użytkownikiem.';
  end if;

  insert into public.rewear_conversations (post_id, seller_id, buyer_id)
  values (target_post.id, target_post.seller_id, actor_id)
  on conflict (post_id, buyer_id)
  do update set updated_at = timezone('utc', now())
  returning id into next_conversation_id;

  if safe_initial_message is not null then
    insert into public.rewear_messages (conversation_id, sender_id, content)
    values (next_conversation_id, actor_id, safe_initial_message);
  end if;

  return next_conversation_id;
end;
$$;

create or replace function public.touch_rewear_conversation_last_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.rewear_conversations
     set last_message_at = coalesce(new.created_at, timezone('utc', now())),
         updated_at = timezone('utc', now())
   where id = new.conversation_id;

  return new;
end;
$$;

create or replace function public.complete_rewear_purchase(p_conversation_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  conv public.rewear_conversations%rowtype;
  listing public.rewear_posts%rowtype;
  transfer_tg integer;
begin
  if actor_id is null then
    raise exception 'Authentication required';
  end if;

  select *
    into conv
  from public.rewear_conversations rc
  where rc.id = p_conversation_id;

  if not found then
    raise exception 'Rozmowa nie istnieje.';
  end if;

  if conv.buyer_id <> actor_id then
    raise exception 'Tylko kupujący może potwierdzić przekazanie TG.';
  end if;

  if conv.status <> 'active' then
    raise exception 'Ta rozmowa jest już zamknięta.';
  end if;

  select *
    into listing
  from public.rewear_posts rp
  where rp.id = conv.post_id
  for update;

  if not found then
    raise exception 'Ogłoszenie nie istnieje.';
  end if;

  if listing.status <> 'active' then
    raise exception 'To ogłoszenie nie jest już aktywne.';
  end if;

  transfer_tg := coalesce(listing.price_teb_gabki, 0)::integer;
  if transfer_tg <= 0 then
    raise exception 'To ogłoszenie nie ma ceny w TebGąbkach.';
  end if;

  update public.profiles p
     set teb_gabki = p.teb_gabki - transfer_tg,
         updated_at = timezone('utc', now())
   where p.id = conv.buyer_id
     and p.teb_gabki >= transfer_tg;

  if not found then
    raise exception 'Brak wystarczającej liczby TebGąbek.';
  end if;

  update public.profiles p
     set teb_gabki = p.teb_gabki + transfer_tg,
         updated_at = timezone('utc', now())
   where p.id = conv.seller_id;

  update public.rewear_posts
     set status = 'sold',
         updated_at = timezone('utc', now())
   where id = conv.post_id;

  update public.rewear_conversations
     set status = 'closed',
         updated_at = timezone('utc', now())
   where post_id = conv.post_id;

  return jsonb_build_object(
    'transferred_tg', transfer_tg,
    'post_id', conv.post_id,
    'conversation_id', conv.id,
    'status', 'sold'
  );
end;
$$;

grant execute on function public.start_rewear_conversation(uuid, text) to authenticated;
grant execute on function public.complete_rewear_purchase(uuid) to authenticated;

drop policy if exists rewear_interests_select_owner_or_seller on public.rewear_interests;
create policy rewear_interests_select_owner_or_seller
on public.rewear_interests
for select
to authenticated
using (
  auth.uid() = user_id
  or public.has_any_role(array['admin', 'moderator_users'])
  or (
    exists (
      select 1
      from public.rewear_posts rp
      where rp.id = post_id
        and rp.seller_id = auth.uid()
    )
    and not public.has_blocked_user(user_id)
    and not public.is_blocked_by_user(user_id)
  )
);

drop policy if exists rewear_interests_insert_self on public.rewear_interests;
create policy rewear_interests_insert_self
on public.rewear_interests
for insert
to authenticated
with check (
  auth.uid() = user_id
  and public.current_user_is_banned() is not true
  and exists (
    select 1
    from public.rewear_posts rp
    where rp.id = post_id
      and rp.seller_id <> auth.uid()
      and rp.status = 'active'
  )
  and not exists (
    select 1
    from public.rewear_posts rp
    where rp.id = post_id
      and (public.has_blocked_user(rp.seller_id) or public.is_blocked_by_user(rp.seller_id))
  )
);

drop policy if exists rewear_interests_delete_self_or_moderation on public.rewear_interests;
create policy rewear_interests_delete_self_or_moderation
on public.rewear_interests
for delete
to authenticated
using (
  auth.uid() = user_id
  or public.has_any_role(array['admin', 'moderator_users'])
);

drop policy if exists rewear_conversations_select_participants on public.rewear_conversations;
create policy rewear_conversations_select_participants
on public.rewear_conversations
for select
to authenticated
using (
  public.can_access_rewear_conversation(id)
);

drop policy if exists rewear_messages_select_participants on public.rewear_messages;
create policy rewear_messages_select_participants
on public.rewear_messages
for select
to authenticated
using (
  public.can_access_rewear_conversation(conversation_id)
);

drop policy if exists rewear_messages_insert_participant on public.rewear_messages;
create policy rewear_messages_insert_participant
on public.rewear_messages
for insert
to authenticated
with check (
  auth.uid() = sender_id
  and public.current_user_is_banned() is not true
  and exists (
    select 1
    from public.rewear_conversations rc
    where rc.id = conversation_id
      and rc.status = 'active'
      and (
        (auth.uid() = rc.seller_id and sender_id = rc.seller_id)
        or (auth.uid() = rc.buyer_id and sender_id = rc.buyer_id)
      )
      and not public.has_blocked_user(case when auth.uid() = rc.seller_id then rc.buyer_id else rc.seller_id end)
      and not public.is_blocked_by_user(case when auth.uid() = rc.seller_id then rc.buyer_id else rc.seller_id end)
  )
);

drop policy if exists rewear_messages_update_sender_or_moderation on public.rewear_messages;
create policy rewear_messages_update_sender_or_moderation
on public.rewear_messages
for update
to authenticated
using (
  auth.uid() = sender_id
  or public.has_any_role(array['admin', 'moderator_users'])
)
with check (
  auth.uid() = sender_id
  or public.has_any_role(array['admin', 'moderator_users'])
);

drop trigger if exists trg_rewear_conversations_set_updated_at on public.rewear_conversations;
create trigger trg_rewear_conversations_set_updated_at
before update on public.rewear_conversations
for each row
execute function public.set_updated_at();

drop trigger if exists trg_rewear_messages_set_updated_at on public.rewear_messages;
create trigger trg_rewear_messages_set_updated_at
before update on public.rewear_messages
for each row
execute function public.set_updated_at();

drop trigger if exists trg_rewear_messages_touch_conversation on public.rewear_messages;
create trigger trg_rewear_messages_touch_conversation
after insert on public.rewear_messages
for each row
execute function public.touch_rewear_conversation_last_message();

alter table public.reports
  drop constraint if exists reports_entity_type_check;
alter table public.reports
  add constraint reports_entity_type_check check (
    reported_entity_type in (
      'feed_post',
      'feed_comment',
      'rewear_post',
      'rewear_message',
      'group_message',
      'direct_message',
      'chat_group_message',
      'group',
      'chat_group',
      'profile'
    )
  ) not valid;

create or replace function public.validate_and_limit_report_insert()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  recent_count integer;
  duplicate_exists boolean;
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
    when 'rewear_message' then
      if not exists (select 1 from public.rewear_messages rm where rm.id = new.reported_entity_id) then
        raise exception 'Nieprawidłowe zgłoszenie: wiadomość ReWear nie istnieje.';
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
  elsif tg_table_name = 'rewear_messages' then
    if public.has_profanity(new.content) then
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

drop trigger if exists trg_rewear_messages_clean_content on public.rewear_messages;
create trigger trg_rewear_messages_clean_content
before insert or update of content on public.rewear_messages
for each row
execute function public.enforce_clean_content();