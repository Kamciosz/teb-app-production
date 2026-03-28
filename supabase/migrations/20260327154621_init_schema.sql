/*
  TEB App — Supabase PostgreSQL schema
  Rebuilt from source code analysis of teb-app-production.
  Safe to run in a fresh Supabase project (SQL editor).

  Sections:
    1. Extensions
    2. Cleanup (safe for full redeploy)
    3. Shared utility functions
    4. Profiles + auth sync
    5. Feed (posts / comments / votes)
    6. ReWear marketplace
    7. User badges, push subscriptions, friends
    8. Legacy groups system
    9. TEBtalk chat groups
   10. Direct messages
   11. Reports / moderation
   12. Group membership helpers (SECURITY DEFINER)
   13. Row Level Security policies
*/

-- ============================================================
-- 1. EXTENSIONS
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS pgcrypto;


-- ============================================================
-- 2. CLEANUP (drop in dependency order)
-- ============================================================

-- Auth triggers must be removed before the functions they reference
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP TRIGGER IF EXISTS on_auth_user_updated  ON auth.users;

-- Tables (CASCADE removes all dependent triggers, policies, sequences)
DROP TABLE IF EXISTS public.feed_votes             CASCADE;
DROP TABLE IF EXISTS public.feed_comments          CASCADE;
DROP TABLE IF EXISTS public.feed_posts             CASCADE;
DROP TABLE IF EXISTS public.user_badges            CASCADE;
DROP TABLE IF EXISTS public.push_subscriptions     CASCADE;
DROP TABLE IF EXISTS public.reports                CASCADE;
DROP TABLE IF EXISTS public.rewear_posts           CASCADE;
DROP TABLE IF EXISTS public.direct_messages        CASCADE;
DROP TABLE IF EXISTS public.group_messages         CASCADE;
DROP TABLE IF EXISTS public.group_members          CASCADE;
DROP TABLE IF EXISTS public.groups                 CASCADE;
DROP TABLE IF EXISTS public.chat_group_messages    CASCADE;
DROP TABLE IF EXISTS public.chat_group_members     CASCADE;
DROP TABLE IF EXISTS public.chat_groups            CASCADE;
DROP TABLE IF EXISTS public.friends                CASCADE;
DROP TABLE IF EXISTS public.profiles               CASCADE;

-- Functions (CASCADE removes dependent triggers and policies)
DROP FUNCTION IF EXISTS public.set_updated_at()               CASCADE;
DROP FUNCTION IF EXISTS public.has_role(text)                 CASCADE;
DROP FUNCTION IF EXISTS public.has_any_role(text[])           CASCADE;
DROP FUNCTION IF EXISTS public.is_group_member(bigint)        CASCADE;
DROP FUNCTION IF EXISTS public.is_chat_group_member(bigint)   CASCADE;
DROP FUNCTION IF EXISTS public.handle_auth_user_insert()      CASCADE;
DROP FUNCTION IF EXISTS public.handle_auth_user_update()      CASCADE;
DROP FUNCTION IF EXISTS public.handle_feed_comments_count()   CASCADE;
DROP FUNCTION IF EXISTS public.handle_feed_votes_count()      CASCADE;


-- ============================================================
-- 3. SHARED UTILITY FUNCTIONS
-- ============================================================

-- Keeps updated_at current; attached via BEFORE UPDATE triggers.
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


-- Role check — SECURITY DEFINER prevents recursive RLS evaluation on profiles.
-- Usage in policies: public.has_role('admin')
CREATE OR REPLACE FUNCTION public.has_role(_role text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND _role = ANY (roles)
  );
END;
$$;


-- Multi-role check — returns true if the user has ANY of the given roles.
-- Usage: public.has_any_role(ARRAY['admin','moderator_content'])
CREATE OR REPLACE FUNCTION public.has_any_role(_roles text[])
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND roles && _roles
  );
