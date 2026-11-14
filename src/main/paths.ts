import { join } from 'node:path'
import { app } from 'electron'

/** Every path Hearth writes to lives under one directory. */
export function dataDir(): string {
  // HEARTH_DATA_DIR lets development and tests use a throwaway folder.
  return process.env.HEARTH_DATA_DIR || join(app.getPath('appData'), 'Hearth')
}

export const paths = {
  get root() { return dataDir() },
  get settings() { return join(dataDir(), 'settings.json') },
  get accounts() { return join(dataDir(), 'accounts.json') },
  get store() { return join(dataDir(), 'store') },
  get versions() { return join(dataDir(), 'store', 'versions') },
  get libraries() { return join(dataDir(), 'store', 'libraries') },
  get assets() { return join(dataDir(), 'store', 'assets') },
  get java() { return join(dataDir(), 'store', 'java') },
  get mods() { return join(dataDir(), 'store', 'mods') },
  get natives() { return join(dataDir(), 'store', 'natives') },
  get instances() { return join(dataDir(), 'instances') },
  instance(id: string) { return join(dataDir(), 'instances', id) },
  gameDir(id: string) { return join(dataDir(), 'instances', id, 'minecraft') }
}
