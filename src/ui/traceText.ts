// Plain-English agent log: turns each trace entry into one sentence anyone can read.
// The raw JSON stays available behind "Show details" for the technical crowd.
import type { TraceEntry } from '../game/controller'
import { MOTIF_LABEL } from './ScoutCard'

type J = Record<string, unknown>

const parse = (d?: string): J | string | undefined => {
  if (d === undefined) return undefined
  try {
    return JSON.parse(d) as J
  } catch {
    return d
  }
}

const pct = (v: unknown) => `${Math.round(Number(v) * 100)}%`
const ordinal = (n: number) => (n === 1 ? 'best' : n === 2 ? '2nd-best' : n === 3 ? '3rd-best' : `${n}th-best`)
const motif = (m: unknown) => (MOTIF_LABEL[String(m)] ?? String(m).replace(/_/g, ' ')).toLowerCase()
const list = (o: unknown) =>
  Object.entries((o ?? {}) as Record<string, number>)
    .map(([k, v]) => `${v} × ${motif(k)}`)
    .join(', ')

/** Who a tool is handed to, in words. */
const TOOL_ASK: Record<string, string> = {
  make_move: 'Asked the Referee to check the move',
  engine_reply: 'Asked the Opponent to play its move',
  analyse_position: 'Asked the Tutor to look for danger',
  describe_board: 'Asked to read the board out loud',
  undo: 'Asked the Referee to take a move back',
  remember: 'Asked Memory to remember something',
  game_summary: 'Asked Memory for the parent summary',
  set_level: 'Asked to change how strong the buddy plays',
  new_game: 'Asked the Referee for a new game',
  change_settings: 'Asked to change how the app looks',
  show_screen: 'Asked to open a screen',
  stop_listening: 'Asked to stop listening',
  forget_me: 'Asked Memory to forget this player',
  scout_games: 'Sent the Scout agent to study online games',
}

const moveWords = (a: J) =>
  a.san
    ? String(a.san)
    : [a.piece, a.from && `from ${a.from}`, a.to && `to ${a.to}`, a.area && `to the ${a.area}`, a.which && `(${String(a.which).replace(/_/g, ' ')})`, a.option && `option ${a.option}`]
        .filter(Boolean)
        .join(' ')

