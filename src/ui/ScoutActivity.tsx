// Floating card that shows the Scout working in the background, on every tab, so the player
// always knows something is happening. Shows a short "done" state, then gets out of the way.
import { useEffect, useRef, useState } from 'react'
import type { ScoutReport } from '../scout/scout'

type Props = { scouting: boolean; progress: string; report: ScoutReport | null; onOpen: () => void }

export function ScoutActivity({ scouting, progress, report, onOpen }: Props) {
  const [done, setDone] = useState(false)
  const was = useRef(scouting)
  useEffect(() => {
    if (was.current && !scouting && report) {
      setDone(true)
      const t = setTimeout(() => setDone(false), 9000)
      was.current = scouting
      return () => clearTimeout(t)
    }
    was.current = scouting
  }, [scouting, report])

  if (!scouting && !done) return null
  const m = progress.match(/(\d+)\s*(?:\/|of)\s*(\d+)/)
  const frac = scouting ? (m ? Number(m[1]) / Number(m[2]) : null) : 1
  const text = scouting
    ? progress.replace(/^Reviewed game (\d+)\/(\d+)/, 'Reviewed game $1 of $2') || 'Getting started…'
    : (report?.plan?.headline ?? `Studied ${report?.games ?? 0} games`)

  return (
    <button type="button" className={`scout-activity ${scouting ? 'working' : 'done'}`} onClick={onOpen} aria-label="Open the Scout report">
      <span className="scout-icon" aria-hidden>
        <svg viewBox="0 0 40 40" width="34" height="34">
          <circle cx="17" cy="17" r="10" fill="none" stroke="currentColor" strokeWidth="3.5" />
          <path d="M25 25 L34 34" stroke="currentColor" strokeWidth="4" strokeLinecap="round" />
          <circle cx="14" cy="14" r="3" fill="currentColor" opacity=".35" />
        </svg>
      </span>
      <span className="scout-text">
        <strong>{scouting ? 'Scout is studying your games' : 'Scout finished!'}</strong>
        <span className="scout-step">{text}</span>
        <span className={`scout-bar ${frac === null ? 'indeterminate' : ''}`}>
          <span style={frac === null ? undefined : { width: `${Math.max(6, frac * 100)}%` }} />
        </span>
      </span>
    </button>
  )
}
