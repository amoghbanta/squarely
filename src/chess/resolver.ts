// Referee: turns a structured kid intent ("horse to the middle") into exactly one LEGAL move,
// or a clarifying question, or a fact-based reason it can't be played. Never guesses.
import { Chess, type Move, type PieceSymbol, type Square } from 'chess.js'
import { nameOf, kingSquare, pieces, whereIs } from './facts'

const SQUARES_OF = (chess: Chess, color: 'w' | 'b', type: PieceSymbol) => pieces(chess, color).filter((q) => chess.get(q)!.type === type)

export type PieceWord = 'pawn' | 'knight' | 'bishop' | 'rook' | 'queen' | 'king'

export type MoveIntent = {
  piece?: PieceWord
  from?: string
  to?: string
  capture?: PieceWord
  area?: 'middle' | 'left' | 'right' | 'forward'
  which?: 'left' | 'right' | 'near_king' | 'front' | 'back' | 'in_front_of_king' | 'in_front_of_queen'
  steps?: number // squares moved forward, e.g. a pawn's two-step start
  castle?: 'short' | 'long'
  promotion?: PieceWord
  san?: string
  option?: number // 1-based answer to a previous clarifying question
}

export type MoveOption = { label: string; san: string; from: Square; to: Square }

export type Resolution =
  | { status: 'ok'; move: Move }
  | { status: 'ask'; question: string; options: MoveOption[] }
  | { status: 'illegal'; reason: string; facts: Record<string, unknown> }

const SYM: Record<PieceWord, PieceSymbol> = { pawn: 'p', knight: 'n', bishop: 'b', rook: 'r', queen: 'q', king: 'k' }
const isSquare = (s?: string): s is Square => !!s && /^[a-h][1-8]$/.test(s.toLowerCase())
const fileOf = (s: Square) => s.charCodeAt(0) - 97
const rankOf = (s: Square) => Number(s[1]) - 1
const dist = (a: Square, b: Square) => Math.max(Math.abs(fileOf(a) - fileOf(b)), Math.abs(rankOf(a) - rankOf(b)))
const centrality = (s: Square) => -(Math.abs(fileOf(s) - 3.5) + Math.abs(rankOf(s) - 3.5))

