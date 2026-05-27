-- ###########################################################################
-- Migration: TEBtalk redesign — expand role system & RLS per-rola
-- 2026-05-27
--
-- Changes:
--   1. chat_groups           — dodaje default_role dla nowych członków
--   2. profiles              — dodaje chat_role (preferowany role w czatach)
--   3. chat_group_members    — rozszerza role: owner, admin, moderator, member, muted, banned
--   4. Helper functions      — aktualizacja is_chat_group_member, is_chat_group_admin
--                             + nowe: get_chat_group_role, is_chat_group_banned, is_chat_group_muted
--   5. RLS                   — wszystkie polityki dla chat_groups / chat_group_members
--                             per rola zamiast hardcode admin/member
-- ###########################################################################

-- ============================================================================
-- PHASE 1 — Schema ALTERs
-- ============================================================================

-- 1a. chat_groups — domyślna rola dla nowych członków
ALTER TABLE public.chat_groups
  ADD COLUMN IF NOT EXISTS default_role text NOT NULL DEFAULT 'member';

-- 1b. profiles — domyślna rola użytkownika w czatach
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS chat_role text NOT NULL DEFAULT 'member';

-- 1c. chat_group_members — rozszerzony zestaw ról + constraint
ALTER TABLE public.chat_group_members
  DROP CONSTRAINT IF EXISTS chat_group_members_role_check;

ALTER TABLE public.chat_group_members
  ADD CONSTRAINT chat_group_members_role_check
    CHECK (role IN ('owner', 'admin', 'moderator', 'member', 'muted', 'banned'));

-- 1d. Migruj istniejących creatorów — z admin → owner
UPDATE public.chat_group_members cgm
  SET role = 'owner'
  FROM public.chat_groups cg
  WHERE cgm.group_id = cg.id
    AND cgm.user_id = cg.creator_id
    AND cgm.role = 'admin';

-- ============================================================================
-- PHASE 2 — Drop old RLS policies (must come BEFORE function drops)
-- ============================================================================

-- chat_groups
DROP POLICY IF EXISTS chat_groups_select ON public.chat_groups;
DROP POLICY IF EXISTS chat_groups_insert ON public.chat_groups;
DROP POLICY IF EXISTS chat_groups_update ON public.chat_groups;
DROP POLICY IF EXISTS chat_groups_delete ON public.chat_groups;

-- chat_group_members
DROP POLICY IF EXISTS chat_group_members_select ON public.chat_group_members;
DROP POLICY IF EXISTS chat_group_members_insert ON public.chat_group_members;
DROP POLICY IF EXISTS chat_group_members_delete ON public.chat_group_members;

-- chat_group_messages
DROP POLICY IF EXISTS chat_group_messages_select ON public.chat_group_messages;
DROP POLICY IF EXISTS chat_group_messages_insert ON public.chat_group_messages;
DROP POLICY IF EXISTS chat_group_messages_update ON public.chat_group_messages;
DROP POLICY IF EXISTS chat_group_messages_delete ON public.chat_group_messages;

-- ============================================================================
-- PHASE 3 — Helper functions (NOTE: chat_groups.id is bigint, not uuid!)
--             Drop old first because policies are gone
-- ============================================================================

-- 3a. is_chat_group_member — teraz wyklucza zbanowanych
DROP FUNCTION IF EXISTS public.is_chat_group_member(bigint) CASCADE;
CREATE FUNCTION public.is_chat_group_member(gid bigint)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.chat_group_members cgm
    WHERE cgm.group_id = gid
      AND cgm.user_id = auth.uid()
      AND cgm.role <> 'banned'
  );
$$;

-- 3b. is_chat_group_admin — teraz owner LUB admin
DROP FUNCTION IF EXISTS public.is_chat_group_admin(bigint) CASCADE;
CREATE FUNCTION public.is_chat_group_admin(gid bigint)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.chat_group_members cgm
    WHERE cgm.group_id = gid
      AND cgm.user_id = auth.uid()
      AND cgm.role IN ('owner', 'admin')
  );
$$;

-- 3c. get_chat_group_role — zwraca role użytkownika w grupie (lub null)
DROP FUNCTION IF EXISTS public.get_chat_group_role(bigint);
CREATE FUNCTION public.get_chat_group_role(gid bigint)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT cgm.role
  FROM public.chat_group_members cgm
  WHERE cgm.group_id = gid
    AND cgm.user_id = auth.uid();
$$;

