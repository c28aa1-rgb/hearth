export function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(n >= 10_000 ? 0 : 1)}k`
  return String(n)
}

export function formatMemory(mb: number): string {
  const gb = mb / 1024
  return `${Number.isInteger(gb) ? gb : gb.toFixed(1)} GB`
}

export function loaderLabel(loader: 'vanilla' | 'fabric'): string {
  return loader === 'fabric' ? 'Fabric' : 'Vanilla'
}

export function relativeTime(ts?: number): string | undefined {
  if (!ts) return undefined
  const s = (Date.now() - ts) / 1000
  if (s < 60) return 'just now'
  const m = s / 60
  if (m < 60) return `${Math.round(m)} min ago`
  const h = m / 60
  if (h < 24) return `${Math.round(h)} h ago`
  const d = h / 24
  if (d < 30) return `${Math.round(d)} d ago`
  return new Date(ts).toLocaleDateString()
}
