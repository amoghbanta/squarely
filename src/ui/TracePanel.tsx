// Live agent trace for judges: every tool call and which role handled it, in plain English.
// "Show details" reveals the raw tool data for the technical crowd.
import { useEffect, useRef, useState } from 'react'
import type { TraceEntry } from '../game/controller'
import { humanize } from './traceText'

const ROLE_ICON: Record<string, string> = { Voice: '🎙️', Referee: '⚖️', Opponent: '♟️', Tutor: '💡', Memory: '🧠', Board: '🖼️', Scout: '🔭' }

export function TracePanel({ trace }: { trace: TraceEntry[] }) {
  const box = useRef<HTMLElement>(null)
  const [raw, setRaw] = useState(false)
  // Scroll the panel itself; scrollIntoView would drag the whole page down on phones.
  useEffect(() => {
    const el = box.current
    if (el) el.scrollTop = el.scrollHeight
  }, [trace.length])
  return (
    <section className="trace" aria-label="Agent trace" ref={box}>
      <h2>Agent trace</h2>
      <label className="trace-raw">
        <input type="checkbox" checked={raw} onChange={(e) => setRaw(e.target.checked)} /> Show details
      </label>
      <ol>
        {trace.map((e) => (
          <li key={e.id} className={`role-${e.role}`}>
            <span className="role">
              <span aria-hidden="true">{ROLE_ICON[e.role]} </span>
              {e.role}
            </span>
            <span className="title">{humanize(e)}</span>
            {e.ms !== undefined && <span className="ms">{Math.round(e.ms)}ms</span>}
            {raw && e.detail && <code>{e.detail.length > 400 ? `${e.detail.slice(0, 400)}…` : e.detail}</code>}
          </li>
        ))}
      </ol>
    </section>
  )
}
