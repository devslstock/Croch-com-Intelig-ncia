import { offlineDaysLeft } from '../billing/offlineAccount'
import type { Account } from '../billing/plans'
import type { SyncStatus } from '../storage/offlineCharts'

/** Faixa no topo: avisa quando está sem internet, quantos gráficos aguardam envio e o que a nuvem recusou. */
export function OfflineBanner({
  online, status, account, userId, onPlans, onDismiss,
}: {
  online: boolean
  status: SyncStatus
  account: Account | null
  userId: string
  onPlans: () => void
  onDismiss: () => void
}) {
  const pending = status.pending
  const daysLeft = account?.offline ? offlineDaysLeft(window.localStorage, userId) : null
  const lines: string[] = []
  if (!online) {
    lines.push('📴 Sem internet. Pode continuar usando o Tramado: os gráficos ficam salvos neste aparelho e vão para a nuvem quando a conexão voltar.')
  } else if (pending > 0) {
    lines.push(`☁️ Enviando ${pending} gráfico${pending === 1 ? '' : 's'} feito${pending === 1 ? '' : 's'} sem internet…`)
  }
  if (!online && pending > 0) lines.push(`${pending} aguardando envio.`)
  if (!online && daysLeft !== null && daysLeft <= 7) lines.push(`Conecte-se à internet em até ${daysLeft} dia${daysLeft === 1 ? '' : 's'} para confirmar a sua assinatura.`)

  if (lines.length === 0 && status.rejected.length === 0) return null
  return (
    <div className="offline-bar" role="status" aria-live="polite">
      {lines.length > 0 && <p>{lines.join(' ')}</p>}
      {status.rejected.length > 0 && (
        <p className="offline-bar__warn">
          {status.rejected.length === 1 ? `O gráfico “${status.rejected[0].name}”, feito sem internet, não pôde ser enviado:` : `${status.rejected.length} gráficos feitos sem internet não puderam ser enviados:`}{' '}
          {status.rejected[0].message} Eles continuam neste aparelho.{' '}
          <button className="linklike" onClick={onPlans}>Ver planos</button> · <button className="linklike" onClick={onDismiss}>Dispensar</button>
        </p>
      )}
    </div>
  )
}
