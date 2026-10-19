import { useEffect, useState } from 'react'

/** `true` quando o aparelho diz que há internet. Atualiza sozinho quando a conexão cai ou volta. */
export function useOnline(): boolean {
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine))
  useEffect(() => {
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])
  return online
}

/** O aplicativo já está guardado no aparelho (service worker pronto)? Só na versão publicada. */
export function useOfflineReady(): boolean {
  const [ready, setReady] = useState(false)
  useEffect(() => {
    if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return
    let alive = true
    navigator.serviceWorker.ready
      .then(() => caches.keys())
      .then((keys) => alive && setReady(keys.some((k) => k.startsWith('tramado-'))))
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [])
  return ready
}
