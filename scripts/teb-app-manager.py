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

# ─── KOMENDY (25) ─────────────────────────────────────────────

def cmd_health(args):
    r = _fetch("GET", f"{VERCEL}/api/health")
    if "_error" in r: print(f"  Blad: {r['_error']}"); return
    print(f"  Status: {r.get('status','?')}")
    for name, chk in r.get("checks",{}).items():
        s = chk.get("status","?")
        print(f"  {name:12s} [{'OK' if s=='ok' else 'ERR'}] {chk.get('detail','')}")

def cmd_users(args):
    users = _get_users(); filt = args.filter
    for u in users:
        c = u.get("email_confirmed_at"); potw = "TAK" if c else "NIE"
        created = u["created_at"][:10]; r = u.get("app_metadata",{}).get("roles",[])
        if filt == "unconfirmed" and potw == "TAK": continue
        if filt == "confirmed" and potw == "NIE": continue
        if filt == "admin" and "admin" not in r: continue
        print(f"  {u['email']:35s} potw={potw}  data={created}  role={r or ['student']}")

def cmd_user(args):
    q = args.email or args.filter or ""
    if not q: print("  Uzyj: teb-app user --email user@teb.edu.pl"); return
    u = _find_user(q)
    if not u: print(f"  Nie znaleziono: {q}"); return
    print(f"  Email: {u['email']}\n  ID: {u['id']}\n  Created: {u['created_at'][:19]}")
    print(f"  Confirmed: {u.get('email_confirmed_at','NIE')[:19] if u.get('email_confirmed_at') else 'NIE'}")
    print(f"  Last sign in: {u.get('last_sign_in_at','?')[:19] if u.get('last_sign_in_at') else 'nigdy'}")
    print(f"  Roles: {u.get('app_metadata',{}).get('roles',['student'])}")
    p = api("GET", f"/rest/v1/profiles?id=eq.{u['id']}")
    if isinstance(p,list) and p:
        print(f"  Full name: {p[0].get('full_name','?')}\n  Banned: {'TAK' if p[0].get('is_banned') else 'NIE'}")
        if p[0].get('banned_until'): print(f"  Ban until: {p[0]['banned_until'][:19]}")
        print(f"  TG: {p[0].get('teb_gabki',0)}")
    logs = api("GET", f"/rest/v1/error_logs?email=eq.{u['email']}&limit=5&order=created_at.desc")
    if isinstance(logs,list) and logs:
        print(f"  Ostatnie bledy:"); [print(f"    [{l.get('level','?')}] {l.get('message','')[:80]}") for l in logs[:3]]

def cmd_stats(args):
    users = _get_users(); t = len(users); c = sum(1 for u in users if u.get("email_confirmed_at"))
    a = sum(1 for u in users if "admin" in u.get("app_metadata",{}).get("roles",[]))
    print(f"  Total: {t}  Potwierdzone: {c}  Niepotwierdzone: {t-c}  Admini: {a}")

def cmd_stats_detail(args):
    users = _get_users(); now = datetime.now(timezone.utc)
    t = len(users); c = sum(1 for u in users if u.get("email_confirmed_at"))
    this_week = sum(1 for u in users if datetime.fromisoformat(u["created_at"].replace("Z","+00:00")) > now-timedelta(days=7))
    errors = api("GET", "/rest/v1/error_logs?select=id&limit=1")
    print(f"  = ROZSZERZONE =\n  Total: {t}  Potw: {c}  Niepotw: {t-c}\n  Ten tydzien: {this_week}\n  Bledy: {len(errors) if isinstance(errors,list) else 0}")

