import { MotionConfig, motion } from 'motion/react'
import { Plus } from 'lucide-react'
import { useEffect } from 'react'
import { Backdrop } from './components/Backdrop'
import { NewInstanceDialog } from './components/NewInstanceDialog'
import { Sidebar } from './components/Sidebar'
import { Stage } from './components/Stage'
import { Toast } from './components/Toast'
import { spring } from './lib/motion'
import { useSelected, useStore } from './store'

export function App() {
  const ready = useStore((s) => s.ready)
  const init = useStore((s) => s.init)
  const selected = useSelected()

  useEffect(() => { void init() }, [init])

  return (
    // reducedMotion="user": with macOS Reduce motion on, movement becomes plain fades.
    <MotionConfig reducedMotion="user">
      <div className="app">
        <Sidebar />
        {selected ? <Stage instance={selected} /> : ready ? <Welcome /> : <main className="stage" />}
        <NewInstanceDialog />
        <Toast />
      </div>
    </MotionConfig>
  )
}

function Welcome() {
  const setNewDialog = useStore((s) => s.setNewDialog)
  return (
    <main className="stage">
      <Backdrop id="hearth-welcome" raised={false} />
      <div className="scrim" aria-hidden />
      <div className="stage-titlebar drag" />
      <motion.section className="hero" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ ...spring, delay: 0.2 }}>
        <div className="hero-text">
          <h1 className="hero-title">Welcome to Hearth</h1>
          <p className="hero-meta"><span>An instance is its own Minecraft setup, with a version, mods and worlds that stay separate from the rest.</span></p>
        </div>
        <button className="btn accent big" onClick={() => setNewDialog(true)}>
          <Plus size={16} /> Create instance
        </button>
      </motion.section>
    </main>
  )
}
