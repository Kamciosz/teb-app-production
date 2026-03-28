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
export default function Librus() {
    const [isLoggedIn, setIsLoggedIn] = useState(false);
    const [loginInput, setLoginInput] = useState('');
    const [passInput, setPassInput] = useState('');
    const [loginError, setLoginError] = useState('');
    const [activeTab, setActiveTab] = useState('oceny');
    const [isLoading, setIsLoading] = useState(false);
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [simText, setSimText] = useState('');
    const [savedLogin, setSavedLogin] = useState('');
    const [showDisclaimer, setShowDisclaimer] = useState(false);
    const [pendingCreds, setPendingCreds] = useState(null);

    // Credentials stored ONLY in memory — cleared on page close/refresh
    const credsRef = useRef(null);

    const [grades, setGrades] = useState([]);
    const [timetable, setTimetable] = useState({});
    const [attendance, setAttendance] = useState({ percent: 100, grouped: {}, records: [], total: 0 });

    // Plan lekcji – nawigacja
    const [weekOffset, setWeekOffset] = useState(0);
    const [selectedDayIdx, setSelectedDayIdx] = useState(() => {
        const d = new Date().getDay();
        return d === 0 || d === 6 ? 0 : d - 1; // weekend → poniedziałek
    });
    const weekDays = getWeekDays(weekOffset);

    // Oceny – accordion
    const [openSubject, setOpenSubject] = useState(null);

    // ── One-time cleanup: remove old localStorage credentials (security migration) ──
    useEffect(() => {
        localStorage.removeItem('librus_creds');
    }, []);

    // Automatyczne odświeżanie co 10 minut jeśli zalogowany
    useEffect(() => {
        if (!isLoggedIn) return;
        const interval = setInterval(handleRefreshBackground, 10 * 60 * 1000);
        return () => clearInterval(interval);
    }, [isLoggedIn]);

    async function handleRefreshBackground() {
        const creds = credsRef.current;
        if (!creds || isRefreshing || isLoading) return;
        
        setIsRefreshing(true);
        try {
            const weekStartIso = toISO(getWeekDays(0)[0]);
            const data = await fetchLibrusData(creds.login, creds.pass, weekStartIso);
            applyData(data, creds.login);
        } catch (err) {
            console.error('Background refresh failed:', err);
        } finally {
            setIsRefreshing(false);
        }
    }

    function applyData(data, login) {
        setSavedLogin(login);

        // OCENY – zachowaj wszystkie, sort by date
        if (data?.grades?.length > 0) {
            const sorted = [...data.grades].sort((a, b) => {
                const da = a.date ? new Date(a.date).getTime() : 0;
                const db = b.date ? new Date(b.date).getTime() : 0;
                return db - da;
            });
            setGrades(sorted.map((g, i) => ({
                id: i,
                subject: g.subject || 'Nieznany przedmiot',
                grade: g.grade || '-',
                category: g.category || 'Wpis w dzienniku',
                date: g.date || null,
                semester: g.semester || 1,
            })));
        }

        // TIMETABLE – nowy format: { "2026-03-02": [{lessonNo, time, subject, teacher, room}] }
        if (data?.timetable && typeof data.timetable === 'object') {
            setTimetable(prev => ({ ...prev, ...data.timetable }));
        }

        // FREKWENCJA
        if (data?.attendance) {
            setAttendance(parseAttendance(data.attendance));
        }

        setIsLoggedIn(true);
    }

    const handleLogin = async (e) => {
        e.preventDefault();
        if (!loginInput || !passInput) return;
        // Show disclaimer first — user must accept before credentials leave the browser
        setPendingCreds({ login: loginInput.trim(), pass: passInput });
        setShowDisclaimer(true);
    };

    const handleDisclaimerAccept = async () => {
        setShowDisclaimer(false);
        const { login: cleanLogin, pass } = pendingCreds;
        setPendingCreds(null);
        setIsLoading(true);
        setSimText('Łączę z Synergią...');
        setLoginError('');

        try {
            setTimeout(() => setSimText('Autoryzacja (może potrwać 30s)...'), 800);
            const weekStartIso = toISO(getWeekDays(0)[0]);

            let data = null;
            let attempt = 0;
            const maxAttempts = 2;

            while (attempt < maxAttempts && !data) {
                try {
                    attempt++;
                    if (attempt > 1) setSimText(`Próba ${attempt}/${maxAttempts}...`);
                    data = await fetchLibrusData(cleanLogin, pass, weekStartIso);
                } catch (err) {
                    if (attempt === maxAttempts) throw err;
                    await new Promise(r => setTimeout(r, 2000));
                }
            }

            // Store credentials only in memory (ref) — never persisted to localStorage
            credsRef.current = { login: cleanLogin, pass };
            applyData(data, cleanLogin);

            const nextWeekIso = toISO(getWeekDays(1)[0]);
            fetchLibrusData(cleanLogin, pass, nextWeekIso, true)
                .then(res => {
                    if (res?.timetable) setTimetable(prev => ({ ...prev, ...res.timetable }));
                })
                .catch(() => { });
        } catch (err) {
            console.error(err);
            setLoginError(err.message || 'Błąd połączenia z serwerem Librus. Spróbuj ponownie.');
        } finally {
            setIsLoading(false);
        }
    };

    const handleLogout = () => {
        credsRef.current = null;
        setIsLoggedIn(false);
        setGrades([]); setTimetable({}); setSavedLogin('');
        setAttendance({ percent: 100, grouped: {}, records: [], total: 0 });
    };

    const handleRefresh = async () => {
        const creds = credsRef.current;
        if (!creds) return;
        setSimText('Odświeżam...');
        setIsLoading(true);
        try {
            const weekStartIso = toISO(getWeekDays(0)[0]);
            const data = await fetchLibrusData(creds.login, creds.pass, weekStartIso);
            applyData(data, creds.login);

            const nextWeekIso = toISO(getWeekDays(1)[0]);
            fetchLibrusData(creds.login, creds.pass, nextWeekIso, true)
                .then(res => {
                    if (res?.timetable) setTimetable(prev => ({ ...prev, ...res.timetable }));
                })
                .catch(() => { });
        } catch (err) {
            setLoginError('Błąd odświeżania: ' + err.message);
        } finally {
            setIsLoading(false);
        }
    };

    // ── Grupowanie ocen po przedmiocie ────────────────────────────────
    const gradesBySubject = grades.reduce((acc, g) => {
        if (!acc[g.subject]) acc[g.subject] = [];
        acc[g.subject].push(g);
        return acc;
    }, {});

    // ── Zmiana tygodnia (fetch lazy) ──────────────────────────────────
    const handleWeekChange = async (newOffset) => {
        setWeekOffset(newOffset);
        const creds = credsRef.current;
        if (!creds) return;

        // Obliczamy datę poniedziałku docelowego tygodnia
        const mon = getWeekDays(newOffset)[0];
        const weekStartIso = toISO(mon);

        // Funkcja ładująca po cichu tydzień z wyprzedzeniem
        const preloadNext = () => {
            const nextWeekIso = toISO(getWeekDays(newOffset + 1)[0]);
            fetchLibrusData(creds.login, creds.pass, nextWeekIso, true)
                .then(res => {
                    if (res?.timetable) setTimetable(prev => ({ ...prev, ...res.timetable }));
                })
                .catch(() => { });
        };

        // Jeśli już mamy ten dzień pobrany, nie musimy odpytywać API, ale podciągnijmy następny
        if (timetable[weekStartIso] !== undefined) {
            preloadNext();
            return;
        }

        setSimText('Pobieram plany...');
        setIsLoading(true);
        try {
            const data = await fetchLibrusData(creds.login, creds.pass, weekStartIso, true);
            if (data?.timetable) {
                setTimetable(prev => ({ ...prev, ...data.timetable }));
            }
            preloadNext();
        } catch (err) {
            console.error('Błąd pobierania planu:', err);
        } finally {
            setIsLoading(false);
        }
    };

    // ── Plan lekcji dla wybranego dnia ────────────────────────────────
    const selectedDate = toISO(weekDays[selectedDayIdx]);
    const daySchedule = (() => {
        const dayData = timetable[selectedDate];
        // Nowy format HTML scrapera: prosta tablica [{lessonNo, time, subject, teacher, room}]
        if (!dayData || !Array.isArray(dayData)) return [];
        return dayData; // już gotowe dane bez potrzeby rozpakowywania slotów
    })();

    // ═══════════════ EKRANY ════════════════════════════════════════════

    // Ekran logowania
    if (!isLoggedIn) return (
        <div className="pb-10 pt-4 flex flex-col items-center">
            {/* Disclaimer modal */}
            {showDisclaimer && (
                <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
                    <div className="bg-surface border border-gray-700 rounded-2xl p-6 max-w-sm w-full shadow-2xl">
                        <div className="flex items-center gap-2 mb-3">
                            <AlertCircle className="text-yellow-400 shrink-0" size={22} />
                            <h3 className="text-white font-bold text-lg">Informacja o prywatności</h3>
                        </div>
                        <p className="text-gray-300 text-sm leading-relaxed mb-4">
                            Twoje dane logowania do Librusa (login i hasło) zostaną przesłane do serwera
                            pośredniczącego <span className="text-yellow-400 font-mono text-xs">railway.app</span> w celu
                            pobrania ocen, planu lekcji i frekwencji. Serwer ten <strong>nie jest zarządzany przez TEB</strong>.
                        </p>
                        <p className="text-gray-400 text-xs mb-5">
                            Dane nie są zapisywane na stałe — znikną po zamknięciu zakładki. Nie używaj tego
                            loginu/hasła do innych serwisów.
                        </p>
                        <div className="flex gap-3">
                            <button
                                onClick={() => { setShowDisclaimer(false); setPendingCreds(null); }}
                                className="flex-1 py-3 rounded-xl border border-gray-600 text-gray-300 text-sm font-semibold hover:bg-gray-800 transition"
                            >Anuluj</button>
                            <button
                                onClick={handleDisclaimerAccept}
                                className="flex-1 py-3 rounded-xl bg-[#e91e63] text-white text-sm font-bold shadow-md hover:bg-[#d81b60] transition"
                            >Rozumiem, kontynuuj</button>
                        </div>
                    </div>
                </div>
            )}

            <div className="text-center mb-8">
                <div className="bg-[#e91e63]/20 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4 border border-[#e91e63]/50 shadow-[0_0_20px_rgba(233,30,99,0.3)]">
                    <Lock className="text-[#e91e63]" size={36} />
                </div>
                <h2 className="text-2xl font-bold text-white mb-2">Librus Synergia</h2>
                <p className="text-gray-400 text-sm px-4">Zaloguj się kontem szkolnym. Dane logowania przechowywane tylko w pamięci przeglądarki.</p>
            </div>

            <form onSubmit={handleLogin} className="w-full max-w-sm bg-surface p-6 rounded-2xl border border-gray-800 shadow-xl relative overflow-hidden">
                {isLoading && (
                    <div className="absolute inset-0 bg-surface/95 backdrop-blur-sm z-10 flex flex-col items-center justify-center gap-3">
                        <Loader2 className="animate-spin text-[#e91e63]" size={40} />
                        <div className="text-[#e91e63] font-bold text-sm animate-pulse text-center">{simText}</div>
                    </div>
                )}
                {loginError && (
                    <div className="bg-red-500/10 border border-red-500/50 text-red-400 text-sm p-3 rounded-xl mb-4 flex items-center gap-2">
                        <AlertCircle size={16} className="shrink-0" />{loginError}
                    </div>
                )}
                <input type="text" placeholder="Login Librusa (np. 1234567u)" required autoComplete="off"
                    className="w-full p-4 rounded-xl bg-background border border-gray-700 text-white mb-4 outline-none focus:border-[#e91e63] transition"
                    value={loginInput} onChange={e => setLoginInput(e.target.value)} />
                <input type="password" placeholder="Hasło do dziennika" required
                    className="w-full p-4 rounded-xl bg-background border border-gray-700 text-white mb-6 outline-none focus:border-[#e91e63] transition"
                    value={passInput} onChange={e => setPassInput(e.target.value)} />
                <button type="submit" disabled={isLoading}
                    className="w-full bg-[#e91e63] text-white font-bold py-4 rounded-xl shadow-[0_4px_15px_rgba(233,30,99,0.4)] transition hover:bg-[#d81b60] active:scale-95 disabled:opacity-50">
                    Zaloguj & Pobierz Dane
                </button>
                <p className="mt-4 text-[10px] text-center text-gray-600 uppercase font-bold tracking-wider">🔒 Hasło tylko w pamięci — nie zapisywane lokalnie</p>
            </form>
        </div>
    );

    // ═══════════════ GŁÓWNY WIDOK ══════════════════════════════════════
    return (
        <div className="pb-20 pt-4 max-w-lg mx-auto w-full">
            {/* Header */}
            <div className="flex justify-between items-center mb-6 px-1 relative">
                <div>
                    <h2 className="text-xl font-bold text-white flex items-center gap-2">
                        <CheckCircle2 size={22} className="text-[#e91e63]" />
                        Dziennik Ucznia
                    </h2>
                    <span className="text-xs text-gray-400">Zalogowano jako: <span className="text-[#e91e63] font-semibold">{savedLogin}</span></span>
                </div>
                <div className="flex gap-2">
                    <button onClick={handleRefresh} disabled={isLoading || isRefreshing}
                        className="bg-gray-800 p-3 rounded-full text-gray-400 hover:text-white hover:bg-gray-700 transition disabled:opacity-40">
                        <RefreshCw size={18} className={isLoading || isRefreshing ? 'animate-spin' : ''} />
                    </button>
                    <button onClick={handleLogout}
                        className="bg-gray-800 p-3 rounded-full text-gray-400 hover:text-white hover:bg-gray-700 transition">
                        <LogOut size={18} />
                    </button>
                </div>

                {/* Pasek synchronizacji w tle */}
                {(isLoading || isRefreshing) && !isAutoLogging && (
                    <div className="absolute -bottom-4 left-0 w-full flex items-center gap-2 animate-in fade-in slide-in-from-top-1">
                        <div className="h-1 flex-1 bg-gray-800 rounded-full overflow-hidden">
                            <div className="h-full bg-[#e91e63] animate-progress-fast"></div>
                        </div>
                        <span className="text-[10px] text-[#e91e63] font-bold uppercase tracking-widest whitespace-nowrap animate-pulse">
                            Synchronizacja...
                        </span>
                    </div>
                )}
            </div>

            <style jsx>{`
                @keyframes progress {
                    0% { width: 0%; }
                    50% { width: 70%; }
                    100% { width: 100%; }
                }
                .animate-progress-fast {
                    animation: progress 2s ease-in-out infinite;
                }
            `}</style>

            {/* Zakładki */}
            <div className="flex bg-surface rounded-xl p-1.5 mb-6 border border-gray-800 shadow-lg gap-1">
                {[
                    { id: 'oceny', label: 'Oceny', icon: BookOpen },
                    { id: 'plan', label: 'Plan', icon: Calendar },
                    { id: 'frekwencja', label: 'Frekwencja', icon: PieChart },
                ].map(tab => (
                    <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                        className={`flex-1 py-3 px-1 text-[13px] font-bold rounded-lg flex items-center justify-center gap-1.5 transition ${activeTab === tab.id ? 'bg-[#e91e63] text-white shadow-md' : 'text-gray-400 hover:text-white hover:bg-gray-800'}`}>
                        <tab.icon size={15} /> {tab.label}
                    </button>
                ))}
            </div>

            {/* ━━━━━ OCENY ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
            {activeTab === 'oceny' && (
                <div className="space-y-2 animate-in fade-in duration-300">
                    <h4 className="font-bold text-gray-400 pl-1 text-xs uppercase tracking-wider mb-3">
                        Wszystkie oceny ({grades.length}) — pogrupowane wg. przedmiotu
                    </h4>
                    {Object.entries(gradesBySubject).map(([subject, gs]) => {
                        const isOpen = openSubject === subject;
                        const latest = gs[0];
                        return (
                            <div key={subject} className="bg-surface border border-gray-800 rounded-xl overflow-hidden">
                                <button
                                    onClick={() => setOpenSubject(isOpen ? null : subject)}
                                    className="w-full px-4 py-3.5 flex items-center justify-between hover:bg-white/[0.03] transition">
                                    <div className="flex items-center gap-3 text-left">
                                        <div className="w-1 h-8 rounded-full bg-[#e91e63]/60 shrink-0" />
                                        <div>
                                            <div className="font-bold text-white text-[14px]">{subject}</div>
                                            <div className="text-[11px] text-gray-500">{gs.length} ocen{gs.length === 1 ? 'a' : gs.length < 5 ? 'y' : ''}</div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0">
                                        <span className="text-[22px] font-black text-[#e91e63]">{latest.grade}</span>
                                        <span className={`text-gray-500 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}>▾</span>
                                    </div>
                                </button>
                                {isOpen && (
                                    <div className="border-t border-gray-800 divide-y divide-gray-800/50">
                                        {gs.map((g, idx) => (
                                            <div key={idx} className="px-4 py-3 flex items-center justify-between">
                                                <div className="flex-1 min-w-0 pr-3">
                                                    <div className="text-[13px] text-gray-300 truncate">{g.category}</div>
                                                    {g.date && (
                                                        <div className="text-[11px] text-gray-600 mt-0.5">
                                                            {new Date(g.date).toLocaleDateString('pl-PL', { day: '2-digit', month: 'short', year: 'numeric' })}
                                                            <span className="ml-2 text-gray-700">Semestr {g.semester}</span>
                                                        </div>
                                                    )}
                                                </div>
                                                <span className="text-[20px] font-black text-[#e91e63] shrink-0">{g.grade}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                    {grades.length === 0 && (
                        <div className="text-center text-gray-500 py-16">
                            <BookOpen size={48} className="mx-auto mb-4 text-gray-800" />
                            Brak ocen w systemie.
                        </div>
                    )}
                </div>
            )}

            {/* ━━━━━ PLAN LEKCJI ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
            {activeTab === 'plan' && (
                <div className="animate-in fade-in duration-300">
                    {/* Nawigacja tygodnia */}
                    <div className="flex items-center justify-between mb-3">
                        <button onClick={() => handleWeekChange(weekOffset - 1)}
                            className="bg-gray-800 p-2 rounded-xl text-gray-400 hover:text-white transition">
                            <ChevronLeft size={20} />
                        </button>
                        <span className="text-sm font-bold text-gray-300">
                            {weekOffset === 0 ? 'Bieżący tydzień' : weekOffset === 1 ? 'Następny tydzień' : weekOffset === -1 ? 'Poprzedni tydzień' : `${weekOffset > 0 ? '+' : ''}${weekOffset} tyg.`}
                        </span>
                        <button onClick={() => handleWeekChange(weekOffset + 1)}
                            className="bg-gray-800 p-2 rounded-xl text-gray-400 hover:text-white transition">
                            <ChevronRight size={20} />
                        </button>
                    </div>

                    {/* Selektor dni */}
                    <div className="flex gap-1.5 mb-4">
                        {weekDays.map((d, i) => {
                            const iso = toISO(d);
                            const hasPlan = timetable[iso] && Array.isArray(timetable[iso]) && timetable[iso].length > 0;
                            const isToday = iso === toISO(new Date());
                            return (
                                <button key={i} onClick={() => setSelectedDayIdx(i)}
                                    className={`flex-1 py-2 rounded-xl text-center transition flex flex-col items-center gap-0.5 border ${selectedDayIdx === i ? 'bg-[#e91e63] border-[#e91e63] text-white' : isToday ? 'border-[#e91e63]/40 bg-[#e91e63]/10 text-[#e91e63]' : 'border-gray-800 bg-surface text-gray-400 hover:text-white hover:bg-gray-800'}`}>
                                    <span className="text-[11px] font-bold">{SHORT_DAY[i]}</span>
                                    <span className="text-[13px] font-black">{d.getDate()}</span>
                                    {hasPlan && <div className={`w-1.5 h-1.5 rounded-full ${selectedDayIdx === i ? 'bg-white' : 'bg-[#e91e63]'}`} />}
                                </button>
                            );
                        })}
                    </div>

                    {/* Lista lekcji */}
                    <div className="bg-surface border border-gray-800 rounded-xl overflow-hidden">
                        <div className="bg-background border-b border-gray-800 px-4 py-3 flex items-center justify-between">
                            <span className="font-bold text-white flex items-center gap-2">
                                <Calendar size={16} className="text-[#e91e63]" />
                                {FULL_DAY[selectedDayIdx]}, {weekDays[selectedDayIdx].toLocaleDateString('pl-PL', { day: '2-digit', month: 'long' })}
                            </span>
                            <span className="text-xs text-gray-500">{daySchedule.length} lekcji</span>
                        </div>
                        <div className="divide-y divide-gray-800/50">
                            {daySchedule.length === 0 ? (
                                <div className="p-10 flex flex-col items-center text-center text-gray-500 text-sm gap-3">
                                    <Calendar size={40} className="text-gray-800" />
                                    <p>Brak zajęć tego dnia.<br /><span className="text-gray-600 text-xs">Wybierz inny dzień lub tydzień.</span></p>
                                </div>
                            ) : daySchedule.map((lesson, idx) => (
                                <div key={idx} className={`p-4 flex items-start gap-3 transition ${lesson.isCancelled ? 'opacity-40' : 'hover:bg-white/[0.02]'}`}>
                                    {/* Numer lekcji */}
                                    <div className="w-6 shrink-0 pt-0.5 text-center">
                                        <span className="text-[11px] font-black text-gray-600">#{lesson.lessonNo}</span>
                                    </div>
                                    {/* Godziny */}
                                    <div className="w-14 shrink-0 text-center">
                                        <div className="text-xs font-bold text-[#e91e63]">{lesson.time?.split('–')[0]?.trim()}</div>
                                        <div className="text-[10px] text-gray-600">{lesson.time?.split('–')[1]?.trim()}</div>
                                    </div>
                                    <div className="w-px self-stretch bg-gray-800 shrink-0" />
                                    <div className="flex-1 min-w-0">
                                        <div className={`font-bold text-sm leading-snug ${lesson.isCancelled ? 'line-through text-gray-500' : 'text-white'}`}>{lesson.subject}</div>
                                        <div className="flex flex-wrap items-center gap-1.5 mt-1">
                                            {lesson.teacher && <span className="text-[11px] text-gray-400">{lesson.teacher}</span>}
                                            {lesson.teacher && lesson.room && <span className="text-gray-700 text-[10px]">•</span>}
                                            {lesson.room && <span className="text-[11px] text-[#e91e63] font-semibold">{lesson.room}</span>}
                                            {lesson.isSubstitution && <span className="text-[10px] bg-yellow-500/20 text-yellow-400 px-1.5 py-0.5 rounded font-bold">Zastępstwo</span>}
                                            {lesson.isCancelled && <span className="text-[10px] bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded font-bold">Odwołane</span>}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* ━━━━━ FREKWENCJA ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ */}
            {activeTab === 'frekwencja' && (
                <div className="animate-in fade-in duration-300">
                    <div className="bg-surface border border-gray-800 rounded-xl p-6">
                        <h4 className="font-bold text-white mb-6 flex items-center gap-2">
                            <PieChart size={20} className="text-[#e91e63]" /> Frekwencja roczna
                        </h4>

                        {/* Kółko */}
                        <div className="flex flex-col items-center justify-center mb-8 relative">
                            <svg viewBox="0 0 36 36" className="w-40 h-40 drop-shadow-[0_0_15px_rgba(233,30,99,0.25)]">
                                <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="#1f2937" strokeWidth="2.5" />
                                <path strokeDasharray={`${attendance.percent}, 100`}
                                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                                    fill="none" stroke="#e91e63" strokeWidth="3" strokeLinecap="round" />
                            </svg>
                            <div className="absolute inset-0 flex flex-col items-center justify-center">
                                <span className="text-[38px] font-black text-white">{attendance.percent}%</span>
                                <span className="text-[10px] text-[#e91e63] uppercase font-bold tracking-widest">Obecność</span>
                            </div>
                        </div>

                        {/* 4 liczniki z typów frekwencji */}
                        <div className="grid grid-cols-2 gap-3">
                            {Object.entries(attendance.grouped || {}).map(([type, count]) => {
                                const k = type.toLowerCase();
                                const isAbsent = k.includes('nieobecn') && !k.includes('uspr');
                                const isExcused = k.includes('uspr') || k.includes('zwolnien');
                                const isLate = k.includes('spóźni') || k.includes('spozni');
                                const color = isAbsent ? 'text-red-400 border-red-400/20'
                                    : isExcused ? 'text-blue-400 border-blue-400/20'
                                        : isLate ? 'text-yellow-400 border-yellow-400/20'
                                            : 'text-green-400 border-green-400/20';
                                const bg = isAbsent ? 'bg-red-400/5' : isExcused ? 'bg-blue-400/5' : isLate ? 'bg-yellow-400/5' : 'bg-green-400/5';
                                return (
                                    <div key={type} className={`rounded-xl p-4 border ${color} ${bg} text-center`}>
                                        <div className={`text-3xl font-black mb-1 ${color.split(' ')[0]}`}>{count}</div>
                                        <div className="text-[11px] font-bold text-gray-400 leading-tight">{type}</div>
                                    </div>
                                );
                            })}
                        </div>

                        <div className="mt-4 text-[11px] text-gray-600 text-center">
                            Razem: {attendance.total || 0} godzin lekcyjnych w roku szkolnym
                        </div>

                        {/* Szczegółowy wykaz nieobecności - płaska lista chronologiczna */}
                        {(() => {
                            const flatRecords = { 1: [], 2: [] };
                            let hasAbsences = false;

                            if (attendance.records) {
                                attendance.records.forEach(r => {
                                    const k = (r.type || '').toLowerCase();
                                    const isPresence = k.includes('obecność') && !k.includes('nieobecn');
                                    if (isPresence) return;

                                    const isAbsent = k.includes('nieobecn') && !k.includes('uspr');
                                    const isExcused = (k.includes('uspr') || k.includes('zwolnien')) && !k.includes('nieuspraw');
                                    const isLate = k.includes('spóźni') || k.includes('spozni');

                                    let mappedType = '';
                                    let dotColor = '';
                                    let textColor = '';
                                    if (isAbsent) {
                                        mappedType = 'Nieobecny';
                                        dotColor = 'bg-red-400';
                                        textColor = 'text-red-400';
                                    }
                                    else if (isExcused) {
                                        mappedType = 'Nieobec. usprawiedliwiona';
                                        dotColor = 'bg-blue-400';
                                        textColor = 'text-blue-400';
                                    }
                                    else if (isLate) {
                                        mappedType = 'Spóźnienie';
                                        dotColor = 'bg-yellow-400';
                                        textColor = 'text-yellow-400';
                                    }
                                    else return;

                                    const sem = r.semester || 1;
                                    flatRecords[sem].push({
                                        date: r.date,
                                        lessonNo: r.lessonNo || '?',
                                        subject: r.subject || 'Nieznany przedmiot',
                                        type: mappedType,
                                        dotColor: dotColor,
                                        textColor: textColor
                                    });
                                    hasAbsences = true;
                                });
                            }

                            if (!hasAbsences) return null;

                            // Sortowanie po dacie i numerze lekcji (od najnowszych)
                            const sortByDateDesc = (a, b) => {
                                const diff = new Date(b.date) - new Date(a.date);
                                if (diff !== 0) return diff;
                                const lA = parseInt(a.lessonNo) || 0;
                                const lB = parseInt(b.lessonNo) || 0;
                                return lB - lA;
                            };
                            flatRecords[1].sort(sortByDateDesc);
                            flatRecords[2].sort(sortByDateDesc);

                            return (
                                <div className="mt-8 border-t border-gray-800 pt-6">
                                    <h5 className="font-bold text-gray-300 mb-6 text-sm flex items-center gap-2">
                                        <Clock size={16} className="text-[#e91e63]" /> Szczegóły nieobecności
                                    </h5>
                                    <div className="flex flex-col gap-6">
                                        {[2, 1].map(sem => {
                                            const records = flatRecords[sem];
                                            if (records.length === 0) return null;

                                            return (
                                                <div key={sem} className="bg-[#111] border border-gray-800 rounded-xl overflow-hidden">
                                                    <div className="bg-gray-800/50 px-4 py-2 border-b border-gray-800">
                                                        <span className="text-xs font-black tracking-widest text-[#e91e63] uppercase">
                                                            Semestr {sem}
                                                        </span>
                                                    </div>
                                                    <div className="divide-y divide-gray-800/50">
                                                        {records.map((r, idx) => (
                                                            <div key={idx} className="p-4 flex items-start gap-3 hover:bg-white/[0.02] transition">
                                                                <div className={`mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 ${r.dotColor}`} />
                                                                <div className="flex-1 min-w-0">
                                                                    <div className="text-[13px] text-gray-200 leading-snug">
                                                                        <span className={`font-bold ${r.textColor}`}>{r.type.toLowerCase()}</span>
                                                                        {' '}dnia <span className="text-white font-medium">{r.date}</span>;
                                                                        {' '}godzina lekcyjna <span className="text-white font-medium">{r.lessonNo}</span>;
                                                                        {' '}przedmiot: <span className="text-gray-400">{r.subject}</span>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            );
                        })()}
                    </div>
                </div>
            )}
        </div>
    );
}
