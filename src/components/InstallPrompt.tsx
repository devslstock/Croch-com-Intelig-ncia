import { useEffect, useState } from 'react'

interface InstallEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const DISMISS_KEY = 'tramado:install:dismissed'

const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true

/** Convite para instalar o Tramado no aparelho: abre pela tela inicial e funciona sem internet. */
export function InstallPrompt() {
  const [evt, setEvt] = useState<InstallEvent | null>(null)
  const [hidden, setHidden] = useState(() => {
    try {
      return window.localStorage.getItem(DISMISS_KEY) === '1'
    } catch {
      return false
    }
  })
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent)

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault()
      setEvt(e as InstallEvent)
    }
    const onInstalled = () => setEvt(null)
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  if (hidden || isStandalone() || (!evt && !ios)) return null

  const dismiss = () => {
    setHidden(true)
    try {
      window.localStorage.setItem(DISMISS_KEY, '1')
    } catch {
      /* sem armazenamento */
    }
  }
  const install = async () => {
    if (!evt) return
    await evt.prompt()
    await evt.userChoice.catch(() => undefined)
    setEvt(null)
  }

  return (
    <aside className="install" aria-label="Instalar o aplicativo">
      <b>📲 Instale o Tramado no seu aparelho</b>
      <span>Fica na tela inicial, abre mais rápido e funciona sem internet.</span>
      {evt ? (
        <button className="btn btn--primary" onClick={() => void install()}>Instalar agora</button>
      ) : (
        <span>No iPhone: toque em <b>Compartilhar</b> e depois em <b>Adicionar à Tela de Início</b>.</span>
      )}
      <button className="linklike" onClick={dismiss}>Agora não</button>
    </aside>
  )
}
