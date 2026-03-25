import { createClient } from '@supabase/supabase-js'

// Te klucze pobiera się z panelu Supabase -> Settings -> API po utworzeniu projektu
// Podczas deploymentu na Vercel będą one ukryte w variables (.env)
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

let supabaseInstance

try {
    if (!supabaseUrl || !supabaseAnonKey || supabaseUrl.includes('ZAMIEŃ')) {
        console.warn('Supabase credentials missing or invalid. App will run in limited mode.')
        throw new Error('Missing credentials')
    }
    supabaseInstance = createClient(supabaseUrl, supabaseAnonKey)
} catch (e) {
    // Fallback mock to prevent app crash on import
    supabaseInstance = {
        auth: {
            getSession: () => Promise.resolve({ data: { session: null }, error: null }),
            onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => { } } } }),
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
        }
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
