import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

/** Só existe quando as duas variáveis estão configuradas (chave pública/anon: pode ir no navegador). */
export const supabase: SupabaseClient | null = url && key ? createClient(url, key) : null
export const authConfigured = supabase !== null
export const googleEnabled = import.meta.env.VITE_GOOGLE_AUTH === 'true'
export const appleEnabled = import.meta.env.VITE_APPLE_AUTH === 'true'
export const whatsappEnabled = import.meta.env.VITE_WHATSAPP_AUTH === 'true'
