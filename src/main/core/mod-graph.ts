import type { InstalledMod } from '@shared/types'
import type { MrVersion } from './modrinth'

/** Project ids a version requires. Dependencies given only as a version id are matched against `resolved`. */
export function requiredProjects(version: MrVersion, resolved: readonly MrVersion[] = []): string[] {
  const ids = new Set<string>()
  for (const dep of version.dependencies) {
    if (dep.dependency_type !== 'required') continue
    const id = dep.project_id ?? resolved.find((v) => v.id === dep.version_id)?.project_id
    if (id && id !== version.project_id) ids.add(id)
  }
  return [...ids]
}

export function incompatibleProjects(version: MrVersion): string[] {
  return version.dependencies
    .filter((d) => d.dependency_type === 'incompatible' && d.project_id)
    .map((d) => d.project_id!)
}

/**
 * A mod about to be installed that can't run next to one already installed (in either
 * direction), as a sentence for the user. Mods being replaced by this install don't count.
 */
export function findConflict(
  installed: readonly InstalledMod[],
  incoming: readonly MrVersion[],
  titleOf: (projectId: string) => string
): string | undefined {
  const replacing = new Set(incoming.map((v) => v.project_id))
  const staying = installed.filter((m) => !replacing.has(m.projectId))
  for (const v of incoming) {
    for (const other of incompatibleProjects(v)) {
      const hit = staying.find((m) => m.projectId === other)
      if (hit) return `${titleOf(v.project_id)} can't be used together with ${hit.title}. Remove ${hit.title} first.`
    }
    const blocker = staying.find((m) => m.incompatibleWith?.includes(v.project_id))
    if (blocker) return `${blocker.title} can't be used together with ${titleOf(v.project_id)}.`
  }
  return undefined
}

/**
 * Dependencies that were added automatically and that nothing left needs any more.
 * Only decided when every remaining mod recorded its dependencies; mods installed by older
 * versions of Hearth didn't, and then nothing is removed (better a spare mod than a crash).
 */
export function orphanedDependencies(mods: readonly InstalledMod[]): string[] {
  let remaining = [...mods]
  const removed: string[] = []
  for (;;) {
    if (remaining.some((m) => !m.dependsOn)) return removed
    const needed = new Set(remaining.flatMap((m) => m.dependsOn ?? []))
    const orphans = remaining.filter((m) => m.asDependency && !needed.has(m.projectId))
    if (!orphans.length) return removed
    removed.push(...orphans.map((m) => m.projectId))
    remaining = remaining.filter((m) => !orphans.includes(m))
  }
}
