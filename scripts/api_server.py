#!/usr/bin/env python3
"""TEB-App API Server — REST API dla narzedzia.
Uruchom: python3 scripts/api_server.py [--port 5000]
Komendy: GET /health, GET /stats, GET /users, POST /resend, POST /promote, GET /logs"""
import json, sys, os, urllib.request, ssl, time
from http.server import HTTPServer, BaseHTTPRequestHandler

# Import manager infrastructure
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
MANAGER = os.path.join(os.path.dirname(os.path.abspath(__file__)), "teb-app-manager.py")
with open(MANAGER) as f: code = f.read()
# Inject json into the exec namespace
exec(code.split('if __name__ == "__main__"')[0], {"json": json, "__builtins__": __builtins__})

PORT = int(sys.argv[sys.argv.index("--port")+1]) if "--port" in sys.argv else 5000

class Handler(BaseHTTPRequestHandler):
    def _json(self, data, status=200):
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(json.dumps(data, indent=2, default=str, ensure_ascii=False).encode())
    
    def do_GET(self):
        if self.path == "/health":
            h = _fetch("GET", VERCEL + "/api/health")
            self._json(h)
        elif self.path == "/stats":
            users = _get_users()
            t = len(users); c = sum(1 for u in users if u.get("email_confirmed_at"))
            self._json({"total": t, "confirmed": c, "unconfirmed": t-c})
        elif self.path == "/users":
            users = _get_users()
            self._json([{"email": u["email"], "id": u["id"][:8],
                "confirmed": bool(u.get("email_confirmed_at")),
                "roles": u.get("app_metadata",{}).get("roles",[])} for u in users])
        elif self.path == "/logs":
            logs = api("GET", "/rest/v1/error_logs?limit=20&order=created_at.desc")
            self._json(logs if isinstance(logs, list) else [])
        elif self.path == "/":
            self._json({"service": "TEB-App API", "version": "1.0",
                "endpoints": ["/health", "/stats", "/users", "/logs", "/user?email=X"]})
        else:
            self._json({"error": "Not found"}, 404)
    
    def do_POST(self):
        length = int(self.headers.get("Content-Length", 0))
        body = json.loads(self.rfile.read(length)) if length else {}
        
        if self.path == "/resend":
            email = body.get("email", "")
            if not email: self._json({"error": "email required"}, 400); return
            r = _fetch("POST", VERCEL + "/api/auth/resend-confirmation",
                       {"email": email}, {"Origin": "https://www.teb-app.pl"})
            self._json(r)
        elif self.path == "/promote":
            email = body.get("email", "")
            if not email: self._json({"error": "email required"}, 400); return
            u = _find_user(email)
            if not u: self._json({"error": "not found"}, 404); return
            roles = list(set(u.get("app_metadata",{}).get("roles",[]) + ["admin","student"]))
            api("PUT", "/auth/v1/admin/users/" + u["id"], {"app_metadata": {"roles": roles}})
            api("PATCH", "/rest/v1/profiles?id=eq." + u["id"], {"roles": roles})
            self._json({"ok": True, "email": email, "roles": roles})
        else:
            self._json({"error": "Not found"}, 404)
    
    def log_message(self, *a): pass  # quiet mode

print("TEB-App API Server")
print("Endpoints:")
print("  GET  /health  - Status systemu")
print("  GET  /stats   - Statystyki")
print("  GET  /users   - Lista uzytkownikow")
print("  GET  /logs    - Logi bledow")
print("  POST /resend  - Wyslij potwierdzenie ({email})")
print("  POST /promote - Nadaj admina ({email})")
print("Server: http://localhost:" + str(PORT))
HTTPServer(("", PORT), Handler).serve_forever()
