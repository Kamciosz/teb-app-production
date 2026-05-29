#!/usr/bin/env python3
"""TEB-App Manager CLI — zarzadzanie aplikacja szkolna. Rozwijane w nieskonczonosc."""
import json, sys, os, subprocess, urllib.request, ssl, time, re, csv, io
from datetime import datetime, timezone, timedelta

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

def _get_users():
    return api("GET", "/auth/v1/admin/users").get("users", [])

def _find_user(q):
    users = _get_users()
    for u in users:
        if q in u["email"] or q in u.get("id",""): return u
    return None

# ─── KOMENDY ───────────────────────────────────────────────────

def cmd_health(args):
    r = _fetch("GET", f"{VERCEL}/api/health")
    if "_error" in r: print(f"  Blad: {r['_error']}"); return
    print(f"  Status: {r.get('status','?')}")
    for name, chk in r.get("checks",{}).items():
        s = chk.get("status","?")
        print(f"  {name:12s} [{'OK' if s=='ok' else 'ERR'}] {chk.get('detail','')}")

def cmd_users(args):
    users = _get_users()
    filt = args.filter
    for u in users:
        c = u.get("email_confirmed_at")
        potw = "TAK" if c else "NIE"
        created = u["created_at"][:10]
        r = u.get("app_metadata", {}).get("roles", [])
        if filt == "unconfirmed" and potw == "TAK": continue
        if filt == "confirmed" and potw == "NIE": continue
        if filt == "admin" and "admin" not in r: continue
        print(f"  {u['email']:35s} potw={potw}  data={created}  role={r or ['student']}")

def cmd_user(args):
    q = args.email or args.filter or ""
    if not q: print("  Uzyj: teb-app user --email user@teb.edu.pl"); return
    u = _find_user(q)
    if not u: print(f"  Nie znaleziono: {q}"); return
    print(f"  Email: {u['email']}")
    print(f"  ID: {u['id']}")
    print(f"  Created: {u['created_at'][:19]}")
    print(f"  Confirmed: {u.get('email_confirmed_at','NIE')[:19] if u.get('email_confirmed_at') else 'NIE'}")
    print(f"  Last sign in: {u.get('last_sign_in_at','?')[:19] if u.get('last_sign_in_at') else 'nigdy'}")
    print(f"  Roles: {u.get('app_metadata',{}).get('roles',['student'])}")
    p = api("GET", f"/rest/v1/profiles?id=eq.{u['id']}")
    if isinstance(p, list) and p:
        print(f"  Full name: {p[0].get('full_name','?')}")
        print(f"  Banned: {'TAK' if p[0].get('is_banned') else 'NIE'}")
        if p[0].get('banned_until'): print(f"  Ban until: {p[0]['banned_until'][:19]}")
        print(f"  TG: {p[0].get('teb_gabki',0)}")
    logs = api("GET", f"/rest/v1/error_logs?email=eq.{u['email']}&limit=5&order=created_at.desc")
    if isinstance(logs, list) and logs:
        print(f"  Ostatnie bledy ({len(logs)}):")
        for l in logs[:3]: print(f"    [{l.get('level','?')}] {l.get('source','?')}: {l.get('message','')[:80]}")

def cmd_stats(args):
    users = _get_users()
    profiles = api("GET", "/rest/v1/profiles?select=id,is_banned,teb_gabki")
    t = len(users)
    c = sum(1 for u in users if u.get("email_confirmed_at"))
    u = t - c
    a = sum(1 for u in users if "admin" in u.get("app_metadata",{}).get("roles",[]))
    banned = sum(1 for p in (profiles if isinstance(profiles,list) else []) if p.get("is_banned"))
    print(f"  Total:          {t}")
    print(f"  Potwierdzone:   {c}")
    print(f"  Niepotwierdzone:{u}")
    print(f"  Admini:         {a}")
    print(f"  Zbanowani:      {banned}")

