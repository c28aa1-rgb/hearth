import { describe, expect, it } from 'vitest'
import { buildLaunchArgs } from './args'
import { classify } from './launch-classify'
import { libraryKey, mavenPath } from './maven'
import { autoMemoryMb } from './memory'
import { mergeVersions, resolveLibraries, supportedVersions, type VersionJson } from './mojang'
import { NoCompatibleVersionError, resolveInstall, type ModSource, type MrVersion } from './modrinth'
import { MAC_ARM64, rulesAllow } from './rules'

describe('rules', () => {
  it('allows when there are no rules', () => expect(rulesAllow(undefined, MAC_ARM64)).toBe(true))
  it('matches macOS', () => {
    expect(rulesAllow([{ action: 'allow', os: { name: 'osx' } }], MAC_ARM64)).toBe(true)
    expect(rulesAllow([{ action: 'allow', os: { name: 'windows' } }], MAC_ARM64)).toBe(false)
  })
  it('lets the last matching rule win', () => {
    expect(rulesAllow([{ action: 'allow' }, { action: 'disallow', os: { name: 'osx' } }], MAC_ARM64)).toBe(false)
  })
  it('does not treat arm64 as x86', () => {
    expect(rulesAllow([{ action: 'allow', os: { arch: 'x86' } }], MAC_ARM64)).toBe(false)
  })
  it('treats missing features as false', () => {
    expect(rulesAllow([{ action: 'allow', features: { is_demo_user: true } }], MAC_ARM64)).toBe(false)
  })
})

describe('maven', () => {
  it('builds paths with classifiers and extensions', () => {
    expect(mavenPath('org.lwjgl:lwjgl:3.3.3:natives-macos-arm64'))
      .toBe('org/lwjgl/lwjgl/3.3.3/lwjgl-3.3.3-natives-macos-arm64.jar')
    expect(mavenPath('net.fabricmc:intermediary:1.21.4')).toBe('net/fabricmc/intermediary/1.21.4/intermediary-1.21.4.jar')
    expect(mavenPath('a.b:c:1@zip')).toBe('a/b/c/1/c-1.zip')
  })
  it('keys libraries without version', () => {
    expect(libraryKey('org.ow2.asm:asm:9.6')).toBe('org.ow2.asm:asm')
    expect(libraryKey('org.lwjgl:lwjgl:3.3.3:natives-macos')).toBe('org.lwjgl:lwjgl:natives-macos')
  })
})

const vanilla: VersionJson = {
  id: '1.21.4',
  type: 'release',
  mainClass: 'net.minecraft.client.main.Main',
  assetIndex: { id: '19', url: '', sha1: '', size: 1 },
  arguments: {
    jvm: [
      { rules: [{ action: 'allow', os: { name: 'osx' } }], value: ['-XstartOnFirstThread'] },
      { rules: [{ action: 'allow', os: { name: 'windows' } }], value: '-Xwindows' },
      '-Djava.library.path=${natives_directory}',
      '-cp', '${classpath}'
    ],
    game: [
      '--username', '${auth_player_name}', '--assetIndex', '${assets_index_name}',
      { rules: [{ action: 'allow', features: { is_demo_user: true } }], value: '--demo' }
    ]
  },
  libraries: [
    { name: 'org.ow2.asm:asm:9.3', downloads: { artifact: { path: 'org/ow2/asm/asm/9.3/asm-9.3.jar', url: 'https://x/asm-9.3.jar' } } },
    { name: 'org.lwjgl:lwjgl:3.3.3:natives-macos-arm64', rules: [{ action: 'allow', os: { name: 'osx' } }], downloads: { artifact: { path: 'l.jar', url: 'https://x/l.jar' } } },
    { name: 'org.lwjgl:lwjgl:3.3.3:natives-windows', rules: [{ action: 'allow', os: { name: 'windows' } }], downloads: { artifact: { path: 'w.jar', url: 'https://x/w.jar' } } }
  ]
}

const fabric: VersionJson = {
  id: 'fabric-loader-0.16.0-1.21.4',
  inheritsFrom: '1.21.4',
  mainClass: 'net.fabricmc.loader.impl.launch.knot.KnotClient',
  arguments: { game: [], jvm: ['-DFabricMcEmu= net.minecraft.client.main.Main '] },
  libraries: [{ name: 'org.ow2.asm:asm:9.7', url: 'https://maven.fabricmc.net/', sha1: 'abc', size: 10 }]
}

