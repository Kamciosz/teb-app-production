#!/usr/bin/env bash
# TEB-App Manager — shell completion (bash + zsh)
# Instalacja: source scripts/teb-app-completion.sh
# Lub dodaj do ~/.zshrc: source ~/Desktop/teb-app-production/scripts/teb-app-completion.sh

_teb_app_complete() {
    local cur="${COMP_WORDS[COMP_CWORD]}"
    local prev="${COMP_WORDS[COMP_CWORD-1]}"
    local commands="health users user whois stats stats-detail logs audit activity resend bulk-resend email-test notify backup export-csv diff create promote ban password-reset clean inactive schema verify-link routes deps lint env app-version deploy monitor check dashboard graph top anomaly report health-history cleanup-logs session-stats ssl changelog notify-all stress tables config audit-trail supa-ping headers db-size recent-errors dns-all token-check compare-models archive engagement timeline popular permissions search weather self-update feedback raw"
    local filters="unconfirmed confirmed admin student tg registered"
    local json_flags="--json -j"

    case "${prev}" in
        teb-app|teb-app-manager|python3)
            COMPREPLY=($(compgen -W "${commands} ${json_flags}" -- "${cur}"))
            ;;
        --filter|-f)
            COMPREPLY=($(compgen -W "${filters}" -- "${cur}"))
            ;;
        --email|-e)
            # Suggest known emails from the database (if jq is available)
            local emails=""
            if command -v jq &>/dev/null && [ -f ~/Desktop/teb-app-production/scripts/teb-app-manager.py ]; then
                emails=$(python3 -c "
import sys; sys.path.insert(0,'~/Desktop/teb-app-production/scripts')
exec(open('~/Desktop/teb-app-production/scripts/teb-app-manager.py').read().split('if __name__')[0])
for u in _get_users()[:5]: print(u['email'])
" 2>/dev/null)
            fi
            COMPREPLY=($(compgen -W "${emails}" -- "${cur}"))
            ;;
        --name|-n)
            COMPREPLY=()
            ;;
        --password|--pass|-p)
            COMPREPLY=()
            ;;
        *)
            COMPREPLY=($(compgen -W "${commands} ${json_flags}" -- "${cur}"))
            ;;
    esac
}

# Zsh completion
_teb_app_zsh() {
    local -a commands
    commands=(
        'health:Status systemu'
        'users:Lista uzytkownikow'
        'user:Szczegoly uzytkownika'
        'whois:Szukaj po email'
        'stats:Statystyki'
        'stats-detail:Rozszerzone statystyki'
        'logs:Logi bledow'
        'audit:Moderacja'
        'activity:Aktywnosc'
        'resend:Wyslij potwierdzenie'
        'bulk-resend:Resend do wszystkich'
        'email-test:Test SMTP'
        'notify:Test powiadomienia'
        'backup:Backup JSON'
        'export-csv:Export CSV'
        'diff:Porownaj backupy'
        'create:Utworz konto'
        'promote:Nadaj admina'
        'ban:Ban/Unban'
        'password-reset:Reset hasla'
        'clean:Usun testowe'
        'inactive:Nieaktywni'
        'schema:Tabele'
        'verify-link:Link potw.'
        'routes:API sciezki'
        'deps:Zaleznosci'
        'lint:ESLint'
        'env:Zmienne env'
        'app-version:Wersja'
        'deploy:Ostatni commit'
        'monitor:Monitoruj'
        'check:Diagnostyka'
        'dashboard:Web UI'
        'graph:ASCII chart'
        'top:TOP ranking'
        'anomaly:Wykryj anomalie'
        'report:Raport HTML'
        'health-history:Historia'
        'cleanup-logs:Usun stare'
        'session-stats:Logowania'
        'ssl:Certyfikat SSL'
        'changelog:Git log'
        'notify-all:Email do wszystkich'
        'stress:Test obciazenia'
        'tables:Szczegoly tabel'
        'config:Konfiguracja'
        'audit-trail:Analiza'
        'supa-ping:Ping Supabase'
        'headers:Naglowki HTTP'
        'db-size:Rozmiar bazy'
        'recent-errors:Bledy'
        'dns-all:Pelny DNS'
        'token-check:Klucze API'
        'compare-models:Porownaj modele'
        'archive:Archiwizuj'
        'engagement:Zaangazowanie'
        'timeline:Zdarzenia'
        'popular:Posty'
        'permissions:Uprawnienia'
        'search:Szukaj'
        'weather:Raport pogodowy'
        'self-update:Aktualizacje'
        'feedback:Zgloszenia'
        'raw:JSON dump'
    )
    _describe 'komenda' commands
}

# Install
if [[ -n "${ZSH_VERSION:-}" ]]; then
    compdef _teb_app_zsh teb-app-manager.py
elif [[ -n "${BASH_VERSION:-}" ]]; then
    complete -F _teb_app_complete teb-app-manager.py
    complete -F _teb_app_complete python3
fi

echo "TEB-App completion loaded"
