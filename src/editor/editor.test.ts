import { describe, expect, it } from 'vitest'
import { EMPTY_HISTORY, floodFill, maskOrigin, paintCell, pushHistory, recount, redo, stampMask, undo } from './edit'
import { rowGuide } from './crochetRows'
import { parseText, renderText } from './font'

const bitsAt = (m: { w: number; bits: Uint8Array }, x: number, y: number) => m.bits[y * m.w + x]

describe('alfabeto de pontos', () => {
  it('letra fina tem 7 carreiras de altura', () => {
    const r = renderText('A', 'fina', 70)!
    expect(r.mask.h).toBe(7)
    expect(r.mask.w).toBe(5)
    expect(bitsAt(r.mask, 2, 0)).toBe(1) // topo do A
    expect(bitsAt(r.mask, 0, 0)).toBe(0)
  })

  it('1 ponto entre as letras', () => {
    expect(renderText('AB', 'fina', 70)!.mask.w).toBe(5 + 1 + 5)
  })

  it('acento soma 2 carreiras em cima e cedilha 1 embaixo; Ç e Á juntos somam as duas', () => {
    expect(renderText('Á', 'fina', 70)!.mask.h).toBe(9)
    expect(renderText('Ç', 'fina', 70)!.mask.h).toBe(8)
    expect(renderText('ÁÇ', 'fina', 70)!.mask.h).toBe(10)
    expect(renderText('ação', 'fina', 70)!.mask.h).toBe(10) // minúsculas viram maiúsculas; Ç e Ã
  })

  it('"<3" vira coração', () => {
    const r = renderText('<3', 'fina', 70)!
    expect(r.mask.w).toBe(7)
    expect(parseText('<3')[0][0].ch).toBe('♥')
  })

  it('grossa alarga 1 ponto por letra e grande dobra o tamanho', () => {
    expect(renderText('A', 'grossa', 70)!.mask.w).toBe(6)
    const big = renderText('A', 'grande', 70)!
    expect(big.mask.w).toBe(10)
    expect(big.mask.h).toBe(14)
  })

  it('várias linhas ficam centralizadas, com 2 carreiras entre elas', () => {
    const r = renderText('I\nOO', 'fina', 70)!
    expect(r.mask.h).toBe(7 + 2 + 7)
    expect(r.mask.w).toBe(5 + 1 + 5)
  })

  it('automática usa a maior letra que cabe e avisa quando nada cabe', () => {
    expect(renderText('ZOE', 'auto', 70)!.style).toBe('grande')
    expect(renderText('MARIA CLARA', 'auto', 30)!.style).toBe('fina')
    const tooWide = renderText('MARIA CLARA EDUARDA', 'auto', 30)!
    expect(tooWide.overflow).toBe(true)
  })

  it('texto vazio ou só com caracteres desconhecidos não gera nada', () => {
    expect(renderText('   \n', 'auto', 70)).toBeNull()
    expect(renderText('§§', 'auto', 70)).toBeNull()
  })
})

