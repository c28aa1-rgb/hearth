import { spawn, type ChildProcess } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import type { LaunchPhase, LogLine, RunState } from '@shared/types'
import { launchIdentity } from '../auth/accounts'
import { paths } from '../paths'
import { buildLaunchArgs } from './args'
import { classify } from './launch-classify'
import { downloadAll } from './download'
import { fabricProfile, latestFabricLoader } from './fabric'
import { readInstance, systemMemoryMb, writeInstance } from './instances'
import { ensureJava } from './java'
import { autoMemoryMb } from './memory'
import { syncMods } from './mods'
import { assetTasks, clientJarTask, getVersionJson, mergeVersions, resolveLibraries, type VersionJson } from './mojang'
import { MAC_ARM64 } from './rules'
import type { Instance } from '@shared/types'

const MAX_LOG_LINES = 5000

interface Events {
  state: [RunState]
  log: [LogLine[]]
  exited: [{ instanceId: string; crashed: boolean }]
}

/** Everything a launch needs that lives in the shared store. */
interface Prepared {
  version: VersionJson
  java: string
  classpath: string[]
}

class Runner extends EventEmitter<Events> {
  /** Downloads in flight, shared by "download on create" and Play. */
  private prepares = new Map<string, Promise<Prepared>>()
  private launching = new Set<string>()
  private states = new Map<string, RunState>()
  private logs = new Map<string, LogLine[]>()
  private procs = new Map<string, ChildProcess>()
  private stopping = new Set<string>()
  private pending: LogLine[] = []
  private flushTimer?: NodeJS.Timeout

  allStates(): RunState[] {
    return [...this.states.values()]
  }

  logsFor(id: string): LogLine[] {
    return this.logs.get(id) ?? []
  }

  running(): number {
    return this.procs.size
  }

  private set(state: RunState) {
    this.states.set(state.instanceId, state)
    this.emit('state', state)
  }

  private log(instanceId: string, text: string, forced?: LogLine['level']) {
    const list = this.logs.get(instanceId) ?? []
    const level = forced ?? classify(text, list.at(-1)?.level ?? 'info')
    const line = { instanceId, text, level }
    list.push(line)
    if (list.length > MAX_LOG_LINES) list.splice(0, list.length - MAX_LOG_LINES)
    this.logs.set(instanceId, list)
    this.pending.push(line)
    this.flushTimer ??= setTimeout(() => {
      this.flushTimer = undefined
      const batch = this.pending
      this.pending = []
      this.emit('log', batch)
    }, 80)
  }

  private progress(id: string, phase: LaunchPhase, label: string, done = 0, total = 0) {
    this.set({ instanceId: id, status: 'installing', progress: { phase, label, done, total } })
  }

  /** Java, the game, libraries and assets for an instance. Only touches the shared store. */
  private async download(id: string, inst: Instance): Promise<Prepared> {
    this.progress(id, 'preparing', 'Getting ready')
    const vanilla = await getVersionJson(paths.versions, inst.mcVersion)
    let version = vanilla
    if (inst.loader === 'fabric') {
      const loader = inst.loaderVersion ?? (await latestFabricLoader(inst.mcVersion))
      version = mergeVersions(vanilla, await fabricProfile(paths.versions, inst.mcVersion, loader))
    }

    const component = vanilla.javaVersion?.component ?? 'java-runtime-gamma'
    const java = await ensureJava(paths.java, component, (d, t) => this.progress(id, 'java', 'Downloading Java', d, t))

    const libs = resolveLibraries(version, paths.libraries, MAC_ARM64)
    const client = clientJarTask(vanilla, paths.versions, inst.mcVersion)
    await downloadAll([client, ...libs.tasks], (d, t) => this.progress(id, 'game', 'Downloading Minecraft', d, t))
    await downloadAll(await assetTasks(vanilla, paths.assets), (d, t) => this.progress(id, 'assets', 'Downloading assets', d, t))
    return { version, java, classpath: [...libs.classpath, client.path] }
  }

  private prepare(id: string, inst: Instance): Promise<Prepared> {
    let pending = this.prepares.get(id)
    if (!pending) {
      pending = this.download(id, inst).finally(() => this.prepares.delete(id))
      this.prepares.set(id, pending)
    }
    return pending
  }

