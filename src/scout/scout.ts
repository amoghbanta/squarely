// Scout agent: studies a kid's past online games in the background, while the voice keeps talking.
// Plan → fetch games → engine-review every kid move → find recurring mistakes → Gemini 3.8 Flash
// turns ONLY those computed facts into a coaching plan → Memory.
import { Chess, type Color } from 'chess.js'
import { GoogleGenAI, ThinkingLevel } from '@google/genai'
import { StockfishEngine, type EngineLine } from '../engine/stockfish'
import { classifyPunishment } from '../chess/motifs'
import { BLUNDER_WIN_PROB_LOSS, winProb } from '../chess/facts'

export const BRAIN_MODEL = 'gemini-3.8-flash'

export type ScoutSource = { site: 'chesscom'; username: string } | { site: 'pgn'; pgn: string; username?: string }

type RawGame = { pgn: string; white: string; black: string; url?: string }

export type ScoutExample = { game: number; moveNumber: number; played: string; motif: string; facts: Record<string, unknown> | null }

export type ScoutReport = {
  username: string
  games: number
  record: { wins: number; losses: number; draws: number }
  movesReviewed: number
  mistakes: number
  motifs: Record<string, number>
  phases: { opening: number; middlegame: number; endgame: number }
  examples: ScoutExample[]
  plan: { headline: string; focus: string; tips: string[]; buddy_line: string } | null
}

type Step = (title: string, detail?: unknown) => void

const MAX_GAMES = 8
const MAX_PLIES = 80

async function fetchChessCom(username: string, step: Step): Promise<RawGame[]> {
  const u = encodeURIComponent(username.trim().toLowerCase())
  const res = await fetch(`https://api.chess.com/pub/player/${u}/games/archives`)
  if (!res.ok) throw new Error(`chess.com user "${username}" not found`)
  const { archives } = (await res.json()) as { archives: string[] }
  step('Found chess.com archives', { months: archives.length })
  const games: RawGame[] = []
  for (const url of [...archives].reverse()) {
    const month = (await (await fetch(url)).json()) as {
      games: { pgn?: string; rules: string; url: string; white: { username: string }; black: { username: string } }[]
    }
    for (const g of [...month.games].reverse()) {
      if (g.rules !== 'chess' || !g.pgn) continue
      games.push({ pgn: g.pgn, white: g.white.username, black: g.black.username, url: g.url })
      if (games.length >= MAX_GAMES) return games
    }
  }
  return games
}

