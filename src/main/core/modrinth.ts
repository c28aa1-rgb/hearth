import type { ModDetails, ModSearchResult } from '@shared/types'
import { getJson, postJson } from './http'

const API = 'https://api.modrinth.com/v2'

export interface MrFile {
  url: string
  filename: string
  primary: boolean
  size: number
  hashes: { sha1: string; sha512?: string }
}

export interface MrDependency {
  version_id?: string | null
  project_id?: string | null
  dependency_type: 'required' | 'optional' | 'incompatible' | 'embedded'
}

export interface MrVersion {
  id: string
  project_id: string
  version_number: string
  version_type: 'release' | 'beta' | 'alpha'
  loaders?: string[]
  files: MrFile[]
  dependencies: MrDependency[]
}

export interface MrProject {
  id: string
  slug: string
  title: string
  icon_url?: string | null
}

export function primaryFile(version: MrVersion): MrFile {
  const file = version.files.find((f) => f.primary) ?? version.files[0]
  if (!file) throw new Error(`Modrinth version ${version.id} has no files.`)
  return file
}

/** What dependency resolution needs from Modrinth. Injected so it can be tested offline. */
export interface ModSource {
  /** Best version of a project for this game version + loader, or undefined if none. */
  compatibleVersion(projectIdOrSlug: string): Promise<MrVersion | undefined>
  version(versionId: string): Promise<MrVersion>
  projectTitle(projectId: string): Promise<string>
}

export class NoCompatibleVersionError extends Error {}

/**
 * The versions to install for `projectIdOrSlug`: the mod itself plus every required
 * dependency that isn't installed yet. Breadth-first; each project appears once.
 */
export async function resolveInstall(
  projectIdOrSlug: string,
  source: ModSource,
  installed: ReadonlySet<string>
): Promise<MrVersion[]> {
  const result: MrVersion[] = []
  const seen = new Set(installed)
  // neededBy = project id of the mod that requires this one (undefined for the mod the user picked)
  const queue: { project?: string; version?: string; neededBy?: string }[] = [{ project: projectIdOrSlug }]
  while (queue.length) {
    const item = queue.shift()!
    const version = item.version
      ? await source.version(item.version)
      : await source.compatibleVersion(item.project!)
    if (!version) {
      const title = await source.projectTitle(item.project!).catch(() => item.project!)
      if (!item.neededBy) throw new NoCompatibleVersionError(`${title} has no version for this Minecraft version and loader.`)
      const parent = await source.projectTitle(item.neededBy).catch(() => 'A mod')
      throw new NoCompatibleVersionError(`${parent} needs ${title}, which has no version for this Minecraft version.`)
    }
    if (item.neededBy && seen.has(version.project_id)) continue
    seen.add(version.project_id)
    result.push(version)
    for (const dep of version.dependencies) {
      if (dep.dependency_type !== 'required') continue
      if (dep.project_id && seen.has(dep.project_id)) continue
      if (!dep.project_id && !dep.version_id) continue
      queue.push(
        dep.project_id
          ? { project: dep.project_id, neededBy: version.project_id }
          : { version: dep.version_id!, neededBy: version.project_id }
      )
    }
  }
  return result
}

/** `loaders` are Modrinth loader tags; a Quilt instance passes ["quilt", "fabric"]. */
export function modrinthSource(mcVersion: string, loaders: string[]): ModSource & { projects(ids: string[]): Promise<MrProject[]> } {
  const titles = new Map<string, string>()
  return {
    async compatibleVersion(project) {
      const q = new URLSearchParams({
        loaders: JSON.stringify(loaders),
        game_versions: JSON.stringify([mcVersion])
      })
      const versions = await getJson<MrVersion[]>(`${API}/project/${encodeURIComponent(project)}/version?${q}`)
      return versions.find((v) => v.version_type === 'release') ?? versions[0]
    },
    version(id) {
      return getJson<MrVersion>(`${API}/version/${encodeURIComponent(id)}`)
    },
    async projectTitle(id) {
      if (!titles.has(id)) {
        const p = await getJson<MrProject>(`${API}/project/${encodeURIComponent(id)}`)
        titles.set(id, p.title)
      }
      return titles.get(id)!
    },
    async projects(ids) {
      if (!ids.length) return []
      return getJson<MrProject[]>(`${API}/projects?ids=${encodeURIComponent(JSON.stringify(ids))}`)
    }
  }
}

