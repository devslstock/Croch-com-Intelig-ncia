import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { User as SbUser } from '@supabase/supabase-js'
import { authConfigured, supabase } from './supabase'
import { formatBrPhone, normalizeBrPhone } from './phone'

export interface AppUser {
  id: string
  email: string
  name: string
  /** Modo demonstração: nada vai para a nuvem. */
  demo: boolean
}

export interface AuthResult {
  ok: boolean
  /** Mensagem para a pessoa (erro ou aviso, ex.: "confirme seu e-mail"). */
  message?: string
}

interface AuthApi {
  user: AppUser | null
  loading: boolean
  configured: boolean
  signIn(email: string, password: string): Promise<AuthResult>
  signUp(name: string, email: string, password: string): Promise<AuthResult>
  signInWithGoogle(): Promise<AuthResult>
  signInWithApple(): Promise<AuthResult>
  /** Envia o código de 6 dígitos pelo WhatsApp. Sem senha. */
  sendWhatsAppCode(phone: string): Promise<AuthResult>
  verifyWhatsAppCode(phone: string, code: string): Promise<AuthResult>
  resetPassword(email: string): Promise<AuthResult>
  signOut(): Promise<void>
  startDemo(): void
}

const Ctx = createContext<AuthApi | null>(null)

const DEMO: AppUser = { id: 'demo', email: 'demo@local', name: 'Visitante', demo: true }

function fromSupabase(u: SbUser): AppUser {
  const email = u.email ?? ''
  const meta = (u.user_metadata ?? {}) as { name?: string; full_name?: string }
  const phone = u.phone ? formatBrPhone(u.phone.startsWith('+') ? u.phone : `+${u.phone}`) : ''
  return { id: u.id, email, name: meta.name || meta.full_name || email.split('@')[0] || phone || 'Artesã', demo: false }
}

/** Traduz os erros mais comuns do Supabase Auth. */
export function friendlyAuthError(message: string): string {
  const m = message.toLowerCase()
  if (m.includes('invalid login')) return 'E-mail ou senha incorretos.'
  if (m.includes('already registered') || m.includes('already been registered')) return 'Esse e-mail já tem conta. Use “Entrar”.'
  if (m.includes('email not confirmed')) return 'Confirme seu e-mail pelo link que enviamos e tente de novo.'
  if (m.includes('password') && m.includes('at least')) return 'A senha precisa ter pelo menos 8 caracteres.'
  if (m.includes('rate limit') || m.includes('too many')) return 'Muitas tentativas. Aguarde um pouco e tente de novo.'
  if (m.includes('invalid email') || m.includes('unable to validate email')) return 'Esse e-mail não parece válido.'
  if (m.includes('otp') && (m.includes('expired') || m.includes('invalid'))) return 'Código incorreto ou vencido. Peça um novo.'
  if (m.includes('failed to fetch') || m.includes('network')) return 'Sem conexão. Verifique a internet e tente de novo.'
  return 'Não foi possível concluir. Tente de novo em instantes.'
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null)
  const [loading, setLoading] = useState(authConfigured)

  useEffect(() => {
    if (!supabase) return
    let alive = true
    supabase.auth.getSession().then(({ data }) => {
      if (!alive) return
      setUser(data.session ? fromSupabase(data.session.user) : null)
      setLoading(false)
    })
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session ? fromSupabase(session.user) : null)
    })
    return () => {
      alive = false
      data.subscription.unsubscribe()
    }
  }, [])

  const signIn = useCallback<AuthApi['signIn']>(async (email, password) => {
    if (!supabase) return { ok: false, message: 'O login ainda não está configurado.' }
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    return error ? { ok: false, message: friendlyAuthError(error.message) } : { ok: true }
  }, [])

  const signUp = useCallback<AuthApi['signUp']>(async (name, email, password) => {
    if (!supabase) return { ok: false, message: 'O login ainda não está configurado.' }
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { name: name.trim() }, emailRedirectTo: window.location.origin },
    })
    if (error) return { ok: false, message: friendlyAuthError(error.message) }
    // Sem sessão = o projeto exige confirmar o e-mail antes do primeiro acesso.
    if (!data.session) return { ok: true, message: `Enviamos um link de confirmação para ${email.trim()}. Abra o e-mail e volte para entrar.` }
    return { ok: true }
  }, [])

  const signInWithGoogle = useCallback<AuthApi['signInWithGoogle']>(async () => {
    if (!supabase) return { ok: false, message: 'O login ainda não está configurado.' }
    const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin } })
    return error ? { ok: false, message: friendlyAuthError(error.message) } : { ok: true }
  }, [])

  const signInWithApple = useCallback<AuthApi['signInWithApple']>(async () => {
    if (!supabase) return { ok: false, message: 'O login ainda não está configurado.' }
    const { error } = await supabase.auth.signInWithOAuth({ provider: 'apple', options: { redirectTo: window.location.origin } })
    return error ? { ok: false, message: friendlyAuthError(error.message) } : { ok: true }
  }, [])

  const sendWhatsAppCode = useCallback<AuthApi['sendWhatsAppCode']>(async (phone) => {
    if (!supabase) return { ok: false, message: 'O login ainda não está configurado.' }
    const e164 = normalizeBrPhone(phone)
    if (!e164) return { ok: false, message: 'Digite o número com DDD, por exemplo (81) 99999-0000.' }
    const { error } = await supabase.auth.signInWithOtp({ phone: e164, options: { channel: 'whatsapp' } })
    return error ? { ok: false, message: friendlyAuthError(error.message) } : { ok: true, message: 'Enviamos um código de 6 dígitos para o seu WhatsApp.' }
  }, [])

  const verifyWhatsAppCode = useCallback<AuthApi['verifyWhatsAppCode']>(async (phone, code) => {
    if (!supabase) return { ok: false, message: 'O login ainda não está configurado.' }
    const e164 = normalizeBrPhone(phone)
    if (!e164) return { ok: false, message: 'Número inválido.' }
    const { error } = await supabase.auth.verifyOtp({ phone: e164, token: code.trim(), type: 'sms' })
    return error ? { ok: false, message: friendlyAuthError(error.message) } : { ok: true }
  }, [])

  const resetPassword = useCallback<AuthApi['resetPassword']>(async (email) => {
    if (!supabase) return { ok: false, message: 'O login ainda não está configurado.' }
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: window.location.origin })
    return error
      ? { ok: false, message: friendlyAuthError(error.message) }
      : { ok: true, message: 'Se esse e-mail tiver conta, enviamos um link para criar uma nova senha.' }
  }, [])

  const signOut = useCallback(async () => {
    if (supabase) await supabase.auth.signOut()
    setUser(null)
  }, [])

  const startDemo = useCallback(() => setUser(DEMO), [])

  const value = useMemo<AuthApi>(
    () => ({ user, loading, configured: authConfigured, signIn, signUp, signInWithGoogle, signInWithApple, sendWhatsAppCode, verifyWhatsAppCode, resetPassword, signOut, startDemo }),
    [user, loading, signIn, signUp, signInWithGoogle, signInWithApple, sendWhatsAppCode, verifyWhatsAppCode, resetPassword, signOut, startDemo],
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useAuth(): AuthApi {
  const v = useContext(Ctx)
  if (!v) throw new Error('useAuth fora do AuthProvider')
  return v
}
