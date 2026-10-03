// Puzzles from the Lichess puzzle database (CC0), a kid-friendly slice built by scripts/build-puzzles.py.
// Each puzzle's FEN is the position BEFORE the opponent's move; moves[0] is that move, then the
// solution alternates player / opponent. Hints come only from the stored solution: never invented.
import data from './puzzles.json'

export type Puzzle = { id: string; fen: string; moves: string[]; rating: number; themes: string[]; url: string }
export type PuzzleTheme = keyof typeof data

export const PUZZLES = data as Record<PuzzleTheme, Puzzle[]>
export const PUZZLE_THEMES = Object.keys(PUZZLES) as PuzzleTheme[]

/** How each theme is introduced, and which chess-book concept explains it. */
export const THEME_INFO: Record<PuzzleTheme, { label: string; kidGoal: string; goal: string; concept: string }> = {
  mateIn1: { label: 'Checkmate in 1', kidGoal: 'Find the move that checkmates the king right now!', goal: 'Mate in one.', concept: 'checkmate' },
  mateIn2: { label: 'Checkmate in 2', kidGoal: 'You can checkmate in two moves. Find the first one!', goal: 'Mate in two.', concept: 'checkmate' },
  hangingPiece: { label: 'Free piece', kidGoal: 'One enemy piece has no guard. Can you grab it?', goal: 'Win the undefended piece.', concept: 'hanging_piece' },
  fork: { label: 'Fork', kidGoal: 'Attack two enemy pieces with one move!', goal: 'Find the fork.', concept: 'fork' },
  pin: { label: 'Pin', kidGoal: 'Trap an enemy piece so it cannot move without losing something bigger.', goal: 'Use the pin.', concept: 'pin' },
  skewer: { label: 'Skewer', kidGoal: 'Attack a big piece so it has to move, then take the one behind it.', goal: 'Find the skewer.', concept: 'skewer' },
  discoveredAttack: { label: 'Surprise attack', kidGoal: 'Move one piece out of the way to uncover an attack!', goal: 'Find the discovered attack.', concept: 'discovered_attack' },
}

/** Which theme practises a mistake the Memory or Scout has seen. */
export const THEME_FOR_MISTAKE: Record<string, PuzzleTheme> = {
  fork: 'fork',
  hanging_piece: 'hangingPiece',
  piece_in_danger: 'hangingPiece',
  mate_threat: 'mateIn1',
  loses_material: 'hangingPiece',
}

/** Map loose words ("checkmate", "forks", "free pieces") to a theme. */
export function themeFromWords(words: string | undefined): PuzzleTheme | null {
  if (!words) return null
  const w = words.toLowerCase().replace(/[^a-z0-9 ]/g, '')
  if ((PUZZLE_THEMES as string[]).includes(words)) return words as PuzzleTheme
  if (/two|2/.test(w) && /mate/.test(w)) return 'mateIn2'
  if (/mate/.test(w)) return 'mateIn1'
  if (/fork/.test(w)) return 'fork'
  if (/pin/.test(w)) return 'pin'
  if (/skewer/.test(w)) return 'skewer'
  if (/discover|surprise/.test(w)) return 'discoveredAttack'
  if (/hang|free|undefended|loose/.test(w)) return 'hangingPiece'
  return null
}

/** Easiest unseen puzzle of the theme (wraps around once all are seen). */
export function pickPuzzle(theme: PuzzleTheme, seen: string[]): Puzzle {
  const list = PUZZLES[theme]
  return list.find((p) => !seen.includes(p.id)) ?? list[Math.floor(Math.random() * list.length)]
}
