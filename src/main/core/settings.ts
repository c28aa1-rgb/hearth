import type { Settings } from '@shared/types'
import { paths } from '../paths'
import { readJson, writeJson } from './jsonfile'

const DEFAULTS: Settings = { hideOnLaunch: true, showSnapshots: false }

export async function getSettings(): Promise<Settings> {
  return { ...DEFAULTS, ...(await readJson<Partial<Settings>>(paths.settings, {})) }
}

export async function setSettings(patch: Partial<Settings>): Promise<Settings> {
  const next = { ...(await getSettings()), ...patch }
  await writeJson(paths.settings, next)
  return next
}