interface SearchResponse {
  hits: {
    project_id: string
    slug: string
    title: string
    description: string
    author: string
    icon_url?: string | null
    downloads: number
  }[]
  total_hits: number
}

export async function searchMods(query: string, mcVersion: string, loaders: string[], offset: number): Promise<ModSearchResult> {
  // Facets in one inner list are OR-ed: a Quilt instance sees Quilt and Fabric mods.
  const facets = [['project_type:mod'], loaders.map((l) => `categories:${l}`), [`versions:${mcVersion}`]]
  const q = new URLSearchParams({
    query,
    facets: JSON.stringify(facets),
    limit: '20',
    offset: String(offset),
    index: query.trim() ? 'relevance' : 'downloads'
  })
  const res = await getJson<SearchResponse>(`${API}/search?${q}`)
  return {
    total: res.total_hits,
    hits: res.hits.map((h) => ({
      projectId: h.project_id,
      slug: h.slug,
      title: h.title,
      description: h.description,
      author: h.author,
      iconUrl: h.icon_url ?? undefined,
      downloads: h.downloads
    }))
  }
}

interface ProjectFull extends MrProject {
  description: string
  body: string
  downloads: number
  followers: number
  updated: string
  categories: string[]
  license?: { id: string; name?: string } | null
  source_url?: string | null
  issues_url?: string | null
  wiki_url?: string | null
  discord_url?: string | null
}

interface TeamMember { role: string; user: { username: string }; ordering?: number }

/** Everything the details view shows for one project. */
export async function modDetails(projectId: string): Promise<ModDetails> {
  const id = encodeURIComponent(projectId)
  const [p, members] = await Promise.all([
    getJson<ProjectFull>(`${API}/project/${id}`),
    getJson<TeamMember[]>(`${API}/project/${id}/members`).catch(() => [] as TeamMember[])
  ])
  const owner = members.find((m) => m.role === 'Owner') ?? [...members].sort((a, b) => (a.ordering ?? 0) - (b.ordering ?? 0))[0]
  const links = [
    { label: 'Modrinth page', url: `https://modrinth.com/mod/${p.slug}` },
    { label: 'Source code', url: p.source_url },
    { label: 'Issues', url: p.issues_url },
    { label: 'Wiki', url: p.wiki_url },
    { label: 'Discord', url: p.discord_url }
  ].filter((l): l is { label: string; url: string } => !!l.url && l.url.startsWith('https://'))
  return {
    projectId: p.id,
    slug: p.slug,
    title: p.title,
    description: p.description,
    body: p.body,
    iconUrl: p.icon_url ?? undefined,
    author: owner?.user.username,
    downloads: p.downloads,
    followers: p.followers,
    updated: p.updated,
    license: p.license && p.license.id !== 'LicenseRef-Unknown' ? (p.license.name || p.license.id.replace(/^LicenseRef-/, '').replace(/-/g, ' ')) : undefined,
    categories: p.categories.filter((c) => c !== 'fabric' && c !== 'quilt' && c !== 'forge' && c !== 'neoforge'),
    links
  }
}

/** Newest compatible version for each file hash. */
export async function latestVersions(sha1s: string[], mcVersion: string, loaders: string[]): Promise<Record<string, MrVersion>> {
  if (!sha1s.length) return {}
  return postJson<Record<string, MrVersion>>(`${API}/version_files/update`, {
    hashes: sha1s,
    algorithm: 'sha1',
    loaders,
    game_versions: [mcVersion]
  })
}
