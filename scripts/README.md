# TEB-App Manager

Kompletne narzedzie CLI do zarzadzania aplikacja szkolna TEB-App.

```
teb-app health          # Status systemu
teb-app users           # Lista uzytkownikow
teb-app backup          # Backup bazy
teb-app dashboard       # Web UI (localhost:8080)
teb-app --json raw      # Pelny JSON dla skryptow
teb-app <TAB>           # Autouzupelnianie
```

## Szybki start

```bash
# Instalacja
bash scripts/setup.sh
source ~/.zshrc

# Gotowe!
teb-app health
teb-app stats
teb-app deploy
```

## Komendy (68)

### Zarzadzanie uzytkownikami
| Komenda | Opis |
|---------|------|
| `users [--filter X]` | Lista uzytkownikow (unconfirmed/confirmed/admin) |
| `user --email E` | Szczegoly uzytkownika |
| `whois --filter Q` | Szukaj po fragmencie emaila |
| `create [--name N]` | Utworz konto testowe |
| `promote --email E` | Nadaj admina (auth + profiles) |
| `ban --email E [--pass min]` | Ban/unban |
| `password-reset --email E` | Zmiana hasla |
| `clean` | Usun konta testowe |
| `inactive` | Nieaktywne konta |

### Email
| Komenda | Opis |
|---------|------|
| `resend --email E` | Wyslij potwierdzenie |
| `bulk-resend` | Do wszystkich niepotwierdzonych |
| `email-test [--email E]` | Test SMTP |
| `notify-all` | Do wszystkich potwierdzonych |

### Backup i dane
| Komenda | Opis |
|---------|------|
| `backup` | Backup 13 tabel (JSON) |
| `export-csv --filter T` | Export do CSV |
| `diff` | Porownaj 2 ostatnie backupy |
| `schema` / `tables` | Struktura bazy |
| `archive` | Archiwizuj stare (>90 dni) |

### Diagnostyka
| Komenda | Opis |
|---------|------|
| `health` | Status SMTP/Supabase/API |
| `check` | DNS + HTTPS + API + git |
| `ssl` | Certyfikat SSL (87 dni) |
| `headers` | Naglowki bezpieczenstwa |
| `dns-all` | Pelny DNS (A, MX, TXT) |
| `supa-ping` | Latencja Supabase |
| `token-check` | Klucze API |

### Statystyki
| Komenda | Opis |
|---------|------|
| `stats` / `stats-detail` | Podstawowe / rozszerzone |
| `graph` | ASCII chart rejestracji |
| `top [tg\|registered]` | Ranking |
| `anomaly` | Wykryj spike'y |
| `engagement` | Posty, komentarze, grupy |
| `session-stats` | Logowania |
| `permissions` | Macierz uprawnien |
| `weather` | Raport pogodowy |

### Audyt
| Komenda | Opis |
|---------|------|
| `logs [page]` | Logi bledow |
| `audit` / `audit-trail` | Dzialania moderatorow |
| `activity [N]` | Ostatnia aktywnosc |
| `recent-errors` | Bledy po zrodle |
| `feedback` | Zgloszenia |

### Projekt
| Komenda | Opis |
|---------|------|
| `routes` | Endpointy API |
| `deps` | Zaleznosci npm |
| `lint` | ESLint |
| `env` | Zmienne srodowiskowe |
| `app-version` | Wersja vs deploy |
| `deploy` / `changelog` | Git log |
| `config` | Konfiguracja |
| `self-update` | Aktualnosc narzedzia |

### Monitoring
| Komenda | Opis |
|---------|------|
| `monitor [sec]` | Terminal (Ctrl+C) |
| `dashboard [port]` | Web UI (localhost:8080) |
| `stress [N]` | Test obciazenia |
| `compare-models` | DeepSeek vs MiMo |
| `health-history` | Trend dostepnosci |
| `timeline` | Os zdarzen |
| `search --filter Q` | Szukaj w bazie |
| `popular` | Ostatnie posty |
| `cleanup-logs` | Usun stare logi |
| `raw` | Pelny JSON dump |

## Web Dashboard

```bash
teb-app dashboard
# Otworz: http://localhost:8080
```
Live stats: uzytkownicy, status, lista. Odswieza co 15s.

## JSON mode

```bash
teb-app --json stats | jq '.total'
teb-app -j raw | jq '.users | length'
teb-app -j health | jq '.checks.supabase'
```

## Instalacja

```bash
# Opcjonalnie: alias + completion + man
bash scripts/setup.sh
source ~/.zshrc

# Rzadkie uzycie: bez instalacji
python3 scripts/teb-app-manager.py health

# Man page
man scripts/teb-app-manager.1
```

## Wymagania

- Python 3.8+
- curl, dig (dla DNS/SSL check)
- opcjonalnie: jq (dla JSON pipe)

## Struktura

```
scripts/
├── teb-app-manager.py       # Glowny plik (68 komend)
├── teb-app-completion.sh    # Bash/Zsh completion
├── teb-app-manager.1        # Man page
└── setup.sh                 # Instalator

~/Desktop/teb-app-backups/   # Automatyczne backupy
```

Rozwijane w nieskonczonosc przez Hermes Agent.
