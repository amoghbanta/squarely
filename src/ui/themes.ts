// Board and piece looks. The voice agent can switch these with change_settings.
import type { PieceSymbol } from 'chess.js'

export const BOARD_THEMES = {
  meadow: { label: 'Meadow (green)', light: '#ffe7b8', dark: '#8fc9a8' },
  ocean: { label: 'Ocean (blue)', light: '#e3f2ff', dark: '#5b9bd5' },
  candy: { label: 'Candy (pink)', light: '#fff0f6', dark: '#e58fb8' },
  wood: { label: 'Wood (brown)', light: '#f0d9b5', dark: '#b58863' },
  space: { label: 'Space (dark)', light: '#9aa3c7', dark: '#3b3f6b' },
  contrast: { label: 'High contrast', light: '#ffffff', dark: '#3a3a3a' },
} as const

export type BoardTheme = keyof typeof BOARD_THEMES

export const PIECE_STYLES = {
  friends: 'Friends (faces)',
  classic: 'Classic',
  animals: 'Animals',
  letters: 'Big letters',
} as const

export type PieceStyle = keyof typeof PIECE_STYLES

export const GLYPH: Record<PieceSymbol, string> = { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' }
export const ANIMAL: Record<PieceSymbol, string> = { k: '🦁', q: '🦄', r: '🐘', b: '🦉', n: '🐴', p: '🐣' }
export const LETTER: Record<PieceSymbol, string> = { k: 'K', q: 'Q', r: 'R', b: 'B', n: 'N', p: 'P' }

export const isBoardTheme = (v: unknown): v is BoardTheme => typeof v === 'string' && v in BOARD_THEMES
export const isPieceStyle = (v: unknown): v is PieceStyle => typeof v === 'string' && v in PIECE_STYLES
