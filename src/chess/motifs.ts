// Shared blunder classifier: what does the opponent's best reply do to the kid?
// Used live by the Tutor and offline by the Scout over imported games.
import { Chess, type Color } from 'chess.js'
import type { EngineLine } from '../engine/stockfish'
import { nameOf, other, pieces, threatsAgainst, whereIs } from './facts'

/** squares: the kid's pieces to point at on the board (never the answer). */
export type Punishment = { motif: string | null; hintFacts: Record<string, unknown> | null; squares?: string[] }

export function classifyPunishment(fenAfterKidMove: string, best: EngineLine | undefined, kidColor: Color): Punishment {
if (!best) return { motif: null, hintFacts: null }
const copy = new Chess(fenAfterKidMove)
  const m = copy.move({ from: best.move.slice(0, 2), to: best.move.slice(2, 4), promotion: best.move[4] })
  const attacker = { piece: nameOf(m.piece), where: whereIs(m.from, kidColor) }
  const reply = { piece: nameOf(m.piece), from_where: whereIs(m.from, kidColor), to_where: whereIs(m.to, kidColor) }
  if (best.mate !== null && best.mate > 0) {
    const k = pieces(copy, kidColor).find((q) => copy.get(q)!.type === 'k')
    return { motif: 'mate_threat', hintFacts: { kind: 'checkmate threat against your king', attacker }, squares: k ? [k] : [] }
  }
  // Fork: the moved enemy piece attacks two or more of the kid's non-pawn pieces (king included).
  const victimSquares = pieces(copy, kidColor).filter((sq) => copy.get(sq)!.type !== 'p' && copy.attackers(sq, other(kidColor)).includes(m.to))
  const victims = victimSquares.map((sq) => copy.get(sq)!.type)
  if (victims.length >= 2) {
    return {
      motif: 'fork',
      hintFacts: { kind: 'fork: one enemy piece could attack two of yours at once', attacker, targets: victims.map((v) => nameOf(v)) },
      squares: victimSquares,
    }
  }
  if (m.captured) {
    return {
      motif: 'hanging_piece',
      hintFacts: { kind: 'one of your pieces can be taken for free', victim: { piece: nameOf(m.captured), where: whereIs(m.to, kidColor) }, attacker },
      squares: [m.to],
    }
  }
  // Otherwise: name the most valuable kid piece the reply puts in danger, and who REALLY attacks it.
  // The reply may be a discovered attack (a pawn moves, a bishop behind it strikes), so the attackers
  // come from the board after the reply, never from the moved piece.
  const victim = threatsAgainst(copy, kidColor).find((t) => t.hanging || t.attackers.some((a) => a.square === m.to))
  if (victim) {
    const discovered = !victim.attackers.some((a) => a.square === m.to)
    return {
      motif: 'piece_in_danger',
      hintFacts: {
        kind: discovered ? 'one of your pieces will be in danger (a hidden attack: one enemy piece moves out of the way of another)' : 'one of your pieces will be in danger',
        victim: { piece: victim.victim.name, where: victim.victim.where },
        attacked_by: victim.attackers.map((a) => ({ piece: a.name, where: a.where })),
        enemy_move_that_does_it: reply,
      },
      squares: [victim.victim.square],
    }
  }
  return { motif: 'loses_material', hintFacts: { kind: 'the opponent has a strong reply', enemy_move_that_does_it: reply } }
}
