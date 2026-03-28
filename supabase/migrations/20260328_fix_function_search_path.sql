-- ============================================================
-- SECURITY HARDENING 2026-03-28 (round 3)
-- Set immutable search_path on trigger functions
-- ============================================================

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $function$
begin
  new.updated_at = now();
  return new;
end;
$function$;

create or replace function public.handle_feed_comments_count()
returns trigger
language plpgsql
set search_path = public
as $function$
begin
  if tg_op = 'INSERT' then
    update public.feed_posts set comment_count = coalesce(comment_count, 0) + 1 where id = new.post_id;
    return new;
  elsif tg_op = 'DELETE' then
    update public.feed_posts set comment_count = greatest(coalesce(comment_count, 0) - 1, 0) where id = old.post_id;
    return old;
  end if;
  return null;
end;
$function$;

create or replace function public.handle_feed_votes_count()
returns trigger
language plpgsql
set search_path = public
as $function$
declare pid bigint;
begin
  case tg_op
    when 'INSERT', 'UPDATE' then pid := new.post_id;
    when 'DELETE' then pid := old.post_id;
  end case;

  update public.feed_posts
  set upvotes   = (select count(*) from public.feed_votes where post_id = pid and vote_type = 'up'),
      downvotes = (select count(*) from public.feed_votes where post_id = pid and vote_type = 'down')
  where id = pid;

  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$function$;
