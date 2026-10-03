// Big, bright SVG board. Pieces are characters with faces. Fully keyboard-playable (arrows + Enter).
import { Chess, type Color, type Square } from 'chess.js'
import { useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { CHARACTER } from '../chess/facts'

const PLAIN: Record<string, string> = { k: 'king', q: 'queen', r: 'rook', b: 'bishop', n: 'knight', p: 'pawn' }
const GLYPH: Record<string, string> = { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' }

type Props = {
  kidsMode: boolean
  fen: string
  pov: Color
  lastMove: { from: Square; to: Square } | null
  checkSquare: Square | null
  disabled: boolean
  onMove: (from: Square, to: Square) => void
}

const sqAt = (col: number, row: number, pov: Color): Square => {
  const file = pov === 'w' ? col : 7 - col
  const rank = pov === 'w' ? 7 - row : row
  return `${'abcdefgh'[file]}${rank + 1}` as Square
}

export function Board({ kidsMode, fen, pov, lastMove, checkSquare, disabled, onMove }: Props) {
  const chess = useMemo(() => new Chess(fen), [fen])
  const [selected, setSelected] = useState<Square | null>(null)
  const [cursor, setCursor] = useState<[number, number]>([4, 6])
  const ref = useRef<SVGSVGElement>(null)

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
    <svg
      ref={ref}
      className="board"
      viewBox="0 0 800 800"
      role="application"
      aria-roledescription="chess board"
      aria-label={`Chess board. Use arrow keys and Enter to move. ${cursorLabel}`}
      tabIndex={0}
      onKeyDown={onKey}
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
                <text x="50" y="80" textAnchor="middle" className="glyph">
                  {GLYPH[p.type]}
                </text>
                {/* googly eyes (kids mode) */}
                {kidsMode && (
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
    </svg>
  )
}
