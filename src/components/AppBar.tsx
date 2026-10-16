import { useState, type ReactNode } from 'react'
import { useAuth } from '../auth/AuthProvider'
import { APP_NAME } from '../brand'
import { useAccount } from '../billing/AccountProvider'
import { PLAN_LABEL } from '../billing/plans'
import { useNav } from '../nav'

/** Barra do topo: marca, título da tela, ações (ex.: Salvo, Crochetar) e menu da usuária. */
export function AppBar({ title, onBack, children }: { title?: string; onBack?: () => void; children?: ReactNode }) {
  const { user, signOut } = useAuth()
  const [open, setOpen] = useState(false)
  const { account } = useAccount()
  const nav = useNav()
  if (!user) return null
  const initial = (user.name.trim()[0] ?? '?').toUpperCase()

  return (
    <header className="appbar">
      <div className="appbar__left">
        {onBack ? (
          <button className="appbar__brand" onClick={onBack} aria-label="Voltar ao início">
            <span aria-hidden>←</span> {APP_NAME}
          </button>
        ) : (
          <span className="appbar__brand appbar__brand--static"><img className="appbar__logo" src="/logo-symbol.svg" alt="" width={28} height={28} /> {APP_NAME}</span>
        )}
        {title && <span className="appbar__title">{title}</span>}
      </div>
      <div className="appbar__right">
        {children}
        <button className="avatar" onClick={() => setOpen((o) => !o)} aria-haspopup="menu" aria-expanded={open} aria-label="Menu da conta">{initial}</button>
        {open && (
          <div className="menu" role="menu">
            <p className="menu__who"><b>{user.name}</b>{user.demo ? <small>Modo demonstração</small> : <small>{user.email}</small>}</p>
            <button role="menuitem" className="menu__item" onClick={() => { setOpen(false); nav.goPlans() }}>
              Minha assinatura{account ? <small> · {PLAN_LABEL[account.effective]}</small> : null}
            </button>
            {account?.isAdmin && <button role="menuitem" className="menu__item" onClick={() => { setOpen(false); nav.goAdmin() }}>Painel de gestão</button>}
            <button role="menuitem" className="menu__item" onClick={signOut}>Sair</button>
          </div>
        )}
      </div>
    </header>
  )
}