def cmd_logs(args):
    page = int(getattr(args,"filter","1") or "1")
    r = api("GET", f"/rest/v1/error_logs?limit=20&offset={(page-1)*20}&order=created_at.desc")
    if not isinstance(r,list): print(f"  Blad"); return
    print(f"  Logi (strona {page}):")
    for l in r:
        icon = {"error":"ERR","warn":"WRN","info":"INF"}.get(l.get("level","?"),"?"); dt = l.get("created_at","")[:19]
        print(f"  [{icon}] {dt} {l.get('source','?')[:12]:12s} {l.get('message','')[:90]}")
    if len(r)==20: print(f"  --- wiecej: teb-app logs --filter {page+1} ---")

def cmd_audit(args):
    r = api("GET","/rest/v1/moderation_audit_log?limit=20&order=created_at.desc&select=id,action_type,reason,created_at,actor:profiles!actor_user_id(full_name),target:profiles!target_user_id(full_name)")
    if not isinstance(r,list): print(f"  Blad"); return
    print("  Moderacja:")
    for a in r:
        actor = a.get("actor",{}).get("full_name","?") if isinstance(a.get("actor"),dict) else "?"
        target = a.get("target",{}).get("full_name","-") if isinstance(a.get("target"),dict) else "-"
        dt = a.get("created_at","")[:16]; act = a.get("action_type","?")[:20]
        print(f"  {dt} {actor:15s} -> {act} {target:15s} {(a.get('reason') or '')[:40]}")

def cmd_activity(args):
    limit = int(args.filter or "20")
    r = api("GET", f"/rest/v1/error_logs?limit={limit}&order=created_at.desc")
    if not isinstance(r,list): print(f"  Blad"); return
    print(f"  Aktywnosc ({limit}):")
    for l in r:
        dt = l.get("created_at","")[:19]; src = l.get("source","?")[:15]; lvl = l.get("level","?")
        print(f"  [{lvl}] {dt} {src:15s} {l.get('message','')[:80]}")

# ─── KOMENDY (25-33) ──────────────────────────────────────────

def cmd_resend(args):
    if not args.email: print("  Uzyj: teb-app resend --email user@teb.edu.pl"); return
    r = _fetch("POST",f"{VERCEL}/api/auth/resend-confirmation",{"email":args.email},{"Origin":"https://www.teb-app.pl"})
    if "_error" in r: print(f"  Blad: {r['_body']}"); return
    print(f"  OK: {r}")

def cmd_bulk_resend(args):
    users = _get_users(); unconfirmed = [u for u in users if not u.get("email_confirmed_at")]
    if not unconfirmed: print("  Wszyscy potwierdzeni."); return
    print(f"  Wysylam do {len(unconfirmed)}:")
    for u in unconfirmed:
        sys.stdout.write(f"  {u['email']:35s}... "); sys.stdout.flush()
        r = _fetch("POST",f"{VERCEL}/api/auth/resend-confirmation",{"email":u["email"]},{"Origin":"https://www.teb-app.pl"})
        print("OK" if "_error" not in r else f"ERR"); time.sleep(0.5)

def cmd_email_test(args):
    to = args.email or "szymon.sosnowski2@teb.edu.pl"
    r = _fetch("GET", f"{VERCEL}/api/health?send=true&to={to}")
    if "_error" in r: print(f"  Blad: {r['_error']}"); return
    s = r.get("send",{}); print(f"  OK: id={s.get('messageId','?')}" if s.get("ok") else f"  Blad: {s.get('error','?')}")

def cmd_notify(args):
    if not args.email: print("  Uzyj: teb-app notify --email user --name 'tresc'"); return
    r = _fetch("POST",f"{VERCEL}/api/auth/resend-confirmation",{"email":args.email},{"Origin":"https://www.teb-app.pl"})
    if "_error" in r: print(f"  Blad: {r['_body']}"); return
    print(f"  Wyslano do: {args.email}")

