import { constants, existsSync } from 'node:fs'
import { copyFile, mkdir, rename, rm } from 'node:fs/promises'
import { join } from 'node:path'
import type { Instance, InstalledMod, ModLoader, ModUpdate } from '@shared/types'
import { paths } from '../paths'
import { downloadFile } from './download'
import { readInstance, writeInstance } from './instances'
import { modrinthLoaders } from './loaders'
import { findConflict, incompatibleProjects, orphanedDependencies, requiredProjects } from './mod-graph'
import { latestVersions, modrinthSource, primaryFile, resolveInstall, type MrVersion } from './modrinth'

const modsDir = (id: string) => join(paths.gameDir(id), 'mods')
const storePath = (sha1: string) => join(paths.mods, `${sha1}.jar`)
const fileInInstance = (id: string, mod: InstalledMod) =>
  join(modsDir(id), mod.enabled ? mod.fileName : `${mod.fileName}.disabled`)

type ModInstance = Instance & { loader: ModLoader }

function requireModLoader(inst: Instance): asserts inst is ModInstance {
  if (inst.loader === 'vanilla') throw new Error('Mods need a mod loader. Create a Fabric, Quilt, Forge or NeoForge instance to add mods.')
}

const sourceFor = (inst: ModInstance) => modrinthSource(inst.mcVersion, modrinthLoaders(inst.loader))

/** Download into the shared store (once), then clone into the instance. */
async function placeVersion(inst: Instance, version: MrVersion, title: string, iconUrl: string | undefined, asDependency: boolean, resolved: MrVersion[]): Promise<InstalledMod> {
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
    asDependency,
    dependsOn: requiredProjects(version, resolved),
    incompatibleWith: incompatibleProjects(version)
  }
}

async function removeFiles(id: string, mod: InstalledMod) {
  await rm(join(modsDir(id), mod.fileName), { force: true })
  await rm(join(modsDir(id), `${mod.fileName}.disabled`), { force: true })
}

async function renameForState(id: string, mod: InstalledMod, enabled: boolean): Promise<InstalledMod> {
  if (mod.enabled === enabled) return mod
  const from = fileInInstance(id, mod)
  const to = fileInInstance(id, { ...mod, enabled })
  if (existsSync(from)) await rename(from, to)
  return { ...mod, enabled }
}

/**
 * Put resolved versions into the instance: check for incompatible mods first, replace older
 * copies, and switch back on any disabled mod that one of them requires.
 * `userPicked` is the project the user asked for; everything else counts as a dependency.
 */
async function addVersions(inst: ModInstance, versions: MrVersion[], source: ReturnType<typeof sourceFor>, userPicked?: string): Promise<Instance> {
  if (!versions.length) return inst
  const projects = await source.projects(versions.map((v) => v.project_id))
  const byId = new Map(projects.map((p) => [p.id, p]))
  const titleOf = (pid: string) => byId.get(pid)?.title ?? inst.mods.find((m) => m.projectId === pid)?.title ?? pid
  const conflict = findConflict(inst.mods, versions, titleOf)
  if (conflict) throw new Error(conflict)

  let mods = [...inst.mods]
  for (const version of versions) {
    const existing = mods.find((m) => m.projectId === version.project_id)
    if (existing) {
      await removeFiles(inst.id, existing)
      mods = mods.filter((m) => m !== existing)
    }
    const project = byId.get(version.project_id)
    const asDependency = version.project_id !== userPicked && (existing ? !!existing.asDependency : true)
    mods.push(await placeVersion(inst, version, titleOf(version.project_id), project?.icon_url ?? existing?.iconUrl, asDependency, versions))
  }

  const needed = new Set(mods.flatMap((m) => (m.enabled ? m.dependsOn ?? [] : [])))
  mods = await Promise.all(mods.map((m) => (!m.enabled && needed.has(m.projectId) ? renameForState(inst.id, m, true) : m)))
  const next = { ...inst, mods }
  await writeInstance(next)
  return next
}

export async function installMod(id: string, projectId: string): Promise<Instance> {
  const inst = await readInstance(id)
  requireModLoader(inst)
  const source = sourceFor(inst)
  const versions = await resolveInstall(projectId, source, new Set(inst.mods.map((m) => m.projectId)))
  return addVersions(inst, versions, source, versions[0]?.project_id)
}

/** Remove a mod, plus any dependency it pulled in that nothing else needs now. */
export async function removeMod(id: string, projectId: string): Promise<Instance> {
  const inst = await readInstance(id)
  const after = inst.mods.filter((m) => m.projectId !== projectId)
  const gone = new Set([projectId, ...orphanedDependencies(after)])
  for (const mod of inst.mods) if (gone.has(mod.projectId)) await removeFiles(id, mod)
  const next = { ...inst, mods: inst.mods.filter((m) => !gone.has(m.projectId)) }
  await writeInstance(next)
  return next
}

/** Disabled mods keep their file with a .disabled suffix, which every loader ignores. */
export async function setModEnabled(id: string, projectId: string, enabled: boolean): Promise<Instance> {
  const inst = await readInstance(id)
  const mods = await Promise.all(inst.mods.map((m) => (m.projectId === projectId ? renameForState(id, m, enabled) : m)))
  const next = { ...inst, mods }
  await writeInstance(next)
  return next
}

export async function checkModUpdates(id: string): Promise<ModUpdate[]> {
  const inst = await readInstance(id)
  if (inst.loader === 'vanilla' || inst.mods.length === 0) return []
  const latest = await latestVersions(inst.mods.map((m) => m.sha1), inst.mcVersion, modrinthLoaders(inst.loader))
  const updates: ModUpdate[] = []
  for (const mod of inst.mods) {
    const v = latest[mod.sha1]
    if (v && v.id !== mod.versionId && primaryFile(v).hashes.sha1 !== mod.sha1) {
      updates.push({ projectId: mod.projectId, versionId: v.id, versionNumber: v.version_number })
    }
  }
  return updates
}

/** Update mods, and add any dependency a new version requires that isn't installed yet. */
export async function applyModUpdates(id: string, updates: ModUpdate[]): Promise<Instance> {
  const inst = await readInstance(id)
  requireModLoader(inst)
  const source = sourceFor(inst)
  const versions = await Promise.all(updates
    .filter((u) => inst.mods.some((m) => m.projectId === u.projectId))
    .map((u) => source.version(u.versionId)))
  // A new file starts enabled; a mod that was switched off stays off.
  const wasEnabled = new Map(inst.mods.map((m) => [m.projectId, m.enabled]))
  let next: Instance = await addVersions(inst, versions, source)
  next = { ...next, mods: await Promise.all(next.mods.map((m) => renameForState(id, m, wasEnabled.get(m.projectId) ?? m.enabled))) }
  await writeInstance(next)

  // New required dependencies of the updated versions.
  for (const v of versions) {
    for (const dep of requiredProjects(v)) {
      if (next.mods.some((m) => m.projectId === dep)) continue
      const extra = await resolveInstall(dep, source, new Set(next.mods.map((m) => m.projectId)))
      next = await addVersions(next as ModInstance, extra, source)
    }
  }
  return next
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
