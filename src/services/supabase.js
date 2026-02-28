import { createClient } from '@supabase/supabase-js'

// Te klucze pobiera się z panelu Supabase -> Settings -> API po utworzeniu projektu
// Podczas deploymentu na Vercel będą one ukryte w variables (.env)
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'ZAMIEŃ_NA_SWOJ_URL_Z_SUPABASE'
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'ZAMIEŃ_NA_SWÓJ_ANON_KEY_Z_SUPABASE'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

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