def cmd_backup(args):
    tables = ["profiles","feed_posts","feed_comments","feed_votes","rewear_posts","reports",
              "moderation_audit_log","error_logs","groups","group_messages","punishment_appeals","chat_groups","chat_group_members"]
    out = os.path.expanduser(f"~/Desktop/teb-app-backups/backup-{datetime.now():%Y-%m-%d_%H%M%S}.json")
    os.makedirs(os.path.dirname(out), exist_ok=True); all_data = {"date":str(datetime.now()),"tables":{}}
    for t in tables:
        sys.stdout.write(f"  {t:25s}... "); sys.stdout.flush()
        r = api("GET",f"/rest/v1/{t}?select=*&limit=10000"); rows = len(r) if isinstance(r,list) else 0
        all_data["tables"][t] = {"rows":rows}; print(f"{rows} rows")
    with open(out,"w") as f: json.dump(all_data,f,indent=2,default=str)
    print(f"  OK: {out}")

def cmd_export_csv(args):
    table = args.filter or "profiles"; r = api("GET",f"/rest/v1/{table}?select=*&limit=10000")
    if not isinstance(r,list) or not r: print(f"  Nie znaleziono lub pusta: {table}"); return
    out = os.path.expanduser(f"~/Desktop/teb-app-backups/{table}-{datetime.now():%Y-%m-%d_%H%M%S}.csv")
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out,"w",newline="") as f: w=csv.DictWriter(f,fieldnames=list(r[0].keys())); w.writeheader(); w.writerows(r)
    print(f"  OK: {len(r)} rows -> {out}")

def cmd_diff(args):
    d = os.path.expanduser("~/Desktop/teb-app-backups"); files = sorted([f for f in os.listdir(d) if f.endswith(".json")])
    if len(files)<2: print("  Potrzeba 2+ backupow"); return
    with open(os.path.join(d,files[-1])) as f: n=json.load(f)
    with open(os.path.join(d,files[-2])) as f: p=json.load(f)
    print(f"  {files[-2]} vs {files[-1]}:")
    for table in set(list(n.get("tables",{}).keys())+list(p.get("tables",{}).keys())):
        nr = n.get("tables",{}).get(table,{}).get("rows",0) if isinstance(n.get("tables",{}).get(table),dict) else 0
        pr = p.get("tables",{}).get(table,{}).get("rows",0) if isinstance(p.get("tables",{}).get(table),dict) else 0
        dff = nr-pr; print(f"  {table:30s} {pr} -> {nr} ({'+' if dff>0 else ''}{dff})")

def cmd_create(args):
    e = args.email or f"test-{datetime.now():%H%M%S}@teb.edu.pl"; p = args.password or "Test1234!"
    name = args.name or e.split("@")[0]
    r = api("POST","/auth/v1/admin/users",{"email":e,"password":p,"email_confirm":True,"user_metadata":{"full_name":name}})
    if "_error" in r: print(f"  Blad: {r['_body']}"); return
    uid = r["id"]; print(f"  Konto: {e}  haslo: {p}  id: {uid[:8]}...")
    api("POST","/rest/v1/profiles",{"id":uid,"email":e,"full_name":name,"roles":["student"],"role":"student"})

def cmd_promote(args):
    if not args.email: print("  Uzyj: teb-app promote --email user"); return
    u = _find_user(args.email); assert u, f"  Nie znaleziono"
    uid = u["id"]
    roles = list(set(u.get("app_metadata",{}).get("roles",[])+["admin","student"]))
    api("PUT",f"/auth/v1/admin/users/{uid}",{"app_metadata":{"roles":roles}})
    profile = api("GET",f"/rest/v1/profiles?id=eq.{uid}")
    existing = profile[0].get("roles",[]) if isinstance(profile,list) and profile else []
    api("PATCH",f"/rest/v1/profiles?id=eq.{uid}",{"roles":list(set(existing+["admin","student"])),"role":"admin"})
    print(f"  Admin: {u['email']}")

