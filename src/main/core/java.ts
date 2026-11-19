import { existsSync } from 'node:fs'
import { mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { downloadAll, type DownloadTask } from './download'
import { getJson } from './http'
import { javaBinaryIn, javaPlatformKey, platformName } from './platform'

const RUNTIMES_URL =
  'https://launchermeta.mojang.com/v1/products/java-runtime/2ec0cc96c44e5a76b9c8b7c39df7210883d12871/all.json'

type RuntimeIndex = Record<string, Record<string, { manifest: { url: string; sha1: string }; version: { name: string } }[]>>

type RuntimeFile =
  | { type: 'directory' }
  | { type: 'file'; executable?: boolean; downloads: { raw: { url: string; sha1: string; size: number } } }
  | { type: 'link'; target: string }

interface RuntimeManifest { files: Record<string, RuntimeFile> }

/** Where the `java` binary lives inside an installed Mojang runtime on this machine. */
export function javaBinary(javaDir: string, component: string): string {
  return javaBinaryIn(join(javaDir, component))
}

/**
 * Make sure Mojang's Java runtime `component` (e.g. java-runtime-delta) is installed.
 * Returns the path to the java binary.
 */
export async function ensureJava(
  javaDir: string,
  component: string,
  onProgress: (done: number, total: number) => void
): Promise<string> {
  const root = join(javaDir, component)
  const marker = join(root, '.hearth-installed')
  const binary = javaBinary(javaDir, component)

  const index = await getJson<RuntimeIndex>(RUNTIMES_URL).catch(() => undefined)
  const entry = index?.[javaPlatformKey()]?.[component]?.[0]
  if (!entry) {
    if (existsSync(marker) && existsSync(binary)) return binary // offline, use what we have
    throw new Error(`Mojang has no ${component} Java runtime for ${platformName()}.`)
  }
  const installed = existsSync(marker) ? (await readFile(marker, 'utf8')).trim() : ''
  if (installed === entry.manifest.sha1 && existsSync(binary)) return binary

  const manifest = await getJson<RuntimeManifest>(entry.manifest.url)
  const tasks: DownloadTask[] = []
  const links: [string, string][] = []
  for (const [rel, file] of Object.entries(manifest.files)) {
    const path = join(root, rel)
    if (file.type === 'directory') await mkdir(path, { recursive: true })
    else if (file.type === 'file') {
      const raw = file.downloads.raw
      tasks.push({ url: raw.url, sha1: raw.sha1, size: raw.size, path, executable: file.executable })
    } else links.push([path, file.target])
  }
  await downloadAll(tasks, onProgress)
  for (const [path, target] of links) {
    await mkdir(dirname(path), { recursive: true })
    await rm(path, { force: true })
    // Windows needs extra rights for symlinks; its runtimes don't rely on them, so skip failures.
    await symlink(target, path).catch((err: unknown) => { if (process.platform !== 'win32') throw err })
  }
  if (!existsSync(binary)) throw new Error(`Java installed, but ${binary} is missing.`)
  await writeFile(marker, entry.manifest.sha1)
  return binary
}
