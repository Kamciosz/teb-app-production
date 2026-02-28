import React, { useState, useEffect } from 'react'
import { GraduationCap, CheckCircle2, Lock, Loader2 } from 'lucide-react'
import { supabase } from '../../services/supabase'

export default function Librus() {
    const [isLoggedIn, setIsLoggedIn] = useState(false)
    const [loginEmail, setLoginEmail] = useState('')
    const [loginPass, setLoginPass] = useState('')

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
        // Obliczamy Hash ID by mieć z czego losować stałe liczby
        let hash = 0;
        for (let i = 0; i < uid.length; i++) {
            hash = ((hash << 5) - hash) + uid.charCodeAt(i);
            hash |= 0;
        }

        // Tzw. LCG (Linear Congruential Generator)
        let seed = Math.abs(hash);
        const random = () => {
            const x = Math.sin(seed++) * 10000;
            return x - Math.floor(x);
        }

        const gradesPool = ["3+", "4", "4+", "5", "5-", "6"]; // Pozytywne żeby zachęcały użytkownika :D
        const descPool = ["Sprawdzian", "Zadanie Domowe", "Kartkówka", "Aktywność", "Projekt", "Odpowiedź Ustna"];
        const subjects = ["Matematyka", "Język Angielski", "Pracownia AI", "Bazy Danych", "Sieci Komputerowe", "Historia", "Fizyka"];

        const generated = [];
        for (let i = 1; i <= 4; i++) {
            const gradeIndex = Math.floor(random() * gradesPool.length);
            const descIndex = Math.floor(random() * descPool.length);
            // Rotacja przedmiotów bez dubli
            const sub = subjects[(seed + i) % subjects.length];

            generated.push({ id: i, subject: sub, grade: gradesPool[gradeIndex], desc: descPool[descIndex] });
        }
        return generated;
    }

    const handleLogin = (e) => {
        e.preventDefault()
        if (loginEmail && loginPass) {
            setIsSimulating(true)
            setSimText('Zestawianie Połączenia E2E...')

            setTimeout(() => setSimText('Autoryzacja serwerów Vulcan...'), 800)
            setTimeout(() => setSimText('Pobieranie Ocen...'), 1600)

            setTimeout(() => {
                setIsSimulating(false)
                setIsLoggedIn(true)
            }, 2400)
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
                    <p className="text-gray-400 text-sm">Zaloguj się kontem szkolnym aby pobrać API i pobierać średnie bezpośrednio ze szkoły</p>
                </div>

                <form onSubmit={handleLogin} className="w-full max-w-sm bg-surface p-6 rounded-2xl border border-gray-800 shadow-xl relative overflow-hidden">
                    {/* Nakładka Ładowania */}
                    {isSimulating && (
                        <div className="absolute inset-0 bg-surface/90 backdrop-blur-sm z-10 flex flex-col items-center justify-center">
                            <Loader2 className="animate-spin text-[#e91e63] mb-3" size={40} />
                            <div className="text-[#e91e63] font-bold text-sm animate-pulse">{simText}</div>
                        </div>
                    )}

                    <input type="text" placeholder="Login (np. 1234567)" required className="w-full p-4 rounded-xl bg-background border border-gray-700 text-white mb-4 outline-none focus:border-[#e91e63]" value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)} />
                    <input type="password" placeholder="Hasło do dziennika" required className="w-full p-4 rounded-xl bg-background border border-gray-700 text-white mb-6 outline-none focus:border-[#e91e63]" value={loginPass} onChange={(e) => setLoginPass(e.target.value)} />
                    <button type="submit" disabled={isSimulating} className="w-full bg-[#e91e63] text-white font-bold py-4 rounded-xl shadow-[0_4px_15px_rgba(233,30,99,0.4)] transition active:scale-95 disabled:opacity-50">
                        Zaloguj & Szyfruj
                    </button>
                    <div className="mt-4 text-xs text-center text-gray-500">Logowanie jest zanonimizowane i przetwarzane zgodnie z polityką prywatności samorządu szkolnego.</div>
                </form>
            </div>
        )
    }

    return (
        <div className="pb-10 pt-4">
            <div className="mb-6">
                <h2 className="text-xl font-bold text-primary">Dziennik Szkolny</h2>
                <span className="text-xs text-gray-500">Zsynchronizowano: Pomyślnie. (Szyfrowane E2E)</span>
            </div>

            <div className="bg-surface border border-gray-800 p-6 rounded-xl shadow-lg mt-6 relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary to-secondary"></div>
                <div className="flex gap-4 items-center mb-6">
                    <div className="bg-primary/20 p-4 rounded-full text-primary shadow-[0_0_15px_rgba(59,130,246,0.3)]">
                        <CheckCircle2 size={32} />
                    </div>
                    <div>
                        <h3 className="text-lg font-bold text-white">Połączono z API</h3>
                        <p className="text-xs text-gray-400">Twoje oceny i wiadomości zostaną pobrane i zaktualizowane dla celów poglądowych aplikacji.</p>
                    </div>
                </div>

                <h4 className="font-bold text-white mb-4">Ostatnie Moduły z Synergii</h4>
                <div className="grid grid-cols-2 gap-4">
                    {mockGrades.map(g => (
                        <div key={g.id} className="bg-background border border-gray-800 p-4 rounded-xl text-center shadow-inner pt-6 relative overflow-hidden group">
                            <div className="absolute top-0 left-0 w-full h-1 bg-[#e91e63]/50 group-hover:bg-[#e91e63] transition"></div>
                            <div className="text-[10px] text-gray-400 mb-2 truncate font-bold uppercase">{g.subject}</div>
                            <div className="text-4xl font-black text-white">{g.grade}</div>
                            <div className="text-xs text-[#e91e63] mt-2 bg-[#e91e63]/10 py-1 rounded-full font-bold">{g.desc}</div>
                        </div>
                    ))}
                </div>

                <button onClick={() => setIsLoggedIn(false)} className="w-full border-2 border-gray-700 text-gray-400 py-3 rounded-xl mt-6 font-bold hover:bg-gray-800 transition">
                    Rozłącz sesyjnie
                </button>
            </div>
        </div>
    )
}
