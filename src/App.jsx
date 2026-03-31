import React, { useEffect, useState } from 'react'
import { BrowserRouter as Router, Routes, Route, Link, useLocation } from 'react-router-dom'
import { Home, LayoutGrid, User, ShieldAlert } from 'lucide-react'
import { supabase, signInWithEmail, signUpWithEmail, resendConfirmationEmail } from './services/supabase'
import { NotificationService } from './services/notificationService'
import { ToastProvider } from './context/ToastContext'

import Feed from './features/feed/Feed'
import ReWear from './features/rewear/ReWear'
import Librus from './features/librus/Librus'
import Admin from './features/admin/Admin'
import Features from './features/features/Features'
import Profile from './features/profile/Profile'
import PublicProfile from './features/profile/PublicProfile'
import TEBtalk from './features/tebtalk/TEBtalk'
import Groups from './features/groups/Groups'
import PrivacyPolicy from './features/privacy/PrivacyPolicy'

import InstallPrompt from './components/InstallPrompt'
import ReloadPrompt from './components/ReloadPrompt'
import AppErrorBoundary from './components/AppErrorBoundary'

function App() {
    const [session, setSession] = useState(null)
    const [loading, setLoading] = useState(true)
    const [userRoles, setUserRoles] = useState(['student'])
    const [email, setEmail] = useState('')
    const [password, setPassword] = useState('')
    const [confirmPassword, setConfirmPassword] = useState('')
    const [fullName, setFullName] = useState('')
    const [isRegister, setIsRegister] = useState(false)
    const [authError, setAuthError] = useState('')
    const [authMessage, setAuthMessage] = useState('')
    const [isLoading, setIsLoading] = useState(false)
    const [isResendingConfirmation, setIsResendingConfirmation] = useState(false)
    const [retryCount, setRetryCount] = useState(0)

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
        setIsLoading(true)
        
        let finalEmail = email.trim().toLowerCase()

        // Auto-fix dla loginu Librusa (jeśli sam numer, dodaj domenę)
        if (!finalEmail.includes('@')) {
            finalEmail = `${finalEmail}@teb.edu.pl`
        }

        if (!finalEmail.endsWith('@teb.edu.pl')) {
            setAuthError('❌ Dostęp zablokowany. Użyj szkolnego e-maila (@teb.edu.pl)')
            setIsLoading(false)
            return
        }

        if (!finalEmail.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
            setAuthError('❌ Niepoprawny format e-maila.')
            setIsLoading(false)
            return
        }

        try {
            if (isRegister) {
                if (!password || password.length < 8) {
                    setAuthError(`❌ Hasło musi mieć co najmniej 8 znaków. Wpisano: ${password.length}`)
                    setIsLoading(false)
                    return
                }

                if (password !== confirmPassword) {
                    setAuthError('❌ Podane hasła nie są identyczne.')
                    setIsLoading(false)
                    return
                }

                let finalName = fullName.trim()
                if (!finalName) {
                    finalName = extractNameFromEmail(finalEmail)
                }

                // Timeout safety
                const signupTimeout = setTimeout(() => {
                    setAuthError('⏱️ Serwer nie responduje. Spróbuj za chwilę lub odśwież stronę.')
                    setIsLoading(false)
                }, 15000)

                try {
                    const signupResult = await signUpWithEmail(finalEmail, password, finalName)
                    clearTimeout(signupTimeout)
                    if (signupResult?.note) {
                        setAuthMessage('ℹ️ Konto może już istnieć. Przejdź do logowania i użyj opcji "Wyślij ponownie e-mail potwierdzający".')
                        setIsRegister(false)
                        setEmail(finalEmail)
                        setPassword('')
                        setConfirmPassword('')
                        setFullName('')
                        return
                    }

                    setAuthMessage('✅ Konto zostało utworzone! Sprawdź e-mail aby potwierdzić rejestrację.')
                    setIsRegister(false)
                    setEmail('')
                    setPassword('')
                    setConfirmPassword('')
                    setFullName('')
                    setRetryCount(0)
                } catch (e) {
                    clearTimeout(signupTimeout)
                    throw e
                }
            } else {
                // Login
                const loginTimeout = setTimeout(() => {
                    setAuthError('⏱️ Serwer nie responduje. Spróbuj za chwilę.')
                    setIsLoading(false)
                }, 15000)

                try {
                    await signInWithEmail(finalEmail, password)
                    clearTimeout(loginTimeout)
                } catch (e) {
                    clearTimeout(loginTimeout)
                    throw e
                }
            }
        } catch (error) {
            const errorMsg = error?.message || 'Nieznany błąd. Spróbuj ponownie.'
            
            // Lepsze error messages
            if (errorMsg.includes('confirmation email') || errorMsg.includes('mail')) {
                setAuthError('📧 Problem z wysyłką e-maila potwierdzającego. Spróbuj za minutę.')
            } else if (errorMsg.includes('already registered') || errorMsg.includes('user already')) {
                setAuthError('⚠️ Ten e-mail jest już zarejestrowany. Zaloguj się zamiast rejestrować.')
            } else if (errorMsg.includes('Invalid login')) {
                setAuthError('❌ Zły e-mail lub hasło.')
            } else if (errorMsg.includes('timeout') || errorMsg.includes('Abort')) {
                setAuthError(`⏱️ Timeout (próba ${retryCount + 1}/3). Spróbuj ponownie.`)
                if (retryCount < 2) {
                    setRetryCount(retryCount + 1)
                }
            } else {
                setAuthError(`❌ ${errorMsg}`)
            }
        } finally {
            setIsLoading(false)
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

    const handleResendConfirmation = async () => {
        let finalEmail = email.trim().toLowerCase()
        if (!finalEmail.includes('@')) {
            finalEmail = `${finalEmail}@teb.edu.pl`
        }

        if (!finalEmail.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/) || !finalEmail.endsWith('@teb.edu.pl')) {
            setAuthError('Wpisz poprawny szkolny e-mail (@teb.edu.pl), aby ponownie wysłać link potwierdzający.')
            return
        }

        try {
            setIsResendingConfirmation(true)
            await resendConfirmationEmail(finalEmail)
            setAuthMessage('Jeśli konto istnieje, wysłaliśmy nowy link potwierdzający. Sprawdź także folder Spam/Oferty.')
            setAuthError('')
        } catch {
            setAuthError('Nie udało się ponownie wysłać linku. Spróbuj za chwilę.')
        } finally {
            setIsResendingConfirmation(false)
        }
    }

    useEffect(() => {
        supabase.auth.getSession().then(({ data: { session } }) => {
            setSession(session)
            if (session) fetchRole(session.user.id)
            else {
                // In local dev/testing, allow a mocked session so we can test flows without real auth.
                if (import.meta.env.DEV) {
                    const fake = { user: { id: 'local-test-user', email: 'local@test' } }
                    setSession(fake)
                    setUserRoles(['student'])
                    setLoading(false)
                } else {
                    setLoading(false)
                }
            }
        }).catch(err => {
            console.error("Auth session error:", err)
            // Fallback to dev mocked session when running locally
            if (import.meta.env.DEV) {
                const fake = { user: { id: 'local-test-user', email: 'local@test' } }
                setSession(fake)
                setUserRoles(['student'])
            }
            setLoading(false)
        })

        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            setSession(session)
            if (session) fetchRole(session.user.id)
        })

        return () => subscription.unsubscribe()
    }, [])

    async function fetchRole(uid) {
        try {
            const { data, error } = await supabase.from('profiles').select('roles, teb_gabki').eq('id', uid).single()
            if (error) {
                console.error('Error loading profile:', error)
                setUserRoles(['student'])
                setLoading(false)
                return
            }
            if (data) {
                setUserRoles(data.roles || ['student'])
                // Automatyczne TG za codzienne logowanie — weryfikacja po stronie serwera
                try {
                    const { data: award, error: awardErr } = await supabase.rpc('award_daily_tg')
                    if (!awardErr && award?.awarded) {
                        console.log('Przyznano 5 TG za codzienne logowanie!')
                    }
                } catch (awardErr) {
                    console.warn('Daily TG award failed:', awardErr)
                }

                // Rejestracja powiadomień Push
                NotificationService.requestPermission().then(granted => {
                    if (granted) NotificationService.subscribeUser(uid)
                }).catch(err => console.warn('Notification permission failed:', err))
            }
        } catch (err) {
            console.error('Fatal error in fetchRole:', err)
            setUserRoles(['student'])
        } finally {
            setLoading(false)
        }
    }

    if (loading) return <div className="min-h-screen bg-[#121212] flex items-center justify-center text-primary">Autoryzacja SU...</div>

    // Widok ekranu logowania tradycyjnego
    if (!session) {
        return (
            <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
                <Routes>
                    <Route path="/privacy" element={<PrivacyPolicy />} />
                    <Route path="*" element={
                        <div className="min-h-screen bg-[#121212] flex flex-col items-center justify-center p-4">
                            <div className="flex items-center gap-2 mb-4">
                                <h1 className="text-4xl font-bold text-primary">TEB-APP</h1>
                                <span className="bg-red-500/20 text-red-500 border border-red-500/50 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider backdrop-blur-sm">
                                    release-0.1
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
                                        disabled={isLoading}
                                    />
                                )}
                                <input
                                    type="email" placeholder="Twój szkolny E-mail (@teb.edu.pl)" required
                                    className="p-3 rounded-xl bg-surface border border-gray-700 outline-none focus:border-primary text-white transition disabled:opacity-50"
                                    value={email} onChange={e => setEmail(e.target.value)}
                                    disabled={isLoading}
                                />
                                <input
                                    type="password" placeholder="Hasło" required
                                    minLength={isRegister ? 8 : undefined}
                                    className="p-3 rounded-xl bg-surface border border-gray-700 outline-none focus:border-primary text-white transition disabled:opacity-50"
                                    value={password} onChange={e => setPassword(e.target.value)}
                                    disabled={isLoading}
                                />
                                {isRegister && (
                                    <>
                                        <input
                                            type="password" placeholder="Potwierdź hasło (Min. 8 znaków)" required minLength={8}
                                            className="p-3 rounded-xl bg-surface border border-gray-700 outline-none focus:border-primary text-white transition disabled:opacity-50"
                                            value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
                                            disabled={isLoading}
                                        />
                                        <div className="text-xs text-gray-500 px-2">
                                            Hasło: {password.length} / 8 znaków
                                        </div>
                                    </>
                                )}

                                {authError && (
                                    <div className="text-red-500 text-xs text-center font-bold px-2 py-2 bg-red-950/30 rounded">
                                        {authError}
                                    </div>
                                )}
                                {authMessage && (
                                    <div className="text-green-400 text-xs text-center font-bold px-2 py-2 bg-green-950/30 rounded">
                                        {authMessage}
                                    </div>
                                )}

                                <button 
                                    type="submit" 
                                    disabled={isLoading}
                                    className={`mt-2 px-6 py-3 rounded-xl font-bold w-full transition transform ${
                                        isLoading 
                                            ? 'bg-gray-600 text-white cursor-not-allowed' 
                                            : 'bg-primary text-white shadow-[0_0_15px_rgba(59,130,246,0.3)] hover:scale-105'
                                    }`}
                                >
                                    {isLoading ? '⏳ Proszę czekać...' : (isRegister ? 'Załóż Konto' : 'Zaloguj się')}
                                </button>

                                {retryCount > 0 && authError && authError.includes('Timeout') && (
                                    <button 
                                        type="button" 
                                        onClick={handleAuth}
                                        className="text-xs bg-yellow-900/50 text-yellow-300 border border-yellow-700 px-3 py-2 rounded font-semibold hover:bg-yellow-900/70 transition"
                                    >
                                        🔄 Spróbuj ponownie ({retryCount}/3)
                                    </button>
                                )}

                                {!isRegister && (
                                    <button type="button" onClick={handleResetPassword} disabled={isLoading} className="text-xs text-primary underline text-right w-full mt-1 pr-2 disabled:opacity-50">
                                        Nie pamiętasz hasła?
                                    </button>
                                )}

                                {!isRegister && authError && authError.includes('Potwierdź swoją rejestrację') && (
                                    <button
                                        type="button"
                                        onClick={handleResendConfirmation}
                                        disabled={isLoading || isResendingConfirmation}
                                        className="text-xs bg-blue-900/40 text-blue-200 border border-blue-700 px-3 py-2 rounded font-semibold hover:bg-blue-900/60 transition disabled:opacity-50"
                                    >
                                        {isResendingConfirmation ? '⏳ Wysyłanie...' : 'Wyślij ponownie e-mail potwierdzający'}
                                    </button>
                                )}
                            </form>

                            <button onClick={() => { setIsRegister(!isRegister); setAuthError(''); setAuthMessage('') }} className="mt-6 text-sm text-gray-500 underline">
                                {isRegister ? 'Masz już konto? Zaloguj się' : 'Jesteś tu pierwszy raz? Zarejestruj się'}
                            </button>

                            <div className="mt-auto pb-4">
                                <Link to="/privacy" className="text-[10px] text-gray-600 uppercase font-bold tracking-widest hover:text-primary transition">
                                    Polityka Prywatności & Regulamin
                                </Link>
                            </div>
                        </div>
                    } />
                </Routes>
            </Router>
        )
    }

    // Jesteś zalogowany -> Router Aplikacji
    return (
        <ToastProvider>
            <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
                <div className="min-h-[100dvh] bg-black flex justify-center">
                    <div className="w-full max-w-md bg-[#121212] text-white flex flex-col font-sans h-[100dvh] relative overflow-hidden shadow-2xl shadow-primary/10">
                        {/* Header z logo TEB */}
                        <header className="px-6 py-4 flex justify-between items-center bg-[#1e1e1e]/90 backdrop-blur-xl border-b border-gray-800 fixed top-0 w-full max-w-md z-50">
                            <div className="flex items-center gap-2">
                                <img src="/pwa-192x192.png" alt="TEB-App logo" className="w-7 h-7 rounded-full object-cover" />
                                <h1 className="text-xl font-bold text-primary">TEB-App</h1>
                                <span className="bg-orange-500/20 text-orange-500 border border-orange-500/50 text-[8px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wider">
                                    release-0.1
                                </span>
                            </div>
                        </header>

                        {/* Zmienna zawartość z routingiem opartym na pod-modułach z folderu 'features' */}
                        <main className="flex-1 overflow-y-auto mt-16 mb-20 px-4 pt-4">
                            <AppErrorBoundary>
                                <Routes>
                                    <Route path="/" element={<Feed />} />
                                    <Route path="/features" element={<Features />} />
                                    <Route path="/profile" element={<Profile />} />
                                    <Route path="/profile/:userId" element={<PublicProfile />} />
                                    <Route path="/rewear" element={<ReWear />} />
                                    <Route path="/librus" element={<Librus />} />
                                    <Route path="/tebtalk" element={<TEBtalk />} />
                                    <Route path="/groups" element={<Groups />} />
                                    <Route path="/admin" element={<Admin />} />
                                    <Route path="/privacy" element={<PrivacyPolicy />} />
                                </Routes>
                            </AppErrorBoundary>
                        </main>

                        {/* Proaktywna opcja instalacji aplikacji na telefon PWA */}
                        <InstallPrompt />

                        {/* Skrypt informujący o nowych wersjach z GitHuba do pobrania dla urządzenia */}
                        <ReloadPrompt />

                        {/* Bottom Navigation (Apple / Instagram Style) */}
                        <nav className="absolute bottom-0 w-full max-w-md bg-[#1e1e1e]/90 backdrop-blur-xl border-t border-gray-800 pb-[env(safe-area-inset-bottom,24px)] pt-2 px-6 flex justify-between z-50 shadow-[0_-4px_20px_rgba(0,0,0,0.5)]">
                            <NavLink to="/" icon={<Home />} />
                            <NavLink to="/features" icon={<LayoutGrid />} />
                            <NavLink to="/profile" icon={<User />} />
                            {userRoles.some(role => ['admin', 'moderator_users', 'moderator_content'].includes(role)) && <NavLink to="/admin" icon={<ShieldAlert />} alert />}
                        </nav>
                    </div>
                </div>
            </Router>
        </ToastProvider>
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
