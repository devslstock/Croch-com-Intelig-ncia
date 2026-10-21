import { resolve } from 'node:path'
import { defineConfig } from 'vite'

/** Galeria de desenvolvimento (não faz parte do app): `npm run gallery` gera dist-gallery/ e `npm run gallery:serve` abre. */
export default defineConfig({
  build: { outDir: 'dist-gallery', emptyOutDir: true, rollupOptions: { input: resolve(__dirname, 'gallery.html') } },
})
