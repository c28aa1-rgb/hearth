import { AnimatePresence, motion } from 'motion/react'
import { X } from 'lucide-react'
import { exit, spring } from '../lib/motion'
import { useStore } from '../store'

export function Toast() {
  const toast = useStore((s) => s.toast)
  return (
    <div className="toast-host" aria-live="polite">
      <AnimatePresence>
        {toast && (
          <motion.div
            key={toast.id}
            className={`toast ${toast.kind}`}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0, transition: spring }}
            exit={{ opacity: 0, y: 8, transition: exit }}
          >
            <span>{toast.text}</span>
            <button className="btn quiet icon" aria-label="Dismiss" onClick={() => useStore.setState({ toast: undefined })}>
              <X size={14} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
