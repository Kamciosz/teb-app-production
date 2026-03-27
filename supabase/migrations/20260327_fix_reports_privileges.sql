-- 2026-03-27: Restrict table-level privileges on public.reports
-- Revoke accidental privileges from the `anon` role so RLS policies apply correctly.

REVOKE ALL ON TABLE public.reports FROM anon;

-- Ensure authenticated users still have table-level privileges (RLS will enforce row access):
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.reports TO authenticated;

-- Keep full privileges for the service_role (server-side operations):
GRANT ALL ON TABLE public.reports TO service_role;

-- Ensure RLS is enabled (idempotent):
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
