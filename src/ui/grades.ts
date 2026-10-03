// How each engine grade looks and reads. Shared by the board badge and the move strip.
import type { Grade } from '../chess/teach'

export const GRADE: Record<Grade, { icon: string; label: string; color: string }> = {
  brilliant: { icon: '!!', label: 'Brilliant', color: '#1bada6' },
  best: { icon: '★', label: 'Best move', color: '#34c759' },
  great: { icon: '!', label: 'Great move', color: '#30b0c7' },
  good: { icon: '✓', label: 'Good move', color: '#8fbf6b' },
  book: { icon: '📖', label: 'Book move', color: '#a2845e' },
  inaccuracy: { icon: '?!', label: 'Inaccuracy', color: '#f7c631' },
  mistake: { icon: '?', label: 'Mistake', color: '#ff9500' },
  blunder: { icon: '??', label: 'Blunder', color: '#ff3b30' },
}
