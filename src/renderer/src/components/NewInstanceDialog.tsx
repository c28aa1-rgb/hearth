import { useEffect, useMemo, useState } from 'react'
import type { Loader, McVersion } from '@shared/types'
import { api } from '../lib/api'
import { useStore } from '../store'
import { Segmented, Spinner, Switch } from './controls'
import { Dialog } from './Dialog'

export function NewInstanceDialog() {
  const open = useStore((s) => s.newDialog)
  const setOpen = useStore((s) => s.setNewDialog)
  const settings = useStore((s) => s.settings)
  const updateSettings = useStore((s) => s.updateSettings)
  const upsert = useStore((s) => s.upsertInstance)
  const select = useStore((s) => s.select)
  const notify = useStore((s) => s.notify)

  const [versions, setVersions] = useState<McVersion[] | null>(null)
  const [loadError, setLoadError] = useState<string>()
  const [filter, setFilter] = useState('')
  const [version, setVersion] = useState<string>()
  const [loader, setLoader] = useState<Loader>('fabric')
  const [name, setName] = useState('')
  const [creating, setCreating] = useState(false)
  const showSnapshots = settings?.showSnapshots ?? false

  useEffect(() => {
    if (!open) return
    setName('')
    setFilter('')
    setLoadError(undefined)
    api.versions.list()
      .then((list) => {
        setVersions(list)
        setVersion((v) => v ?? list.find((x) => x.type === 'release')?.id)
      })
      .catch((err: Error) => setLoadError(err.message))
  }, [open])

  const visible = useMemo(() => {
    const q = filter.trim()
    return (versions ?? []).filter((v) => (showSnapshots || v.type === 'release') && (!q || v.id.includes(q)))
  }, [versions, filter, showSnapshots])

  const create = async () => {
    if (!version) return
    setCreating(true)
    try {
      const view = await api.instances.create({ name: name.trim(), mcVersion: version, loader })
      upsert(view)
      select(view.id)
      setOpen(false)
    } catch (err) {
      notify(err instanceof Error ? err.message : String(err))
    } finally {
      setCreating(false)
    }
  }

  return (
    <Dialog open={open} onClose={() => !creating && setOpen(false)} label="New instance" width={520}>
      <h2 className="dialog-title">New instance</h2>
      <p className="dialog-body">Each instance keeps its own worlds, mods and settings.</p>

      <form className="new-form" onSubmit={(e) => { e.preventDefault(); void create() }}>
        <label className="field">
          <span className="setting-label">Name</span>
          <input
            className="input"
            value={name}
            placeholder={version ? `Minecraft ${version}` : 'My world'}
            onChange={(e) => setName(e.target.value)}
            maxLength={40}
            autoFocus
          />
        </label>

        <div className="field">
          <span className="setting-label">Mods</span>
          <Segmented
            label="Loader"
            value={loader}
            onChange={setLoader}
            options={[{ value: 'fabric', label: 'Fabric' }, { value: 'vanilla', label: 'No mods' }]}
          />
        </div>

        <div className="field">
          <div className="field-row">
            <span className="setting-label">Version</span>
            <label className="inline small">
              <span className="muted">Snapshots</span>
              <Switch label="Show snapshots" checked={showSnapshots} onChange={(v) => void updateSettings({ showSnapshots: v })} />
            </label>
          </div>
          <input className="input" placeholder="Filter versions" value={filter} onChange={(e) => setFilter(e.target.value)} />
          <div className="version-list" role="listbox" aria-label="Minecraft version">
            {loadError && <p className="menu-note">Couldn’t load versions: {loadError}</p>}
            {!versions && !loadError && <p className="menu-note"><Spinner /> Loading versions</p>}
            {visible.map((v) => (
              <button
                type="button"
                key={v.id}
                role="option"
                aria-selected={v.id === version}
                className="version-item"
                onClick={() => setVersion(v.id)}
              >
                <span>{v.id}</span>
                <span className="muted">{v.type === 'snapshot' ? 'Snapshot' : new Date(v.releaseTime).toLocaleDateString(undefined, { year: 'numeric', month: 'short' })}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="dialog-actions">
          <button type="button" className="btn quiet" onClick={() => setOpen(false)} disabled={creating}>Cancel</button>
          <button className="btn accent" disabled={!version || creating}>
            {creating && <Spinner />} {creating ? 'Creating' : 'Create instance'}
          </button>
        </div>
      </form>
    </Dialog>
  )
}
