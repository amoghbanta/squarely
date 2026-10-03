// iOS-style controls: segmented control, switch row, grouped list.
import type { ReactNode } from 'react'

type SegOption<T extends string | number> = { value: T; label: ReactNode; aria?: string }

export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  label,
}: {
  value: T
  options: SegOption<T>[]
  onChange: (v: T) => void
  label: string
}) {
  return (
    <div className="seg" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          aria-label={o.aria}
          className={o.value === value ? 'on' : ''}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function SwitchRow({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="row">
      <span className="row-text">
        <span>{label}</span>
        {hint && <small>{hint}</small>}
      </span>
      <input type="checkbox" role="switch" className="ios-switch" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  )
}

export function Group({ title, children, footer }: { title?: string; children: ReactNode; footer?: string }) {
  return (
    <section className="group">
      {title && <h3>{title}</h3>}
      <div className="group-body">{children}</div>
      {footer && <p className="group-foot">{footer}</p>}
    </section>
  )
}
