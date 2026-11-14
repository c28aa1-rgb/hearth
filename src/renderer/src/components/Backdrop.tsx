import { AnimatePresence, motion } from 'motion/react'
import { memo, useMemo, useRef } from 'react'
import { generateScene, SCENE_H, SCENE_W } from '../lib/landscape'
import { slow } from '../lib/motion'

export const Landscape = memo(function Landscape({ seed }: { seed: string }) {
  const scene = useMemo(() => generateScene(seed), [seed])
  const gid = `sky-${seed.replace(/[^a-z0-9]/gi, '')}`
  return (
    <svg className="landscape" viewBox={`0 0 ${SCENE_W} ${SCENE_H}`} preserveAspectRatio="xMidYMax slice" aria-hidden>
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={scene.sky[0]} />
          <stop offset="0.55" stopColor={scene.sky[1]} />
          <stop offset="0.85" stopColor={scene.sky[2]} />
        </linearGradient>
        <radialGradient id={`${gid}-glow`}>
          <stop offset="0" stopColor={scene.light.color} stopOpacity="0.55" />
          <stop offset="1" stopColor={scene.light.color} stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width={SCENE_W} height={SCENE_H} fill={`url(#${gid})`} />
      {scene.stars.map((s, i) => (
        <circle key={i} cx={s.x} cy={s.y} r={s.r} fill="#fff" opacity={s.o} />
      ))}
      <circle cx={scene.light.x} cy={scene.light.y} r={scene.light.r * 5} fill={`url(#${gid}-glow)`} />
      <circle cx={scene.light.x} cy={scene.light.y} r={scene.light.r} fill={scene.light.color} />
      {scene.ridges.map((r, i) => (
        <g key={i} className="ridge" style={{ animationDuration: `${r.period}s` }}>
          <path d={r.path} fill={r.color} />
        </g>
      ))}
    </svg>
  )
})

/**
 * The hero image: the instance's screenshot or its generated landscape.
 * Switching instance fades the new scene in over the old one and lets it settle.
 */
export function Backdrop({ id, url, raised }: { id: string; url?: string; raised: boolean }) {
  const key = url ?? `scene:${id}`
  // Each new scene stacks above the one it replaces, so the crossfade reads as "arriving".
  const order = useRef({ n: 0, z: new Map<string, number>() })
  if (!order.current.z.has(key)) order.current.z.set(key, ++order.current.n)
  return (
    <motion.div
      className="backdrop"
      animate={{ scale: raised ? 1.03 : 1, y: raised ? '-20%' : '0%' }}
      transition={{ type: 'spring', stiffness: 160, damping: 30 }}
    >
      <AnimatePresence initial={false}>
        <motion.div
          key={key}
          className="backdrop-layer"
          style={{ zIndex: order.current.z.get(key) }}
          initial={{ opacity: 0, scale: 1.04 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.5, delay: 0.2 } }}
          transition={slow}
        >
          {url ? <img src={url} alt="" draggable={false} /> : <Landscape seed={id} />}
        </motion.div>
      </AnimatePresence>
    </motion.div>
  )
}
