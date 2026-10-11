import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import { MOBILE } from './lib/mobile.js'
import './index.css'

createRoot(document.getElementById('root')).render(
  <StrictMode><App /></StrictMode>
)

// Not in the native/Claude-page builds (served from disk / a host that blocks service
// workers). The GitHub Pages build (VITE_PAGES=1) needs it: offline use and home-screen install.
const PAGES = import.meta.env.VITE_PAGES === '1'
if ((!MOBILE || PAGES) && 'serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {})
}