describe('versions', () => {
  it('merges Fabric onto vanilla, Fabric libraries winning', () => {
    const merged = mergeVersions(vanilla, fabric)
    expect(merged.mainClass).toBe(fabric.mainClass)
    expect(merged.assetIndex?.id).toBe('19')
    const asm = merged.libraries.filter((l) => l.name.startsWith('org.ow2.asm:asm:'))
    expect(asm).toHaveLength(1)
    expect(asm[0].name).toBe('org.ow2.asm:asm:9.7')
    expect(merged.arguments?.jvm).toContain('-DFabricMcEmu= net.minecraft.client.main.Main ')
  })
  it('resolves only Mac libraries, including maven-style ones', () => {
    const { tasks, classpath } = resolveLibraries(mergeVersions(vanilla, fabric), '/lib', MAC_ARM64)
    expect(classpath.map((p) => p.replace(/\\/g, '/'))).toEqual(['/lib/org/ow2/asm/asm/9.7/asm-9.7.jar', '/lib/l.jar'])
    expect(tasks[0].url).toBe('https://maven.fabricmc.net/org/ow2/asm/asm/9.7/asm-9.7.jar')
  })
  it('lists versions from 1.19 onwards', () => {
    const manifest = {
      latest: { release: '26.3', snapshot: '' },
      versions: [
        { id: '26.3', type: 'release' as const, releaseTime: '2026-09-01T00:00:00Z', url: '', sha1: '' },
        { id: '1.19', type: 'release' as const, releaseTime: '2022-06-07T00:00:00Z', url: '', sha1: '' },
        { id: '1.18.2', type: 'release' as const, releaseTime: '2022-02-28T00:00:00Z', url: '', sha1: '' }
      ]
    }
    expect(supportedVersions(manifest).map((v) => v.id)).toEqual(['26.3', '1.19'])
  })
})

describe('launch arguments', () => {
  it('builds a Mac command line with substitutions', () => {
    const args = buildLaunchArgs(vanilla, {
      javaPath: '/java', classpath: ['/a.jar', '/b.jar'], gameDir: '/g', assetsDir: '/as', librariesDir: '/lib',
      nativesDir: '/n', memoryMb: 4096,
      player: { name: 'Steve', uuid: 'u', accessToken: 't', userType: 'msa' },
      launcherName: 'hearth', launcherVersion: '0.1.0', classpathSeparator: ':'
    }, MAC_ARM64)
    expect(args).toEqual([
      '-Xmx4096M', '-Xms1024M', '-XstartOnFirstThread', '-Djava.library.path=/n', '-cp', '/a.jar:/b.jar',
      'net.minecraft.client.main.Main', '--username', 'Steve', '--assetIndex', '19'
    ])
  })
})

describe('memory', () => {
  it('scales with mods and caps at half of RAM', () => {
    expect(autoMemoryMb(0, 16384)).toBe(2048)
    expect(autoMemoryMb(20, 16384)).toBe(4096)
    expect(autoMemoryMb(100, 16384)).toBe(6144)
    expect(autoMemoryMb(100, 8192)).toBe(4096)
  })
})

describe('log levels', () => {
  it('marks errors and their stack traces', () => {
    expect(classify('[12:00:00] [Render thread/ERROR]: boom', 'info')).toBe('error')
    expect(classify('\tat net.minecraft.Foo.bar(Foo.java:1)', 'error')).toBe('error')
    expect(classify('[12:00:00] [main/WARN]: hmm', 'info')).toBe('warn')
    expect(classify('[12:00:00] [main/INFO]: ok', 'warn')).toBe('info')
  })
})

const v = (project: string, deps: MrVersion['dependencies'] = []): MrVersion => ({
  id: `${project}-v`, project_id: project, version_number: '1', version_type: 'release', dependencies: deps,
  files: [{ url: '', filename: `${project}.jar`, primary: true, size: 1, hashes: { sha1: project } }]
})

function fakeSource(versions: Record<string, MrVersion | undefined>): ModSource {
  return {
    compatibleVersion: async (p) => versions[p],
    version: async (id) => Object.values(versions).find((x) => x?.id === id)!,
    projectTitle: async (p) => p.toUpperCase()
  }
}

describe('mod dependencies', () => {
  it('installs required dependencies once, skipping installed and optional ones', async () => {
    const source = fakeSource({
      iris: v('iris', [
        { project_id: 'sodium', dependency_type: 'required' },
        { project_id: 'modmenu', dependency_type: 'optional' }
      ]),
      sodium: v('sodium', [{ project_id: 'fabric-api', dependency_type: 'required' }]),
      'fabric-api': v('fabric-api')
    })
    const plan = await resolveInstall('iris', source, new Set(['fabric-api']))
    expect(plan.map((x) => x.project_id)).toEqual(['iris', 'sodium'])
  })
  it('explains which dependency is missing', async () => {
    const source = fakeSource({ a: v('a', [{ project_id: 'b', dependency_type: 'required' }]), b: undefined })
    await expect(resolveInstall('a', source, new Set())).rejects.toThrow(NoCompatibleVersionError)
    await expect(resolveInstall('a', source, new Set())).rejects.toThrow('A needs B')
  })
})
