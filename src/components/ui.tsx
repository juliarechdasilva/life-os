import { X } from 'lucide-react'
import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { CATEGORY_COLORS, COLOR_LABEL } from '../lib/defaults'
import { closeConfirm, dismissToast, useConfirmReq, useToasts } from '../lib/ui'

export function Leaf({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <path d="M15.2 27.5C9 26.6 4.6 21.6 4.5 13.6c0-1.2.1-2.4.3-3.7 6.7 1.6 10.6 6.8 10.7 13.5 0 1.4-.1 2.8-.3 4.1Z" fill="currentColor" opacity=".55" />
      <path d="M16.8 27.5c6.2-.9 10.6-5.9 10.7-13.9 0-1.2-.1-2.4-.3-3.7-6.7 1.6-10.6 6.8-10.7 13.5 0 1.4.1 2.8.3 4.1Z" fill="currentColor" />
      <path d="M16 28V12.5" stroke="var(--surface)" strokeWidth="0" />
    </svg>
  )
}

export function Logo({ size = 24 }: { size?: number }) {
  return (
    <span className="row" style={{ gap: 8 }}>
      <Leaf size={size + 6} />
      <span className="serif" style={{ fontSize: size }}>
        Life OS
      </span>
    </span>
  )
}

export function Modal({
  title,
  onClose,
  children,
  footer,
  wide,
  labelledBy,
}: {
  title?: ReactNode
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  wide?: boolean
  labelledBy?: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const id = useId()
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null
    const el = ref.current
    const first = el?.querySelector<HTMLElement>('[autofocus], input, textarea, select, button:not(.icon-btn)')
    first?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
      if (e.key === 'Tab' && el) {
        const f = [...el.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter((x) => !x.hasAttribute('disabled'))
        if (!f.length) return
        if (e.shiftKey && document.activeElement === f[0]) {
          e.preventDefault()
          f[f.length - 1].focus()
        } else if (!e.shiftKey && document.activeElement === f[f.length - 1]) {
          e.preventDefault()
          f[0].focus()
        }
      }
    }
    document.addEventListener('keydown', onKey)
    const ov = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ov
      prev?.focus?.()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} className={`modal${wide ? ' wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby={labelledBy ?? id}>
        {title != null && (
          <div className="modal-head">
            <h2 id={id}>{title}</h2>
            <button className="icon-btn" onClick={onClose} aria-label="Fechar">
              <X size={20} />
            </button>
          </div>
        )}
        {children}
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  )
}

export function ConfirmHost() {
  const req = useConfirmReq()
  const [val, setVal] = useState('')
  useEffect(() => setVal(''), [req])
  if (!req) return null
  if (req.input)
    return (
      <Modal title={req.title} onClose={() => closeConfirm(false)}>
        <form onSubmit={(e) => (e.preventDefault(), val && closeConfirm(val))} className="stack">
          {req.body && <p className="muted" style={{ whiteSpace: 'pre-line' }}>{req.body}</p>}
          <input className="input" type={req.input.type} autoFocus value={val} onChange={(e) => setVal(e.target.value)} aria-label={req.input.label} placeholder={req.input.label} />
          <div className="modal-foot">
            <button type="button" className="btn ghost" onClick={() => closeConfirm(false)}>
              Cancelar
            </button>
            <button type="submit" className="btn primary" disabled={!val}>
              {req.confirmLabel ?? 'Continuar'}
            </button>
          </div>
        </form>
      </Modal>
    )
  return (
    <Modal title={req.title} onClose={() => closeConfirm(false)}>
      {req.body && <p className="muted" style={{ whiteSpace: 'pre-line' }}>{req.body}</p>}
      <div className="modal-foot">
        <button className="btn ghost" onClick={() => closeConfirm(false)}>
          Cancelar
        </button>
        {req.options ? (
          req.options.map((o, i) => (
            <button key={o.value} className={`btn ${i === req.options!.length - 1 ? (req.danger ? 'danger solid' : 'primary') : ''}`} onClick={() => closeConfirm(o.value)}>
              {o.label}
            </button>
          ))
        ) : (
          <button className={`btn ${req.danger ? 'danger solid' : 'primary'}`} onClick={() => closeConfirm(true)} autoFocus>
            {req.confirmLabel ?? 'Confirmar'}
          </button>
        )}
      </div>
    </Modal>
  )
}

export function Toasts() {
  const list = useToasts()
  return (
    <div className="toasts" role="status" aria-live="polite">
      {list.map((t) => (
        <div key={t.id} className={`toast ${t.kind}`}>
          <span>{t.text}</span>
          {t.action && (
            <button
              className="act"
              onClick={() => {
                t.action!.run()
                dismissToast(t.id)
              }}
            >
              {t.action.label}
            </button>
          )}
          <button className="x" onClick={() => dismissToast(t.id)} aria-label="Fechar aviso">
            <X size={16} />
          </button>
        </div>
      ))}
    </div>
  )
}

export function Empty({ icon, title, children, action, compact }: { icon?: ReactNode; title: string; children?: ReactNode; action?: ReactNode; compact?: boolean }) {
  return (
    <div className={`empty${compact ? ' compact' : ''}`}>
      {icon && <div className="art">{icon}</div>}
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action}
    </div>
  )
}

export function Field({ label, children, error, hint, className }: { label: string; children: ReactNode; error?: string; hint?: string; className?: string }) {
  return (
    <label className={`field ${className ?? ''}`}>
      <span>{label}</span>
      {children}
      {error ? <span className="error" role="alert">{error}</span> : hint ? <span className="hint">{hint}</span> : null}
    </label>
  )
}

export function Seg<T extends string>({ value, onChange, options, full, label }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode }[]; full?: boolean; label: string }) {
  return (
    <div className={`seg${full ? ' full' : ''}`} role="tablist" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} role="tab" aria-selected={value === o.value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Tabs<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode }[]; label: string }) {
  return (
    <div className="tabs" role="tablist" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} role="tab" aria-selected={value === o.value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; disabled?: boolean }) {
  return (
    <label className="switch">
      <input type="checkbox" role="switch" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  )
}

export function Progress({ value, color, over }: { value: number; color?: string; over?: boolean }) {
  return (
    <div className={`progress${over ? ' over' : ''}`} data-c={color} role="progressbar" aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={100}>
      <i style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  )
}

export function Ring({ value, label }: { value: number; label?: string }) {
  return (
    <div className="ring" style={{ ['--p' as string]: value }} role="img" aria-label={label ?? `${value}%`}>
      <span>{Math.round(value)}%</span>
    </div>
  )
}

const WD = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S']
const WD_LONG = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado']

export function WeekdayPick({ value, onChange, weekStart = 0 }: { value: number[]; onChange: (v: number[]) => void; weekStart?: 0 | 1 }) {
  const order = weekStart === 1 ? [1, 2, 3, 4, 5, 6, 0] : [0, 1, 2, 3, 4, 5, 6]
  return (
    <div className="weekday-pick" role="group" aria-label="Dias da semana">
      {order.map((d) => (
        <button
          type="button"
          key={d}
          aria-pressed={value.includes(d)}
          aria-label={WD_LONG[d]}
          onClick={() => onChange(value.includes(d) ? value.filter((x) => x !== d) : [...value, d].sort())}
        >
          {WD[d]}
        </button>
      ))}
    </div>
  )
}

export function ColorPick({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="color-pick" role="group" aria-label="Cor">
      {CATEGORY_COLORS.map((c) => (
        <button type="button" key={c} data-c={c} aria-pressed={value === c} aria-label={COLOR_LABEL[c]} title={COLOR_LABEL[c]} onClick={() => onChange(c)} />
      ))}
    </div>
  )
}

export function Menu({ trigger, items, label = 'Mais opções' }: { trigger: ReactNode; items: { label: string; icon?: ReactNode; onClick: () => void; danger?: boolean }[]; label?: string }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const h = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false)
    const k = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', h)
    document.addEventListener('keydown', k)
    return () => {
      document.removeEventListener('mousedown', h)
      document.removeEventListener('keydown', k)
    }
  }, [open])
  return (
    <div className="menu" ref={ref}>
      <button className="icon-btn sm" aria-label={label} aria-haspopup="menu" aria-expanded={open} onClick={(e) => (e.stopPropagation(), setOpen((o) => !o))}>
        {trigger}
      </button>
      {open && (
        <div className="menu-pop" role="menu">
          {items.map((it) => (
            <button
              key={it.label}
              role="menuitem"
              className={it.danger ? 'danger' : ''}
              onClick={(e) => {
                e.stopPropagation()
                setOpen(false)
                it.onClick()
              }}
            >
              {it.icon}
              {it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export function Card({ title, action, children, className, soft }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string; soft?: boolean }) {
  return (
    <section className={`card${soft ? ' soft' : ''} ${className ?? ''}`}>
      {(title || action) && (
        <div className="card-head">
          {typeof title === 'string' ? <h2>{title}</h2> : title}
          {action}
        </div>
      )}
      {children}
    </section>
  )
}

/** Campo de tags separadas por vírgula. */
export function TagInput({ value, onChange, placeholder }: { value: string[]; onChange: (v: string[]) => void; placeholder?: string }) {
  const [text, setText] = useState(value.join(', '))
  useEffect(() => setText(value.join(', ')), [value.join('|')]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <input
      className="input"
      value={text}
      placeholder={placeholder ?? 'ex.: rotina, estudos'}
      onChange={(e) => setText(e.target.value)}
      onBlur={() =>
        onChange(
          [...new Set(text.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean))],
        )
      }
    />
  )
}
