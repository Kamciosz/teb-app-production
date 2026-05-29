import React, { Suspense, lazy, useEffect, useState } from 'react'
import { BrowserRouter as Router, Routes, Route, Link, useLocation } from 'react-router-dom'
import { Home, LayoutGrid, User, ShieldAlert } from 'lucide-react'
import { supabase, signInWithEmail, signUpWithEmail, resendConfirmationEmail } from './services/supabase'
import { NotificationService } from './services/notificationService'
import { ToastProvider } from './context/ToastContext'

const Feed = lazy(() => import('./features/feed/Feed'))
const ReWear = lazy(() => import('./features/rewear/ReWear'))
const ReWearInbox = lazy(() => import('./features/rewear/ReWearInbox'))
const Librus = lazy(() => import('./features/librus/Librus'))
const Admin = lazy(() => import('./features/admin/Admin'))
const Features = lazy(() => import('./features/features/Features'))
const Profile = lazy(() => import('./features/profile/Profile'))
const PublicProfile = lazy(() => import('./features/profile/PublicProfile'))
const TEBtalk = lazy(() => import('./features/tebtalk/TEBtalk'))
const Groups = lazy(() => import('./features/groups/Groups'))
const PrivacyPolicy = lazy(() => import('./features/privacy/PrivacyPolicy'))

import InstallPrompt from './components/InstallPrompt'
import ReloadPrompt from './components/ReloadPrompt'
import AppErrorBoundary from './components/AppErrorBoundary'
import { APP_NAME, APP_VERSION, APP_SUBTITLE, LOGO_SMALL, LOGO_LARGE } from './app.config'

