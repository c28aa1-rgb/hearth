import { motion } from 'motion/react'
import { useId } from 'react'
import { quick, spring } from '../lib/motion'

export function Segmented<T extends string>({ value, options, onChange, label }: {
  value: T
  options: { value: T; label: string; disabled?: boolean; title?: string }[]
  onChange: (value: T) => void
  label: string
}) {
  const id = useId()
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map((o) => (
        <button
          type="button"
          key={o.value}
          aria-pressed={o.value === value}
          aria-disabled={o.disabled || undefined}
          title={o.title}
          onClick={() => { if (!o.disabled) onChange(o.value) }}
        >
          {o.value === value && <motion.div layoutId={`seg-${id}`} className="seg-pill" transition={spring} />}
          <span>{o.label}</span>
        </button>
      ))}
    </div>
  )
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button role="switch" aria-checked={checked} aria-label={label} className="switch" onClick={() => onChange(!checked)}>
      <motion.span className="knob" animate={{ x: checked ? 14 : 0 }} transition={quick} />
    </button>
  )
}

export function Spinner({ size = 14 }: { size?: number }) {
  return (
    <svg className="spinner" width={size} height={size} viewBox="0 0 16 16" aria-hidden>
      <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2" />
      <path d="M8 2 a6 6 0 0 1 6 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}
