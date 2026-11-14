import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import './styles.css'
import './styles/tokens.css'
import './styles/shell.css'
import './styles/nav.css'
import './styles/inspector.css'
import './styles/palette.css'
import './styles/overlays.css'
import './styles/screens.css'
import './styles/tiles.css'
import './pwa/registerSW.js'

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
