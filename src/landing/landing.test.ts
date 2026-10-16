import { describe, expect, it } from 'vitest'
import { localAdminStore } from '../billing/adminStore'
import { DEFAULT_PRICES } from '../billing/plans'
import { DEFAULT_ITEMS, findAnswer, fillTokens, normalize, whatsappLink } from './chatbot'
import { localPublicStore, parsePublicInfo } from './publicStore'
import { hashFor, parseHash } from './route'

const mem = () => {
  const m = new Map<string, string>()
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) }
}

describe('chatbot: achar a resposta', () => {
  const ask = (q: string) => findAnswer(q, DEFAULT_ITEMS)?.id ?? null
  it('entende as perguntas mais comuns, com ou sem acento', () => {
    expect(ask('quanto custa?')).toBe('d-preco')
    expect(ask('qual o valor da mensalidade')).toBe('d-preco')
    expect(ask('Como faço pra pagar no pix?')).toBe('d-pagamento')
    expect(ask('posso cancelar depois?')).toBe('d-pagamento')
    expect(ask('funciona no iphone?')).toBe('d-celular')
    expect(ask('minha foto fica guardada ai?')).toBe('d-fotos')
    expect(ask('sou iniciante, preciso saber ler grafico?')).toBe('d-iniciante')
    expect(ask('tem teste gratis?')).toBe('d-teste')
    expect(ask('qual a diferença do plus pro básico')).toBe('d-planos')
  })
  it('sem relação com nada: devolve null (o chat mostra a mensagem de "não achei")', () => {
    expect(ask('qual a capital da França')).toBeNull()
    expect(ask('   ')).toBeNull()
    expect(ask('oi')).toBeNull()
  })
  it('usa as palavras-chave cadastradas no painel', () => {
    const items = [{ id: 'x', question: 'Entrega?', answer: 'Sim', keywords: 'frete, correios, prazo de envio' }]
    expect(findAnswer('vocês mandam pelos correios?', items)?.id).toBe('x')
    expect(findAnswer('qual o prazo de envio', items)?.id).toBe('x')
  })
  it('normaliza acentos e caixa', () => {
    expect(normalize('Cartão Básico')).toBe('cartao basico')
  })
})

const sp = (s: string) => s.replace(/ /g, ' ') // o formato de moeda usa espaço "duro" depois do R$

describe('chatbot: marcadores de preço', () => {
  it('troca pelos valores atuais do painel', () => {
    const t = sp(fillTokens('Básico {{basico_mensal}} ou {{basico_anual}} ({{meses_pagos}} meses, até {{limite_basico}} imagens). Plus {{plus_mensal}}.', DEFAULT_PRICES))
    expect(t).toBe('Básico R$ 19,90 ou R$ 199,00 (10 meses, até 12 imagens). Plus R$ 39,90.')
  })
  it('acompanha mudanças de preço e o bônus', () => {
    const p = { ...DEFAULT_PRICES, basicMonthlyCents: 2500, signupBonusImages: 3 }
    expect(sp(fillTokens('{{basico_mensal}} / {{basico_anual}} / {{bonus}}', p))).toBe('R$ 25,00 / R$ 250,00 / hoje são 3 gráficos')
    expect(fillTokens('{{bonus}}', { ...p, signupBonusImages: 0 })).toContain('promoção')
  })
  it('marcador desconhecido fica como está', () => {
    expect(fillTokens('oi {{nada}}', DEFAULT_PRICES)).toBe('oi {{nada}}')
  })
  it('link do WhatsApp só com dígitos e texto codificado', () => {
    expect(whatsappLink('+55 (81) 99999-0000', 'Olá! Tenho uma dúvida')).toBe('https://wa.me/5581999990000?text=Ol%C3%A1!%20Tenho%20uma%20d%C3%BAvida')
  })
})

