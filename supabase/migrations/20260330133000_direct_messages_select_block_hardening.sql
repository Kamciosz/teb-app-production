-- ============================================================
-- Direct messages RLS hardening (SELECT path)
-- Ensure blocked relationships cannot read each other's DMs.
-- Moderation roles keep access for safety workflows.
-- ============================================================

-- Remove legacy variants from earlier migrations/backfills.
drop policy if exists direct_messages_select on public.direct_messages;
drop policy if exists direct_messages_select_participants_fix_v1 on public.direct_messages;

create policy direct_messages_select
on public.direct_messages
for select
to authenticated
using (
  -- Moderation visibility for abuse/security handling
  public.has_any_role(array['admin', 'moderator_users'])
  or (
    auth.uid() = sender_id
    and not public.has_blocked_user(receiver_id)
    and not public.is_blocked_by_user(receiver_id)
  )
  or (
    auth.uid() = receiver_id
    and not public.has_blocked_user(sender_id)
    and not public.is_blocked_by_user(sender_id)
  )
);
