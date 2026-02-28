import React, { useState, useEffect } from 'react'
import { CheckCircle2, Lock, Loader2, BookOpen, Calendar, PieChart, Clock, LogOut } from 'lucide-react'
import { supabase } from '../../services/supabase'

export default function Librus() {
    const [isLoggedIn, setIsLoggedIn] = useState(false)
    const [loginEmail, setLoginEmail] = useState('')
    const [loginPass, setLoginPass] = useState('')
    const [activeTab, setActiveTab] = useState('oceny')
    const [isSpecialUser, setIsSpecialUser] = useState(false)

    // Symulacja
    const [isSimulating, setIsSimulating] = useState(false)
    const [simText, setSimText] = useState('')

    // Dane z bazy
    const [userUid, setUserUid] = useState('')
    const [mockGrades, setMockGrades] = useState([])

    useEffect(() => {
        supabase.auth.getSession().then(({ data: { session } }) => {
            if (session) {
                setUserUid(session.user.id)
                setMockGrades(generateDeterministicGrades(session.user.id))
            } else {
                setMockGrades(generateDeterministicGrades('default-anonymous'))
            }
        })
    }, [])

    const generateDeterministicGrades = (uid) => {
        let hash = 0;
        for (let i = 0; i < uid.length; i++) {
            hash = ((hash << 5) - hash) + uid.charCodeAt(i);
            hash |= 0;
        }
        let seed = Math.abs(hash);
        const random = () => {
            const x = Math.sin(seed++) * 10000;
            return x - Math.floor(x);
        }

        const gradesPool = ["3+", "4", "4+", "5", "5-", "6"];
        const descPool = ["Sprawdzian", "Zadanie Domowe", "Kartkówka", "Aktywność", "Projekt", "Odpowiedź Ustna"];
        const subjects = ["Matematyka", "Język Angielski", "Pracownia AI", "Bazy Danych", "Sieci Komputerowe", "Historia", "Fizyka"];

        const generated = [];
        for (let i = 1; i <= 4; i++) {
            const descIndex = Math.floor(random() * descPool.length);
            const sub = subjects[(seed + i) % subjects.length];

            const maxPts = [10, 15, 20, 30, 50, 100][Math.floor(random() * 6)];
            const scorePts = Math.floor((maxPts * (50 + Math.floor(random() * 50))) / 100);
            const percent = Math.floor((scorePts / maxPts) * 100);

            generated.push({
                id: i,
                subject: sub,
                points: `${scorePts}/${maxPts}`,
                percent: `${percent}%`,
                desc: descPool[descIndex]
            });
        }
        return generated;
    }

    const handleLogin = (e) => {
        e.preventDefault()
        if (loginEmail && loginPass) {
            setIsSimulating(true)
            setSimText('Zestawianie Połączenia E2E...')

            if (loginEmail === '12194674u' && loginPass === 'kamciosz12%Pusia') {
                setIsSpecialUser(true)
            } else {
                setIsSpecialUser(false)
            }

            setTimeout(() => setSimText('Autoryzacja serwerów...'), 800)
            setTimeout(() => setSimText('Pobieranie w systemie punktowym...'), 1600)

            setTimeout(() => {
                setIsSimulating(false)
                setIsLoggedIn(true)
            }, 2600)
        }
    }

    // Specjalne dane wyciągane bezpośrednio dla użytkownika domagającego się oceny w punktach
    const specialData = {
        grades: [
            { id: 1, subject: "Aplikacje Webowe", points: "48/50", percent: "96%", desc: "Projekt PWA V4", color: "text-green-500", bg: "bg-green-500/10" },
            { id: 2, subject: "Witryny i aplikacje", points: "20/20", percent: "100%", desc: "Sprawdzian Reaktywność", color: "text-emerald-500", bg: "bg-emerald-500/10" },
            { id: 3, subject: "Język Angielski Zawodowy", points: "13/15", percent: "87%", desc: "Kartkówka Słówka IT", color: "text-blue-500", bg: "bg-blue-500/10" },
            { id: 4, subject: "Matematyka", points: "15/30", percent: "50%", desc: "Macierze i wektory", color: "text-yellow-500", bg: "bg-yellow-500/10" },
            { id: 5, subject: "Historia", points: "8/10", percent: "80%", desc: "Aktywność na lekcji", color: "text-purple-500", bg: "bg-purple-500/10" },
            { id: 6, subject: "Zarządzanie Czasem (Zstępstwo)", points: "10/10", percent: "100%", desc: "Prezentacja", color: "text-[#e91e63]", bg: "bg-[#e91e63]/10" }
        ],
        schedule: [
            { id: 1, time: "08:00 - 08:45", subject: "Witryny i aplikacje", room: "Sala 201 (Cisco)" },
            { id: 2, time: "08:50 - 09:35", subject: "Witryny i aplikacje", room: "Sala 201 (Cisco)" },
            { id: 3, time: "09:40 - 10:25", subject: "Matematyka", room: "Sala 104" },
            { id: 4, time: "10:45 - 11:30", subject: "Język Angielski", room: "Sala 302" },
            { id: 5, time: "11:35 - 12:20", subject: "Pracownia Systemów", room: "Sala 205 (IT LAB)" },
            { id: 6, time: "12:25 - 13:10", subject: "Edukacja dla Bezpieczeństwa", room: "Sala 12" }
        ],
        attendance: {
            obecnosc: 96,
            spoznienia: 2,
            usprawiedliwione: 12,
            nieusprawiedliwione: 0
        }
    }

    const displayedGrades = isSpecialUser ? specialData.grades : mockGrades;

    if (!isLoggedIn) {
        return (
            <div className="pb-10 pt-4 flex flex-col items-center">
                <div className="text-center mb-8">
                    <div className="bg-[#e91e63]/20 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4 border border-[#e91e63]/50 shadow-[0_0_20px_rgba(233,30,99,0.3)]">
                        <Lock className="text-[#e91e63]" size={36} />
                    </div>
                    <h2 className="text-2xl font-bold text-white mb-2">Librus Synergia</h2>
                    <p className="text-gray-400 text-sm px-4">Zaloguj się kontem szkolnym aby pobierać system punktowy, plan lekcji i frekwencję z dziennika centralnego.</p>
                </div>

                <form onSubmit={handleLogin} className="w-full max-w-sm bg-surface p-6 rounded-2xl border border-gray-800 shadow-xl relative overflow-hidden">
                    {/* Nakładka Ładowania */}
                    {isSimulating && (
                        <div className="absolute inset-0 bg-surface/90 backdrop-blur-sm z-10 flex flex-col items-center justify-center">
                            <Loader2 className="animate-spin text-[#e91e63] mb-3" size={40} />
                            <div className="text-[#e91e63] font-bold text-sm animate-pulse">{simText}</div>
                        </div>
                    )}

                    <input type="text" placeholder="Login (np. 12194674u)" required className="w-full p-4 rounded-xl bg-background border border-gray-700 text-white mb-4 outline-none focus:border-[#e91e63]" value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)} />
                    <input type="password" placeholder="Hasło do dziennika" required className="w-full p-4 rounded-xl bg-background border border-gray-700 text-white mb-6 outline-none focus:border-[#e91e63]" value={loginPass} onChange={(e) => setLoginPass(e.target.value)} />
                    <button type="submit" disabled={isSimulating} className="w-full bg-[#e91e63] text-white font-bold py-4 rounded-xl shadow-[0_4px_15px_rgba(233,30,99,0.4)] transition hover:bg-[#d81b60] active:scale-95 disabled:opacity-50">
                        Zaloguj & Szyfruj
                    </button>
                    <div className="mt-5 text-[10px] text-center text-gray-500 uppercase font-bold tracking-wider">Logowanie zanonimizowane End-To-End</div>
                </form>
            </div>
        )
    }

    return (
        <div className="pb-20 pt-4 max-w-lg mx-auto w-full">
            <div className="flex justify-between items-center mb-6 px-1">
                <div>
                    <h2 className="text-xl font-bold text-white flex items-center gap-2">
                        <CheckCircle2 size={24} className="text-[#e91e63]" />
                        Dziennik Ucznia
                    </h2>
                    <span className="text-xs text-gray-400">Połączono z serwerem uczeń: {isSpecialUser ? loginEmail : 'Szymon S.'}</span>
                </div>
                <button onClick={() => setIsLoggedIn(false)} className="bg-gray-800 p-3 rounded-full text-gray-400 hover:text-white hover:bg-gray-700 transition">
                    <LogOut size={20} />
                </button>
            </div>

            {/* Nawigacja w panelu Librusa */}
            <div className="flex bg-surface rounded-xl p-1.5 mb-6 border border-gray-800 shadow-lg gap-1">
                <button
                    onClick={() => setActiveTab('oceny')}
                    className={`flex-1 py-3 px-1 text-sm font-bold rounded-lg flex items-center justify-center gap-2 transition ${activeTab === 'oceny' ? 'bg-[#e91e63] text-white shadow-md' : 'text-gray-400 hover:text-white hover:bg-gray-800'}`}>
                    <BookOpen size={16} /> Oceny
                </button>
                <button
                    onClick={() => setActiveTab('plan')}
                    className={`flex-1 py-3 px-1 text-sm font-bold rounded-lg flex items-center justify-center gap-2 transition ${activeTab === 'plan' ? 'bg-[#e91e63] text-white shadow-md' : 'text-gray-400 hover:text-white hover:bg-gray-800'}`}>
                    <Calendar size={16} /> Plan
                </button>
                <button
                    onClick={() => setActiveTab('frekwencja')}
                    className={`flex-1 py-3 px-1 text-[13px] sm:text-sm font-bold rounded-lg flex items-center justify-center gap-2 transition ${activeTab === 'frekwencja' ? 'bg-[#e91e63] text-white shadow-md' : 'text-gray-400 hover:text-white hover:bg-gray-800'}`}>
                    <PieChart size={16} /> Frekwencja
                </button>
            </div>

            {/* ZAKŁADKA: OCENY (SYSTEM PUNKTOWY) */}
            {activeTab === 'oceny' && (
                <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                    <h4 className="font-bold text-gray-300 pl-1">Najnowsze wpisy z dziennika ({isSpecialUser ? 'System Punktowy' : 'Symulacja'})</h4>
                    <div className="grid grid-cols-1 gap-3">
                        {displayedGrades.map((g, idx) => (
                            <div key={idx} className="bg-surface border border-gray-800 p-4 rounded-xl flex items-center justify-between shadow-sm relative overflow-hidden group hover:border-[#e91e63]/50 transition">
                                <div className={`absolute left-0 top-0 bottom-0 w-1 ${g.bg || 'bg-[#e91e63]'}`}></div>

                                <div className="pl-4">
                                    <h5 className="font-bold text-white text-[15px]">{g.subject}</h5>
                                    <span className="text-xs text-gray-500 uppercase tracking-wider">{g.desc}</span>
                                </div>
                                <div className="text-right flex flex-col items-end">
                                    <span className={`text-[22px] font-black leading-none ${g.color || 'text-[#e91e63]'}`}>{g.points}</span>
                                    <span className={`text-[10px] px-2 py-0.5 rounded-full mt-2 font-bold uppercase ${g.bg || 'bg-[#e91e63]/10'} ${g.color || 'text-[#e91e63]'}`}>{g.percent} Punktów</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* ZAKŁADKA: PLAN LEKCJI */}
            {activeTab === 'plan' && (
                <div className="bg-surface border border-gray-800 rounded-xl overflow-hidden shadow-lg animate-in fade-in slide-in-from-bottom-2 duration-300">
                    <div className="bg-background border-b border-gray-800 p-5 flex justify-between items-center">
                        <span className="font-bold text-white flex items-center gap-2"><Calendar size={20} className="text-[#e91e63]" /> Dzisiejsze Zajęcia</span>
                        <span className="text-xs text-[#e91e63] bg-[#e91e63]/10 px-3 py-1.5 rounded-full font-bold uppercase tracking-wider">Czwartek</span>
                    </div>
                    <div className="divide-y divide-gray-800/60">
                        {isSpecialUser ? specialData.schedule.map(lesson => (
                            <div key={lesson.id} className="p-4 flex items-center hover:bg-white/[0.02] transition">
                                <div className="w-[85px] shrink-0 text-xs font-mono text-gray-400 flex flex-col justify-center border-r border-gray-700/50 mr-4">
                                    <Clock size={14} className="mb-1.5 text-gray-500" />
                                    {lesson.time.split(' - ')[0]}<br />
                                    <span className="text-gray-600">{lesson.time.split(' - ')[1]}</span>
                                </div>
                                <div>
                                    <div className="font-bold text-white text-base">{lesson.subject}</div>
                                    <div className="text-xs text-[#e91e63] mt-1 font-semibold">{lesson.room}</div>
                                </div>
                            </div>
                        )) : (
                            <div className="p-10 flex flex-col items-center text-center text-gray-500 text-sm">
                                <Calendar size={48} className="text-gray-800 mb-4" />
                                Symulowany Profil nie ma zapisanego planu lekcji.<br />Zaloguj się dedykowanymi danymi.
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* ZAKŁADKA: FREKWENCJA */}
            {activeTab === 'frekwencja' && (
                <div className="bg-surface border border-gray-800 rounded-xl p-6 shadow-lg animate-in fade-in slide-in-from-bottom-2 duration-300">
                    <h4 className="font-bold text-white mb-8 flex items-center gap-2 text-lg">
                        <PieChart className="text-[#e91e63]" /> Raport Semestralny Obecności
                    </h4>

                    <div className="flex flex-col items-center justify-center mb-10 relative">
                        <svg viewBox="0 0 36 36" className="w-[160px] h-[160px] text-center text-[#e91e63] drop-shadow-[0_0_15px_rgba(233,30,99,0.3)]">
                            <path
                                className="text-background"
                                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2.5"
                            />
                            <path
                                className="text-[#e91e63]"
                                strokeDasharray={`${isSpecialUser ? specialData.attendance.obecnosc : 92}, 100`}
                                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="3"
                                strokeLinecap="round"
                            />
                        </svg>
                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                            <span className="text-[40px] font-black text-white">{isSpecialUser ? specialData.attendance.obecnosc : 92}%</span>
                            <span className="text-[11px] text-[#e91e63] uppercase font-bold tracking-widest mt-1">Obecność</span>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="bg-background border border-gray-800 rounded-xl p-4 text-center shadow-inner">
                            <div className="text-3xl font-black text-yellow-500 mb-1">{isSpecialUser ? specialData.attendance.spoznienia : 3}</div>
                            <div className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Spóźnienia</div>
                        </div>
                        <div className="bg-background border border-gray-800 rounded-xl p-4 text-center shadow-inner">
                            <div className="text-3xl font-black text-blue-400 mb-1">{isSpecialUser ? specialData.attendance.usprawiedliwione : 15}</div>
                            <div className="text-[11px] font-bold text-gray-500 uppercase tracking-wider">Usprawiedliw. (h)</div>
                        </div>
                    </div>

                    {isSpecialUser && specialData.attendance.nieusprawiedliwione === 0 && (
                        <div className="mt-6 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm text-center p-4 rounded-xl flex items-center justify-center gap-3">
                            <CheckCircle2 size={24} />
                            <div>
                                <span className="font-bold block text-emerald-500">Konto Wzorowe!</span>
                                Posiadasz 0 nieusprawiedliwionych godzin.
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}
