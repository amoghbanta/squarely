// Position facts computed by chess.js. These are the ONLY claims the voice agent may phrase.
import { Chess, type Color, type PieceSymbol, type Square, SQUARES } from 'chess.js'

export const VALUE: Record<PieceSymbol, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100 }

/** Kid-friendly names. The model is told to use these, not notation. */
const KID_NAME: Record<PieceSymbol, string> = {
  p: 'pawn',
  n: 'horse (knight)',
  b: 'bishop',
  r: 'castle (rook)',
  q: 'queen',
  k: 'king',
}

export const STD_NAME: Record<PieceSymbol, string> = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' }

// Kids mode: friendly names, characters with faces, no notation. Off: plain chess vocabulary.
let kidsMode = true
export const setKidsModeFacts = (on: boolean) => {
  kidsMode = on
}
export const nameOf = (t: PieceSymbol) => (kidsMode ? KID_NAME : STD_NAME)[t]

export const CHARACTER: Record<PieceSymbol, string> = {
  p: 'Pip the Pawn',
  n: 'Sir Knight',
  b: 'Bishop Bo',
  r: 'Rocky the Rook',
  q: 'Queen Quill',
  k: 'King Kip',
}

export const colorName = (c: Color) => (c === 'w' ? 'white' : 'black')
export const other = (c: Color): Color => (c === 'w' ? 'b' : 'w')

/** Plain-language location of a square, from the given player's side of the board. */
export function whereIs(sq: Square, pov: Color): string {
  const file = sq.charCodeAt(0) - 97 // 0..7
  const rank = Number(sq[1]) - 1 // 0..7
  const f = pov === 'w' ? file : 7 - file
  const r = pov === 'w' ? rank : 7 - rank
  const side = f <= 2 ? 'left side' : f >= 5 ? 'right side' : 'middle'
  const depth = r <= 1 ? 'near you' : r >= 6 ? 'far side' : r <= 3 ? 'your half' : "opponent's half"
  if (side === 'middle' && (r === 3 || r === 4)) return 'right in the middle'
  return `${side}, ${depth}`
}

export type PieceRef = { square: Square; type: PieceSymbol; color: Color; name: string; where: string }

const ref = (chess: Chess, sq: Square, pov: Color): PieceRef => {
  const p = chess.get(sq)!
  return { square: sq, type: p.type, color: p.color, name: nameOf(p.type), where: whereIs(sq, pov) }
}

export function pieces(chess: Chess, color: Color): Square[] {
  return SQUARES.filter((s) => chess.get(s)?.color === color)
}

export type Threat = { victim: PieceRef; attackers: PieceRef[]; defended: boolean; hanging: boolean }

/**
 * Pieces of `color` that the opponent attacks right now.
 * "hanging" = attacked and undefended, or attacked by something cheaper.
 */
export function threatsAgainst(chess: Chess, color: Color): Threat[] {
  const out: Threat[] = []
  for (const sq of pieces(chess, color)) {
    const victim = chess.get(sq)!
    const attackers = chess.attackers(sq, other(color))
    if (!attackers.length) continue
    const defended = chess.attackers(sq, color).length > 0
    const cheapest = Math.min(...attackers.map((a) => VALUE[chess.get(a)!.type]))
    const hanging = victim.type !== 'k' && (!defended || cheapest < VALUE[victim.type])
    out.push({ victim: ref(chess, sq, color), attackers: attackers.map((a) => ref(chess, a, color)), defended, hanging })
  }
  return out.sort((a, b) => VALUE[b.victim.type] - VALUE[a.victim.type])
}

export function material(chess: Chess) {
  let w = 0
  let b = 0
  for (const sq of SQUARES) {
    const p = chess.get(sq)
    if (!p || p.type === 'k') continue
    if (p.color === 'w') w += VALUE[p.type]
    else b += VALUE[p.type]
  }
  return { white: w, black: b }
}

export function kingSquare(chess: Chess, color: Color): Square {
  return pieces(chess, color).find((s) => chess.get(s)!.type === 'k')!
}

/** Full board listing for the accessibility "read the board" request. */
export function boardListing(chess: Chess, pov: Color) {
  const list = (c: Color) =>
    pieces(chess, c)
      .sort((a, b) => VALUE[chess.get(b)!.type] - VALUE[chess.get(a)!.type])
      .map((s) => ref(chess, s, pov))
  return { yours: list(pov), theirs: list(other(pov)) }
}

/** Expected points in (0,1) from a centipawn eval (same logistic curve as Eloqi's grader). */
export function winProb(cp: number): number {
  const c = Math.max(-1200, Math.min(1200, cp))
  return 1 / (1 + Math.exp(-c / 260))
}

/** Win-probability loss at or above which a kid's move counts as a blunder. */
export const BLUNDER_WIN_PROB_LOSS = 0.2
