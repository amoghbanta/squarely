// Speech-to-text fallback: fixes chess words that speech recognisers mishear
// ("night to G3" → "knight to g3", "pawn to see for" → "pawn to c4"). Pure text, no guessing about
// the board: what's legal is still decided by the Referee, which offers the nearest legal moves.

const PIECE_SOUNDALIKES: [RegExp, string][] = [
  [/\b(night|nights|nite|knights|knigh)\b/g, 'knight'],
  [/\b(rock|rocks|rooks|brook|ruk|ruke)\b/g, 'rook'],
  [/\b(porn|pond|prawn|pawns|paun|pon|pawned)\b/g, 'pawn'],
  [/\b(bishops|fish up)\b/g, 'bishop'],
  [/\b(queens|queeen)\b/g, 'queen'],
  [/\b(kings)\b/g, 'king'],
  [/\b(castles)\b/g, 'castle'],
  [/\b(casting|cassling|castel|kasling|castle in)\b/g, 'castling'],
]

// Spoken file letters. Plain "a" is left out on purpose (it's usually the article).
const LETTER: Record<string, string> = {
  ay: 'a', eh: 'a',
  b: 'b', be: 'b', bee: 'b',
  c: 'c', see: 'c', sea: 'c', si: 'c',
  d: 'd', dee: 'd',
  e: 'e', ee: 'e',
  f: 'f', ef: 'f', eff: 'f',
  g: 'g', gee: 'g', jee: 'g', ji: 'g',
  h: 'h', aitch: 'h', age: 'h',
}
const NUMBER: Record<string, string> = {
  '1': '1', one: '1', won: '1',
  '2': '2', two: '2', too: '2', to: '2',
  '3': '3', three: '3', tree: '3', free: '3',
  '4': '4', four: '4', for: '4', fore: '4',
  '5': '5', five: '5',
  '6': '6', six: '6', sex: '6', sicks: '6',
  '7': '7', seven: '7',
  '8': '8', eight: '8', ate: '8',
}
// Spoken letter (e.g. "gee") or a single letter b–h, then a number, as SEPARATE words. Never inside a
// word: "done" is not d1, "gate" is not g8. Plain "a" is left out (it's usually the article).
const SPOKEN_SQUARE_RE = new RegExp(`(^|\\s)(${Object.keys(LETTER).join('|')})[\\s-]+(${Object.keys(NUMBER).join('|')})(?=\\s|$)`, 'g')
const MOVE_WORD = /^(to|on|at|takes|take|from|x|onto|into)$/

/** Lower-cases and repairs misheard chess words and squares. */
export function normalizeSpeech(text: string): string {
  let t = ` ${text.toLowerCase().replace(/[.,!?;:]/g, ' ')} `
  for (const [re, word] of PIECE_SOUNDALIKES) t = t.replace(re, word)
  // "a 4" (a digit after plain "a") is safe to read as a square.
  t = t.replace(/\ba[\s-]+([1-8])\b/g, 'a$1')
  const words = t.trim().split(/\s+/)
  t = ` ${words.join(' ')} `
  t = t.replace(SPOKEN_SQUARE_RE, (whole, pre: string, l: string, n: string, at: number) => {
    const before = t.slice(0, at).trim().split(' ').pop() ?? ''
    const clearNumber = /^([1-8]|one|two|three|four|five|six|seven|eight)$/.test(n)
    // "to"/"too" right after a letter is nearly always the word "to".
    if (n === 'to' || n === 'too') return whole
    // A spoken letter ("see", "gee") only counts right after a move word: "to see three" is c3,
    // "I see three ways" is not.
    if (l.length > 1 && !MOVE_WORD.test(before)) return whole
    // Sound-alike numbers ("for", "ate") need a single letter or a move word before them.
    if (!clearNumber && l.length > 1 && !MOVE_WORD.test(before)) return whole
    return `${pre}${LETTER[l]}${NUMBER[n]}`
  })
  return t.replace(/\s+/g, ' ').trim()
}

export type HeardMove = { piece?: string; to?: string; from?: string; castle?: 'short' | 'long' }

const PIECE_WORD = /\b(pawn|knight|horse|pony|bishop|rook|castle|tower|queen|king)\b/g
const CANON: Record<string, string> = { horse: 'knight', pony: 'knight', castle: 'rook', tower: 'rook' }
// Piece words after these name a target or a place, not the piece being moved.
const NOT_MOVER = /\b(his|her|their|your|the enemy|in front of( my| the)?|next to( my| the)?|near( my| the)?|beside( my| the)?|so( that)? the|protect( my| the)?|make it( a| an)?|into( a| an)?|takes?( the| his| her| that| a)?|capture( the| his| her)?|eat( the| his| her)?|x)\s*$/

/**
 * What the player's own words say about the move, read strictly: the piece being MOVED (only when
 * it's unambiguous), squares, and castling only when "castle" is clearly the move, not a rook.
 */
export function heardMove(text: string): HeardMove {
  const t = normalizeSpeech(text)
  const out: HeardMove = {}
  const castleMove = /\b(castle|castles|castling)\b/.test(t) && !/\b(my|the|his|her|your|their|that|a|this)\s+castle\b|\bcastle\s+(to|takes|on|at)\b/.test(t)
  if (castleMove && !/\b(pawn|knight|horse|bishop|queen|rook)\b/.test(t)) out.castle = /long|queen ?side|big/.test(t) ? 'long' : 'short'

  // "with my queen" names the mover outright.
  const withMy = t.match(/\bwith (?:my|the) (pawn|knight|horse|pony|bishop|rook|castle|tower|queen|king)\b/)
  if (withMy) out.piece = CANON[withMy[1]] ?? withMy[1]
  else {
    const movers: string[] = []
    for (const m of t.matchAll(PIECE_WORD)) {
      if (NOT_MOVER.test(t.slice(0, m.index))) continue
      if (m[1] === 'castle' && out.castle) continue
      movers.push(CANON[m[1]] ?? m[1])
    }
    if (new Set(movers).size === 1) out.piece = movers[0]
  }
  const squares = t.match(/\b[a-h][1-8]\b/g) ?? []
  if (squares.length === 2) {
    out.from = squares[0]
    out.to = squares[1]
  } else if (squares.length === 1) out.to = squares[0]
  return out
}

/** Does this text talk about a move at all (a piece, a square, castling, or which-one words)? */
export function hasMoveContent(text: string, answering: boolean): boolean {
  const t = normalizeSpeech(text)
  if (/\b(pawn|knight|horse|pony|bishop|rook|castle|castling|tower|queen|king|en passant|promote)\b/.test(t)) return true
  if (/\b[a-h][1-8]\b|\b[nbrqk]x?[a-h][1-8]\b|\bo-o\b/.test(t)) return true
  if (answering && /\b(yes|yeah|yep|sure|ok|okay|one|first|second|third|left|right|middle|centre|center|front|back|near|that|this|1|2|3|4)\b/.test(t)) return true
  return false
}