export function humanize(e: TraceEntry): string {
  const d = parse(e.detail)
  const o = (typeof d === 'object' && d) || {}
  const t = e.title

  if (e.role === 'Voice') {
    if (t.startsWith('Live ')) {
      const st = t.slice(5)
      return st === 'live' ? 'Voice connected to Gemini Live.' : st === 'connecting' ? 'Connecting the voice…' : st === 'idle' ? 'Voice disconnected.' : `Voice problem: ${typeof d === 'string' ? d : st}`
    }
    const tool = t.slice(2)
    if (t.startsWith('→')) {
      const what = tool === 'make_move' ? `: ${moveWords(o)}` : tool === 'scout_games' && o.username ? ` (${o.username})` : tool === 'remember' && o.value ? `: “${o.value}”` : ''
      return `Gemini decided to call ${tool}. ${TOOL_ASK[tool] ?? 'Called a tool'}${what}.`
    }
    const st = o.status ? String(o.status).replace(/_/g, ' ') : 'done'
    return `Answer handed back to Gemini (${st}). It turns these facts into words.`
  }

  if (e.role === 'Referee') {
    if (t.startsWith('Legal ✓')) return `Checked with chess.js: ${t.slice(8)} is a legal move. Played it.`
    if (t.startsWith('Ambiguous')) return `More than one piece could do that, so it asks which one${Array.isArray(o.options) ? `: ${(o.options as string[]).join(' or ')}` : ''}.`
    if (t.startsWith('Rejected')) return `Not a legal move, so the board stays as it is${typeof d === 'string' ? `: ${d}` : ''}.`
    if (t === 'Undo') return `Took back ${o.undone ?? 'the last'} move${o.undone === 1 ? '' : 's'}.`
    if (t === 'New game') return `Set up a new game. You play ${o.you_play}.`
  }

  if (e.role === 'Opponent') {
    if (t.startsWith('Engine plays')) {
      const n = Number(o.choseLine ?? 1)
      return `Stockfish found the ${o.of ?? ''} best moves, and the buddy (level ${o.level}) picked its ${ordinal(n)} one: ${t.slice(13)}.${n > 1 ? ' Not always the top move, so it stays a fair game.' : ''}`
    }
    if (t.startsWith('Level')) return `Buddy strength is now ${t.split('→ ')[1]} of 5.`
  }

  if (e.role === 'Tutor') {
    const b = o.winProbBefore, a = o.winProbAfter
    if (t === 'Move OK') return `Checked your move with Stockfish: your winning chances ${pct(b)} → ${pct(a)}. Fine, no hint needed.`
    if (t.startsWith('Retry')) return `You found a better move after the hint (winning chances ${pct(b)} → ${pct(a)}).`
    if (t.startsWith('Blunder')) {
      const m = t.match(/\((.+)\)/)?.[1]
      return `Big slip spotted (${motif(m)}): winning chances ${pct(b)} → ${pct(a)}. ${o.hint ? 'Stepping in with a hint question, not the answer.' : 'Hinted recently, so staying quiet this time.'}`
    }
    if (t === 'analyse_position') return `Looked for danger with chess.js and Stockfish: ${o.threats} of your pieces under attack, ${o.targets} enemy pieces you could go after. Overall: ${o.overall}.`
  }

  if (e.role === 'Board') {
    if (t.startsWith('describe_board')) return `Read the board out loud (${t.match(/\((.+)\)/)?.[1] ?? 'all'}), for anyone who can't see the screen.`
    if (t === 'Settings changed') return `Changed the look: ${Object.entries(o).map(([k, v]) => `${k.replace(/_/g, ' ')} → ${v}`).join(', ')}.`
    if (t.startsWith('Show ')) return `Opened the ${t.slice(5).replace(/_/g, ' ')} screen.`
  }

  if (e.role === 'Memory') {
    if (t.startsWith('remember')) return t.endsWith('name') ? `Remembered the player's name: ${d}.` : `Remembered: “${d}”.`
    if (t.startsWith('mistake +1')) return `Noted a recurring mistake to practise: ${motif(t.split(': ')[1])}.`
    if (t === 'Game recorded') return `Saved this game's result (${String(o.over ?? '').replace(/_/g, ' ')}).`
    if (t === 'Scout findings saved') return `Saved what the Scout found, so the Tutor watches for it.`
    if (t === 'game_summary') return `Wrote the parent summary: ${d}`
    if (t.startsWith('condense:')) return `condense.chat shrank the ${t.slice(10)}.`
    if (t.startsWith('Kids mode')) return `${t}.`
    if (t === 'Profile erased') return 'Forgot everything about this player.'
  }

  if (e.role === 'Scout') {
    if (t === 'Plan') return `Made a plan: ${d}.`
    if (t.startsWith('Found chess.com')) return `Found ${o.months} months of games on chess.com.`
    if (t === 'Fetched games') return `Downloaded the ${o.games} most recent games.`
    if (t.startsWith('Reviewed game')) {
      const [, i, n] = t.match(/(\d+)\/(\d+)/) ?? []
      const res = o.result ? `, ${o.result}` : ''
      const mm = Number(o.bigMistakes ?? 0)
      return `Checked every move of game ${i} of ${n} with Stockfish (played ${o.kidPlays}${res}): ${mm ? `${mm} big slip${mm > 1 ? 's' : ''}` : 'no big slips'}.`
    }
    if (t === 'Patterns found') return `Spotted patterns across ${o.mistakes} big slips: ${list(o.motifs) || 'none'}.`
    if (t.startsWith('condense')) return `condense.chat shrank the mistake log (${o.tokens_before} → ${o.tokens_after} tokens).`
    if (t === 'Coach plan written') return `Gemini 3.8 Flash turned those facts into a practice plan: focus on ${motif(o.focus)}.`
    if (t === 'Plan skipped') return 'Could not write a plan this time; the patterns are still saved.'
    if (t === 'Failed') return `Something went wrong: ${d}`
    if (t.includes('skipped')) return `${t}.`
  }

  return typeof d === 'string' ? `${t}: ${d}` : t
}
