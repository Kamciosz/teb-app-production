#!/usr/bin/env python3
"""TEB-App Manager CLI — zarzadzanie aplikacja szkolna. Rozwijane w nieskonczonosc."""
import json, sys, os, subprocess, urllib.request, ssl, time, re
from datetime import datetime, timezone

KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.popen(
    "grep SUPABASE_SERVICE_ROLE_KEY ~/Desktop/teb-app-production/.env.local | cut -d= -f2-"
).read().strip() or ""
BASE = "https://twhaxrvcyiutvantwccx.supabase.co"
VERCEL = "https://teb-app-production.vercel.app"
REPO = os.path.expanduser("~/Desktop/teb-app-production")

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
    return _fetch(method, f"{BASE}{path}", data, {"apikey": KEY, "Authorization": f"Bearer {KEY}"})

# ─── KOMENDY ───────────────────────────────────────────────────

def cmd_health(args):
    r = _fetch("GET", f"{VERCEL}/api/health")
    if "_error" in r: print(f"  Blad: {r['_error']}"); return
    print(f"  Status: {r.get('status','?')}")
    for name, chk in r.get("checks",{}).items():
        s = chk.get("status","?")
        print(f"  {name:12s} [{'OK' if s=='ok' else 'ERR'}] {chk.get('detail','')}")

def cmd_users(args):
    users = api("GET", "/auth/v1/admin/users").get("users", [])
    filt = args.filter
    for u in users:
        c = u.get("email_confirmed_at")
        potw = "TAK" if c else "NIE"
        created = u["created_at"][:10]
        r = u.get("app_metadata", {}).get("roles", [])
        if filt == "unconfirmed" and potw == "TAK": continue
        if filt == "confirmed" and potw == "NIE": continue
        if filt == "admin" and "admin" not in r: continue
        if filt == "student" and ("admin" in r or "moderator" in str(r)): continue
        print(f"  {u['email']:35s} potw={potw}  data={created}  role={r or ['student']}")

def cmd_user(args):
    """Szczegoly uzytkownika."""
    q = args.email or args.filter or ""
    if not q: print("  Uzyj: teb-app user --email user@teb.edu.pl"); return
    
    users = api("GET", "/auth/v1/admin/users").get("users", [])
    u = None
    for x in users:
        if q in x["email"] or q in x.get("id",""):
            u = x; break
    if not u: print(f"  Nie znaleziono: {q}"); return
    
    print(f"  Email: {u['email']}")
    print(f"  ID: {u['id']}")
    print(f"  Created: {u['created_at'][:19]}")
    print(f"  Confirmed: {u.get('email_confirmed_at','NIE')[:19] if u.get('email_confirmed_at') else 'NIE'}")
    print(f"  Last sign in: {u.get('last_sign_in_at','?')[:19] if u.get('last_sign_in_at') else 'nigdy'}")
    print(f"  Roles: {u.get('app_metadata',{}).get('roles',['student'])}")
    
    # Profile from profiles table
    p = api("GET", f"/rest/v1/profiles?id=eq.{u['id']}")
    if isinstance(p, list) and p:
        print(f"  Full name: {p[0].get('full_name','?')}")
        print(f"  Banned: {'TAK' if p[0].get('is_banned') else 'NIE'}")
        if p[0].get('banned_until'): print(f"  Ban until: {p[0]['banned_until'][:19]}")
        print(f"  TG: {p[0].get('teb_gabki',0)}")
    
    # Error logs for this user
    logs = api("GET", f"/rest/v1/error_logs?email=eq.{u['email']}&limit=5&order=created_at.desc")
    if isinstance(logs, list) and logs:
        print(f"  Ostatnie bledy ({len(logs)}):")
        for l in logs[:3]: print(f"    [{l.get('level','?')}] {l.get('source','?')}: {l.get('message','')[:80]}")

def cmd_stats(args):
    users = api("GET", "/auth/v1/admin/users").get("users", [])
    t = len(users)
    c = sum(1 for u in users if u.get("email_confirmed_at"))
    u = t - c
    a = sum(1 for u in users if "admin" in u.get("app_metadata",{}).get("roles",[]))
    m = sum(1 for u in users if "moderator" in str(u.get("app_metadata",{}).get("roles",[])))
    print(f"  Total:          {t}")
    print(f"  Potwierdzone:   {c}")
    print(f"  Niepotwierdzone:{u}")
    print(f"  Admini:         {a}")
    print(f"  Moderatorzy:    {m}")

