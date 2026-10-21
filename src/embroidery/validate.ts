/** Validação do arquivo de foto antes de qualquer processamento (formato real, tamanho e resolução). */

export type ImageFormat = 'jpeg' | 'png' | 'webp'

export interface UploadLimits {
  maxBytes: number
  maxPixels: number
  minSide: number
}

const num = (v: unknown, fallback: number) => {
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? n : fallback
}

/** Limites configuráveis por variável de ambiente (VITE_EMB_MAX_MB, VITE_EMB_MAX_MEGAPIXELS, VITE_EMB_MIN_SIDE). */
export function uploadLimits(env: Record<string, unknown> = (import.meta as unknown as { env?: Record<string, unknown> }).env ?? {}): UploadLimits {
  return {
    maxBytes: Math.round(num(env.VITE_EMB_MAX_MB, 15) * 1024 * 1024),
    maxPixels: Math.round(num(env.VITE_EMB_MAX_MEGAPIXELS, 40) * 1_000_000),
    minSide: Math.round(num(env.VITE_EMB_MIN_SIDE, 64)),
  }
}

/** Descobre o formato pelos primeiros bytes do arquivo (não confia na extensão nem no tipo informado). */
export function sniffFormat(b: Uint8Array): ImageFormat | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpeg'
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a) return 'png'
  if (b.length >= 12 && b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'webp'
  return null
}

export type Check = { ok: true; format: ImageFormat } | { ok: false; message: string }

/** Confere tamanho e formato (primeiros bytes). */
export function checkFile(size: number, head: Uint8Array, limits: UploadLimits = uploadLimits()): Check {
  if (size <= 0) return { ok: false, message: 'O arquivo está vazio.' }
  if (size > limits.maxBytes) return { ok: false, message: `A foto é grande demais (limite de ${Math.round(limits.maxBytes / 1024 / 1024)} MB).` }
  const format = sniffFormat(head)
  if (!format) return { ok: false, message: 'Esse arquivo não é uma foto aceita. Use JPG, PNG ou WebP.' }
  return { ok: true, format }
}

/** Confere a resolução depois de abrir a imagem. */
export function checkDimensions(width: number, height: number, limits: UploadLimits = uploadLimits()): { ok: true } | { ok: false; message: string } {
  if (!(width > 0 && height > 0)) return { ok: false, message: 'Não consegui ler o tamanho da foto.' }
  if (Math.min(width, height) < limits.minSide) return { ok: false, message: `A foto é pequena demais (mínimo de ${limits.minSide} pixels no lado menor).` }
  if (width * height > limits.maxPixels) return { ok: false, message: `A foto tem pixels demais (limite de ${Math.round(limits.maxPixels / 1_000_000)} milhões).` }
  return { ok: true }
}
