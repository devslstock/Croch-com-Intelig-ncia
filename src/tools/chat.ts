/**
 * Assistente de vendas: lê a conversa colada, identifica o que a cliente quer e monta respostas sugeridas.
 * Tudo por regras simples, no próprio aparelho (sem IA e sem enviar a conversa para lugar nenhum).
 */
import { money } from './pricing'
import type { ShopSettings } from './storage'

export type Intent =
  | 'preco' | 'prazo' | 'envio' | 'desconto' | 'pagamento' | 'personalizar'
  | 'duvida' | 'fechar' | 'urgente' | 'problema' | 'agradecimento' | 'sumiu'

export const INTENT_LABEL: Record<Intent, string> = {
  preco: 'Quer o preço',
  prazo: 'Pergunta o prazo',
  envio: 'Pergunta do envio',
  desconto: 'Pede desconto',
  pagamento: 'Pagamento',
  personalizar: 'Personalização',
  duvida: 'Está pensando',
  fechar: 'Quer fechar',
  urgente: 'Tem pressa',
  problema: 'Problema com a peça',
  agradecimento: 'Elogio / agradecimento',
  sumiu: 'Sem resposta da cliente',
}

export interface ChatLine {
  sender: string | null
  text: string
}

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

// [12/03/2025 14:32] Nome: texto   |   12/03/25 14:32 - Nome: texto   |   14:32 - Nome: texto
const WA_PREFIXES = [
  /^\[?\d{1,2}[/.]\d{1,2}[/.]\d{2,4},?\s+\d{1,2}:\d{2}(?::\d{2})?(?:\s?[ap]\.?m\.?)?\]?\s*[-–]?\s*([^:]{1,40}?):\s?(.*)$/i,
  /^\[?\d{1,2}:\d{2}(?::\d{2})?\]?\s*[-–]\s*([^:]{1,40}?):\s?(.*)$/,
]
const PLAIN_PREFIX = /^([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ0-9 ._'-]{0,30}):\s+(.+)$/
const SYSTEM_LINE = /(mensagens e chamadas s[aã]o protegidas|criptografia de ponta|<m[ií]dia oculta>|<media omitted>)/i

/** Separa a conversa em mensagens. Aceita exportação do WhatsApp, "Nome: texto" ou texto solto. */
export function parseMessages(raw: string): ChatLine[] {
  const lines = raw.replace(/\r/g, '').replace(/[‎‏]/g, '').split('\n')
  const out: ChatLine[] = []
  let wa = 0
  for (const l of lines) if (WA_PREFIXES.some((r) => r.test(l.trim()))) wa++

  // "Nome: texto" só vale como conversa se aparecerem pelo menos 2 nomes diferentes
  const plainNames = new Set<string>()
  for (const l of lines) {
    const m = PLAIN_PREFIX.exec(l.trim())
    if (m) plainNames.add(m[1].trim())
  }
  const usePlain = wa === 0 && plainNames.size >= 2

  for (const line of lines) {
    const l = line.trim()
    if (!l) continue
    let sender: string | null = null
    let text = l
    let matched = false
    if (wa > 0) {
      for (const r of WA_PREFIXES) {
        const m = r.exec(l)
        if (m) {
          sender = m[1].trim()
          text = m[2].trim()
          matched = true
          break
        }
      }
    } else if (usePlain) {
      const m = PLAIN_PREFIX.exec(l)
      if (m) {
        sender = m[1].trim()
        text = m[2].trim()
        matched = true
      }
    }
    if (SYSTEM_LINE.test(text)) continue
    if (matched || out.length === 0) {
      out.push({ sender, text })
    } else if (sender === null && (wa > 0 || usePlain)) {
      out[out.length - 1].text += `\n${text}` // continuação da mensagem anterior
    } else {
      out.push({ sender: null, text })
    }
  }
  return out.filter((m) => m.text.length > 0)
}

const INTENT_RULES: Array<[Intent, RegExp]> = [
  ['problema', /\b(reclam\w*|defeito|estragou|estragado|errad[oa]s?|nao gostei|nao chegou|atrasou|atrasad[oa]|devolv\w*|troca\w*|rasgou|descosturou|desmanchou|manchad[oa])\b/],
  ['preco', /\b(quanto|valor|valores|preco|precos|custa|custaria|orcamento|tabela)\b/],
  ['prazo', /\b(prazo|demora|demoraria|quando (fica|ficaria|estaria|esta|pode|consegue)\w*|fica pronto|ficar pronto|tempo de producao|entrega ate|ate dia|pra dia|para dia|pro dia)\b/],
  ['envio', /\b(frete|envio|enviar|enviam|correios?|sedex|pac|cep|retirada|retirar|motoboy|entregam?)\b/],
  ['desconto', /\b(desconto|mais barato|abaixar|baixar|caro|cara|faz por|pode fazer por|melhor preco|ultimo preco|menos)\b/],
  ['pagamento', /\b(pix|cartao|parcel\w*|boleto|pagar|pagamento|sinal|entrada|credito|debito)\b/],
  ['personalizar', /\b(personaliz\w*|nome|iniciais?|cor|cores|tamanho|bordad[oa]|com a foto|desenho|escrito)\b/],
  ['duvida', /\b(vou pensar|vou ver|deixa eu ver|deixa eu pensar|depois eu|te aviso|preciso falar com|vou conversar)\b/],
  ['fechar', /\b(quero|vou querer|fechado|fechou|combinado|pode fazer|pode ser|encomendar|encomenda|como (faco|fazemos) (pra|para)|bora)\b/],
  ['urgente', /\b(urgente|urgencia|correndo|o quanto antes|amanha|hoje)\b/],
  ['agradecimento', /\b(obrigad[oa]|chegou|amei|adorei|lind[oa]|perfeit[oa]|maravilhos[oa])\b/],
]

export const INTENT_ORDER: Intent[] = ['problema', 'sumiu', 'agradecimento', 'urgente', 'fechar', 'preco', 'desconto', 'prazo', 'pagamento', 'envio', 'personalizar', 'duvida']

const PRODUCTS = [
  'manta', 'tapete', 'bolsa', 'amigurumi', 'ursinho', 'naninha', 'touca', 'sousplat', 'cesto', 'porta-copos', 'jogo americano',
  'colete', 'blusa', 'cachecol', 'gorro', 'necessaire', 'chaveiro', 'boneca', 'coberta', 'almofada', 'cortina', 'vestido', 'cropped', 'toalha',
]

export interface Deadline {
  label: string
  daysAway: number
}

export interface Analysis {
  lines: ChatLine[]
  customerName: string | null
  /** Texto da cliente que ainda não foi respondido (ou toda a conversa, se for só um texto colado). */
  customerText: string
  lastFromMe: boolean
  intents: Intent[]
  product: string | null
  quantity: number | null
  deadline: Deadline | null
}

const firstWord = (s: string) => s.trim().split(/\s+/)[0]
const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1).toLowerCase() : s)