def cmd_ban(args):
    if not args.email: print("  Uzyj: teb-app ban --email user"); return
    dur = int(args.password or "1440"); u = _find_user(args.email); assert u, "  Nie znaleziono"
    profile = api("GET",f"/rest/v1/profiles?id=eq.{u['id']}")
    if not isinstance(profile,list) or not profile: print("  Brak profilu"); return
    if profile[0].get("is_banned"):
        api("PATCH",f"/rest/v1/profiles?id=eq.{u['id']}",{"is_banned":False,"banned_until":None})
        print(f"  Odbanowano: {u['email']}")
    else:
        until = (datetime.now(timezone.utc)+timedelta(minutes=dur)).isoformat()
        api("PATCH",f"/rest/v1/profiles?id=eq.{u['id']}",{"is_banned":True,"banned_until":until})
        print(f"  Zbanowano do {until[:19]}")

def cmd_password_reset(args):
    if not args.email: print("  Uzyj: teb-app password-reset --email user [--pass new]"); return
    u = _find_user(args.email); assert u, "  Nie znaleziono"; np = args.password or "NoweHaslo123!"
    r = api("PUT",f"/auth/v1/admin/users/{u['id']}",{"password":np})
    if "_error" in r: print(f"  Blad: {r['_body']}"); return
    print(f"  Haslo zmienione: {np}")

def cmd_clean(args):
    for u in _get_users():
        if "test" in u["email"].split("@")[0].lower():
            api("DELETE",f"/auth/v1/admin/users/{u['id']}"); print(f"  Usunieto: {u['email']}")

def cmd_inactive(args):
    now = datetime.now(timezone.utc); found = False
    for u in _get_users():
        created = datetime.fromisoformat(u["created_at"].replace("Z","+00:00"))
        last = u.get("last_sign_in_at")
        if not u.get("email_confirmed_at") and (now-created).days>7:
            print(f"  [UNCONFIRMED] {u['email']:35s} ({(now-created).days} dni)"); found=True
        elif last and (now-datetime.fromisoformat(last.replace("Z","+00:00"))).days>30:
            print(f"  [INACTIVE] {u['email']:35s} ({(now-datetime.fromisoformat(last.replace('Z','+00:00'))).days} dni)"); found=True
    if not found: print("  Brak nieaktywnych.")

def cmd_schema(args):
    t = api("GET","/rest/v1/information_schema.tables?select=table_name,table_type&table_schema=eq.public")
    if not isinstance(t,list): print("  Brak dostepu"); return
    print(f"  Tabele ({len(t)}):")
    for tb in t:
        n = tb.get("table_name","?")
        c = api("GET",f"/rest/v1/{n}?select=id&limit=1")
        print(f"  {n:30s} {'ma dane' if isinstance(c,list) and c else 'pusta'}")

def cmd_verify_link(args):
    if not args.email: print("  Uzyj: teb-app verify-link --email user"); return
    import hashlib; u = _find_user(args.email); assert u, "  Nie znaleziono"
    token = hashlib.sha256(f"{u['email']}:{u['created_at']}:teb-app-verify".encode()).hexdigest()[:64]
    print(f"  Link: https://www.teb-app.pl/confirm?token={token}")

def cmd_app_version(args):
    local = subprocess.run(["git","describe","--tags","--always"],capture_output=True,text=True,cwd=REPO).stdout.strip()
    commit = subprocess.run(["git","rev-parse","HEAD"],capture_output=True,text=True,cwd=REPO).stdout.strip()[:8]
    last = subprocess.run(["git","log","-1","--format=%ai %s"],capture_output=True,text=True,cwd=REPO).stdout.strip()
    print(f"  Wersja: {local} ({commit})\n  Ostatni: {last}")
    try:
        req = urllib.request.Request(f"{VERCEL}/api/health",method="HEAD")
        resp = urllib.request.urlopen(req,context=ssl_ctx,timeout=5)
        print(f"  Deploy: {VERCEL} (HTTP {resp.status})")
    except Exception as e: print(f"  Deploy: BLAD {str(e)[:60]}")

