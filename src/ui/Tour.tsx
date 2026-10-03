import { useEffect, useLayoutEffect, useState } from 'react'

/** One stop on the first-run tour: what to light up, its caption, and the spoken word that moves the light there. */
export type TourStop = { sel: string; label: string; cue: RegExp }

export const TOUR_STOPS: TourStop[] = [
  { sel: '.mic-wrap', label: "That's me. Tap me to talk or to stop listening.", cue: /squarely/i },
  { sel: '.board-wrap', label: 'Drag a piece, or just say a move.', cue: /board|drag|move/i },
  { sel: '.topbar > .seg', label: 'Learn the pieces, play a game, or solve puzzles.', cue: /learn|play|puzzle/i },
  { sel: '.side', label: 'Every step the agent takes, live.', cue: /step|watch/i },
  { sel: '.mic-wrap', label: "Just talk. I'm listening.", cue: /name|ready|talk/i },
]

/** The script Squarely says while the light moves (about 10 seconds). */
export const TOUR_LINE = (name: string | null) =>
  `Hi, I'm Squarely! Here's our board: drag a piece, or just say a move. Up top, pick Learn, Play or Puzzles. Over here you can watch every step I take. ${
    name ? `Ready when you are, ${name}!` : "So, what's your name?"
  }`

const STEP_MS = 2300 // fallback pace when the transcript is late or in another language
const visible = (el: Element | null): el is HTMLElement => {
  if (!el) return false
  const r = el.getBoundingClientRect()
  return r.width > 0 && r.height > 0 && r.right > 0 && r.left < innerWidth && r.bottom > 0 && r.top < innerHeight && !el.closest('[inert]')
}

/**
 * A spotlight that follows Squarely's spoken tour: it moves when the words reach the next stop
 * (or on a steady fallback beat), and never blocks the page, so the player can start playing at once.
 */
export function Tour({ spoken, speaking, onStep, onDone }: { spoken: string; speaking: boolean; onStep?: (sel: string) => void; onDone: () => void }) {
  const stops = TOUR_STOPS.filter((s) => visible(document.querySelector(s.sel)))
  const [startedAt, setStartedAt] = useState<number | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const [rect, setRect] = useState<DOMRect | null>(null)

  // The clock starts when Squarely starts talking.
  useEffect(() => {
    if (speaking && startedAt === null) setStartedAt(Date.now())
  }, [speaking, startedAt])
  // If no voice arrives (slow network, mic prompt), walk through on the beat anyway.
  useEffect(() => {
    const t = setTimeout(() => setStartedAt((v) => v ?? Date.now()), 6000)
    return () => clearTimeout(t)
  }, [])
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 200)
    return () => clearInterval(t)
  }, [])

  // Furthest stop reached by the words so far, or by the fallback beat.
  let byWords = 0
  let rest = spoken
  stops.forEach((s, i) => {
    const m = rest.match(s.cue)
    if (m && m.index !== undefined) {
      byWords = i
      rest = rest.slice(m.index + m[0].length)
    }
  })
  const byClock = startedAt === null ? 0 : Math.floor((now - startedAt) / STEP_MS)
  const step = Math.min(stops.length - 1, Math.max(byWords, byClock))
  const stop = stops[step]
  const finished = startedAt !== null && ((!speaking && step === stops.length - 1) || now - startedAt > STEP_MS * (stops.length + 1))

  useEffect(() => {
    if (finished) onDone()
  }, [finished, onDone])
  useEffect(() => {
    if (stop) onStep?.(stop.sel)
  }, [stop, onStep])
  // Any tap or key ends the tour: the player wants to get going.
  useEffect(() => {
    const end = () => onDone()
    addEventListener('pointerdown', end, true)
    addEventListener('keydown', end, true)
    return () => {
      removeEventListener('pointerdown', end, true)
      removeEventListener('keydown', end, true)
    }
  }, [onDone])

  useLayoutEffect(() => {
    const el = stop && document.querySelector(stop.sel)
    setRect(el ? el.getBoundingClientRect() : null)
  }, [stop, now])

  if (!stop || !rect) return null
  const pad = 8
  const below = rect.bottom + 90 < innerHeight
  const tipW = Math.min(280, innerWidth - 32)
  const tipLeft = Math.max(16, Math.min(innerWidth - tipW - 16, rect.left + rect.width / 2 - tipW / 2))
  return (
    <div className="tour" aria-hidden>
      <div className="tour-ring" style={{ top: rect.top - pad, left: rect.left - pad, width: rect.width + pad * 2, height: rect.height + pad * 2 }} />
      <div
        key={step}
        className="tour-tip"
        style={{ width: tipW, left: tipLeft, ...(below ? { top: rect.bottom + pad + 12 } : { bottom: innerHeight - rect.top + pad + 12 }) }}
      >
        {stop.label}
        <span className="tour-dots">
          {stops.map((_, i) => (
            <i key={i} className={i === step ? 'on' : ''} />
          ))}
        </span>
      </div>
    </div>
  )
}
