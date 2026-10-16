import { DEFAULT_PRICES, formatCents, priceCents, type Prices } from '../billing/plans'

/** Uma pergunta frequente com a resposta pronta (cadastrada no painel de gestão). */
export interface ChatItem {
  id: string
  question: string
  answer: string
  /** Palavras que ajudam a achar esta resposta quando a pessoa digita (separadas por vírgula). */
  keywords: string
}

export interface ChatConfig {
  greeting: string
  fallback: string
  /** Só dígitos, com DDI (ex.: 5581999990000). Vazio = sem botão de WhatsApp. */
  whatsapp: string
}

/** Tudo o que a página pública precisa saber (vem de public_landing()). */
export interface PublicInfo {
  prices: Prices
  items: ChatItem[]
  config: ChatConfig
}

export const DEFAULT_CONFIG: ChatConfig = {
  greeting: 'Oi! Eu sou a assistente do Tramado. Escolha uma pergunta abaixo ou escreva a sua dúvida.',
  fallback: 'Não encontrei essa resposta por aqui. Fale com a gente pelo WhatsApp e respondemos rapidinho.',
  whatsapp: '',
}

/** Mesmas perguntas que a migração cadastra: valem enquanto o banco não responde e na demonstração. */
export const DEFAULT_ITEMS: ChatItem[] = [
  {
    id: 'd-funciona', question: 'Como o Tramado funciona?',
    answer: 'Você escolhe uma foto (ou um modelo pronto) e o Tramado transforma em um gráfico de crochê, com as carreiras numeradas, as cores separadas e a lista de fios. Depois dá para ajustar ponto a ponto e crochetar com o modo guiado, que mostra a carreira certa e conta os pontos para você.',
    keywords: 'funciona, como, o que é, para que serve, usar',
  },
  {
    id: 'd-preco', question: 'Quanto custa?',
    answer: 'O plano Básico custa {{basico_mensal}} por mês ou {{basico_anual}} por ano (você paga {{meses_pagos}} meses e leva 12). O Plus custa {{plus_mensal}} por mês ou {{plus_anual}} por ano. Pode pagar com Pix ou cartão.',
    keywords: 'preço, valor, custa, quanto, mensalidade, assinatura, pagar, caro',
  },
  {
    id: 'd-planos', question: 'Qual a diferença entre o Básico e o Plus?',
    answer: 'O Básico traz foto em gráfico, modelos prontos, editor, modo Crochetar e lista de fios, com até {{limite_basico}} imagens novas por mês. O Plus tem tudo isso com imagens ilimitadas e ainda inclui a Calculadora de preço e o Assistente de vendas, para quem vende as peças.',
    keywords: 'diferença, básico, basico, plus, planos, plano, qual escolher, limite',
  },
  {
    id: 'd-iniciante', question: 'Preciso saber ler gráfico de crochê?',
    answer: 'Não. O modo Crochetar mostra a carreira atual, o lado em que ela vai e quantos pontos seguidos de cada cor você faz, e guarda o seu progresso. Dá para ir marcando conforme você crocheta.',
    keywords: 'iniciante, aprender, ler gráfico, dificuldade, fácil, facil, sei crochê, sou nova',
  },
  {
    id: 'd-fotos', question: 'As minhas fotos ficam guardadas?',
    answer: 'Não. A foto é processada no seu próprio aparelho e não é enviada nem guardada. Só o gráfico que você decidir salvar fica na sua conta.',
    keywords: 'foto, privacidade, segurança, seguranca, dados, guardada, lgpd, enviada',
  },
  {
    id: 'd-fios', question: 'Quais fios e cores o Tramado usa?',
    answer: 'Hoje o Tramado trabalha com as cartelas DMC Mouline e Anchor Mouline: ele sugere a cor mais próxima para cada ponto, mostra opções parecidas para você trocar e monta a lista de compras. As cores são aproximadas: confira com o novelo na loja.',
    keywords: 'fio, fios, linha, cartela, dmc, anchor, cores, novelo, lã, la, marca',
  },
  {
    id: 'd-celular', question: 'Funciona no celular?',
    answer: 'Sim, foi pensado primeiro para o celular. Também dá para instalar como aplicativo: no Android, o Chrome oferece "Instalar app"; no iPhone, use Compartilhar > Adicionar à Tela de Início.',
    keywords: 'celular, telefone, app, aplicativo, android, iphone, instalar, computador',
  },
  {
    id: 'd-pagamento', question: 'Como faço para pagar? Posso cancelar?',
    answer: 'O pagamento é pelo Mercado Pago, com Pix ou cartão. No cartão mensal a cobrança renova sozinha e você cancela quando quiser pela sua conta do Mercado Pago (o acesso continua até o fim do período já pago). O Pix e o plano anual não renovam sozinhos: você paga de novo no vencimento.',
    keywords: 'pagamento, pix, cartão, cartao, cancelar, cancelamento, renova, reembolso, mercado pago',
  },
  {
    id: 'd-teste', question: 'Posso testar antes de assinar?',
    answer: 'Ao criar a conta você pode ganhar gráficos de presente para experimentar: {{bonus}}. Se tiver um cupom de desconto, é só digitar ao criar a conta ou na tela de assinatura.',
    keywords: 'testar, grátis, gratis, teste, experimentar, cupom, desconto, promoção, promocao',
  },
  {
    id: 'd-vendas', question: 'O que é o Assistente de vendas?',
    answer: 'É uma ferramenta do plano Plus para quem vende peças de crochê: você cola a conversa com a cliente e ele sugere respostas prontas (preço, prazo, envio, desconto), que você edita e envia pelo WhatsApp. Funciona no seu aparelho, sem enviar a conversa para ninguém.',
    keywords: 'assistente, vendas, vender, whatsapp, cliente, calculadora, preço da peça, preco da peca',
  },
]

