// Copies the single-threaded lite Stockfish build into public/ so it can be
// loaded as a classic Web Worker without cross-origin-isolation headers.
import { copyFileSync, mkdirSync } from 'node:fs'

const src = 'node_modules/stockfish/bin'
const dest = 'public/stockfish'
mkdirSync(dest, { recursive: true })
for (const f of ['stockfish-19-lite-single.js', 'stockfish-19-lite-single.wasm']) {
  copyFileSync(`${src}/${f}`, `${dest}/${f}`)
}
