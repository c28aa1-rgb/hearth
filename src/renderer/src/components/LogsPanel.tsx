import { Check, Copy } from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { InstanceView } from '@shared/types'
import { useStore } from '../store'
import { Segmented } from './controls'

const RENDER_LIMIT = 1500

export function LogsPanel({ instance }: { instance: InstanceView }) {
  const lines = useStore((s) => s.logs[instance.id])
  const loadLogs = useStore((s) => s.loadLogs)
  const crashed = useStore((s) => s.runStates[instance.id]?.status === 'crashed')
  const [filter, setFilter] = useState<'all' | 'problems'>(crashed ? 'problems' : 'all')
  const [copied, setCopied] = useState(false)
  const scroller = useRef<HTMLDivElement>(null)
  const stick = useRef(true)

  useEffect(() => { void loadLogs(instance.id) }, [instance.id, loadLogs])

  const all = lines ?? []
  const shown = (filter === 'problems' ? all.filter((l) => l.level !== 'info') : all).slice(-RENDER_LIMIT)

  useLayoutEffect(() => {
    const el = scroller.current
    if (el && stick.current) el.scrollTop = el.scrollHeight
  }, [shown.length, filter])

  const copy = async () => {
    await navigator.clipboard.writeText(all.map((l) => l.text).join('\n'))
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="logs">
      <div className="panel-head">
        <Segmented
          label="Log filter"
          value={filter}
          onChange={setFilter}
          options={[{ value: 'all', label: 'Everything' }, { value: 'problems', label: 'Errors and warnings' }]}
        />
        <button className="btn quiet" onClick={copy} disabled={!all.length}>
          {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? 'Copied' : 'Copy log'}
        </button>
      </div>
      <div
        className="log-view"
        ref={scroller}
        onScroll={(e) => {
          const el = e.currentTarget
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40
        }}
      >
        {shown.length === 0 ? (
          <p className="log-empty">
            {all.length === 0 ? 'Press Play and the game’s output appears here.' : 'No errors or warnings.'}
          </p>
        ) : (
          shown.map((l, i) => (
            <div key={i} className={`log-line ${l.level}`}>{l.text}</div>
          ))
        )}
      </div>
    </div>
  )
}
