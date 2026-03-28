-- ============================================================
-- SECURITY HARDENING 2026-03-28 (round 6)
-- Move TG rewards to DB triggers to avoid client-side balance writes.
-- ============================================================

create or replace function public.award_tg_for_feed_comment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles
  set teb_gabki = coalesce(teb_gabki, 0) + 1
  where id = new.author_id;
  return new;
end;
$$;

create or replace function public.award_tg_for_feed_post()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles
  set teb_gabki = coalesce(teb_gabki, 0) + 15
  where id = new.author_id;
  return new;
end;
$$;

create or replace function public.award_tg_for_rewear_post()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.profiles
  set teb_gabki = coalesce(teb_gabki, 0) + 10
  where id = new.seller_id;
  return new;
end;
$$;

revoke all on function public.award_tg_for_feed_comment() from public;
revoke all on function public.award_tg_for_feed_post() from public;
revoke all on function public.award_tg_for_rewear_post() from public;

drop trigger if exists trg_award_tg_feed_comment on public.feed_comments;
create trigger trg_award_tg_feed_comment
after insert on public.feed_comments
for each row execute function public.award_tg_for_feed_comment();

drop trigger if exists trg_award_tg_feed_post on public.feed_posts;
create trigger trg_award_tg_feed_post
after insert on public.feed_posts
for each row execute function public.award_tg_for_feed_post();

drop trigger if exists trg_award_tg_rewear_post on public.rewear_posts;
create trigger trg_award_tg_rewear_post
after insert on public.rewear_posts
for each row execute function public.award_tg_for_rewear_post();
