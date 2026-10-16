import { describe, expect, it } from 'vitest'
import { formatBrPhone, normalizeBrPhone } from './phone'

describe('telefone', () => {
  it('aceita formatos comuns', () => {
    for (const t of ['(81) 99999-0000', '81999990000', '081 99999 0000', '+55 81 99999-0000', '5581999990000', '+5581999990000']) {
      expect(normalizeBrPhone(t)).toBe('+5581999990000')
    }
    expect(normalizeBrPhone('(81) 3333-4444')).toBe('+558133334444')
  })
  it('aceita número internacional com +', () => {
    expect(normalizeBrPhone('+351 912 345 678')).toBe('+351912345678')
  })
  it('recusa números inválidos', () => {
    for (const t of ['', 'abc', '123', '(81) 89999-0000', '(00) 99999-0000', '999990000']) expect(normalizeBrPhone(t)).toBeNull()
  })
  it('formata para mostrar', () => {
    expect(formatBrPhone('+5581999990000')).toBe('(81) 99999-0000')
    expect(formatBrPhone('+558133334444')).toBe('(81) 3333-4444')
  })
})
