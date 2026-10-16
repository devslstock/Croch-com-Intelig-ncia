import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { AuthProvider } from './auth/AuthProvider'
import { AccountProvider } from './billing/AccountProvider'
import './styles.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <AccountProvider>
        <App />
      </AccountProvider>
    </AuthProvider>
  </StrictMode>,
)
