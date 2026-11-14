export const USER_AGENT = 'hearth-launcher/0.1.0'

export class HttpError extends Error {
  constructor(public status: number, public url: string, public body: string) {
    super(`HTTP ${status} for ${url}`)
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** fetch with a User-Agent and retries on network errors and 5xx. */
export async function request(url: string, init: RequestInit = {}, retries = 3): Promise<Response> {
  let lastError: unknown
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        ...init,
        headers: { 'User-Agent': USER_AGENT, ...(init.headers ?? {}) }
      })
      if (res.ok) return res
      const body = await res.text().catch(() => '')
      if (res.status < 500 && res.status !== 429) throw new HttpError(res.status, url, body)
      lastError = new HttpError(res.status, url, body)
    } catch (err) {
      if (err instanceof HttpError && err.status < 500 && err.status !== 429) throw err
      lastError = err
    }
    if (attempt < retries) await sleep(400 * 2 ** attempt)
  }
  throw lastError
}

export async function getJson<T>(url: string, init?: RequestInit): Promise<T> {
  return (await request(url, init)).json() as Promise<T>
}

export async function postJson<T>(url: string, body: unknown, headers: Record<string, string> = {}): Promise<T> {
  const res = await request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...headers },
    body: JSON.stringify(body)
  }, 1)
  return res.json() as Promise<T>
}