-- 3d. is_chat_group_banned — sprawdza czy użytkownik zbanowany w grupie
DROP FUNCTION IF EXISTS public.is_chat_group_banned(bigint);
CREATE FUNCTION public.is_chat_group_banned(gid bigint)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.chat_group_members cgm
    WHERE cgm.group_id = gid
      AND cgm.user_id = auth.uid()
      AND cgm.role = 'banned'
  );
$$;

-- 3e. is_chat_group_muted — sprawdza czy użytkownik wyciszony w grupie
DROP FUNCTION IF EXISTS public.is_chat_group_muted(bigint);
CREATE FUNCTION public.is_chat_group_muted(gid bigint)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.chat_group_members cgm
    WHERE cgm.group_id = gid
      AND cgm.user_id = auth.uid()
      AND cgm.role = 'muted'
  );
$$;

-- 3f. can_moderate_chat_group — owner/admin/moderator
DROP FUNCTION IF EXISTS public.can_moderate_chat_group(bigint);
CREATE FUNCTION public.can_moderate_chat_group(gid bigint)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.chat_group_members cgm
    WHERE cgm.group_id = gid
      AND cgm.user_id = auth.uid()
      AND cgm.role IN ('owner', 'admin', 'moderator')
  );
$$;

-- ============================================================================
-- PHASE 4 — New RLS policies for chat_groups
-- ============================================================================

-- SELECT: członkowie grupy (nie zbanowani) + global moderation/admin
CREATE POLICY chat_groups_select_member_or_moderation
ON public.chat_groups
FOR SELECT
TO authenticated
USING (
  creator_id = auth.uid()
  OR public.is_chat_group_member(id)
  OR public.has_any_role(ARRAY['moderator_content', 'moderator_users', 'admin'])
);

-- INSERT: authenticated, nie zbanowany
CREATE POLICY chat_groups_insert_authenticated
ON public.chat_groups
FOR INSERT
TO authenticated
WITH CHECK (
  creator_id = auth.uid()
  AND public.current_user_is_banned() IS NOT TRUE
);

-- UPDATE: owner/admin grupy + global moderation/admin
CREATE POLICY chat_groups_update_owner_admin_or_global
ON public.chat_groups
FOR UPDATE
TO authenticated
USING (
  public.is_chat_group_admin(id)
  OR public.has_any_role(ARRAY['moderator_content', 'moderator_users', 'admin'])
)
WITH CHECK (
  public.is_chat_group_admin(id)
  OR public.has_any_role(ARRAY['moderator_content', 'moderator_users', 'admin'])
);

-- DELETE: owner grupy + global admin only
CREATE POLICY chat_groups_delete_owner_or_admin
ON public.chat_groups
FOR DELETE
TO authenticated
USING (
  public.is_chat_group_admin(id)
  OR public.has_any_role(ARRAY['admin'])
);

-- ============================================================================
-- PHASE 5 — New RLS policies for chat_group_members
-- ============================================================================

-- SELECT: członkowie grupy (nie banned) + global moderation/admin
CREATE POLICY chat_group_members_select_member_or_moderation
ON public.chat_group_members
FOR SELECT
TO authenticated
USING (
  public.is_chat_group_member(group_id)
  OR public.has_any_role(ARRAY['moderator_content', 'moderator_users', 'admin'])
);

-- INSERT:
--   - siebie jako member gdy tworzy grupę (creator)
--   - owner/admin grupy może dodawać innych
--   - moderator może dodawać zwykłych członków
--   - global admin/moderation zawsze
CREATE POLICY chat_group_members_insert_by_role
ON public.chat_group_members
FOR INSERT
TO authenticated
WITH CHECK (
  -- Samododanie: tylko gdy user_id = auth.uid() i to jest członek tworzący
  (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1
      FROM public.chat_groups cg
      WHERE cg.id = group_id
        AND cg.creator_id = auth.uid()
    )
    AND role IN ('member', 'owner')
  )
  -- Owner/admin grupy mogą dodawać każdego (z dowolną rolą niższą)
  OR (
    public.is_chat_group_admin(group_id)
    AND role IN ('admin', 'moderator', 'member', 'muted')
  )
  -- Moderator może dodawać tylko member/muted
  OR (
    public.can_moderate_chat_group(group_id)
    AND role IN ('member', 'muted')
  )
  -- Global administration
  OR public.has_any_role(ARRAY['moderator_content', 'moderator_users', 'admin'])
);

