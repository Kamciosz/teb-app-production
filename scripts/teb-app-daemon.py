#!/usr/bin/env python3
"""TEB-App Health Daemon — monitoruje system w tle, wysyla powiadomienia macOS."""
import json, sys, os, time, subprocess, urllib.request, ssl, signal
from datetime import datetime

REPO = os.path.expanduser("~/Desktop/teb-app-production")
sys.path.insert(0, os.path.join(REPO, "scripts"))
exec(open(os.path.join(REPO, "scripts/teb-app-manager.py")).read().split("# ─── KOMENDY")[0])

try: import certifi; ssl_ctx = ssl.create_default_context(cafile=certifi.where())
except: ssl_ctx = ssl._create_unverified_context()

STATE_FILE = os.path.expanduser("~/.teb-app-daemon.json")
INTERVAL = 300  # 5 min
last_state = {"smtp": True, "supabase": True, "api": True}

def notify(title, msg):
    """macOS notification."""
    subprocess.run(["osascript", "-e", f'display notification "{msg}" with title "{title}" sound name "default"'], capture_output=True)

def check():
    global last_state
    h = _fetch("GET", "https://teb-app-production.vercel.app/api/health")
    if "_error" in h:
        return notify("TEB-App BLAD", f"Health endpoint: {h['_error']}")
    
    checks = h.get("checks", {})
    smtp = checks.get("smtp", {}).get("status") == "ok"
    supabase = checks.get("supabase", {}).get("status") == "ok"
    
    if smtp and supabase:
        # Everything OK — only notify if recovering from failure
        if not last_state["smtp"] or not last_state["supabase"]:
            notify("TEB-App OK", "Wszystkie systemy dzialaja")
        last_state["smtp"] = True
        last_state["supabase"] = True
    else:
        if not smtp and last_state["smtp"]:
            notify("TEB-App PROBLEM", "SMTP nie odpowiada!")
            last_state["smtp"] = False
        if not supabase and last_state["supabase"]:
            notify("TEB-App PROBLEM", "Supabase nie odpowiada!")
            last_state["supabase"] = False
    
    # Uptime tracking
    state = {"smtp": smtp, "supabase": supabase, "last_check": datetime.now().isoformat()}
    if os.path.exists(STATE_FILE):
        try:
            history = json.load(open(STATE_FILE))
            if isinstance(history, list):
                history.append(state)
                if len(history) > 2880: history = history[-2880:]  # 10 days at 5min
                json.dump(history, open(STATE_FILE, "w"))
        except: pass
    
    sys.stdout.write(f"[{datetime.now():%H:%M:%S}] SMTP={'OK' if smtp else 'ERR'} Supabase={'OK' if supabase else 'ERR'}\r")
    sys.stdout.flush()

def main():
    print(f"TEB-App Health Daemon")
    print(f"Monitoring co {INTERVAL}s. Ctrl+C stop.")
    print(f"Log: {STATE_FILE}")
    
    # Handle signals
    signal.signal(signal.SIGTERM, lambda *a: sys.exit(0))
    
    while True:
        try:
            check()
            time.sleep(INTERVAL)
        except KeyboardInterrupt:
            print("\nDaemon zatrzymany.")
            sys.exit(0)
        except Exception as e:
            print(f"\nBLAD: {e}")
            time.sleep(60)

if __name__ == "__main__":
    main()
