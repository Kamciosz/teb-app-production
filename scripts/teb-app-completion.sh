#!/usr/bin/env bash
# TEB-App Manager — auto-generated shell completion
# Generated: 2026-05-29 16:20
# Commands: 77

_teb_app_complete() {
    local cur="${COMP_WORDS[COMP_CWORD]}"
    local prev="${COMP_WORDS[COMP_CWORD-1]}"
    local commands="activity analyze anomaly app-version archive audit audit-trail backup ban benchmark bulk-resend changelog check clean cleanup-logs compare-models config create dashboard db-size deploy deps diff dns-all email-preview email-test engagement env export-csv feedback gdpr-export graph headers health health-history inactive lint log-tail logs monitor notify notify-all password-reset permissions popular promote quick raw recent-errors report report-daily resend restore rotate-backups routes schema schema-viz search self-test self-update session-stats ssl stats stats-detail stress supa-ping tables timeline token-check top user user-delete users verify-link weather webhook-notify whois"
    local filters="unconfirmed confirmed admin student tg registered"

    case "${prev}" in
        teb-app|teb-app-manager|python3)
            COMPREPLY=($(compgen -W "${commands} --json -j" -- "${cur}"))
            ;;
        --filter|-f)
            COMPREPLY=($(compgen -W "${filters}" -- "${cur}"))
            ;;
        *)
            COMPREPLY=($(compgen -W "${commands} --json -j" -- "${cur}"))
            ;;
    esac
}

# Zsh completion
_teb_app_zsh() {
    local -a commands
    commands=(
        'activity:'
        'analyze:AI analiza danych aplikacji - uzywa LLM do wnioskow.'
        'anomaly:Wykryj anomalie.'
        'app-version:'
        'archive:Archiwizuj stare dane (>90 dni).'
        'audit:'
        'audit-trail:Analiza audytu.'
        'backup:'
        'ban:'
        'benchmark:Benchmark API - mierzy wydajnosc Supabase + Vercel.'
        'bulk-resend:'
        'changelog:Git changelog z plikami.'
        'check:'
        'clean:'
        'cleanup-logs:Usuwa stare logi bledow (>30 dni).'
        'compare-models:Szybkie porownanie modeli.'
        'config:Pokazuje konfiguracje z kodu.'
        'create:'
        'dashboard:'
        'db-size:Oszacuj rozmiar bazy.'
        'deploy:'
        'deps:'
        'diff:'
        'dns-all:Pelny skan DNS.'
        'email-preview:Pokazuje podglad szablonu email potwierdzajacego.'
        'email-test:'
        'engagement:Metryki zaangazowania uzytkownikow.'
        'env:'
        'export-csv:'
        'feedback:Pokazuje opinie/zgloszenia uzytkownikow.'
        'gdpr-export:Eksport danych uzytkownika (RODO/GDPR).'
        'graph:ASCII chart rejestracji.'
        'headers:Sprawdz naglowki HTTP.'
        'health:'
        'health-history:Zapisuje health do pliku i pokazuje historie.'
        'inactive:'
        'lint:'
        'log-tail:Podglada logi na zywo (polling).'
        'logs:'
        'monitor:'
        'notify:'
        'notify-all:Wyslij email do wszystkich potwierdzonych uzytkownikow.'
        'password-reset:'
        'permissions:Macierz uprawnien uzytkownikow.'
        'popular:Najpopularniejsze tresci.'
        'promote:'
        'quick:Szybki podglad - wszystkie kluczowe dane rownolegle (parallel API).'
        'raw:Wszystkie dane jako JSON (uzyj z --json).'
        'recent-errors:Bledy pogrupowane po zrodle.'
        'report:Pelny raport HTML.'
        'report-daily:Konfiguruje codzienny raport przez cron (wymaga hermes cron).'
        'resend:'
        'restore:Przywraca backup do bazy. Wymaga --filter z nazwa pliku.'
        'rotate-backups:Usuwa stare backupy (>30 dni).'
        'routes:'
        'schema:'
        'schema-viz:Wizualizacja schematu bazy - diagram relacji (ASCII + Mermaid).'
        'search:'
        'self-test:Testuje poprawnosc dzialania narzedzia.'
        'self-update:Sprawdz aktualizacje narzedzia.'
        'session-stats:Statystyki sesji/logowan.'
        'ssl:Sprawdz certyfikat SSL.'
        'stats:'
        'stats-detail:'
        'stress:Prosty test obciazenia.'
        'supa-ping:Ping Supabase z pomiarem czasu.'
        'tables:Szczegolowe info o tabelach.'
        'timeline:Os czasu - ostatnie zdarzenia.'
        'token-check:Sprawdz klucze API.'
        'top:TOP排行榜.'
        'user:'
        'user-delete:Calkowicie usuwa uzytkownika (GDPR right to be forgotten).'
        'users:'
        'verify-link:'
        'weather:Raport pogodowy systemu (wszystko OK czy nie).'
        'webhook-notify:Konfiguruje powiadomienia na Slack/Discord (wysyla test).'
        'whois:'
    )
    _describe "komenda" commands
}

# Install
if [[ -n "${ZSH_VERSION:-}" ]]; then
    compdef _teb_app_zsh teb-app-manager.py
elif [[ -n "${BASH_VERSION:-}" ]]; then
    complete -F _teb_app_complete teb-app-manager.py
    complete -F _teb_app_complete python3
fi

echo "TEB-App completion loaded (77 commands)"