END;
$$;


-- ============================================================
-- 4. PROFILES + AUTH SYNC
-- ============================================================

CREATE TABLE public.profiles (
  id           uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email        text,
  full_name    text,
  avatar_url   text,
  role         text        DEFAULT 'student',        -- legacy single-role field
  roles        text[]      DEFAULT ARRAY['student']::text[],  -- modern multi-role
  teb_gabki    integer     DEFAULT 0,
  is_private   boolean     DEFAULT false,
  is_banned    boolean     DEFAULT false,
  banned_until timestamptz,
  bio          text,
  metadata     jsonb       DEFAULT '{}'::jsonb,
  created_at   timestamptz DEFAULT now(),
  updated_at   timestamptz DEFAULT now()
);

CREATE INDEX idx_profiles_full_name_trgm ON public.profiles USING gin (full_name gin_trgm_ops);
CREATE INDEX idx_profiles_teb_gabki      ON public.profiles (teb_gabki DESC);
CREATE INDEX idx_profiles_is_private     ON public.profiles (is_private);
CREATE INDEX idx_profiles_role           ON public.profiles (role);

CREATE TRIGGER set_updated_at_profiles
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- Create profile row when a new auth user is created
CREATE OR REPLACE FUNCTION public.handle_auth_user_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, created_at)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(
      NEW.raw_user_meta_data->>'full_name',
      split_part(NEW.email, '@', 1)
    ),
    now()
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_auth_user_insert();


-- Propagate email changes from auth.users to profiles
CREATE OR REPLACE FUNCTION public.handle_auth_user_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.profiles
  SET
    email      = NEW.email,
    full_name  = COALESCE(NEW.raw_user_meta_data->>'full_name', full_name),
    updated_at = now()
  WHERE id = NEW.id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_updated
  AFTER UPDATE ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_auth_user_update();


-- ============================================================
-- 5. FEED (posts / comments / votes)
-- ============================================================

CREATE TABLE public.feed_posts (
  id            bigserial   PRIMARY KEY,
  author_id     uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
  title         text        NOT NULL,
  content       text,
  category      text        DEFAULT 'News',
  upvotes       integer     DEFAULT 0,
  downvotes     integer     DEFAULT 0,
  comment_count integer     DEFAULT 0,
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now()
);

CREATE INDEX idx_feed_posts_author_id  ON public.feed_posts (author_id);
CREATE INDEX idx_feed_posts_created_at ON public.feed_posts (created_at DESC);
CREATE INDEX idx_feed_posts_category   ON public.feed_posts (category);

CREATE TRIGGER set_updated_at_feed_posts
  BEFORE UPDATE ON public.feed_posts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


