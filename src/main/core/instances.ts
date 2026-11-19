import { randomBytes } from 'node:crypto'
import { constants } from 'node:fs'
import { copyFile, cp, mkdir, readdir, rm, stat } from 'node:fs/promises'
import { extname, join, relative, sep } from 'node:path'
import { shell } from 'electron'
import type { Instance, InstanceView, NewInstanceInput } from '@shared/types'
import { paths } from '../paths'
import { requireLoaderVersion } from './loaders'
import { readJson, writeJson } from './jsonfile'
import { autoMemoryMb } from './memory'
import os from 'node:os'

const SYSTEM_MB = Math.round(os.totalmem() / 1024 / 1024)
export const systemMemoryMb = () => SYSTEM_MB

const instanceFile = (id: string) => join(paths.instance(id), 'instance.json')

/** URL the renderer can load through the hearth:// protocol. */
export function fileUrl(absPath: string, version?: number): string {
  const rel = relative(paths.root, absPath).split(sep).map(encodeURIComponent).join('/')
  return `hearth://data/${rel}${version ? `?v=${Math.round(version)}` : ''}`
}

function slug(name: string): string {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24) || 'instance'
  return `${base}-${randomBytes(2).toString('hex')}`
}

export async function readInstance(id: string): Promise<Instance> {
  const inst = await readJson<Instance | null>(instanceFile(id), null)
  if (!inst) throw new Error(`Instance ${id} not found.`)
  return inst
}

export async function writeInstance(inst: Instance): Promise<void> {
  await writeJson(instanceFile(inst.id), inst)
}

async function latestScreenshot(id: string): Promise<{ path: string; mtime: number } | undefined> {
  const dir = join(paths.gameDir(id), 'screenshots')
  try {
    const files = (await readdir(dir)).filter((f) => f.toLowerCase().endsWith('.png'))
    let best: { path: string; mtime: number } | undefined
    for (const f of files) {
      const s = await stat(join(dir, f))
      if (!best || s.mtimeMs > best.mtime) best = { path: join(dir, f), mtime: s.mtimeMs }
    }
    return best
  } catch {
    return undefined
  }
}

async function mtime(path: string): Promise<number | undefined> {
  try { return (await stat(path)).mtimeMs } catch { return undefined }
}

export async function toView(inst: Instance): Promise<InstanceView> {
  let backdropUrl: string | undefined
  if (inst.backdrop.kind === 'file') {
    const p = join(paths.instance(inst.id), inst.backdrop.file)
    const m = await mtime(p)
    if (m) backdropUrl = fileUrl(p, m)
  } else if (inst.backdrop.kind === 'auto') {
    const shot = await latestScreenshot(inst.id)
    if (shot) backdropUrl = fileUrl(shot.path, shot.mtime)
  }
  let iconUrl: string | undefined
  if (inst.icon.kind === 'file') {
    const p = join(paths.instance(inst.id), inst.icon.file)
    const m = await mtime(p)
    if (m) iconUrl = fileUrl(p, m)
  }
  const modCount = inst.loader === 'vanilla' ? 0 : inst.mods.filter((m) => m.enabled).length
  return { ...inst, backdropUrl, iconUrl, autoMemoryMb: autoMemoryMb(modCount, SYSTEM_MB) }
}

export async function listInstances(): Promise<InstanceView[]> {
  await mkdir(paths.instances, { recursive: true })
  const ids = await readdir(paths.instances)
  const list: Instance[] = []
  for (const id of ids) {
    const inst = await readJson<Instance | null>(instanceFile(id), null)
    if (inst) list.push(inst)
  }
  list.sort((a, b) => a.createdAt - b.createdAt)
  return Promise.all(list.map(toView))
}

export async function createInstance(input: NewInstanceInput): Promise<Instance> {
  const name = input.name.trim() || `Minecraft ${input.mcVersion}`
  const inst: Instance = {
    id: slug(name),
    name,
    mcVersion: input.mcVersion,
    loader: input.loader,
    loaderVersion: input.loader === 'vanilla' ? undefined : await requireLoaderVersion(input.loader, input.mcVersion),
    memoryMb: null,
    icon: { kind: 'auto' },
    backdrop: { kind: 'auto' },
    mods: [],
    createdAt: Date.now()
  }
  await mkdir(join(paths.gameDir(inst.id), 'mods'), { recursive: true })
  await writeInstance(inst)
  return inst
}

export async function updateInstance(id: string, patch: Partial<Instance>): Promise<Instance> {
  const next = { ...(await readInstance(id)), ...patch, id }
  await writeInstance(next)
  return next
}

export async function cloneInstance(id: string): Promise<Instance> {
  const src = await readInstance(id)
  const copy: Instance = { ...src, id: slug(src.name), name: `${src.name} copy`, createdAt: Date.now(), lastPlayedAt: undefined }
  // APFS clones: the copy takes no extra space until files change.
  await cp(paths.instance(id), paths.instance(copy.id), { recursive: true, mode: constants.COPYFILE_FICLONE })
  await writeInstance(copy)
  return copy
}

/** Moves the instance folder to the Trash, so it can be recovered. */
export async function removeInstance(id: string): Promise<void> {
  await shell.trashItem(paths.instance(id))
}

/** Copy a user-picked image into the instance folder. */
export async function importImage(id: string, source: string, purpose: 'icon' | 'backdrop'): Promise<string> {
  const ext = extname(source).toLowerCase() || '.png'
  const dir = paths.instance(id)
  for (const f of await readdir(dir)) if (f.startsWith(`${purpose}.`)) await rm(join(dir, f), { force: true })
  const file = `${purpose}${ext}`
  await copyFile(source, join(dir, file))
  return file
}
