import { motion } from 'motion/react'
import { ArrowLeft, Download, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type { InstanceView, ModDetails as Details } from '@shared/types'
import { api } from '../lib/api'
import { formatCount, relativeTime } from '../lib/format'
import { renderMarkdown } from '../lib/markdown'
import { quick, spring } from '../lib/motion'
import { useStore } from '../store'
import { Spinner, Switch } from './controls'

/** What the list already knows about a mod, shown while the full details load. */
export interface ModPreview {
  projectId: string
  title: string
  iconUrl?: string
  description?: string
  author?: string
}

export function ModDetails({ instance, preview, onBack }: { instance: InstanceView; preview: ModPreview; onBack: () => void }) {
  const upsert = useStore((s) => s.upsertInstance)
  const attempt = useStore((s) => s.attempt)
  const update = useStore((s) => s.updates[instance.id]?.find((u) => u.projectId === preview.projectId))
  const [details, setDetails] = useState<Details>()
  const [error, setError] = useState<string>()
  const [installing, setInstalling] = useState(false)

  useEffect(() => {
    let live = true
    setDetails(undefined)
    setError(undefined)
    api.mods.details(preview.projectId).then(
      (d) => { if (live) setDetails(d) },
      (e: unknown) => { if (live) setError(e instanceof Error ? e.message : String(e)) }
    )
    return () => { live = false }
  }, [preview.projectId])

  // Back on Escape, unless a field or dialog has focus.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return
      const el = document.activeElement
      if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement || document.querySelector('[role="dialog"]')) return
      onBack()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onBack])

  const body = useMemo(() => (details?.body ? renderMarkdown(details.body) : ''), [details?.body])
  const installed = instance.mods.find((m) => m.projectId === preview.projectId)
  const title = details?.title ?? preview.title
  const icon = details?.iconUrl ?? preview.iconUrl
  const author = details?.author ?? preview.author
  const summary = details?.description ?? preview.description
  const updated = details ? relativeTime(Date.parse(details.updated)) : undefined

  const install = async () => {
    setInstalling(true)
    const view = await attempt(() => api.mods.install(instance.id, preview.projectId))
    if (view) upsert(view)
    setInstalling(false)
  }

  return (
    <motion.article
      className="mod-details"
      initial={{ opacity: 0, x: 18 }}
      animate={{ opacity: 1, x: 0 }}
      transition={spring}
    >
      <button className="btn quiet back" onClick={onBack}>
        <ArrowLeft size={14} /> Mods
      </button>

      <header className="details-head">
        {icon ? <img className="details-icon" src={icon} alt="" /> : <span className="details-icon blank" aria-hidden />}
        <div className="details-text">
          <h2 className="details-title">{title}</h2>
          {author && <p className="details-author">by {author}</p>}
          {summary && <p className="details-summary">{summary}</p>}
        </div>
        <div className="details-actions">
          {installed ? (
            <>
              <span className="details-version muted">
                <span>{installed.versionNumber}</span>
                {update && <span className="mod-update">{update.versionNumber} available</span>}
              </span>
              <Switch
                label={`${installed.enabled ? 'Disable' : 'Enable'} ${installed.title}`}
                checked={installed.enabled}
                onChange={async (enabled) => {
                  const view = await attempt(() => api.mods.setEnabled(instance.id, installed.projectId, enabled))
                  if (view) upsert(view)
                }}
              />
              <button
                className="btn quiet icon"
                aria-label={`Remove ${installed.title}`}
                title="Remove"
                onClick={async () => {
                  const view = await attempt(() => api.mods.remove(instance.id, installed.projectId))
                  if (view) upsert(view)
                }}
              >
                <Trash2 size={14} />
              </button>
            </>
          ) : (
            <button className="btn accent" onClick={() => void install()} disabled={installing}>
              {installing ? <><Spinner /> Installing</> : <><Download size={14} /> Install</>}
            </button>
          )}
        </div>
      </header>

      {details && (
        <motion.div className="details-facts" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={quick}>
          <span><strong className="tabular">{formatCount(details.downloads)}</strong> downloads</span>
          <span><strong className="tabular">{formatCount(details.followers)}</strong> followers</span>
          {updated && <span>Updated {updated}</span>}
          {details.license && <span>{details.license}</span>}
          {details.categories.length > 0 && (
            <span className="details-tags">
              {details.categories.map((c) => <span key={c} className="tag">{c.replace(/-/g, ' ')}</span>)}
            </span>
          )}
        </motion.div>
      )}

      {details && details.links.length > 0 && (
        <nav className="details-links" aria-label="Links">
          {details.links.map((l) => (
            <a key={l.label} href={l.url} target="_blank" rel="noreferrer">{l.label}</a>
          ))}
        </nav>
      )}

      <div className="details-rule" />

      {error ? (
        <div className="panel-empty">
          <p>Couldn’t load the description: {error}</p>
        </div>
      ) : !details ? (
        <div className="details-loading"><Spinner /> Loading description</div>
      ) : body ? (
        <motion.div
          className="mod-body"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={quick}
          dangerouslySetInnerHTML={{ __html: body }}
        />
      ) : (
        <p className="muted">This mod has no description on Modrinth.</p>
      )}
    </motion.article>
  )
}
