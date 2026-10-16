import { describe, expect, it } from 'vitest'
import { analyze, buildReplies, parseMessages, quickReplies, EXAMPLE_CHAT } from './chat'
import { DEFAULT_SETTINGS } from './storage'

const now = new Date(2026, 9, 14) // 14/10/2026
const opts = (over = {}) => ({
  tone: 'simpatica' as const,
  emoji: true,
  price: { price: 180, minPrice: 140, deposit: 90, days: null },
  settings: { ...DEFAULT_SETTINGS, pixKey: 'ana@pix.com' },
  ...over,
})

describe('parseMessages', () => {
  it('lê exportação do WhatsApp com continuação de linha', () => {
    const l = parseMessages('[14/10/2026 09:12] Marina: Oi\ncontinua aqui\n[14/10/2026 09:13] Ana: Olá')
    expect(l).toEqual([{ sender: 'Marina', text: 'Oi\ncontinua aqui' }, { sender: 'Ana', text: 'Olá' }])
  })
  it('lê formato curto com hífen', () => {
    const l = parseMessages('14/10/26 09:12 - Marina: Oi\n14/10/26 09:13 - Ana: Olá')
    expect(l.map((x) => x.sender)).toEqual(['Marina', 'Ana'])
  })
  it('texto solto não tem remetente', () => {
    expect(parseMessages('Oi, quanto custa?\nPreciso pra dia 20')).toEqual([
      { sender: null, text: 'Oi, quanto custa?' },
      { sender: null, text: 'Preciso pra dia 20' },
    ])
  })
  it('ignora mensagens de sistema', () => {
    expect(parseMessages('[14/10/2026 09:12] Marina: <Mídia oculta>')).toEqual([])
  })
})

describe('analyze', () => {
  it('usa o seu nome para achar a cliente e as intenções da última fala dela', () => {
    const a = analyze(EXAMPLE_CHAT, 'Ana', now)
    expect(a.customerName).toBe('Marina')
    expect(a.lastFromMe).toBe(false)
    expect(a.intents).toEqual(expect.arrayContaining(['desconto', 'prazo']))
    expect(a.deadline).toEqual({ label: '28/10', daysAway: 14 })
    expect(a.product).toBe('manta')
  })
  it('detecta cliente sem resposta quando a última fala é sua', () => {
    const a = analyze('[14/10/2026 09:12] Marina: Quanto custa?\n[14/10/2026 09:20] Ana: R$ 180', 'Ana', now)
    expect(a.lastFromMe).toBe(true)
    expect(a.intents).toContain('sumiu')
  })
  it('problema tira as intenções de venda', () => {
    const a = analyze('A manta chegou rasgada, quero trocar', '', now)
    expect(a.intents).toEqual(['problema'])
  })
  it('data do próximo mês quando o dia já passou', () => {
    expect(analyze('preciso pra dia 3', '', now).deadline).toEqual({ label: '03/11', daysAway: 20 })
  })
})

describe('buildReplies', () => {
  it('desconto respeita o preço mínimo', () => {
    const a = analyze('Faz mais barato?', '', now)
    const r = buildReplies(a, opts({ price: { price: 180, minPrice: 175, deposit: 90, days: null } }))
    expect(r.variants[0].text).toContain('limite')
    const ok = buildReplies(a, opts())
    expect(ok.variants[0].text).toContain('10%')
    expect(ok.variants[0].text).toContain('162,00')
  })
  it('avisa quando o prazo pedido é menor que o seu', () => {
    const a = analyze('Preciso em 5 dias', '', now)
    const r = buildReplies(a, opts())
    expect(r.warnings.join(' ')).toMatch(/prazo padrão/)
  })
  it('sem preço deixa marcador e avisa', () => {
    const r = buildReplies(analyze('Quanto custa?', '', now), opts({ price: { price: null, minPrice: null, deposit: null, days: null } }))
    expect(r.variants[0].text).toContain('[valor]')
    expect(r.warnings.length).toBeGreaterThan(0)
  })
  it('sem emoji não sobra emoji', () => {
    const r = buildReplies(analyze('Oi, quero fechar!', '', now), opts({ emoji: false }))
    expect(r.variants.map((v) => v.text).join('')).not.toMatch(/\p{Extended_Pictographic}/u)
  })
  it('problema não oferece venda e não gera "fechar agora"', () => {
    const r = buildReplies(analyze('veio com defeito', '', now), opts())
    expect(r.variants.some((v) => v.id === 'fechar')).toBe(false)
    expect(r.variants[0].text).toContain('Sinto muito')
  })
  it('quickReplies usa seus dados', () => {
    expect(quickReplies({ ...DEFAULT_SETTINGS, pixKey: 'x@y.com' }, false).find((q) => q.id === 'pagamento')!.text).toContain('x@y.com')
  })
})