describe('endereço das telas públicas', () => {
  it('reconhece página, modo e cupom', () => {
    expect(parseHash('')).toEqual({ page: 'login', mode: 'entrar', coupon: '' })
    expect(parseHash('#saiba-mais')).toEqual({ page: 'landing' })
    expect(parseHash('#criar')).toEqual({ page: 'login', mode: 'criar', coupon: '' })
    expect(parseHash('#criar&cupom=bemvinda10')).toEqual({ page: 'login', mode: 'criar', coupon: 'BEMVINDA10' })
    expect(parseHash('#criar&cupom=<script>')).toEqual({ page: 'login', mode: 'criar', coupon: 'SCRIPT' })
  })
  it('monta o endereço de volta', () => {
    expect(hashFor({ page: 'landing' })).toBe('#saiba-mais')
    expect(hashFor({ page: 'login', mode: 'criar', coupon: 'OI25' })).toBe('#criar&cupom=OI25')
    expect(hashFor({ page: 'login', mode: 'entrar', coupon: '' })).toBe('#entrar')
    expect(parseHash(hashFor({ page: 'login', mode: 'criar', coupon: 'A-B_1' }))).toEqual({ page: 'login', mode: 'criar', coupon: 'A-B_1' })
  })
})

describe('dados públicos', () => {
  it('resposta incompleta ou estranha cai nos valores padrão', () => {
    const i = parsePublicInfo({ prices: { basicMonthlyCents: 2500 }, items: [{ question: 'a?', answer: 'b' }, { foo: 1 }], config: { whatsapp: '5581999990000' } })
    expect(i.prices.basicMonthlyCents).toBe(2500)
    expect(i.prices.plusMonthlyCents).toBe(DEFAULT_PRICES.plusMonthlyCents)
    expect(i.items).toHaveLength(1)
    expect(i.config.greeting).toMatch(/assistente/i)
    expect(i.config.whatsapp).toBe('5581999990000')
    expect(parsePublicInfo(null).items).toEqual(DEFAULT_ITEMS)
  })
  it('demonstração: o que o painel cadastra aparece na página pública', async () => {
    const st = mem()
    const admin = localAdminStore(st)
    const pub = localPublicStore(st)
    expect((await pub.get()).items).toHaveLength(DEFAULT_ITEMS.length)

    await admin.saveChatItem({ question: 'Vocês fazem entrega?', answer: 'Fazemos para todo o Brasil.', keywords: 'frete, correios', sort: 5, active: true })
    await admin.saveChatConfig({ greeting: 'Olá!', fallback: 'Chame no zap.', whatsapp: '(81) 99999-0000' })
    await admin.updateSettings({ ...(await admin.settings()), basicMonthlyCents: 2500 })
    let info = await pub.get()
    expect(info.items[0].question).toBe('Vocês fazem entrega?') // ordem 5 vem primeiro
    expect(info.config).toEqual({ greeting: 'Olá!', fallback: 'Chame no zap.', whatsapp: '81999990000' })
    expect(info.prices.basicMonthlyCents).toBe(2500)
    expect(findAnswer('fazem entrega?', info.items)?.answer).toMatch(/Brasil/)

    const entrega = (await admin.chatbot()).items.find((i) => i.question.startsWith('Vocês'))!
    await admin.saveChatItem({ ...entrega, active: false })
    info = await pub.get()
    expect(info.items.some((i) => i.id === entrega.id)).toBe(false) // pausada some do chat
    await admin.deleteChatItem(entrega.id)
    expect((await admin.chatbot()).items.some((i) => i.id === entrega.id)).toBe(false)
  })
  it('painel recusa dados inválidos', async () => {
    const admin = localAdminStore(mem())
    await expect(admin.saveChatItem({ question: 'ab', answer: 'x', keywords: '', sort: 1, active: true })).rejects.toThrow(/pergunta/i)
    await expect(admin.saveChatItem({ question: 'Pergunta ok', answer: '  ', keywords: '', sort: 1, active: true })).rejects.toThrow(/resposta/i)
    await expect(admin.saveChatConfig({ greeting: 'a', fallback: 'b', whatsapp: '123' })).rejects.toThrow(/whatsapp/i)
    await expect(admin.saveChatConfig({ greeting: '', fallback: 'b', whatsapp: '' })).rejects.toThrow(/mensagens/i)
    await expect(admin.deleteChatItem('nao-existe')).rejects.toThrow()
  })
})
