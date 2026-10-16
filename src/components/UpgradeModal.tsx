import { useEffect, useRef } from 'react'
import { useAccount } from '../billing/AccountProvider'
import { formatCents, priceCents } from '../billing/plans'

const PERKS = [
  { icon: '📷', title: 'Imagens sem limite', text: 'Transforme quantas fotos quiser em gráfico.' },
  { icon: '🧮', title: 'Calculadora de preço', text: 'Fio, materiais e horas entram; o preço certo da peça sai.' },
  { icon: '💬', title: 'Assistente de vendas', text: 'Cole a conversa da cliente e receba respostas prontas.' },
  { icon: '🧶', title: 'Tudo do Básico', text: 'Modelos, editor, modo Crochetar e lista de fios.' },
]

/** Janela que aparece por cima quando alguém toca numa função com cadeado (Plus). */
export function UpgradeModal({ onClose, onChoose }: { onClose: () => void; onChoose: () => void }) {
  const { account, reload } = useAccount()
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    closeRef.current?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [onClose])

  if (!account) return null
  const yearly = priceCents(account.prices, 'plus', 'yearly')

  return (
    <div className="modal" onClick={onClose}>
      <div className="modal__box" role="dialog" aria-modal="true" aria-labelledby="upgrade-title" onClick={(e) => e.stopPropagation()}>
        <button ref={closeRef} className="modal__close" onClick={onClose} aria-label="Fechar">✕</button>
        <em className="badge modal__tag">🔒 Plano Plus</em>
        <h2 id="upgrade-title">Precificar e responder clientes fica bem mais rápido com o Plus.</h2>
        <ul className="modal__perks">
          {PERKS.map((p) => (
            <li key={p.title}>
              <span aria-hidden>{p.icon}</span>
              <div><b>{p.title}</b><small>{p.text}</small></div>
            </li>
          ))}
        </ul>
        <div className="modal__price">
          <span>Plus anual</span>
          <b>{formatCents(yearly)}</b>
          <small>equivale a {formatCents(Math.round(yearly / 12))} por mês · também há plano mensal</small>
        </div>
        <button className="btn btn--primary" onClick={onChoose}>Quero o Plus</button>
        <div className="modal__links">
          <button className="linkbtn" onClick={onClose}>Agora não</button>
          <button className="linkbtn" onClick={() => void reload().then(onClose)}>Já assinei</button>
        </div>
      </div>
    </div>
  )
}