export const DEFAULT_INFO: PublicInfo = { prices: DEFAULT_PRICES, items: DEFAULT_ITEMS, config: DEFAULT_CONFIG }

/** Troca os marcadores das respostas ({{basico_mensal}} etc.) pelos valores atuais do painel. */
export function fillTokens(text: string, p: Prices): string {
  const bonus =
    p.signupBonusImages > 0
      ? `hoje são ${p.signupBonusImages} gráfico${p.signupBonusImages === 1 ? '' : 's'}`
      : 'a quantidade depende da promoção do momento'
  const values: Record<string, string> = {
    basico_mensal: formatCents(p.basicMonthlyCents),
    plus_mensal: formatCents(p.plusMonthlyCents),
    basico_anual: formatCents(priceCents(p, 'basic', 'yearly')),
    plus_anual: formatCents(priceCents(p, 'plus', 'yearly')),
    meses_pagos: String(12 - p.yearlyFreeMonths),
    limite_basico: String(p.basicImageLimit),
    bonus,
  }
  return text.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (all, key: string) => values[key] ?? all)
}

/** Minúsculas, sem acentos. */
export const normalize = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

const STOP = new Set([
  'a', 'o', 'as', 'os', 'e', 'de', 'da', 'do', 'das', 'dos', 'em', 'na', 'no', 'um', 'uma', 'para', 'pra', 'pro', 'com', 'que', 'eu',
  'me', 'meu', 'minha', 'se', 'ter', 'tem', 'posso', 'pode', 'qual', 'quais', 'como', 'faco', 'fazer', 'por', 'ou', 'vou', 'ai', 'oi', 'ola',
])
const words = (s: string) => normalize(s).split(/[^a-z0-9]+/).filter((w) => w.length > 1 && !STOP.has(w))

/**
 * Acha a melhor resposta para o que a pessoa escreveu. Cada palavra da pergunta que aparece na pergunta ou nas palavras-chave
 * de um item vale mais quanto mais rara for entre os itens ("iphone" pesa mais que "funciona"); frase de palavra-chave dentro do
 * texto dá um pouco mais. Sem nenhuma palavra em comum, devolve null.
 */
export function findAnswer(query: string, items: ChatItem[]): ChatItem | null {
  const q = normalize(query)
  const qWords = [...new Set(words(query))]
  if (qWords.length === 0 || items.length === 0) return null
  const vocab = items.map((item) => new Set([...words(item.question), ...words(item.keywords)]))
  const weight = (w: string) => 1 + Math.log(items.length / Math.max(1, vocab.filter((v) => v.has(w)).length))
  let best: { item: ChatItem; score: number } | null = null
  items.forEach((item, n) => {
    let score = 0
    for (const w of qWords) if (vocab[n].has(w)) score += weight(w)
    if (score === 0) return
    for (const phrase of item.keywords.split(',').map((k) => normalize(k).trim()).filter(Boolean)) {
      if (phrase.length > 2 && q.includes(phrase)) score += 1
    }
    if (score > (best?.score ?? 0)) best = { item, score }
  })
  return best ? (best as { item: ChatItem }).item : null
}

/** Link do WhatsApp com uma mensagem pronta (só dígitos no número). */
export const whatsappLink = (number: string, text: string) => `https://wa.me/${number.replace(/\D/g, '')}?text=${encodeURIComponent(text)}`
