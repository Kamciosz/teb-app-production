## ReWear — Raport problemów i obserwacji

Data: 2026-03-26

Krótko: podczas próby dodania i usunięcia ogłoszenia w sekcji `ReWear` natrafiłem na kilka problemów, które uniemożliwiły w pełni zautomatyzowane opublikowanie i usunięcie oferty.

1) Co robiłem
- Zalogowałem się na wskazane konto.
- Otworzyłem stronę główną `rewear` i próbowałem otworzyć modal "Wystaw Przedmiot" (FAB).
- Po otwarciu formularza próbowałem wypełnić pola i przesłać ogłoszenie, a następnie usunąć je.

2) Zaobserwowane problemy
- Modal dodawania (`Wystaw Przedmiot`) nie otwierał się niezawodnie przy automatycznym klikaniu (Playwright). Skrypt otrzymał timeout podczas oczekiwania na selektor modalny.
- W DOM przed otwarciem modala nie znaleziono znacznika `input[type=file]` (uploader jest tworzony wewnątrz modala). To uniemożliwia wcześniejsze przygotowanie pliku do uploadu bez prawidłowego otwarcia modala.
- `ImageKitService` używa zmiennych środowiskowych (`VITE_IMAGEKIT_PUBLIC_KEY`, `VITE_IMAGEKIT_URL_ENDPOINT`, `VITE_IMAGEKIT_AUTH_ENDPOINT`) i domyślnie odwołuje się do `http://localhost:3000/auth` jako `authenticationEndpoint`. Jeśli endpoint lub klucze są placeholderami, uploady do ImageKit się nie powiodą.
- Brak widocznych przycisków/etykiet tekstowych dla niektórych elementów (UI mocno ikoniczne), co utrudnia niezawodną automatyzację selektorami tekstowymi.

3) Dowody (zapisane pliki)
- teb-homepage.png — zrzut strony logowania
- teb-after-login.png — zrzut po zalogowaniu
- rewear-modal-missing.png — zrzut pokazujący brak otwartego modala po próbach kliknięcia FAB
- rewear-after-post.png — zrzut po próbie publikacji (może być stan niezmieniony)
- rewear-after-delete.png — zrzut po próbie usunięcia

4) Potencjalne przyczyny
- Dynamiczne pozycjonowanie FAB i użycie ikon powoduje, że automatyczne kliknięcie Playwrighta nie trafia w element (np. element w warstwie CSS/transformacji). Może być potrzebne przewinięcie/udowodnienie widoczności lub użycie dokładnego selektora klasy.
- Brak skonfigurowanego serwera podpisującego (authenticationEndpoint) dla ImageKit — frontend oczekuje publicKey + endpointu do bezpiecznego uploadu.
- RLS/polityki Supabase lub wymaganie sesji mogą blokować inserty, jeśli sesja nie jest aktywna lub role są niewłaściwe.

5) Sugerowane kroki naprawcze
- Dla otwierania modala: użyć dokładnego selektora klasy FAB (`button` z `fixed bottom-24 right-6 w-14 h-14`), albo wywołać funkcję JS w kontekście strony aby otworzyć modal (np. dispatch event lub ustawić stan React). Alternatywnie użyć `page.evaluate()` do kliknięcia elementu przez `document.querySelector` i `element.click()`.
- Dla uploadu: skonfigurować `VITE_IMAGEKIT_*` w środowisku i wystawić endpoint `authenticationEndpoint` na serwerze (np. w `api/`), który podpisze uploady ImageKit. Jako szybki test można zmockować `ImageKitService.upload` aby zwracał tymczasowy URL.
- Dla testów API: w sytuacji, gdy UI zawodzą, dodać tymczasowy skrypt do wstawiania rekordu do `rewear_posts` używając klucza service-role lub sesji testowej (uwaga: bezpieczeństwo i RLS).
- Poprawić a11y/teksty przycisków — dodać `aria-label` lub tekst tam, gdzie jest to sensowne, by ułatwić automatyzację.

6) Kolejne kroki które mogę wykonać
- Spróbować ponownie automatycznie otworzyć modal używając `page.evaluate(document.querySelector(...).click())` i powtórzyć upload (wymaga zgody). 
- Wstawić testowy rekord bez UI korzystając z Supabase (wymaga dostępu do env/service role lub zgody). 
- Przygotować szczegółową instrukcję testową krok‑po‑kroku do wykonania ręcznie.

Jeśli chcesz, wykonam pierwszy krok automatyczny (spróbuję `document.querySelector(...).click()`), lub wstawię testowy rekord przez Supabase po otrzymaniu zgody/zmiennych. 
