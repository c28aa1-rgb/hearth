import '@fontsource-variable/geist'
import '@fontsource-variable/geist-mono'
import '@fontsource-variable/fraunces/full.css'
import './styles/tokens.css'
import './styles/global.css'
import './styles/app.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { api } from './lib/api'

// Lets styles adapt to the window frame (macOS traffic lights and vibrancy, Windows title-bar buttons).
document.documentElement.dataset.platform = api.platform

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
)