def cmd_logs(args):
    page = int(getattr(args, "filter", "1") or "1")
    limit = 20
    r = api("GET", f"/rest/v1/error_logs?limit={limit}&offset={(page-1)*limit}&order=created_at.desc")
    if not isinstance(r, list): print(f"  Blad: {r}"); return
    print(f"  Logi bledow (strona {page}):")
    for l in r:
        lvl = l.get("level","?")
        icon = {"error":"ERR","warn":"WRN","info":"INF"}.get(lvl,"?")
        src = l.get("source","?")[:12]
        msg = l.get("message","")[:90]
        dt = l.get("created_at","")[:19]
        print(f"  [{icon}] {dt} {src:12s} {msg}")
    if len(r) == limit: print(f"  --- wiecej: teb-app logs --filter {page+1} ---")

def cmd_audit(args):
    r = api("GET", "/rest/v1/moderation_audit_log?limit=20&order=created_at.desc&select=id,action_type,reason,created_at,actor:profiles!actor_user_id(full_name),target:profiles!target_user_id(full_name)")
    if not isinstance(r, list): print(f"  Blad: {r}"); return
    print("  Ostatnie dzialania moderatorow:")
    for a in r:
        actor = a.get("actor",{}).get("full_name","?") if isinstance(a.get("actor"),dict) else "?"
        target = a.get("target",{}).get("full_name","-") if isinstance(a.get("target"),dict) else "-"
        dt = a.get("created_at","")[:16]
        act = a.get("action_type","?")[:20]
        reason = (a.get("reason") or "")[:40]
        print(f"  {dt} {actor:15s} -> {act:20s} {target:15s} {reason}")

def cmd_resend(args):
    if not args.email: print("  Uzyj: teb-app resend --email user@teb.edu.pl"); return
    r = _fetch("POST", f"{VERCEL}/api/auth/resend-confirmation",
               {"email": args.email}, {"Origin": "https://www.teb-app.pl"})
    if "_error" in r: print(f"  Blad: {r['_body']}"); return
    print(f"  OK: {r}")

def cmd_backup(args):
    tables = ["profiles","feed_posts","feed_comments","feed_votes","rewear_posts",
              "reports","moderation_audit_log","error_logs","groups",
              "group_messages","punishment_appeals","chat_groups","chat_group_members"]
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
    name = args.name or e.split("@")[0]
    r = api("POST", "/auth/v1/admin/users", {"email": e, "password": p,
        "email_confirm": True, "user_metadata": {"full_name": name}})
    if "_error" in r: print(f"  Blad: {r['_body']}"); return
    uid = r["id"]
    print(f"  Konto: {e}  haslo: {p}  id: {uid[:8]}...")
    api("POST", "/rest/v1/profiles", {"id": uid, "email": e,
        "full_name": name, "roles": ["student"], "role": "student"})

def cmd_promote(args):
    """Nadaj role admin."""
    if not args.email: print("  Uzyj: teb-app promote --email user@teb.edu.pl"); return
    users = api("GET", "/auth/v1/admin/users").get("users", [])
    u = next((x for x in users if args.email in x["email"]), None)
    if not u: print(f"  Nie znaleziono: {args.email}"); return
    uid = u["id"]
    # Auth metadata
    roles = u.get("app_metadata",{}).get("roles",[]) + ["admin","student"]
    api("PUT", f"/auth/v1/admin/users/{uid}", {"app_metadata": {"roles": list(set(roles))}})
    # Profiles table
    profile = api("GET", f"/rest/v1/profiles?id=eq.{uid}")
    existing = profile[0].get("roles",[]) if isinstance(profile,list) and profile else []
    new_roles = list(set(existing + ["admin","student"]))
    api("PATCH", f"/rest/v1/profiles?id=eq.{uid}", {"roles": new_roles, "role": "admin"})
    print(f"  Admin: {u['email']}  roles={new_roles}")

