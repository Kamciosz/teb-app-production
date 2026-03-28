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
