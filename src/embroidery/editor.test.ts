import { describe, expect, it } from 'vitest'
import { ELEMENT_BY_ID, ELEMENT_CATEGORIES, ELEMENTS } from './elements'
import { arcFrame, curvedLayout, curvedRotateFor, hitCurved, hitElement, mapPhotoToFrame, normalizeRegion, regionBigEnough } from './geometry'
import { History } from './history'
import { newElement, newText } from './project'

describe('histórico (desfazer e refazer)', () => {
  it('desfaz e refaz na ordem', () => {
    const h = new History<number>()
    h.record(1, 'a', 0)
    h.record(2, 'b', 5000)
    expect(h.undo(3)).toBe(2)
    expect(h.undo(2)).toBe(1)
    expect(h.undo(1)).toBeUndefined()
    expect(h.redo(1)).toBe(2)
    expect(h.redo(2)).toBe(3)
    expect(h.redo(3)).toBeUndefined()
  })

  it('mudança nova apaga o "refazer"', () => {
    const h = new History<number>()
    h.record(1, 'a', 0)
    h.undo(2)
    expect(h.canRedo).toBe(true)
    h.record(5, 'b', 9999)
    expect(h.canRedo).toBe(false)
  })

  it('movimentos seguidos do mesmo controle viram um passo só', () => {
    const h = new History<number>()
    h.record(10, 'slider', 0)
    h.record(11, 'slider', 100)
    h.record(12, 'slider', 200)
    expect(h.undo(13)).toBe(10)
    expect(h.canUndo).toBe(false)
  })

  it('depois de uma pausa, o mesmo controle abre um passo novo', () => {
    const h = new History<number>(100, 700)
    h.record(10, 'slider', 0)
    h.record(20, 'slider', 2000)
    expect(h.undo(30)).toBe(20)
    expect(h.undo(20)).toBe(10)
  })

  it('grupo vazio sempre cria passo, e o limite descarta os mais antigos', () => {
    const h = new History<number>(3)
    for (let i = 0; i < 6; i++) h.record(i)
    expect(h.undo(99)).toBe(5)
    expect(h.undo(5)).toBe(4)
    expect(h.undo(4)).toBe(3)
    expect(h.undo(3)).toBeUndefined()
  })
})

describe('enquadramento e áreas', () => {
  it('foto que cobre a área: ponto do centro da foto cai no centro da área', () => {
    const p = mapPhotoToFrame(400, 300, 100, 100, { zoom: 1, x: 0, y: 0 }, 200, 150)
    expect(p.x).toBeCloseTo(0.5, 5)
    expect(p.y).toBeCloseTo(0.5, 5)
  })

  it('zoom e deslocamento movem o ponto como na tela', () => {
    const base = mapPhotoToFrame(400, 400, 100, 100, { zoom: 1, x: 0, y: 0 }, 100, 100)
    const zoomed = mapPhotoToFrame(400, 400, 100, 100, { zoom: 2, x: 0, y: 0 }, 100, 100)
    expect(base.x).toBeCloseTo(0.25, 5)
    expect(zoomed.x).toBeCloseTo(0, 5)
    const moved = mapPhotoToFrame(400, 400, 100, 100, { zoom: 1, x: 0.1, y: 0 }, 100, 100)
    expect(moved.x).toBeCloseTo(0.35, 5)
  })

  it('região: ordena os cantos, limita a 0–1 e recusa as pequenas demais', () => {
    const r = normalizeRegion('elipse', 1.4, 0.8, -0.2, 0.2)
    expect(r).toEqual({ shape: 'elipse', x0: 0, y0: 0.2, x1: 1, y1: 0.8 })
    expect(regionBigEnough(r)).toBe(true)
    expect(regionBigEnough(normalizeRegion('retangulo', 0.5, 0.5, 0.51, 0.9))).toBe(false)
  })
})