def cmd_stats_detail(args):
    """Rozszerzone statystyki."""
    users = _get_users()
    profiles_raw = api("GET", "/rest/v1/profiles?select=id,is_banned,teb_gabki,created_at")
    profiles = profiles_raw if isinstance(profiles_raw, list) else []
    
    now = datetime.now(timezone.utc)
    week_ago = now - timedelta(days=7)
    
    total = len(users)
    confirmed = sum(1 for u in users if u.get("email_confirmed_at"))
    unconfirmed = total - confirmed
    
    # Registration trend
    this_week = sum(1 for u in users if datetime.fromisoformat(u["created_at"].replace("Z","+00:00")) > week_ago)
    this_month = sum(1 for u in users if datetime.fromisoformat(u["created_at"].replace("Z","+00:00")) > (now - timedelta(days=30)))
    
    # Profiles stats
    with_tg = sum(1 for p in profiles if (p.get("teb_gabki") or 0) > 0)
    total_tg = sum(p.get("teb_gabki") or 0 for p in profiles)
    banned = sum(1 for p in profiles if p.get("is_banned"))
    
    # Error logs
    errors = api("GET", "/rest/v1/error_logs?select=id&limit=1")
    total_errors = len(errors) if isinstance(errors, list) else 0
    
    print(f"  = ROZSZERZONE STATYSTYKI =")
    print(f"  Uzytkownicy:")
    print(f"    Total:           {total}")
    print(f"    Potwierdzone:    {confirmed} ({confirmed/total*100:.0f}%)" if total else "")
    print(f"    Niepotwierdzone: {unconfirmed} ({unconfirmed/total*100:.0f}%)" if total else "")
    print(f"  Trendy:")
    print(f"    Ten tydzien:     {this_week}")
    print(f"    Ten miesiac:     {this_month}")
    print(f"  Ekonomia:")
    print(f"    TG w obiegu:     {total_tg}")
    print(f"    Uzytk. z TG:     {with_tg}")
    print(f"  Moderacja:")
    print(f"    Zbanowani:       {banned}")
    print(f"    Bledy w logach:  {total_errors}")

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

def cmd_bulk_resend(args):
    """Resend do wszystkich niepotwierdzonych."""
    users = _get_users()
    unconfirmed = [u for u in users if not u.get("email_confirmed_at")]
    if not unconfirmed: print("  Wszyscy potwierdzeni."); return
    print(f"  Wysylam do {len(unconfirmed)} niepotwierdzonych:")
    for u in unconfirmed:
        sys.stdout.write(f"  {u['email']:35s}... "); sys.stdout.flush()
        r = _fetch("POST", f"{VERCEL}/api/auth/resend-confirmation",
                   {"email": u["email"]}, {"Origin": "https://www.teb-app.pl"})
        if "_error" in r: print(f"ERR: {r['_body'][:60]}")
        else: print("OK")
        time.sleep(0.5)

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

def cmd_export_csv(args):
    """Export tabeli do CSV."""
    table = args.filter or "profiles"
    r = api("GET", f"/rest/v1/{table}?select=*&limit=10000")
    if not isinstance(r, list): print(f"  Blad: {r}"); return
    if not r: print(f"  Pusta tabela: {table}"); return
    
    out = os.path.expanduser(f"~/Desktop/teb-app-backups/{table}-{datetime.now():%Y-%m-%d_%H%M%S}.csv")
    os.makedirs(os.path.dirname(out), exist_ok=True)
    
    keys = list(r[0].keys())
    with open(out, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=keys)
        w.writeheader()
        for row in r: w.writerow(row)
    print(f"  OK: {len(r)} rows -> {out}")

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
    if not args.email: print("  Uzyj: teb-app promote --email user@teb.edu.pl"); return
    u = _find_user(args.email)
    if not u: print(f"  Nie znaleziono: {args.email}"); return
    uid = u["id"]
    roles = list(set(u.get("app_metadata",{}).get("roles",[]) + ["admin","student"]))
    api("PUT", f"/auth/v1/admin/users/{uid}", {"app_metadata": {"roles": roles}})
    profile = api("GET", f"/rest/v1/profiles?id=eq.{uid}")
    existing = profile[0].get("roles",[]) if isinstance(profile,list) and profile else []
    new_roles = list(set(existing + ["admin","student"]))
    api("PATCH", f"/rest/v1/profiles?id=eq.{uid}", {"roles": new_roles, "role": "admin"})
    print(f"  Admin: {u['email']}  roles={new_roles}")

