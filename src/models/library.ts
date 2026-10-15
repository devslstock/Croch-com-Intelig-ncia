import { circle, ellipse, heart, poly, rect, star, type Shape } from './shapes'

export type ModelCategory = 'bebe' | 'casal' | 'pet' | 'pronto' | 'receita'

export const CATEGORY_LABEL: Record<ModelCategory, string> = {
  bebe: 'Bebê',
  casal: 'Casal',
  pet: 'Pet',
  pronto: 'Gráficos prontos',
  receita: 'Receitas',
}
export const CATEGORY_ICON: Record<ModelCategory, string> = { bebe: '👶', casal: '💍', pet: '🐶', pronto: '▦', receita: '📖' }

export interface Model {
  id: string
  title: string
  category: ModelCategory
  /** Cor de fundo (opcional para a pessoa). */
  bg: string
  colors: Record<string, string>
  art: Shape[]
  /** Nome de exemplo e cor das letras na miniatura do catálogo. */
  sample: string
  sampleColor: string
  /** Receitas são só texto (sem desenho). */
  recipe?: 'alfabeto' | 'numeros'
  /** Gráficos prontos não levam nome nem data. */
  plain?: boolean
}

const eyes = (y: number, dx: number, r: number, f: string): Shape[] => [circle(50 - dx, y, r, f), circle(50 + dx, y, r, f)]
const cheeks = (y: number, dx: number, r: number, f: string): Shape[] => [circle(50 - dx, y, r, f), circle(50 + dx, y, r, f)]

