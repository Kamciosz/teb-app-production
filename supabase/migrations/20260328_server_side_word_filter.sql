-- ============================================================
-- SECURITY HARDENING 2026-03-28 (round 5)
-- Server-side profanity guard (DB triggers) to prevent API bypass.
-- ============================================================

create or replace function public.normalize_for_filter(p_text text)
returns text
language sql
immutable
set search_path = public
as $$
  select regexp_replace(
    translate(
      lower(coalesce(p_text, '')),
      'ąćęłńóśżź',
      'acelnoszz'
    ),
    '[\s\._\-]+',
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
  banned text[] := array[
    'kurwa','chuj','pizda','jebac','pierdolic','skurwysyn',
    'kutas','cwel','pedal','dziwka','suka','pizdu','jebie'
  ];
  token text;
begin
  if normalized = '' then
    return false;
  end if;

  foreach token in array banned loop
    if position(token in normalized) > 0 then
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
    if public.has_profanity(split_part(coalesce(new.description, ''), '|META:', 1)) then
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
before insert or update of description on public.rewear_posts
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