def cmd_deploy(args):
    r = subprocess.run(["git","log","--oneline","-5"],capture_output=True,text=True,cwd=REPO)
    for l in r.stdout.strip().split("\n"):
        if l: print(f"  {l}")
    h = subprocess.run(["git","rev-parse","HEAD"],capture_output=True,text=True,cwd=REPO).stdout.strip()
    u = subprocess.run(["git","rev-parse","@{u}"],capture_output=True,text=True,cwd=REPO).stdout.strip()
    if h!=u: print(f"  UWAGA: local != remote (push required)")
    print(f"  URL: {VERCEL}")

def cmd_whois(args):
    q = args.filter or args.email or ""
    if not q: print("  Uzyj: teb-app whois --filter 'fragment'"); return
    found = [u for u in _get_users() if q.lower() in u["email"].lower() or q.lower() in u.get("id","").lower()]
    if not found: print(f"  Brak wynikow"); return
    for u in found:
        c = "TAK" if u.get("email_confirmed_at") else "NIE"
        print(f"  {u['email']:35s} potw={c} role={u.get('app_metadata',{}).get('roles',['student'])}")

def cmd_monitor(args):
    interval = int(args.password or "10"); print(f"  Ctrl+C stop. Co {interval}s.")
    try:
        while True:
            h = _fetch("GET",f"{VERCEL}/api/health"); u = _get_users()
            t = len(u); c = sum(1 for x in u if x.get("email_confirmed_at"))
            s = "OK" if h.get("checks",{}).get("smtp",{}).get("status")=="ok" else "ERR"
            p = "OK" if h.get("checks",{}).get("supabase",{}).get("status")=="ok" else "ERR"
            print(f"  [{datetime.now():%H:%M:%S}] SMTP={s} Supabase={p} Users={t} Conf={c}")
            time.sleep(interval)
    except KeyboardInterrupt: print("\n  Stop.")

def cmd_check(args):
    print("  === DIAGNOSTYKA ===")
    r = _fetch("GET",f"{VERCEL}/api/health")
    print(f"  {'[OK]' if '_error' not in r else '[ERR]'} Health: {r.get('status','?') if '_error' not in r else r['_error']}")
    for d in ["teb-app.pl","www.teb-app.pl"]:
        dig = subprocess.run(["dig","+short",d],capture_output=True,text=True,timeout=5)
        print(f"  {'[OK]' if dig.stdout.strip() else '[ERR]'} DNS {d}: {dig.stdout.strip()[:50] or 'brak'}")
    for url in ["https://teb-app.pl","https://www.teb-app.pl"]:
        try:
            resp = urllib.request.urlopen(urllib.request.Request(url,method="HEAD"),context=ssl_ctx,timeout=5)
            print(f"  [OK] HTTPS {url}: {resp.status}")
        except Exception as e: print(f"  [ERR] HTTPS {url}: {str(e)[:60]}")
    s = api("GET","/auth/v1/settings")
    print(f"  {'[OK]' if '_error' not in s else '[ERR]'} Supabase API")
    g = subprocess.run(["git","status","--short"],capture_output=True,text=True,cwd=REPO,timeout=5)
    print(f"  {'[WARN]' if g.stdout.strip() else '[OK]'} Git: {'uncommited' if g.stdout.strip() else 'czysty'}")
    print("  === KONIEC ===")

# ─── KOMENDY (33-40) ──────────────────────────────────────────

def cmd_routes(args):
    for root,_,files in os.walk(os.path.join(REPO,"api")):
        for f in sorted(files):
            if not f.endswith(".js"): continue
            rel = os.path.relpath(os.path.join(root,f),os.path.join(REPO,"api")).replace(".js","")
            with open(os.path.join(root,f)) as fh: c = fh.read()[:500]
            m = "GET" if "GET" in c else "POST"
            if "GET" in c and "POST" in c: m = "GET|POST"
            print(f"  /api/{rel:40s} {m:10s}")

def cmd_deps(args):
    with open(os.path.join(REPO,"package.json")) as f: d = json.load(f)
    for n,v in sorted({**d.get("dependencies",{}),**d.get("devDependencies",{})}.items()):
        print(f"  {n:30s} {v}")