export const MODELS: Model[] = [
  {
    id: 'ursinho', title: 'Ursinho', category: 'bebe', bg: '#f6d3b3', sample: 'THEO', sampleColor: '#7a4a2a',
    colors: { fur: '#b5733f', ear: '#8a532b', snout: '#ebcc9f', dark: '#2f221b', cheek: '#f0a08c' },
    art: [
      circle(24, 24, 13, 'fur'), circle(76, 24, 13, 'fur'), circle(24, 24, 7, 'ear'), circle(76, 24, 7, 'ear'),
      ellipse(50, 94, 26, 14, 'fur'), ellipse(50, 52, 34, 31, 'fur'), ellipse(50, 64, 15, 12, 'snout'),
      ellipse(50, 58, 6, 4.5, 'dark'), rect(49, 61, 2, 7, 'dark'), ...eyes(46, 14, 4, 'dark'), ...cheeks(58, 22, 5, 'cheek'),
    ],
  },
  {
    id: 'coelhinho', title: 'Coelhinho', category: 'bebe', bg: '#cfe3f7', sample: 'MAITÊ', sampleColor: '#3d6f9e',
    colors: { fur: '#f7f3ee', inner: '#f2b3be', dark: '#3a3140', cheek: '#f6b8c2' },
    art: [
      ellipse(36, 22, 9, 22, 'fur', -6), ellipse(64, 22, 9, 22, 'fur', 6), ellipse(36, 24, 4.5, 16, 'inner', -6), ellipse(64, 24, 4.5, 16, 'inner', 6),
      ellipse(50, 96, 24, 14, 'fur'), ellipse(50, 60, 30, 27, 'fur'), ...eyes(56, 12, 3.8, 'dark'),
      ellipse(50, 65, 4, 3, 'inner'), rect(49.2, 67, 1.6, 5, 'dark'), ...cheeks(66, 20, 5, 'cheek'),
    ],
  },
  {
    id: 'patinho', title: 'Patinho', category: 'bebe', bg: '#c6e8ea', sample: 'NOAH', sampleColor: '#7a5a1f',
    colors: { body: '#f7d33f', wing: '#edc21c', beak: '#f29a2e', dark: '#2b2b2b', cheek: '#f6a48c' },
    art: [
      ellipse(22, 78, 9, 13, 'wing', 15), ellipse(78, 78, 9, 13, 'wing', -15), ellipse(50, 78, 30, 20, 'body'),
      poly('body', [44, 18], [50, 6], [56, 18]), circle(50, 42, 27, 'body'), ellipse(50, 52, 12, 6, 'beak'),
      ...eyes(40, 11, 3.5, 'dark'), ...cheeks(50, 19, 4.5, 'cheek'),
    ],
  },
  {
    id: 'leaozinho', title: 'Leãozinho', category: 'bebe', bg: '#f6e3a8', sample: 'ARTHUR', sampleColor: '#8a4a12',
    colors: { mane: '#e08a2e', face: '#f6c24a', muzzle: '#fbe7b6', dark: '#4d2c1c', cheek: '#f0a07a' },
    art: [
      circle(50, 50, 44, 'mane'), circle(86, 50, 12, 'mane'), circle(75.5, 75.5, 12, 'mane'), circle(50, 86, 12, 'mane'), circle(24.5, 75.5, 12, 'mane'),
      circle(14, 50, 12, 'mane'), circle(24.5, 24.5, 12, 'mane'), circle(50, 14, 12, 'mane'), circle(75.5, 24.5, 12, 'mane'),
      circle(28, 24, 8, 'face'), circle(72, 24, 8, 'face'), circle(50, 52, 30, 'face'), ellipse(50, 64, 16, 12, 'muzzle'),
      ellipse(50, 58, 6, 4.5, 'dark'), rect(49, 61, 2, 7, 'dark'), ...eyes(46, 12, 3.6, 'dark'), ...cheeks(60, 18, 4, 'cheek'),
    ],
  },
  {
    id: 'baleinha', title: 'Baleinha', category: 'bebe', bg: '#cfe5fa', sample: 'DAVI', sampleColor: '#2f5f8f',
    colors: { body: '#5aa0d8', belly: '#d2e8f7', dark: '#1f3b57', spout: '#8ec9ee', cheek: '#f4a8a0' },
    art: [
      ellipse(44, 14, 3, 6, 'spout'), ellipse(56, 14, 3, 6, 'spout'), rect(48.5, 16, 3, 12, 'spout'),
      poly('body', [78, 60], [92, 36], [97, 46], [95, 58], [86, 68]), ellipse(46, 62, 38, 26, 'body'), ellipse(44, 73, 28, 12, 'belly'),
      circle(28, 56, 3.2, 'dark'), circle(22, 66, 4, 'cheek'),
    ],
  },
  {
    id: 'pandinha', title: 'Pandinha', category: 'bebe', bg: '#f4dd9f', sample: 'GAEL', sampleColor: '#3a3a40',
    colors: { white: '#fbfaf7', black: '#2d2d32' },
    art: [
      circle(22, 24, 12, 'black'), circle(78, 24, 12, 'black'), ellipse(24, 92, 9, 12, 'black'), ellipse(76, 92, 9, 12, 'black'),
      ellipse(50, 96, 28, 16, 'white'), ellipse(50, 50, 33, 30, 'white'),
      ellipse(36, 48, 8.5, 11, 'black', 20), ellipse(64, 48, 8.5, 11, 'black', -20), circle(37, 47, 3, 'white'), circle(63, 47, 3, 'white'),
      ellipse(50, 62, 5, 3.5, 'black'), rect(49, 65, 2, 5, 'black'),
    ],
  },
  {
    id: 'raposinha', title: 'Raposinha', category: 'bebe', bg: '#c4e8c9', sample: 'LUNA', sampleColor: '#8a3a10',
    colors: { fur: '#e5762b', cream: '#fbf1e0', dark: '#3a2a25', ear: '#6a3a24' },
    art: [
      poly('fur', [14, 8], [40, 28], [16, 46]), poly('ear', [20, 20], [33, 30], [21, 38]),
      poly('fur', [86, 8], [60, 28], [84, 46]), poly('ear', [80, 20], [67, 30], [79, 38]),
      ellipse(50, 56, 36, 26, 'fur'), poly('cream', [18, 58], [50, 50], [82, 58], [50, 92]),
      ellipse(50, 86, 5, 3.5, 'dark'), ellipse(36, 54, 3, 3.6, 'dark'), ellipse(64, 54, 3, 3.6, 'dark'),
    ],
  },
  {
    id: 'coruja', title: 'Coruja', category: 'bebe', bg: '#ddd6f3', sample: 'SOFIA', sampleColor: '#5a3f9a',
    colors: { body: '#a8764a', belly: '#efd8b0', wing: '#8c5d37', white: '#ffffff', dark: '#2e2430', beak: '#f2a93b' },
    art: [
      poly('body', [22, 8], [36, 24], [18, 26]), poly('body', [78, 8], [64, 24], [82, 26]),
      ellipse(18, 64, 8, 20, 'wing'), ellipse(82, 64, 8, 20, 'wing'), ellipse(50, 56, 34, 38, 'body'), ellipse(50, 74, 20, 20, 'belly'),
      circle(36, 42, 13, 'belly'), circle(64, 42, 13, 'belly'), circle(36, 42, 8, 'white'), circle(64, 42, 8, 'white'),
      circle(36, 43, 4.5, 'dark'), circle(64, 43, 4.5, 'dark'), poly('beak', [44, 50], [56, 50], [50, 61]),
    ],
  },
  {
    id: 'elefantinho', title: 'Elefantinho', category: 'bebe', bg: '#d5e6f7', sample: 'BENTO', sampleColor: '#46607a',
    colors: { skin: '#9fb4c9', inner: '#f0b7c0', dark: '#26303a', cheek: '#f4a8a0' },
    art: [
      circle(16, 44, 18, 'skin'), circle(84, 44, 18, 'skin'), circle(16, 44, 11, 'inner'), circle(84, 44, 11, 'inner'),
      circle(50, 46, 30, 'skin'), rect(42, 54, 16, 40, 'skin', 8), ...eyes(42, 12, 3.5, 'dark'), ...cheeks(54, 20, 4.5, 'cheek'),
    ],
  },
  {
    id: 'gatinho', title: 'Gatinho', category: 'pet', bg: '#f1d4e0', sample: 'MEL', sampleColor: '#8a4a12',
    colors: { fur: '#e9a14a', stripe: '#c97d2a', muzzle: '#fff1de', pink: '#f1a2b0', dark: '#2d2a2a' },
    art: [
      poly('fur', [18, 12], [42, 30], [16, 46]), poly('pink', [22, 22], [35, 30], [22, 38]),
      poly('fur', [82, 12], [58, 30], [84, 46]), poly('pink', [78, 22], [65, 30], [78, 38]),
      ellipse(50, 56, 35, 30, 'fur'), rect(48, 28, 4, 10, 'stripe'), rect(40, 30, 3.5, 8, 'stripe'), rect(56.5, 30, 3.5, 8, 'stripe'),
      ellipse(50, 68, 14, 10, 'muzzle'), poly('pink', [45, 62], [55, 62], [50, 68]), ellipse(36, 54, 4, 5, 'dark'), ellipse(64, 54, 4, 5, 'dark'),
    ],
  },
  {
    id: 'cachorrinho', title: 'Cachorrinho', category: 'pet', bg: '#f5e3c3', sample: 'THOR', sampleColor: '#6a4426',
    colors: { fur: '#c98f55', ear: '#8a5a35', muzzle: '#fbeed7', dark: '#2b2220', tongue: '#f08a96' },
    art: [
      ellipse(18, 48, 11, 24, 'ear', 15), ellipse(82, 48, 11, 24, 'ear', -15), ellipse(50, 98, 24, 14, 'fur'), ellipse(50, 50, 30, 32, 'fur'),
      ellipse(36, 40, 9, 10, 'ear'), ellipse(50, 66, 17, 14, 'muzzle'), ellipse(50, 78, 6, 7, 'tongue'), ellipse(50, 58, 7, 5, 'dark'), ...eyes(44, 12, 4, 'dark'),
    ],
  },
  {
    id: 'passarinho', title: 'Passarinho', category: 'pet', bg: '#cfeeea', sample: 'LIZ', sampleColor: '#2d7fb8',
    colors: { body: '#4aa3df', wing: '#2d7fb8', belly: '#f3f0e7', beak: '#f2a93b', dark: '#232323', cheek: '#f4a8a0' },
    art: [
      poly('body', [44, 24], [50, 8], [56, 24]), ellipse(24, 62, 10, 18, 'wing', 20), ellipse(76, 62, 10, 18, 'wing', -20),
      circle(50, 56, 34, 'body'), ellipse(50, 68, 22, 20, 'belly'), poly('beak', [44, 52], [56, 52], [50, 62]), ...eyes(46, 12, 3.6, 'dark'), ...cheeks(56, 18, 4, 'cheek'),
    ],
  },
  {
    id: 'coracao', title: 'Coração', category: 'casal', bg: '#f3dede', sample: 'L + G', sampleColor: '#a8283e',
    colors: { red: '#d6455d', shine: '#f4a0ad' },
    art: [...heart(50, 8, 84, 'red'), ellipse(30, 30, 6, 3.6, 'shine', -35)],
  },
  {
    id: 'coracoes', title: 'Corações apaixonados', category: 'casal', bg: '#f2e3ea', sample: 'L + G', sampleColor: '#7b2a33',
    colors: { wine: '#8a2a3f', pink: '#f08fa3' },
    art: [...heart(38, 18, 62, 'wine'), ...heart(66, 38, 44, 'pink')],
  },
  {
    id: 'aliancas', title: 'Alianças', category: 'casal', bg: '#e8dcc6', sample: 'L + G', sampleColor: '#8a6a1f',
    colors: { gold: '#e2b23a', gold2: '#c99a2a', gem: '#7cc4ec', bg: '#e8dcc6' },
    art: [
      circle(62, 60, 26, 'gold2'), circle(62, 60, 19, 'bg'), circle(38, 60, 26, 'gold'), circle(38, 60, 19, 'bg'),
      poly('gem', [38, 6], [48, 18], [38, 30], [28, 18]),
    ],
  },
  {
    id: 'estrela', title: 'Estrela', category: 'pronto', plain: true, bg: '#fff6d8', sample: '', sampleColor: '#000000',
    colors: { star: '#f4c22b', shine: '#fbe08a' },
    art: [star(50, 54, 46, 'star'), star(50, 54, 22, 'shine')],
  },
  {
    id: 'flor', title: 'Flor', category: 'pronto', plain: true, bg: '#e6f4e0', sample: '', sampleColor: '#000000',
    colors: { petal: '#f08fb0', center: '#f7d23f', stem: '#4a9a4a' },
    art: [
      rect(47, 56, 6, 44, 'stem'), ellipse(32, 82, 14, 6, 'stem', -30), ellipse(68, 74, 14, 6, 'stem', 30),
      circle(50, 20, 15, 'petal'), circle(72, 36, 15, 'petal'), circle(64, 60, 15, 'petal'), circle(36, 60, 15, 'petal'), circle(28, 36, 15, 'petal'),
      circle(50, 42, 12, 'center'),
    ],
  },
  {
    id: 'sol', title: 'Sol', category: 'pronto', plain: true, bg: '#d8eefa', sample: '', sampleColor: '#000000',
    colors: { sun: '#f7c52e', ray: '#f29a2e' },
    art: [
      poly('ray', [50, 2], [58, 22], [42, 22]), poly('ray', [50, 98], [58, 78], [42, 78]), poly('ray', [2, 50], [22, 42], [22, 58]), poly('ray', [98, 50], [78, 42], [78, 58]),
      poly('ray', [16, 16], [34, 24], [24, 34]), poly('ray', [84, 16], [66, 24], [76, 34]), poly('ray', [16, 84], [34, 76], [24, 66]), poly('ray', [84, 84], [66, 76], [76, 66]),
      circle(50, 50, 26, 'sun'),
    ],
  },
  {
    id: 'coroa', title: 'Coroa', category: 'pronto', plain: true, bg: '#efe3f7', sample: '', sampleColor: '#000000',
    colors: { gold: '#f2bd2c', gold2: '#d99a1c', red: '#d6455d', blue: '#4a8fd8' },
    art: [
      poly('gold', [10, 78], [6, 30], [30, 52], [50, 18], [70, 52], [94, 30], [90, 78]), rect(10, 72, 80, 16, 'gold2', 3),
      circle(6, 28, 6, 'red'), circle(50, 15, 6, 'red'), circle(94, 28, 6, 'red'), circle(30, 80, 4.5, 'blue'), circle(50, 80, 4.5, 'red'), circle(70, 80, 4.5, 'blue'),
    ],
  },
  {
    id: 'alfabeto', title: 'Alfabeto', category: 'receita', recipe: 'alfabeto', plain: true, bg: '#f3efe6', sample: '', sampleColor: '#3a2a22', colors: {}, art: [],
  },
  {
    id: 'numeros', title: 'Números', category: 'receita', recipe: 'numeros', plain: true, bg: '#f3efe6', sample: '', sampleColor: '#3a2a22', colors: {}, art: [],
  },
]

export const MODEL_CATEGORIES: ModelCategory[] = ['bebe', 'casal', 'pet', 'pronto', 'receita']

/** Texto do campo de nome conforme o tipo de modelo. */
export function nameLabel(m: Model): string {
  if (m.category === 'bebe') return 'Nome do bebê'
  if (m.category === 'pet') return 'Nome do pet'
  return 'Nome ou iniciais'
}
