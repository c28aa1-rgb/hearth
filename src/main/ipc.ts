import { BrowserWindow, dialog, ipcMain, shell } from 'electron'
import type { HearthEvent, InstanceView } from '@shared/types'
import { listAccounts, removeAccount, signInMicrosoft } from './auth/accounts'
import { AZURE_CLIENT_ID } from './auth/config'
import { availableLoaders, FABRIC_API, modrinthLoaders, usesFabricApi } from './core/loaders'
import {
  cloneInstance, createInstance, importImage, listInstances, readInstance, removeInstance,
  systemMemoryMb, toView, updateInstance
} from './core/instances'
import { runner } from './core/launch'
import { applyModUpdates, checkModUpdates, installMod, removeMod, setModEnabled } from './core/mods'
import { modDetails, searchMods } from './core/modrinth'
import { getManifest, supportedVersions } from './core/mojang'
import { getSettings, setSettings } from './core/settings'
import { PLATFORM } from './core/platform'
import { paths } from './paths'

export function broadcast(event: HearthEvent) {
  for (const win of BrowserWindow.getAllWindows()) win.webContents.send('hearth:event', event)
}

type Handler = (...args: never[]) => unknown

/** Register `hearth:<name>` handlers. Errors reach the renderer as plain messages. */
function handle(handlers: Record<string, Handler>) {
  for (const [name, fn] of Object.entries(handlers)) {
    ipcMain.handle(`hearth:${name}`, async (_e, ...args) => {
      try {
        return { ok: true, value: await (fn as (...a: unknown[]) => unknown)(...args) }
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) }
      }
    })
  }
}

const view = async (id: string): Promise<InstanceView> => toView(await readInstance(id))

export function registerIpc(getWindow: () => BrowserWindow | undefined) {
  handle({
    'app.info': () => ({
      microsoftConfigured: !!AZURE_CLIENT_ID,
      systemMemoryMb: systemMemoryMb(),
      dataDir: paths.root,
      platform: PLATFORM
    }),

    'versions.list': async () => supportedVersions(await getManifest(paths.versions)),
    'versions.loaders': availableLoaders,

    'instances.list': listInstances,
    'instances.create': async (input: Parameters<typeof createInstance>[0]) => {
      const inst = await createInstance(input)
      if (usesFabricApi(inst.loader)) {
        // Fabric API is a regular mod the user can remove. A failure here shouldn't block creation.
        await installMod(inst.id, FABRIC_API).catch(() => undefined)
      }
      // Download the game in the background now, so the first Play starts right away.
      void runner.install(inst.id)
      return view(inst.id)
    },
    'instances.update': async (id: string, patch: object) => toView(await updateInstance(id, patch)),
    'instances.clone': async (id: string) => toView(await cloneInstance(id)),
    'instances.remove': removeInstance,
    'instances.openFolder': async (id: string) => { await shell.openPath(paths.gameDir(id)) },
    'instances.pickImage': async (id: string, purpose: 'icon' | 'backdrop') => {
      const win = getWindow()
      const opts = {
        title: purpose === 'icon' ? 'Choose an icon' : 'Choose a backdrop',
        properties: ['openFile' as const],
        filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }]
      }
      const res = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts)
      if (res.canceled || !res.filePaths[0]) return null
      const file = await importImage(id, res.filePaths[0], purpose)
      return toView(await updateInstance(id, { [purpose]: { kind: 'file', file } }))
    },

    'launch.start': async (id: string) => { void runner.start(id) },
    'launch.stop': async (id: string) => runner.stop(id),
    'launch.states': async () => runner.allStates(),
    'launch.logs': async (id: string) => runner.logsFor(id),

    'mods.search': async (id: string, query: string, offset: number) => {
      const inst = await readInstance(id)
      if (inst.loader === 'vanilla') return { hits: [], total: 0 }
      return searchMods(query, inst.mcVersion, modrinthLoaders(inst.loader), offset)
    },
    'mods.details': modDetails,
    'mods.install': async (id: string, projectId: string) => toView(await installMod(id, projectId)),
    'mods.remove': async (id: string, projectId: string) => toView(await removeMod(id, projectId)),
    'mods.setEnabled': async (id: string, projectId: string, enabled: boolean) =>
      toView(await setModEnabled(id, projectId, enabled)),
    'mods.checkUpdates': checkModUpdates,
    'mods.update': async (id: string, updates: Parameters<typeof applyModUpdates>[1]) =>
      toView(await applyModUpdates(id, updates)),

    'accounts.list': listAccounts,
    'accounts.signInMicrosoft': () => signInMicrosoft(getWindow()),
    'accounts.remove': removeAccount,

    'settings.get': getSettings,
    'settings.set': setSettings
  })
}
