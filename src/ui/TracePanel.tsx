// Live agent trace for judges: every tool call and which role handled it.
import { useEffect, useRef } from 'react'
import type { TraceEntry } from '../game/controller'

export function TracePanel({ trace }: { trace: TraceEntry[] }) {
  const box = useRef<HTMLElement>(null)
  // Scroll the panel itself; scrollIntoView would drag the whole page down on phones.
  useEffect(() => {
    const el = box.current
    if (el) el.scrollTop = el.scrollHeight
  }, [trace.length])
  return (
    <section className="trace" aria-label="Agent trace" ref={box}>
      <h2>Agent trace</h2>
      <ol>
        {trace.map((e) => (
          <li key={e.id} className={`role-${e.role}`}>
            <span className="role">{e.role}</span>
            <span className="title">{e.title}</span>
            {e.ms !== undefined && <span className="ms">{Math.round(e.ms)}ms</span>}
            {e.detail && <code>{e.detail.length > 220 ? `${e.detail.slice(0, 220)}…` : e.detail}</code>}
          </li>
        ))}
      </ol>
    </section>
  )
}