def cmd_ban(args):
    if not args.email: print("  Uzyj: teb-app ban --email user@teb.edu.pl [--pass min]"); return
    dur = int(args.password or "1440")
    u = _find_user(args.email)
    if not u: print(f"  Nie znaleziono: {args.email}"); return
    uid = u["id"]
    profile = api("GET", f"/rest/v1/profiles?id=eq.{uid}")
    if not isinstance(profile,list) or not profile: print("  Brak profilu"); return
    p = profile[0]
    if p.get("is_banned"):
        api("PATCH", f"/rest/v1/profiles?id=eq.{uid}", {"is_banned": False, "banned_until": None})
        print(f"  Odbanowano: {u['email']}")
    else:
        until = (datetime.now(timezone.utc) + timedelta(minutes=dur)).isoformat()
        api("PATCH", f"/rest/v1/profiles?id=eq.{uid}", {"is_banned": True, "banned_until": until})
        print(f"  Zbanowano: {u['email']} do {until[:19]}")

def cmd_password_reset(args):
    """Reset hasla uzytkownika."""
    if not args.email: print("  Uzyj: teb-app password-reset --email user@teb.edu.pl [--pass newpassword]"); return
    u = _find_user(args.email)
    if not u: print(f"  Nie znaleziono: {args.email}"); return
    new_pass = args.password or "NoweHaslo123!"
    r = api("PUT", f"/auth/v1/admin/users/{u['id']}", {"password": new_pass})
    if "_error" in r: print(f"  Blad: {r['_body']}"); return
    print(f"  Haslo zmienione: {u['email']} -> {new_pass}")

def cmd_clean(args):
    users = _get_users()
    deleted = 0
    for u in users:
        if "test" in u["email"].split("@")[0].lower():
            api("DELETE", f"/auth/v1/admin/users/{u['id']}")
            print(f"  Usunieto: {u['email']}")
            deleted += 1
    if not deleted: print("  Brak kont testowych.")

def cmd_inactive(args):
    """Lista nieaktywnych (brak logowania >30d lub brak potwierdzenia >7d)."""
    users = _get_users()
    now = datetime.now(timezone.utc)
    print("  Nieaktywne konta:")
    found = False
    for u in users:
        email = u["email"]
        created = datetime.fromisoformat(u["created_at"].replace("Z","+00:00"))
        last_login = u.get("last_sign_in_at")
        confirmed = u.get("email_confirmed_at")
        
        if not confirmed and (now - created).days > 7:
            print(f"  [UNCONFIRMED] {email:35s} utworzone {created.strftime('%Y-%m-%d')} ({(now-created).days} dni)")
            found = True
        elif last_login:
            last = datetime.fromisoformat(last_login.replace("Z","+00:00"))
            if (now - last).days > 30:
                print(f"  [INACTIVE]    {email:35s} ostatnio {last.strftime('%Y-%m-%d')} ({(now - last).days} dni)")
                found = True
    if not found: print("  Brak nieaktywnych kont.")

def cmd_schema(args):
    tables = api("GET", "/rest/v1/information_schema.tables?select=table_name,table_type&table_schema=eq.public")
    if not isinstance(tables, list): print(f"  Blad lub brak dostepu"); return
    print(f"  Tabele ({len(tables)}):")
    for t in tables:
        name = t.get("table_name","?")
        cnt = api("GET", f"/rest/v1/{name}?select=id&limit=1")
        has = "ma dane" if (isinstance(cnt,list) and cnt) else "pusta"
        print(f"  {name:30s} {has}")

def cmd_verify_link(args):
    """Generuj link potwierdzajacy dla uzytkownika (tylko pokaz, nie wysylaj)."""
    if not args.email: print("  Uzyj: teb-app verify-link --email user@teb.edu.pl"); return
    u = _find_user(args.email)
    if not u: print(f"  Nie znaleziono: {args.email}"); return
    import hashlib
    raw = f"{u['email']}:{u['created_at']}:teb-app-verify"
    token = hashlib.sha256(raw.encode()).hexdigest()[:64]
    print(f"  Email: {u['email']}")
    print(f"  Link:  https://www.teb-app.pl/confirm?token={token}")
    print(f"  (symulowany - w produkcji uzyj resend)")