describe('edição', () => {
  const w = 4
  const h = 3
  const base = () => new Uint8Array([0, 0, 1, 1, 0, 0, 1, 1, 2, 2, 2, 2])

  it('lápis pinta um ponto e devolve grade nova; mesma cor não muda nada', () => {
    const g = base()
    const n = paintCell(g, w, h, 0, 0, 2)!
    expect(n[0]).toBe(2)
    expect(g[0]).toBe(0) // original intacto
    expect(paintCell(g, w, h, 0, 0, 0)).toBeNull()
    expect(paintCell(g, w, h, 9, 9, 1)).toBeNull()
  })

  it('balde troca só a região conectada', () => {
    const n = floodFill(base(), w, h, 0, 0, 3)!
    expect(Array.from(n)).toEqual([3, 3, 1, 1, 3, 3, 1, 1, 2, 2, 2, 2])
    expect(floodFill(base(), w, h, 0, 0, 0)).toBeNull()
  })

  it('balde não vaza pela diagonal', () => {
    const g = new Uint8Array([0, 1, 1, 0]) // 2 × 2: os zeros só se tocam na diagonal
    expect(Array.from(floodFill(g, 2, 2, 0, 0, 5)!)).toEqual([5, 1, 1, 0])
  })

  it('texto é escrito centralizado em cima, no meio ou embaixo', () => {
    const mask = renderText('I', 'fina', 70)!.mask // 3 × 7
    expect(maskOrigin(mask, 20, 30, 'topo')).toEqual({ x0: 8, y0: 2 })
    expect(maskOrigin(mask, 20, 30, 'meio')).toEqual({ x0: 8, y0: 11 })
    expect(maskOrigin(mask, 20, 30, 'base')).toEqual({ x0: 8, y0: 21 })
    const grid = new Uint8Array(20 * 30)
    const out = stampMask(grid, 20, 30, mask, 'topo', 4)!
    expect(out[2 * 20 + 8]).toBe(4)
    expect(grid[2 * 20 + 8]).toBe(0)
  })

  it('recount atualiza a quantidade de pontos de cada cor', () => {
    const pal = [0, 1, 2].map((i) => ({ letter: 'ABC'[i], symbol: '', hex: '#000000', count: 99 }))
    expect(recount(base(), pal).map((p) => p.count)).toEqual([4, 4, 4])
  })

  it('desfazer e refazer andam pela história', () => {
    const a = new Uint8Array([1])
    const b = new Uint8Array([2])
    const c = new Uint8Array([3])
    let hist = pushHistory(EMPTY_HISTORY, a) // editou de a para b
    const u1 = undo(hist, b)!
    expect(Array.from(u1.grid)).toEqual([1])
    hist = u1.history
    const r1 = redo(hist, u1.grid)!
    expect(Array.from(r1.grid)).toEqual([2])
    expect(undo(EMPTY_HISTORY, c)).toBeNull()
    expect(redo(EMPTY_HISTORY, c)).toBeNull()
    // uma edição nova apaga o "refazer"
    expect(pushHistory(u1.history, a).future).toEqual([])
  })

  it('a história guarda no máximo 100 passos', () => {
    let hist = EMPTY_HISTORY
    for (let i = 0; i < 130; i++) hist = pushHistory(hist, new Uint8Array([i]))
    expect(hist.past.length).toBe(100)
    expect(hist.past[0][0]).toBe(30)
  })
})

describe('modo Crochetar', () => {
  // 4 × 2: linha de cima 0 0 1 1; linha de baixo (carreira 1) 2 2 2 0
  const grid = new Uint8Array([0, 0, 1, 1, 2, 2, 2, 0])

  it('carreira 1 é a de baixo e começa pelo lado escolhido', () => {
    const g = rowGuide(grid, 4, 2, 1, 'right')
    expect(g.from).toBe('right')
    expect(g.runs).toEqual([{ color: 0, count: 1 }, { color: 2, count: 3 }]) // lê da direita: 0, 2, 2, 2
    const l = rowGuide(grid, 4, 2, 1, 'left')
    expect(l.runs).toEqual([{ color: 2, count: 3 }, { color: 0, count: 1 }])
  })

  it('carreira 2 muda de lado (idas e vindas) e agrupa pontos seguidos', () => {
    const g = rowGuide(grid, 4, 2, 2, 'right')
    expect(g.from).toBe('left')
    expect(g.runs).toEqual([{ color: 0, count: 2 }, { color: 1, count: 2 }])
    expect(rowGuide(grid, 4, 2, 2, 'right', false).from).toBe('right')
  })

  it('a soma dos pontos seguidos é sempre a largura', () => {
    for (const r of [1, 2]) expect(rowGuide(grid, 4, 2, r, 'right').runs.reduce((s, x) => s + x.count, 0)).toBe(4)
  })
})
