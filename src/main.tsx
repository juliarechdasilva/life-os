import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { requestPersistence } from './lib/db'
import { load } from './lib/store'
import { initVault } from './lib/vault'
import './styles/index.css'

load().then(() => {
  initVault()
  requestPersistence()
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

// PWA: permite instalar e abrir sem internet (apenas em produção)
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(import.meta.env.BASE_URL + 'sw.js').catch(() => {})
  })
}
