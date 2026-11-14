import { motion } from 'motion/react'
import { Plus } from 'lucide-react'
import { loaderLabel } from '../lib/format'
import { spring } from '../lib/motion'
import { useStore } from '../store'
import { AccountMenu } from './AccountMenu'
import { InstanceIcon } from './InstanceIcon'

export function Sidebar() {
  const instances = useStore((s) => s.instances)
  const selectedId = useStore((s) => s.selectedId)
  const runStates = useStore((s) => s.runStates)
  const select = useStore((s) => s.select)
  const setNewDialog = useStore((s) => s.setNewDialog)

  return (
    <aside className="sidebar">
      <div className="sidebar-top drag" />
      <nav className="instance-list" aria-label="Instances">
        {instances.map((inst) => {
          const status = runStates[inst.id]?.status
          const active = inst.id === selectedId
          return (
            <button
              key={inst.id}
              className={`instance-row ${active ? 'active' : ''}`}
              onClick={() => select(inst.id)}
              aria-current={active ? 'true' : undefined}
            >
              {active && <motion.span layoutId="row-highlight" className="row-highlight" transition={spring} />}
              <InstanceIcon instance={inst} size={30} />
              <span className="instance-text">
                <span className="instance-name">{inst.name}</span>
                <span className="instance-sub">{inst.mcVersion} {loaderLabel(inst.loader)}</span>
              </span>
              {(status === 'running' || status === 'installing') && (
                <span className={`row-dot ${status}`} aria-label={status === 'running' ? 'Running' : 'Installing'} />
              )}
            </button>
          )
        })}
      </nav>
      <div className="sidebar-bottom">
        <button className="btn quiet new-btn" onClick={() => setNewDialog(true)}>
          <Plus size={16} /> New instance
        </button>
        <AccountMenu />
      </div>
    </aside>
  )
}
