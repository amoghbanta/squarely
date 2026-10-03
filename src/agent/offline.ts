// Offline fallback: when there's no Gemini connection, typed commands drive the SAME tools
// with a tiny keyword parser and template replies (spoken with the browser's speech synthesis).
import type { FunctionCall } from '@google/genai'
import type { PieceWord } from '../chess/resolver'

const WORDS: [RegExp, PieceWord][] = [
  [/\b(horse|knight|pony)\b/, 'knight'],
  [/\b(castle|rook|tower)\b/, 'rook'],
  [/\bbishop\b/, 'bishop'],
  [/\bqueen\b/, 'queen'],
  [/\bking\b/, 'king'],
  [/\bpawn\b/, 'pawn'],
]

export function parseOffline(text: string): Pick<FunctionCall, 'name' | 'args'> | null {
  const t = text.toLowerCase().trim()
  if (/\b(undo|take (it )?back|oops)\b/.test(t)) return { name: 'undo', args: {} }
  if (/attack|danger|threat|help|hint|winning/.test(t)) return { name: 'analyse_position', args: {} }
  if (/where.*king/.test(t)) return { name: 'describe_board', args: { focus: 'king' } }
  if (/read|describe|board/.test(t)) return { name: 'describe_board', args: { focus: 'all' } }
  if (/new game/.test(t)) return { name: 'new_game', args: {} }
  if (/summary|report/.test(t)) return { name: 'game_summary', args: {} }
  const opt = t.match(/^(?:option\s*)?([1-4])$/)
  if (opt) return { name: 'make_move', args: { option: Number(opt[1]) } }

  const args: Record<string, unknown> = {}
  const squares = t.match(/\b[a-h][1-8]\b/g) ?? []
  if (squares.length === 2) Object.assign(args, { from: squares[0], to: squares[1] })
  else if (squares.length === 1) args.to = squares[0]
  const takeIdx = t.search(/\b(take|takes|capture|eat|x)\b/)
  for (const [re, piece] of WORDS) {
    const m = t.match(re)
    if (!m || m.index === undefined) continue
    if (takeIdx >= 0 && m.index > takeIdx) args.capture ??= piece
    else args.piece ??= piece
  }
  if (/middle|center|centre/.test(t)) args.area = 'middle'
  if (!Object.keys(args).length) {
    if (/^[a-z0-9+#=-]{2,7}$/i.test(text.trim())) return { name: 'make_move', args: { san: text.trim() } }
    return null
  }
  return { name: 'make_move', args }
}

/** Template phrasing of tool facts — no model involved, so still truthful. */
export function phraseOffline(name: string, r: Record<string, unknown>): string {
  const opp = r.opponent_played as Record<string, unknown> | undefined
  if (r.status === 'need_clarification') {
    const opts = (r.options as { option: number; label: string }[]).map((o) => `${o.option}: ${o.label}`).join('; ')
    return `${r.question} ${opts}`
  }
  if (r.status === 'not_legal') return `Hmm, that move isn't allowed: ${r.reason}.`
  if ((r.tutor as { intervene?: boolean })?.intervene) {
    const d = (r.tutor as { danger: Record<string, unknown> }).danger
    return `Wait! Look carefully: ${String(d?.kind ?? 'something is in danger')}. Want to say undo and try again?`
  }
  if (name === 'make_move' && opp) {
    return `${r.praise ? 'Brilliant, you found it! ' : ''}I moved my ${opp.piece} to ${opp.to}${opp.captured ? ` and took your ${opp.captured}` : ''}${opp.your_king_in_check ? '. Check!' : '.'}`
  }
  if (name === 'analyse_position') {
    const under = r.your_pieces_under_attack as { piece: string; where: string; attacked_by: string[] }[]
    if (!under.length) return `Nothing is attacking your pieces right now. Overall: ${r.overall}.`
    return under.map((u) => `Your ${u.piece} (${u.where}) is attacked by ${u.attacked_by.join(' and ')}.`).join(' ')
  }
  if (name === 'game_summary') return String(r.parent_line)
  return JSON.stringify(r)
}