  /** Download everything an instance needs without starting it (used right after creation). */
  async install(id: string): Promise<void> {
    if (this.prepares.has(id) || this.launching.has(id) || this.procs.has(id)) return
    try {
      await this.prepare(id, await readInstance(id))
      if (!this.launching.has(id)) this.set({ instanceId: id, status: 'idle', ready: true })
    } catch (err) {
      if (this.launching.has(id)) return // Play is waiting on this download and reports the error itself.
      const message = err instanceof Error ? err.message : String(err)
      this.log(id, `Download failed: ${message}`, 'error')
      this.set({ instanceId: id, status: 'idle', error: `Download failed: ${message}. Press Play to try again.` })
    }
  }

  async start(id: string): Promise<void> {
    if (this.launching.has(id) || this.procs.has(id)) return
    this.launching.add(id)
    this.logs.set(id, [])
    try {
      const prepared = await this.prepare(id, await readInstance(id))
      // Re-read: mods or settings may have changed while files were downloading.
      let inst = await readInstance(id)
      const { version, java, classpath } = prepared

      this.progress(id, 'mods', 'Checking mods')
      await syncMods(inst)

      this.progress(id, 'account', 'Signing in')
      const player = await launchIdentity()

      this.progress(id, 'starting', 'Starting Minecraft')
      const gameDir = paths.gameDir(id)
      const nativesDir = join(paths.natives, version.id)
      await mkdir(gameDir, { recursive: true })
      await mkdir(nativesDir, { recursive: true })
      const modCount = inst.loader === 'fabric' ? inst.mods.filter((m) => m.enabled).length : 0
      const args = buildLaunchArgs(version, {
        javaPath: java,
        classpath,
        gameDir,
        assetsDir: paths.assets,
        librariesDir: paths.libraries,
        nativesDir,
        memoryMb: inst.memoryMb ?? autoMemoryMb(modCount, systemMemoryMb()),
        player,
        launcherName: 'hearth',
        launcherVersion: '0.1.0'
      }, MAC_ARM64)

      const child = spawn(java, args, { cwd: gameDir, env: { ...process.env }, stdio: ['ignore', 'pipe', 'pipe'] })
      this.procs.set(id, child)
      inst = { ...inst, lastPlayedAt: Date.now() }
      await writeInstance(inst)
      this.set({ instanceId: id, status: 'running' })

      let carry = { out: '', err: '' }
      const onData = (key: 'out' | 'err') => (chunk: Buffer) => {
        const text = carry[key] + chunk.toString('utf8')
        const lines = text.split(/\r?\n/)
        carry[key] = lines.pop() ?? ''
        for (const l of lines) if (l.length) this.log(id, l)
      }
      child.stdout!.on('data', onData('out'))
      child.stderr!.on('data', onData('err'))
      child.on('error', (err) => this.log(id, `Could not start Java: ${err.message}`, 'error'))
      child.on('exit', (code, signal) => {
        if (carry.out) this.log(id, carry.out)
        if (carry.err) this.log(id, carry.err)
        this.procs.delete(id)
        const stopped = this.stopping.delete(id)
        const crashed = !stopped && code !== 0
        if (crashed) this.log(id, `Minecraft stopped unexpectedly (exit ${code ?? signal}). The lines marked red above usually explain why.`, 'error')
        else this.log(id, 'Minecraft closed.', 'info')
        this.set({ instanceId: id, status: crashed ? 'crashed' : 'idle', exitCode: code })
        this.emit('exited', { instanceId: id, crashed })
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      this.log(id, `Launch failed: ${message}`, 'error')
      this.set({ instanceId: id, status: 'idle', error: message })
    } finally {
      this.launching.delete(id)
    }
  }

  stop(id: string): void {
    const child = this.procs.get(id)
    if (!child) return
    this.stopping.add(id)
    child.kill('SIGTERM')
    setTimeout(() => { if (this.procs.get(id) === child) child.kill('SIGKILL') }, 5000)
  }
}

export const runner = new Runner()