function RouteLoading() {
    return (
        <div className="min-h-[40vh] flex items-center justify-center">
            <span className="text-gray-500 text-sm">Ładowanie modułu...</span>
        </div>
    )
}

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
                        setAuthMessage('ℹ️ Konto może już istnieć. Przejdź do logowania i użyj opcji "Wyślij ponownie e-mail potwierdzający". Sprawdź też folder SPAM.')
                        setIsRegister(false)
                        setEmail(finalEmail)
                        setPassword('')
                        setConfirmPassword('')
                        setFullName('')
                        return
                    }

                    setAuthMessage('✅ Konto utworzone! Wysłaliśmy link potwierdzający na Twój e-mail.\n\n📧 Sprawdź skrzynkę odbiorczą, a jeśli nie widzisz wiadomości — sprawdź folder SPAM/Oferty.')
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
            if (errorMsg.includes('Email not confirmed') || errorMsg.includes('not confirmed')) {
                setAuthError('⚠️ Twoje konto nie zostało jeszcze potwierdzone. Sprawdź skrzynkę e-mail (także folder SPAM) i kliknij link potwierdzający. Nie dostałeś e-maila?')
                setEmail(finalEmail)
            } else if (errorMsg.includes('confirmation email') || errorMsg.includes('mail')) {
                setAuthError('📧 Problem z wysyłką e-maila potwierdzającego. Spróbuj za minutę.')
            } else if (errorMsg.includes('already registered') || errorMsg.includes('user already')) {
                setAuthError('⚠️ Ten e-mail jest już zarejestrowany. Zaloguj się, a jeśli nie dostałeś e-maila potwierdzającego — sprawdź folder SPAM.')
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
            setAuthMessage('📧 Wysłano link do resetu hasła na Twój szkolny e-mail.\n\nSprawdź skrzynkę odbiorczą oraz folder SPAM/Oferty.')
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
            setAuthMessage('📧 Jeśli konto istnieje, wysłaliśmy nowy link potwierdzający.\n\nSprawdź skrzynkę odbiorczą oraz folder SPAM/Oferty.')
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
                // Najpierw sprawdź czy kolumna last_tg_award istnieje w tabeli profiles
                let columnExists = false;
                try {
                    await supabase.from('profiles').select('last_tg_award').eq('id', uid).limit(1).maybeSingle();
                    columnExists = true;
                } catch {
                    columnExists = false;
                }

                if (columnExists) {
                    try {
                        const { data: award, error: awardErr } = await supabase.rpc('award_daily_tg')
                        if (awardErr) {
                            // 400 BAD REQUEST = RPC function doesn't exist or rejected gracefully
                            if (awardErr.code === '400' || awardErr.status === 400 || awardErr.code === '404') {
                                console.debug('award_daily_tg not available — skipping')
                            } else {
                                console.warn('Daily TG award RPC error:', awardErr.message || awardErr)
                            }
                        } else if (award?.awarded) {
                            console.log('Przyznano 5 TG za codzienne logowanie!')
                        }
                    } catch {
                        // Silently skip
                    }
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
                <Suspense fallback={<RouteLoading />}>
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
                                    <div className="text-green-400 text-xs text-center font-bold px-2 py-2 bg-green-950/30 rounded whitespace-pre-line">
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

                                {!isRegister && authError && (authError.includes('Potwierdź swoją rejestrację') || authError.includes('konto nie zostało jeszcze potwierdzone')) && (
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
                </Suspense>
            </Router>
        )
    }

    // Jesteś zalogowany -> Router Aplikacji
    return (
        <ToastProvider>
            <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
                <div className="min-h-[100dvh] bg-black lg:h-screen lg:overflow-hidden">
                    <div className="w-full max-w-md bg-[#121212] app-bg text-white flex flex-col font-sans h-[100dvh] relative overflow-hidden shadow-2xl shadow-primary/10 lg:max-w-none lg:w-screen lg:h-screen lg:flex-row lg:bg-[#0f0f10] lg:shadow-none">
                        <aside className="hidden lg:flex lg:w-72 lg:shrink-0 lg:flex-col lg:border-r lg:border-white/5 lg:bg-[#151515]">
                            <div className="px-6 py-7 border-b border-white/5">
                                <div className="flex items-center gap-3">
                                    <img src={LOGO_SMALL} alt={`${APP_NAME} logo`} className="w-11 h-11 rounded-2xl object-cover shadow-lg shadow-primary/20" />
                                    <div>
                                        <h1 className="text-lg font-bold text-white leading-tight">{APP_NAME}</h1>
                                        <div className="text-xs text-gray-500 mt-1">{APP_SUBTITLE}</div>
                                    </div>
                                </div>
                                <div className="mt-4 inline-flex rounded-full border border-white/10 bg-black/20 px-3 py-1 text-[11px] font-semibold text-gray-400">
                                    Wersja {APP_VERSION}
                                </div>
                            </div>

                            <nav className="flex-1 px-4 py-5 space-y-2 overflow-y-auto">
                                <DesktopNavLink to="/" label="Aktualności" icon={<Home />} />
                                <DesktopNavLink to="/features" label="Moduły" icon={<LayoutGrid />} />
                                <DesktopNavLink to="/profile" label="Profil" icon={<User />} />
                                {userRoles.some(role => ['admin', 'moderator_users', 'moderator_content'].includes(role)) && (
                                    <DesktopNavLink to="/admin" label="Zarząd" icon={<ShieldAlert />} alert />
                                )}
                            </nav>
                        </aside>

                        <div className="flex min-h-0 flex-1 flex-col lg:min-w-0 lg:h-screen">
                        {/* Header z logo TEB */}
                        <header className="px-5 py-3.5 flex justify-between items-center bg-[#181818]/95 backdrop-blur-xl border-b border-white/5 fixed top-0 w-full max-w-md z-50 lg:hidden">
                            <div className="flex items-center gap-2.5">
                                <img src={LOGO_SMALL} alt={`${APP_NAME} logo`} className="w-8 h-8 rounded-xl object-cover" />
                                <div className="flex items-baseline gap-1.5">
                                    <h1 className="text-[17px] font-bold text-white leading-none">{APP_NAME}</h1>
                                    <span className="text-[10px] font-medium text-gray-600 leading-none">{APP_VERSION}</span>
                                </div>
                            </div>
                        </header>

                        <div className="hidden lg:flex items-center justify-between px-8 py-5 border-b border-white/5 bg-[#181818]/85 backdrop-blur-xl">
                            <div>
                                <div className="text-xl font-bold text-white">{APP_NAME}</div>
                                <div className="text-xs uppercase tracking-[0.24em] text-gray-500 mt-1">Desktop workspace</div>
                            </div>
                            <div className="rounded-full border border-white/10 bg-black/20 px-4 py-2 text-xs font-semibold text-gray-400">
                                {APP_VERSION}
                            </div>
                        </div>

                        {/* Zmienna zawartość z routingiem opartym na pod-modułach z folderu 'features' */}
                        <main className="flex-1 overflow-y-auto mt-16 mb-20 px-4 pt-4 lg:mt-0 lg:mb-0 lg:px-8 lg:py-8 lg:min-h-0">
                            <AppErrorBoundary>
                                <Suspense fallback={<RouteLoading />}>
                                    <Routes>
                                        <Route path="/" element={<Feed />} />
                                        <Route path="/features" element={<Features />} />
                                        <Route path="/profile" element={<Profile />} />
                                        <Route path="/profile/:userId" element={<PublicProfile />} />
                                        <Route path="/rewear" element={<ReWear />} />
                                        <Route path="/rewear/inbox" element={<ReWearInbox />} />
                                        <Route path="/librus" element={<Librus />} />
                                        <Route path="/tebtalk" element={<TEBtalk />} />
                                        <Route path="/groups" element={<Groups />} />
                                        <Route path="/admin" element={<Admin />} />
                                        <Route path="/privacy" element={<PrivacyPolicy />} />
                                    </Routes>
                                </Suspense>
                            </AppErrorBoundary>
                        </main>

                        {/* Proaktywna opcja instalacji aplikacji na telefon PWA */}
                        <InstallPrompt />

                        {/* Skrypt informujący o nowych wersjach z GitHuba do pobrania dla urządzenia */}
                        <ReloadPrompt />

                        {/* Bottom Navigation (Apple / Instagram Style) */}
                        <nav className="absolute bottom-0 w-full max-w-md bg-[#181818]/95 backdrop-blur-xl border-t border-white/5 pb-[env(safe-area-inset-bottom,20px)] pt-1 px-8 flex justify-between z-50 lg:hidden">
                            <NavLink to="/" icon={<Home />} />
                            <NavLink to="/features" icon={<LayoutGrid />} />
                            <NavLink to="/profile" icon={<User />} />
                            {userRoles.some(role => ['admin', 'moderator_users', 'moderator_content'].includes(role)) && <NavLink to="/admin" icon={<ShieldAlert />} alert />}
                        </nav>
                        </div>
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

function DesktopNavLink({ to, icon, label, alert }) {
    const location = useLocation();
    const isActive = location.pathname === to;
    return (
        <Link
            to={to}
            className={`flex items-center gap-3 rounded-2xl px-4 py-3 transition-all duration-150 border ${isActive ? 'border-primary/30 bg-primary/12 text-white shadow-lg shadow-primary/10' : 'border-transparent text-gray-400 hover:text-white hover:bg-white/[0.04]'}`}
        >
            <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${isActive ? 'bg-primary/20 text-primary' : alert ? 'bg-red-500/10 text-red-400' : 'bg-white/[0.04] text-gray-500'}`}>
                {React.cloneElement(icon, { className: 'w-5 h-5' })}
            </div>
            <div className="min-w-0">
                <div className="text-sm font-semibold leading-tight">{label}</div>
                <div className="text-[11px] text-gray-500 leading-tight mt-0.5">{to === '/' ? 'Start aplikacji' : to === '/features' ? 'Wszystkie sekcje' : to === '/profile' ? 'Konto i ustawienia' : 'Moderacja i zarządzanie'}</div>
            </div>
        </Link>
    )
}

export default App
