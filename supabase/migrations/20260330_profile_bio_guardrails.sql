alter table public.profiles
  drop constraint if exists profiles_bio_length_check;

alter table public.profiles
  add constraint profiles_bio_length_check
  check (bio is null or char_length(bio) <= 160) not valid;

drop trigger if exists trg_profiles_clean_content on public.profiles;

create trigger trg_profiles_clean_content
before insert or update of full_name, ban_reason, bio on public.profiles
for each row
execute function public.enforce_clean_content();