// Saved games, kept only in this browser: every game autosaves after each move, so it can be
// continued later or reviewed move by move.
import type { Color } from 'chess.js'
import type { Grade } from '../chess/teach'

export type SavedGame = {
  id: string
  started: number
  updated: number
  pgn: string
  kidColor: Color
  level: number
  result: 'won' | 'lost' | 'draw' | null // null: still in progress
  moves: number // plies
  grades: (Grade | null)[]
  opening: string | null
}

const KEY = 'squarely.games.v1'
const KEEP = 30

export function listGames(): SavedGame[] {
  try {
    const raw = localStorage.getItem(KEY)
    const games = raw ? (JSON.parse(raw) as SavedGame[]) : []
    return games.sort((a, b) => b.updated - a.updated)
  } catch {
    return []
  }
}

export function saveGame(g: SavedGame) {
  try {
    const rest = listGames().filter((x) => x.id !== g.id)
    localStorage.setItem(KEY, JSON.stringify([g, ...rest].slice(0, KEEP)))
  } catch {
    /* storage full or blocked: the game still plays, it just isn't saved */
  }
}

export function clearGames() {
  try {
    localStorage.removeItem(KEY)
  } catch {
    /* ignore */
  }
}

export const newGameId = () => `g${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