export function resolveMove(chess: Chess, intent: MoveIntent, pending: MoveOption[] | null): Resolution {
  const legal = chess.moves({ verbose: true })
  const me = chess.turn()

  if (intent.option && pending?.[intent.option - 1]) {
    const m = legal.find((x) => x.san === pending[intent.option! - 1].san)
    if (m) return { status: 'ok', move: m }
  }

  if (intent.san) {
    const clean = intent.san.replace(/\s+/g, '')
    const m = legal.find((x) => x.san.replace(/[+#]/g, '') === clean.replace(/[+#]/g, '') || x.lan === clean.toLowerCase())
    if (m) return { status: 'ok', move: m }
  }

  if (intent.castle) {
    const flag = intent.castle === 'short' ? 'k' : 'q'
    const m = legal.find((x) => x.flags.includes(flag))
    if (m) return { status: 'ok', move: m }
    return { status: 'illegal', reason: 'castling is not allowed right now', facts: { castle: intent.castle } }
  }

  let cands: Move[] = legal
  if (intent.piece) cands = cands.filter((m) => m.piece === SYM[intent.piece!])
  if (isSquare(intent.from)) cands = cands.filter((m) => m.from === intent.from!.toLowerCase())
  if (isSquare(intent.to)) cands = cands.filter((m) => m.to === intent.to!.toLowerCase())
  if (intent.capture) cands = cands.filter((m) => m.captured === SYM[intent.capture!])
  if (intent.promotion) cands = cands.filter((m) => m.promotion === SYM[intent.promotion!])
  else cands = cands.filter((m) => !m.promotion || m.promotion === 'q')

  if (intent.area === 'middle') {
    const best = Math.max(...cands.map((m) => centrality(m.to)))
    cands = cands.filter((m) => centrality(m.to) === best)
  } else if (intent.area === 'forward') {
    cands = cands.filter((m) => (me === 'w' ? rankOf(m.to) > rankOf(m.from) : rankOf(m.to) < rankOf(m.from)))
  } else if (intent.area === 'left' || intent.area === 'right') {
    const leftward = (m: Move) => (me === 'w' ? fileOf(m.to) < fileOf(m.from) : fileOf(m.to) > fileOf(m.from))
    cands = cands.filter((m) => (intent.area === 'left' ? leftward(m) : !leftward(m) && m.to[0] !== m.from[0]))
  }

  if (intent.steps) cands = cands.filter((m) => Math.abs(rankOf(m.to) - rankOf(m.from)) === intent.steps)
  cands = narrowByWhich(chess, cands, intent.which)

  if (cands.length === 1) return { status: 'ok', move: cands[0] }
  if (cands.length === 0) return explainIllegal(chess, intent, legal)

  // Too many to list out loud: ask a narrowing question instead of reading a long menu.
  if (new Set(cands.map((m) => m.from)).size > 3 && !isSquare(intent.to)) {
    const name = nameOf(cands[0].piece)
    return {
      status: 'ask',
      question: `Which ${name}? You could say which side it's on, which square it should go to, or "the one in front of my king".`,
      options: [],
    }
  }

  // Several legal moves fit: ask, describing them by piece position, not notation.
  const options = cands.slice(0, 4).map((m) => ({ label: describeMove(m, me), san: m.san, from: m.from, to: m.to }))
  const sameDest = new Set(cands.map((m) => m.to)).size === 1
  const name = nameOf(cands[0].piece)
  const question = sameDest
    ? `Two of your pieces can go there. Which ${name}?`
    : new Set(cands.map((m) => m.from)).size === 1
      ? `Your ${name} can go to a few places. Which one?`
      : `A few moves fit. Which one do you mean?`
  return { status: 'ask', question, options }
}

function narrowByWhich(chess: Chess, cands: Move[], which?: MoveIntent['which']): Move[] {
  if (!which || cands.length < 2) return cands
  const me = chess.turn()
  const froms = [...new Set(cands.map((m) => m.from))]
  if (froms.length < 2) return cands
  if (which === 'in_front_of_king' || which === 'in_front_of_queen') {
    const target = which === 'in_front_of_king' ? 'k' : 'q'
    const sq = SQUARES_OF(chess, me, target)[0]
    if (!sq) return cands
    const onFile = cands.filter((m) => m.from[0] === sq[0])
    return onFile.length ? onFile : cands
  }
  const key = (s: Square): number => {
    const f = me === 'w' ? fileOf(s) : 7 - fileOf(s)
    const r = me === 'w' ? rankOf(s) : 7 - rankOf(s)
    if (which === 'left') return f
    if (which === 'right') return -f
    if (which === 'front') return -r
    if (which === 'back') return r
    return dist(s, kingSquare(chess, me)) // near_king
  }
  const sorted = froms.sort((a, b) => key(a) - key(b))
  // A tie (e.g. two pieces equally "left") stays ambiguous, so the Referee asks instead of guessing.
  if (key(sorted[0]) === key(sorted[1])) return cands.filter((m) => key(m.from) === key(sorted[0]))
  return cands.filter((m) => m.from === sorted[0])
}

function describeMove(m: Move, pov: 'w' | 'b'): string {
  const name = nameOf(m.piece)
  const take = m.captured ? `, taking the ${nameOf(m.captured)}` : ''
  return `${name} from ${m.from} (${whereIs(m.from, pov)}) to ${m.to} (${whereIs(m.to, pov)})${take}`
}

function explainIllegal(chess: Chess, intent: MoveIntent, legal: Move[]): Resolution {
  const facts: Record<string, unknown> = { inCheck: chess.inCheck() }
  if (chess.inCheck()) facts.note = 'king is in check, the move must get the king safe'
  if (intent.piece) {
    const own = legal.filter((m) => m.piece === SYM[intent.piece!])
    facts.piece = nameOf(SYM[intent.piece])
    facts.legalDestinationsForThatPiece = own.map((m) => ({ from: m.from, to: m.to, where: whereIs(m.to, chess.turn()) }))
    if (!own.length) return { status: 'illegal', reason: `that ${facts.piece} cannot move right now`, facts }
  }
  if (intent.capture) {
    facts.captureTargets = legal.filter((m) => m.captured).map((m) => ({ piece: nameOf(m.piece), takes: nameOf(m.captured!), on: m.to }))
  }
  return { status: 'illegal', reason: 'no legal move matches', facts }
}
