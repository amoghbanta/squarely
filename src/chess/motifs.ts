// Shared blunder classifier: what does the opponent's best reply do to the kid?
// Used live by the Tutor and offline by the Scout over imported games.
import { Chess, type Color } from 'chess.js'
import type { EngineLine } from '../engine/stockfish'
import { VALUE, nameOf, other, pieces, threatsAgainst, whereIs } from './facts'

/** squares: the kid's pieces to point at on the board (never the answer). */
export type Punishment = { motif: string | null; hintFacts: Record<string, unknown> | null; squares?: string[] }

export function classifyPunishment(fenAfterKidMove: string, best: EngineLine | undefined, kidColor: Color): Punishment {
if (!best) return { motif: null, hintFacts: null }
const copy = new Chess(fenAfterKidMove)
  const m = copy.move({ from: best.move.slice(0, 2), to: best.move.slice(2, 4), promotion: best.move[4] })
  // Exact squares everywhere, so the voice never has to guess one; and "when" says it's about their NEXT move.
  const attacker = { piece: nameOf(m.piece), square: m.from, where: whereIs(m.from, kidColor) }
  const reply = { piece: nameOf(m.piece), from: m.from, to: m.to, from_where: whereIs(m.from, kidColor), to_where: whereIs(m.to, kidColor) }
  const when = `if they answer with their ${nameOf(m.piece)} from ${m.from} to ${m.to} (this has NOT happened yet)`
  if (best.mate !== null && best.mate > 0) {
    const k = pieces(copy, kidColor).find((q) => copy.get(q)!.type === 'k')
    return { motif: 'mate_threat', hintFacts: { kind: 'checkmate threat against your king', when, enemy_move_that_does_it: reply }, squares: k ? [k] : [] }
  }
  // Fork: the moved enemy piece attacks two or more of the kid's non-pawn pieces (king included).
  // Only targets that really cost something count: undefended, or worth more than the forker (the king always counts).
  const victimSquares = pieces(copy, kidColor).filter((sq) => {
    const t = copy.get(sq)!.type
    if (t === 'p' || !copy.attackers(sq, other(kidColor)).includes(m.to)) return false
    return t === 'k' || VALUE[t] > VALUE[m.piece] || copy.attackers(sq, kidColor).length === 0
  })
  const victims = victimSquares.map((sq) => copy.get(sq)!.type)
  if (victims.length >= 2) {
    return {
      motif: 'fork',
      hintFacts: { kind: 'fork: one enemy piece could attack two of yours at once', when, enemy_move_that_does_it: reply, targets: victimSquares.map((sq) => ({ piece: nameOf(copy.get(sq)!.type), square: sq })) },
      squares: victimSquares,
    }
  }
  if (m.captured && copy.attackers(m.to, kidColor).length > 0) {
    // Defended: it's a capture you can answer, not a free piece. Say exactly that.
    return {
      motif: 'piece_in_danger',
      hintFacts: {
        kind: 'one of your pieces can be captured; you could take back, but the swap is bad for you',
        when: 'right now: it is already attacked',
        victim: { piece: nameOf(m.captured), square: m.to, where: whereIs(m.to, kidColor) },
        attacked_by: [attacker],
        enemy_move_that_does_it: reply,
      },
      squares: [m.to],
    }
  }
  if (m.captured) {
    return {
      motif: 'hanging_piece',
      hintFacts: { kind: 'one of your pieces can be taken for free', when: 'right now: it is already attacked and nobody guards it', victim: { piece: nameOf(m.captured), square: m.to, where: whereIs(m.to, kidColor) }, attacked_by: [attacker] },
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
        kind: discovered ? 'one of your pieces would be in danger (a hidden attack: one enemy piece moves out of the way of another)' : 'one of your pieces would be in danger',
        when,
        victim: { piece: victim.victim.name, square: victim.victim.square, where: victim.victim.where },
        attacked_by_after_that_move: victim.attackers.map((a) => ({ piece: a.name, square: a.square, where: a.where })),
        enemy_move_that_does_it: reply,
      },
      squares: [victim.victim.square],
    }
  }
  return { motif: 'loses_material', hintFacts: { kind: 'the opponent has a strong reply', when, enemy_move_that_does_it: reply } }
}