def cmd_ban(args):
    """Zbanuj/odbanuj uzytkownika."""
    if not args.email: print("  Uzyj: teb-app ban --email user@teb.edu.pl [--password duration_min]"); return
    dur = int(args.password or "1440")  # domyslnie 24h
    users = api("GET", "/auth/v1/admin/users").get("users", [])
    u = next((x for x in users if args.email in x["email"]), None)
    if not u: print(f"  Nie znaleziono: {args.email}"); return
    uid = u["id"]
    
    profile = api("GET", f"/rest/v1/profiles?id=eq.{uid}")
    if not isinstance(profile,list) or not profile: print("  Brak profilu"); return
    p = profile[0]
    
    if p.get("is_banned"):
        api("PATCH", f"/rest/v1/profiles?id=eq.{uid}", {"is_banned": False, "banned_until": None})
        print(f"  Odbanowano: {u['email']}")
    else:
        until = datetime.now(timezone.utc).isoformat()
        api("PATCH", f"/rest/v1/profiles?id=eq.{uid}", {"is_banned": True, "banned_until": until})
        print(f"  Zbanowano: {u['email']} na {dur} min")

def cmd_clean(args):
    """Usun konta testowe (zawierajace 'test' w email)."""
    users = api("GET", "/auth/v1/admin/users").get("users", [])
    deleted = 0
    for u in users:
        if "test" in u["email"].split("@")[0].lower():
            api("DELETE", f"/auth/v1/admin/users/{u['id']}")
            print(f"  Usunieto: {u['email']}")
            deleted += 1
    if not deleted: print("  Brak kont testowych.")

def cmd_schema(args):
    """Podglad tabel w bazie."""
    r = api("GET", "/rest/v1/")
    if "_error" in r: print(f"  Blad: {r['_body']}"); return
    # Try to list tables via information_schema
    tables = api("GET", "/rest/v1/information_schema.tables?select=table_name,table_type&table_schema=eq.public")
    if isinstance(tables, list):
        print("  Tabele w public:")
        for t in tables:
            name = t.get("table_name","?")
            typ = t.get("table_type","?")
            # Get row count
            cnt = api("GET", f"/rest/v1/{name}?select=id&limit=1")
            has_rows = "ma dane" if (isinstance(cnt,list) and cnt) else "pusta"
            print(f"  {name:30s} {typ:8s} {has_rows}")

def cmd_deploy(args):
    r = subprocess.run(["git","log","--oneline","-5"], capture_output=True, text=True, cwd=REPO)
    print("  Ostatnie commity:")
    for l in r.stdout.strip().split("\n"):
        if l: print(f"    {l}")
    r2 = subprocess.run(["git","log","-1","--format=%ai %s"], capture_output=True, text=True, cwd=REPO)
    print(f"  Ostatni: {r2.stdout.strip()}")
    # Check remote vs local
    r3 = subprocess.run(["git","rev-parse","HEAD"], capture_output=True, text=True, cwd=REPO)
    r4 = subprocess.run(["git","rev-parse","@{u}"], capture_output=True, text=True, cwd=REPO)
    if r3.stdout.strip() != r4.stdout.strip():
        print(f"  UWAGA: local rozjezdza sie z remote!")
    print(f"  URL: {VERCEL}")

def cmd_whois(args):
    """Znajdz uzytkownika po fragmencie emaila."""
    q = args.filter or args.email or ""
    if not q: print("  Uzyj: teb-app whois --filter 'jan'"); return
    users = api("GET", "/auth/v1/admin/users").get("users", [])
    found = [u for u in users if q.lower() in u["email"].lower() or q.lower() in u.get("id","").lower()]
    if not found: print(f"  Brak wynikow dla: {q}"); return
    print(f"  Znaleziono {len(found)}:")
    for u in found:
        c = "TAK" if u.get("email_confirmed_at") else "NIE"
        r = u.get("app_metadata",{}).get("roles",["student"])
        print(f"  {u['email']:35s} potw={c} role={r}")

def cmd_monitor(args):
    """Monitoruj co N sekund."""
    interval = int(args.password or "10")
    print(f"  Monitorowanie co {interval}s. Ctrl+C aby zatrzymac.")
    try:
        while True:
            ts = datetime.now().strftime("%H:%M:%S")
            health = _fetch("GET", f"{VERCEL}/api/health")
            users = api("GET", "/auth/v1/admin/users").get("users", [])
            t = len(users); c = sum(1 for u in users if u.get("email_confirmed_at"))
            smtp = "OK" if health.get("checks",{}).get("smtp",{}).get("status")=="ok" else "ERR"
            sup = "OK" if health.get("checks",{}).get("supabase",{}).get("status")=="ok" else "ERR"
            print(f"  [{ts}] SMTP={smtp} Supabase={sup} Users={t} Confirmed={c}")
            time.sleep(interval)
    except KeyboardInterrupt:
        print("\n  Monitorowanie zatrzymane.")

