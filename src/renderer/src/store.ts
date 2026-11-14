import { create } from 'zustand'
import type { Account, AppInfo, InstanceView, LogLine, ModUpdate, RunState, Settings } from '@shared/types'
import { api } from './lib/api'

export type Tab = 'mods' | 'settings' | 'logs'

interface Toast { id: number; text: string; kind: 'error' | 'info' }

interface State {
  ready: boolean
  info?: AppInfo
  settings?: Settings
  instances: InstanceView[]
  selectedId?: string
  runStates: Record<string, RunState>
  logs: Record<string, LogLine[]>
  accounts: Account[]
  updates: Record<string, ModUpdate[]>
  tab: Tab | null
  /** How much of the stage the open tab's sheet covers. */
  sheetFull: boolean
  newDialog: boolean
  toast?: Toast

  init(): Promise<void>
  select(id: string): void
  setTab(tab: Tab | null): void
  setSheetFull(full: boolean): void
  setNewDialog(open: boolean): void
  upsertInstance(view: InstanceView): void
  refreshInstances(): Promise<void>
  removeInstance(id: string): Promise<void>
  refreshAccounts(): Promise<void>
  updateSettings(patch: Partial<Settings>): Promise<void>
  loadLogs(id: string): Promise<void>
  checkUpdates(id: string): Promise<void>
  notify(text: string, kind?: Toast['kind']): void
  /** Run an async action and show its error as a toast. */
  attempt<T>(fn: () => Promise<T>): Promise<T | undefined>
}

let toastId = 0

export const useStore = create<State>((set, get) => ({
  ready: false,
  instances: [],
  runStates: {},
  logs: {},
  accounts: [],
  updates: {},
  tab: null,
  sheetFull: false,
  newDialog: false,

  async init() {
    const [info, settings, instances, accounts, states] = await Promise.all([
      api.app.info(), api.settings.get(), api.instances.list(), api.accounts.list(), api.launch.states()
    ])
    const runStates = Object.fromEntries(states.map((s) => [s.instanceId, s]))
    const lastPlayed = [...instances].sort((a, b) => (b.lastPlayedAt ?? 0) - (a.lastPlayedAt ?? 0))[0]
    set({ ready: true, info, settings, instances, accounts, runStates, selectedId: lastPlayed?.id })

    api.on((event) => {
      if (event.type === 'run-state') {
        set((s) => ({ runStates: { ...s.runStates, [event.state.instanceId]: event.state } }))
        if (event.state.error) get().notify(event.state.error)
        else if (event.state.ready) {
          const name = get().instances.find((i) => i.id === event.state.instanceId)?.name
          if (name) get().notify(`${name} is downloaded and ready to play.`, 'info')
        }
      } else if (event.type === 'log') {
        set((s) => {
          const logs = { ...s.logs }
          for (const line of event.lines) {
            const list = (logs[line.instanceId] ??= [])
            logs[line.instanceId] = list.length > 4000 ? [...list.slice(-3000), line] : [...list, line]
          }
          return { logs }
        })
      } else if (event.type === 'instances-changed') {
        void get().refreshInstances()
      } else if (event.type === 'open-logs') {
        set({ selectedId: event.instanceId, tab: 'logs' })
      }
    })
  },

  select(id) {
    set({ selectedId: id })
  },
  setTab(tab) {
    // Closing the sheet forgets the expanded size, so it reopens at its usual height.
    set(tab ? { tab } : { tab, sheetFull: false })
  },
  setSheetFull(sheetFull) {
    set({ sheetFull })
  },
  setNewDialog(open) {
    set({ newDialog: open })
  },
  upsertInstance(view) {
    set((s) => {
      const exists = s.instances.some((i) => i.id === view.id)
      return {
        instances: exists ? s.instances.map((i) => (i.id === view.id ? view : i)) : [...s.instances, view]
      }
    })
  },
  async refreshInstances() {
    const instances = await api.instances.list()
    set((s) => ({
      instances,
      selectedId: instances.some((i) => i.id === s.selectedId) ? s.selectedId : instances[0]?.id
    }))
  },
  async removeInstance(id) {
    await api.instances.remove(id)
    set((s) => {
      const index = s.instances.findIndex((i) => i.id === id)
      const instances = s.instances.filter((i) => i.id !== id)
      const next = instances[Math.min(index, instances.length - 1)]
      return { instances, selectedId: next?.id, tab: null, sheetFull: false }
    })
  },
  async refreshAccounts() {
    const [accounts, settings] = await Promise.all([api.accounts.list(), api.settings.get()])
    set({ accounts, settings })
  },
  async updateSettings(patch) {
    set({ settings: await api.settings.set(patch) })
  },
  async loadLogs(id) {
    const lines = await api.launch.logs(id)
    set((s) => ({ logs: { ...s.logs, [id]: lines } }))
  },
  async checkUpdates(id) {
    try {
      const updates = await api.mods.checkUpdates(id)
      set((s) => ({ updates: { ...s.updates, [id]: updates } }))
    } catch {
      // Offline or Modrinth unavailable: no badge, no noise.
    }
  },
  notify(text, kind = 'error') {
    const id = ++toastId
    set({ toast: { id, text, kind } })
    setTimeout(() => { if (get().toast?.id === id) set({ toast: undefined }) }, 6000)
  },
  async attempt(fn) {
    try {
      return await fn()
    } catch (err) {
      get().notify(err instanceof Error ? err.message : String(err))
      return undefined
    }
  }
}))

export const useSelected = () =>
  useStore((s) => s.instances.find((i) => i.id === s.selectedId))
