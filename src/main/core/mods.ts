import { constants, existsSync } from 'node:fs'
import { copyFile, mkdir, rename, rm } from 'node:fs/promises'
import { join } from 'node:path'
import type { Instance, InstalledMod, ModUpdate } from '@shared/types'
import { paths } from '../paths'
import { downloadFile } from './download'
import { readInstance, writeInstance } from './instances'
import { latestVersions, modrinthSource, primaryFile, resolveInstall, type MrVersion } from './modrinth'

const modsDir = (id: string) => join(paths.gameDir(id), 'mods')
const storePath = (sha1: string) => join(paths.mods, `${sha1}.jar`)
const fileInInstance = (id: string, mod: InstalledMod) =>
  join(modsDir(id), mod.enabled ? mod.fileName : `${mod.fileName}.disabled`)

function requireFabric(inst: Instance) {
  if (inst.loader !== 'fabric') throw new Error('Mods need a Fabric instance.')
}

/** Download into the shared store (once), then clone into the instance. */
async function placeVersion(inst: Instance, version: MrVersion, title: string, iconUrl: string | undefined, asDependency: boolean): Promise<InstalledMod> {
  const file = primaryFile(version)
  const store = storePath(file.hashes.sha1)
  if (!existsSync(store)) await downloadFile({ url: file.url, path: store, sha1: file.hashes.sha1, size: file.size })
  await mkdir(modsDir(inst.id), { recursive: true })
  await copyFile(store, join(modsDir(inst.id), file.filename), constants.COPYFILE_FICLONE)
  return {
    projectId: version.project_id,
    versionId: version.id,
    versionNumber: version.version_number,
    title,
    iconUrl,
    fileName: file.filename,
    sha1: file.hashes.sha1,
    enabled: true,
    asDependency
  }
}

async function removeFiles(id: string, mod: InstalledMod) {
  await rm(join(modsDir(id), mod.fileName), { force: true })
  await rm(join(modsDir(id), `${mod.fileName}.disabled`), { force: true })
}

export async function installMod(id: string, projectId: string): Promise<Instance> {
  const inst = await readInstance(id)
  requireFabric(inst)
  const source = modrinthSource(inst.mcVersion, 'fabric')
  const installed = new Set(inst.mods.map((m) => m.projectId))
  const versions = await resolveInstall(projectId, source, installed)
  const projects = await source.projects(versions.map((v) => v.project_id))
  const byId = new Map(projects.map((p) => [p.id, p]))
  const mods = [...inst.mods]
  for (const [i, version] of versions.entries()) {
    const existing = mods.findIndex((m) => m.projectId === version.project_id)
    if (existing >= 0) {
      await removeFiles(id, mods[existing])
      mods.splice(existing, 1)
    }
    const project = byId.get(version.project_id)
    mods.push(await placeVersion(inst, version, project?.title ?? version.project_id, project?.icon_url ?? undefined, i > 0))
  }
  const next = { ...inst, mods }
  await writeInstance(next)
  return next
}

export async function removeMod(id: string, projectId: string): Promise<Instance> {
  const inst = await readInstance(id)
  const mod = inst.mods.find((m) => m.projectId === projectId)
  if (mod) await removeFiles(id, mod)
  const next = { ...inst, mods: inst.mods.filter((m) => m.projectId !== projectId) }
  await writeInstance(next)
  return next
}

/** Disabled mods keep their file with a .disabled suffix, which Fabric ignores. */
export async function setModEnabled(id: string, projectId: string, enabled: boolean): Promise<Instance> {
  const inst = await readInstance(id)
  const mods = await Promise.all(inst.mods.map(async (m) => {
    if (m.projectId !== projectId || m.enabled === enabled) return m
    const from = fileInInstance(id, m)
    const to = fileInInstance(id, { ...m, enabled })
    if (existsSync(from)) await rename(from, to)
    return { ...m, enabled }
  }))
  const next = { ...inst, mods }
  await writeInstance(next)
  return next
}

export async function checkModUpdates(id: string): Promise<ModUpdate[]> {
  const inst = await readInstance(id)
  if (inst.loader !== 'fabric' || inst.mods.length === 0) return []
  const latest = await latestVersions(inst.mods.map((m) => m.sha1), inst.mcVersion, 'fabric')
  const updates: ModUpdate[] = []
  for (const mod of inst.mods) {
    const v = latest[mod.sha1]
    if (v && v.id !== mod.versionId && primaryFile(v).hashes.sha1 !== mod.sha1) {
      updates.push({ projectId: mod.projectId, versionId: v.id, versionNumber: v.version_number })
    }
  }
  return updates
}

export async function applyModUpdates(id: string, updates: ModUpdate[]): Promise<Instance> {
  let inst = await readInstance(id)
  const source = modrinthSource(inst.mcVersion, 'fabric')
  for (const u of updates) {
    const mod = inst.mods.find((m) => m.projectId === u.projectId)
    if (!mod) continue
    const version = await source.version(u.versionId)
    await removeFiles(id, mod)
    let placed = await placeVersion(inst, version, mod.title, mod.iconUrl, !!mod.asDependency)
    if (!mod.enabled) {
      await rename(join(modsDir(id), placed.fileName), join(modsDir(id), `${placed.fileName}.disabled`))
      placed = { ...placed, enabled: false }
    }
    inst = { ...inst, mods: inst.mods.map((m) => (m.projectId === u.projectId ? placed : m)) }
  }
  await writeInstance(inst)
  return inst
}

/** Before launch: put back any managed mod file that went missing from the instance folder. */
export async function syncMods(inst: Instance): Promise<void> {
  await mkdir(modsDir(inst.id), { recursive: true })
  for (const mod of inst.mods) {
    const target = fileInInstance(inst.id, mod)
    if (existsSync(target)) continue
    const store = storePath(mod.sha1)
    if (existsSync(store)) await copyFile(store, target, constants.COPYFILE_FICLONE)
  }
}