def cmd_check(args):
    """Pelna diagnostyka."""
    print("  === DIAGNOSTYKA ===")
    
    # 1. Health
    r = _fetch("GET", f"{VERCEL}/api/health")
    if "_error" in r: print(f"  [ERR] Health: {r['_error']}")
    else: print(f"  [OK] Health: {r.get('status','?')}")

    # 2. DNS
    for d in ["teb-app.pl", "www.teb-app.pl"]:
        dig = subprocess.run(["dig", "+short", d], capture_output=True, text=True, timeout=5)
        if dig.stdout.strip(): print(f"  [OK] DNS {d}: {dig.stdout.strip()[:50]}")
        else: print(f"  [ERR] DNS {d}: brak")

    # 3. HTTPS
    for url in ["https://teb-app.pl", "https://www.teb-app.pl"]:
        try:
            req = urllib.request.Request(url, method="HEAD")
            resp = urllib.request.urlopen(req, context=ssl_ctx, timeout=5)
            print(f"  [OK] HTTPS {url}: {resp.status}")
        except Exception as e:
            print(f"  [ERR] HTTPS {url}: {str(e)[:60]}")
    
    # 4. Supabase API
    s = api("GET", "/auth/v1/settings")
    if "_error" in s: print(f"  [ERR] Supabase API: {s.get('_body','')[:60]}")
    else: print(f"  [OK] Supabase API: dziala")
    
    # 5. Git status
    r = subprocess.run(["git","status","--short"], capture_output=True, text=True, cwd=REPO, timeout=5)
    if r.stdout.strip(): print(f"  [WARN] Niecommited: {r.stdout.count(chr(10))} files")
    else: print(f"  [OK] Git: czysty")
    
    print(f"  === KONIEC ===")

# ─── DISPATCHER ────────────────────────────────────────────────

if __name__ == "__main__":
    import argparse
    cmds = {
        "health": cmd_health, "users": cmd_users, "user": cmd_user, "stats": cmd_stats,
        "logs": cmd_logs, "audit": cmd_audit, "resend": cmd_resend, "backup": cmd_backup,
        "create": cmd_create, "promote": cmd_promote, "ban": cmd_ban, "clean": cmd_clean,
        "schema": cmd_schema, "deploy": cmd_deploy, "whois": cmd_whois,
        "monitor": cmd_monitor, "check": cmd_check
    }
    p = argparse.ArgumentParser(description="TEB-App Manager",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=f"""Komendy ({len(cmds)}):
  health                          Status systemu (SMTP/Supabase/API)
  users   [--filter X]           Lista uzytkownikow (unconfirmed|confirmed|admin|student)
  user    --email E               Szczegoly uzytkownika
  whois   --filter Q              Szukaj po fragmencie email
  stats                           Statystyki
  logs    [--filter page]         Logi bledow
  audit                           Ostatnie dzialania moderatorow
  resend  --email E               Wyslij ponownie email potwierdzajacy
  backup                          Backup bazy do pliku
  create  [--email E] [--pass P]  Utworz konto testowe
                [--name N]
  promote --email E               Nadaj role admin
  ban     --email E [--pass min]  Ban/unban (dom. 1440 min)
  clean                           Usun konta testowe
  schema                          Podglad tabel w bazie
  deploy                          Ostatni deploy z gita
  monitor [--pass seconds]        Monitoruj co N sekund (dom. 10)
  check                           Pelna diagnostyka""")
    p.add_argument("command", nargs="?", help="|".join(cmds))
    p.add_argument("--email"); p.add_argument("--password"); p.add_argument("--name"); p.add_argument("--filter")
    args = p.parse_args()
    if not args.command or args.command not in cmds:
        p.print_help()
        if args.command and args.command not in cmds: print(f"\n  Nieznana: {args.command}")
        sys.exit(1)
    cmds[args.command](args)