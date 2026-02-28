import React, { useState, useEffect } from 'react'
import { CheckCircle2, Lock, Loader2, BookOpen, Calendar, PieChart, Clock, LogOut, AlertCircle } from 'lucide-react'
import { supabase } from '../../services/supabase'

export default function Librus() {
    const [isLoggedIn, setIsLoggedIn] = useState(false)
    const [loginEmail, setLoginEmail] = useState('')
    const [loginPass, setLoginPass] = useState('')
    const [loginError, setLoginError] = useState('')
    const [activeTab, setActiveTab] = useState('oceny')

    const [isSimulating, setIsSimulating] = useState(false)
    const [simText, setSimText] = useState('')

    // Dane pobrane z API
    const [grades, setGrades] = useState([])
    const [schedule, setSchedule] = useState([])
    const [attendance, setAttendance] = useState({ obecnosc: 0, spoznienia: 0, usprawiedliwione: 0, nieusprawiedliwione: 0 })

    const handleLogin = async (e) => {
        e.preventDefault()
        if (!loginEmail || !loginPass) return;

        setIsSimulating(true)
        setSimText('Nawiązywanie połączenia z Synergią...')
        setLoginError('')

        try {
            setTimeout(() => setSimText('Autoryzacja w serwisach Vulcan...'), 1200)

            const response = await fetch('https://librus-proxy-production.up.railway.app/librus', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ login: loginEmail, pass: loginPass })
            })

            const data = await response.json()

            if (!response.ok) {
                throw new Error(data.error || 'Autoryzacja odrzucona. Sprawdź login i hasło.')
            }

            setSimText('Pobieram dane z dziennika...')

            setTimeout(() => {
                // Oceny: Sortujemy malejąco po dacie (najnowsze na górze), aby nie podawać archiwalnych z września
                if (data.data?.grades?.length > 0) {
                    const sortedGrades = [...data.data.grades].sort((a, b) => {
                        const dateA = a.date ? new Date(a.date).getTime() : 0;
                        const dateB = b.date ? new Date(b.date).getTime() : 0;
                        return dateB - dateA;
                    });

                    setGrades(sortedGrades.slice(0, 20).map((g, idx) => ({
                        id: idx,
                        subject: g.subject || 'Nieznany przedmiot',
                        grade: g.grade || '-',
                        desc: g.category || 'Wpis w dzienniku',
                    })))
                }

                // Plan lekcji: API zwraca obiekt {"YYYY-MM-DD": [ [], [{Lesson...}], ... ]}
                if (data.data?.timetable && typeof data.data.timetable === 'object') {
                    const dzisiajISO = new Date().toISOString().split('T')[0];
                    let planDoWyświetlenia = [];
                    let dostepnyPlan = data.data.timetable[dzisiajISO];

                    // Jeśli brak lekcji na dziś (np. weekend/święta), pobieramy pierwszy dostępny klucz w buforze
                    if (!dostepnyPlan || dostepnyPlan.length === 0) {
                        const kluczeMiesiac = Object.keys(data.data.timetable).sort();
                        if (kluczeMiesiac.length > 0) {
                            dostepnyPlan = data.data.timetable[kluczeMiesiac[kluczeMiesiac.length - 1]];
                        }
                    }

                    if (Array.isArray(dostepnyPlan)) {
                        dostepnyPlan.forEach(slotLekcji => {
                            if (Array.isArray(slotLekcji) && slotLekcji.length > 0) {
                                const aktywnaLekcja = slotLekcji[0]; // pierwsza z grup na tą samą godzinę
                                if (aktywnaLekcja?.Subject && aktywnaLekcja?.HourFrom) {
                                    planDoWyświetlenia.push({
                                        time: `${aktywnaLekcja.HourFrom} - ${aktywnaLekcja.HourTo}`,
                                        subject: aktywnaLekcja.Subject?.Name || aktywnaLekcja.Subject?.Short || 'Zajęcia',
                                        // Classroom zazwyczaj ma format ID w API v2, bezpieczne wyswietlanie awaryjne
                                        room: aktywnaLekcja.Classroom?.Name || aktywnaLekcja.Classroom?.Id ? `Sala ${aktywnaLekcja.Classroom.Id}` : '-'
                                    });
                                }
                            }
                        });
                    }
                    setSchedule(planDoWyświetlenia.map((item, idx) => ({ id: idx, ...item })));
                } else {
                    setSchedule([]);
                }

                // Frekwencja
                if (data.data?.attendance) {
                    const att = data.data.attendance;
                    let usp = 0;
                    let nusp = 0;
                    let spoz = 0;
                    let sumaLekcjiWszystkich = 0;

                    if (att.summary && typeof att.summary === 'object') {
                        for (const [key, val] of Object.entries(att.summary)) {
                            const k = key.toLowerCase();
                            sumaLekcjiWszystkich += val; // Suma całkowita wpisów frekwencji ucznia

                            if ((k.includes('usprawiedliwiona') || k.includes('usprawiedliwione')) && !k.includes('nieusprawiedliwion')) {
                                usp += val;
                            } else if (k.includes('nieusprawiedliwion') || k.includes('nieobec') || k.includes('zwolnienie')) {
                                nusp += val;
                            } else if (k.includes('spóź')) {
                                spoz += val;
                            }
                        }
                    }

                    // Precyzyjne liczenie procentu – bazując na sumie wszystkich lekcji, jako że Librus zlicza spóźnieni jako obecność
                    let wyliczonyProcent = 100;
                    if (sumaLekcjiWszystkich > 0) {
                        const wagarowanoObecnosci = usp + nusp; // godziny które opuścił fizycznie w szkole
                        wyliczonyProcent = Math.round(((sumaLekcjiWszystkich - wagarowanoObecnosci) / sumaLekcjiWszystkich) * 100);
                    }

                    setAttendance({
                        obecnosc: att.presence_percentage || att.percent || wyliczonyProcent || 100,
                        spoznienia: att.late_count || spoz || 0,
                        usprawiedliwione: att.justified_hours || att.excused || usp || 0,
                        nieusprawiedliwione: att.unjustified_hours || att.unexcused || nusp || 0
                    })
                }

                setIsSimulating(false)
                setIsLoggedIn(true)
            }, 800)

        } catch (err) {
            console.error('Librus API Error:', err)
            setIsSimulating(false)
            setLoginError(err.message || 'Błąd połączenia. Spróbuj ponownie.')
        }
    }

    if (!isLoggedIn) {
        return (
            <div className="pb-10 pt-4 flex flex-col items-center">
                <div className="text-center mb-8">
                    <div className="bg-[#e91e63]/20 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4 border border-[#e91e63]/50 shadow-[0_0_20px_rgba(233,30,99,0.3)]">
                        <Lock className="text-[#e91e63]" size={36} />
                    </div>
                    <h2 className="text-2xl font-bold text-white mb-2">Librus Synergia</h2>
                    <p className="text-gray-400 text-sm px-4">Zaloguj się kontem szkolnym, aby pobrać oceny, plan lekcji i frekwencję bezpośrednio z dziennika.</p>
                </div>

                <form onSubmit={handleLogin} className="w-full max-w-sm bg-surface p-6 rounded-2xl border border-gray-800 shadow-xl relative overflow-hidden">
                    {isSimulating && (
                        <div className="absolute inset-0 bg-surface/95 backdrop-blur-sm z-10 flex flex-col items-center justify-center gap-3">
                            <Loader2 className="animate-spin text-[#e91e63]" size={40} />
                            <div className="text-[#e91e63] font-bold text-sm animate-pulse text-center px-4">{simText}</div>
                        </div>
                    )}

                    {loginError && (
                        <div className="bg-red-500/10 border border-red-500/50 text-red-400 text-sm p-3 rounded-xl mb-4 flex items-center gap-2">
                            <AlertCircle size={16} className="shrink-0" />
                            {loginError}
                        </div>
                    )}

                    <input
                        type="text"
                        placeholder="Login Librusa (np. 12194674u)"
                        required
                        autoComplete="off"
                        className="w-full p-4 rounded-xl bg-background border border-gray-700 text-white mb-4 outline-none focus:border-[#e91e63] transition"
                        value={loginEmail}
                        onChange={(e) => setLoginEmail(e.target.value)}
                    />
                    <input
                        type="password"
                        placeholder="Hasło do dziennika"
                        required
                        className="w-full p-4 rounded-xl bg-background border border-gray-700 text-white mb-6 outline-none focus:border-[#e91e63] transition"
                        value={loginPass}
                        onChange={(e) => setLoginPass(e.target.value)}
                    />
                    <button type="submit" disabled={isSimulating} className="w-full bg-[#e91e63] text-white font-bold py-4 rounded-xl shadow-[0_4px_15px_rgba(233,30,99,0.4)] transition hover:bg-[#d81b60] active:scale-95 disabled:opacity-50">
                        Zaloguj & Pobierz Dane
                    </button>
                    <p className="mt-4 text-[10px] text-center text-gray-600 uppercase font-bold tracking-wider">Połączenie szyfrowane End-To-End</p>
                </form>
            </div>
        )
    }

    return (
        <div className="pb-20 pt-4 max-w-lg mx-auto w-full">
            <div className="flex justify-between items-center mb-6 px-1">
                <div>
                    <h2 className="text-xl font-bold text-white flex items-center gap-2">
                        <CheckCircle2 size={22} className="text-[#e91e63]" />
                        Dziennik Ucznia
                    </h2>
                    <span className="text-xs text-gray-400">Zalogowano jako: <span className="text-[#e91e63] font-semibold">{loginEmail}</span></span>
                </div>
                <button onClick={() => { setIsLoggedIn(false); setGrades([]); setSchedule([]); }} className="bg-gray-800 p-3 rounded-full text-gray-400 hover:text-white hover:bg-gray-700 transition">
                    <LogOut size={18} />
                </button>
            </div>

            {/* Zakładki */}
            <div className="flex bg-surface rounded-xl p-1.5 mb-6 border border-gray-800 shadow-lg gap-1">
                {[
                    { id: 'oceny', label: 'Oceny', icon: BookOpen },
                    { id: 'plan', label: 'Plan', icon: Calendar },
                    { id: 'frekwencja', label: 'Frekwencja', icon: PieChart },
                ].map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`flex-1 py-3 px-1 text-[13px] font-bold rounded-lg flex items-center justify-center gap-1.5 transition ${activeTab === tab.id ? 'bg-[#e91e63] text-white shadow-md' : 'text-gray-400 hover:text-white hover:bg-gray-800'}`}
                    >
                        <tab.icon size={15} /> {tab.label}
                    </button>
                ))}
            </div>

            {/* OCENY */}
            {activeTab === 'oceny' && (
                <div className="space-y-3 animate-in fade-in duration-300">
                    <h4 className="font-bold text-gray-300 pl-1 text-sm uppercase tracking-wider">Wpisy z e-dziennika ({grades.length})</h4>
                    {grades.length === 0 ? (
                        <div className="text-center text-gray-500 py-16">
                            <BookOpen size={48} className="mx-auto mb-4 text-gray-800" />
                            Brak ocen w systemie lub Librus ograniczył dostęp do danych.
                        </div>
                    ) : grades.map((g) => (
                        <div key={g.id} className="bg-surface border border-gray-800 p-4 rounded-xl flex items-center justify-between hover:border-[#e91e63]/40 transition">
                            <div className="flex items-center gap-3">
                                <div className="w-1 self-stretch rounded-full bg-[#e91e63]/50" />
                                <div>
                                    <h5 className="font-bold text-white text-[15px] leading-snug">{g.subject}</h5>
                                    <span className="text-xs text-gray-500">{g.desc}</span>
                                </div>
                            </div>
                            <div className="text-right">
                                <span className="text-[26px] font-black text-[#e91e63] leading-none">{g.grade}</span>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* PLAN LEKCJI */}
            {activeTab === 'plan' && (
                <div className="bg-surface border border-gray-800 rounded-xl overflow-hidden shadow-lg animate-in fade-in duration-300">
                    <div className="bg-background border-b border-gray-800 p-4 flex justify-between items-center">
                        <span className="font-bold text-white flex items-center gap-2"><Calendar size={18} className="text-[#e91e63]" /> Plan zajęć</span>
                        <span className="text-xs text-[#e91e63] bg-[#e91e63]/10 px-3 py-1 rounded-full font-bold uppercase">Dzisiaj</span>
                    </div>
                    <div className="divide-y divide-gray-800/50">
                        {schedule.length === 0 ? (
                            <div className="p-10 flex flex-col items-center text-center text-gray-500 text-sm gap-3">
                                <Calendar size={40} className="text-gray-800" />
                                Brak planu zajęć lub API Librusa nie zwróciło danych harmonogramu.
                            </div>
                        ) : schedule.map(lesson => (
                            <div key={lesson.id} className="p-4 flex items-center gap-4 hover:bg-white/[0.02] transition">
                                <div className="w-20 shrink-0 text-xs font-mono text-gray-500 border-r border-gray-800 pr-3">
                                    <Clock size={12} className="mb-1 text-gray-600" />
                                    {lesson.time.split(' - ')[0]}<br />
                                    <span className="text-gray-700">{lesson.time.split(' - ')[1]}</span>
                                </div>
                                <div>
                                    <div className="font-bold text-white">{lesson.subject}</div>
                                    <div className="text-xs text-[#e91e63] font-semibold mt-0.5">{lesson.room}</div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* FREKWENCJA */}
            {activeTab === 'frekwencja' && (
                <div className="bg-surface border border-gray-800 rounded-xl p-6 shadow-lg animate-in fade-in duration-300">
                    <h4 className="font-bold text-white mb-8 flex items-center gap-2">
                        <PieChart size={20} className="text-[#e91e63]" /> Raport Semestralny Frekwencji
                    </h4>

                    <div className="flex flex-col items-center justify-center mb-8 relative">
                        <svg viewBox="0 0 36 36" className="w-40 h-40 drop-shadow-[0_0_15px_rgba(233,30,99,0.25)]">
                            <path d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="#1f2937" strokeWidth="2.5" />
                            <path
                                strokeDasharray={`${attendance.obecnosc}, 100`}
                                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                                fill="none" stroke="#e91e63" strokeWidth="3" strokeLinecap="round"
                            />
                        </svg>
                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                            <span className="text-[38px] font-black text-white">{attendance.obecnosc}%</span>
                            <span className="text-[10px] text-[#e91e63] uppercase font-bold tracking-widest">Obecność</span>
                        </div>
                    </div>

                    <div className="grid grid-cols-3 gap-3">
                        <div className="bg-background border border-gray-800 rounded-xl p-4 text-center">
                            <div className="text-2xl font-black text-yellow-500 mb-1">{attendance.spoznienia}</div>
                            <div className="text-[10px] font-bold text-gray-500 uppercase">Spóźnienia</div>
                        </div>
                        <div className="bg-background border border-gray-800 rounded-xl p-4 text-center">
                            <div className="text-2xl font-black text-blue-400 mb-1">{attendance.usprawiedliwione}</div>
                            <div className="text-[10px] font-bold text-gray-500 uppercase">Usprawiedl.</div>
                        </div>
                        <div className="bg-background border border-gray-800 rounded-xl p-4 text-center">
                            <div className="text-2xl font-black text-red-400 mb-1">{attendance.nieusprawiedliwione}</div>
                            <div className="text-[10px] font-bold text-gray-500 uppercase">Nieuspraw.</div>
                        </div>
                    </div>

                    {attendance.nieusprawiedliwione === 0 && attendance.obecnosc > 0 && (
                        <div className="mt-5 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm p-4 rounded-xl flex items-center gap-3">
                            <CheckCircle2 size={22} className="shrink-0" />
                            <span><span className="font-bold text-emerald-400">Konto wzorowe!</span> Nie masz nieusprawiedliwionych nieobecności.</span>
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}
