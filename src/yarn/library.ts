import { parseYarnCsv, type YarnPalette } from './yarn'

const files = import.meta.glob('./data/*.csv', { query: '?raw', import: 'default', eager: true }) as Record<string, string>

/** Tabelas de cores em src/yarn/data/marca__linha.csv. Ver README na pasta. */
export const YARN_PALETTES: YarnPalette[] = Object.entries(files)
  .map(([path, csv]) => {
    const id = path.replace(/^.*\//, '').replace(/\.csv$/, '')
    const [brand, line] = id.includes('__') ? id.split('__') : [id, '']
    return parseYarnCsv(id, brand.replace(/-/g, ' '), line.replace(/-/g, ' '), csv)
  })
  .filter((p) => p.colors.length > 0)
  .sort((a, b) => a.id.localeCompare(b.id))
