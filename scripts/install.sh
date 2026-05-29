#!/usr/bin/env bash
# TEB-App Manager — One-liner install
# Uzycie: curl -sf https://raw.githubusercontent.com/Kamciosz/teb-app-production/main/scripts/install.sh | bash
set -euo pipefail

REPO="$HOME/Desktop/teb-app-production"
SCRIPTS="$REPO/scripts"
INSTALL_LOG="$HOME/teb-app-install.log"

echo "=== TEB-App Manager Install ===" | tee "$INSTALL_LOG"
echo "" | tee -a "$INSTALL_LOG"

# 1. Check prerequisites
echo "[1/5] Sprawdzanie wymagan..." | tee -a "$INSTALL_LOG"

if ! command -v python3 &>/dev/null; then
    echo "  BRAK: python3. Zainstaluj: brew install python" | tee -a "$INSTALL_LOG"
    exit 1
fi

if ! command -v git &>/dev/null; then
    echo "  BRAK: git. Zainstaluj: brew install git" | tee -a "$INSTALL_LOG"
    exit 1
fi

echo "  OK: python3=$(python3 --version 2>&1 | cut -d' ' -f2)" | tee -a "$INSTALL_LOG"
echo "  OK: git=$(git --version 2>&1 | cut -d' ' -f3)" | tee -a "$INSTALL_LOG"

# 2. Clone/update repo
echo "[2/5] Pobieranie repozytorium..." | tee -a "$INSTALL_LOG"
if [ -d "$REPO/.git" ]; then
    git -C "$REPO" pull --ff-only 2>&1 | tee -a "$INSTALL_LOG"
    echo "  OK: zaktualizowano" | tee -a "$INSTALL_LOG"
else
    mkdir -p "$(dirname "$REPO")"
    git clone https://github.com/Kamciosz/teb-app-production.git "$REPO" 2>&1 | tee -a "$INSTALL_LOG"
    echo "  OK: sklonowano" | tee -a "$INSTALL_LOG"
fi

# 3. Setup alias and completion
echo "[3/5] Konfiguracja shell..." | tee -a "$INSTALL_LOG"
bash "$SCRIPTS/setup.sh" 2>&1 | tee -a "$INSTALL_LOG"

# 4. Verify
echo "[4/5] Weryfikacja..." | tee -a "$INSTALL_LOG"
python3 "$SCRIPTS/teb-app-manager.py" --version 2>&1 | tee -a "$INSTALL_LOG"
python3 "$SCRIPTS/teb-app-manager.py" health 2>&1 | tee -a "$INSTALL_LOG"

# 5. Summary
echo "[5/5] Gotowe!" | tee -a "$INSTALL_LOG"
echo "" | tee -a "$INSTALL_LOG"
echo "Instalacja zakonczona!" | tee -a "$INSTALL_LOG"
echo "" | tee -a "$INSTALL_LOG"
echo "Uzyj: source ~/.zshrc" | tee -a "$INSTALL_LOG"
echo "  teb-app health" | tee -a "$INSTALL_LOG"
echo "  teb-app stats" | tee -a "$INSTALL_LOG"
echo "  teb-app dashboard" | tee -a "$INSTALL_LOG"
echo "  teb-app --help" | tee -a "$INSTALL_LOG"
echo "" | tee -a "$INSTALL_LOG"
echo "Log: $INSTALL_LOG" | tee -a "$INSTALL_LOG"
