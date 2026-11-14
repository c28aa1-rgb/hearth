import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { FabricLoaderVersion } from '@shared/types'
import { getJson } from './http'
import type { VersionJson } from './mojang'

const META = 'https://meta.fabricmc.net/v2'
/** Modrinth slug of the Fabric API mod, which nearly every Fabric mod needs. */
export const FABRIC_API = 'fabric-api'

export async function fabricLoaders(mcVersion: string): Promise<FabricLoaderVersion[]> {
  const list = await getJson<{ loader: FabricLoaderVersion }[]>(`${META}/versions/loader/${encodeURIComponent(mcVersion)}`)
  return list.map((x) => ({ version: x.loader.version, stable: x.loader.stable }))
}

/** Latest stable loader for this game version (or the latest of any kind). */
export async function latestFabricLoader(mcVersion: string): Promise<string> {
  const loaders = await fabricLoaders(mcVersion)
  const pick = loaders.find((l) => l.stable) ?? loaders[0]
  if (!pick) throw new Error(`Fabric doesn't support Minecraft ${mcVersion} yet.`)
  return pick.version
}

export async function fabricProfile(versionsDir: string, mcVersion: string, loader: string): Promise<VersionJson> {
  const id = `fabric-loader-${loader}-${mcVersion}`
  const path = join(versionsDir, id, `${id}.json`)
  try {
    return JSON.parse(await readFile(path, 'utf8')) as VersionJson
  } catch {
    const json = await getJson<VersionJson>(
      `${META}/versions/loader/${encodeURIComponent(mcVersion)}/${encodeURIComponent(loader)}/profile/json`
    )
    await mkdir(join(versionsDir, id), { recursive: true })
    await writeFile(path, JSON.stringify(json))
    return json
  }
}
