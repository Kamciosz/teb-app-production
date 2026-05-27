import React, { useState, useEffect, useRef, useMemo } from 'react'
import { CheckCircle2, Lock, Loader2, BookOpen, Calendar, PieChart, Clock, LogOut, AlertCircle, ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react'

// Credentials are kept ONLY in memory (React ref) — never written to localStorage
// because storing them in localStorage exposes them to XSS attacks.

// ─── Date helpers ──────────────────────────────────────────────────────────
function getWeekDays(offsetWeeks = 0) {
    const now = new Date();
    // sentyment to poniedziałek danego tygodnia
    const day = now.getDay(); // 0=niedziela, 1=pon
    const diffToMon = (day === 0 ? -6 : 1 - day) + offsetWeeks * 7;
    const mon = new Date(now);
    mon.setDate(now.getDate() + diffToMon);
    mon.setHours(0, 0, 0, 0);
    return Array.from({ length: 5 }, (_, i) => {
        const d = new Date(mon);
        d.setDate(mon.getDate() + i);
        return d;
    });
}
function toISO(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}
const SHORT_DAY = ['Pon', 'Wt', 'Śr', 'Czw', 'Pt'];
const FULL_DAY = ['Poniedziałek', 'Wtorek', 'Środa', 'Czwartek', 'Piątek'];

// ─── API call ─────────────────────────────────────────────────────────────
async function fetchLibrusData(login, pass, weekStart = null, onlyTimetable = false) {
    const body = { login, pass };
    if (weekStart) body.weekStart = weekStart;
    if (onlyTimetable) body.onlyTimetable = onlyTimetable;

    const response = await fetch('https://librus-proxy-production.up.railway.app/librus', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Błąd autoryzacji. Sprawdź dane.');
    return data.data;
}

// ─── Attendance parser ─────────────────────────────────────────────────────
function parseAttendance(att) {
    if (!att?.summary) return { percent: 100, s1: {}, s2: {}, records: [] };

    // Zliczamy per semestr z records
    const records = (att.records || []).sort((a, b) => new Date(b.date) - new Date(a.date));

    let s1 = {}, s2 = {};
    let totalAll = 0, totalAbsent = 0;

    for (const [key, val] of Object.entries(att.summary)) {
        const k = key.toLowerCase();
        const isAbsence = k.includes('nieobecn') && !k.includes('usprawiedliwion');
        const isExcused = (k.includes('usprawiedliwion') || k.includes('zwolnien')) && !k.includes('nieuspraw');
        const isLate = k.includes('spóźni') || k.includes('spozni');
        totalAll += val;
        if (isAbsence) totalAbsent += val;
    }

    const percent = totalAll > 0 ? Math.round(((totalAll - totalAbsent) / totalAll) * 100) : 100;

    // Grupuj summary ładnie
    const grouped = {};
    for (const [key, val] of Object.entries(att.summary)) {
        grouped[key] = val;
    }

    return { percent, grouped, records, total: totalAll };
}

// ═══════════════════════════════════════════════════════════════════════
// LIBRUS API — RESEARCH NOTES (May 2026)
// ═══════════════════════════════════════════════════════════════════════
//
// PROBLEM: Old proxy (librus-proxy-production.up.railway.app) is DEAD (404).
// It was an external service — not our code.
//
// SOLUTION: Librus Synergia has a real REST API at api.librus.pl/3.0
// with 70+ endpoints. Uses OAuth2 (Resource Owner Password Grant).
// 
// How OAuth2 works:
//   POST https://api.librus.pl/OAuth/Token
//   Authorization: Basic MzU6NjM2YWI0MThjY2JlODgyYjE5YTMzZjU3N2U5NGNiNGY=
//   Body: grant_type=password&username=LOGIN&password=HASLO&librus_long_term_token=1
//   Response: { access_token: "JWT", token_type: "bearer", expires_in: 3600 }
//
// Then use: Authorization: Bearer <access_token>
//
// Key endpoints:
//   GET /Me                    — user profile
//   GET /Timetables?weekStart=YYYY-MM-DD  — schedule (WITH HOURS!)
//   GET /Grades                — grades
//   GET /Grades/Averages       — averages
//   GET /Attendances           — attendance
//   GET /SchoolNotices         — announcements
//   GET /HomeWorks             — homework
//   GET /Subjects              — subjects
//   GET /LuckyNumbers          — lucky number
//   GET /Calendars/Substitutions/... — substitutions
//
// Open-source SDKs (npm):
//   - librus-sdk (andrewkoltsov, TypeScript, Portal API 3.0 + Gateway 2.0)
//   - librus-api (Mati365, JS, ~200 stars, scraping + API, v2.15.3)
//   - py-librus-api (Python)
//
// RECOMMENDED ARCHITECTURE:
//   Frontend (React) --> Backend proxy (Node/Express) --> Librus API
//   Backend: npm install librus-sdk, create /api/librus endpoints
//   Security: backend stores token in memory, NOT saved to disk.
//   Frontend never sees the raw Librus password after initial auth.
//
// Deploy options: Railway, Render, Fly.io, VPS. Simple Node server.
// No database needed — just session/token cache (Redis optional).
// ═══════════════════════════════════════════════════════════════════════
export default function Librus() {
    const [showLogin, setShowLogin] = useState(false);
    const [loginError, setLoginError] = useState('');

    return (
        <div className="p-4 fade-in">
            <div className="text-center py-20">
                <div className="bg-yellow-500/10 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6">
                    <GraduationCap size={40} className="text-yellow-400" />
                </div>
                <h2 className="text-2xl font-bold text-white mb-3">Dziennik Librus</h2>
                <p className="text-gray-400 mb-2">Moduł w trakcie integracji</p>
                <div className="inline-block px-4 py-1.5 bg-yellow-500/20 text-yellow-400 text-sm font-bold rounded-full uppercase tracking-wider mb-6">Coming Soon</div>
                <p className="text-gray-500 text-sm max-w-md mx-auto">
                    Pracujemy nad integracją z dziennikiem Librus Synergia.
                    Będzie dostępny wkrótce. Śledź aktualności w aplikacji.
                </p>
                <div className="mt-8 p-4 bg-surface border border-gray-800 rounded-xl max-w-md mx-auto text-left text-sm text-gray-400">
                    <p className="font-bold text-white mb-2">🔧 Planowane funkcje:</p>
                    <ul className="space-y-1.5">
                        <li className="flex items-center gap-2"><span className="text-yellow-500">●</span> Podgląd ocen i frekwencji</li>
                        <li className="flex items-center gap-2"><span className="text-yellow-500">●</span> Plan lekcji na bieżący tydzień</li>
                        <li className="flex items-center gap-2"><span className="text-yellow-500">●</span> Automatyczne logowanie przez OAuth2</li>
                        <li className="flex items-center gap-2"><span className="text-yellow-500">●</span> Powiadomienia o nowych ocenach</li>
                    </ul>
                </div>
            </div>
        </div>
    );
}
