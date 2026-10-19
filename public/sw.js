// Service worker do Tramado: o aplicativo inteiro fica guardado no aparelho e abre sem internet.
// A lista de arquivos (self.__PRECACHE__) e a versão (self.__VERSION__) são escritas no build por vite.config.ts.
// - Instalação: guarda todos os arquivos do app (páginas, scripts, estilos, ícones, imagens).
// - Páginas: rede primeiro (para pegar versões novas); sem rede ou se demorar mais de 3 s, usa a cópia guardada.
// - Arquivos do app: cópia guardada primeiro (são idênticos entre versões, o nome tem o hash do conteúdo).
// - Outros domínios (Supabase, pagamento) e requisições que não são GET nunca passam pelo cache.
const VERSION = self.__VERSION__ || 'dev'
const CACHE = `tramado-${VERSION}`
const PRECACHE = self.__PRECACHE__ || ['/']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then(async (cache) => {
      // A página principal é obrigatória; os demais arquivos entram um a um (um que falhe não derruba a instalação).
      await cache.add(new Request('/', { cache: 'reload' }))
      await Promise.all(PRECACHE.filter((u) => u !== '/').map((u) => cache.add(new Request(u, { cache: 'reload' })).catch(() => undefined)))
    }).then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

const withTimeout = (promise, ms) =>
  Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))])

self.addEventListener('fetch', (event) => {
  const req = event.request
  const url = new URL(req.url)
  if (req.method !== 'GET' || url.origin !== self.location.origin) return

  // Abrir o app (qualquer endereço do site): sempre a mesma página; as telas são do próprio app.
  if (req.mode === 'navigate') {
    event.respondWith(
      withTimeout(fetch(req), 3000)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone()
            caches.open(CACHE).then((c) => c.put('/', copy))
          }
          return res
        })
        .catch(() => caches.match('/').then((r) => r || Response.error())),
    )
    return
  }

  // Arquivos do app: cópia guardada primeiro; se não houver, busca e guarda.
  event.respondWith(
    caches.match(req).then(
      (hit) =>
        hit ||
        fetch(req).then((res) => {
          if (res.ok && (url.pathname.startsWith('/assets/') || PRECACHE.includes(url.pathname))) {
            const copy = res.clone()
            caches.open(CACHE).then((c) => c.put(req, copy))
          }
          return res
        }),
    ),
  )
})
