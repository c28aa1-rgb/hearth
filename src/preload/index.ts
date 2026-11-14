import { contextBridge, ipcRenderer } from 'electron'
import type { HearthApi, HearthEvent } from '@shared/types'

type Result = { ok: true; value: unknown } | { ok: false; error: string }

const call = (name: string) => async (...args: unknown[]) => {
  const res = (await ipcRenderer.invoke(`hearth:${name}`, ...args)) as Result
  if (!res.ok) throw new Error(res.error)
  return res.value
}

/** Build the nested API object from "group.method" names. */
const names = [
  'app.info', 'versions.list',
  'instances.list', 'instances.create', 'instances.update', 'instances.clone', 'instances.remove',
  'instances.openFolder', 'instances.pickImage',
  'launch.start', 'launch.stop', 'launch.states', 'launch.logs',
  'mods.search', 'mods.details', 'mods.install', 'mods.remove', 'mods.setEnabled', 'mods.checkUpdates', 'mods.update',
  'accounts.list', 'accounts.signInMicrosoft', 'accounts.remove',
  'settings.get', 'settings.set'
]

const api: Record<string, unknown> = {
  on(listener: (event: HearthEvent) => void) {
    const fn = (_: unknown, event: HearthEvent) => listener(event)
    ipcRenderer.on('hearth:event', fn)
    return () => ipcRenderer.removeListener('hearth:event', fn)
  }
}
for (const name of names) {
  const [group, method] = name.split('.')
  ;((api[group] ??= {}) as Record<string, unknown>)[method] = call(name)
}

contextBridge.exposeInMainWorld('hearth', api as unknown as HearthApi)