-- UPDATE: owner/admin może zmienić role (z ograniczeniami)
-- moderator może mutować/banować
CREATE POLICY chat_group_members_update_by_role
ON public.chat_group_members
FOR UPDATE
TO authenticated
USING (
  public.is_chat_group_admin(group_id)
  OR public.can_moderate_chat_group(group_id)
  OR public.has_any_role(ARRAY['moderator_content', 'moderator_users', 'admin'])
)
WITH CHECK (
  -- Owner/admin może ustawić dowolną rolę
  public.is_chat_group_admin(group_id)
  -- Moderator może ustawić tylko member/muted/banned (nie może awansować)
  OR (
    public.can_moderate_chat_group(group_id)
    AND public.is_chat_group_admin(group_id) IS NOT TRUE
    AND role IN ('member', 'muted', 'banned')
  )
  -- Global administration
  OR public.has_any_role(ARRAY['moderator_content', 'moderator_users', 'admin'])
);

-- DELETE:
--   - self: każdy może opuścić grupę
--   - owner/admin grupy może wyrzucić
--   - moderator może wyrzucić member/muted (nie admin/owner/moderator)
--   - global admin zawsze
CREATE POLICY chat_group_members_delete_by_role
ON public.chat_group_members
FOR DELETE
TO authenticated
USING (
  -- Self-leave (nie dotyczy ownera — owner nie może opuścić bez przekazania)
  auth.uid() = user_id
  -- Owner/admin może wyrzucić każdego (oprócz siebie)
  OR (
    public.is_chat_group_admin(group_id)
    AND auth.uid() <> user_id
  )
  -- Moderator może wyrzucić tylko member/muted
  OR (
    public.can_moderate_chat_group(group_id)
    AND public.is_chat_group_admin(group_id) IS NOT TRUE
    AND EXISTS (
      SELECT 1
      FROM public.chat_group_members cgm2
      WHERE cgm2.group_id = group_id
        AND cgm2.user_id = user_id
        AND cgm2.role IN ('member', 'muted')
    )
  )
  -- Global administration
  OR public.has_any_role(ARRAY['moderator_content', 'moderator_users', 'admin'])
);

-- ============================================================================
-- PHASE 6 — New RLS policies for chat_group_messages
-- ============================================================================

-- SELECT: członkowie grupy (nie banned, nie wykluczeni) + global mod
CREATE POLICY chat_group_messages_select_member
ON public.chat_group_messages
FOR SELECT
TO authenticated
USING (
  public.is_chat_group_member(group_id)
  OR public.has_any_role(ARRAY['moderator_content', 'moderator_users', 'admin'])
);

-- INSERT: członkowie (nie banned, nie muted) + moderator może pisać
CREATE POLICY chat_group_messages_insert_member
ON public.chat_group_messages
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = sender_id
  AND public.is_chat_group_member(group_id)
  AND public.is_chat_group_muted(group_id) IS NOT TRUE
  AND public.is_chat_group_banned(group_id) IS NOT TRUE
  AND public.current_user_is_banned() IS NOT TRUE
);

-- UPDATE: autor + owner/moderator może usunąć (soft delete)
CREATE POLICY chat_group_messages_update_owner_or_moderation
ON public.chat_group_messages
FOR UPDATE
TO authenticated
USING (
  auth.uid() = sender_id
  OR public.can_moderate_chat_group(group_id)
  OR public.has_any_role(ARRAY['moderator_content', 'moderator_users', 'admin'])
)
WITH CHECK (
  auth.uid() = sender_id
  OR public.can_moderate_chat_group(group_id)
  OR public.has_any_role(ARRAY['moderator_content', 'moderator_users', 'admin'])
);

-- DELETE: owner/admin grupy + global admin
CREATE POLICY chat_group_messages_delete_by_role
ON public.chat_group_messages
FOR DELETE
TO authenticated
USING (
  public.is_chat_group_admin(group_id)
  OR public.has_any_role(ARRAY['moderator_content', 'moderator_users', 'admin'])
);

-- ============================================================================
-- PHASE 7 — Constraints & Indexes
-- ============================================================================

-- Nie pozwalamy mieć dwóch ownerów w jednej grupie
CREATE UNIQUE INDEX IF NOT EXISTS idx_chat_group_members_unique_owner
  ON public.chat_group_members (group_id)
  WHERE role = 'owner';

-- Indeks do szybkiego sprawdzania ról
CREATE INDEX IF NOT EXISTS idx_chat_group_members_role
  ON public.chat_group_members (group_id, role);
