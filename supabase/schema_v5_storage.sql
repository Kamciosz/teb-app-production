-- INICJALIZACJA BUCKETU SUPABASE STORAGE (MEDIA) --
-- Zbudowane zgodnie ze standardami Feature-Driven i RBAC
-- Skrypt ten tworzy pojemnik na zdjęcia giełdowe oraz obrazki dodawane w tle edytora artykułów.

-- 1. UTWORZENIE PUBLICZNEGO BUCKETU 'images'
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'images', 
  'images', 
  true, 
  5242880, -- max 5MB per plik
  ARRAY['image/jpeg', 'image/jpg', 'image/png']
);

-- 2. POLITYKI BEZPIECZEŃSTWA (OBJECTS) RLS

-- Odczyt (Pobieranie Obrazków): Dozwolone dla wszystkich (Public) ponieważ obrazki na aukcjach muszą być publiczne
create policy "Odczytywanie obrazkow jest publiczne"
  on storage.objects for select
  using ( bucket_id = 'images' );

-- Wgrywanie (Upload): Dozwolone TYLKO dla uwierzytelnionych użytkowników TEB-App
create policy "Tylko zalogowani wrzucaja obrazki"
  on storage.objects for insert
  with check ( bucket_id = 'images' and auth.role() = 'authenticated' );

-- Modyfikacja (Update): Dozwolone TYLKO dla autora obrazka
create policy "Aktualizacja tylko dla tworcow"
  on storage.objects for update
  using ( bucket_id = 'images' and auth.uid() = owner );

-- Usuwanie (Delete): Dozwolone TYLKO dla autora obrazka lub administratorów (poprzez widok Supabase)
create policy "Kasowanie obrazka wlasciciela"
  on storage.objects for delete
  using ( bucket_id = 'images' and auth.uid() = owner );
