import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import { App } from './App'
import { game } from './game/controller'
import { runTool } from './agent/tools'

// Dev-only hook so the tool layer can be driven from the console / browser automation.
if (import.meta.env.DEV) Object.assign(window, { __pawnpal: { game, runTool } })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