def cmd_lint(args):
    r = subprocess.run(["npx","eslint","src/"],capture_output=True,text=True,timeout=30)
    print(f"  {'OK' if r.returncode==0 else f'Problemy ({r.returncode})'}:")
    if r.returncode: [print(f"  {l.strip()[:120]}") for l in r.stdout.split("\n")[:15] if l.strip()]

def cmd_env(args):
    r = _fetch("GET",f"{VERCEL}/api/health")
    if "_error" in r: print(f"  Blad"); return
    env = r.get("checks",{}).get("env",{}).get("detail",{})
    if isinstance(env,dict):
        for k,v in env.items(): print(f"  {k:35s} {'SET' if v else 'MISSING'}")

def cmd_dashboard(args):
    port = int(args.password or "8080")
    html = """<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>TEB-App Dashboard</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{background:#121212;color:#fff;font-family:system-ui,sans-serif;padding:20px}
h1{color:#c8102e;font-size:24px;margin-bottom:20px;display:flex;align-items:center;gap:12px}
h1 small{font-size:12px;color:#888;font-weight:normal}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin-bottom:24px}
.card{background:#1e1e1e;border:1px solid #333;border-radius:16px;padding:16px}
.card .l{color:#888;font-size:10px;text-transform:uppercase;letter-spacing:1px;margin-bottom:6px}
.card .v{font-size:28px;font-weight:bold}.card .v.g{color:#22c55e}.card .v.r{color:#ef4444}.card .v.b{color:#3b82f6}.card .v.y{color:#eab308}
table{width:100%;border-collapse:collapse;font-size:12px}
th{text-align:left;padding:6px 8px;color:#666;border-bottom:1px solid #333;font-size:9px;text-transform:uppercase}
td{padding:6px 8px;border-bottom:1px solid #222;color:#ccc}
.conf{color:#22c55e}.noconf{color:#ef4444}
pre.d{background:#0a0a0a;padding:10px;border-radius:8px;font-size:11px;color:#666;overflow-x:auto;margin-top:12px}
.footer{margin-top:24px;font-size:10px;color:#444;text-align:center}
</style></head><body>
<h1>TEB-App Dashboard <small id="ts"></small></h1>
<div class="grid" id="cards"></div>
<div id="logs" style="margin-top:24px"></div>
<div class="footer" id="ver"></div>
<script>
async function load(){
  try {
    const h=await fetch('HEALTH_URL').then(r=>r.json());
    const u=await fetch('USERS_URL',{headers:{'apikey':'KEY','Authorization':'Bearer KEY'}}).then(r=>r.json());
    const users=u.users||[]; const total=users.length;
    const confirmed=users.filter(x=>x.email_confirmed_at).length;
    const admins=users.filter(x=>(x.app_metadata||{}).roles||[]).filter(x=>x.app_metadata.roles.includes('admin')).length;
    const smtp=h.checks?.smtp?.status==='ok'; const sup=h.checks?.supabase?.status==='ok';
    document.getElementById('cards').innerHTML=[
      ['Uzytkownicy',total,'b'],['Potwierdzone',confirmed,'g'],['Niepotwierdzone',total-confirmed,'r'],
      ['Admini',admins,'b'],['SMTP',smtp?'Online':'Offline',smtp?'g':'r'],['Supabase',sup?'Online':'Offline',sup?'g':'r']
    ].map(x=>'<div class="card"><div class="l">'+x[0]+'</div><div class="v '+x[2]+'">'+x[1]+'</div></div>').join('');
    document.getElementById('ts').textContent=new Date().toLocaleString('pl-PL');
    document.getElementById('logs').innerHTML='<h2 style="font-size:14px;margin-bottom:8px;color:#888">Uzytkownicy</h2>'+
      '<table><thead><tr><th>Email</th><th>Status</th><th>Rola</th><th>Rej.</th></tr></thead><tbody>'+
      users.slice(0,30).map(u=>'<tr><td>'+u.email+'</td><td class="'+(u.email_confirmed_at?'conf':'noconf')+'">'+(u.email_confirmed_at?'TAK':'NIE')+
      '</td><td>'+(((u.app_metadata||{}).roles||['student']).join(', '))+'</td><td>'+u.created_at.slice(0,10)+'</td></tr>').join('')+'</tbody></table>';
  } catch(e){document.getElementById('cards').innerHTML='<pre>Blad: '+e.message+'</pre>'}
}
load(); setInterval(load,15000);
</script></body></html>"""
    html = html.replace("HEALTH_URL",f"{VERCEL}/api/health").replace("USERS_URL",f"{BASE}/auth/v1/admin/users").replace("KEY",KEY)
    from http.server import HTTPServer, BaseHTTPRequestHandler
    class H(BaseHTTPRequestHandler):
        def do_GET(self):
            self.send_response(200); self.send_header("Content-Type","text/html;charset=utf-8"); self.end_headers()
            self.wfile.write(html.encode())
        def log_message(self,*a): pass
    print(f"  Dashboard: http://localhost:{port}  (Ctrl+C stop)"); HTTPServer(("",port),H).serve_forever()

