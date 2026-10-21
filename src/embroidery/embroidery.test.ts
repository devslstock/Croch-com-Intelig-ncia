import { describe, expect, it } from 'vitest'
import type { RawImage } from '../engine/types'
import { parseYarnCsv } from '../yarn/yarn'
import { photoPalette, suggestStitch } from './palette'
import { buildPdfPages, sheetGrid } from './pdfPages'
import { embroideryStore, hoopCm, newProject, projectMethod, projectParams, StorageFullError } from './project'
import { exportSize } from './render'

const mem = () => {
  const m = new Map<string, string>()
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) }
}

describe('pdfPages', () => {
  it('gera PDF com o número certo de páginas e xref válido', () => {
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xd9])
    const p = { jpeg, width: 10, height: 10 }
    const text = new TextDecoder('latin1').decode(buildPdfPages([p, p, p], 'Teste'))
    expect(text.startsWith('%PDF-1.4')).toBe(true)
    expect(text).toContain('/Count 3')
    expect(text.trimEnd().endsWith('%%EOF')).toBe(true)
    const start = Number(/startxref\n(\d+)/.exec(text)![1])
    expect(text.slice(start, start + 4)).toBe('xref')
    const rows = text.slice(start).split('\n').slice(3, 3 + 9)
    rows.forEach((l, i) => expect(text.slice(Number(l.slice(0, 10))).startsWith(`${i + 1} 0 obj`)).toBe(true))
  })

  it('bastidor pequeno cabe numa folha; maiores dividem', () => {
    expect(sheetGrid(15, 15)).toEqual({ cols: 1, rows: 1 })
    expect(sheetGrid(20, 20)).toEqual({ cols: 1, rows: 1 })
    expect(sheetGrid(25, 25)).toEqual({ cols: 2, rows: 1 })
    expect(sheetGrid(30, 30)).toEqual({ cols: 2, rows: 2 })
  })
})

describe('paleta do bordado', () => {
  const yarn = parseYarnCsv('T', 'Teste', 'x', 'codigo,nome,hex\n310,Preto,#000000\n666,Vermelho,#e31d42\n701,Verde,#3f8f29\n3846,Azul,#06e3e6\n')
  const half = (a: [number, number, number], b: [number, number, number]): RawImage => {
    const w = 40
    const data = new Uint8ClampedArray(w * w * 4)
    for (let i = 0; i < w * w; i++) {
      const c = i % w < 30 ? a : b
      data.set([c[0], c[1], c[2], 255], i * 4)
    }
    return { data, width: w, height: w }
  }

  it('acha o fio mais parecido, ignora o fundo branco e ordena pelo mais usado', () => {
    const items = photoPalette(half([230, 30, 60], [255, 255, 255]), yarn, 4)
    expect(items.map((i) => i.yarn.code)).toEqual(['666'])
    const two = photoPalette(half([230, 30, 60], [20, 130, 30]), yarn, 2)
    expect(two.map((i) => i.yarn.code)).toEqual(['666', '701'])
    expect(two[0].share).toBeGreaterThan(two[1].share)
  })

  it('sugere o ponto pelo uso e pela cor', () => {
    expect(suggestStitch([50, 40, 20], 0.4)).toBe('cheio')
    expect(suggestStitch([10, 0, 0], 0.03)).toBe('atras')
    expect(suggestStitch([60, 60, 40], 0.03)).toBe('no-frances')
  })
})

describe('bordados guardados no aparelho', () => {
  it('guarda, lista, atualiza e apaga por usuária', () => {
    const s = mem()
    const a = embroideryStore('u1', s)
    const p = newProject('data:image/jpeg;base64,AAAA', 'Rio', 'DMC__Mouline')
    a.save(p)
    a.save({ ...p, name: 'Rio Negro' })
    expect(a.list()).toHaveLength(1)
    expect(a.list()[0].name).toBe('Rio Negro')
    expect(embroideryStore('u2', s).list()).toHaveLength(0)
    a.remove(p.id)
    expect(a.list()).toHaveLength(0)
  })

  it('guarda no máximo 12 e avisa quando falta espaço', () => {
    const s = mem()
    const a = embroideryStore('u1', s)
    for (let i = 0; i < 15; i++) a.save(newProject('data:x', `P${i}`, ''))
    expect(a.list()).toHaveLength(12)
    const full = { getItem: () => null, setItem: () => { throw new Error('quota') } }
    expect(() => embroideryStore('u1', full).save(newProject('data:x', 'P', ''))).toThrow(StorageFullError)
  })

  it('bastidor retangular é 4:3', () => {
    expect(hoopCm({ shape: 'retangular', cm: 20 })).toEqual({ w: 20, h: 15 })
    expect(hoopCm({ shape: 'redondo', cm: 20 })).toEqual({ w: 20, h: 20 })
  })

  it('foto inteira mantém a proporção da foto (retrato e paisagem)', () => {
    expect(hoopCm({ shape: 'foto', cm: 20, aspect: 4 / 3 })).toEqual({ w: 20, h: 15 })
    expect(hoopCm({ shape: 'foto', cm: 20, aspect: 3 / 4 })).toEqual({ w: 15, h: 20 })
    expect(hoopCm({ shape: 'foto', cm: 20 })).toEqual({ w: 20, h: 20 })
    const size = exportSize({ shape: 'foto', cm: 25, aspect: 1.5 })
    expect(size.w / size.h).toBeCloseTo(1.5, 1)
  })

  it('bordados antigos (sem método) continuam no clássico com o detalhe que tinham', () => {
    const old = { ...newProject('data:x', 'Antigo', ''), detail: 70 } as ReturnType<typeof newProject>
    delete old.method
    delete old.params
    expect(projectMethod(old)).toBe('classico')
    expect(projectParams(old).detail).toBe(70)
    expect(projectMethod(newProject('data:x', 'Novo', ''))).toBe('E')
  })
})
