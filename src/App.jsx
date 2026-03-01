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
import InstallPrompt from './components/InstallPrompt'
import ReloadPrompt from './components/ReloadPrompt'

function App() {
    const [session, setSession] = useState(null)
    const [loading, setLoading] = useState(true)
    const [userRole, setUserRole] = useState('student')
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [confirmPassword, setConfirmPassword] = useState('')
    const [fullName, setFullName] = useState('')
    const [isRegister, setIsRegister] = useState(false)
    const [authError, setAuthError] = useState('')
    const [authMessage, setAuthMessage] = useState('')

    const extractNameFromEmail = (mail) => {
        const parts = mail.split('@')[0].split('.');
        if (parts.length >= 2) {
            return parts.map(p => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()).join(' ');
        }
        return mail.split('@')[0];
    }

    const handleAuth = async (e) => {
        e.preventDefault()
        setAuthError('')
        setAuthMessage('')
        let finalEmail = email.trim().toLowerCase()
        if (!finalEmail.endsWith('@teb.edu.pl')) {
            setAuthError('Dostęp zablokowany. Użyj szkolnego e-maila w domenie @teb.edu.pl')
            return
        }
        try {
            if (isRegister) {
                if (password !== confirmPassword) {
                    setAuthError('Błąd weryfikacji: Podane hasła nie są identyczne.')
                    return
                }

                let finalName = fullName.trim()
                if (!finalName) {
                    finalName = extractNameFromEmail(finalEmail)
                }

                await signUpWithEmail(finalEmail, password, finalName)
                setAuthMessage('Konto zostało utworzone! Możesz się teraz zalogować.')
                setIsRegister(false)
                setPassword('')
                setConfirmPassword('')
            } else {
                await signInWithEmail(finalEmail, password)
            }
        } catch (error) {
            setAuthError(error.message)
        }
    }

    const handleResetPassword = async () => {
        if (!email) {
            setAuthError('Wpisz swój adres e-mail powyżej, by odebrać link resetujący hasło.')
            return
        }
        try {
            const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
                redirectTo: window.location.origin
            });
            if (error) throw error;
            setAuthMessage('Wysłano link do resetu hasła na Twój szkolny e-mail.')
            setAuthError('')
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
                <div className="flex items-center gap-2 mb-4">
                    <h1 className="text-4xl font-bold text-primary">TEB-APP</h1>
                    <span className="bg-red-500/20 text-red-500 border border-red-500/50 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider backdrop-blur-sm">
                        Beta-3.0
                    </span>
                </div>
                <p className="text-gray-400 text-center mb-6 max-w-sm text-sm">
                    Aplikacja jest bezpieczna. Zamknięty obieg autoryzacji pozwala na rejestrację WYŁĄCZNIE dla domen <strong>@teb.edu.pl</strong>
                </p>

                <form onSubmit={handleAuth} className="w-full max-w-xs flex flex-col gap-3">
                    {isRegister && (
                        <input
                            type="text" placeholder="Imię i Nazwisko (Opcjonalnie)"
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
                    {isRegister && (
                        <input
                            type="password" placeholder="Potwierdź hasło (Min. 6 znaków)" required minLength={6}
                            className="p-3 rounded-xl bg-surface border border-gray-700 outline-none focus:border-primary text-white transition"
                            value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
                        />
                    )}

                    {authError && <div className="text-red-500 text-xs text-center font-bold px-2">{authError}</div>}
                    {authMessage && <div className="text-green-400 text-xs text-center font-bold px-2">{authMessage}</div>}

                    <button type="submit" className="mt-2 bg-primary text-white px-6 py-3 rounded-xl font-bold w-full shadow-[0_0_15px_rgba(59,130,246,0.3)] transition transform hover:scale-105">
                        {isRegister ? 'Załóż Konto (Weryfikacja)' : 'Zaloguj się'}
                    </button>
                    {!isRegister && (
                        <button type="button" onClick={handleResetPassword} className="text-xs text-primary underline text-right w-full mt-1 pr-2">
                            Nie pamiętasz hasła?
                        </button>
                    )}
                </form>

                <button onClick={() => { setIsRegister(!isRegister); setAuthError(''); setAuthMessage('') }} className="mt-6 text-sm text-gray-500 underline">
                    {isRegister ? 'Masz już konto? Zaloguj się' : 'Jesteś tu pierwszy raz? Zarejestruj się'}
                </button>
            </div>
        )
    }

    // Jesteś zalogowany -> Router Aplikacji
    return (
        <Router>
            <div className="min-h-[100dvh] bg-black flex justify-center">
                <div className="w-full max-w-md bg-[#121212] text-white flex flex-col font-sans h-[100dvh] relative overflow-hidden shadow-2xl shadow-primary/10">
                    {/* Header z logo TEB */}
                    <header className="px-6 py-4 flex justify-between items-center bg-[#1e1e1e]/90 backdrop-blur-xl border-b border-gray-800 fixed top-0 w-full max-w-md z-50">
                        <div className="flex items-center gap-2">
                            <h1 className="text-xl font-bold text-primary">📱 TEB-App</h1>
                            <span className="bg-orange-500/20 text-orange-500 border border-orange-500/50 text-[8px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wider">
                                Beta 3.0
                            </span>
                        </div>
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

                    {/* Proaktywna opcja instalacji aplikacji na telefon PWA */}
                    <InstallPrompt />

                    {/* Skrypt informujący o nowych wersjach z GitHuba do pobrania dla urządzenia */}
                    <ReloadPrompt />

                    {/* Bottom Navigation (Apple / Instagram Style) */}
                    <nav className="absolute bottom-0 w-full max-w-md bg-[#1e1e1e]/90 backdrop-blur-xl border-t border-gray-800 pb-[env(safe-area-inset-bottom,16px)] pt-2 px-6 flex justify-between z-50">
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
