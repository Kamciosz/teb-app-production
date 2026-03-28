-- ============================================================
-- SECURITY HARDENING 2026-03-28 (reports type cooldown)
-- Adds a short cooldown per report type to reduce abuse bursts.
-- ============================================================

create or replace function public.validate_and_limit_report_insert()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  recent_count integer;
  duplicate_exists boolean;
  recent_type_exists boolean;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if new.reporter_id <> auth.uid() then
    raise exception 'Invalid reporter identity';
  end if;

  -- Rate limit: max 5 reports per user / 24h
  select count(*)
    into recent_count
  from public.reports r
  where r.reporter_id = new.reporter_id
    and r.created_at >= timezone('utc', now()) - interval '24 hours';

  if recent_count >= 5 then
    raise exception 'Przekroczono dzienny limit zgłoszeń (5/24h). Spróbuj później.';
  end if;

  -- Cooldown: prevent bursts of reports for the same entity type
  select exists (
    select 1
    from public.reports r
    where r.reporter_id = new.reporter_id
      and r.reported_entity_type = new.reported_entity_type
      and r.created_at >= timezone('utc', now()) - interval '5 minutes'
  )
    into recent_type_exists;

  if recent_type_exists then
    raise exception 'Odczekaj chwilę przed kolejnym zgłoszeniem tego typu (5 min).';
  end if;

  -- Prevent duplicate report spam for the same entity in a short window
  select exists (
    select 1
    from public.reports r
    where r.reporter_id = new.reporter_id
      and r.reported_entity_type = new.reported_entity_type
      and r.reported_entity_id = new.reported_entity_id
      and r.created_at >= timezone('utc', now()) - interval '12 hours'
  )
    into duplicate_exists;

  if duplicate_exists then
    raise exception 'To zgłoszenie było już niedawno wysłane. Spróbuj później.';
  end if;

  -- Entity existence validation by type
  case new.reported_entity_type
    when 'feed_post' then
      if not exists (select 1 from public.feed_posts p where p.id = new.reported_entity_id) then
        raise exception 'Nieprawidłowe zgłoszenie: wpis Feed nie istnieje.';
      end if;
    when 'feed_comment' then
      if not exists (select 1 from public.feed_comments c where c.id = new.reported_entity_id) then
        raise exception 'Nieprawidłowe zgłoszenie: komentarz Feed nie istnieje.';
      end if;
    when 'rewear_post' then
      if not exists (select 1 from public.rewear_posts rp where rp.id = new.reported_entity_id) then
        raise exception 'Nieprawidłowe zgłoszenie: wpis ReWear nie istnieje.';
      end if;
    when 'group_message' then
      if not exists (select 1 from public.group_messages gm where gm.id = new.reported_entity_id) then
        raise exception 'Nieprawidłowe zgłoszenie: wiadomość grupowa nie istnieje.';
      end if;
    when 'direct_message' then
      if not exists (select 1 from public.direct_messages dm where dm.id = new.reported_entity_id) then
        raise exception 'Nieprawidłowe zgłoszenie: wiadomość prywatna nie istnieje.';
      end if;
    when 'chat_group_message' then
      if not exists (select 1 from public.chat_group_messages cgm where cgm.id = new.reported_entity_id) then
        raise exception 'Nieprawidłowe zgłoszenie: wiadomość czatu grupowego nie istnieje.';
      end if;
    when 'group' then
      if not exists (select 1 from public.groups g where g.id = new.reported_entity_id) then
        raise exception 'Nieprawidłowe zgłoszenie: grupa nie istnieje.';
      end if;
    when 'chat_group' then
      if not exists (select 1 from public.chat_groups cg where cg.id = new.reported_entity_id) then
        raise exception 'Nieprawidłowe zgłoszenie: czat grupowy nie istnieje.';
      end if;
    when 'profile' then
      if not exists (select 1 from public.profiles pr where pr.id = new.reported_entity_id) then
        raise exception 'Nieprawidłowe zgłoszenie: profil nie istnieje.';
      end if;
    else
      raise exception 'Nieobsługiwany typ zgłoszenia.';
  end case;

  return new;
end;
$$;