import { Copy, FolderOpen, ImagePlus, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { InstanceView } from '@shared/types'
import { api } from '../lib/api'
import { BLOCK_NAMES, BLOCK_STYLES } from '../lib/blocks'
import { formatMemory } from '../lib/format'
import { useStore } from '../store'
import { ConfirmDialog } from './ConfirmDialog'
import { Segmented, Switch } from './controls'
import { BlockGlyph, InstanceIcon } from './InstanceIcon'

export function SettingsPanel({ instance }: { instance: InstanceView }) {
  const info = useStore((s) => s.info)
  const upsert = useStore((s) => s.upsertInstance)
  const attempt = useStore((s) => s.attempt)
  const select = useStore((s) => s.select)
  const removeInstance = useStore((s) => s.removeInstance)
  const running = useStore((s) => {
    const st = s.runStates[instance.id]?.status
    return st === 'running' || st === 'installing'
  })
  const [name, setName] = useState(instance.name)
  const [memory, setMemory] = useState(instance.memoryMb ?? instance.autoMemoryMb)
  const [confirmDelete, setConfirmDelete] = useState(false)

  useEffect(() => setName(instance.name), [instance.name])
  useEffect(() => setMemory(instance.memoryMb ?? instance.autoMemoryMb), [instance.memoryMb, instance.autoMemoryMb])

  const update = async (patch: Parameters<typeof api.instances.update>[1]) => {
    const view = await attempt(() => api.instances.update(instance.id, patch))
    if (view) upsert(view)
  }
  const saveName = () => {
    const next = name.trim()
    if (next && next !== instance.name) void update({ name: next })
    else setName(instance.name)
  }
  const pick = async (purpose: 'icon' | 'backdrop') => {
    const view = await attempt(() => api.instances.pickImage(instance.id, purpose))
    if (view) upsert(view)
  }

  const maxMemory = Math.max(2048, Math.floor(((info?.systemMemoryMb ?? 8192) * 0.75) / 512) * 512)
  const auto = instance.memoryMb === null
  const backdropKind = instance.backdrop.kind

  return (
    <div className="settings">
      <section className="setting">
        <label className="setting-label" htmlFor="inst-name">Name</label>
        <input
          id="inst-name"
          className="input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={saveName}
          onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
          maxLength={40}
        />
      </section>

      <section className="setting">
        <div className="setting-label">Memory</div>
        <div className="memory">
          <label className="inline">
            <Switch
              label="Choose memory automatically"
              checked={auto}
              onChange={(v) => void update({ memoryMb: v ? null : instance.autoMemoryMb })}
            />
            <span>Automatic</span>
          </label>
          <input
            type="range"
            className="slider"
            min={1024}
            max={maxMemory}
            step={512}
            value={memory}
            disabled={auto}
            onChange={(e) => setMemory(Number(e.target.value))}
            onPointerUp={() => void update({ memoryMb: memory })}
            onKeyUp={() => void update({ memoryMb: memory })}
            aria-label="Memory"
            style={{ '--fill': `${((memory - 1024) / (maxMemory - 1024)) * 100}%` } as React.CSSProperties}
          />
          <span className="memory-value tabular">{formatMemory(memory)}</span>
        </div>
        <p className="setting-help">
          {auto
            ? `Hearth picks ${formatMemory(instance.autoMemoryMb)} for this instance based on its mods and your Mac's memory.`
            : 'More memory helps large modpacks. Giving Minecraft too much can make your Mac slow.'}
        </p>
      </section>

      <section className="setting">
        <div className="setting-label">Backdrop</div>
        <div className="row-gap">
          <Segmented
            label="Backdrop"
            value={backdropKind}
            onChange={(v) => (v === 'file' ? void pick('backdrop') : void update({ backdrop: { kind: v } }))}
            options={[
              { value: 'auto', label: 'Latest screenshot' },
              { value: 'generated', label: 'Landscape' },
              { value: 'file', label: 'Image' }
            ]}
          />
          {backdropKind === 'file' && (
            <button className="btn quiet" onClick={() => void pick('backdrop')}><ImagePlus size={14} /> Change image</button>
          )}
        </div>
        {backdropKind === 'auto' && !instance.backdropUrl && (
          <p className="setting-help">Take a screenshot in game (F2) and it becomes this backdrop.</p>
        )}
      </section>

      <section className="setting">
        <div className="setting-label">Icon</div>
        <div className="icon-grid" role="radiogroup" aria-label="Icon">
          <button
            role="radio"
            aria-checked={instance.icon.kind === 'auto'}
            className="icon-choice"
            onClick={() => void update({ icon: { kind: 'auto' } })}
            title="Initial"
          >
            <InstanceIcon instance={{ ...instance, icon: { kind: 'auto' } }} size={28} />
          </button>
          {BLOCK_NAMES.map((n) => (
            <button
              key={n}
              role="radio"
              aria-checked={instance.icon.kind === 'block' && instance.icon.name === n}
              className="icon-choice"
              onClick={() => void update({ icon: { kind: 'block', name: n } })}
              title={n}
            >
              <BlockGlyph style={BLOCK_STYLES[n]} size={28} />
            </button>
          ))}
          <button
            role="radio"
            aria-checked={instance.icon.kind === 'file'}
            className="icon-choice"
            onClick={() => void pick('icon')}
            title="Choose an image"
          >
            {instance.icon.kind === 'file' ? <InstanceIcon instance={instance} size={28} /> : <ImagePlus size={18} />}
          </button>
        </div>
      </section>

      <section className="setting actions">
        <button className="btn" onClick={() => void attempt(() => api.instances.openFolder(instance.id))}>
          <FolderOpen size={14} /> Open folder
        </button>
        <button
          className="btn"
          onClick={async () => {
            const view = await attempt(() => api.instances.clone(instance.id))
            if (view) { upsert(view); select(view.id) }
          }}
        >
          <Copy size={14} /> Duplicate
        </button>
        <button className="btn danger" disabled={running} onClick={() => setConfirmDelete(true)}>
          <Trash2 size={14} /> Move to Trash
        </button>
      </section>

      <ConfirmDialog
        open={confirmDelete}
        title={`Move ${instance.name} to the Trash?`}
        body="Its worlds, mods and settings go to the macOS Trash. You can put them back from there until you empty it."
        confirm="Move to Trash"
        onCancel={() => setConfirmDelete(false)}
        onConfirm={async () => {
          setConfirmDelete(false)
          await attempt(() => removeInstance(instance.id))
        }}
      />
    </div>
  )
}
