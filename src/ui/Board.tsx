// Big, bright SVG board. Pieces are characters with faces. Fully keyboard-playable (arrows + Enter).
import { Chess, type Color, type Square } from 'chess.js'
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { CHARACTER } from '../chess/facts'

import { ANIMAL, BOARD_THEMES, GLYPH, LETTER, type BoardTheme, type PieceStyle } from './themes'
import type { Marks } from '../game/controller'

const PLAIN: Record<string, string> = { k: 'king', q: 'queen', r: 'rook', b: 'bishop', n: 'knight', p: 'pawn' }

type Props = {
  kidsMode: boolean
  boardTheme: BoardTheme
  marks: Marks
  pieceStyle: PieceStyle
  fen: string
  pov: Color
  lastMove: { from: Square; to: Square } | null
  checkSquare: Square | null
  disabled: boolean
  onMove: (from: Square, to: Square) => void
}

/** Centre of a square in board coordinates (0..800). */
const centre = (sq: Square, pov: Color) => {
  const f = sq.charCodeAt(0) - 97
  const r = Number(sq[1]) - 1
  const col = pov === 'w' ? f : 7 - f
  const row = pov === 'w' ? 7 - r : r
  return { x: col * 100 + 50, y: row * 100 + 50 }
}

const sqAt = (col: number, row: number, pov: Color): Square => {
  const file = pov === 'w' ? col : 7 - col
  const rank = pov === 'w' ? 7 - row : row
  return `${'abcdefgh'[file]}${rank + 1}` as Square
}

