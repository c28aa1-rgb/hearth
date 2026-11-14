import type { LogLevel } from '@shared/types'

/** Error/warn level of a log line. Stack trace lines inherit the level above them. */
export function classify(text: string, previous: LogLevel): LogLevel {
  if (/\/(ERROR|FATAL)\]|^\s*Exception|Exception in thread|^Caused by:/.test(text)) return 'error'
  if (/^\s+at |^\s+\.\.\. \d+ more/.test(text)) return previous === 'error' ? 'error' : previous
  if (/\/WARN\]/.test(text)) return 'warn'
  return 'info'
}
