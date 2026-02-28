import React, { useEffect, useState } from 'react'
import { BrowserRouter as Router, Routes, Route, Link, useLocation } from 'react-router-dom'
import { Home, LayoutGrid, User, ShieldAlert } from 'lucide-react'
import { supabase, signInWithEmail, signUpWithEmail } from './services/supabase'

import Feed from './features/feed/Feed'
import Vinted from './features/vinted/Vinted'
import Librus from './features/librus/Librus'
import Admin from './features/admin/Admin'
import Features from './features/features/Features'
import Profile from './features/profile/Profile'

function App() {
    const [session, setSession] = useState(null)
    const [loading, setLoading] = useState(true)
    const [userRole, setUserRole] = useState('student')
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [fullName, setFullName] = useState('')
    const [isRegister, setIsRegister] = useState(false)
    const [authError, setAuthError] = useState('')

    const handleAuth = async (e) => {
        e.preventDefault()
        setAuthError('')
        if (!email.endsWith('@teb.edu.pl')) {
            setAuthError('Dostęp zablokowany. Użyj szkolnego e-maila w domenie @teb.edu.pl')
            return
        }
        try {
            if (isRegister) {
                if (!fullName) {
                    setAuthError('Wymagane Imię i Nazwisko (do autoryzacji na tablicy SU)')
                    return
                }
                await signUpWithEmail(email, password, fullName)
                alert('Konto zostało poprawnie utworzone! Możesz się teraz zalogować.')
                setIsRegister(false)
            } else {
                await signInWithEmail(email, password)
            }
        } catch (error) {
            setAuthError(error.message)
        }
    }

    useEffect(() => {
        supabase.auth.getSession().then(({ data: { session } }) => {
            setSession(session)
            if (session) fetchRole(session.user.id)
            else setLoading(false)
        })

        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            setSession(session)
            if (session) fetchRole(session.user.id)
        })

        return () => subscription.unsubscribe()
    }, [])

    async function fetchRole(uid) {
        const { data } = await supabase.from('profiles').select('role').eq('id', uid).single()
        if (data) setUserRole(data.role)
        setLoading(false)
    }

    if (loading) return <div className="min-h-screen bg-[#121212] flex items-center justify-center text-primary">Autoryzacja SU...</div>

    // Widok ekranu logowania tradycyjnego
    if (!session) {
        return (
            <div className="min-h-screen bg-[#121212] flex flex-col items-center justify-center p-4">
                <h1 className="text-4xl font-bold text-primary mb-4">TEB-APP</h1>
                <p className="text-gray-400 text-center mb-6 max-w-sm text-sm">
                    Aplikacja jest bezpieczna. Zamknięty obieg autoryzacji pozwala na rejestrację WYŁĄCZNIE dla domen <strong>@teb.edu.pl</strong>
                </p>

                <form onSubmit={handleAuth} className="w-full max-w-xs flex flex-col gap-3">
                    {isRegister && (
                        <input
                            type="text" placeholder="Imię i Nazwisko" required
                            className="p-3 rounded-xl bg-surface border border-gray-700 outline-none focus:border-primary text-white transition"
                            value={fullName} onChange={e => setFullName(e.target.value)}
                        />
                    )}
                    <input
                        type="email" placeholder="Twój szkolny E-mail (@teb.edu.pl)" required
                        className="p-3 rounded-xl bg-surface border border-gray-700 outline-none focus:border-primary text-white transition"
                        value={email} onChange={e => setEmail(e.target.value)}
                    />
                    <input
                        type="password" placeholder="Hasło" required
                        className="p-3 rounded-xl bg-surface border border-gray-700 outline-none focus:border-primary text-white transition"
                        value={password} onChange={e => setPassword(e.target.value)}
                    />

                    {authError && <div className="text-red-500 text-xs text-center font-bold px-2">{authError}</div>}

                    <button type="submit" className="mt-2 bg-primary text-white px-6 py-3 rounded-xl font-bold w-full shadow-[0_0_15px_rgba(59,130,246,0.3)] transition transform hover:scale-105">
                        {isRegister ? 'Załóż Konto (Weryfikacja TEB)' : 'Zaloguj się'}
                    </button>
                </form>

                <button onClick={() => setIsRegister(!isRegister)} className="mt-6 text-sm text-gray-500 underline">
                    {isRegister ? 'Masz już konto? Zaloguj się' : 'Jesteś tu pierwszy raz? Zarejestruj się'}
                </button>
            </div>
        )
    }

    // Jesteś zalogowany -> Router Aplikacji
    return (
        <Router>
            <div className="min-h-screen bg-black flex justify-center">
                <div className="w-full max-w-md bg-[#121212] text-white flex flex-col font-sans h-screen relative overflow-hidden shadow-2xl shadow-primary/10">
                    {/* Header z logo TEB */}
                    <header className="px-6 py-4 flex justify-between items-center bg-[#1e1e1e]/90 backdrop-blur-xl border-b border-gray-800 fixed top-0 w-full max-w-md z-50">
                        <h1 className="text-xl font-bold text-primary">📱 TEB-App</h1>
                    </header>

                    {/* Zmienna zawartość z routingiem opartym na pod-modułach z folderu 'features' */}
                    <main className="flex-1 overflow-y-auto mt-16 mb-20 px-4 pt-4">
                        <Routes>
                            <Route path="/" element={<Feed />} />
                            <Route path="/features" element={<Features />} />
                            <Route path="/profile" element={<Profile />} />
                            <Route path="/vinted" element={<Vinted />} />
                            <Route path="/librus" element={<Librus />} />
                            <Route path="/admin" element={<Admin />} />
                        </Routes>
                    </main>

                    {/* Bottom Navigation (Apple / Instagram Style) */}
                    <nav className="absolute bottom-0 w-full max-w-md bg-[#1e1e1e]/90 backdrop-blur-xl border-t border-gray-800 pb-safe pb-4 pt-2 px-6 flex justify-between z-50">
                        <NavLink to="/" icon={<Home />} />
                        <NavLink to="/features" icon={<LayoutGrid />} />
                        <NavLink to="/profile" icon={<User />} />
                        {userRole === 'admin' && <NavLink to="/admin" icon={<ShieldAlert />} alert />}
                    </nav>
                </div>
            </div>
        </Router>
    )
}

function NavLink({ to, icon, alert }) {
    const location = useLocation();
    const isActive = location.pathname === to;
    return (
        <Link to={to} className={`p-2 transition-all duration-200 ${isActive ? 'text-primary -translate-y-1' : 'text-gray-500'}`}>
            {React.cloneElement(icon, { className: `w-7 h-7 ${alert ? 'text-red-500/50' : ''}` })}
        </Link>
    )
}

export default App