CREATE TABLE public.feed_comments (
  id         bigserial   PRIMARY KEY,
  post_id    bigint      REFERENCES public.feed_posts(id) ON DELETE CASCADE,
  author_id  uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
  content    text        NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_feed_comments_post_id    ON public.feed_comments (post_id);
CREATE INDEX idx_feed_comments_created_at ON public.feed_comments (created_at DESC);

CREATE TRIGGER set_updated_at_feed_comments
  BEFORE UPDATE ON public.feed_comments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


CREATE TABLE public.feed_votes (
  id         bigserial   PRIMARY KEY,
  post_id    bigint      REFERENCES public.feed_posts(id) ON DELETE CASCADE,
  user_id    uuid        REFERENCES public.profiles(id) ON DELETE CASCADE,
  vote_type  text        CHECK (vote_type IN ('up', 'down')),
  created_at timestamptz DEFAULT now(),
  UNIQUE (post_id, user_id)
);


-- Feed counter triggers

CREATE OR REPLACE FUNCTION public.handle_feed_comments_count()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.feed_posts
    SET comment_count = COALESCE(comment_count, 0) + 1
    WHERE id = NEW.post_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.feed_posts
    SET comment_count = GREATEST(COALESCE(comment_count, 0) - 1, 0)
    WHERE id = OLD.post_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER feed_comments_after_insert
  AFTER INSERT ON public.feed_comments
  FOR EACH ROW EXECUTE FUNCTION public.handle_feed_comments_count();

CREATE TRIGGER feed_comments_after_delete
  AFTER DELETE ON public.feed_comments
  FOR EACH ROW EXECUTE FUNCTION public.handle_feed_comments_count();


CREATE OR REPLACE FUNCTION public.handle_feed_votes_count()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  pid bigint;
BEGIN
  CASE TG_OP
    WHEN 'INSERT', 'UPDATE' THEN pid := NEW.post_id;
    WHEN 'DELETE'           THEN pid := OLD.post_id;
  END CASE;

  UPDATE public.feed_posts
  SET
    upvotes   = (SELECT COUNT(*) FROM public.feed_votes WHERE post_id = pid AND vote_type = 'up'),
    downvotes = (SELECT COUNT(*) FROM public.feed_votes WHERE post_id = pid AND vote_type = 'down')
  WHERE id = pid;

  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$;

CREATE TRIGGER feed_votes_after_change
  AFTER INSERT OR UPDATE OR DELETE ON public.feed_votes
  FOR EACH ROW EXECUTE FUNCTION public.handle_feed_votes_count();


-- ============================================================
-- 6. REWEAR MARKETPLACE
-- ============================================================

CREATE TABLE public.rewear_posts (
  id              bigserial     PRIMARY KEY,
  seller_id       uuid          REFERENCES public.profiles(id) ON DELETE CASCADE,
  title           text          NOT NULL,
  description     text,
  price_teb_gabki integer       DEFAULT 0,
  price_pln       numeric(10,2) DEFAULT 0,
  item_type       text,
  image_url       text,
  status          text          DEFAULT 'active' CHECK (status IN ('active', 'sold', 'archived')),
  created_at      timestamptz   DEFAULT now(),
  updated_at      timestamptz   DEFAULT now()
);

CREATE INDEX idx_rewear_posts_seller_id  ON public.rewear_posts (seller_id);
CREATE INDEX idx_rewear_posts_status     ON public.rewear_posts (status);
CREATE INDEX idx_rewear_posts_created_at ON public.rewear_posts (created_at DESC);
CREATE INDEX idx_rewear_posts_title_trgm ON public.rewear_posts USING gin (title gin_trgm_ops);

CREATE TRIGGER set_updated_at_rewear
  BEFORE UPDATE ON public.rewear_posts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ============================================================
-- 7. USER BADGES / PUSH SUBSCRIPTIONS / FRIENDS
-- ============================================================

CREATE TABLE public.user_badges (
  id         bigserial   PRIMARY KEY,
  user_id    uuid        REFERENCES public.profiles(id) ON DELETE CASCADE,
  badge_type text        NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE (user_id, badge_type)
);

CREATE INDEX idx_user_badges_user_id ON public.user_badges (user_id);


CREATE TABLE public.push_subscriptions (
  id                bigserial PRIMARY KEY,
  user_id           uuid      REFERENCES public.profiles(id) ON DELETE CASCADE,
  subscription_json jsonb     NOT NULL,
  created_at        timestamptz DEFAULT now(),
  updated_at        timestamptz DEFAULT now(),
  UNIQUE (user_id)
);

CREATE TRIGGER set_updated_at_push_subscriptions
  BEFORE UPDATE ON public.push_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


CREATE TABLE public.friends (
  id         bigserial   PRIMARY KEY,
  user_id    uuid        REFERENCES public.profiles(id) ON DELETE CASCADE,
  friend_id  uuid        REFERENCES public.profiles(id) ON DELETE CASCADE,
  status     text        DEFAULT 'pending',
  created_at timestamptz DEFAULT now(),
  UNIQUE (user_id, friend_id)
);

CREATE INDEX idx_friends_user_id   ON public.friends (user_id);
CREATE INDEX idx_friends_friend_id ON public.friends (friend_id);


-- ============================================================
-- 8. LEGACY GROUPS SYSTEM (Groups.jsx + Admin.jsx)
-- ============================================================

CREATE TABLE public.groups (
  id          bigserial   PRIMARY KEY,
  name        text        NOT NULL,
  description text,
  creator_id  uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
  is_approved boolean     DEFAULT false,
  is_locked   boolean     DEFAULT false,
  image_url   text,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);

CREATE INDEX idx_groups_creator_id  ON public.groups (creator_id);
CREATE INDEX idx_groups_is_approved ON public.groups (is_approved);

CREATE TRIGGER set_updated_at_groups
  BEFORE UPDATE ON public.groups
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


CREATE TABLE public.group_members (
  id         bigserial   PRIMARY KEY,
  group_id   bigint      REFERENCES public.groups(id) ON DELETE CASCADE,
  user_id    uuid        REFERENCES public.profiles(id) ON DELETE CASCADE,
  role       text        DEFAULT 'member',
  created_at timestamptz DEFAULT now(),
  UNIQUE (group_id, user_id)
);

CREATE INDEX idx_group_members_group_id ON public.group_members (group_id);
CREATE INDEX idx_group_members_user_id  ON public.group_members (user_id);


CREATE TABLE public.group_messages (
  id         bigserial   PRIMARY KEY,
  group_id   bigint      REFERENCES public.groups(id) ON DELETE CASCADE,
  sender_id  uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
  content    text,
  is_deleted boolean     DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_group_messages_group_id   ON public.group_messages (group_id);
CREATE INDEX idx_group_messages_created_at ON public.group_messages (created_at DESC);

CREATE TRIGGER set_updated_at_group_messages
  BEFORE UPDATE ON public.group_messages
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ============================================================
-- 9. TEBTALK CHAT GROUPS (TEBtalk.jsx)
-- ============================================================

CREATE TABLE public.chat_groups (
  id         bigserial   PRIMARY KEY,
  name       text        NOT NULL,
  image_url  text,
  creator_id uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_chat_groups_creator_id ON public.chat_groups (creator_id);

CREATE TRIGGER set_updated_at_chat_groups
  BEFORE UPDATE ON public.chat_groups
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


CREATE TABLE public.chat_group_members (
  id         bigserial   PRIMARY KEY,
  group_id   bigint      REFERENCES public.chat_groups(id) ON DELETE CASCADE,
  user_id    uuid        REFERENCES public.profiles(id) ON DELETE CASCADE,
  role       text        DEFAULT 'member',
  nickname   text,
  created_at timestamptz DEFAULT now(),
  UNIQUE (group_id, user_id)
);

CREATE INDEX idx_chat_group_members_group_id ON public.chat_group_members (group_id);
CREATE INDEX idx_chat_group_members_user_id  ON public.chat_group_members (user_id);


CREATE TABLE public.chat_group_messages (
  id         bigserial   PRIMARY KEY,
  group_id   bigint      REFERENCES public.chat_groups(id) ON DELETE CASCADE,
  sender_id  uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
  content    text,
  is_deleted boolean     DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_chat_group_messages_group_id   ON public.chat_group_messages (group_id);
CREATE INDEX idx_chat_group_messages_created_at ON public.chat_group_messages (created_at DESC);

CREATE TRIGGER set_updated_at_chat_group_messages
  BEFORE UPDATE ON public.chat_group_messages
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ============================================================
-- 10. DIRECT MESSAGES (P2P)
-- ============================================================

CREATE TABLE public.direct_messages (
  id              bigserial   PRIMARY KEY,
  -- conversation_id groups bilateral message threads; used by legacy report context
  conversation_id uuid        DEFAULT gen_random_uuid(),
  sender_id       uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
  receiver_id     uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
  content         text,
  is_deleted      boolean     DEFAULT false,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

CREATE INDEX idx_direct_messages_sender_receiver ON public.direct_messages (sender_id, receiver_id, created_at DESC);
CREATE INDEX idx_direct_messages_receiver        ON public.direct_messages (receiver_id);
CREATE INDEX idx_direct_messages_conversation_id ON public.direct_messages (conversation_id);

CREATE TRIGGER set_updated_at_direct_messages
  BEFORE UPDATE ON public.direct_messages
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ============================================================
-- 11. REPORTS / MODERATION
-- ============================================================

CREATE TABLE public.reports (
  id                   bigserial   PRIMARY KEY,
  reporter_id          uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
  reported_entity_type text        NOT NULL,
  -- text so it works for both numeric (bigint) and uuid entity ids
  reported_entity_id   text,
  reason               text,
  -- flexible JSON context (e.g. message preview, group name, conversation_id)
  context              jsonb,
  status               text        DEFAULT 'pending',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX idx_reports_status   ON public.reports (status);
CREATE INDEX idx_reports_reporter ON public.reports (reporter_id);

CREATE TRIGGER set_updated_at_reports
  BEFORE UPDATE ON public.reports
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ============================================================
-- 12. GROUP MEMBERSHIP HELPERS (SECURITY DEFINER)
--
-- These functions bypass RLS when called from within policies,
-- avoiding infinite recursion when a policy on table T queries
-- the same table T to verify membership.
-- ============================================================

-- Returns true if auth.uid() is a member of the given legacy group
CREATE OR REPLACE FUNCTION public.is_group_member(_group_id bigint)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.group_members
    WHERE group_id = _group_id
      AND user_id  = auth.uid()
  );
END;
$$;


-- Returns true if auth.uid() is a member of the given chat group
CREATE OR REPLACE FUNCTION public.is_chat_group_member(_group_id bigint)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.chat_group_members
    WHERE group_id = _group_id
      AND user_id  = auth.uid()
  );
END;
$$;


-- ============================================================
-- 13. ROW LEVEL SECURITY
--
-- Column references in WITH CHECK / USING always refer to
-- the row being evaluated — never use NEW.column here.
-- ============================================================


-- ---------- profiles ----------
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Public profiles are readable by everyone; private profiles only by
-- the owner, moderator_users, and admin.
-- IS NOT TRUE matches both false and NULL (safer than = false).
CREATE POLICY profiles_select ON public.profiles
  FOR SELECT USING (
    is_private IS NOT TRUE
    OR id = auth.uid()
    OR public.has_role('admin')
    OR public.has_role('moderator_users')
  );

-- A new profile may only be inserted for the authenticated user themselves.
CREATE POLICY profiles_insert ON public.profiles
  FOR INSERT WITH CHECK (id = auth.uid());

-- Users can update their own profile.
CREATE POLICY profiles_update_own ON public.profiles
  FOR UPDATE
  USING     (auth.uid() = id)
  WITH CHECK(auth.uid() = id);

-- Admins can update any profile (e.g. ban, role change).
CREATE POLICY profiles_update_admin ON public.profiles
  FOR UPDATE
  USING     (public.has_role('admin'))
  WITH CHECK(public.has_role('admin'));

-- Only admin can delete profiles.
CREATE POLICY profiles_delete_admin ON public.profiles
  FOR DELETE USING (public.has_role('admin'));


-- ---------- feed_posts ----------
ALTER TABLE public.feed_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY feed_posts_select ON public.feed_posts
  FOR SELECT USING (true);

CREATE POLICY feed_posts_insert ON public.feed_posts
  FOR INSERT WITH CHECK (
    auth.uid() = author_id
    AND public.has_any_role(ARRAY['admin', 'editor', 'moderator_content'])
  );

CREATE POLICY feed_posts_update ON public.feed_posts
  FOR UPDATE
  USING     (auth.uid() = author_id OR public.has_any_role(ARRAY['admin', 'editor', 'moderator_content']))
  WITH CHECK(auth.uid() = author_id OR public.has_any_role(ARRAY['admin', 'editor', 'moderator_content']));

CREATE POLICY feed_posts_delete ON public.feed_posts
  FOR DELETE USING (auth.uid() = author_id OR public.has_any_role(ARRAY['admin', 'editor', 'moderator_content']));


-- ---------- feed_comments ----------
ALTER TABLE public.feed_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY feed_comments_select ON public.feed_comments
  FOR SELECT USING (true);

CREATE POLICY feed_comments_insert ON public.feed_comments
  FOR INSERT WITH CHECK (auth.uid() = author_id);

CREATE POLICY feed_comments_update ON public.feed_comments
  FOR UPDATE
  USING     (auth.uid() = author_id OR public.has_role('admin') OR public.has_role('moderator_content'))
  WITH CHECK(auth.uid() = author_id OR public.has_role('admin') OR public.has_role('moderator_content'));

CREATE POLICY feed_comments_delete ON public.feed_comments
  FOR DELETE USING (auth.uid() = author_id OR public.has_role('admin') OR public.has_role('moderator_content'));


-- ---------- feed_votes ----------
ALTER TABLE public.feed_votes ENABLE ROW LEVEL SECURITY;

CREATE POLICY feed_votes_select ON public.feed_votes
  FOR SELECT USING (true);

CREATE POLICY feed_votes_insert ON public.feed_votes
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY feed_votes_update ON public.feed_votes
  FOR UPDATE
  USING     (auth.uid() = user_id)
  WITH CHECK(auth.uid() = user_id);

CREATE POLICY feed_votes_delete ON public.feed_votes
  FOR DELETE USING (auth.uid() = user_id);


-- ---------- rewear_posts ----------
ALTER TABLE public.rewear_posts ENABLE ROW LEVEL SECURITY;

-- Active listings are public; sellers always see their own listings.
CREATE POLICY rewear_select ON public.rewear_posts
  FOR SELECT USING (status = 'active' OR seller_id = auth.uid() OR public.has_role('admin'));

CREATE POLICY rewear_insert ON public.rewear_posts
  FOR INSERT WITH CHECK (
    auth.uid() = seller_id
    AND (
      item_type IS NULL
      OR item_type = 'item'
      OR (item_type = 'tutoring' AND public.has_any_role(ARRAY['admin', 'tutor']))
      OR (item_type = 'service' AND public.has_any_role(ARRAY['admin', 'freelancer']))
    )
  );

CREATE POLICY rewear_update ON public.rewear_posts
  FOR UPDATE
  USING     (auth.uid() = seller_id OR public.has_role('admin'))
  WITH CHECK(
    (auth.uid() = seller_id OR public.has_role('admin'))
    AND (
      item_type IS NULL
      OR item_type = 'item'
      OR (item_type = 'tutoring' AND public.has_any_role(ARRAY['admin', 'tutor']))
      OR (item_type = 'service' AND public.has_any_role(ARRAY['admin', 'freelancer']))
    )
  );

CREATE POLICY rewear_delete ON public.rewear_posts
  FOR DELETE USING (auth.uid() = seller_id OR public.has_role('admin'));


-- ---------- user_badges ----------
ALTER TABLE public.user_badges ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_badges_select ON public.user_badges
  FOR SELECT USING (user_id = auth.uid() OR public.has_role('admin'));

CREATE POLICY user_badges_insert ON public.user_badges
  FOR INSERT WITH CHECK (user_id = auth.uid() OR public.has_role('admin'));

CREATE POLICY user_badges_delete ON public.user_badges
  FOR DELETE USING (user_id = auth.uid() OR public.has_role('admin'));


-- ---------- push_subscriptions ----------
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY push_select ON public.push_subscriptions
  FOR SELECT USING (auth.uid() = user_id OR public.has_role('admin'));

CREATE POLICY push_insert ON public.push_subscriptions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY push_update ON public.push_subscriptions
  FOR UPDATE
  USING     (auth.uid() = user_id OR public.has_role('admin'))
  WITH CHECK(auth.uid() = user_id OR public.has_role('admin'));

CREATE POLICY push_delete ON public.push_subscriptions
  FOR DELETE USING (auth.uid() = user_id OR public.has_role('admin'));


-- ---------- friends ----------
ALTER TABLE public.friends ENABLE ROW LEVEL SECURITY;

CREATE POLICY friends_select ON public.friends
  FOR SELECT USING (auth.uid() = user_id OR auth.uid() = friend_id OR public.has_role('admin'));

-- Only the initiating side may create a friendship record.
CREATE POLICY friends_insert ON public.friends
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY friends_update ON public.friends
  FOR UPDATE
  USING     (auth.uid() = user_id OR auth.uid() = friend_id OR public.has_role('admin'))
  WITH CHECK(auth.uid() = user_id OR auth.uid() = friend_id OR public.has_role('admin'));

CREATE POLICY friends_delete ON public.friends
  FOR DELETE USING (auth.uid() = user_id OR auth.uid() = friend_id OR public.has_role('admin'));


-- ---------- groups ----------
ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;

-- Unapproved groups are visible only to their creator and admin.
CREATE POLICY groups_select ON public.groups
  FOR SELECT USING (is_approved = true OR creator_id = auth.uid() OR public.has_role('admin'));

CREATE POLICY groups_insert ON public.groups
  FOR INSERT WITH CHECK (auth.uid() = creator_id);

CREATE POLICY groups_update ON public.groups
  FOR UPDATE
  USING     (creator_id = auth.uid() OR public.has_role('admin'))
  WITH CHECK(creator_id = auth.uid() OR public.has_role('admin'));

CREATE POLICY groups_delete ON public.groups
  FOR DELETE USING (public.has_role('admin'));


-- ---------- group_members ----------
-- is_group_member() (SECURITY DEFINER) is used instead of a direct
-- subquery to prevent recursive RLS evaluation on the same table.
ALTER TABLE public.group_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY group_members_select ON public.group_members
  FOR SELECT USING (
    user_id = auth.uid()
    OR public.is_group_member(group_id)
    OR public.has_role('admin')
  );

CREATE POLICY group_members_insert ON public.group_members
  FOR INSERT WITH CHECK (auth.uid() = user_id OR public.has_role('admin'));

CREATE POLICY group_members_delete ON public.group_members
  FOR DELETE USING (auth.uid() = user_id OR public.has_role('admin'));


-- ---------- group_messages ----------
ALTER TABLE public.group_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY group_messages_select ON public.group_messages
  FOR SELECT USING (
    public.is_group_member(group_id)
    OR public.has_role('admin')
    OR public.has_role('moderator_content')
  );

CREATE POLICY group_messages_insert ON public.group_messages
  FOR INSERT WITH CHECK (
    auth.uid() = sender_id
    AND (public.is_group_member(group_id) OR public.has_role('admin'))
  );

CREATE POLICY group_messages_update ON public.group_messages
  FOR UPDATE
  USING     (auth.uid() = sender_id OR public.has_role('admin'))
  WITH CHECK(auth.uid() = sender_id OR public.has_role('admin'));

CREATE POLICY group_messages_delete ON public.group_messages
  FOR DELETE USING (public.has_role('admin'));


-- ---------- chat_groups ----------
ALTER TABLE public.chat_groups ENABLE ROW LEVEL SECURITY;

-- Chat groups list is public (any logged-in user can see available chats).
CREATE POLICY chat_groups_select ON public.chat_groups
  FOR SELECT USING (true);

CREATE POLICY chat_groups_insert ON public.chat_groups
  FOR INSERT WITH CHECK (auth.uid() = creator_id);

CREATE POLICY chat_groups_update ON public.chat_groups
  FOR UPDATE
  USING     (creator_id = auth.uid() OR public.has_role('admin'))
  WITH CHECK(creator_id = auth.uid() OR public.has_role('admin'));

CREATE POLICY chat_groups_delete ON public.chat_groups
  FOR DELETE USING (public.has_role('admin'));


-- ---------- chat_group_members ----------
-- is_chat_group_member() (SECURITY DEFINER) avoids recursive RLS.
ALTER TABLE public.chat_group_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY chat_group_members_select ON public.chat_group_members
  FOR SELECT USING (
    user_id = auth.uid()
    OR public.is_chat_group_member(group_id)
    OR public.has_role('admin')
  );

CREATE POLICY chat_group_members_insert ON public.chat_group_members
  FOR INSERT WITH CHECK (auth.uid() = user_id OR public.has_role('admin'));

CREATE POLICY chat_group_members_delete ON public.chat_group_members
  FOR DELETE USING (auth.uid() = user_id OR public.has_role('admin'));


-- ---------- chat_group_messages ----------
ALTER TABLE public.chat_group_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY chat_group_messages_select ON public.chat_group_messages
  FOR SELECT USING (
    public.is_chat_group_member(group_id)
    OR public.has_role('admin')
    OR public.has_role('moderator_content')
  );

CREATE POLICY chat_group_messages_insert ON public.chat_group_messages
  FOR INSERT WITH CHECK (
    auth.uid() = sender_id
    AND (public.is_chat_group_member(group_id) OR public.has_role('admin'))
  );

CREATE POLICY chat_group_messages_update ON public.chat_group_messages
  FOR UPDATE
  USING     (auth.uid() = sender_id OR public.has_role('admin'))
  WITH CHECK(auth.uid() = sender_id OR public.has_role('admin'));

CREATE POLICY chat_group_messages_delete ON public.chat_group_messages
  FOR DELETE USING (public.has_role('admin'));


-- ---------- direct_messages ----------
ALTER TABLE public.direct_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY direct_messages_select ON public.direct_messages
  FOR SELECT USING (
    auth.uid() = sender_id
    OR auth.uid() = receiver_id
    OR public.has_role('admin')
    OR public.has_role('moderator_users')
  );

CREATE POLICY direct_messages_insert ON public.direct_messages
  FOR INSERT WITH CHECK (auth.uid() = sender_id);

CREATE POLICY direct_messages_update ON public.direct_messages
  FOR UPDATE
  USING     (auth.uid() = sender_id OR public.has_role('admin'))
  WITH CHECK(auth.uid() = sender_id OR public.has_role('admin'));

CREATE POLICY direct_messages_delete ON public.direct_messages
  FOR DELETE USING (public.has_role('admin'));


-- ---------- reports ----------
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

-- Reporters see their own tickets; moderators/admin see all.
CREATE POLICY reports_select ON public.reports
  FOR SELECT USING (
    auth.uid() = reporter_id
    OR public.has_role('admin')
    OR public.has_role('moderator_content')
    OR public.has_role('moderator_users')
  );

-- Any authenticated user can file a report (reporter_id must match caller).
CREATE POLICY reports_insert ON public.reports
  FOR INSERT WITH CHECK (auth.uid() = reporter_id);

-- Status updates are moderator/admin only.
CREATE POLICY reports_update ON public.reports
  FOR UPDATE
  USING     (public.has_role('admin') OR public.has_role('moderator_content') OR public.has_role('moderator_users'))
  WITH CHECK(public.has_role('admin') OR public.has_role('moderator_content') OR public.has_role('moderator_users'));

CREATE POLICY reports_delete ON public.reports
  FOR DELETE USING (public.has_role('admin'));


/* End of schema */





