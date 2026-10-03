// Accessible dialog: moves focus in, traps Tab, closes on Escape, restores focus on close.
import { useEffect, useRef, type KeyboardEvent, type ReactNode } from 'react'

type Props = { title: string; onClose?: () => void; children: ReactNode }

export function Modal({ title, onClose, children }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null
    const r = ref.current
    ;(r?.querySelector<HTMLElement>('input') ?? r?.querySelector<HTMLElement>('button, a, select'))?.focus()
    return () => prev?.focus?.()
  }, [])

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && onClose) {
      e.stopPropagation()
      onClose()
    }
    if (e.key !== 'Tab' || !ref.current) return
    const els = [...ref.current.querySelectorAll<HTMLElement>('input, button, a, select')].filter((el) => !el.hasAttribute('disabled'))
    if (!els.length) return
    const first = els[0]
    const last = els[els.length - 1]
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault()
      first.focus()
    }
  }

  return (
    <div className="modal" role="dialog" aria-modal="true" aria-label={title} onKeyDown={onKey}>
      <div className="card" ref={ref}>
        {children}
      </div>
    </div>
  )
}
