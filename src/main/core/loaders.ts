import { spawn } from 'node:child_process'
import { constants, existsSync } from 'node:fs'
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { FabricLoaderVersion, Loader, ModLoader } from '@shared/types'
import { downloadFile } from './download'
import { getJson, request } from './http'
import { clientJarPath, type VersionJson } from './mojang'

/** Modrinth slug of the Fabric API mod, which nearly every Fabric (and Quilt) mod needs. */
export const FABRIC_API = 'fabric-api'

export const LOADER_NAMES: Record<Loader, string> = {
  vanilla: 'Vanilla',
  fabric: 'Fabric',
  quilt: 'Quilt',
  forge: 'Forge',
  neoforge: 'NeoForge'
}

export const MOD_LOADERS: ModLoader[] = ['fabric', 'quilt', 'neoforge', 'forge']

/** Modrinth loader tags whose mods run on `loader`. Quilt also runs Fabric mods. */
export function modrinthLoaders(loader: ModLoader): string[] {
  return loader === 'quilt' ? ['quilt', 'fabric'] : [loader]
}

/** Loaders that get Fabric API added when an instance is created. */
export const usesFabricApi = (loader: Loader) => loader === 'fabric' || loader === 'quilt'

const FABRIC_META = 'https://meta.fabricmc.net/v2'
const QUILT_META = 'https://meta.quiltmc.org/v3'
const FORGE_PROMOS = 'https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json'
const FORGE_MAVEN = 'https://maven.minecraftforge.net/net/minecraftforge/forge'
const NEOFORGE_LIST = 'https://maven.neoforged.net/api/maven/versions/releases/net/neoforged/neoforge'
const NEOFORGE_MAVEN = 'https://maven.neoforged.net/releases/net/neoforged/neoforge'

// ---------- Version lists ----------

const cache = new Map<string, { at: number; value: Promise<unknown> }>()
function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < 10 * 60_000) return hit.value as Promise<T>
  const value = load()
  value.catch(() => cache.delete(key))
  cache.set(key, { at: Date.now(), value })
  return value
}

/** Compare dotted versions numerically ("0.29.1" > "0.24.0", "21.1.267" > "21.1.99"). */
export function compareVersions(a: string, b: string): number {
  const pa = a.split(/[.+-]/)
  const pb = b.split(/[.+-]/)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] ?? ''
    const y = pb[i] ?? ''
    const nx = Number(x)
    const ny = Number(y)
    const diff = !Number.isNaN(nx) && !Number.isNaN(ny) && x !== '' && y !== '' ? nx - ny : x.localeCompare(y)
    if (diff !== 0) return diff
  }
  return 0
}

/** Newest stable version, or the newest of any kind when there is no stable one. */
function newest(versions: string[], isStable: (v: string) => boolean): string | undefined {
  const sorted = [...versions].sort(compareVersions).reverse()
  return sorted.find(isStable) ?? sorted[0]
}

const unstable = (v: string) => /alpha|beta|rc|pre/i.test(v)

export async function fabricLoaders(mcVersion: string): Promise<FabricLoaderVersion[]> {
  const list = await cached(`fabric:${mcVersion}`, () =>
    getJson<{ loader: FabricLoaderVersion }[]>(`${FABRIC_META}/versions/loader/${encodeURIComponent(mcVersion)}`))
  return list.map((x) => ({ version: x.loader.version, stable: x.loader.stable }))
}

async function quiltLoaders(mcVersion: string): Promise<string[]> {
  const list = await cached(`quilt:${mcVersion}`, () =>
    getJson<{ loader: { version: string } }[]>(`${QUILT_META}/versions/loader/${encodeURIComponent(mcVersion)}`))
  return list.map((x) => x.loader.version)
}

/**
 * NeoForge numbers its builds after the Minecraft version: 1.21.1 → 21.1.x, 1.21 → 21.0.x,
 * and from the year-based versions on, 26.1.2 → 26.1.2.x and 26.3 → 26.3.0.x.
 */
export function neoforgePrefix(mcVersion: string): string | undefined {
  if (!/^\d+(\.\d+)*$/.test(mcVersion)) return undefined // snapshots
  const parts = mcVersion.split('.')
  if (parts[0] === '1') return `${parts[1]}.${parts[2] ?? 0}.`
  return `${parts[0]}.${parts[1] ?? 0}.${parts[2] ?? 0}.`
}