# ─── DISPATCHER ────────────────────────────────────────────────

if __name__ == "__main__":
    import argparse
    cmds = {
        "health":cmd_health,"users":cmd_users,"user":cmd_user,"stats":cmd_stats,
        "stats-detail":cmd_stats_detail,"logs":cmd_logs,"audit":cmd_audit,"activity":cmd_activity,
        "resend":cmd_resend,"bulk-resend":cmd_bulk_resend,"email-test":cmd_email_test,"notify":cmd_notify,
        "backup":cmd_backup,"export-csv":cmd_export_csv,"diff":cmd_diff,
        "create":cmd_create,"promote":cmd_promote,"ban":cmd_ban,"password-reset":cmd_password_reset,"clean":cmd_clean,
        "inactive":cmd_inactive,"schema":cmd_schema,"verify-link":cmd_verify_link,
        "routes":cmd_routes,"deps":cmd_deps,"lint":cmd_lint,"env":cmd_env,
        "app-version":cmd_app_version,"deploy":cmd_deploy,"whois":cmd_whois,
        "monitor":cmd_monitor,"check":cmd_check,"dashboard":cmd_dashboard
    }
    p = argparse.ArgumentParser(description="TEB-App Manager v5.0 (nieskonczonosc)",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=f"""Komendy ({len(cmds)}):
  health          Status systemu           | promote --email E  Nadaj admina
  users [--filter]Lista uzytkownikow       | ban --email E      Ban/unban
  user --email E  Szczegoly                | password-reset E   Reset hasla
  whois --filter  Szukaj email             | clean              Usun testowe
  stats-detail    Rozszerzone              | inactive           Nieaktywni
  logs [page]     Logi bledow              | schema             Tabele
  audit           Moderacja                | verify-link E      Link potw.
  activity [N]    Aktywnosc                | routes             API sciezki
  resend --email EWyslij potw.             | deps               Zaleznosci
  bulk-resend     Do wszystkich niepotw.   | lint               ESLint
  email-test [E]  Test SMTP                | env                Zmienne env
  notify E --name  Test pow.               | app-version        Wersja
  create [--name] Utworz konto             | monitor [sec]      Monitor
  backup          Backup JSON              | check              Diagnostyka
  export-csv F    Export CSV               | dashboard [port]   Web UI
  diff            Porownaj backupy         | deploy             Ostatni commit""")
    p.add_argument("command",nargs="?")
    p.add_argument("--email");p.add_argument("--password");p.add_argument("--name");p.add_argument("--filter")
    args = p.parse_args()
    if not args.command or args.command not in cmds: p.print_help(); sys.exit(1)
    cmds[args.command](args)
