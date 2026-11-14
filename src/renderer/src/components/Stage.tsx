import { AnimatePresence, motion } from 'motion/react'
import { useEffect } from 'react'
import type { InstanceView } from '@shared/types'
import { relativeTime } from '../lib/format'
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

export function Stage({ instance }: { instance: InstanceView }) {
  const tab = useStore((s) => s.tab)
  const setTab = useStore((s) => s.setTab)
  const runState = useStore((s) => s.runStates[instance.id])
  const updates = useStore((s) => s.updates[instance.id])
  const checkUpdates = useStore((s) => s.checkUpdates)
  const attempt = useStore((s) => s.attempt)

  // Check for mod updates whenever an instance is opened. Never installs anything.
  useEffect(() => {
    if (instance.loader === 'fabric' && instance.mods.length) void checkUpdates(instance.id)
  }, [instance.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const enabledMods = instance.mods.filter((m) => m.enabled).length
  const meta = instance.loader === 'fabric'
    ? `Minecraft ${instance.mcVersion} with Fabric, ${enabledMods} ${enabledMods === 1 ? 'mod' : 'mods'}`
    : `Minecraft ${instance.mcVersion}`
  const played = relativeTime(instance.lastPlayedAt)

  return (
    <main className="stage">
      <Backdrop id={instance.id} url={instance.backdropUrl} raised={tab !== null} />
      <div className="scrim" aria-hidden />
      <div className="stage-titlebar drag" />

      <section className="hero">
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
      </section>

      <motion.div className="sheet-wrap" layout transition={spring}>
        <nav className="tabs" aria-label="Instance sections">
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
        </nav>
        <AnimatePresence initial={false}>
          {tab && (
            <motion.div
              key="sheet"
              className="sheet"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'min(54vh, 500px)', opacity: 1 }}
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