function splitPgn(pgn: string): RawGame[] {
  return pgn
    .split(/\n\s*\n(?=\[Event )/)
    .map((p) => p.trim())
    .filter(Boolean)
    .slice(0, MAX_GAMES)
    .map((p) => ({
      pgn: p,
      white: p.match(/\[White "([^"]*)"\]/)?.[1] ?? '',
      black: p.match(/\[Black "([^"]*)"\]/)?.[1] ?? '',
    }))
}

export async function runScout(source: ScoutSource, apiKey: string | null, step: Step): Promise<ScoutReport> {
  step('Plan', 'fetch games → review every move with the engine → find patterns → write plan → save to memory')

  // 1. Fetch
  const raw = source.site === 'chesscom' ? await fetchChessCom(source.username, step) : splitPgn(source.pgn)
  if (!raw.length) throw new Error('no standard chess games found')
  const username = source.username ?? raw[0].white
  step('Fetched games', { games: raw.length })

  // 2. Engine review: its own Stockfish worker so the live game stays fast.
  const engine = new StockfishEngine()
  const motifs: Record<string, number> = {}
  const phases = { opening: 0, middlegame: 0, endgame: 0 }
  const examples: ScoutExample[] = []
  const record = { wins: 0, losses: 0, draws: 0 }
  let movesReviewed = 0
  let mistakes = 0

  for (let gi = 0; gi < raw.length; gi++) {
    const g = raw[gi]
    const chess = new Chess()
    try {
      chess.loadPgn(g.pgn)
    } catch {
      step(`Game ${gi + 1}: could not read PGN, skipped`)
      continue
    }
    const kid: Color = g.black.toLowerCase() === username.toLowerCase() ? 'b' : 'w'
    const result = chess.getHeaders().Result ?? '*'
    if (result === '1/2-1/2') record.draws++
    else if ((result === '1-0') === (kid === 'w') && result !== '*') record.wins++
    else if (result !== '*') record.losses++

    const history = chess.history({ verbose: true }).slice(0, MAX_PLIES)
    // Evaluate every position once; each gives the eval and the side-to-move's best line.
    const fens = [history[0]?.before ?? new Chess().fen(), ...history.map((m) => m.after)]
    const evals: { kidCp: number; best?: EngineLine }[] = []
    for (const fen of fens) {
      const r = await engine.analyse(fen, { depth: 8 })
      const stm = fen.split(' ')[1] as Color
      const cp = r.lines[0]?.scoreCp ?? 0
      evals.push({ kidCp: stm === kid ? cp : -cp, best: r.lines[0] })
    }
    let gameMistakes = 0
    history.forEach((m, i) => {
      if (m.color !== kid) return
      movesReviewed++
      // A move that ends the game (mate/stalemate) has no reply to judge it by.
      if (m.san.endsWith('#') || !evals[i + 1].best) return
      const before = winProb(evals[i].kidCp)
      const after = winProb(evals[i + 1].kidCp)
      if (before - after < BLUNDER_WIN_PROB_LOSS || after > 0.85) return
      const p = classifyPunishment(m.after, evals[i + 1].best, kid)
      const motif = p.motif ?? 'loses_material'
      motifs[motif] = (motifs[motif] ?? 0) + 1
      const moveNumber = Math.floor(i / 2) + 1
      if (moveNumber <= 10) phases.opening++
      else if (moveNumber <= 30) phases.middlegame++
      else phases.endgame++
      mistakes++
      gameMistakes++
      if (examples.length < 6) examples.push({ game: gi + 1, moveNumber, played: m.san, motif, facts: p.hintFacts })
    })
    step(`Reviewed game ${gi + 1}/${raw.length}`, { kidPlays: kid === 'w' ? 'white' : 'black', result, bigMistakes: gameMistakes })
  }
  engine.dispose()
  step('Patterns found', { mistakes, motifs, phases })

  const report: ScoutReport = { username, games: raw.length, record, movesReviewed, mistakes, motifs, phases, examples, plan: null }

  // 3. Plan: Gemini phrases the computed facts. It may not add chess claims of its own.
  if (apiKey) {
    try {
      const ai = new GoogleGenAI({ apiKey })
      const facts = { record, movesReviewed, mistakes, motifs, phases, examples }
      const ask = () => ai.models.generateContent({
        model: BRAIN_MODEL,
        contents: `FACTS (computed by a chess engine, the only truth you may use):\n${JSON.stringify(facts)}`,
        config: {
          systemInstruction:
            'You are a kind chess coach writing a short practice plan for a child aged 6 to 12. Use ONLY the FACTS. Every tip must be about a motif that appears in FACTS.motifs and may mention an example by game and move number. Do not add any other chess claims, openings, or numbers that are not in FACTS. Simple words. buddy_line is one cheerful spoken sentence the chess buddy says to the child about what you found.',
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          responseMimeType: 'application/json',
          responseJsonSchema: {
            type: 'object',
            properties: {
              headline: { type: 'string' },
              focus: { type: 'string', enum: Object.keys(motifs).length ? Object.keys(motifs) : ['none'] },
              tips: { type: 'array', items: { type: 'string' }, maxItems: 3 },
              buddy_line: { type: 'string' },
            },
            required: ['headline', 'focus', 'tips', 'buddy_line'],
          },
        },
      })
      // One retry: a transient failure shouldn't cost the kid their plan.
      const r = await ask().catch(() => ask())
      report.plan = JSON.parse(r.text ?? 'null')
      step('Coach plan written', { model: BRAIN_MODEL, focus: report.plan?.focus })
    } catch (e) {
      step('Plan skipped', String(e))
    }
  }
  return report
}
