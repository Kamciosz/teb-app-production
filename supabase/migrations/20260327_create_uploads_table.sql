-- Migration: create uploads table with RLS
-- Generated: 2026-03-27

-- Table: public.uploads
CREATE TABLE IF NOT EXISTS public.uploads (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  key text NOT NULL UNIQUE,
  public_url text NOT NULL,
  content_type text,
  expected_size bigint,
  status text NOT NULL DEFAULT 'issued',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS uploads_user_id_idx ON public.uploads (user_id);
CREATE INDEX IF NOT EXISTS uploads_created_at_idx ON public.uploads (created_at);

-- Enable Row Level Security
ALTER TABLE public.uploads ENABLE ROW LEVEL SECURITY;

-- Policies: allow owners to manage their uploads, admins bypass via has_role
CREATE POLICY uploads_select_owner ON public.uploads
  FOR SELECT USING (user_id = auth.uid() OR public.has_role('admin'));

CREATE POLICY uploads_insert_owner ON public.uploads
  FOR INSERT WITH CHECK (user_id = auth.uid() OR public.has_role('admin'));

CREATE POLICY uploads_update_owner ON public.uploads
  FOR UPDATE
  USING (user_id = auth.uid() OR public.has_role('admin'))
  WITH CHECK (user_id = auth.uid() OR public.has_role('admin'));

CREATE POLICY uploads_delete_owner ON public.uploads
  FOR DELETE USING (user_id = auth.uid() OR public.has_role('admin'));

-- Grant basic privileges to authenticated role
GRANT SELECT, INSERT, UPDATE, DELETE ON public.uploads TO authenticated;
