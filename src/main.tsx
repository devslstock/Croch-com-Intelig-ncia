import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { AuthProvider } from './auth/AuthProvider'
import { AccountProvider } from './billing/AccountProvider'
import { Footer } from './components/Footer'
import './styles.css'

// PWA: o service worker só roda na versão publicada (no `npm run dev` atrapalharia o recarregamento).
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {})
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <AccountProvider>
        <App />
        <Footer />
      </AccountProvider>
    </AuthProvider>
  </StrictMode>,
)
