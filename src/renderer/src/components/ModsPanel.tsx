import { AnimatePresence, motion } from 'motion/react'
import { Download, Search, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { InstanceView, ModSearchHit } from '@shared/types'
import { api } from '../lib/api'
import { formatCount, loaderLabel } from '../lib/format'
import { quick } from '../lib/motion'
import { useStore } from '../store'
import { Segmented, Spinner, Switch } from './controls'
import { ModDetails, type ModPreview } from './ModDetails'

export function ModsPanel({ instance }: { instance: InstanceView }) {
  const [view, setView] = useState<'installed' | 'browse'>(instance.mods.length ? 'installed' : 'browse')
  const [detail, setDetail] = useState<ModPreview | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const listScroll = useRef(0)
  const scroller = () => rootRef.current?.closest('.sheet-body') ?? null

  // The lists stay mounted (hidden) while a mod is open, so search results and the
  // scroll position are still there on the way back.
  const open = (preview: ModPreview) => {
    listScroll.current = scroller()?.scrollTop ?? 0
    setDetail(preview)
    requestAnimationFrame(() => scroller()?.scrollTo({ top: 0 }))
  }
  const back = useCallback(() => {
    setDetail(null)
    requestAnimationFrame(() => scroller()?.scrollTo({ top: listScroll.current }))
  }, [])

  useEffect(() => setDetail(null), [instance.id])

  if (instance.loader === 'vanilla') {
    return (
      <div className="panel-empty">
        <p>This instance has no mod loader. Create a Fabric, Quilt, NeoForge or Forge instance to add mods from Modrinth.</p>
      </div>
    )
  }

  return (
    <div className="mods" ref={rootRef}>
      {detail && <ModDetails key={detail.projectId} instance={instance} preview={detail} onBack={back} />}
      <div className="mods-lists" hidden={!!detail}>
      <div className="panel-head">
        <Segmented
          label="Mods view"
          value={view}
          onChange={setView}
          options={[
            { value: 'installed', label: `Installed ${instance.mods.length}` },
            { value: 'browse', label: 'Browse Modrinth' }
          ]}
        />
        {view === 'installed' && <UpdateButton instance={instance} />}
      </div>
      {view === 'installed'
        ? <InstalledList instance={instance} onBrowse={() => setView('browse')} onOpen={open} />
        : <Browse instance={instance} onOpen={open} />}
      </div>
    </div>
  )
}

function UpdateButton({ instance }: { instance: InstanceView }) {
  const updates = useStore((s) => s.updates[instance.id])
  const upsert = useStore((s) => s.upsertInstance)
  const checkUpdates = useStore((s) => s.checkUpdates)
  const attempt = useStore((s) => s.attempt)
  const [busy, setBusy] = useState(false)
  if (!updates?.length) return null
  const run = async () => {
    setBusy(true)
    const view = await attempt(() => api.mods.update(instance.id, updates))
    if (view) upsert(view)
    await checkUpdates(instance.id)
    setBusy(false)
  }
  return (
    <button className="btn accent" onClick={run} disabled={busy}>
      {busy ? <Spinner /> : <Download size={14} />}
      {busy ? 'Updating' : `Update ${updates.length} ${updates.length === 1 ? 'mod' : 'mods'}`}
    </button>
  )
}

function ModThumb({ url }: { url?: string }) {
  return url ? <img className="mod-icon" src={url} alt="" loading="lazy" /> : <span className="mod-icon blank" aria-hidden />
}

function InstalledList({ instance, onBrowse, onOpen }: { instance: InstanceView; onBrowse: () => void; onOpen: (p: ModPreview) => void }) {
  const upsert = useStore((s) => s.upsertInstance)
  const attempt = useStore((s) => s.attempt)
  const updates = useStore((s) => s.updates[instance.id])

  if (instance.mods.length === 0) {
    return (
      <div className="panel-empty">
        <p>No mods yet.</p>
        <button className="btn" onClick={onBrowse}><Search size={14} /> Browse Modrinth</button>
      </div>
    )
  }

  const mods = [...instance.mods].sort((a, b) => a.title.localeCompare(b.title))
  return (
    <ul className="mod-list">
      {mods.map((mod) => {
        const update = updates?.find((u) => u.projectId === mod.projectId)
        return (
          <li key={mod.projectId} className={`mod-row ${mod.enabled ? '' : 'disabled'}`}>
            <button
              className="mod-main"
              onClick={() => onOpen({ projectId: mod.projectId, title: mod.title, iconUrl: mod.iconUrl })}
              aria-label={`${mod.title} details`}
            >
              <ModThumb url={mod.iconUrl} />
              <span className="mod-text">
                <span className="mod-title">{mod.title}</span>
                <span className="mod-sub">
                  <span>{mod.versionNumber}</span>
                  {update && <span className="mod-update">{update.versionNumber} available</span>}
                  {mod.asDependency && <span>Needed by another mod</span>}
                </span>
              </span>
            </button>
            <Switch
              label={`${mod.enabled ? 'Disable' : 'Enable'} ${mod.title}`}
              checked={mod.enabled}
              onChange={async (enabled) => {
                const view = await attempt(() => api.mods.setEnabled(instance.id, mod.projectId, enabled))
                if (view) upsert(view)
              }}
            />
            <button
              className="btn quiet icon"
              aria-label={`Remove ${mod.title}`}
              onClick={async () => {
                const view = await attempt(() => api.mods.remove(instance.id, mod.projectId))
                if (view) upsert(view)
              }}
            >
              <Trash2 size={14} />
            </button>
          </li>
        )
      })}
    </ul>
  )
}

function Browse({ instance, onOpen }: { instance: InstanceView; onOpen: (p: ModPreview) => void }) {
  const upsert = useStore((s) => s.upsertInstance)
  const attempt = useStore((s) => s.attempt)
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<ModSearchHit[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [installing, setInstalling] = useState<string | null>(null)
  const requestId = useRef(0)
  const installed = new Set(instance.mods.map((m) => m.projectId))

  const load = async (q: string, offset: number) => {
    const id = ++requestId.current
    setLoading(true)
    try {
      const res = await api.mods.search(instance.id, q, offset)
      if (id !== requestId.current) return
      setHits((prev) => (offset === 0 ? res.hits : [...prev, ...res.hits]))
      setTotal(res.total)
    } catch (err) {
      if (id === requestId.current) useStore.getState().notify(err instanceof Error ? err.message : String(err))
    } finally {
      if (id === requestId.current) setLoading(false)
    }
  }

  useEffect(() => {
    const t = setTimeout(() => void load(query, 0), query ? 280 : 0)
    return () => clearTimeout(t)
  }, [query, instance.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const install = async (hit: ModSearchHit) => {
    setInstalling(hit.projectId)
    const view = await attempt(() => api.mods.install(instance.id, hit.projectId))
    if (view) upsert(view)
    setInstalling(null)
  }

  return (
    <div className="browse">
      <label className="search">
        <Search size={15} className="muted" />
        <input
          className="input"
          placeholder={`Search ${loaderLabel(instance.loader)} mods for ${instance.mcVersion}`}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
        />
        {loading && <Spinner />}
      </label>
      <ul className="mod-list">
        <AnimatePresence initial={false}>
          {hits.map((hit, i) => {
            const isInstalled = installed.has(hit.projectId)
            return (
              <motion.li
                key={hit.projectId}
                className="mod-row"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0, transition: { ...quick, delay: Math.min(i % 20, 8) * 0.03 } }}
              >
                <button
                  className="mod-main"
                  onClick={() => onOpen({ projectId: hit.projectId, title: hit.title, iconUrl: hit.iconUrl, description: hit.description, author: hit.author })}
                  aria-label={`${hit.title} details`}
                >
                  <ModThumb url={hit.iconUrl} />
                  <span className="mod-text">
                    <span className="mod-title">{hit.title} <span className="muted">by {hit.author}</span></span>
                    <span className="mod-desc">{hit.description}</span>
                  </span>
                </button>
                <span className="mod-downloads muted tabular">{formatCount(hit.downloads)}</span>
                <button
                  className={`btn ${isInstalled ? 'quiet' : ''}`}
                  disabled={isInstalled || installing !== null}
                  onClick={() => void install(hit)}
                >
                  {installing === hit.projectId ? <><Spinner /> Installing</> : isInstalled ? 'Installed' : 'Install'}
                </button>
              </motion.li>
            )
          })}
        </AnimatePresence>
      </ul>
      {!loading && hits.length === 0 && (
        <div className="panel-empty"><p>No {loaderLabel(instance.loader)} mods for {instance.mcVersion} match “{query}”.</p></div>
      )}
      {hits.length < total && hits.length > 0 && (
        <div className="more">
          <button className="btn quiet" disabled={loading} onClick={() => void load(query, hits.length)}>Show more</button>
        </div>
      )}
    </div>
  )
}
