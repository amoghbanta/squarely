// The game so far as a scrolling row of chips, each coloured by its engine grade.
import { useEffect, useRef } from 'react'
import type { PlayedMove } from '../game/controller'
import { GRADE } from './grades'

export function MoveStrip({ moves, kidColor }: { moves: PlayedMove[]; kidColor: 'w' | 'b' }) {
  const box = useRef<HTMLOListElement>(null)
  useEffect(() => {
    const el = box.current
    if (el) el.scrollLeft = el.scrollWidth
  }, [moves.length])
  if (!moves.length) return null
  return (
    <ol className="move-strip" ref={box} aria-label="Moves so far">
      {moves.map((m) => {
        const g = m.grade ? GRADE[m.grade] : null
        const who = m.color === kidColor ? 'You' : 'Squarely'
        return (
          <li
            key={m.ply}
            className={`mv ${m.color === kidColor ? 'mine' : 'theirs'} ${m.ply === moves.length - 1 ? 'latest' : ''}`}
            style={g ? { ['--g' as string]: g.color } : undefined}
            aria-label={`${who}: ${m.san}${g ? `, ${g.label}` : ''}`}
          >
            {m.ply % 2 === 0 && <span className="num">{m.ply / 2 + 1}.</span>}
            <span className="san">{m.san}</span>
            {g && <span className="gi" aria-hidden>{g.icon}</span>}
          </li>
        )
      })}
    </ol>
  )
}
