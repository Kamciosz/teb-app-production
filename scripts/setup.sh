#!/usr/bin/env bash
# TEB-App Manager — Instalator
# Uzycie: bash scripts/setup.sh [--full] [--daemon]

set -euo pipefail
REPO=~/Desktop/teb-app-production
SCRIPTS=$REPO/scripts
FULL=${1:-}

echo "=== TEB-App Manager — Instalacja ==="

# 1. Make executable
chmod +x $SCRIPTS/teb-app-manager.py $SCRIPTS/teb-app-daemon.py

# 2. Add alias
ALIAS="alias teb-app='python3 $SCRIPTS/teb-app-manager.py'"
if ! grep -q "alias teb-app=" ~/.zshrc 2>/dev/null; then
    echo "" >> ~/.zshrc
    echo "# TEB-App Manager" >> ~/.zshrc
    echo "$ALIAS" >> ~/.zshrc
    echo "  [+] alias teb-app dodany"
else
    echo "  [=] alias juz istnieje"
fi

# 3. Add completion
COM="source $SCRIPTS/teb-app-completion.sh"
if ! grep -q "teb-app-completion" ~/.zshrc 2>/dev/null; then
    echo "$COM" >> ~/.zshrc
    echo "  [+] completion dodany"
else
    echo "  [=] completion juz istnieje"
fi

# 4. Create backup directory
mkdir -p ~/Desktop/teb-app-backups
echo "  [+] katalog backupow: ~/Desktop/teb-app-backups"

# 5. pip install (package mode)
if command -v pip3 &>/dev/null; then
    pip3 install -e $SCRIPTS 2>/dev/null && echo "  [+] pip package: teb-app-manager" || echo "  [-] pip install skipped"
fi

# 6. launchd daemon (opcjonalne)
if [ "${FULL}" = "--daemon" ] || [ "${FULL}" = "--full" ]; then
    mkdir -p ~/Library/LaunchAgents
    cp $SCRIPTS/com.teb-app.daemon.plist ~/Library/LaunchAgents/
    launchctl load ~/Library/LaunchAgents/com.teb-app.daemon.plist 2>/dev/null && \
        echo "  [+] Daemon uruchomiony (co 5 min)" || echo "  [-] Daemon blad"
    echo "  Logi: ~/Desktop/teb-app-backups/daemon.log"
fi

echo ""
echo "=== Test ==="
python3 $SCRIPTS/teb-app-manager.py health 2>&1 | head -5 || echo "  [!] Blad"

echo ""
echo "=== Gotowe! ==="
echo "  teb-app health          # CLI"
echo "  teb-app dashboard       # Web UI"
echo "  teb-app --version       # Wersja"
echo "  teb-app quick           # Szybki podglad"
echo ""
echo "Po instalacji: source ~/.zshrc (lub nowy terminal)"
echo "Aby wlaczyc demona: bash scripts/setup.sh --daemon"