function dayDiff(from: Date, to: Date) {
  const a = Date.UTC(from.getFullYear(), from.getMonth(), from.getDate())
  const b = Date.UTC(to.getFullYear(), to.getMonth(), to.getDate())
  return Math.round((b - a) / 86_400_000)
}

const pad = (n: number) => String(n).padStart(2, '0')

function findDeadline(text: string, now: Date): Deadline | null {
  const t = norm(text)
  const full = /\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/.exec(t)
  if (full) {
    const d = Number(full[1])
    const m = Number(full[2])
    if (d >= 1 && d <= 31 && m >= 1 && m <= 12) {
      let y = full[3] ? Number(full[3]) : now.getFullYear()
      if (y < 100) y += 2000
      let date = new Date(y, m - 1, d)
      if (!full[3] && dayDiff(now, date) < 0) date = new Date(y + 1, m - 1, d)
      return { label: `${pad(d)}/${pad(m)}`, daysAway: dayDiff(now, date) }
    }
  }
  const day = /\b(?:dia|ate o dia|pro dia|pra dia|para o dia)\s+(\d{1,2})\b/.exec(t)
  if (day) {
    const d = Number(day[1])
    if (d >= 1 && d <= 31) {
      let date = new Date(now.getFullYear(), now.getMonth(), d)
      if (dayDiff(now, date) < 0) date = new Date(now.getFullYear(), now.getMonth() + 1, d)
      return { label: `${pad(date.getDate())}/${pad(date.getMonth() + 1)}`, daysAway: dayDiff(now, date) }
    }
  }
  const n = /\b(?:em|ate|daqui a|dentro de)\s+(\d{1,3})\s+dias\b/.exec(t)
  if (n) {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + Number(n[1]))
    return { label: `${pad(date.getDate())}/${pad(date.getMonth() + 1)}`, daysAway: Number(n[1]) }
  }
  return null
}

