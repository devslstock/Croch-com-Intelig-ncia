import { useEffect, useRef, useState, type FormEvent } from 'react'
import { fillTokens, findAnswer, whatsappLink, type ChatItem, type PublicInfo } from '../landing/chatbot'

interface Msg {
  id: number
  from: 'bot' | 'me'
  text: string
  /** Mostra o botão de WhatsApp junto da mensagem (resposta "não achei"). */
  wa?: boolean
}

/**
 * Chat de dúvidas para quem ainda não entrou. As perguntas e respostas vêm do painel de gestão:
 * a pessoa toca numa pergunta ou escreve a dela, e o robô procura a resposta cadastrada mais parecida.
 */
export function ChatBot({ info }: { info: PublicInfo }) {
  const [open, setOpen] = useState(false)
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [text, setText] = useState('')
  const [typing, setTyping] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const idRef = useRef(0)
  const timer = useRef<number | undefined>(undefined)
  const { config, items, prices } = info

  const push = (m: Omit<Msg, 'id'>) => setMsgs((x) => [...x, { ...m, id: ++idRef.current }])

  useEffect(() => {
    if (open && msgs.length === 0) push({ from: 'bot', text: config.greeting })
    // só na primeira abertura
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [msgs, typing, open])
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])
  useEffect(() => () => window.clearTimeout(timer.current), [])

  const reply = (question: string, item: ChatItem | null) => {
    push({ from: 'me', text: question })
    setTyping(true)
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      setTyping(false)
      if (item) push({ from: 'bot', text: fillTokens(item.answer, prices) })
      else push({ from: 'bot', text: config.fallback, wa: true })
    }, 550)
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const q = text.trim()
    if (!q) return
    setText('')
    reply(q, findAnswer(q, items))
  }

  const wa = config.whatsapp ? whatsappLink(config.whatsapp, 'Olá! Tenho uma dúvida sobre o Tramado.') : ''

  return (
    <>
      {!open && (
        <button className="chat__fab" onClick={() => { setOpen(true); window.setTimeout(() => inputRef.current?.focus(), 50) }} aria-haspopup="dialog">
          <span aria-hidden>💬</span> Dúvidas?
        </button>
      )}
      {open && (
        <section className="chat" role="dialog" aria-label="Chat de dúvidas do Tramado">
          <header className="chat__head">
            <span className="chat__avatar" aria-hidden>🧶</span>
            <span className="chat__title"><b>Assistente do Tramado</b><small>Respostas na hora</small></span>
            <button className="chat__close" onClick={() => setOpen(false)} aria-label="Fechar o chat">✕</button>
          </header>

          <div className="chat__log" role="log" aria-live="polite">
            {msgs.map((m) => (
              <div key={m.id} className={`chat__msg chat__msg--${m.from}`}>
                <p>{m.text}</p>
                {m.wa && wa && <a className="btn btn--sm chat__wa" href={wa} target="_blank" rel="noopener noreferrer">Falar no WhatsApp</a>}
              </div>
            ))}
            {typing && <div className="chat__msg chat__msg--bot chat__typing" aria-label="Digitando"><span /><span /><span /></div>}
            <div ref={endRef} />
          </div>

          {items.length > 0 && (
            <div className="chat__chips" aria-label="Perguntas frequentes">
              {items.map((it) => (
                <button key={it.id} className="chat__chip" onClick={() => reply(it.question, it)} disabled={typing}>{it.question}</button>
              ))}
            </div>
          )}

          <form className="chat__form" onSubmit={submit}>
            <input ref={inputRef} className="input" value={text} onChange={(e) => setText(e.target.value)} placeholder="Escreva sua dúvida…" maxLength={200} aria-label="Escreva sua dúvida" />
            <button className="btn btn--primary" type="submit" disabled={!text.trim() || typing}>Enviar</button>
          </form>
          {wa && <a className="chat__human" href={wa} target="_blank" rel="noopener noreferrer">Prefere falar com uma pessoa? Chamar no WhatsApp</a>}
        </section>
      )}
    </>
  )
}
