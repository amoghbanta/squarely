// Thin UCI wrapper around the Stockfish WASM web worker.
// Every evaluation the app speaks about comes from here (or chess.js) — never from the LLM.

export type EngineLine = {
  move: string // UCI, e.g. "e2e4"
  scoreCp: number // centipawns from the side-to-move's perspective (mate mapped to ±100000)
  mate: number | null
  pv: string[]
}

export type EngineResult = {
  lines: EngineLine[] // sorted best first
  depth: number
}

const MATE_CP = 100000

export class StockfishEngine {
  private worker: Worker
  private listeners = new Set<(line: string) => void>()
  private chain: Promise<unknown> = Promise.resolve()
  private ready: Promise<void>
  private failed: Error | null = null

  constructor(url = '/stockfish/stockfish-19-lite-single.js') {
    this.worker = new Worker(url)
    this.worker.onmessage = (e: MessageEvent<string>) => {
      for (const l of this.listeners) l(String(e.data))
    }
    this.worker.onerror = (e) => {
      this.failed = new Error(`engine failed to load: ${e.message}`)
    }
    this.ready = (async () => {
      await this.waitFor('uci', (l) => l === 'uciok')
      await this.waitFor('isready', (l) => l === 'readyok')
    })()
  }

  private send(cmd: string) {
    this.worker.postMessage(cmd)
  }

  /** Send a command and wait for its terminating line. Times out so a dead worker can't hang a tool call. */
  private waitFor(cmd: string, done: (line: string) => boolean, collect?: (line: string) => void, timeoutMs = 15000) {
    return new Promise<void>((resolve, reject) => {
      if (this.failed) return reject(this.failed)
      let stopping = false
      const timer = setTimeout(() => {
        const err = this.failed ?? new Error(`engine timeout on "${cmd}"`)
        if (!cmd.startsWith('go') || this.failed) {
          this.listeners.delete(fn)
          return reject(err)
        }
        // Stop the search and swallow its late bestmove here, so it can't leak into the next job.
        stopping = true
        this.send('stop')
        setTimeout(() => {
          if (this.listeners.delete(fn)) reject(err)
        }, 3000)
      }, timeoutMs)
      const fn = (line: string) => {
        if (stopping) {
          if (line.startsWith('bestmove')) {
            this.listeners.delete(fn)
            reject(this.failed ?? new Error(`engine timeout on "${cmd}"`))
          }
          return
        }
        collect?.(line)
        if (done(line)) {
          clearTimeout(timer)
          this.listeners.delete(fn)
          resolve()
        }
      }
      this.listeners.add(fn)
      this.send(cmd)
    })
  }

  /** Serialise engine jobs: UCI is a single conversation. */
  private enqueue<T>(job: () => Promise<T>): Promise<T> {
    const next = this.chain.then(() => this.ready).then(job)
    this.chain = next.catch(() => undefined)
    return next
  }

  analyse(fen: string, opts: { depth?: number; multiPv?: number; skill?: number; searchMoves?: string[] } = {}): Promise<EngineResult> {
    const depth = opts.depth ?? 12
    const multiPv = opts.multiPv ?? 1
    return this.enqueue(async () => {
      this.send(`setoption name Skill Level value ${opts.skill ?? 20}`)
      this.send(`setoption name MultiPV value ${multiPv}`)
      this.send(`position fen ${fen}`)
      const byPv = new Map<number, EngineLine>()
      let reached = 0
      let bestmove = ''
      await this.waitFor(
        `go depth ${depth}${opts.searchMoves?.length ? ` searchmoves ${opts.searchMoves.join(' ')}` : ''}`,
        (l) => l.startsWith('bestmove'),
        (l) => {
          if (l.startsWith('bestmove')) {
            bestmove = l.split(' ')[1] ?? ''
            return
          }
          if (!l.startsWith('info') || !l.includes(' pv ')) return
          const t = l.split(' ')
          const at = (k: string) => t.indexOf(k)
          const d = Number(t[at('depth') + 1])
          const pvIdx = at('multipv') >= 0 ? Number(t[at('multipv') + 1]) : 1
          const scoreType = t[at('score') + 1]
          const scoreVal = Number(t[at('score') + 2])
          const mate = scoreType === 'mate' ? scoreVal : null
          const scoreCp = mate !== null ? Math.sign(mate || -1) * (MATE_CP - Math.abs(mate)) : scoreVal
          const pv = t.slice(at('pv') + 1)
          reached = Math.max(reached, d)
          byPv.set(pvIdx, { move: pv[0], scoreCp, mate, pv })
        },
      )
      const lines = [...byPv.entries()].sort((a, b) => a[0] - b[0]).map(([, v]) => v)
      if (!lines.length && bestmove && bestmove !== '(none)') {
        lines.push({ move: bestmove, scoreCp: 0, mate: null, pv: [bestmove] })
      }
      return { lines, depth: reached }
    })
  }

  dispose() {
    this.worker.terminate()
  }
}

let shared: StockfishEngine | null = null
export const getEngine = () => (shared ??= new StockfishEngine())