/** The newest build of `loader` for this Minecraft version, or undefined if there is none. */
export async function latestLoaderVersion(loader: ModLoader, mcVersion: string): Promise<string | undefined> {
  switch (loader) {
    case 'fabric': {
      const list = await fabricLoaders(mcVersion)
      return (list.find((l) => l.stable) ?? list[0])?.version
    }
    case 'quilt':
      return newest(await quiltLoaders(mcVersion), (v) => !unstable(v))
    case 'forge': {
      const { promos } = await cached('forge:promos', () => getJson<{ promos: Record<string, string> }>(FORGE_PROMOS))
      return promos[`${mcVersion}-recommended`] ?? promos[`${mcVersion}-latest`]
    }
    case 'neoforge': {
      const prefix = neoforgePrefix(mcVersion)
      if (!prefix) return undefined
      const { versions } = await cached('neoforge:list', () => getJson<{ versions: string[] }>(NEOFORGE_LIST))
      return newest(versions.filter((v) => v.startsWith(prefix)), (v) => !unstable(v))
    }
  }
}

/** Mod loaders with a build for this Minecraft version. Lookup failures count as "not available". */
export async function availableLoaders(mcVersion: string): Promise<ModLoader[]> {
  const found = await Promise.all(MOD_LOADERS.map((l) => latestLoaderVersion(l, mcVersion).catch(() => undefined)))
  return MOD_LOADERS.filter((_, i) => !!found[i])
}

export async function requireLoaderVersion(loader: ModLoader, mcVersion: string): Promise<string> {
  const v = await latestLoaderVersion(loader, mcVersion)
  if (!v) throw new Error(`${LOADER_NAMES[loader]} doesn't support Minecraft ${mcVersion} yet.`)
  return v
}

/** The version id a loader profile is stored under in versions/. */
export function loaderVersionId(loader: ModLoader, mcVersion: string, loaderVersion: string): string {
  switch (loader) {
    case 'fabric': return `fabric-loader-${loaderVersion}-${mcVersion}`
    case 'quilt': return `quilt-loader-${loaderVersion}-${mcVersion}`
    case 'forge': return `${mcVersion}-forge-${loaderVersion}`
    case 'neoforge': return `neoforge-${loaderVersion}`
  }
}

// ---------- Profiles ----------

async function readJsonFile<T>(path: string): Promise<T | undefined> {
  try { return JSON.parse(await readFile(path, 'utf8')) as T } catch { return undefined }
}

/** Fabric and Quilt publish a ready-made profile that goes on top of the vanilla version. */
export async function metaProfile(versionsDir: string, loader: 'fabric' | 'quilt', mcVersion: string, loaderVersion: string): Promise<VersionJson> {
  const id = loaderVersionId(loader, mcVersion, loaderVersion)
  const path = join(versionsDir, id, `${id}.json`)
  const saved = await readJsonFile<VersionJson>(path)
  if (saved) return saved
  const base = loader === 'fabric' ? FABRIC_META : QUILT_META
  const json = await getJson<VersionJson>(
    `${base}/versions/loader/${encodeURIComponent(mcVersion)}/${encodeURIComponent(loaderVersion)}/profile/json`
  )
  await mkdir(join(versionsDir, id), { recursive: true })
  await writeFile(path, JSON.stringify(json))
  return json
}

export interface InstallerContext {
  storeDir: string
  versionsDir: string
  java: string
  /** Installer output, line by line, for the instance log. */
  onLine: (line: string) => void
}

const installs = new Map<string, Promise<VersionJson>>()

