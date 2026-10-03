// Accessible dialog: moves focus in, traps Tab, closes on Escape, restores focus on close.
import { useEffect, useRef, type KeyboardEvent, type ReactNode } from 'react'

// variant 'sheet': a tall, scrolling panel (bottom sheet on phones), closed by tapping outside.
type Props = { title: string; onClose?: () => void; children: ReactNode; variant?: 'card' | 'sheet' }

export function Modal({ title, onClose, children, variant = 'card' }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null
    const r = ref.current
    // A sheet is for browsing: focus its first button, never a text field (that would pop up the phone keyboard).
    const first = variant === 'sheet' ? r?.querySelector<HTMLElement>('button') : (r?.querySelector<HTMLElement>('input') ?? r?.querySelector<HTMLElement>('button, a, select'))
    first?.focus()
    return () => prev?.focus?.()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

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
    <div
      className={`modal ${variant === 'sheet' ? 'sheet-modal' : ''}`}
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onKeyDown={onKey}
      onClick={(e) => variant === 'sheet' && e.target === e.currentTarget && onClose?.()}
    >
      <div className={`card ${variant === 'sheet' ? 'sheet-card' : ''}`} ref={ref}>
        {children}
      </div>
    </div>
  )
}
