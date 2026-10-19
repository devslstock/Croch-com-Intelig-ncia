/// <reference types="vitest" />
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { createHash } from 'node:crypto'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

/** Arquivos que não precisam estar no aparelho (imagens usadas só em e-mails, mapas de código). */
const SKIP = (f: string) => f === 'sw.js' || f.endsWith('.map') || f.startsWith('email-')

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name)
    return statSync(p).isDirectory() ? walk(p) : [p]
  })
}

/**
 * Uso sem internet: depois do build, escreve em dist/sw.js a lista de todos os arquivos do app e uma versão (hash do conteúdo).
 * O service worker guarda essa lista inteira no aparelho na primeira visita.
 */
function offlinePrecache(): Plugin {
  let dist = resolve('dist')
  return {
    name: 'tramado-offline-precache',
    apply: 'build',
    configResolved(config) {
      dist = resolve(config.root, config.build.outDir)
    },
    closeBundle() {
      const files = walk(dist).map((p) => relative(dist, p).split('\\').join('/')).filter((f) => !SKIP(f) && f !== 'index.html')
      const urls = ['/', ...files.map((f) => `/${f}`)]
      const hash = createHash('sha1')
      for (const f of ['index.html', ...files].sort()) hash.update(f).update(readFileSync(join(dist, f)))
      const swPath = join(dist, 'sw.js')
      const sw = readFileSync(swPath, 'utf8')
      writeFileSync(swPath, `self.__VERSION__=${JSON.stringify(hash.digest('hex').slice(0, 10))};self.__PRECACHE__=${JSON.stringify(urls)};\n${sw}`)
    },
  }
}

export default defineConfig({
  plugins: [react(), offlinePrecache()],
  worker: { format: 'es' },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
})
