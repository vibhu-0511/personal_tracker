import React from 'react'
import { createRoot } from 'react-dom/client'
import Gallery from './Gallery.jsx'
import '../styles.css'
import '../styles/tokens.css'
import '../styles/tiles.css'

// Dev-only entry (served by `vite` at /gallery.html; not a production build input).
createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Gallery />
  </React.StrictMode>
)
