-- ============================================================
-- SECURITY FIX 2026-03-28
-- P1: Block self-escalation of roles/teb_gabki via RLS
-- P6: Move daily TG award logic to server-side function
-- ============================================================

-- ----------------------------------------------------------------
-- P1: Replace permissive profiles_update_self policy with one that
--     forbids users from writing to sensitive columns.
--     Sensitive columns: roles, role, is_banned, banned_until,
--     teb_gabki (managed by award_daily_tg / buy_badge functions)
-- ----------------------------------------------------------------
drop policy if exists profiles_update_self on public.profiles;

create policy profiles_update_self
on public.profiles
for update
to authenticated
using (auth.uid() = id)
with check (
  auth.uid() = id
  -- Block writing sensitive columns: enforce they haven't changed
  and roles            is not distinct from (select roles            from public.profiles where id = auth.uid())
  and role             is not distinct from (select role             from public.profiles where id = auth.uid())
  and is_banned        is not distinct from (select is_banned        from public.profiles where id = auth.uid())
  and banned_until     is not distinct from (select banned_until     from public.profiles where id = auth.uid())
  and teb_gabki        is not distinct from (select teb_gabki        from public.profiles where id = auth.uid())
);

-- ----------------------------------------------------------------
-- P6: Add last_tg_award column to profiles (tracks last daily award)
-- ----------------------------------------------------------------
alter table public.profiles
  add column if not exists last_tg_award date;

-- ----------------------------------------------------------------
-- P6: Function award_daily_tg()
--     Called via supabase.rpc('award_daily_tg') from the frontend.
--     Grants +5 teb_gabki once per calendar day per user.
--     Runs as SECURITY DEFINER so it can bypass RLS to update
--     teb_gabki — the RLS policy above blocks direct user updates.
-- ----------------------------------------------------------------
create or replace function public.award_daily_tg()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today      date := current_date;
  v_last_award date;
  v_uid        uuid := auth.uid();
begin
  if v_uid is null then
    return jsonb_build_object('awarded', false, 'reason', 'not authenticated');
  end if;

  select last_tg_award into v_last_award
  from public.profiles
  where id = v_uid;

  if v_last_award = v_today then
    return jsonb_build_object('awarded', false, 'reason', 'already awarded today');
  end if;

  update public.profiles
  set
    teb_gabki    = coalesce(teb_gabki, 0) + 5,
    last_tg_award = v_today
  where id = v_uid;

  return jsonb_build_object('awarded', true, 'tg_added', 5);
end;
$$;

-- Grant execute to authenticated users only
revoke all on function public.award_daily_tg() from public;
grant execute on function public.award_daily_tg() to authenticated;

-- ----------------------------------------------------------------
-- P13: Function buy_badge(p_badge_id, p_price)
--      Atomic badge purchase — deducts teb_gabki and inserts badge
--      in a single transaction. Prevents race conditions and
--      bypasses the RLS teb_gabki write restriction.
-- ----------------------------------------------------------------
create or replace function public.buy_badge(p_badge_id text, p_price int)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid     uuid := auth.uid();
  v_balance int;
  v_exists  boolean;
begin
  if v_uid is null then
    return jsonb_build_object('success', false, 'error', 'not authenticated');
  end if;

  if p_price < 0 then
    return jsonb_build_object('success', false, 'error', 'invalid price');
  end if;

  -- Lock the row to prevent concurrent purchases
  select teb_gabki into v_balance
  from public.profiles
  where id = v_uid
  for update;

  if v_balance is null or v_balance < p_price then
    return jsonb_build_object('success', false, 'error', 'insufficient teb_gabki');
  end if;

  -- Check if badge already owned
  select exists(
    select 1 from public.user_badges
    where user_id = v_uid and badge_type = p_badge_id
  ) into v_exists;

  if v_exists then
    return jsonb_build_object('success', false, 'error', 'badge already owned');
  end if;

  -- Deduct balance and insert badge atomically
  update public.profiles
  set teb_gabki = teb_gabki - p_price
  where id = v_uid;

  insert into public.user_badges (user_id, badge_type)
  values (v_uid, p_badge_id);

  return jsonb_build_object('success', true, 'new_balance', v_balance - p_price);
end;
$$;

revoke all on function public.buy_badge(text, int) from public;
grant execute on function public.buy_badge(text, int) to authenticated;
