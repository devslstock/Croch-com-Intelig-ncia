import { useCallback, useEffect, useState } from 'react'

/** Telas para quem ainda não entrou. O endereço (#...) permite divulgar cada uma. */
export type PublicRoute =
  | { page: 'landing' }
  | { page: 'login'; mode: 'entrar' | 'criar'; coupon: string }

/**
 *   #saiba-mais            → página de apresentação
 *   #criar  /  #criar&cupom=BEMVINDA10  → criar conta (com cupom já preenchido)
 *   qualquer outra coisa   → entrar
 */
export function parseHash(hash: string): PublicRoute {
  const [head, ...rest] = hash.replace(/^#/, '').split('&')
  if (head === 'saiba-mais') return { page: 'landing' }
  const params = new URLSearchParams(rest.join('&'))
  const coupon = (params.get('cupom') ?? '').toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 32)
  return { page: 'login', mode: head === 'criar' ? 'criar' : 'entrar', coupon }
}

export function hashFor(r: PublicRoute): string {
  if (r.page === 'landing') return '#saiba-mais'
  if (r.mode === 'criar') return r.coupon ? `#criar&cupom=${encodeURIComponent(r.coupon)}` : '#criar'
  return '#entrar'
}

export function usePublicRoute(): [PublicRoute, (r: PublicRoute) => void] {
  const [route, setRoute] = useState<PublicRoute>(() => parseHash(window.location.hash))
  useEffect(() => {
    const on = () => {
      setRoute(parseHash(window.location.hash))
      window.scrollTo(0, 0)
    }
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  const go = useCallback((r: PublicRoute) => {
    window.location.hash = hashFor(r)
  }, [])
  return [route, go]
}
