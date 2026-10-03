// Learn mode for people who know nothing about chess: one piece at a time, on a nearly empty board.
// Each lesson explains how the piece moves (curated words, never the model's memory), lights up where it
// can go, and sets a tiny task: gobble the pawns. Boards have no kings (except the king lesson), so they
// are loaded with chess.js skipValidation; legality is still chess.js's.
import type { PieceSymbol } from 'chess.js'

export type LessonId = 'rook' | 'bishop' | 'queen' | 'king' | 'knight' | 'pawn'

export type Lesson = {
  id: LessonId
  piece: PieceSymbol
  title: string // kid name
  fen: string // white to move; black pawns are the "treats"
  reach?: string // optional goal square (the pawn's promotion)
}

/** Easiest first: straight lines, then diagonals, then both, then the special ones. */
export const LESSONS: Lesson[] = [
  { id: 'rook', piece: 'r', title: 'The castle', fen: '8/8/1p6/8/8/1p1p4/3R4/8 w - - 0 1' },
  { id: 'bishop', piece: 'b', title: 'The bishop', fen: '8/4p3/8/6p1/8/4p3/8/2B5 w - - 0 1' },
  { id: 'queen', piece: 'q', title: 'The queen', fen: '8/8/8/p2p3p/8/8/8/3Q4 w - - 0 1' },
  { id: 'king', piece: 'k', title: 'The king', fen: '8/8/8/3p4/4p3/4p3/4K3/8 w - - 0 1' },
  { id: 'knight', piece: 'n', title: 'The horse', fen: '8/8/5p2/8/4p3/2p5/8/1N6 w - - 0 1' },
  { id: 'pawn', piece: 'p', title: 'The pawn', fen: '8/8/8/3p4/8/8/4P3/8 w - - 0 1', reach: 'd8' },
]

/** How each piece moves, for absolute beginners (kid words) and grown-ups. Shown and spoken as-is. */
export const HOW_IT_MOVES: Record<PieceSymbol, { kid: string; grownup: string; worth: number; tip: string }> = {
  r: {
    kid: 'The castle zooms in straight lines: up, down, left or right, as far as it likes, until something is in the way.',
    grownup: 'The rook moves any number of squares along a rank or file. It cannot jump over pieces.',
    worth: 5,
    tip: 'Castles love open lines with nothing in the way.',
  },
  b: {
    kid: 'The bishop slides corner to corner, on the slanty lines, as far as it likes. It always stays on its own colour of square.',
    grownup: 'The bishop moves any number of squares diagonally and always stays on squares of one colour.',
    worth: 3,
    tip: 'Look along the slanty lines from the bishop.',
  },
  q: {
    kid: 'The queen is the superstar: she moves like a castle AND a bishop, straight or slanty, as far as she likes.',
    grownup: 'The queen combines rook and bishop: any distance along ranks, files and diagonals.',
    worth: 9,
    tip: 'She is very strong, so keep her safe.',
  },
  k: {
    kid: 'The king takes one small step in any direction. He is the most important piece: he must never walk into danger.',
    grownup: 'The king moves one square in any direction and may never move into check. He can also castle.',
    worth: 0,
    tip: 'A king can take an enemy piece next to him, as long as nobody protects it.',
  },
  n: {
    kid: 'The horse jumps in an L shape: two squares one way, then one square to the side. It is the only piece that can jump over others!',
    grownup: 'The knight moves in an L: two squares in one direction and one perpendicular. It jumps over pieces.',
    worth: 3,
    tip: 'A horse always lands on a different colour of square than it started on.',
  },
  p: {
    kid: 'The pawn walks forward one square. On its very first move it may take two steps. It takes enemies one step diagonally forward. If it reaches the far end, it turns into a queen!',
    grownup: 'Pawns advance one square (two from the start), capture one square diagonally forward, and promote on the last rank. En passant is a special capture.',
    worth: 1,
    tip: 'Pawns can never walk backwards, so think before you push.',
  },
}

export const lessonById = (id: string | undefined) => LESSONS.find((l) => l.id === id)

/** Map loose words ("the horse", "castles", "how do pawns work") to a lesson. */
export function lessonFromWords(words: string | undefined): Lesson | undefined {
  if (!words) return undefined
  const w = words.toLowerCase()
  if (/rook|castle|tower/.test(w)) return lessonById('rook')
  if (/bishop/.test(w)) return lessonById('bishop')
  if (/queen/.test(w)) return lessonById('queen')
  if (/king/.test(w)) return lessonById('king')
  if (/knight|horse|pony|night/.test(w)) return lessonById('knight')
  if (/pawn/.test(w)) return lessonById('pawn')
  return lessonById(w.trim())
}