def cmd_app_version(args):
    """Wersja lokalna vs deploy."""
    r = subprocess.run(["git","describe","--tags","--always"], capture_output=True, text=True, cwd=REPO)
    local = r.stdout.strip()
    r2 = subprocess.run(["git","rev-parse","HEAD"], capture_output=True, text=True, cwd=REPO)
    commit = r2.stdout.strip()[:8]
    r3 = subprocess.run(["git","log","-1","--format=%ai %s"], capture_output=True, text=True, cwd=REPO)
    last = r3.stdout.strip()
    print(f"  Wersja lokalna:    {local} ({commit})")
    print(f"  Ostatni commit:    {last}")
    try:
        req = urllib.request.Request(f"{VERCEL}/api/health", method="HEAD")
        resp = urllib.request.urlopen(req, context=ssl_ctx, timeout=5)
        print(f"  Deploy:            {VERCEL} (HTTP {resp.status})")
    except Exception as e:
        print(f"  Deploy:            BLAD {str(e)[:60]}")

def cmd_email_test(args):
    """Wyslij testowy email."""
    to = args.email or "szymon.sosnowski2@teb.edu.pl"
    r = _fetch("GET", f"{VERCEL}/api/health?send=true&to={to}")
    if "_error" in r: print(f"  Blad: {r['_error']}"); return
    send = r.get("send", {})
    if send.get("ok"):
        print(f"  OK: messageId={send.get('messageId','?')}")
        print(f"  Accepted: {send.get('accepted',[])}")
        print(f"  Response: {send.get('response','')[:100]}")
    else:
        print(f"  Blad wysylki: {send.get('error','?')}")

def cmd_deploy(args):
    r = subprocess.run(["git","log","--oneline","-5"], capture_output=True, text=True, cwd=REPO)
    for l in r.stdout.strip().split("\n"):
        if l: print(f"  {l}")
    r2 = subprocess.run(["git","rev-parse","HEAD"], capture_output=True, text=True, cwd=REPO)
    r3 = subprocess.run(["git","rev-parse","@{u}"], capture_output=True, text=True, cwd=REPO)
    if r2.stdout.strip() != r3.stdout.strip():
        print(f"  UWAGA: local != remote (push required)")
    print(f"  URL: {VERCEL}")

def cmd_whois(args):
    q = args.filter or args.email or ""
    if not q: print("  Uzyj: teb-app whois --filter 'jan'"); return
    users = _get_users()
    found = [u for u in users if q.lower() in u["email"].lower() or q.lower() in u.get("id","").lower()]
    if not found: print(f"  Brak wynikow dla: {q}"); return
    print(f"  Znaleziono {len(found)}:")
    for u in found:
        c = "TAK" if u.get("email_confirmed_at") else "NIE"
        r = u.get("app_metadata",{}).get("roles",["student"])
        print(f"  {u['email']:35s} potw={c} role={r}")

def cmd_monitor(args):
    interval = int(args.password or "10")
    print(f"  Monitorowanie co {interval}s. Ctrl+C aby zatrzymac.")
    try:
        while True:
            ts = datetime.now().strftime("%H:%M:%S")
            health = _fetch("GET", f"{VERCEL}/api/health")
            users = _get_users()
            t = len(users); c = sum(1 for u in users if u.get("email_confirmed_at"))
            smtp = "OK" if health.get("checks",{}).get("smtp",{}).get("status")=="ok" else "ERR"
            sup = "OK" if health.get("checks",{}).get("supabase",{}).get("status")=="ok" else "ERR"
            print(f"  [{ts}] SMTP={smtp} Supabase={sup} Users={t} Confirmed={c}")
            time.sleep(interval)
    except KeyboardInterrupt:
        print("\n  Monitorowanie zatrzymane.")