export function analyze(raw: string, myName: string, now: Date = new Date()): Analysis {
  const lines = parseMessages(raw)
  const me = norm(myName).trim()
  const isMe = (sender: string | null) => !!sender && !!me && (norm(sender).includes(me) || me.includes(norm(sender)))

  const senders = [...new Set(lines.map((l) => l.sender).filter((s): s is string => !!s))]
  let lastFromMe = false
  let customerSender: string | null = null
  if (senders.length >= 2 || (senders.length === 1 && me)) {
    if (me && senders.some(isMe)) {
      customerSender = senders.find((s) => !isMe(s)) ?? null
      lastFromMe = isMe(lines[lines.length - 1]?.sender ?? null)
    } else {
      // sem saber quem é você, a última mensagem é da cliente
      customerSender = lines[lines.length - 1]?.sender ?? null
    }
  } else if (senders.length === 1 && !me) {
    customerSender = senders[0]
  }

  // mensagens da cliente que ainda não foram respondidas
  let customerLines: ChatLine[]
  if (customerSender) {
    customerLines = lines.filter((l) => l.sender === customerSender)
    if (!lastFromMe) {
      let i = lines.length
      while (i > 0 && lines[i - 1].sender === customerSender) i--
      const tail = lines.slice(i)
      if (tail.length) customerLines = tail
    }
  } else {
    customerLines = lines
  }
  const customerText = customerLines.map((l) => l.text).join('\n')
  const n = norm(customerText)

  const found = new Set<Intent>()
  for (const [intent, re] of INTENT_RULES) if (re.test(n)) found.add(intent)
  if (lastFromMe) found.add('sumiu')
  // "pode ser" sozinho dentro de um pedido de preço não é fechamento
  if (found.has('preco') && found.has('fechar') && !/\b(quero|vou querer|fechado|fechou|combinado|encomendar)\b/.test(n)) found.delete('fechar')
  if (found.has('problema')) for (const x of ['preco', 'fechar', 'desconto', 'personalizar', 'agradecimento'] as Intent[]) found.delete(x)
  const intents = INTENT_ORDER.filter((i) => found.has(i))

  let customerName: string | null = null
  const intro = /\b(?:me chamo|meu nome e|sou (?:a|o))\s+([a-z]{2,})/.exec(n)
  if (customerSender && !/^\+?[\d\s()-]+$/.test(customerSender)) customerName = cap(firstWord(customerSender))
  else if (intro) customerName = cap(intro[1])

  const whole = norm(lines.map((l) => l.text).join('\n'))
  const product = PRODUCTS.find((p) => new RegExp(`\\b${p}s?\\b`).test(whole)) ?? null
  const q = /\b(\d{1,3})\s*(?:unidades?|pecas?|un|kits?)\b/.exec(n)
  const words: Record<string, number> = { duas: 2, dois: 2, tres: 3, quatro: 4, cinco: 5 }
  const qw = /\b(duas|dois|tres|quatro|cinco)\s+\w+/.exec(n)
  const quantity = q ? Number(q[1]) : qw ? words[qw[1]] : null

  return { lines, customerName, customerText, lastFromMe, intents, product, quantity, deadline: findDeadline(customerText, now) }
}

export type Tone = 'simpatica' | 'direta' | 'elegante'
export const TONE_LABEL: Record<Tone, string> = { simpatica: 'Simpática', direta: 'Direta', elegante: 'Elegante' }

export interface PriceInfo {
  price: number | null
  minPrice: number | null
  deposit: number | null
  days: number | null
}

export interface ReplyOptions {
  tone: Tone
  emoji: boolean
  price: PriceInfo
  settings: ShopSettings
}

export interface Variant {
  id: 'completa' | 'curta' | 'fechar'
  label: string
  text: string
}

