// Offline fallback: when there's no Gemini connection, typed commands drive the SAME tools
// with a tiny keyword parser and template replies (spoken with the browser's speech synthesis).
import type { FunctionCall } from '@google/genai'
import type { PieceWord } from '../chess/resolver'

const THEME_WORDS: Record<string, string> = {
  'green|meadow': 'meadow',
  'blue|ocean': 'ocean',
  'pink|candy': 'candy',
  'brown|wood': 'wood',
  'dark|space|night': 'space',
  'contrast|black and white': 'contrast',
}
const STYLE_WORDS: Record<string, string> = { 'face|friend': 'friends', classic: 'classic', animal: 'animals', letter: 'letters' }

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
  if (/\b(keep it|go on|your (move|turn)|continue)\b/.test(t)) return { name: 'engine_reply', args: {} }
  const theme = Object.entries(THEME_WORDS).find(([re]) => new RegExp(re).test(t))
  if (theme && /board|colou?r|theme/.test(t)) return { name: 'change_settings', args: { board_theme: theme[1] } }
  const style = Object.entries(STYLE_WORDS).find(([re]) => new RegExp(re).test(t))
  if (style && /piece/.test(t)) return { name: 'change_settings', args: { piece_style: style[1] } }
  if (/kids? mode/.test(t)) return { name: 'change_settings', args: { kids_mode: !/off|grown|adult/.test(t) } }
  if (/harder|tougher/.test(t)) return { name: 'change_settings', args: { level: 4 } }
  if (/easier/.test(t)) return { name: 'change_settings', args: { level: 1 } }
  if (/help|what can i say/.test(t) && !/attack/.test(t)) return { name: 'show_screen', args: { screen: 'help' } }
  if (/close|back to (the )?game/.test(t)) return { name: 'show_screen', args: { screen: 'game' } }
  if (/play (as )?black/.test(t)) return { name: 'new_game', args: { color: 'black' } }
  if (/attack|danger|threat|hint|winning/.test(t)) return { name: 'analyse_position', args: {} }
  if (/where.*king/.test(t)) return { name: 'describe_board', args: { focus: 'king' } }
  if (/read|describe|board/.test(t)) return { name: 'describe_board', args: { focus: 'all' } }
  if (/new game/.test(t)) return { name: 'new_game', args: {} }
  const cc = t.match(/chess\.?com (?:name |username )?(?:is )?([a-z0-9_-]{3,})/)
  if (cc) return { name: 'scout_games', args: { username: cc[1] } }
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
  if (name === 'game_summary' || name === 'show_screen') {
    const sum = (r.summary as { parent_line?: string } | undefined)?.parent_line
    return sum ?? (r.showing === 'help' ? 'Here is what you can say.' : 'Okay!')
  }
  if (name === 'engine_reply' && r.piece) return `I moved my ${r.piece} to ${r.to}${r.captured ? ` and took your ${r.captured}` : ''}.`
  if (name === 'undo') return r.status === 'undone' ? 'Taken back. Your turn!' : 'There is nothing to take back.'
  if (name === 'new_game') return `New game! You play ${r.you_play}.`
  if (name === 'change_settings') return r.status === 'ok' ? 'Done!' : 'I could not change that.'
  if (name === 'scout_games') {
    const plan = r.plan as { buddy_line?: string } | null
    if (r.status === 'started') return `My teammate the Scout is fetching ${r.username}'s chess.com games and studying every move in the background. Let's keep playing!`
    if (r.status === 'already_scouting') return 'The Scout is still studying your games. I will tell you as soon as it is done!'
    return r.status === 'done' ? (plan?.buddy_line ?? `I studied ${r.games_reviewed} of your games.`) : `I could not study those games: ${r.reason ?? r.status}.`
  }
  if (name === 'describe_board') {
    const fmt = (v: unknown) => (Array.isArray(v) ? v.join(', ') : '')
    if (r.your_king) {
      const k = r.your_king as { square: string; where: string; in_check: boolean }
      return `Your king is on ${k.square}, ${k.where}${k.in_check ? ', and he is in check!' : '.'}`
    }
    return [r.your_pieces && `You have: ${fmt(r.your_pieces)}.`, r.buddy_pieces && `Buddy has: ${fmt(r.buddy_pieces)}.`].filter(Boolean).join(' ')
  }
  if (r.status === 'not_your_turn') return "It's my turn! Say keep going and I'll move."
  if (r.game_over) return `Game over: ${String(r.game_over).replace(/_/g, ' ')}.`
  return 'Done.'
}
