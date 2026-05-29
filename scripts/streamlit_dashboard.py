#!/usr/bin/env python3
"""TEB-App Streamlit Dashboard — python3 -m streamlit run scripts/streamlit_dashboard.py"""
import json, sys, os, subprocess, urllib.request, ssl, time
from datetime import datetime

# Import manager
SCRIPTS = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, SCRIPTS)
with open(os.path.join(SCRIPTS, "teb-app-manager.py")) as f:
    code = f.read()
exec(code.split('if __name__ == "__main__"')[0], {"json": json, "__builtins__": __builtins__})

try:
    import streamlit as st
    import pandas as pd
    import plotly.express as px
except ImportError:
    print("Instaluj: pip install streamlit pandas plotly")
    sys.exit(1)

st.set_page_config(page_title="TEB-App Dashboard", page_icon="📊", layout="wide")
st.title("📊 TEB-App Dashboard")
st.caption("Powered by TEB-App Manager v" + VERSION)

# Refresh button
col1, col2, col3 = st.columns(3)
with col1:
    refresh = st.button("🔄 Odswiez")
with col3:
    auto = st.checkbox("Auto-odswiezanie (30s)", value=True)

if auto:
    st.rerun()

# Fetch data
try:
    users = _get_users()
    health = _fetch("GET", VERCEL + "/api/health")
    errors_data = api("GET", "/rest/v1/error_logs?limit=100&order=created_at.desc")
    profiles = api("GET", "/rest/v1/profiles?select=teb_gabki,is_banned&limit=1000")
except Exception as e:
    st.error("Blad laczenia: " + str(e))
    st.stop()

# Metrics
t = len(users)
c = sum(1 for u in users if u.get("email_confirmed_at"))
admins = sum(1 for u in users if "admin" in u.get("app_metadata",{}).get("roles",[]))
banned = sum(1 for p in (profiles if isinstance(profiles,list) else []) if p.get("is_banned"))
smtp_ok = health.get("checks",{}).get("smtp",{}).get("status")=="ok"
sup_ok = health.get("checks",{}).get("supabase",{}).get("status")=="ok"

col1, col2, col3, col4, col5, col6 = st.columns(6)
col1.metric("Uzytkownicy", t)
col2.metric("Potwierdzone", c, delta=str(t-c) + " niepotw.")
col3.metric("Admini", admins)
col4.metric("Zbanowani", banned)
col5.metric("SMTP", "OK" if smtp_ok else "ERR", delta_color="inverse")
col6.metric("Supabase", "OK" if sup_ok else "ERR", delta_color="inverse")

# Registration chart
st.subheader("Rejestracje")
dates = {}
for u in users:
    d = u["created_at"][:10]
    dates[d] = dates.get(d, 0) + 1

if dates:
    df = pd.DataFrame(list(dates.items()), columns=["Data", "Rejestracje"])
    df = df.sort_values("Data")
    fig = px.line(df, x="Data", y="Rejestracje", markers=True)
    fig.update_layout(height=300, margin=dict(l=0, r=0, t=10, b=0))
    st.plotly_chart(fig, use_container_width=True)

# Users table
st.subheader("Uzytkownicy (" + str(t) + ")")
user_data = []
for u in users:
    user_data.append({
        "Email": u["email"],
        "Potwierdzony": "TAK" if u.get("email_confirmed_at") else "NIE",
        "Rola": ",".join(u.get("app_metadata",{}).get("roles",["student"])),
        "Data": u["created_at"][:10],
        "Ostatnio": (u.get("last_sign_in_at") or "-")[:10],
    })
st.dataframe(pd.DataFrame(user_data), use_container_width=True, height=400)

# Error logs
st.subheader("Bledy")
if isinstance(errors_data, list) and errors_data:
    err_df = pd.DataFrame(errors_data)
    if "created_at" in err_df.columns:
        err_df["created_at"] = pd.to_datetime(err_df["created_at"]).dt.strftime("%Y-%m-%d %H:%M")
    st.dataframe(err_df[["created_at","level","source","message"]].head(20) if all(c in err_df.columns for c in ["created_at","level","source","message"]) else err_df, use_container_width=True)
else:
    st.info("Brak bledow")

with st.expander("Diagnostyka"):
    st.json(health)

st.caption("Ostatnia aktualizacja: " + datetime.now().strftime("%Y-%m-%d %H:%M:%S"))
