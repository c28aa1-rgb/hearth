/** Bundled instance icons: simple isometric blocks in Hearth's own palettes. */
export interface BlockStyle { top: string; left: string; right: string; band?: string }

export const BLOCK_STYLES: Record<string, BlockStyle> = {
  meadow: { top: '#7fa65a', left: '#7a5a3e', right: '#5e432d', band: '#6c9450' },
  sand: { top: '#ecd9a4', left: '#d4bd84', right: '#b9a26c' },
  stone: { top: '#9d9a95', left: '#7f7c78', right: '#64615e' },
  timber: { top: '#c49a62', left: '#9c7246', right: '#7c5734' },
  snow: { top: '#f4f2ee', left: '#7a5a3e', right: '#5e432d', band: '#e3e1dc' },
  obsidian: { top: '#3a2c4f', left: '#271d36', right: '#1b1426' },
  ember: { top: '#ffc27a', left: '#f0913a', right: '#c36a22' },
  copper: { top: '#d98a5f', left: '#b86b44', right: '#94533a' },
  moss: { top: '#93b36d', left: '#6f8a55', right: '#566c42' },
  amethyst: { top: '#b48ce0', left: '#8e66bb', right: '#6f4c96' },
  clay: { top: '#a7aab8', left: '#8b8e9c', right: '#6f7280' },
  brick: { top: '#b4614e', left: '#94493a', right: '#76382c' }
}

export const BLOCK_NAMES = Object.keys(BLOCK_STYLES)
