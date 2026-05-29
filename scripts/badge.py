#!/usr/bin/env python3
"""TEB-App Status Badge Generator — generuje SVG badge dla README.
Uzycie: python3 scripts/badge.py > .github/badge.svg
Lub: umiesc w GitHub Actions aby aktualizowac automatycznie."""
import json, sys, os, urllib.request, ssl

try: import certifi; ctx = ssl.create_default_context(cafile=certifi.where())
except: ctx = ssl._create_unverified_context()

KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or ""
BASE = "https://twhaxrvcyiutvantwccx.supabase.co"
VERCEL = "https://teb-app-production.vercel.app"

def fetch(url):
    req = urllib.request.Request(url)
    try: resp = urllib.request.urlopen(req, context=ctx, timeout=10); return resp.read().decode()
    except: return None

def health():
    api_resp = fetch(f"{VERCEL}/api/health")
    smtp = up = "down"
    if api_resp:
        try:
            d = json.loads(api_resp)
            if d.get("checks",{}).get("smtp",{}).get("status")=="ok": smtp = "up"
            if d.get("checks",{}).get("supabase",{}).get("status")=="ok": up = "up"
        except: pass
    
    # User count
    users_resp = fetch(f"{BASE}/auth/v1/admin/users")
    users = 0
    if users_resp:
        try: users = len(json.loads(users_resp).get("users",[]))
        except: pass
    
    colors = {"up": "success", "down": "critical"}
    label_up = {"up": "online", "down": "offline"}
    
    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" width="400" height="60">
  <style>text{{font:12px monospace;fill:#fff}}</style>
  <rect width="400" height="60" rx="6" fill="#1e1e1e"/>
  
  <rect x="0" y="0" width="80" height="60" rx="6" fill="#c8102e"/>
  <rect x="80" y="0" width="320" height="60"/>
  <clipPath id="r"><rect x="80" y="0" width="320" height="60" rx="6"/></clipPath>
  
  <text x="10" y="24" font-weight="bold" font-size="13">TEB</text>
  <text x="10" y="44" font-weight="bold" font-size="11">App</text>
  
  <text x="90" y="16" font-size="10" fill="#aaa">System status</text>
  <text x="90" y="32" fill="#{"22c55e" if smtp=="up" else "ef4444"}">{label_up[smtp].upper()}</text>
  
  <text x="190" y="16" font-size="10" fill="#aaa">Supabase</text>
  <text x="190" y="32" fill="#{"22c55e" if up=="up" else "ef4444"}">{label_up[up].upper()}</text>
  
  <text x="290" y="16" font-size="10" fill="#aaa">Users</text>
  <text x="290" y="32" fill="#3b82f6">{users}</text>
  
  <text x="90" y="48" font-size="9" fill="#666">Last updated: $(date -u +%H:%M)</text>
</svg>'''
    return svg

if __name__ == "__main__":
    svg = health()
    print(svg)
