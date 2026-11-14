// The contract between the main process and the renderer.

export type Loader = 'vanilla' | 'fabric'

export interface InstalledMod {
  projectId: string
  versionId: string
  versionNumber: string
  title: string
  iconUrl?: string
  fileName: string
  sha1: string
  enabled: boolean
  /** Added automatically because another mod needs it. */
  asDependency?: boolean
}

export type IconChoice =
  | { kind: 'auto' }
  | { kind: 'block'; name: string }
  | { kind: 'file'; file: string }

export type BackdropChoice =
  | { kind: 'auto' } // latest screenshot, else generated landscape
  | { kind: 'generated' }
  | { kind: 'file'; file: string }

export interface Instance {
  id: string
  name: string
  mcVersion: string
  loader: Loader
  loaderVersion?: string
  /** null = automatic */
  memoryMb: number | null
  icon: IconChoice
  backdrop: BackdropChoice
  mods: InstalledMod[]
  createdAt: number
  lastPlayedAt?: number
}

export interface InstanceView extends Instance {
  /** Resolved image for the hero, or undefined to use the generated landscape. */
  backdropUrl?: string
  iconUrl?: string
  autoMemoryMb: number
}

export interface McVersion {
  id: string
  type: 'release' | 'snapshot' | 'old_beta' | 'old_alpha'
  releaseTime: string
}

export interface FabricLoaderVersion {
  version: string
  stable: boolean
}

export interface NewInstanceInput {
  name: string
  mcVersion: string
  loader: Loader
}

export interface Account {
  id: string
  name: string
  kind: 'microsoft'
  skinUrl?: string
}

export type LaunchPhase = 'preparing' | 'java' | 'game' | 'assets' | 'mods' | 'account' | 'starting'

export interface LaunchProgress {
  phase: LaunchPhase
  label: string
  done: number
  total: number
}

export type RunStatus = 'idle' | 'installing' | 'running' | 'crashed'

export interface RunState {
  instanceId: string
  status: RunStatus
  progress?: LaunchProgress
  error?: string
  exitCode?: number | null
  /** Set when a background download finished: the instance can now start without downloading. */
  ready?: boolean
}

export type LogLevel = 'info' | 'warn' | 'error'

export interface LogLine {
  instanceId: string
  text: string
  level: LogLevel
}

export interface ModSearchHit {
  projectId: string
  slug: string
  title: string
  description: string
  author: string
  iconUrl?: string
  downloads: number
}

export interface ModSearchResult {
  hits: ModSearchHit[]
  total: number
}

export interface ModDetails {
  projectId: string
  slug: string
  title: string
  description: string
  /** Markdown (may contain HTML) written by the mod's authors. */
  body: string
  iconUrl?: string
  author?: string
  downloads: number
  followers: number
  updated: string
  license?: string
  categories: string[]
  links: { label: string; url: string }[]
}

export interface ModUpdate {
  projectId: string
  versionId: string
  versionNumber: string
}

export interface Settings {
  hideOnLaunch: boolean
  showSnapshots: boolean
  activeAccountId?: string
}

export interface AppInfo {
  microsoftConfigured: boolean
  systemMemoryMb: number
  dataDir: string
}

export type HearthEvent =
  | { type: 'run-state'; state: RunState }
  | { type: 'log'; lines: LogLine[] }
  | { type: 'instances-changed' }
  | { type: 'open-logs'; instanceId: string }

export interface HearthApi {
  app: {
    info(): Promise<AppInfo>
  }
  versions: {
    list(): Promise<McVersion[]>
  }
  instances: {
    list(): Promise<InstanceView[]>
    create(input: NewInstanceInput): Promise<InstanceView>
    update(id: string, patch: Partial<Pick<Instance, 'name' | 'memoryMb' | 'icon' | 'backdrop'>>): Promise<InstanceView>
    clone(id: string): Promise<InstanceView>
    remove(id: string): Promise<void>
    openFolder(id: string): Promise<void>
    pickImage(id: string, purpose: 'icon' | 'backdrop'): Promise<InstanceView | null>
  }
  launch: {
    start(id: string): Promise<void>
    stop(id: string): Promise<void>
    states(): Promise<RunState[]>
    logs(id: string): Promise<LogLine[]>
  }
  mods: {
    search(instanceId: string, query: string, offset: number): Promise<ModSearchResult>
    details(projectId: string): Promise<ModDetails>
    install(instanceId: string, projectId: string): Promise<InstanceView>
    remove(instanceId: string, projectId: string): Promise<InstanceView>
    setEnabled(instanceId: string, projectId: string, enabled: boolean): Promise<InstanceView>
    checkUpdates(instanceId: string): Promise<ModUpdate[]>
    update(instanceId: string, updates: ModUpdate[]): Promise<InstanceView>
  }
  accounts: {
    list(): Promise<Account[]>
    signInMicrosoft(): Promise<Account>
    remove(id: string): Promise<void>
  }
  settings: {
    get(): Promise<Settings>
    set(patch: Partial<Settings>): Promise<Settings>
  }
  on(listener: (event: HearthEvent) => void): () => void
}
