// Wide screens: the two players with what they've captured, the opening, and the full move list with grades.
import { useEffect, useRef } from 'react'
import { Chess, type Color, type PieceSymbol } from 'chess.js'
import type { PlayedMove } from '../game/controller'
import { GRADE } from './grades'
import { Avatar } from './Avatar'
import { GLYPH } from './themes'

const START: Record<Exclude<PieceSymbol, 'k'>, number> = { q: 1, r: 2, b: 2, n: 2, p: 8 }
const VALUE: Record<Exclude<PieceSymbol, 'k'>, number> = { q: 9, r: 5, b: 3, n: 3, p: 1 }

/** Pieces of `color` missing from the board: what the other side has captured. */
function lost(fen: string, color: Color): Exclude<PieceSymbol, 'k'>[] {
  const c = new Chess(fen, { skipValidation: true })
  const left: Record<string, number> = {}
  for (const row of c.board()) for (const sq of row) if (sq && sq.color === color) left[sq.type] = (left[sq.type] ?? 0) + 1
  return (Object.keys(START) as Exclude<PieceSymbol, 'k'>[]).flatMap((t) => Array(Math.max(0, START[t] - (left[t] ?? 0))).fill(t))
}

type Progress = { title: string; items: { label: string; detail?: string; done?: boolean; current?: boolean }[] }
type Props = { moves: PlayedMove[]; kidColor: Color; fen: string; turn: Color; name: string; level: number; opening: string | null; progress?: Progress | null }

export function GameRail({ moves, kidColor, fen, turn, name, level, opening, progress }: Props) {
  const box = useRef<HTMLOListElement>(null)
  useEffect(() => {
    const el = box.current
    if (el) el.scrollTop = el.scrollHeight
  }, [moves.length])
  // Puzzles and lessons aren't games: show progress instead of players and captures.
  if (progress) {
    return (
      <aside className="rail" aria-label={progress.title}>
        <h3 className="rail-title">{progress.title}</h3>
        <ol className="progress-list">
          {progress.items.map((it) => (
            <li key={it.label} className={`${it.done ? 'done' : ''} ${it.current ? 'current' : ''}`}>
              <span className="tick" aria-hidden>
                {it.done ? '✓' : ''}
              </span>
              <span>{it.label}</span>
              {it.detail && <small>{it.detail}</small>}
            </li>
          ))}
        </ol>
      </aside>
    )
  }
  const theirs = kidColor === 'w' ? 'b' : 'w'
  const iTook = lost(fen, theirs)
  const theyTook = lost(fen, kidColor)
  const score = iTook.reduce((a, t) => a + VALUE[t], 0) - theyTook.reduce((a, t) => a + VALUE[t], 0)
  const caps = (list: Exclude<PieceSymbol, 'k'>[], lead: number) => (
    <span className="caps" aria-label={`captured: ${list.length ? list.join(', ') : 'nothing yet'}`}>
      {list.map((t) => GLYPH[t]).join('')}
      {lead > 0 && <em>+{lead}</em>}
    </span>
  )
  const rows: [PlayedMove | undefined, PlayedMove | undefined][] = []
  for (const m of moves) {
    if (m.color === 'w' || !rows.length) rows.push(m.color === 'w' ? [m, undefined] : [undefined, m])
    else rows[rows.length - 1][1] = m
  }
  const cell = (m?: PlayedMove) => {
    if (!m) return <span className="m" />
    const g = m.grade ? GRADE[m.grade] : null
    return (
      <span className={`m ${m.ply === moves.length - 1 ? 'latest' : ''}`} style={g ? { ['--g' as string]: g.color } : undefined} title={g?.label}>
        {m.san}
        {g && <i aria-hidden>{g.icon}</i>}
      </span>
    )
  }
  return (
    <aside className="rail" aria-label="Game details">
      <div className={`player ${turn !== kidColor ? 'turn' : ''}`}>
        <Avatar mood="idle" size={34} />
        <span>
          <b>Squarely</b>
          <small>Level {level} · plays {theirs === 'w' ? 'white' : 'black'}</small>
        </span>
        {caps(theyTook, -score)}
      </div>
      {opening && (
        <p className="rail-opening">
          Opening: <b>{opening}</b>
        </p>
      )}
      {moves.length ? (
        <ol className="move-table" ref={box} aria-label="Moves">
          {rows.map(([w, b], i) => (
            <li key={i}>
              <span className="n">{i + 1}.</span>
              {cell(w)}
              {cell(b)}
            </li>
          ))}
        </ol>
      ) : (
        <p className="rail-empty">Moves will show up here.</p>
      )}
      <div className={`player ${turn === kidColor ? 'turn' : ''}`}>
        <span className="player-dot" aria-hidden>
          {name[0]?.toUpperCase() ?? '♟'}
        </span>
        <span>
          <b>{name}</b>
          <small>Plays {kidColor === 'w' ? 'white' : 'black'}</small>
        </span>
        {caps(iTook, score)}
      </div>
    </aside>
  )
}
