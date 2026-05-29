# TEBtalk Redesign — Plan

## 1. Diagnoza

### Co jest zle:

| Problem | Objaw | Przyczyna |
|---------|-------|-----------|
| Brak rol per-czat | Kazdy ma te same uprawnienia w kazdej grupie | `chat_group_members` ma tylko `role: 'member'|'admin'` — brak moderatora, brak read-only, brak mute |
| Monolit 1421 linii | Components/Friends/Groups/TEBtalk to jeden plik, kazdy z wlasnym session management, message grouping, cache | Brak separacji — wszystko w jednym JSX |
| Dwa systemy grup | `groups/group_messages/group_members` (publiczne) i `chat_groups/chat_group_messages/chat_group_members` (TEBtalk) — osobne tabele, osobne UI | Historyczny podzial — nigdy nie scalony |
| Hamburger to nakladka | Nie zmienia widoku, tylko overlay na wierzchu | `sidebarOpen` to bool, nie zmienia stanu nawigacji |
| Brak spójnego stanu | friends/search/chat/list — 4 stany `view` recznie zarzadzane | UseState zamiast routingu lub reducera |
| Duplikacja kodu | `groupMessages`, `formatDateSeparator`, `formatTimestamp` identyczne w Groups.jsx i TEBtalk.jsx | Skopiowane zamiast wyciagniete do shared |

### Schemat bazy — obecny balagan:

```
groups               — publiczne grupy (Kółka i Grupy)
  ├── group_messages
  └── group_members

chat_groups           — prywatne grupy (TEBtalk)
  ├── chat_group_messages
  └── chat_group_members

direct_messages       — DM (TEBtalk)
friends               — relacje znajomosci
push_subscriptions    — powiadomienia push
```

## 2. Cel

Jeden unified chat system (TEBtalk) ktory:
- Łaczy DM + grupy w jednym interfejsie (Discord-style)
- Ma role per-czat (admin, moderator, member, muted)
- Ma spójna nawigacje na mobile (hamburger = level-switcher a nie overlay)
- Ma clean architekture: osobne pliki na stan, helpers, komponenty
- Nie duplikuje kodu z Groups.jsx

## 3. Architektura nowa

### 3.1. Schemat bazy (zmiany)

**Scalenie:** `groups` → `chat_groups`, dodanie kolumn permisji.

```sql
-- chat_groups (rozszerzenie)
ALTER TABLE chat_groups ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE chat_groups ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT false;
ALTER TABLE chat_groups ADD COLUMN IF NOT EXISTS category TEXT; -- 'general', 'class', 'club', 'dm'
ALTER TABLE chat_groups ADD COLUMN IF NOT EXISTS max_members INTEGER DEFAULT 0; -- 0 = unlimited

-- chat_group_members (rozszerzenie o role)
ALTER TABLE chat_group_members ADD COLUMN IF NOT EXISTS permissions JSONB DEFAULT '{}';
-- permissions: {"can_send": true, "can_invite": false, "can_delete": false, "can_pin": false}
-- role: 'owner', 'admin', 'moderator', 'member', 'muted', 'banned'

-- profiles (dodanie roli globalnej)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS chat_role TEXT DEFAULT 'user';
-- chat_role: 'user', 'global_mod', 'global_admin'
```

### 3.2. Struktura plikow nowa

```
src/features/tebtalk/
├── index.jsx              — entry point (lazy load)
├── TEBtalk.jsx            — glowny layout: sidebar | chat-panel
├── layout/
│   ├── DesktopSidebar.jsx — Discord-style server/channel list
│   ├── MobileNav.jsx      — hamburger-driven level switcher
│   └── ChatPanel.jsx      — messages + input
├── chat/
│   ├── MessageList.jsx    — grouped messages + date separators + scroll
│   ├── MessageBubble.jsx  — single message bubble
│   ├── MessageInput.jsx   — input + upload + emoji
│   └── utils.js           — groupMessages, formatDateSeparator, formatTimestamp
├── sidebar/
│   ├── ChatList.jsx       — lista ostatnich rozmow
│   ├── GroupList.jsx      — lista grup
│   ├── FriendList.jsx     — lista znajomych
│   └── SearchBar.jsx      — wyszukiwarka
├── modals/
│   ├── GroupSettings.jsx  — zarzadzanie grupa
│   ├── CreateGroup.jsx    — tworzenie grupy
│   ├── MemberList.jsx     — lista czlonkow z rolami
│   └── RoleManager.jsx    — zarzadzanie permisjami
├── hooks/
│   ├── useChatSession.js  — getSession, refresh, onAuthStateChange
│   ├── useMessages.js     — fetch, subscribe, loadOlder, cache
│   ├── useFriends.js      — fetch, addFriend, accept, block
│   └── useGroups.js       — fetchGroups, create, join, leave
├── services/
│   ├── tebtalkQueries.js  — wszystkie zapytania Supabase
│   └── tebtalkCache.js    — sessionStorage + useRef cache
└── __tests__/
    └── tebtalk.test.js    — podstawowe testy renderowania
```

