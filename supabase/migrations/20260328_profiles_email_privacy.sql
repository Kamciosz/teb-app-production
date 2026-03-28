-- ============================================================
-- SECURITY HARDENING 2026-03-28 (round 7)
-- Restrict direct SELECT access to profiles.email for client roles.
-- ============================================================

-- IMPORTANT: table-level SELECT implies read access to all columns,
-- so we first remove table SELECT for client roles.
revoke select on table public.profiles from anon;
revoke select on table public.profiles from authenticated;

-- Re-grant only non-sensitive columns required by the application.
grant select (
	id,
	full_name,
	avatar_url,
	role,
	roles,
	teb_gabki,
	is_private,
	is_banned,
	banned_until,
	bio,
	metadata,
	created_at,
	updated_at,
	last_tg_award
) on table public.profiles to anon;

grant select (
	id,
	full_name,
	avatar_url,
	role,
	roles,
	teb_gabki,
	is_private,
	is_banned,
	banned_until,
	bio,
	metadata,
	created_at,
	updated_at,
	last_tg_award
) on table public.profiles to authenticated;

-- Defensive explicit revoke for email column.
revoke select (email) on table public.profiles from anon;
revoke select (email) on table public.profiles from authenticated;

-- Keep full server-side access for privileged backend role.
grant select (email) on table public.profiles to service_role;
