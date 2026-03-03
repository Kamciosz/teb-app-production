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
        from: () => ({
            select: () => ({
                eq: () => ({
                    single: () => Promise.resolve({ data: null, error: null })
                }),
                order: () => Promise.resolve({ data: [], error: null })
            }),
            insert: () => Promise.resolve({ error: new Error('Supabase not configured') }),
            delete: () => ({ eq: () => ({ eq: () => Promise.resolve({ error: new Error('Supabase not configured') }) }) }),
            upsert: () => Promise.resolve({ error: new Error('Supabase not configured') })
        })
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
