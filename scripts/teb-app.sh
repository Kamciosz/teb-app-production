#!/usr/bin/env bash
# TEB-App Manager — shell-only version (no Python required)
# Uzycie: bash scripts/teb-app.sh health
set -euo pipefail

KEY="${SUPABASE_SERVICE_ROLE_KEY:-}"
BASE="https://twhaxrvcyiutvantwccx.supabase.co"
VERCEL="https://teb-app-production.vercel.app"
[ -z "$KEY" ] && KEY=$(grep SUPABASE_SERVICE_ROLE_KEY ~/Desktop/teb-app-production/.env.local 2>/dev/null | cut -d= -f2-)
[ -z "$KEY" ] && { echo "Brak klucza"; exit 1; }

health() {
  echo "=== Health Check ==="
  curl -sf "$VERCEL/api/health" | python3 -m json.tool 2>/dev/null || echo "Blad"
}

users() {
  echo "=== Users ==="
  curl -sf "$BASE/auth/v1/admin/users" \
    -H "apikey: $KEY" -H "Authorization: Bearer $KEY" | \
    python3 -c "import sys,json; [print(u['email'],'|',bool(u.get('email_confirmed_at','')),'|',u.get('app_metadata',{}).get('roles','')) for u in json.load(sys.stdin).get('users',[])]" 2>/dev/null
}

stats() {
  local total confirmed admin
  data=$(curl -sf "$BASE/auth/v1/admin/users" -H "apikey: $KEY" -H "Authorization: Bearer $KEY")
  total=$(echo "$data" | python3 -c "import sys,json; print(len(json.load(sys.stdin).get('users',[])))")
  confirmed=$(echo "$data" | python3 -c "import sys,json; print(sum(1 for u in json.load(sys.stdin).get('users',[]) if u.get('email_confirmed_at')))")
  admin=$(echo "$data" | python3 -c "import sys,json; print(sum(1 for u in json.load(sys.stdin).get('users',[]) if 'admin' in u.get('app_metadata',{}).get('roles',[])))")
  echo "=== Stats ==="
  echo "Total: $total | Confirmed: $confirmed | Unconfirmed: $((total-confirmed)) | Admin: $admin"
}

deploy() {
  echo "=== Deploy ==="
  git -C ~/Desktop/teb-app-production log --oneline -5
}

case "${1:-help}" in
  health) health ;;
  users) users ;;
  stats) stats ;;
  deploy) deploy ;;
  *)
    echo "TEB-App Manager (shell)"
    echo "Uzycie: bash scripts/teb-app.sh <komenda>"
    echo ""
    echo "Komendy:"
    echo "  health   Status systemu"
    echo "  users    Lista uzytkownikow"
    echo "  stats    Statystyki"
    echo "  deploy   Ostatni deploy"
    ;;
esac
