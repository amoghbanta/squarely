// Shared blunder classifier: what does the opponent's best reply do to the kid?
// Used live by the Tutor and offline by the Scout over imported games.
import { Chess, type Color } from 'chess.js'
import type { EngineLine } from '../engine/stockfish'
import { nameOf, other, pieces, threatsAgainst, whereIs } from './facts'

export type Punishment = { motif: string | null; hintFacts: Record<string, unknown> | null }

export function classifyPunishment(fenAfterKidMove: string, best: EngineLine | undefined, kidColor: Color): Punishment {
if (!best) return { motif: null, hintFacts: null }
const copy = new Chess(fenAfterKidMove)
  const m = copy.move({ from: best.move.slice(0, 2), to: best.move.slice(2, 4), promotion: best.move[4] })
  const attacker = { piece: nameOf(m.piece), where: whereIs(m.from, kidColor) }
  if (best.mate !== null && best.mate > 0) {
    return { motif: 'mate_threat', hintFacts: { kind: 'checkmate threat against your king', attacker } }
  }
  // Fork: the moved enemy piece attacks two or more of the kid's non-pawn pieces (king included).
  const victims = pieces(copy, kidColor)
    .filter((sq) => copy.get(sq)!.type !== 'p' && copy.attackers(sq, other(kidColor)).includes(m.to))
    .map((sq) => copy.get(sq)!.type)
  if (victims.length >= 2) {
    return {
      motif: 'fork',
      hintFacts: { kind: 'fork: one enemy piece could attack two of yours at once', attacker, targets: victims.map((v) => nameOf(v)) },
    }
  }
  if (m.captured) {
    return {
      motif: 'hanging_piece',
      hintFacts: { kind: 'one of your pieces can be taken for free', victim: { piece: nameOf(m.captured), where: whereIs(m.to, kidColor) }, attacker },
    }
  }
  // Otherwise: name the most valuable kid piece the reply puts in danger.
  const victim = threatsAgainst(copy, kidColor).find((t) => t.hanging || t.attackers.some((a) => a.square === m.to))
  if (victim) {
    return {
      motif: 'piece_in_danger',
      hintFacts: { kind: 'one of your pieces will be in danger', victim: { piece: victim.victim.name, where: victim.victim.where }, attacker },
    }
  }
  return { motif: 'loses_material', hintFacts: { kind: 'the opponent has a strong reply', attacker } }
}
