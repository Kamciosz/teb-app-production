-- ============================================================
-- SECURITY HARDENING 2026-03-28 (round 2)
-- Remove conflicting permissive RLS policies that bypass stricter rules
-- ============================================================

-- profiles: drop permissive self-update and broad select hotfix policies
-- that can bypass strict column-level protections introduced later.
drop policy if exists profiles_update_own on public.profiles;
drop policy if exists profiles_update_self_fix_v1 on public.profiles;
drop policy if exists profiles_select_authenticated_fix_v1 on public.profiles;

-- rewear_posts: drop permissive owner-only insert/update hotfix policies
-- that bypass item_type role guards (tutoring/service).
drop policy if exists rewear_insert_owner_fix_v1 on public.rewear_posts;
drop policy if exists rewear_update_owner_fix_v1 on public.rewear_posts;

-- Keep rewear_delete_owner_fix_v1 (narrower than base delete policy) and
-- keep stricter main policies from init schema/security migrations.
