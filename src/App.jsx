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
import { APP_NAME, APP_VERSION, APP_SUBTITLE, LOGO_SMALL, LOGO_LARGE } from './app.config'

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

    if (loading) return (
        <div className="min-h-screen bg-[#121212] flex flex-col items-center justify-center gap-3">
            <img src={LOGO_SMALL} alt="logo" className="w-14 h-14 rounded-2xl opacity-80" />
            <span className="text-gray-500 text-sm">Autoryzacja...</span>
        </div>
    )

    // Widok ekranu logowania tradycyjnego
    if (!session) {
        return (
            <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
                <Routes>
                    <Route path="/privacy" element={<PrivacyPolicy />} />
                    <Route path="*" element={
                        <div className="min-h-screen bg-[#121212] flex flex-col items-center justify-center px-6 py-10">
                            <div className="flex flex-col items-center mb-8">
                                <img src={LOGO_LARGE} alt={APP_NAME} className="w-20 h-20 rounded-3xl mb-4 shadow-lg" />
                                <h1 className="text-2xl font-bold text-white tracking-tight">{APP_NAME}</h1>
                                <p className="text-gray-500 text-xs mt-1">{APP_SUBTITLE}</p>
                            </div>

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
                                    className={`mt-2 px-6 py-3 rounded-xl font-bold w-full transition-all ${
                                        isLoading 
                                            ? 'bg-gray-700 text-gray-400 cursor-not-allowed' 
                                            : 'bg-primary text-white shadow-[0_4px_20px_rgba(200,16,46,0.35)] active:scale-95'
                                    }`}
                                >
                                    {isLoading ? 'Proszę czekać...' : (isRegister ? 'Załóż konto' : 'Zaloguj się')}
                                </button>

                                {retryCount > 0 && authError && authError.includes('Timeout') && (
                                    <button 
                                        type="button" 
                                        onClick={handleAuth}
                                        className="text-xs bg-yellow-900/40 text-yellow-300 border border-yellow-800 px-3 py-2 rounded-lg font-semibold transition"
                                    >
                                        Spróbuj ponownie ({retryCount}/3)
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
                                        className="text-xs bg-secondary/10 text-blue-300 border border-secondary/30 px-3 py-2 rounded-lg font-semibold transition disabled:opacity-50"
                                    >
                                        {isResendingConfirmation ? 'Wysyłanie...' : 'Wyślij ponownie e-mail potwierdzający'}
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
                    <div className="w-full max-w-md bg-[#121212] app-bg text-white flex flex-col font-sans h-[100dvh] relative overflow-hidden shadow-2xl shadow-primary/10">
                        {/* Header z logo TEB */}
                        <header className="px-5 py-3.5 flex justify-between items-center bg-[#181818]/95 backdrop-blur-xl border-b border-white/5 fixed top-0 w-full max-w-md z-50">
                            <div className="flex items-center gap-2.5">
                                <img src={LOGO_SMALL} alt={`${APP_NAME} logo`} className="w-8 h-8 rounded-xl object-cover" />
                                <div className="flex items-baseline gap-1.5">
                                    <h1 className="text-[17px] font-bold text-white leading-none">{APP_NAME}</h1>
                                    <span className="text-[10px] font-medium text-gray-600 leading-none">{APP_VERSION}</span>
                                </div>
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
                        <nav className="absolute bottom-0 w-full max-w-md bg-[#181818]/95 backdrop-blur-xl border-t border-white/5 pb-[env(safe-area-inset-bottom,20px)] pt-1 px-8 flex justify-between z-50">
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
        <Link to={to} className="flex flex-col items-center gap-0.5 py-2 px-3 transition-all duration-150">
            {React.cloneElement(icon, { className: `w-6 h-6 transition-colors duration-150 ${isActive ? 'text-primary' : alert ? 'text-red-500/50' : 'text-gray-500'}` })}
            <span className={`h-1 w-1 rounded-full transition-all duration-200 ${isActive ? 'bg-primary scale-100' : 'scale-0 bg-transparent'}`} />
        </Link>
    )
}

export default App
