import { parseYarnCsv, type YarnKind, type YarnPalette } from './yarn'

const files = import.meta.glob('./data/*/*.csv', { query: '?raw', import: 'default', eager: true }) as Record<string, string>

export const KIND_LABEL: Record<YarnKind, string> = {
  croche: 'Crochê',
  'ponto-cruz': 'Ponto cruz / bordado',
}

/**
 * Tabelas de cores em src/yarn/data/<tipo>/marca__linha.csv, onde <tipo> é `croche` ou `ponto-cruz`.
 * Ver README na pasta.
 */
export const YARN_PALETTES: YarnPalette[] = Object.entries(files)
  .map(([path, csv]) => {
    const kind: YarnKind = path.includes('/ponto-cruz/') ? 'ponto-cruz' : 'croche'
    const id = path.replace(/^.*\//, '').replace(/\.csv$/, '')
    const [brand, line] = id.includes('__') ? id.split('__') : [id, '']
    return { ...parseYarnCsv(id, brand.replace(/-/g, ' '), line.replace(/-/g, ' '), csv), kind }
  })
  .filter((p) => p.colors.length > 0)
  .sort((a, b) => a.id.localeCompare(b.id))

/** Fio padrão ao abrir uma tela: o último escolhido, senão o DMC, senão o primeiro da lista. */
export function defaultYarnId(): string {
  let saved: string | null = null
  try { saved = localStorage.getItem('tramado:yarn') } catch { /* sem armazenamento */ }
  if (saved === '') return ''
  return YARN_PALETTES.find((y) => y.id === saved)?.id ?? YARN_PALETTES.find((y) => y.id === 'DMC__Mouline')?.id ?? YARN_PALETTES[0]?.id ?? ''
}