### 3.3. Stan aplikacji (useReducer)

Zamiast 20+ useState:

```javascript
const initialState = {
  // Nawigacja
  view: 'list',          // 'list' | 'chat' | 'search'
  level: 'channels',     // 'servers' | 'channels' | 'chat' — Discord-like
  selectedChat: null,    // { id, type: 'dm'|'group' }
  sidebarOpen: false,    // mobile only
  
  // Dane
  user: null,            // { id, full_name, role, avatar_url }
  chats: [],             // recent chats + groups
  friends: [],
  messages: [],
  
  // Stany
  loading: true,
  error: null,
  hasOlderMessages: false,
  loadingOlder: false,
  
  // Modale
  modal: null,           // null | 'createGroup' | 'groupSettings' | 'memberList'
}
```

Reducer akcje:
- `SET_SESSION`, `SET_CHATS`, `SET_MESSAGES`, `SET_FRIENDS`
- `OPEN_CHAT`, `CLOSE_CHAT`, `GO_BACK`, `TOGGLE_SIDEBAR`
- `OPEN_MODAL`, `CLOSE_MODAL`
- `ADD_MESSAGE`, `DELETE_MESSAGE`, `LOAD_OLDER`
- `SET_LOADING`, `SET_ERROR`

### 3.4. System rol

**Globalne (profiles.chat_role):**
| Rola | Uprawnienia |
|------|-------------|
| `global_admin` | Wszystkie grupy, banowanie, usuwanie wiadomosci, zmiana rol |
| `global_mod` | Moderacja w grupach publicznych, mute/ban |
| `user` | Standardowe — widzi tylko swoje grupy |

**Per-grupa (chat_group_members.role):**
| Rola | Uprawnienia |
|------|-------------|
| `owner` | Wszystko — tylko 1 osoba (creator) |
| `admin` | Edycja grupy, zarzadzanie rolami, zapraszanie |
| `moderator` | Usuwanie wiadomosci, mute, kick |
| `member` | Wysylanie wiadomosci |
| `muted` | Widzi, nie moze pisac |
| `banned` | Nie widzi, nie moze dolaczyc |

**RLS:** kazda akcja sprawdza `chat_group_members.permissions` lub `profiles.chat_role`.

### 3.5. Nawigacja (hamburger = level switcher)

Na mobile, w widoku czatu:

```
┌─────────────────────────────┐
│ [☰]  [←]  Nazwa czatu  [⚙] │  ← header
├─────────────────────────────┤
│                             │
│   Wiadomosci (przewijane)   │
│                             │
├─────────────────────────────┤
│ [Input]                [▶]  │
└─────────────────────────────┘
```

Klikniecie ☰ (hamburger):
- NIE overlay — zmienia widok calej strony na liste czatow (jak Discord na mobile)
- Back (←) wraca do poprzedniego poziomu nawigacji
- Poziomy: `channels` (lista grup/kategorii) → `list` (konkretna grupa → lista czatow) → `chat` (wiadomosci)

3 poziomy (jak Discord mobile):
1. **Servers** — lista kategorii / serwerow (DM, Grupy, Znajomi)
2. **Channels** — kanaly w ramach wybranej kategorii
3. **Chat** — wiadomosci w wybranym kanale

Hamburger cofa o jeden poziom:
- W `chat` → klikniecie hamburgera → `channels`
- W `channels` → klikniecie hamburgera → `servers`

### 3.6. Message grouping (shared util)

Wyciagnac `groupMessages`, `formatDateSeparator`, `formatTimestamp`, `splitGroupsByDate` do:
`src/features/tebtalk/chat/utils.js`

Uzywane przez TEBtalk i Groups.

## 4. Kolejnosc implementacji

### Faza 1 — Fundament (baza + struktura)

1. SQL migration: rozszerzenie `chat_groups` i `chat_group_members` o role/permisje
2. SQL migration: dodanie `profiles.chat_role`
3. SQL migration: stworzenie RLS policy per-rola
4. Stworzenie struktury katalogow `src/features/tebtalk/{layout,chat,sidebar,modals,hooks,services}/`
5. Wyciagniecie `chat/utils.js` — shared helpers (groupMessages, date separators, timestamps)
6. Stworzenie `tebtalkQueries.js` — wszystkie zapytania Supabase w jednym pliku
7. Stworzenie `tebtalkCache.js` — cache warstwa (sessionStorage + useRef)

### Faza 2 — Hooki (logika biznesowa)

8. `useChatSession.js` — getSession, ensureBootstrapped, onAuthStateChange
9. `useMessages.js` — fetchMessages, subscribe, loadOlder, scrollToBottom, persistCache
10. `useFriends.js` — fetchFriends, sendRequest, accept, block
11. `useGroups.js` — fetchGroups, createGroup, join, leave, fetchMembers

### Faza 3 — Komponenty UI

