-- ============================================================
-- ERROR LOGS TABLE
-- Stores application-level errors from Vercel serverless functions
-- for admin review. Inserted via service role key (bypasses RLS).
-- ============================================================

create table if not exists public.error_logs (
  id         bigserial    primary key,
  level      text         not null default 'error',
  source     text         not null default 'api',
  message    text         not null,
  details    jsonb        not null default '{}'::jsonb,
  created_at timestamptz  not null default timezone('utc', now()),

  constraint error_logs_level_check check (level in ('info', 'warn', 'error'))
);

create index if not exists idx_error_logs_created_at
  on public.error_logs (created_at desc);

create index if not exists idx_error_logs_level
  on public.error_logs (level);

create index if not exists idx_error_logs_source
  on public.error_logs (source);

-- Allow service_role full access (used by lib/errorLog.js via service role key)
alter table public.error_logs enable row level security;

create policy error_logs_service_role_all
  on public.error_logs
  for all
  to service_role
  using (true)
  with check (true);

-- Admins can read logs (for the api/logs.js endpoint)
create policy error_logs_admin_select
  on public.error_logs
  for select
  to authenticated
  using (public.has_role('admin'));

grant insert (level, source, message, details, created_at) on table public.error_logs to service_role;
grant select on table public.error_logs to authenticated;
