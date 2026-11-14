import { createHash } from 'node:crypto'
import { createWriteStream } from 'node:fs'
import { chmod, mkdir, rename, rm, stat } from 'node:fs/promises'
import { dirname } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { request } from './http'

export interface DownloadTask {
  url: string
  path: string
  sha1?: string
  size?: number
  executable?: boolean
}

async function exists(path: string, size?: number): Promise<boolean> {
  try {
    const s = await stat(path)
    return s.isFile() && (size === undefined || s.size === size)
  } catch {
    return false
  }
}

/** Download one file to a temp path, verify its SHA-1, then move it into place. */
export async function downloadFile(task: DownloadTask): Promise<void> {
  await mkdir(dirname(task.path), { recursive: true })
  const part = `${task.path}.part`
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await request(task.url)
      if (!res.body) throw new Error(`Empty response for ${task.url}`)
      const hash = createHash('sha1')
      const body = Readable.fromWeb(res.body as never)
      body.on('data', (chunk: Buffer) => hash.update(chunk))
      await pipeline(body, createWriteStream(part))
      const digest = hash.digest('hex')
      if (task.sha1 && digest !== task.sha1.toLowerCase()) {
        throw new Error(`Checksum mismatch for ${task.url}`)
      }
      await rename(part, task.path)
      if (task.executable) await chmod(task.path, 0o755)
      return
    } catch (err) {
      await rm(part, { force: true })
      if (attempt >= 2) throw err
    }
  }
}

/**
 * Download everything that is missing, `concurrency` files at a time.
 * Files already on disk with the right size are skipped.
 */
export async function downloadAll(
  tasks: DownloadTask[],
  onProgress: (done: number, total: number) => void,
  concurrency = 8
): Promise<void> {
  const unique = [...new Map(tasks.map((t) => [t.path, t])).values()]
  const missing: DownloadTask[] = []
  await Promise.all(unique.map(async (t) => { if (!(await exists(t.path, t.size))) missing.push(t) }))
  let done = 0
  const total = missing.length
  onProgress(0, total)
  let next = 0
  let failure: unknown
  const worker = async () => {
    while (next < missing.length && !failure) {
      const task = missing[next++]
      try {
        await downloadFile(task)
      } catch (err) {
        failure = err
        return
      }
      onProgress(++done, total)
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, total) }, worker))
  if (failure) throw failure
}

export async function sha1File(data: Buffer): Promise<string> {
  return createHash('sha1').update(data).digest('hex')
}
