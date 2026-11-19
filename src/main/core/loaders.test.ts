import { describe, expect, it } from 'vitest'
import type { InstalledMod } from '@shared/types'
import { buildLaunchArgs } from './args'
import { compareVersions, loaderVersionId, modrinthLoaders, neoforgePrefix } from './loaders'
import { findConflict, orphanedDependencies, requiredProjects } from './mod-graph'
import type { MrVersion } from './modrinth'
import { resolveLibraries, type VersionJson } from './mojang'
import { hostEnv, javaBinaryIn, javaPlatformKey } from './platform'
import { rulesAllow } from './rules'

describe('platforms', () => {
  const win = hostEnv('win32', 'x64', '10.0.22631')
  it('maps Windows to Mojang rule names', () => {
    expect(win).toMatchObject({ osName: 'windows', arch: 'x86_64' })
    expect(rulesAllow([{ action: 'allow', os: { name: 'windows' } }], win)).toBe(true)
    expect(rulesAllow([{ action: 'allow', os: { name: 'osx' } }], win)).toBe(false)
    expect(rulesAllow([{ action: 'allow', os: { arch: 'x86' } }], win)).toBe(false)
  })
  it('picks the right Java runtime and binary', () => {
    expect(javaPlatformKey('win32', 'x64')).toBe('windows-x64')
    expect(javaPlatformKey('win32', 'arm64')).toBe('windows-arm64')
    expect(javaPlatformKey('darwin', 'arm64')).toBe('mac-os-arm64')
    expect(javaBinaryIn('/j', 'win32').replace(/\\/g, '/')).toBe('/j/bin/java.exe')
    expect(javaBinaryIn('/j', 'darwin')).toBe('/j/jre.bundle/Contents/Home/bin/java')
  })
  it('joins the classpath with the platform separator', () => {
    const v: VersionJson = { id: 'x', mainClass: 'M', libraries: [], arguments: { jvm: ['-cp', '${classpath}'] } }
    const args = buildLaunchArgs(v, {
      javaPath: 'java', classpath: ['a.jar', 'b.jar'], gameDir: 'g', assetsDir: 'a', librariesDir: 'l', nativesDir: 'n',
      memoryMb: 2048, player: { name: 'p', uuid: 'u', accessToken: 't', userType: 'msa' },
      launcherName: 'hearth', launcherVersion: '0', classpathSeparator: ';'
    }, win)
    expect(args).toContain('a.jar;b.jar')
  })
})

describe('loaders', () => {
  it('numbers NeoForge builds after the game version', () => {
    expect(neoforgePrefix('1.21.1')).toBe('21.1.')
    expect(neoforgePrefix('1.21')).toBe('21.0.')
    expect(neoforgePrefix('26.3')).toBe('26.3.0.')
    expect(neoforgePrefix('26.1.2')).toBe('26.1.2.')
    expect(neoforgePrefix('25w14a')).toBeUndefined()
  })
  it('compares versions numerically', () => {
    expect(compareVersions('0.29.1', '0.24.0')).toBeGreaterThan(0)
    expect(compareVersions('21.1.267', '21.1.99')).toBeGreaterThan(0)
    expect(compareVersions('1.0', '1.0')).toBe(0)
  })
  it('names loader profiles like the official launcher', () => {
    expect(loaderVersionId('forge', '1.21.1', '52.1.20')).toBe('1.21.1-forge-52.1.20')
    expect(loaderVersionId('neoforge', '1.21.1', '21.1.267')).toBe('neoforge-21.1.267')
    expect(loaderVersionId('quilt', '1.21.1', '0.29.1')).toBe('quilt-loader-0.29.1-1.21.1')
  })
  it('lets Quilt use Fabric mods', () => {
    expect(modrinthLoaders('quilt')).toEqual(['quilt', 'fabric'])
    expect(modrinthLoaders('neoforge')).toEqual(['neoforge'])
  })
  it('keeps installer-built libraries on the classpath without downloading them', () => {
    const v: VersionJson = {
      id: 'forge', mainClass: 'M',
      libraries: [{ name: 'net.minecraftforge:forge:1.21.1-52.1.20:client', downloads: { artifact: { path: 'net/f/client.jar', url: '' } } }]
    }
    const { tasks, classpath } = resolveLibraries(v, '/lib', hostEnv('darwin', 'arm64', '24.0'))
    expect(tasks).toHaveLength(0)
    expect(classpath.map((p) => p.replace(/\\/g, '/'))).toEqual(['/lib/net/f/client.jar'])
  })
})

const mod = (projectId: string, extra: Partial<InstalledMod> = {}): InstalledMod => ({
  projectId, versionId: `${projectId}-v`, versionNumber: '1', title: projectId.toUpperCase(),
  fileName: `${projectId}.jar`, sha1: projectId, enabled: true, dependsOn: [], ...extra
})
const version = (project_id: string, deps: MrVersion['dependencies'] = []): MrVersion => ({
  id: `${project_id}-v`, project_id, version_number: '1', version_type: 'release', files: [], dependencies: deps
})

describe('mod dependencies', () => {
  it('records required projects, including ones given by version id', () => {
    const lib = version('lib')
    const v = version('a', [
      { project_id: 'api', dependency_type: 'required' },
      { version_id: 'lib-v', dependency_type: 'required' },
      { project_id: 'extra', dependency_type: 'optional' }
    ])
    expect(requiredProjects(v, [v, lib])).toEqual(['api', 'lib'])
  })
  it('removes dependencies nothing needs any more, in chains', () => {
    const mods = [mod('fabric-api'), mod('lib', { asDependency: true, dependsOn: ['core'] }), mod('core', { asDependency: true })]
    expect(orphanedDependencies(mods).sort()).toEqual(['core', 'lib'])
    expect(orphanedDependencies([...mods, mod('b', { dependsOn: ['lib'] })])).toEqual([])
  })
  it("keeps everything when an older mod didn't record its dependencies", () => {
    expect(orphanedDependencies([mod('old', { dependsOn: undefined }), mod('lib', { asDependency: true })])).toEqual([])
  })
  it('refuses incompatible mods in both directions', () => {
    const title = (id: string) => id.toUpperCase()
    expect(findConflict([mod('optifine')], [version('sodium', [{ project_id: 'optifine', dependency_type: 'incompatible' }])], title))
      .toBe("SODIUM can't be used together with OPTIFINE. Remove OPTIFINE first.")
    expect(findConflict([mod('sodium', { incompatibleWith: ['optifine'] })], [version('optifine')], title))
      .toBe("SODIUM can't be used together with OPTIFINE.")
    expect(findConflict([mod('sodium')], [version('sodium')], title)).toBeUndefined()
  })
})
