#!/usr/bin/env bash
# TEB-App Manager — Installer
# Uzycie: bash scripts/setup.sh

set -euo pipefail
REPO=~/Desktop/teb-app-production
SCRIPTS=$REPO/scripts

echo "=== TEB-App Manager — Instalacja ==="

# 1. Make executable
chmod +x $SCRIPTS/teb-app-manager.py

# 2. Add alias
ALIAS="alias teb-app='python3 $SCRIPTS/teb-app-manager.py'"
if ! grep -q "alias teb-app=" ~/.zshrc 2>/dev/null; then
    echo "" >> ~/.zshrc
    echo "# TEB-App Manager" >> ~/.zshrc
    echo "$ALIAS" >> ~/.zshrc
    echo "  [+] alias dodany do ~/.zshrc"
else
    echo "  [=] alias juz istnieje"
fi

# 3. Add completion
COM="source $SCRIPTS/teb-app-completion.sh"
if ! grep -q "teb-app-completion" ~/.zshrc 2>/dev/null; then
    echo "$COM" >> ~/.zshrc
    echo "  [+] completion dodany do ~/.zshrc"
else
    echo "  [=] completion juz istnieje"
fi

# 4. Create backup directory
mkdir -p ~/Desktop/teb-app-backups
echo "  [+] katalog backupow: ~/Desktop/teb-app-backups"

# 5. Test
echo ""
echo "=== Test ==="
python3 $SCRIPTS/teb-app-manager.py health 2>&1 | head -5 || echo "  [!] Blad uruchomienia"

echo ""
echo "=== Gotowe! ==="
echo "Uzyj: teb-app health  (lub python3 scripts/teb-app-manager.py health)"
echo "Lub: source ~/.zshrc  (albo otworz nowy terminal)"
