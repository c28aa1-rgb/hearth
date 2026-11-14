import { mix } from './color'
import { rngFor } from './rng'

/**
 * A layered, blocky landscape seeded from an instance id.
 * Ridge heights snap to a step grid, so hills read as terrain made of blocks
 * without resorting to pixel art. Nearer ridges use bigger steps.
 */

export const SCENE_W = 1600
export const SCENE_H = 900

interface Mood {
  name: string
  sky: [string, string, string] // top, middle, horizon
  far: string // farthest ridge
  near: string // nearest ridge
  light: string // sun or moon
  stars: boolean
}

const MOODS: Mood[] = [
  { name: 'dusk', sky: ['#2a2140', '#8d4d55', '#eaa36b'], far: '#9a6566', near: '#1d1513', light: '#ffd9a0', stars: false },
  { name: 'night', sky: ['#0c1020', '#1d2443', '#3e3d60'], far: '#353a5c', near: '#0e0d14', light: '#e9e4d4', stars: true },
  { name: 'pre-dawn', sky: ['#18203a', '#4f5b7e', '#d0a58a'], far: '#6c6c86', near: '#16151b', light: '#ffe4c2', stars: true },
  { name: 'haze', sky: ['#5f7f99', '#a9b8b8', '#ead7b1'], far: '#8f9c90', near: '#232219', light: '#fff1d0', stars: false },
  { name: 'ember', sky: ['#1f1418', '#5e2f2b', '#d9763c'], far: '#7d4135', near: '#140e0c', light: '#ffc27a', stars: false }
]

export interface Ridge {
  path: string
  color: string
  /** seconds for one full parallax loop */
  period: number
}

export interface Scene {
  mood: string
  sky: [string, string, string]
  light: { x: number; y: number; r: number; color: string }
  stars: { x: number; y: number; r: number; o: number }[]
  ridges: Ridge[]
  /** A colour from the scene, used for auto instance icons. */
  accent: string
}

/** Periodic smooth noise in [0,1], wrapping every SCENE_W units. */
function periodicNoise(rand: () => number, points: number) {
  const values = Array.from({ length: points }, rand)
  return (x: number) => {
    const t = ((x / SCENE_W) * points) % points
    const i = Math.floor(t)
    const f = t - i
    const a = values[i % points]
    const b = values[(i + 1) % points]
    const s = (1 - Math.cos(f * Math.PI)) / 2
    return a + (b - a) * s
  }
}

/** Block widths that divide the scene width, so the loop is seamless. */
const BLOCKS = [16, 20, 25, 32, 40, 50]

export function generateScene(seed: string): Scene {
  const rand = rngFor(seed)
  const mood = MOODS[Math.floor(rand() * MOODS.length)]
  const layerCount = 5
  const ridges: Ridge[] = []

  for (let layer = 0; layer < layerCount; layer++) {
    const depth = layer / (layerCount - 1) // 0 = far, 1 = near
    const bw = BLOCKS[Math.min(BLOCKS.length - 1, layer + (rand() < 0.5 ? 0 : 1))]
    const step = bw / 2
    const base = SCENE_H * (0.5 + depth * 0.32)
    const amp = SCENE_H * (0.1 + depth * 0.12)
    const coarse = periodicNoise(rand, 3 + Math.floor(rand() * 3))
    const fine = periodicNoise(rand, 9 + Math.floor(rand() * 6))
    const height = (x: number) => coarse(x) * 0.75 + fine(x) * 0.25

    // Two copies side by side so the layer can slide left and loop.
    let d = `M0 ${SCENE_H}`
    for (let x = 0; x < SCENE_W * 2; x += bw) {
      const h = height((x % SCENE_W) + bw / 2)
      const y = Math.round((base - amp * h) / step) * step
      d += ` V${y} H${x + bw}`
    }
    d += ` V${SCENE_H} Z`

    ridges.push({
      path: d,
      color: mix(mood.far, mood.near, Math.pow(depth, 0.8)),
      period: 260 - depth * 170
    })
  }

  const stars = mood.stars
    ? Array.from({ length: 70 }, () => ({
        x: rand() * SCENE_W,
        y: rand() * SCENE_H * 0.45,
        r: 0.6 + rand() * 1.3,
        o: 0.25 + rand() * 0.6
      }))
    : []

  return {
    mood: mood.name,
    sky: mood.sky,
    light: {
      // Right half only: the title and Play button live bottom-left.
      x: SCENE_W * (0.58 + rand() * 0.27),
      y: SCENE_H * (0.28 + rand() * 0.14),
      r: 34 + rand() * 30,
      color: mood.light
    },
    stars,
    ridges,
    accent: mix(mood.far, mood.sky[1], 0.35)
  }
}
