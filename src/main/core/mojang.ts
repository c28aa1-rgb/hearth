import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { McVersion } from '@shared/types'
import type { DownloadTask } from './download'
import { getJson } from './http'
import { libraryKey, mavenPath } from './maven'
import { rulesAllow, type Rule, type RuleEnv } from './rules'

const MANIFEST_URL = 'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json'
const RESOURCES_URL = 'https://resources.download.minecraft.net'
/** 1.19 is the first version with native Apple Silicon libraries. */
export const OLDEST_SUPPORTED = '1.19'

export interface Artifact { path?: string; url: string; sha1?: string; size?: number }

export interface Library {
  name: string
  downloads?: { artifact?: Artifact }
  rules?: Rule[]
  /** Fabric-style libraries: maven repository base URL. */
  url?: string
  sha1?: string
  size?: number
}

export type Argument = string | { rules?: Rule[]; value: string | string[] }

export interface VersionJson {
  id: string
  type?: string
  inheritsFrom?: string
  mainClass: string
  arguments?: { game?: Argument[]; jvm?: Argument[] }
  libraries: Library[]
  downloads?: { client?: Artifact }
  assetIndex?: { id: string; url: string; sha1: string; size: number }
  assets?: string
  javaVersion?: { component: string; majorVersion: number }
}

interface Manifest {
  latest: { release: string; snapshot: string }
  versions: (McVersion & { url: string; sha1: string })[]
}

let manifestCache: { at: number; data: Manifest } | undefined

export async function getManifest(versionsDir: string): Promise<Manifest> {
  if (manifestCache && Date.now() - manifestCache.at < 10 * 60_000) return manifestCache.data
  const cachePath = join(versionsDir, 'version_manifest_v2.json')
  try {
    const data = await getJson<Manifest>(MANIFEST_URL)
    await mkdir(versionsDir, { recursive: true })
    await writeFile(cachePath, JSON.stringify(data))
    manifestCache = { at: Date.now(), data }
    return data
  } catch (err) {
    // Offline: fall back to the last manifest we saw.
    try {
      const data = JSON.parse(await readFile(cachePath, 'utf8')) as Manifest
      manifestCache = { at: Date.now(), data }
      return data
    } catch {
      throw err
    }
  }
}

/** Releases and snapshots from 1.19 onwards, newest first. */
export function supportedVersions(manifest: Manifest): McVersion[] {
  const floor = manifest.versions.find((v) => v.id === OLDEST_SUPPORTED)
  const cutoff = floor ? Date.parse(floor.releaseTime) : 0
  return manifest.versions
    .filter((v) => (v.type === 'release' || v.type === 'snapshot') && Date.parse(v.releaseTime) >= cutoff)
    .map(({ id, type, releaseTime }) => ({ id, type, releaseTime }))
}

async function readJsonFile<T>(path: string): Promise<T | undefined> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as T
  } catch {
    return undefined
  }
}

export async function getVersionJson(versionsDir: string, id: string): Promise<VersionJson> {
  const path = join(versionsDir, id, `${id}.json`)
  const cached = await readJsonFile<VersionJson>(path)
  if (cached) return cached
  const manifest = await getManifest(versionsDir)
  const entry = manifest.versions.find((v) => v.id === id)
  if (!entry) throw new Error(`Minecraft ${id} isn't in Mojang's version list.`)
  const json = await getJson<VersionJson>(entry.url)
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, JSON.stringify(json))
  return json
}

/** Put a loader profile (e.g. Fabric) on top of the vanilla version it inherits from. */
export function mergeVersions(parent: VersionJson, child: VersionJson): VersionJson {
  const libs = new Map<string, Library>()
  for (const lib of [...parent.libraries, ...child.libraries]) libs.set(libraryKey(lib.name), lib)
  return {
    ...parent,
    id: child.id,
    mainClass: child.mainClass ?? parent.mainClass,
    libraries: [...libs.values()],
    arguments: {
      game: [...(parent.arguments?.game ?? []), ...(child.arguments?.game ?? [])],
      jvm: [...(parent.arguments?.jvm ?? []), ...(child.arguments?.jvm ?? [])]
    }
  }
}

/** Libraries that apply to this machine, as download tasks plus classpath entries. */
export function resolveLibraries(version: VersionJson, librariesDir: string, env: RuleEnv) {
  const tasks: DownloadTask[] = []
  const classpath: string[] = []
  for (const lib of version.libraries) {
    if (!rulesAllow(lib.rules, env)) continue
    const artifact = lib.downloads?.artifact
    let rel: string
    let task: Omit<DownloadTask, 'path'>
    if (artifact?.url) {
      rel = artifact.path ?? mavenPath(lib.name)
      task = { url: artifact.url, sha1: artifact.sha1, size: artifact.size }
    } else if (lib.url) {
      rel = mavenPath(lib.name)
      task = { url: lib.url.replace(/\/?$/, '/') + rel, sha1: lib.sha1, size: lib.size }
    } else {
      continue
    }
    const path = join(librariesDir, rel)
    tasks.push({ ...task, path })
    classpath.push(path)
  }
  return { tasks, classpath }
}

/** The vanilla client jar. `mcVersion` is the vanilla id even when `version` is a merged Fabric profile. */
export function clientJarTask(version: VersionJson, versionsDir: string, mcVersion: string): DownloadTask {
  const client = version.downloads?.client
  if (!client) throw new Error(`Version ${mcVersion} has no client download.`)
  return { url: client.url, sha1: client.sha1, size: client.size, path: clientJarPath(versionsDir, mcVersion) }
}

export function clientJarPath(versionsDir: string, mcVersion: string): string {
  return join(versionsDir, mcVersion, `${mcVersion}.jar`)
}

interface AssetIndex { objects: Record<string, { hash: string; size: number }> }

export async function assetTasks(version: VersionJson, assetsDir: string): Promise<DownloadTask[]> {
  const index = version.assetIndex
  if (!index) return []
  const indexPath = join(assetsDir, 'indexes', `${index.id}.json`)
  let data = await readJsonFile<AssetIndex>(indexPath)
  if (!data || (await stat(indexPath)).size !== index.size) {
    data = await getJson<AssetIndex>(index.url)
    await mkdir(dirname(indexPath), { recursive: true })
    await writeFile(indexPath, JSON.stringify(data))
  }
  return Object.values(data.objects).map(({ hash, size }) => ({
    url: `${RESOURCES_URL}/${hash.slice(0, 2)}/${hash}`,
    path: join(assetsDir, 'objects', hash.slice(0, 2), hash),
    sha1: hash,
    size
  }))
}
