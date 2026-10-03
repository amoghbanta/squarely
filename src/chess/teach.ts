// Teaching facts about one move, computed by chess.js: what it takes, what it attacks, whether the
// piece is safe where it lands, and which named idea it shows. The voice explains; this decides.
import { Chess, type Color, type Square } from 'chess.js'
import { VALUE, nameOf, threatsAgainst, whereIs } from './facts'
import { CONCEPTS } from './knowledge'

export type MoveFacts = {
  san: string
  piece: string
  from: Square
  to: Square
  from_where: string
  to_where: string
  captures: string | null
  check: boolean
  checkmate: boolean
  castles: boolean
  promotes: string | null
  attacks_after: { piece: string; square: Square }[]
  lands_safely: boolean
  idea: string | null // a CONCEPTS key
  idea_explained: string | null
}

const CENTRE = new Set(['d4', 'e4', 'd5', 'e5'])

/** Facts about playing `uci` (e.g. "g1f3") in `fen`, from `pov`'s side. */
export function moveFacts(fen: string, uci: string, pov: Color, kidsMode: boolean): MoveFacts | null {
  const c = new Chess(fen)
  let m
  try {
    m = c.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] ?? 'q' })
  } catch {
    return null
  }
  const mover = m.color
  const enemy: Color = mover === 'w' ? 'b' : 'w'
  // Enemy pieces the moved piece now hits (chess.js attackers() sees through the new position).
  const attacks = c
    .board()
    .flat()
    .filter((p): p is NonNullable<typeof p> => !!p && p.color === enemy)
    .filter((p) => c.attackers(p.square, mover).includes(m.to))
    .map((p) => ({ piece: nameOf(p.type), square: p.square, value: VALUE[p.type] }))
  const landing = threatsAgainst(c, mover).find((t) => t.victim.square === m.to)
  const lands_safely = !landing?.hanging

  let idea: string | null = null
  if (c.isCheckmate()) idea = 'checkmate'
  else if (attacks.filter((a) => a.value >= 3).length >= 2 && lands_safely) idea = 'fork'
  else if (m.captured && lands_safely) idea = 'trade'
  else if (m.isKingsideCastle() || m.isQueensideCastle()) idea = 'castling'
  else if (m.promotion) idea = 'promotion'
  else if (CENTRE.has(m.to) && (m.piece === 'p' || m.piece === 'n')) idea = 'centre'
  else if ((m.piece === 'n' || m.piece === 'b') && (m.from[1] === '1' || m.from[1] === '8')) idea = 'development'
  const concept = idea ? CONCEPTS[idea] : null

  return {
    san: m.san,
    piece: nameOf(m.piece),
    from: m.from,
    to: m.to,
    from_where: whereIs(m.from, pov),
    to_where: whereIs(m.to, pov),
    captures: m.captured ? nameOf(m.captured) : null,
    check: c.inCheck(),
    checkmate: c.isCheckmate(),
    castles: m.isKingsideCastle() || m.isQueensideCastle(),
    promotes: m.promotion ? nameOf(m.promotion) : null,
    attacks_after: attacks.map(({ piece, square }) => ({ piece, square })),
    lands_safely,
    idea,
    idea_explained: concept ? (kidsMode ? concept.kid : concept.grownup) : null,
  }
}

/** How a move compares to the engine's best, from the drop in win chance. */
export type Grade = 'brilliant' | 'best' | 'great' | 'good' | 'book' | 'inaccuracy' | 'mistake' | 'blunder'

/**
 * Grade a played move. wpBefore/wpAfter are the MOVER's win chances (engine) before and after.
 * Brilliant = as good as the best move AND it leaves a real piece where it can be taken for free
 * (a sacrifice that works). Book = still following a known opening and not losing anything.
 */
export function gradeMove(fenBefore: string, uci: string, wpBefore: number, wpAfter: number, inBook: boolean): Grade {
  const loss = Math.max(0, wpBefore - wpAfter)
  const c = new Chess(fenBefore)
  let m
  try {
    m = c.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] ?? 'q' })
  } catch {
    return verdict(loss)
  }
  if (c.isCheckmate()) return 'best'
  if (inBook && loss <= 0.07) return 'book'
  if (loss <= 0.02 && wpAfter >= 0.4 && VALUE[m.piece] >= 3) {
    const left = threatsAgainst(c, m.color).find((t) => t.victim.square === m.to && t.hanging)
    const gave = VALUE[m.piece] - (m.captured ? VALUE[m.captured] : 0)
    if (left && gave >= 2) return 'brilliant'
  }
  return verdict(loss)
}

export function verdict(loss: number): 'best' | 'great' | 'good' | 'inaccuracy' | 'mistake' | 'blunder' {
  if (loss <= 0.01) return 'best'
  if (loss <= 0.03) return 'great'
  if (loss <= 0.07) return 'good'
  if (loss <= 0.12) return 'inaccuracy'
  if (loss < 0.2) return 'mistake'
  return 'blunder'
}
