// Big, bright SVG board. Pieces are characters with faces. Tap, drag, or keyboard (arrows + Enter).
import { Chess, type Color, type Square } from 'chess.js'
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { CHARACTER } from '../chess/facts'

import { ANIMAL, BOARD_THEMES, GLYPH, LETTER, type BoardTheme, type PieceStyle } from './themes'
import type { Marks } from '../game/controller'
import type { Grade } from '../chess/teach'
import { GRADE } from './grades'

type Piece = { type: string; color: Color }

/** A piece's artwork in a 100×100 box: used on its square and as the piece you're dragging. */
function PieceArt({ p, style }: { p: Piece; style: PieceStyle }) {
  const t = p.type as keyof typeof GLYPH
  return (
    <>
      {style === 'animals' ? (
        <>
          <circle cx="50" cy="50" r="40" className="disc" />
          <text x="50" y="68" textAnchor="middle" className="emoji">
            {ANIMAL[t]}
          </text>
        </>
      ) : style === 'letters' ? (
        <>
          <circle cx="50" cy="50" r="40" className="disc" />
          <text x="50" y="70" textAnchor="middle" className="letter">
            {LETTER[t]}
          </text>
        </>
      ) : (
        <text x="50" y="80" textAnchor="middle" className="glyph">
          {GLYPH[t]}
        </text>
      )}
      {/* googly eyes */}
      {style === 'friends' && (
        <>
          <circle cx="41" cy={t === 'p' ? 52 : 46} r="6.5" className="eye" />
          <circle cx="59" cy={t === 'p' ? 52 : 46} r="6.5" className="eye" />
          <circle cx="42.5" cy={t === 'p' ? 53 : 47} r="3" className="pupil" />
          <circle cx="60.5" cy={t === 'p' ? 53 : 47} r="3" className="pupil" />
        </>
      )}
    </>
  )
}

const PLAIN: Record<string, string> = { k: 'king', q: 'queen', r: 'rook', b: 'bishop', n: 'knight', p: 'pawn' }

