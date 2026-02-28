import React, { useEffect, useState } from 'react'
import { BrowserRouter as Router, Routes, Route, Link, useLocation } from 'react-router-dom'
import { Home, Store, GraduationCap, ShieldAlert } from 'lucide-react'
import { supabase, signInWithTebMicrosoft } from './services/supabase'

import Feed from './features/feed/Feed'
import Vinted from './features/vinted/Vinted'
import Librus from './features/librus/Librus'
import Admin from './features/admin/Admin'

function App() {
    const [session, setSession] = useState(null)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        supabase.auth.getSession().then(({ data: { session } }) => {
            setSession(session)
            setLoading(false)
        })

        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            setSession(session)
        })

        return () => subscription.unsubscribe()
    }, [])

    if (loading) return <div className="min-h-screen bg-[#121212] flex items-center justify-center text-primary">Ładowanie aplikacji...</div>

    // Jeśli brak weryfikacji JWT O365... Pokaż wielki ekran logowania
    if (!session) {
        return (
            <div className="min-h-screen bg-[#121212] flex flex-col items-center justify-center p-4">
                <h1 className="text-4xl font-bold text-green-400 mb-8">TEB-APP</h1>
                <p className="text-gray-400 text-center mb-8 max-w-sm">Bezpieczne centrum ucznia Technikum TEB Edukacja. Logowanie tylko dla domen @teb.edu.pl</p>
                <button
                    onClick={signInWithTebMicrosoft}
                    className="bg-green-500 text-black px-6 py-3 rounded-full font-bold w-full max-w-xs shadow-[0_0_15px_rgba(0,255,136,0.3)] transition transform hover:scale-105"
                >
                    Zaloguj przez Office 365
                </button>
            </div>
        )
    }

    // Jesteś zalogowany -> Router Aplikacji
    return (
        <Router>
            <div className="min-h-screen bg-[#121212] text-white flex flex-col font-sans">

                {/* Header globalny */}
                <header className="fixed top-0 w-full bg-[#1e1e1e]/80 backdrop-blur-md border-b border-gray-800 z-50 p-4">
                    <h1 className="text-xl font-bold text-green-400">📱 TEB-App</h1>
                </header>

                {/* Zmienna zawartość z routingiem opartym na pod-modułach z folderu 'features' */}
                <main className="flex-1 overflow-y-auto mt-16 mb-20 px-4 pt-4">
                    <Routes>
                        <Route path="/" element={<Feed />} />
                        <Route path="/vinted" element={<Vinted />} />
                        <Route path="/librus" element={<Librus />} />
                        <Route path="/admin" element={<Admin />} />
                    </Routes>
                </main>

                {/* Bottom Navigation (Apple / Instagram Style) */}
                <nav className="fixed bottom-0 w-full bg-[#1e1e1e]/90 backdrop-blur-xl border-t border-gray-800 pb-safe pb-4 pt-2 px-6 flex justify-between z-50">
                    <NavLink to="/" icon={<Home />} />
                    <NavLink to="/librus" icon={<GraduationCap />} />
                    <NavLink to="/vinted" icon={<Store />} />
                    <NavLink to="/admin" icon={<ShieldAlert />} alert />
                </nav>
            </div>
        </Router>
    )
}

function NavLink({ to, icon, alert }) {
    const location = useLocation();
    const isActive = location.pathname === to;
    return (
        <Link to={to} className={`p-2 transition-all duration-200 ${isActive ? 'text-green-400 -translate-y-1' : 'text-gray-500'}`}>
            {React.cloneElement(icon, { className: `w-7 h-7 ${alert ? 'text-red-500/50' : ''}` })}
        </Link>
    )
}

export default App
