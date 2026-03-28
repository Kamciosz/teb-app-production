# ReWear — Krótki raport dla programisty

Cel: szybkie, techniczne podsumowanie błędów blokujących automatyczne i ręczne dodawanie/usuwanie ogłoszeń.

1) Objawy
- Po kliknięciu FAB (przycisk +) modal "Wystaw Przedmiot" nie otwiera się niezawodnie podczas automatyzacji (Playwright). Skrypt otrzymuje timeout oczekując tekstu `Wystaw Przedmiot`.
- W DOM przed otwarciem modala nie ma `input[type=file]`; uploader jest renderowany dopiero wewnątrz modala.
- Upload obrazów przez ImageKit nie może się wykonać bez prawidłowych zmiennych środowiskowych lub działającego `authenticationEndpoint` (w kodzie domyślnie: `http://localhost:3000/auth`).

2) Kroki do reprodukcji (szybkie)
1. Zaloguj się jako testowy użytkownik.
2. Otwórz /rewear.
3. Kliknij FAB (plus) w prawym dolnym rogu.
4. Oczekuj pojawienia się modala "Wystaw Przedmiot".
5. Jeśli modal się nie pojawi — automatyczne kliknięcie może nie działać z powodu transformacji/CSS lub braku 'visible' w DOM.

3) Logi / dowody
- Zrzuty: `teb-homepage.png`, `teb-after-login.png`, `rewear-modal-missing.png`, `rewear-after-post.png`, `rewear-after-delete.png`.
- Konsola: informacja o beforeinstallprompt; brak błędów ImageKit widocznych (ponieważ upload nie był próbowany bez modala).

4) Możliwe przyczyny
- Floating Action Button (FAB) ma pozycjonowanie/transformacje, co uniemożliwia Playwrightowi trafienie kliknięciem; nie ma stabilnego tekstowego selektora.
- Uploader jest ukryty w modalnym drzewie komponentów React i nie istnieje przed renderem modalnym.
- Brak skonfigurowanego `VITE_IMAGEKIT_*` / `authenticationEndpoint` powoduje, że nawet po otwarciu modala uploady by nie zadziałały.

5) Szybkie poprawki/sugestie
- Dodać `aria-label` lub tekstowy `data-testid` do FAB (np. `data-testid="rewear-fab"`) aby testy mogły go jednoznacznie zlokalizować.
- Upewnić się, że klik jest wykonywany bezpośrednio na faktycznym elementcie — rozważyć `element.click()` z `page.evaluate()` lub usunięcie transformów/overlayów, które mogą blokować pointer events.
- Rozważyć renderowanie `input[type=file]` w DOM (ukryte) lub zapewnienie funkcji otwierającej modal przez wywołanie globalnej funkcji (ułatwia testowanie): np. `window.__openRewearModal()`.
- Skonfigurować i udostępnić `VITE_IMAGEKIT_PUBLIC_KEY`, `VITE_IMAGEKIT_URL_ENDPOINT`, `VITE_IMAGEKIT_AUTH_ENDPOINT` ORAZ implementować endpoint w `api/` do podpisywania uploadów ImageKit.
- Dodać logowanie błędów uploadu/insertów w backendzie oraz widoczne komunikaty błędów w UI.

6) Propozycja priorytetów
1. Dodać testowalny selektor do FAB i/lub expose function to open modal — najprostsze i najszybsze.
2. Wyposażyć repo w mock ImageKit endpoint lub aktualne env, by test uploadu był możliwy.
3. Ułatwić testowanie (data-testid, aria-labels) w kluczowych miejscach formularza.

Jeśli chcesz, mogę przygotować pull request z: 1) dodaniem `data-testid="rewear-fab"` do przycisku FAB i 2) krótkim helperem `window.__openRewearModal = () => { /* dispatch click or set state */ }` — potwierdź czy mam to zaimplementować.
