#!/bin/bash
# Backup bazy danych TEB-App
# Uzycie: SUPABASE_URL=https://xxxx.supabase.co SUPABASE_SERVICE_ROLE_KEY=eyJxxx bash scripts/backup-db.sh
# Wymaga: curl, jq (opcjonalnie)

set -euo pipefail

CONFIG_DIR="${HOME}/.config/teb-app"
CONFIG_FILE="${CONFIG_DIR}/backup.env"

# Wczytaj konfiguracje z pliku jesli istnieje
if [[ -f "$CONFIG_FILE" ]]; then
  source "$CONFIG_FILE"
fi

SUPABASE_URL="${SUPABASE_URL:-}"
SERVICE_ROLE_KEY="${SUPABASE_SERVICE_ROLE_KEY:-}"

if [[ -z "$SUPABASE_URL" || -z "$SERVICE_ROLE_KEY" ]]; then
  echo "Blad: Ustaw SUPABASE_URL i SUPABASE_SERVICE_ROLE_KEY"
  echo ""
  echo "Sposoby:"
  echo "  1. Zmienne srodowiskowe:"
  echo "     SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... bash scripts/backup-db.sh"
  echo "  2. Plik konfiguracyjny:"
  echo "     mkdir -p ${CONFIG_DIR}"
  echo "     cat > ${CONFIG_FILE} <<EOF"
  echo "     SUPABASE_URL=https://xxxx.supabase.co"
  echo "     SUPABASE_SERVICE_ROLE_KEY=eyJxxx"
  echo "     EOF"
  exit 1
fi

BACKUP_DIR="${HOME}/Desktop/teb-app-backups"
mkdir -p "$BACKUP_DIR"

DATE=$(date +%Y-%m-%d)
BACKUP_FILE="${BACKUP_DIR}/backup-${DATE}.json"
TEMP_FILE=$(mktemp)

trap 'rm -f "$TEMP_FILE"' EXIT

echo "=== Backup TEB-App: ${DATE} ==="
echo "Backup do: ${BACKUP_FILE}"
echo ""

API="${SUPABASE_URL%/}"

# Collect all data into a single JSON object
echo "{}" > "$TEMP_FILE"

# Helper: fetch a table and add it to the backup
fetch_table() {
  local table="$1"
  local key="$2"
  echo "[1/2] Pobieranie tabeli: ${table}..."

  local response
  response=$(curl -s -f -X GET "${API}/rest/v1/${table}?select=*" \
    -H "apikey: ${SERVICE_ROLE_KEY}" \
    -H "Authorization: Bearer ${SERVICE_ROLE_KEY}" \
    -H "Accept: application/json" \
    --max-time 30 2>&1) || {
    echo "  UWAGA: Nie udalo sie pobrac ${table}: ${response}"
    return
  }

  local tmp
  tmp=$(mktemp)
  echo "$response" > "$tmp"

  # Merge into main JSON
  python3 -c "
import json
with open('$TEMP_FILE') as f:
    data = json.load(f)
with open('$tmp') as f:
    try:
        data['${key}'] = json.load(f)
    except json.JSONDecodeError:
        data['${key}'] = []
with open('$TEMP_FILE', 'w') as f:
    json.dump(data, f, indent=2, default=str)
" 2>/dev/null || echo "  UWAGA: Blad przetwarzania ${table}"

  rm -f "$tmp"
  echo "  OK: ${table} pobrana"
}

# Core tables
fetch_table "profiles" "profiles"
fetch_table "feed_posts" "feed_posts"
fetch_table "feed_comments" "feed_comments"
fetch_table "feed_votes" "feed_votes"
fetch_table "rewear_posts" "rewear_posts"
fetch_table "rewear_interests" "rewear_interests"
fetch_table "rewear_conversations" "rewear_conversations"
fetch_table "rewear_messages" "rewear_messages"
fetch_table "direct_messages" "direct_messages"
fetch_table "friends" "friends"
fetch_table "groups" "groups"
fetch_table "group_members" "group_members"
fetch_table "group_messages" "group_messages"
fetch_table "chat_groups" "chat_groups"
fetch_table "chat_group_members" "chat_group_members"
fetch_table "chat_group_messages" "chat_group_messages"
fetch_table "reports" "reports"
fetch_table "user_badges" "user_badges"
fetch_table "push_subscriptions" "push_subscriptions"

echo ""
echo "[2/2] Dodawanie metadanych i zapis..."
python3 -c "
import json, datetime
with open('$TEMP_FILE') as f:
    data = json.load(f)
data['_metadata'] = {
    'backup_date': '$DATE',
    'created_at': datetime.datetime.utcnow().isoformat() + 'Z',
    'source': '$SUPABASE_URL',
    'tables': list(data.keys())
}
with open('$TEMP_FILE', 'w') as f:
    json.dump(data, f, indent=2, default=str)
"

cp "$TEMP_FILE" "$BACKUP_FILE"

# Statystyki
python3 -c "
import json
with open('$BACKUP_FILE') as f:
    data = json.load(f)
meta = data.pop('_metadata', {})
print(f'  Tabele: {len(data)}')
for table, rows in sorted(data.items()):
    print(f'    {table}: {len(rows)} wierszy')
data['_metadata'] = meta
"

SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
echo ""
echo "=== Backup zakonczony ==="
echo "Plik: ${BACKUP_FILE}"
echo "Rozmiar: ${SIZE}"
