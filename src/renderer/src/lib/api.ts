import type { HearthApi } from '@shared/types'

declare global {
  interface Window { hearth: HearthApi }
}

export const api = window.hearth
