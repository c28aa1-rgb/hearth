import { useMemo } from 'react'
import type { InstanceView } from '@shared/types'
import { BLOCK_STYLES, type BlockStyle } from '../lib/blocks'
import { generateScene } from '../lib/landscape'

export function BlockGlyph({ style, size }: { style: BlockStyle; size: number }) {
  // Isometric cube: top rhombus, two side faces, optional band under the top (grass, snow).
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <path d="M16 3 L29 10 L16 17 L3 10 Z" fill={style.top} />
      <path d="M3 10 L16 17 L16 30 L3 23 Z" fill={style.left} />
      <path d="M29 10 L16 17 L16 30 L29 23 Z" fill={style.right} />
      {style.band && (
        <>
          <path d="M3 10 L16 17 L16 20 L3 13 Z" fill={style.band} />
          <path d="M29 10 L16 17 L16 20 L29 13 Z" fill={style.band} opacity={0.85} />
        </>
      )}
    </svg>
  )
}

export function InstanceIcon({ instance, size = 28 }: { instance: InstanceView; size?: number }) {
  const accent = useMemo(() => generateScene(instance.id).accent, [instance.id])
  const { icon } = instance

  if (icon.kind === 'file' && instance.iconUrl) {
    return <img className="inst-icon" src={instance.iconUrl} width={size} height={size} alt="" style={{ borderRadius: size * 0.25 }} />
  }
  if (icon.kind === 'block' && BLOCK_STYLES[icon.name]) {
    return <span className="inst-icon"><BlockGlyph style={BLOCK_STYLES[icon.name]} size={size} /></span>
  }
  return (
    <span
      className="inst-icon auto"
      style={{ width: size, height: size, background: accent, borderRadius: size * 0.25, fontSize: size * 0.48 }}
      aria-hidden
    >
      {instance.name.trim().charAt(0).toUpperCase() || '?'}
    </span>
  )
}
