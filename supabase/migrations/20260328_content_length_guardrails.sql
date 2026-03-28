-- ============================================================
-- SECURITY HARDENING 2026-03-28 (round 4)
-- Content length guardrails to reduce text-based abuse/DoS risk.
-- Added as NOT VALID to avoid blocking deploys on legacy oversized rows.
-- ============================================================

-- Feed
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

-- ReWear
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

-- Messaging
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

-- Group metadata
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
