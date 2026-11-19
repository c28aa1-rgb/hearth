import { AnimatePresence, motion } from 'motion/react'
import { ChevronDown, Maximize2, Minimize2 } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import type { InstanceView } from '@shared/types'
import { loaderLabel, relativeTime } from '../lib/format'
import { api } from '../lib/api'
import { quick, spring } from '../lib/motion'
import { useStore, type Tab } from '../store'
import { Backdrop } from './Backdrop'
import { LogsPanel } from './LogsPanel'
import { ModsPanel } from './ModsPanel'
import { PlayButton } from './PlayButton'
import { SettingsPanel } from './SettingsPanel'

const TABS: { id: Tab; label: string }[] = [
  { id: 'mods', label: 'Mods' },
  { id: 'settings', label: 'Settings' },
  { id: 'logs', label: 'Logs' }
]

/** Room left above an expanded sheet: the title strip that holds the window controls. */
const TITLE_STRIP = 52
/** Tab bar plus the two hairlines around it. */
const TAB_BAR = 44

function useHeight(ref: RefObject<HTMLElement | null>): number {
  const [height, setHeight] = useState(() => window.innerHeight)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new ResizeObserver(() => setHeight(el.clientHeight))
    observer.observe(el)
    setHeight(el.clientHeight)
    return () => observer.disconnect()
  }, [ref])
  return height
}

export function Stage({ instance }: { instance: InstanceView }) {
  const tab = useStore((s) => s.tab)
  const setTab = useStore((s) => s.setTab)
  const sheetFull = useStore((s) => s.sheetFull)
  const setSheetFull = useStore((s) => s.setSheetFull)
  const stageRef = useRef<HTMLElement>(null)
  const stageHeight = useHeight(stageRef)
  const full = tab !== null && sheetFull
  const sheetHeight = full ? Math.max(stageHeight - TITLE_STRIP - TAB_BAR, 200) : Math.min(stageHeight * 0.54, 500)
  const runState = useStore((s) => s.runStates[instance.id])
  const updates = useStore((s) => s.updates[instance.id])
  const checkUpdates = useStore((s) => s.checkUpdates)
  const attempt = useStore((s) => s.attempt)

  // Check for mod updates whenever an instance is opened. Never installs anything.
  useEffect(() => {
    if (instance.loader !== 'vanilla' && instance.mods.length) void checkUpdates(instance.id)
  }, [instance.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const enabledMods = instance.mods.filter((m) => m.enabled).length
  const meta = instance.loader !== 'vanilla'
    ? `Minecraft ${instance.mcVersion} with ${loaderLabel(instance.loader)}, ${enabledMods} ${enabledMods === 1 ? 'mod' : 'mods'}`
    : `Minecraft ${instance.mcVersion}`
  const played = relativeTime(instance.lastPlayedAt)

  return (
    <main className="stage" ref={stageRef}>
      <Backdrop id={instance.id} url={instance.backdropUrl} raised={tab !== null} />
      <div className="scrim" aria-hidden />
      <div className="stage-titlebar drag">
        <AnimatePresence>
          {full && (
            <motion.div
              className="compact-title"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0, transition: { ...quick, delay: 0.1 } }}
              exit={{ opacity: 0, transition: { duration: 0.1 } }}
            >
              <span className="compact-name">{instance.name}</span>
              <span className="muted">{meta}</span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <motion.section
        className="hero"
        animate={{ opacity: full ? 0 : 1 }}
        transition={full ? { duration: 0.12 } : { ...quick, delay: 0.15 }}
        style={{ pointerEvents: full ? 'none' : undefined }}
        aria-hidden={full || undefined}
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={instance.id}
            className="hero-text"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0, transition: { ...spring, delay: 0.12 } }}
            exit={{ opacity: 0, y: -6, transition: quick }}
          >
            <h1 className="hero-title">{instance.name}</h1>
            <p className="hero-meta">
              <span>{meta}</span>
              {played && <span className="muted">Last played {played}</span>}
            </p>
          </motion.div>
        </AnimatePresence>

        <PlayButton
          state={runState}
          onPlay={() => void attempt(() => api.launch.start(instance.id))}
          onStop={() => void attempt(() => api.launch.stop(instance.id))}
        />
      </motion.section>

      <motion.div className="sheet-wrap" layout transition={spring}>
        <nav
          className="tabs"
          aria-label="Instance sections"
          onDoubleClick={(e) => { if (tab && e.target === e.currentTarget) setSheetFull(!sheetFull) }}
        >
          {TABS.map((t) => (
            <button
              key={t.id}
              className={`tab ${tab === t.id ? 'active' : ''}`}
              aria-expanded={tab === t.id}
              onClick={() => setTab(tab === t.id ? null : t.id)}
            >
              {t.label}
              {t.id === 'mods' && updates && updates.length > 0 && <span className="tab-badge">{updates.length}</span>}
              {t.id === 'logs' && runState?.status === 'crashed' && <span className="tab-badge alert">!</span>}
              {tab === t.id && <motion.span layoutId="tab-underline" className="tab-underline" transition={spring} />}
            </button>
          ))}
          <AnimatePresence>
            {tab && (
              <motion.div
                className="sheet-controls"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1, transition: quick }}
                exit={{ opacity: 0, transition: { duration: 0.1 } }}
              >
                <button
                  className="btn quiet icon"
                  onClick={() => setSheetFull(!sheetFull)}
                  aria-label={sheetFull ? 'Restore panel size' : 'Expand panel'}
                  title={sheetFull ? 'Restore' : 'Expand'}
                >
                  {sheetFull ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
                </button>
                <button className="btn quiet icon" onClick={() => setTab(null)} aria-label="Minimize panel" title="Minimize">
                  <ChevronDown size={16} />
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </nav>
        <AnimatePresence initial={false}>
          {tab && (
            <motion.div
              key="sheet"
              className="sheet"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: sheetHeight, opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={spring}
            >
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={tab + instance.id}
                  className="sheet-body"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, transition: { duration: 0.1 } }}
                  transition={quick}
                >
                  {tab === 'mods' && <ModsPanel instance={instance} />}
                  {tab === 'settings' && <SettingsPanel instance={instance} />}
                  {tab === 'logs' && <LogsPanel instance={instance} />}
                </motion.div>
              </AnimatePresence>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </main>
  )
}
