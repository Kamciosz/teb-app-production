#!/usr/bin/env python3
"""TEB-App Manager CLI — zarzadzanie aplikacja szkolna."""
import json, sys, os, subprocess, urllib.request, ssl
from datetime import datetime

KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.popen(
    "grep SUPABASE_SERVICE_ROLE_KEY ~/Desktop/teb-app-production/.env.local | cut -d= -f2-"
).read().strip() or ""
BASE = "https://twhaxrvcyiutvantwccx.supabase.co"
VERCEL = "https://teb-app-production.vercel.app"
REPO = os.path.expanduser("~/Desktop/teb-app-production")

# Fix SSL on macOS
try: import certifi; ssl_ctx = ssl.create_default_context(cafile=certifi.where())
except: ssl_ctx = ssl._create_unverified_context()

def _fetch(method, url, data=None, headers=None):
    h = {"Content-Type": "application/json", **(headers or {})}
    body = json.dumps(data).encode() if data else None
    req = urllib.request.Request(url, data=body, headers=h, method=method)
    try:
        resp = urllib.request.urlopen(req, context=ssl_ctx)
        return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        return {"_error": e.code, "_body": e.read().decode()[:300]}
    except Exception as e:
        return {"_error": str(e)[:200]}

def api(method, path, data=None):
    h = {"apikey": KEY, "Authorization": f"Bearer {KEY}"}
    url = f"{BASE}{path}"
    return _fetch(method, url, data, h)

def cmd_users(args):
    users = api("GET", "/auth/v1/admin/users").get("users", [])
    filt = args.filter
    for u in users:
        c = u.get("email_confirmed_at")
        confirmed = "TAK" if c else "NIE"
        created = u["created_at"][:10]
        r = u.get("app_metadata", {}).get("roles", [])
        if filt == "unconfirmed" and confirmed == "TAK": continue
        if filt == "confirmed" and confirmed == "NIE": continue
        if filt == "admin" and "admin" not in r: continue
        print(f"  {u['email']:35s} potw={confirmed}  data={created}  role={r}")

def cmd_stats(args):
    users = api("GET", "/auth/v1/admin/users").get("users", [])
    t = len(users)
    c = sum(1 for u in users if u.get("email_confirmed_at"))
    u = t - c
    a = sum(1 for u in users if "admin" in u.get("app_metadata",{}).get("roles",[]))
    print(f"  Total: {t}  Potwierdzone: {c}  Niepotwierdzone: {u}  Admini: {a}")

def cmd_health(args):
    r = _fetch("GET", f"{VERCEL}/api/health")
    if "_error" in r: print(f"  Blad: {r['_error']}"); return
    print(f"  Status: {r.get('status','?')}")
    for name, chk in r.get("checks",{}).items():
        s = chk.get("status","?")
        print(f"  {name:12s} [{'OK' if s=='ok' else 'ERR'}] {chk.get('detail','')}")

def cmd_resend(args):
    if not args.email:
        print("  Uzyj: teb-app resend --email user@teb.edu.pl"); return
    r = _fetch("POST", f"{VERCEL}/api/auth/resend-confirmation",
               {"email": args.email}, {"Origin": "https://www.teb-app.pl"})
    if "_error" in r: print(f"  Blad: {r['_body']}"); return
    print(f"  OK: {r}")

def cmd_backup(args):
    tables = ["profiles","feed_posts","feed_comments","feed_votes","rewear_posts",
              "reports","moderation_audit_log","error_logs","groups"]
    out = os.path.expanduser(f"~/Desktop/teb-app-backups/backup-{datetime.now():%Y-%m-%d_%H%M%S}.json")
    os.makedirs(os.path.dirname(out), exist_ok=True)
    all_data = {"date": str(datetime.now()), "tables": {}}
    for t in tables:
        sys.stdout.write(f"  {t:25s}... "); sys.stdout.flush()
        r = api("GET", f"/rest/v1/{t}?select=*&limit=10000")
        rows = len(r) if isinstance(r, list) else 0
        all_data["tables"][t] = {"rows": rows}
        print(f"{rows} rows")
    with open(out, "w") as f: json.dump(all_data, f, indent=2, default=str)
    print(f"  OK: {out}")

def cmd_create(args):
    e = args.email or f"test-{datetime.now():%H%M%S}@teb.edu.pl"
    p = args.password or "Test1234!"
    r = api("POST", "/auth/v1/admin/users", {"email": e, "password": p,
        "email_confirm": True, "user_metadata": {"full_name": args.name or "Test"}})
    if "_error" in r: print(f"  Blad: {r['_body']}"); return
    uid = r["id"]
    print(f"  Konto: {e}  haslo: {p}  id: {uid[:8]}...")
    api("POST", "/rest/v1/profiles", {"id": uid, "email": e,
        "full_name": args.name or "Test", "roles": ["student"], "role": "student"})

def cmd_deploy(args):
    r = subprocess.run(["git","log","--oneline","-3"], capture_output=True, text=True, cwd=REPO)
    print("  Commity:"); [print(f"    {l}") for l in r.stdout.strip().split("\n") if l]
    r2 = subprocess.run(["git","log","-1","--format=%ai"], capture_output=True, text=True, cwd=REPO)
    print(f"  Ostatni: {r2.stdout.strip()}")
    print(f"  URL: {VERCEL}")

if __name__ == "__main__":
    import argparse
    p = argparse.ArgumentParser(description="TEB-App Manager",
        epilog="Komendy: users [--filter X] | stats | health | resend --email E | backup | create [--email E] [--password P] [--name N] | deploy")
    p.add_argument("command", nargs="?", help="users|stats|health|resend|backup|create|deploy")
    p.add_argument("--email"); p.add_argument("--password"); p.add_argument("--name"); p.add_argument("--filter")
    args = p.parse_args()
    if not args.command: p.print_help(); sys.exit(1)
    {"users": cmd_users, "stats": cmd_stats, "health": cmd_health,
     "resend": cmd_resend, "backup": cmd_backup, "create": cmd_create,
     "deploy": cmd_deploy}.get(args.command, lambda _: p.print_help())(args)