export function Board({ kidsMode, marks, boardTheme, pieceStyle, fen, pov, lastMove, checkSquare, disabled, onMove }: Props) {
  const chess = useMemo(() => new Chess(fen), [fen])
  const [selected, setSelected] = useState<Square | null>(null)
  const [cursor, setCursor] = useState<[number, number]>([4, 6])
  const ref = useRef<SVGSVGElement>(null)
  const [focused, setFocused] = useState(false)
  // A new position (voice move, engine reply, undo) clears any half-made tap selection.
  useEffect(() => setSelected(null), [fen])

  const targets = useMemo(
    () => (selected ? new Set(chess.moves({ square: selected, verbose: true }).map((m) => m.to)) : new Set<string>()),
    [chess, selected],
  )

  const activate = (sq: Square) => {
    if (disabled) return
    const p = chess.get(sq)
    if (selected && targets.has(sq)) {
      onMove(selected, sq)
      setSelected(null)
    } else if (p && p.color === pov && chess.turn() === pov) {
      setSelected(sq === selected ? null : sq)
    } else {
      setSelected(null)
    }
  }

  const onKey = (e: KeyboardEvent) => {
    const [c, r] = cursor
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [Math.max(0, c - 1), r],
      ArrowRight: [Math.min(7, c + 1), r],
      ArrowUp: [c, Math.max(0, r - 1)],
      ArrowDown: [c, Math.min(7, r + 1)],
    }
    if (moves[e.key]) {
      e.preventDefault()
      setCursor(moves[e.key])
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      activate(sqAt(c, r, pov))
    } else if (e.key === 'Escape') setSelected(null)
  }

  const cursorSq = sqAt(cursor[0], cursor[1], pov)
  const cursorPiece = chess.get(cursorSq)
  const cursorLabel = `${cursorSq}: ${cursorPiece ? `${cursorPiece.color === pov ? 'your' : "buddy's"} ${kidsMode ? CHARACTER[cursorPiece.type] : PLAIN[cursorPiece.type]}` : 'empty'}${selected ? `. Selected ${selected}` : ''}`

  return (
    <>
    <svg
      ref={ref}
      className="board"
      viewBox="0 0 800 800"
      role="application"
      aria-roledescription="chess board"
      aria-label={`Chess board. Use arrow keys and Enter to move. ${cursorLabel}`}
      tabIndex={0}
      onKeyDown={onKey}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={{ ['--light-sq' as string]: BOARD_THEMES[boardTheme].light, ['--dark-sq' as string]: BOARD_THEMES[boardTheme].dark }}
    >
      {Array.from({ length: 64 }, (_, i) => {
        const col = i % 8
        const row = Math.floor(i / 8)
        const sq = sqAt(col, row, pov)
        const dark = (col + row) % 2 === 1
        const p = chess.get(sq)
        const isLast = lastMove && (lastMove.from === sq || lastMove.to === sq)
        const isCursor = col === cursor[0] && row === cursor[1]
        return (
          <g key={sq} transform={`translate(${col * 100} ${row * 100})`} onClick={() => activate(sq)} className="sq">
            <rect width="100" height="100" className={dark ? 'dark' : 'light'} />
            {isLast && <rect width="100" height="100" className="last" />}
            {checkSquare === sq && <rect width="100" height="100" className="check" />}
            {selected === sq && <rect width="100" height="100" className="sel" />}
            {targets.has(sq) && (p ? <circle cx="50" cy="50" r="46" className="target-ring" /> : <circle cx="50" cy="50" r="16" className="target" />)}
            {p && (
              <g className={`piece ${p.color === 'w' ? 'pw' : 'pb'}`}>
                <title>{`${p.color === pov ? 'Your' : "Buddy's"} ${kidsMode ? CHARACTER[p.type] : PLAIN[p.type]}`}</title>
                {pieceStyle === 'animals' ? (
                  <>
                    <circle cx="50" cy="50" r="40" className="disc" />
                    <text x="50" y="68" textAnchor="middle" className="emoji">
                      {ANIMAL[p.type]}
                    </text>
                  </>
                ) : pieceStyle === 'letters' ? (
                  <>
                    <circle cx="50" cy="50" r="40" className="disc" />
                    <text x="50" y="70" textAnchor="middle" className="letter">
                      {LETTER[p.type]}
                    </text>
                  </>
                ) : (
                  <text x="50" y="80" textAnchor="middle" className="glyph">
                    {GLYPH[p.type]}
                  </text>
                )}
                {/* googly eyes */}
                {pieceStyle === 'friends' && (
                  <>
                    <circle cx="41" cy={p.type === 'p' ? 52 : 46} r="6.5" className="eye" />
                    <circle cx="59" cy={p.type === 'p' ? 52 : 46} r="6.5" className="eye" />
                    <circle cx="42.5" cy={p.type === 'p' ? 53 : 47} r="3" className="pupil" />
                    <circle cx="60.5" cy={p.type === 'p' ? 53 : 47} r="3" className="pupil" />
                  </>
                )}
              </g>
            )}
            {col === 0 && <text x="5" y="20" className="coord">{sq[1]}</text>}
            {row === 7 && <text x="88" y="95" className="coord">{sq[0]}</text>}
            {isCursor && <rect x="3" y="3" width="94" height="94" className="cursor" />}
          </g>
        )
      })}
      {/* Squarely points: rings and arrows drawn only from computed tool results */}
      <g className="marks" pointerEvents="none">
        <defs>
          {(['move', 'threat', 'option'] as const).map((k) => (
            <marker key={k} id={`head-${k}`} viewBox="0 0 10 10" refX="6" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse">
              <path d="M0 0 L10 5 L0 10 z" className={`head-${k}`} />
            </marker>
          ))}
        </defs>
        {marks.squares.map((m) => {
          const c = centre(m.square, pov)
          return <rect key={`${m.kind}-${m.square}`} x={c.x - 46} y={c.y - 46} width="92" height="92" rx="16" className={`mark mark-${m.kind}`} />
        })}
        {marks.arrows.map((a) => {
          const f = centre(a.from, pov)
          const t = centre(a.to, pov)
          const len = Math.hypot(t.x - f.x, t.y - f.y) || 1
          const shorten = 26
          return (
            <line
              key={`${a.kind}-${a.from}-${a.to}`}
              x1={f.x}
              y1={f.y}
              x2={t.x - ((t.x - f.x) / len) * shorten}
              y2={t.y - ((t.y - f.y) / len) * shorten}
              className={`arrow arrow-${a.kind}`}
              markerEnd={`url(#head-${a.kind})`}
            />
          )
        })}
      </g>
    </svg>
    {/* Screen readers don't reliably re-read a changing aria-label, so the cursor is announced here. */}
    <div className="sr-only" aria-live="polite">
      {focused ? cursorLabel : ''}
    </div>
    </>
  )
}
