import { describe, expect, it } from 'vitest'
import { composeModel, MODEL_MAX_WIDTH, MODEL_MIN_WIDTH, RECIPE_MIN_WIDTH, toChart } from './compose'
import { MODELS } from './library'
import { circle, covers, ellipse, heart, poly, rasterize, rect } from './shapes'

const base = { name: '', date: '', textColor: '#112233', width: 70, withBg: true }

describe('formas', () => {
  it('círculo, elipse girada, retângulo arredondado e polígono', () => {
    expect(covers(circle(50, 50, 10, 'a'), 55, 50)).toBe(true)
    expect(covers(circle(50, 50, 10, 'a'), 61, 50)).toBe(false)
    // elipse comprida na horizontal; girada 90° passa a ser comprida na vertical
    expect(covers(ellipse(50, 50, 20, 5, 'a'), 68, 50)).toBe(true)
    expect(covers(ellipse(50, 50, 20, 5, 'a'), 50, 68)).toBe(false)
    expect(covers(ellipse(50, 50, 20, 5, 'a', 90), 50, 68)).toBe(true)
    // cantos arredondados ficam de fora
    expect(covers(rect(0, 0, 40, 40, 'a', 20), 1, 1)).toBe(false)
    expect(covers(rect(0, 0, 40, 40, 'a', 20), 20, 20)).toBe(true)
    expect(covers(poly('a', [0, 0], [10, 0], [5, 10]), 5, 3)).toBe(true)
    expect(covers(poly('a', [0, 0], [10, 0], [5, 10]), 1, 9)).toBe(false)
  })

  it('o coração é mais largo no alto e fecha em ponta embaixo', () => {
    const shapes = heart(50, 10, 80, 'a')
    const hit = (x: number, y: number) => shapes.some((s) => covers(s, x, y))
    expect(hit(30, 30)).toBe(true)
    expect(hit(70, 30)).toBe(true)
    expect(hit(50, 80)).toBe(true)
    expect(hit(15, 80)).toBe(false)
  })

  it('rasterizar usa a cor que mais aparece em cada ponto; o que está por cima vence', () => {
    const cells = rasterize([circle(50, 50, 30, 'a'), circle(50, 50, 10, 'b')], { a: '#aa0000', b: '#0000bb' }, 10, '#ffffff')
    expect(cells[5 * 10 + 5]).toBe('#0000bb')
    expect(cells[5 * 10 + 2]).toBe('#aa0000')
    expect(cells[0]).toBe('#ffffff')
  })
})

describe('montagem do modelo', () => {
  const bear = MODELS.find((m) => m.id === 'ursinho')!

  it('altura = nome + desenho + data, e a largura é a pedida', () => {
    const semTexto = composeModel(bear, base)
    expect(semTexto.width).toBe(70)
    expect(semTexto.height).toBe(2 + 1 + 64 + 3) // topo + desenho (70 − 6) + rodapé
    const comNome = composeModel(bear, { ...base, name: 'ZOE' })
    expect(comNome.height).toBeGreaterThan(semTexto.height)
    const comData = composeModel(bear, { ...base, name: 'ZOE', date: '12/10/2026' })
    expect(comData.height).toBeGreaterThan(comNome.height)
  })

  it('o nome é escrito em cima na cor escolhida', () => {
    const c = composeModel(bear, { ...base, name: 'ZOE' })
    const ink = c.palette.findIndex((p) => p.hex === '#112233')
    expect(ink).toBeGreaterThanOrEqual(0)
    let inTop = 0
    for (let y = 0; y < 18; y++) for (let x = 0; x < c.width; x++) if (c.grid[y * c.width + x] === ink) inTop++
    expect(inTop).toBeGreaterThan(20)
    expect(c.palette[ink].count).toBe(inTop) // e só ali (sem data)
  })

  it('a paleta vai do mais claro ao mais escuro, com letras A, B, C… e contagens que somam o total', () => {
    const c = composeModel(bear, { ...base, name: 'ZOE' })
    expect(c.palette.map((p) => p.letter).slice(0, 3)).toEqual(['A', 'B', 'C'])
    expect(c.palette.reduce((s, p) => s + p.count, 0)).toBe(c.width * c.height)
    const lum = (h: string) => parseInt(h.slice(1, 3), 16) + parseInt(h.slice(3, 5), 16) + parseInt(h.slice(5, 7), 16)
    expect(lum(c.palette[0].hex)).toBeGreaterThanOrEqual(lum(c.palette[c.palette.length - 1].hex))
  })

  it('sem fundo colorido o fundo é branco; é determinístico', () => {
    const a = composeModel(bear, { ...base, name: 'ZOE', withBg: false })
    expect(a.palette[0].hex).toBe('#ffffff')
    const b = composeModel(bear, { ...base, name: 'ZOE', withBg: false })
    expect(Array.from(a.grid)).toEqual(Array.from(b.grid))
  })

  it('gráficos prontos ignoram nome e data', () => {
    const star = MODELS.find((m) => m.id === 'estrela')!
    const a = composeModel(star, base)
    const b = composeModel(star, { ...base, name: 'ZOE', date: '1/1' })
    expect(b.height).toBe(a.height)
    expect(Array.from(b.grid)).toEqual(Array.from(a.grid))
  })

  it('receitas ganham a largura mínima para caber a fileira de letras', () => {
    const alfabeto = MODELS.find((m) => m.id === 'alfabeto')!
    const c = composeModel(alfabeto, { ...base, width: 40 })
    expect(c.width).toBe(RECIPE_MIN_WIDTH)
    expect(c.palette.some((p) => p.hex === '#112233')).toBe(true)
  })

  it('toChart agrupa as cores iguais', () => {
    const c = toChart(2, 2, ['#ffffff', '#000000', '#ffffff', '#ffffff'])
    expect(c.palette.map((p) => [p.letter, p.hex, p.count])).toEqual([['A', '#ffffff', 3], ['B', '#000000', 1]])
  })
})

describe('todos os modelos', () => {
  for (const m of MODELS) {
    it(`${m.title}: monta em qualquer largura, tem poucas cores e não é uma cor só`, () => {
      for (const width of [MODEL_MIN_WIDTH, 70, MODEL_MAX_WIDTH]) {
        const c = composeModel(m, { ...base, name: m.sample || 'ZOE', date: '12/10/2026', width })
        expect(c.grid.length).toBe(c.width * c.height)
        expect(c.palette.length).toBeGreaterThanOrEqual(2)
        expect(c.palette.length).toBeLessThanOrEqual(12)
        expect(c.height).toBeLessThanOrEqual(400)
      }
    })
  }

  it('há modelos de bebê, casal, pet, gráficos prontos e receitas, com ids únicos', () => {
    expect(new Set(MODELS.map((m) => m.id)).size).toBe(MODELS.length)
    for (const cat of ['bebe', 'casal', 'pet', 'pronto', 'receita'] as const) expect(MODELS.some((m) => m.category === cat)).toBe(true)
  })
})