export interface Suggestion {
  variants: Variant[]
  warnings: string[]
}

interface Block {
  long: string
  short: string
}

const clean = (s: string) =>
  s
    .replace(/[ \t]+/g, ' ')
    .replace(/ +([,.!?;:])/g, '$1')
    .replace(/ +\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

export function buildReplies(a: Analysis, o: ReplyOptions): Suggestion {
  const warnings: string[] = []
  const warn = (w: string) => {
    if (!warnings.includes(w)) warnings.push(w)
  }
  const e = (x: string) => (o.emoji ? ` ${x}` : '')
  const { tone, settings, price } = o
  const name = a.customerName ?? '[nome da cliente]'
  if (!a.customerName) warn('Não achei o nome da cliente: troque [nome da cliente] ou preencha o campo Nome.')

  const piece = a.product ? `${a.quantity && a.quantity > 1 ? `${a.quantity} ` : 'a '}${a.product}${a.quantity && a.quantity > 1 ? 's' : ''}` : 'a peça'
  const has = (i: Intent) => a.intents.includes(i)

  const hello =
    tone === 'direta' ? `Olá, ${name}.` : tone === 'elegante' ? `Olá, ${name}, tudo bem?` : `Oi, ${name}! Tudo bem?${e('😊')}`
  const bye =
    tone === 'direta' ? 'Fico à disposição.' : tone === 'elegante' ? 'Agradeço o contato e fico à disposição.' : `Qualquer dúvida, é só me chamar!${e('💕')}`

  const priceText = price.price != null ? money(price.price) : '[valor]'
  if (price.price == null && (has('preco') || has('desconto') || has('fechar'))) warn('Sem preço: escolha um orçamento salvo ou digite o valor para completar a resposta.')

  const sinalPct = settings.depositPct
  const deposit = price.deposit ?? (price.price != null ? Math.round(price.price * sinalPct) / 100 : null)
  const depositText = deposit != null ? money(deposit) : '[valor do sinal]'

  const blocks = new Map<Intent, Block>()

  blocks.set('preco', {
    long: `O valor para ${piece} é ${priceText}, feita à mão, do zero, no tamanho e nas cores que você escolher.`,
    short: `O valor é ${priceText}.`,
  })

  // prazo
  const std = settings.standardDays
  let prazoLong = `O prazo de produção é de ${std} dias corridos depois da confirmação.`
  if (a.deadline) {
    if (a.deadline.daysAway < 0) {
      warn(`A data pedida (${a.deadline.label}) já passou: confira com a cliente.`)
    } else if (a.deadline.daysAway >= std) {
      prazoLong = `Para o dia ${a.deadline.label} dá tempo, sim! Meu prazo é de ${std} dias corridos depois da confirmação.`
    } else {
      warn(`Ela quer a peça em ${a.deadline.daysAway} dias e o seu prazo padrão é ${std}. Só prometa se conseguir cumprir.`)
      prazoLong = `Para o dia ${a.deadline.label} fica apertado: meu prazo normal é de ${std} dias. [Diga se consegue encurtar ou sugira outra data]`
    }
  }
  blocks.set('prazo', { long: prazoLong, short: `Prazo: ${std} dias corridos depois da confirmação.` })

  // pagamento
  let pagLong = `Para reservar a data, peço um sinal de ${sinalPct}% (${depositText}) e o restante na entrega.`
  if (settings.pixKey.trim()) pagLong += `\nChave Pix: ${settings.pixKey.trim()}`
  else if (has('pagamento') || has('fechar')) warn('Preencha sua chave Pix em “Seus dados” para ela entrar na resposta.')
  blocks.set('pagamento', { long: pagLong, short: `Sinal de ${sinalPct}% (${depositText}) e o restante na entrega.` })

  // envio
  const ship = settings.shipping.trim()
  if (!ship && has('envio')) warn('Preencha “Envio e retirada” em “Seus dados” para completar essa parte.')
  blocks.set('envio', { long: ship || '[explique frete, prazo de envio ou retirada]', short: ship || '[envio / retirada]' })

  // desconto
  if (price.price != null && price.minPrice != null) {
    const room = Math.floor(((price.price - price.minPrice) / price.price) * 100)
    const pct = Math.min(10, room)
    if (pct >= 3) {
      const novo = Math.round(price.price * (1 - pct / 100) * 100) / 100
      blocks.set('desconto', {
        long: `O valor da peça é ${priceText}. Como cada uma é feita à mão, ele já é bem justo, mas consigo um desconto de ${pct}% no Pix à vista, ficando ${money(novo)}.`,
        short: `Consigo ${pct}% no Pix à vista: ${money(novo)}.`,
      })
    } else {
      warn('Quase não há margem para desconto: o preço já está perto do seu mínimo.')
      blocks.set('desconto', {
        long: 'O valor já está no meu limite, porque cada peça é feita à mão. Se quiser, posso adaptar a peça (tamanho menor ou menos cores) para caber no seu orçamento.',
        short: 'O valor já está no limite, mas posso adaptar tamanho ou cores para caber no seu orçamento.',
      })
    }
  } else {
    if (has('desconto')) warn('Sem o preço mínimo não sei até quanto dá para baixar. Salve o orçamento na Calculadora de preço ou digite o preço mínimo.')
    blocks.set('desconto', {
      long: 'Cada peça é feita à mão, então o valor já é bem justo. [Diga qual desconto consegue dar]',
      short: '[desconto possível]',
    })
  }

  blocks.set('personalizar', {
    long: 'Faço personalizado, sim! Me conta: o nome ou a escrita, as cores, o tamanho e para quando você precisa.',
    short: 'Faço personalizado! Me passe nome, cores, tamanho e a data.',
  })
  blocks.set('duvida', {
    long: 'Sem pressa, pode pensar com calma! Se quiser, mando fotos de peças prontas para ajudar na escolha. Quando decidir, é só me avisar que eu reservo a data.',
    short: 'Sem pressa! Quando decidir, me avisa que eu reservo a data.',
  })
  blocks.set('urgente', { long: 'Entendi que é urgente, vou ver o que consigo fazer.', short: 'Entendi que é urgente.' })
  blocks.set('agradecimento', {
    long: `Que bom que gostou!${e('🥰')} Se puder, me manda uma foto da peça em uso e uma avaliação? Ajuda muito o meu trabalho.`,
    short: 'Que bom que gostou! Me manda uma foto e uma avaliação? Ajuda muito!',
  })
  const policy = settings.exchangePolicy.trim()
  if (has('problema') && !policy) warn('Preencha “Trocas e garantia” em “Seus dados” para a resposta indicar o que você oferece.')
  blocks.set('problema', {
    long: `Sinto muito pelo transtorno e quero resolver o quanto antes.${e('🙏')} Pode me mandar uma foto do problema e o número do pedido?${policy ? `\n${policy}` : ''}`,
    short: 'Sinto muito pelo transtorno! Me manda uma foto do problema e o número do pedido?',
  })
  blocks.set('sumiu', {
    long: `Passando para saber se conseguiu ver o orçamento${e('😊')} Posso tirar alguma dúvida ou ajustar algo para você?`,
    short: 'Conseguiu ver o orçamento? Posso ajudar em algo?',
  })
  blocks.set('fechar', {
    long: `Perfeito, vamos fechar!${e('🎉')} Funciona assim:\n1) Confirmo com você ${piece}, as cores e o tamanho.\n2) Você faz o sinal de ${sinalPct}% (${depositText}).\n3) Eu começo a produção e te mando fotos do andamento.`,
    short: `Perfeito! Confirmo os detalhes e você faz o sinal de ${sinalPct}% (${depositText}) para eu começar.`,
  })

  const order = a.intents.filter((i) => blocks.has(i))
  // quem fecha já sabe o preço; quem tem problema não recebe oferta
  const main: Intent[] = has('problema') ? ['problema'] : order
  const picked = main.length ? main : []

  const compose = (kind: 'long' | 'short', list: Intent[]) => {
    const parts = list.slice(0, kind === 'short' ? 2 : 5).map((i) => blocks.get(i)![kind])
    if (!parts.length) {
      parts.push(
        kind === 'long'
          ? 'Me conta o que você tem em mente: qual peça, as cores, o tamanho e para quando precisa. Assim já te passo o valor e o prazo.'
          : 'Me conta qual peça, cores, tamanho e a data que precisa?',
      )
    }
    const closing = kind === 'long' ? `\n\n${bye}` : ''
    return clean(`${hello}\n\n${parts.join(kind === 'long' ? '\n\n' : ' ')}${closing}`)
  }

  const closeText = clean(
    `${hello}\n\n${blocks.get('preco')!.short} ${blocks.get('prazo')!.long}\n\n${blocks.get('fechar')!.long}\n\n${settings.pixKey.trim() ? `Chave Pix: ${settings.pixKey.trim()}\n\n` : ''}${bye}`,
  )

  const variants: Variant[] = [
    { id: 'completa', label: 'Completa', text: compose('long', picked) },
    { id: 'curta', label: 'Curta', text: compose('short', picked) },
  ]
  if (!has('problema') && !has('agradecimento') && !has('sumiu')) variants.push({ id: 'fechar', label: 'Para fechar agora', text: closeText })
  return { variants, warnings }
}

/** Respostas prontas para o dia a dia, com os seus dados já preenchidos. */
export interface QuickReply {
  id: string
  title: string
  text: string
}

export function quickReplies(s: ShopSettings, emoji: boolean): QuickReply[] {
  const e = (x: string) => (emoji ? ` ${x}` : '')
  const shop = s.shopName.trim()
  const pix = s.pixKey.trim()
  return [
    {
      id: 'orcamento',
      title: 'Pedir detalhes para o orçamento',
      text: `Oi! Que bom ter você por aqui${e('😊')}\nPara te passar o valor certinho, me conta: qual peça você quer, quais cores, o tamanho e para quando precisa?`,
    },
    {
      id: 'pagamento',
      title: 'Como pagar (sinal)',
      text: clean(`Para reservar a sua peça, peço um sinal de ${s.depositPct}% e o restante na entrega.${pix ? `\nChave Pix: ${pix}` : '\n[sua chave Pix]'}\nQuando fizer, me manda o comprovante, por favor${e('🙏')}`),
    },
    {
      id: 'prazo',
      title: 'Prazo de produção',
      text: `Meu prazo de produção é de ${s.standardDays} dias corridos depois da confirmação do pagamento do sinal. Aviso você assim que ficar pronta${e('💕')}`,
    },
    {
      id: 'envio',
      title: 'Envio e retirada',
      text: s.shipping.trim() || '[explique como funciona o frete, o prazo de envio e a retirada]',
    },
    {
      id: 'andamento',
      title: 'Atualização do pedido',
      text: `Oi! Passando para mostrar como está ficando a sua peça${e('🧶')} Qualquer ajuste que quiser, me avisa que ainda dá tempo.`,
    },
    {
      id: 'pronta',
      title: 'Peça pronta',
      text: `Sua peça ficou pronta${e('🎉')} Vou te mandar as fotos. Se estiver tudo certo, combinamos o restante do pagamento e o envio.`,
    },
    {
      id: 'posvenda',
      title: 'Pós-venda e avaliação',
      text: `Oi! Sua peça já chegou? Espero que tenha amado${e('🥰')} Se puder, me manda uma foto dela e uma avaliação${shop ? ` para a ${shop}` : ''}. Ajuda muito o meu trabalho!`,
    },
    {
      id: 'sumiu',
      title: 'Cliente que sumiu',
      text: `Oi! Passando para saber se conseguiu ver o orçamento${e('😊')} Se quiser ajustar tamanho ou cores para caber melhor, é só me falar.`,
    },
    {
      id: 'agenda',
      title: 'Agenda cheia',
      text: `Que bom que você quer a peça! Neste momento a minha agenda está cheia e a próxima data livre é [data]. Quer que eu reserve para você?`,
    },
  ]
}

export const EXAMPLE_CHAT = `[14/10/2026 09:12] Marina: Oi! Vi seu trabalho no Instagram, amei as mantas
[14/10/2026 09:13] Marina: Quanto custa uma manta de bebê com o nome Helena?
[14/10/2026 09:15] Ana: Oi Marina! Faço sim, qual tamanho e cores você pensa?
[14/10/2026 09:20] Marina: Rosa e branco, tamanho berço. Preciso pra dia 28, dá tempo? Tem como fazer um desconto no Pix?`
