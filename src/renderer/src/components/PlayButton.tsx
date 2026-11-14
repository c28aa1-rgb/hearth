import { AnimatePresence, motion } from 'motion/react'
import { Play, Square } from 'lucide-react'
import type { RunState } from '@shared/types'
import { quick, spring, standard } from '../lib/motion'

const R = 22
const C = 2 * Math.PI * R

function Ring({ fraction }: { fraction: number | null }) {
  return (
    <svg className={`ring ${fraction === null ? 'indeterminate' : ''}`} viewBox="0 0 52 52" aria-hidden>
      <circle cx="26" cy="26" r={R} className="ring-track" />
      <motion.circle
        cx="26" cy="26" r={R}
        className="ring-fill"
        strokeDasharray={C}
        animate={{ strokeDashoffset: fraction === null ? C * 0.72 : C * (1 - fraction) }}
        transition={standard}
      />
    </svg>
  )
}

/**
 * Play → progress ring while installing → quiet Stop while running.
 * The button keeps one identity and reshapes itself (layout animation).
 */
export function PlayButton({ state, onPlay, onStop }: {
  state?: RunState
  onPlay: () => void
  onStop: () => void
}) {
  const status = state?.status ?? 'idle'
  const p = state?.progress
  const fraction = p && p.total > 0 ? p.done / p.total : null

  return (
    <div className="play-row">
      <motion.button
        layout
        transition={spring}
        className={`play ${status}`}
        onClick={status === 'running' ? onStop : status === 'installing' ? undefined : onPlay}
        aria-label={status === 'running' ? 'Stop Minecraft' : status === 'installing' ? 'Installing' : 'Play'}
        aria-busy={status === 'installing'}
        whileTap={status === 'installing' ? undefined : { scale: 0.96 }}
      >
        <AnimatePresence mode="popLayout" initial={false}>
          {status === 'installing' ? (
            <motion.span key="ring" className="play-inner" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={quick}>
              <Ring fraction={fraction} />
            </motion.span>
          ) : status === 'running' ? (
            <motion.span key="stop" className="play-inner" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={quick}>
              <Square size={14} fill="currentColor" strokeWidth={0} /> Stop
            </motion.span>
          ) : (
            <motion.span key="play" className="play-inner" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={quick}>
              <Play size={17} fill="currentColor" strokeWidth={0} /> Play
            </motion.span>
          )}
        </AnimatePresence>
      </motion.button>

      <AnimatePresence mode="wait" initial={false}>
        {status === 'installing' && p && (
          <motion.div key={p.phase} className="play-status" initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} transition={quick}>
            <span>{p.label}</span>
            {p.total > 0 && <span className="muted tabular">{p.done.toLocaleString()} of {p.total.toLocaleString()}</span>}
          </motion.div>
        )}
        {status === 'running' && (
          <motion.div key="running" className="play-status" initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} transition={quick}>
            <span className="live-dot" aria-hidden /> <span>Playing</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