type Props = {
  kidsMode: boolean
  boardTheme: BoardTheme
  marks: Marks
  pieceStyle: PieceStyle
  fen: string
  pov: Color
  lastMove: { from: Square; to: Square } | null
  lastGrade?: Grade | null
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

/** Offset from the destination back to the origin, so CSS can slide the piece home. */
const slideFrom = (from: Square, to: Square, pov: Color) => {
  const a = centre(from, pov)
  const b = centre(to, pov)
  return { ['--dx' as string]: `${a.x - b.x}px`, ['--dy' as string]: `${a.y - b.y}px` }
}

const sqAt = (col: number, row: number, pov: Color): Square => {
  const file = pov === 'w' ? col : 7 - col
  const rank = pov === 'w' ? 7 - row : row
  return `${'abcdefgh'[file]}${rank + 1}` as Square
}

export function Board({ kidsMode, marks, boardTheme, pieceStyle, fen, pov, lastMove, lastGrade, checkSquare, disabled, onMove }: Props) {
  // Lesson boards have no kings, so positions are loaded without the full validity check.
  const chess = useMemo(() => new Chess(fen, { skipValidation: true }), [fen])
  const [selected, setSelected] = useState<Square | null>(null)
  const [cursor, setCursor] = useState<[number, number]>([4, 6])
  const ref = useRef<SVGSVGElement>(null)
  const [focused, setFocused] = useState(false)
  const [hover, setHover] = useState<Square | null>(null)
  // Pointer: a press that barely moves is a tap; one that travels is a drag.
  const press = useRef<{ from: Square; x: number; y: number; id: number } | null>(null)
  const [drag, setDragState] = useState<{ from: Square; x: number; y: number } | null>(null)
  // Mirrored in a ref so fast pointer events (before React re-renders) see the live drag.
  const dragRef = useRef(drag)
  const setDrag = (d: typeof drag) => {
    dragRef.current = d
    setDragState(d)
  }
  // A new position (voice move, engine reply, undo) clears any half-made tap selection or drag.
  useEffect(() => {
    setSelected(null)
    setDrag(null)
    press.current = null
  }, [fen])

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

  /** Board coordinates (0..800 inside the frame) under the pointer, and the square there. */
  const at = (e: PointerEvent) => {
    const svg = ref.current!
    const m = svg.getScreenCTM()
    if (!m) return null
    const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse())
    const col = Math.floor(pt.x / 100)
    const row = Math.floor(pt.y / 100)
    const sq = col >= 0 && col < 8 && row >= 0 && row < 8 ? sqAt(col, row, pov) : null
    return { x: pt.x, y: pt.y, sq }
  }

  const onPointerDown = (e: PointerEvent<SVGSVGElement>) => {
    if (e.button !== 0) return
    const a = at(e)
    if (!a?.sq) return
    press.current = { from: a.sq, x: a.x, y: a.y, id: e.pointerId }
    const p = chess.get(a.sq)
    // Only your own pieces can be picked up; capture so the drag survives leaving the board.
    if (!disabled && p && p.color === pov && chess.turn() === pov) {
      try {
        e.currentTarget.setPointerCapture(e.pointerId)
      } catch {
        /* synthetic or already-released pointer: the drag still works inside the board */
      }
    }
  }

  const onPointerMove = (e: PointerEvent<SVGSVGElement>) => {
    const a = at(e)
    if (e.pointerType === 'mouse') setHover(a?.sq ?? null)
    const pr = press.current
    if (!pr || pr.id !== e.pointerId || !a) return
    if (!dragRef.current) {
      const p = chess.get(pr.from)
      const travelled = Math.hypot(a.x - pr.x, a.y - pr.y) > 14
      if (!travelled || disabled || !p || p.color !== pov || chess.turn() !== pov) return
      setSelected(pr.from) // shows where it can go
    }
    setDrag({ from: pr.from, x: a.x, y: a.y })
  }

  const onPointerUp = (e: PointerEvent<SVGSVGElement>) => {
    const pr = press.current
    // Another finger's lift: ignore it (the press and any drag belong to the first finger).
    if (!pr || pr.id !== e.pointerId) return
    press.current = null
    const a = at(e)
    const d = dragRef.current
    if (d) {
      setDrag(null)
      const legal = a?.sq && a.sq !== d.from && chess.moves({ square: d.from, verbose: true }).some((m) => m.to === a.sq)
      if (legal) {
        onMove(d.from, a.sq!)
        setSelected(null)
      }
      // Dropped elsewhere: the piece snaps back and stays selected, so a tap can still finish the move.
      return
    }
    if (a?.sq === pr.from) activate(pr.from)
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
      viewBox="-56 -56 912 912"
      role="application"
      aria-roledescription="chess board"
      aria-label={`Chess board. Use arrow keys and Enter to move. ${cursorLabel}`}
      tabIndex={0}
      onKeyDown={onKey}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={{
        ['--light-sq' as string]: BOARD_THEMES[boardTheme].light,
        ['--dark-sq' as string]: BOARD_THEMES[boardTheme].dark,
        ['--frame' as string]: BOARD_THEMES[boardTheme].frame,
      }}
      onMouseLeave={() => setHover(null)}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={() => {
        press.current = null
        setDrag(null)
      }}
    >
      {/* Frame with big file letters and rank numbers outside the squares, so they never hide behind a piece.
          The letter and number of the square you're pointing at light up: "this is e4". */}
      <rect x="-56" y="-56" width="912" height="912" rx="36" className="frame" />
      {Array.from({ length: 8 }, (_, i) => {
        const file = 'abcdefgh'[pov === 'w' ? i : 7 - i]
        const rank = String(pov === 'w' ? 8 - i : i + 1)
        const on = hover ?? selected ?? (focused ? cursorSq : null)
        return (
          <g key={i} aria-hidden>
            <text x={i * 100 + 50} y="838" className={`coord${on?.[0] === file ? ' on' : ''}`}>{file}</text>
            <text x={i * 100 + 50} y="-18" className={`coord top${on?.[0] === file ? ' on' : ''}`}>{file}</text>
            <text x="-28" y={i * 100 + 61} className={`coord${on?.[1] === rank ? ' on' : ''}`}>{rank}</text>
            <text x="828" y={i * 100 + 61} className={`coord top${on?.[1] === rank ? ' on' : ''}`}>{rank}</text>
          </g>
        )
      })}
      <clipPath id="board-clip">
        <rect width="800" height="800" rx="14" />
      </clipPath>
      <g clipPath="url(#board-clip)">
      {Array.from({ length: 64 }, (_, i) => {
        const col = i % 8
        const row = Math.floor(i / 8)
        const sq = sqAt(col, row, pov)
        const dark = (col + row) % 2 === 1
        const p = chess.get(sq)
        const isLast = lastMove && (lastMove.from === sq || lastMove.to === sq)
        const isCursor = col === cursor[0] && row === cursor[1]
        return (
          <g key={sq} transform={`translate(${col * 100} ${row * 100})`} className="sq">
            <rect width="100" height="100" className={dark ? 'dark' : 'light'} />
            {isLast && <rect width="100" height="100" className="last" />}
            {checkSquare === sq && <rect width="100" height="100" className="check" />}
            {selected === sq && <rect width="100" height="100" className="sel" />}
            {targets.has(sq) && (p ? <circle cx="50" cy="50" r="46" className="target-ring" /> : <circle cx="50" cy="50" r="16" className="target" />)}
            {p && (
              <g
                key={lastMove?.to === sq ? `${lastMove.from}${sq}${fen}` : 'still'}
                className={`piece ${p.color === 'w' ? 'pw' : 'pb'} ${lastMove?.to === sq ? 'slide' : ''} ${drag?.from === sq ? 'lifted' : ''}`}
                style={lastMove?.to === sq ? slideFrom(lastMove.from, sq, pov) : undefined}
              >
                <title>{`${p.color === pov ? 'Your' : "Buddy's"} ${kidsMode ? CHARACTER[p.type] : PLAIN[p.type]}`}</title>
                <PieceArt p={p} style={pieceStyle} />
              </g>
            )}
            {hover === sq && !p && <text x="50" y="60" className="sq-name">{sq}</text>}
            {isCursor && focused && <rect x="3" y="3" width="94" height="94" className="cursor" />}
          </g>
        )
      })}
      </g>
      {/* Squarely points: rings and arrows drawn only from computed tool results */}
      <g className="marks" pointerEvents="none">
        <defs>
          {(['move', 'threat', 'option', 'suggest'] as const).map((k) => (
            <marker key={k} id={`head-${k}`} viewBox="0 0 10 10" refX="6" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse">
              <path d="M0 0 L10 5 L0 10 z" className={`head-${k}`} />
            </marker>
          ))}
        </defs>
        {marks.squares.map((m) => {
          const c = centre(m.square, pov)
          return <rect key={`${m.kind}-${m.square}`} x={c.x - 46} y={c.y - 46} width="92" height="92" rx="16" className={`mark mark-${m.kind}`} />
        })}
        {marks.arrows.map((a, i) => {
          const f = centre(a.from, pov)
          const t = centre(a.to, pov)
          const len = Math.hypot(t.x - f.x, t.y - f.y) || 1
          const shorten = 26
          const line = (
            <line
              key={`${a.kind}-${a.from}-${a.to}`}
              x1={f.x}
              y1={f.y}
              x2={t.x - ((t.x - f.x) / len) * shorten}
              y2={t.y - ((t.y - f.y) / len) * shorten}
              className={`arrow arrow-${a.kind}`}
              markerEnd={`url(#head-${a.kind})`}
              pathLength={1}
            />
          )
          // Numbered options: the big digit sits where the arrow ends, matching the "1, 2, 3" buttons.
          const num = a.kind === 'option' && (
            <g key={`n-${a.from}-${a.to}`} className="opt-num" transform={`translate(${t.x} ${t.y})`}>
              <circle r="22" />
              <text dy="9" textAnchor="middle">
                {i + 1}
              </text>
            </g>
          )
          return num ? [line, num] : line
        })}
        {lastMove && lastGrade && (() => {
          // Grade badge on the corner of the square the last move landed on.
          const c = centre(lastMove.to, pov)
          const g = GRADE[lastGrade]
          return (
            <g key={`${lastMove.to}-${lastGrade}`} className="grade-badge" transform={`translate(${c.x + 34} ${c.y - 34})`}>
              <title>{g.label}</title>
              <circle r="22" fill={g.color} />
              <text textAnchor="middle" dominantBaseline="central" fontSize={g.icon.length > 1 && lastGrade !== 'book' ? 18 : 22}>{g.icon}</text>
            </g>
          )
        })()}
      </g>
      {drag && (() => {
        const p = chess.get(drag.from)
        return p ? (
          <g className={`piece dragging ${p.color === 'w' ? 'pw' : 'pb'}`} transform={`translate(${drag.x - 50} ${drag.y - 62})`} pointerEvents="none">
            <PieceArt p={p} style={pieceStyle} />
          </g>
        ) : null
      })()}
    </svg>
    {/* Screen readers don't reliably re-read a changing aria-label, so the cursor is announced here. */}
    <div className="sr-only" aria-live="polite">
      {focused ? cursorLabel : ''}
    </div>
    </>
  )
}