12. `MobileNav.jsx` — 3-level navigator z hamburgerem
13. `DesktopSidebar.jsx` — Discord-style channel list
14. `ChatPanel.jsx` — layout: header + messages + input
15. `MessageList.jsx` — grouped messages z date separatorami
16. `MessageBubble.jsx` — single bubble + delete + report
17. `MessageInput.jsx` — input + upload + emoji + send
18. `ChatList.jsx` — ostatnie rozmowy
19. `GroupList.jsx` — lista grup z kategoriami
20. `FriendList.jsx` — znajomi z online statusem
21. `SearchBar.jsx` — wyszukiwarka

### Faza 4 — Modale

22. `GroupSettings.jsx` — edycja nazwy, opisu, kategorii
23. `CreateGroup.jsx` — tworzenie grupy
24. `MemberList.jsx` — lista czlonkow z rolami
25. `RoleManager.jsx` — zmiana rol (tylko dla admin/owner)

### Faza 5 — Integracja

26. `TEBtalk.jsx` — reducer + glowny layout z state management
27. `index.jsx` — lazy-loaded entry point
28. Usuniecie starego `TEBtalk.jsx` (1421 linii)
29. Refactor Groups.jsx — uzycie shared helpers + unified chat komponent

### Faza 6 — Weryfikacja

30. Testy renderowania komponentow (smoke tests)
31. Test integracji: zaloguj → otworz czat → wyslij wiadomosc → odbierz przez Realtime
32. Test roli: admin moze usuwac wiadomosci, member nie moze
33. Test nawigacji mobile: hamburger na 3 poziomach
34. Test wydajnosci: 500+ wiadomosci, 20+ grup, przewijanie

## 5. Ryzyka i kompromisy

| Ryzyko | Mitigacja |
|--------|-----------|
| RLS przy duzej liczbie rol moze byc wolny | Indeksy na `user_id + group_id`, materializowane permisje |
| Stare dane (grupy bez rol) trzeba migrowac | DEFAULT 'member' dla braku roli, skrypt migracyjny |
| Groups.jsx tez uzywa podobnej architektury — scalenie moze zajac duzo czasu | Faza 5: najpierw TEBtalk, potem Groups.jsx refactor |
| Uzytkownicy z starych grup nie maja `chat_group_members` rekordu | Skrypt: INSERT IGNORE dla kazdego czlonka grupy |
| Sesja przez cookie (HttpOnly) — nie dziala w niektorych przegladarkach | Zostawic obecny mechanizm, nie zmieniac |

## 6. Otwarte pytania

1. Czy `groups` (Kółka i Grupy) ma byc scalone z `chat_groups` (TEBtalk), czy pozostac osobno?
2. Czy potrzebny jest oddzielny serwis do powiadomien push, czy wystarczy Realtime?
3. Czy na mobile hamburger ma cofac o 1 poziom, czy wracac do glownych kategorii?
4. Czy rola `global_admin` ma byc automatycznie przypisana do adminow aplikacji (profiles.role = 'admin')?

## 7. Pliki do zmiany (ostatecznie)

**Do napisania (nowe):**
- `src/features/tebtalk/index.jsx`
- `src/features/tebtalk/layout/DesktopSidebar.jsx`
- `src/features/tebtalk/layout/MobileNav.jsx`
- `src/features/tebtalk/layout/ChatPanel.jsx`
- `src/features/tebtalk/chat/MessageList.jsx`
- `src/features/tebtalk/chat/MessageBubble.jsx`
- `src/features/tebtalk/chat/MessageInput.jsx`
- `src/features/tebtalk/chat/utils.js`
- `src/features/tebtalk/sidebar/ChatList.jsx`
- `src/features/tebtalk/sidebar/GroupList.jsx`
- `src/features/tebtalk/sidebar/FriendList.jsx`
- `src/features/tebtalk/sidebar/SearchBar.jsx`
- `src/features/tebtalk/modals/GroupSettings.jsx`
- `src/features/tebtalk/modals/CreateGroup.jsx`
- `src/features/tebtalk/modals/MemberList.jsx`
- `src/features/tebtalk/modals/RoleManager.jsx`
- `src/features/tebtalk/hooks/useChatSession.js`
- `src/features/tebtalk/hooks/useMessages.js`
- `src/features/tebtalk/hooks/useFriends.js`
- `src/features/tebtalk/hooks/useGroups.js`
- `src/features/tebtalk/services/tebtalkQueries.js`
- `src/features/tebtalk/services/tebtalkCache.js`

**Do skasowania:**
- `src/features/tebtalk/TEBtalk.jsx` (1421 linii) — caly monolit

**Do modyfikacji:**
- `src/features/groups/Groups.jsx` — uzycie shared chat/utils.js, ewentualnie scalenie z TEBtalk
- `src/App.jsx` — zmiana lazy load path dla TEBtalk
- `supabase/migrations/` — nowe migracje SQL

**Do utworzenia (SQL):**
- Migracja 1: `chat_groups` + `chat_group_members` + `profiles.chat_role`
- Migracja 2: RLS polityki per-rola
