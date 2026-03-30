#!/bin/bash
# Usuwa wszystkie deploye z GitHub sprzed daty release-0.1 (2026-03-28T19:05:28+01:00)
# Użycie: GITHUB_TOKEN=ghp_xxx bash scripts/delete-old-deployments.sh

OWNER="Kamciosz"
REPO="teb-app-production"
CUTOFF="2026-03-28T18:05:50Z"  # UTC — deployment 49beb9ef (chore: normalize Beta -> release-0.1)
TOKEN="${GITHUB_TOKEN}"

if [[ -z "$TOKEN" ]]; then
  echo "Błąd: ustaw GITHUB_TOKEN=<twój_token>"
  exit 1
fi

AUTH_HEADER="Authorization: Bearer $TOKEN"
API="https://api.github.com/repos/$OWNER/$REPO"

echo "Pobieranie listy deploymentów..."

page=1
deleted=0
skipped=0

while true; do
  response=$(curl -s -H "$AUTH_HEADER" -H "Accept: application/vnd.github+json" \
    "$API/deployments?per_page=100&page=$page")

  count=$(echo "$response" | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d))" 2>/dev/null)

  if [[ -z "$count" || "$count" == "0" ]]; then
    break
  fi

  ids_and_dates=$(echo "$response" | python3 -c "
import sys, json
deployments = json.load(sys.stdin)
for d in deployments:
    print(d['id'], d['created_at'])
")

  while IFS=' ' read -r dep_id created_at; do
    [[ -z "$dep_id" ]] && continue

    # Porównaj datę (leksykograficznie działa dla ISO 8601 UTC)
    if [[ "$created_at" < "$CUTOFF" ]]; then
      # 1. Oznacz jako inactive (wymagane przed usunięciem)
      curl -s -X POST -H "$AUTH_HEADER" -H "Accept: application/vnd.github+json" \
        -H "Content-Type: application/json" \
        -d '{"state":"inactive","description":"Cleanup old deployment"}' \
        "$API/deployments/$dep_id/statuses" > /dev/null

      # 2. Usuń deployment
      status=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE \
        -H "$AUTH_HEADER" -H "Accept: application/vnd.github+json" \
        "$API/deployments/$dep_id")

      if [[ "$status" == "204" ]]; then
        echo "Usunięto: $dep_id ($created_at)"
        ((deleted++))
      else
        echo "Błąd ($status) przy: $dep_id ($created_at)"
      fi
    else
      ((skipped++))
    fi
  done <<< "$ids_and_dates"

  ((page++))
done

echo ""
echo "Gotowe. Usunięto: $deleted | Zostawiono: $skipped"
