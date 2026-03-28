import { createClient } from '@supabase/supabase-js'

// Te klucze pobiera się z panelu Supabase -> Settings -> API po utworzeniu projektu
// Podczas deploymentu na Vercel będą one ukryte w variables (.env)
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

let supabaseInstance

function decodeJwtPayload(token) {
    try {
        const [, payload] = token.split('.')
        if (!payload) return null
        const normalized = payload.replace(/-/g, '+').replace(/_/g, '/')
        const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')
        return JSON.parse(atob(padded))
    } catch {
        return null
    }
}

function normalizeSession(session) {
    if (!session?.access_token) return null

    const payload = decodeJwtPayload(session.access_token)
    const expiresAt = session.expires_at || payload?.exp || null
    const expiresIn = session.expires_in || (expiresAt ? Math.max(expiresAt - Math.floor(Date.now() / 1000), 0) : null)

    return {
        access_token: session.access_token,
        expires_at: expiresAt,
        expires_in: expiresIn,
        token_type: session.token_type || 'bearer',
        user: session.user || null
    }
}

async function parseJsonResponse(response) {
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) {
        const error = new Error(payload?.error || 'Request failed')
        error.status = response.status
        throw error
    }
    return payload
}

async function postJson(url, body) {
    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body || {})
    })
    return parseJsonResponse(response)
}

try {
    if (!supabaseUrl || !supabaseAnonKey || supabaseUrl.includes('ZAMIEŃ')) {
        console.warn('Supabase credentials missing or invalid. App will run in limited mode.')
        throw new Error('Missing credentials')
    }

    let currentSession = null
    let bootstrapPromise = null
    let refreshPromise = null
    const authListeners = new Set()

    const notifyAuthListeners = (event, session) => {
        for (const listener of authListeners) {
            Promise.resolve().then(() => listener(event, session)).catch(error => {
                console.error('Auth state listener error:', error)
            })
        }
    }

    const updateSession = (session, event) => {
        currentSession = normalizeSession(session)
        if (event) {
            notifyAuthListeners(event, currentSession)
        }
        return currentSession
    }

    const fetchServerSession = async (emitEvent = false) => {
        const response = await fetch('/api/auth/session', {
            method: 'GET',
            headers: { 'Cache-Control': 'no-store' }
        })

        const payload = await parseJsonResponse(response)
        const nextSession = normalizeSession(payload.session)
        const previousToken = currentSession?.access_token || null
        const nextToken = nextSession?.access_token || null

        currentSession = nextSession

        if (emitEvent && previousToken !== nextToken) {
            notifyAuthListeners(nextSession ? 'TOKEN_REFRESHED' : 'SIGNED_OUT', nextSession)
        }

        return currentSession
    }

    const ensureBootstrapped = async () => {
        if (!bootstrapPromise) {
            bootstrapPromise = fetchServerSession(false).catch(error => {
                currentSession = null
                throw error
            })
        }
        try {
            return await bootstrapPromise
        } catch {
            return null
        }
    }

    const ensureFreshSession = async () => {
        await ensureBootstrapped()

        const expiresAt = currentSession?.expires_at || 0
        const now = Math.floor(Date.now() / 1000)
        if (!currentSession || !expiresAt || expiresAt - now > 60) {
            return currentSession
        }

        if (!refreshPromise) {
            refreshPromise = fetchServerSession(true).finally(() => {
                refreshPromise = null
            })
        }

        try {
            return await refreshPromise
        } catch {
            return null
        }
    }

    const dataClient = createClient(supabaseUrl, supabaseAnonKey, {
        accessToken: async () => {
            const session = await ensureFreshSession()
            return session?.access_token || supabaseAnonKey
        },
        auth: {
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false
        }
    })

    dataClient.auth = {
        getSession: async () => {
            const session = await ensureBootstrapped()
            return { data: { session }, error: null }
        },
        onAuthStateChange: (callback) => {
            authListeners.add(callback)
            ensureBootstrapped().then(session => callback('INITIAL_SESSION', session)).catch(() => {
                callback('INITIAL_SESSION', null)
            })
            return {
                data: {
                    subscription: {
                        unsubscribe: () => authListeners.delete(callback)
                    }
                }
            }
        },
        signInWithPassword: async ({ email, password }) => {
            const payload = await postJson('/api/auth/login', { email, password })
            const session = updateSession(payload.session, 'SIGNED_IN')
            return { data: { session, user: payload.user || session?.user || null }, error: null }
        },
        signUp: async ({ email, password, options }) => {
            const payload = await postJson('/api/auth/signup', {
                email,
                password,
                fullName: options?.data?.full_name || ''
            })
            return { data: payload, error: null }
        },
        signOut: async () => {
            await postJson('/api/auth/logout', {})
            updateSession(null, 'SIGNED_OUT')
            return { error: null }
        },
        resetPasswordForEmail: async (email, options = {}) => {
            await postJson('/api/auth/reset-password', {
                email,
                redirectTo: options.redirectTo
            })
            return { data: { ok: true }, error: null }
        }
    }

    supabaseInstance = dataClient
} catch (e) {
    // Fallback mock to prevent app crash on import
    supabaseInstance = {
        auth: {
            getSession: () => Promise.resolve({ data: { session: null }, error: null }),
            onAuthStateChange: (callback) => {
                callback('INITIAL_SESSION', null)
                return { data: { subscription: { unsubscribe: () => { } } } }
            },
            signInWithPassword: () => Promise.reject(new Error('Supabase not configured correctly')),
            signUp: () => Promise.reject(new Error('Supabase not configured correctly')),
            signOut: () => Promise.resolve({ error: null }),
            resetPasswordForEmail: () => Promise.resolve({ error: null })
        },
        from: () => {
            const notConfiguredError = new Error('Supabase not configured')
            const chain = () => ({
                eq: chain,
                neq: chain,
                in: chain,
                ilike: chain,
                lt: chain,
                lte: chain,
                gt: chain,
                or: chain,
                order: chain,
                limit: chain,
                select: chain,
                single: () => Promise.resolve({ data: null, error: notConfiguredError }),
                then: (resolve, reject) => Promise.resolve({ data: null, error: notConfiguredError, count: 0 }).then(resolve, reject),
            })
            return {
                select: chain,
                insert: () => ({ ...chain(), select: chain }),
                update: () => chain(),
                upsert: () => Promise.resolve({ error: notConfiguredError }),
                delete: () => chain(),
            }
        },
        rpc: () => Promise.resolve({ data: null, error: new Error('Supabase not configured') })
    }
}

export const supabase = supabaseInstance

// Logowanie Tradycyjne
export async function signInWithEmail(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
    })
    if (error) throw error
    return data
}

// Rejestracja Tradycyjna
export async function signUpWithEmail(email, password, fullName) {
    const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
            data: {
                full_name: fullName
            }
        }
    })
    if (error) throw error
    return data
}

// Globalny wylogowywacz
export async function signOut() {
    const { error } = await supabase.auth.signOut()
    if (error) throw error
    window.location.reload()
}
