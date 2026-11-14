import { AnimatePresence, motion } from 'motion/react'
import { Check, ChevronsUpDown, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { api } from '../lib/api'
import { exit, standard } from '../lib/motion'
import { useStore } from '../store'
import { Avatar } from './Avatar'
import { Spinner, Switch } from './controls'

export function AccountMenu() {
  const accounts = useStore((s) => s.accounts)
  const settings = useStore((s) => s.settings)
  const info = useStore((s) => s.info)
  const refreshAccounts = useStore((s) => s.refreshAccounts)
  const updateSettings = useStore((s) => s.updateSettings)
  const attempt = useStore((s) => s.attempt)
  const [open, setOpen] = useState(false)
  const [signingIn, setSigningIn] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const active = accounts.find((a) => a.id === settings?.activeAccountId) ?? accounts[0]

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('mousedown', onDown); window.removeEventListener('keydown', onKey) }
  }, [open])

  const signIn = async () => {
    setSigningIn(true)
    await attempt(() => api.accounts.signInMicrosoft())
    setSigningIn(false)
    await refreshAccounts()
  }

  return (
    <div className="account" ref={ref}>
      <AnimatePresence>
        {open && (
          <motion.div
            className="account-menu"
            role="dialog"
            aria-label="Accounts"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0, transition: standard }}
            exit={{ opacity: 0, y: 4, transition: exit }}
          >
            {accounts.length > 0 && (
              <ul className="account-list">
                {accounts.map((a) => (
                  <li key={a.id}>
                    <button className="account-item" onClick={() => void updateSettings({ activeAccountId: a.id })}>
                      <Avatar account={a} size={24} />
                      <span className="account-text">
                        <span className="account-name">{a.name}</span>
                        <span className="account-kind">Microsoft account</span>
                      </span>
                      {a.id === active?.id && <Check size={15} className="account-check" />}
                    </button>
                    <button
                      className="btn quiet icon account-remove"
                      aria-label={`Remove ${a.name}`}
                      onClick={async () => { await attempt(() => api.accounts.remove(a.id)); await refreshAccounts() }}
                    >
                      <X size={14} />
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <button className="btn ms-btn" onClick={signIn} disabled={signingIn || !info?.microsoftConfigured}>
              {signingIn ? <Spinner /> : <MicrosoftMark />} Sign in with Microsoft
            </button>
            {!info?.microsoftConfigured && (
              <p className="menu-note">Microsoft sign-in needs an Azure client ID. The README explains how to add one.</p>
            )}

            <div className="menu-divider" />
            <label className="menu-setting">
              <span>Hide Hearth while playing</span>
              <Switch
                label="Hide Hearth while playing"
                checked={settings?.hideOnLaunch ?? true}
                onChange={(v) => void updateSettings({ hideOnLaunch: v })}
              />
            </label>
          </motion.div>
        )}
      </AnimatePresence>

      <button className="account-button" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <Avatar account={active} size={24} />
        <span className="account-name">{active ? active.name : 'Sign in'}</span>
        <ChevronsUpDown size={14} className="muted" />
      </button>
    </div>
  )
}

function MicrosoftMark() {
  return (
    <svg width="14" height="14" viewBox="0 0 21 21" aria-hidden>
      <rect x="1" y="1" width="9" height="9" fill="#f25022" />
      <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
      <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
      <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
    </svg>
  )
}