describe('texto curvo', () => {
  const w = 1000
  const h = 1000
  const text = { ...newText('Olá'), curve: 'curvo' as const, place: 'acima' as const, radius: 0.4, x: 0.5, y: 0.5 }

  it('texto em cima fica acima do centro e embaixo fica abaixo', () => {
    const top = curvedLayout(text, w, h, [40, 40, 40])
    const bottom = curvedLayout({ ...text, place: 'abaixo' }, w, h, [40, 40, 40])
    for (const c of top) expect(c.y).toBeLessThan(h / 2)
    for (const c of bottom) expect(c.y).toBeGreaterThan(h / 2)
  })

  it('as letras ficam sobre o círculo e na ordem da leitura (esquerda → direita)', () => {
    const f = arcFrame(text, w, h)
    const top = curvedLayout(text, w, h, [40, 40, 40])
    for (const c of top) expect(Math.hypot(c.x - f.cx, c.y - f.cy)).toBeCloseTo(f.radius, 3)
    expect(top[0].x).toBeLessThan(top[1].x)
    expect(top[1].x).toBeLessThan(top[2].x)
    const bottom = curvedLayout({ ...text, place: 'abaixo' }, w, h, [40, 40, 40])
    expect(bottom[0].x).toBeLessThan(bottom[2].x)
  })

  it('girar muda o ponto em que o texto está; tocar no arco acerta e longe erra', () => {
    expect(hitCurved(text, w, h, 120, 0.5, 0.1)).toBe(true) // topo do círculo de raio 0,4
    expect(hitCurved(text, w, h, 120, 0.5, 0.5)).toBe(false) // centro: longe do arco
    expect(hitCurved(text, w, h, 120, 0.5, 0.9)).toBe(false) // embaixo: outro lado
    const rotated = { ...text, rotate: 90 }
    expect(hitCurved(rotated, w, h, 120, 0.9, 0.5)).toBe(true) // à direita
  })

  it('arrastar em volta do bastidor dá o ângulo certo', () => {
    expect(curvedRotateFor(text, w, h, 0.5, 0.1)).toBe(0)
    expect(curvedRotateFor(text, w, h, 0.9, 0.5)).toBe(90)
    expect(curvedRotateFor(text, w, h, 0.1, 0.5)).toBe(-90)
  })
})

describe('elementos', () => {
  it('a biblioteca tem desenhos em todas as categorias, com id único e caminho válido', () => {
    expect(ELEMENTS.length).toBeGreaterThanOrEqual(30)
    expect(new Set(ELEMENTS.map((e) => e.id)).size).toBe(ELEMENTS.length)
    for (const cat of ELEMENT_CATEGORIES) expect(ELEMENTS.some((e) => e.category === cat)).toBe(true)
    for (const e of ELEMENTS) {
      expect(e.d.startsWith('M')).toBe(true)
      expect(e.d).not.toMatch(/NaN|undefined|Infinity/)
      expect(e.d).toMatch(/^[MLHVQCAZ0-9.\s-]+$/) // só comandos usados e números
      expect(ELEMENT_BY_ID.get(e.id)).toBe(e)
      // todas as coordenadas ficam perto da caixa de 100 × 100
      const nums = (e.d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number)
      for (const n of nums) expect(Math.abs(n)).toBeLessThan(140)
    }
  })

  it('tocar no desenho acerta dentro da caixa girada e erra fora', () => {
    const el = { ...newElement('coracao', 0.5, 0.5, 0.4), rotate: 0 }
    expect(hitElement(el, 1000, 1000, 0.5, 0.5)).toBe(true)
    expect(hitElement(el, 1000, 1000, 0.69, 0.69)).toBe(true)
    expect(hitElement(el, 1000, 1000, 0.8, 0.5)).toBe(false)
    const turned = { ...el, rotate: 45 }
    expect(hitElement(turned, 1000, 1000, 0.5 + 0.2 * Math.SQRT2 * 0.95, 0.5)).toBe(true)
  })
})