/** Per-file chatter from the installers (thousands of lines). Their own .log file keeps all of it. */
const INSTALLER_NOISE = /^\s|^(Can'?t Find|Considering library|File \/|Downloading library|Found extra|Following|Checksum)/

function installerUrl(loader: 'forge' | 'neoforge', mcVersion: string, loaderVersion: string): string {
  if (loader === 'forge') {
    const v = `${mcVersion}-${loaderVersion}`
    return `${FORGE_MAVEN}/${v}/forge-${v}-installer.jar`
  }
  return `${NEOFORGE_MAVEN}/${loaderVersion}/neoforge-${loaderVersion}-installer.jar`
}

/**
 * Forge and NeoForge patch the game, so their official installer has to run once per
 * loader version. It runs headless against the shared store (which uses the same layout as
 * the official launcher's folder) and leaves a version profile in versions/<id>/.
 */
export function installerProfile(loader: 'forge' | 'neoforge', mcVersion: string, loaderVersion: string, ctx: InstallerContext): Promise<VersionJson> {
  const id = loaderVersionId(loader, mcVersion, loaderVersion)
  let pending = installs.get(id)
  if (!pending) {
    pending = runInstaller(loader, mcVersion, loaderVersion, id, ctx).finally(() => installs.delete(id))
    installs.set(id, pending)
  }
  return pending
}

async function runInstaller(loader: 'forge' | 'neoforge', mcVersion: string, loaderVersion: string, id: string, ctx: InstallerContext): Promise<VersionJson> {
  const name = LOADER_NAMES[loader]
  const dir = join(ctx.versionsDir, id)
  const jsonPath = join(dir, `${id}.json`)
  const marker = join(dir, '.hearth-installed')
  const done = existsSync(marker) ? await readJsonFile<VersionJson>(jsonPath) : undefined
  if (done) return withClientJar(done, ctx.versionsDir, mcVersion)

  const url = installerUrl(loader, mcVersion, loaderVersion)
  const installer = join(ctx.storeDir, 'installers', url.slice(url.lastIndexOf('/') + 1))
  if (!existsSync(installer)) {
    const sha1 = await request(`${url}.sha1`).then((r) => r.text()).then((t) => t.trim().slice(0, 40)).catch(() => undefined)
    await downloadFile({ url, path: installer, sha1 })
  }

  // The installer refuses to run without the official launcher's profile file.
  const profiles = join(ctx.storeDir, 'launcher_profiles.json')
  if (!existsSync(profiles)) await writeFile(profiles, JSON.stringify({ profiles: {} }))

  ctx.onLine(`Running the ${name} ${loaderVersion} installer`)
  const code = await new Promise<number | null>((resolve, reject) => {
    const child = spawn(ctx.java, ['-Djava.awt.headless=true', '-jar', installer, '--installClient', ctx.storeDir], {
      cwd: dirname(installer), // the installer writes its own .log file next to itself
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true
    })
    let carry = ''
    const onData = (chunk: Buffer) => {
      const lines = (carry + chunk.toString('utf8')).split(/\r?\n/)
      carry = lines.pop() ?? ''
      for (const l of lines) if (l.trim() && !INSTALLER_NOISE.test(l)) ctx.onLine(l)
    }
    child.stdout.on('data', onData)
    child.stderr.on('data', onData)
    child.on('error', reject)
    child.on('exit', (c) => { if (carry.trim()) ctx.onLine(carry); resolve(c) })
  })
  if (code !== 0) throw new Error(`The ${name} installer failed (exit ${code}). The Logs tab shows what it printed.`)
  const json = await readJsonFile<VersionJson>(jsonPath)
  if (!json) throw new Error(`The ${name} installer finished but didn't create ${id}.`)
  await writeFile(marker, loaderVersion)
  return withClientJar(json, ctx.versionsDir, mcVersion)
}

/**
 * Forge and NeoForge expect the game jar at versions/<id>/<id>.jar (like the official
 * launcher lays it out) so they can recognise and skip it. A copy-on-write clone costs no space.
 */
async function withClientJar(json: VersionJson, versionsDir: string, mcVersion: string): Promise<VersionJson> {
  const target = join(versionsDir, json.id, `${json.id}.jar`)
  if (!existsSync(target)) await copyFile(clientJarPath(versionsDir, mcVersion), target, constants.COPYFILE_FICLONE)
  return json
}

/** Path of the game jar that goes on the classpath for this loader. */
export function launchJarPath(loader: Loader, versionsDir: string, mcVersion: string, versionId: string): string {
  return loader === 'forge' || loader === 'neoforge' ? join(versionsDir, versionId, `${versionId}.jar`) : clientJarPath(versionsDir, mcVersion)
}