def cmd_check(args):
    print("  === DIAGNOSTYKA ===")
    r = _fetch("GET", f"{VERCEL}/api/health")
    if "_error" in r: print(f"  [ERR] Health: {r['_error']}")
    else: print(f"  [OK] Health: {r.get('status','?')}")
    for d in ["teb-app.pl", "www.teb-app.pl"]:
        dig = subprocess.run(["dig", "+short", d], capture_output=True, text=True, timeout=5)
        if dig.stdout.strip(): print(f"  [OK] DNS {d}: {dig.stdout.strip()[:50]}")
        else: print(f"  [ERR] DNS {d}: brak")
    for url in ["https://teb-app.pl", "https://www.teb-app.pl"]:
        try:
            req = urllib.request.Request(url, method="HEAD")
            resp = urllib.request.urlopen(req, context=ssl_ctx, timeout=5)
            print(f"  [OK] HTTPS {url}: {resp.status}")
        except Exception as e:
            print(f"  [ERR] HTTPS {url}: {str(e)[:60]}")
    s = api("GET", "/auth/v1/settings")
    if "_error" in s: print(f"  [ERR] Supabase API: {s.get('_body','')[:60]}")
    else: print(f"  [OK] Supabase API: dziala")
    r = subprocess.run(["git","status","--short"], capture_output=True, text=True, cwd=REPO, timeout=5)
    if r.stdout.strip(): print(f"  [WARN] Uncommited: {r.stdout.count(chr(10))} files")
    else: print(f"  [OK] Git: czysty")
    print(f"  === KONIEC ===")

# ─── DISPATCHER ────────────────────────────────────────────────

if __name__ == "__main__":
    import argparse
    cmds = {
        "health": cmd_health, "users": cmd_users, "user": cmd_user, "stats": cmd_stats,
        "stats-detail": cmd_stats_detail, "logs": cmd_logs, "audit": cmd_audit,
        "resend": cmd_resend, "bulk-resend": cmd_bulk_resend,
        "backup": cmd_backup, "export-csv": cmd_export_csv,
        "create": cmd_create, "promote": cmd_promote, "ban": cmd_ban,
        "password-reset": cmd_password_reset, "clean": cmd_clean,
        "inactive": cmd_inactive, "schema": cmd_schema,
        "verify-link": cmd_verify_link, "app-version": cmd_app_version,
        "email-test": cmd_email_test,
        "deploy": cmd_deploy, "whois": cmd_whois,
        "monitor": cmd_monitor, "check": cmd_check
    }
    p = argparse.ArgumentParser(description="TEB-App Manager v3.0",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=f"""Komendy ({len(cmds)}):
  health                          Status systemu
  users [--filter X]              Lista (unconfirmed|confirmed|admin)
  user --email E                  Szczegoly
  whois --filter Q                Szukaj
  stats                           Statystyki
  stats-detail                    Rozszerzone statystyki
  logs [--filter page]            Logi bledow
  audit                           Dzialania moderatorow
  resend --email E                Wyslij potwierdzenie
  bulk-resend                     Resend do wszystkich niepotwierdzonych
  email-test [--email E]          Wyslij testowy email
  backup                          Backup bazy (JSON)
  export-csv --filter table       Export tabeli do CSV
  create [--name N] [--email E]   Utworz konto
  promote --email E               Nadaj admina
  ban --email E [--pass min]      Ban/unban
  password-reset --email E [--pass] Reset hasla
  clean                           Usun konta testowe
  inactive                        Lista nieaktywnych
  schema                          Tabele w bazie
  verify-link --email E           Pokaz link potwierdzajacy
  app-version                     Wersja lokalna vs deploy
  deploy                          Ostatni deploy
  monitor [--pass sec]            Monitoruj
  check                           Pelna diagnostyka""")
    p.add_argument("command", nargs="?", help="|".join(cmds))
    p.add_argument("--email"); p.add_argument("--password"); p.add_argument("--name"); p.add_argument("--filter")
    args = p.parse_args()
    if not args.command or args.command not in cmds:
        p.print_help(); sys.exit(1)
    cmds[args.command](args)
