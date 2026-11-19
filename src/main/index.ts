import { join, normalize, sep } from 'node:path'
import { pathToFileURL } from 'node:url'
import { app, BrowserWindow, nativeImage, net, protocol, shell } from 'electron'
import macIcon from '../../resources/icon.png?asset'
import windowsIcon from '../../resources/icon-windows.png?asset'
import { runner } from './core/launch'
import { getSettings } from './core/settings'
import { broadcast, registerIpc } from './ipc'
import { paths } from './paths'

app.setName('Hearth')

// Development only: lets tools drive and screenshot the window over the DevTools protocol.
if (process.env.HEARTH_DEBUG_PORT) app.commandLine.appendSwitch('remote-debugging-port', process.env.HEARTH_DEBUG_PORT)

protocol.registerSchemesAsPrivileged([
  { scheme: 'hearth', privileges: { standard: true, secure: true, supportFetchAPI: true } }
])

let win: BrowserWindow | undefined

function createWindow() {
  win = new BrowserWindow({
    width: 1180,
    height: 760,
    minWidth: 920,
    minHeight: 600,
    show: false,
    title: 'Hearth',
    icon: process.platform === 'win32' ? windowsIcon : undefined,
    ...(process.platform === 'darwin'
      ? {
        titleBarStyle: 'hiddenInset' as const,
        trafficLightPosition: { x: 18, y: 18 },
        vibrancy: 'sidebar' as const,
        visualEffectState: 'followWindow' as const,
        backgroundColor: '#00000000'
      }
      : {
        // Windows: frameless look with the system's own window buttons drawn over the hero.
        titleBarStyle: 'hidden' as const,
        titleBarOverlay: { color: '#00000000', symbolColor: '#EEE5D8', height: 52 },
        backgroundColor: '#1B1612',
        autoHideMenuBar: true
      }),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false
    }
  })
  win.once('ready-to-show', () => win?.show())
  win.on('closed', () => { win = undefined })

  // Links open in the real browser, never inside Hearth.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (e, url) => {
    if (url.startsWith(process.env.ELECTRON_RENDERER_URL ?? 'file://')) return
    e.preventDefault()
    if (url.startsWith('https://')) void shell.openExternal(url)
  })

  if (process.env.ELECTRON_RENDERER_URL) void win.loadURL(process.env.ELECTRON_RENDERER_URL)
  else void win.loadFile(join(__dirname, '../renderer/index.html'))
}

app.whenReady().then(() => {
  // hearth://data/<path> serves files from the data directory, and nothing outside it.
  protocol.handle('hearth', (req) => {
    const url = new URL(req.url)
    const rel = decodeURIComponent(url.pathname).replace(/^\/+/, '')
    const file = normalize(join(paths.root, rel))
    if (url.host !== 'data' || !file.startsWith(normalize(paths.root) + sep)) return new Response('Not found', { status: 404 })
    return net.fetch(pathToFileURL(file).toString())
  })

  // The packaged app gets its icon from the bundle; `npm run dev` would otherwise show Electron's.
  if (process.platform === 'darwin' && !app.isPackaged) app.dock?.setIcon(nativeImage.createFromPath(macIcon))

  registerIpc(() => win)
  runner.on('state', async (state) => {
    broadcast({ type: 'run-state', state })
    if (state.status === 'running' && (await getSettings()).hideOnLaunch) win?.hide()
  })
  runner.on('log', (lines) => broadcast({ type: 'log', lines }))
  runner.on('exited', ({ instanceId, crashed }) => {
    broadcast({ type: 'instances-changed' })
    if (crashed) {
      win?.show()
      broadcast({ type: 'open-logs', instanceId })
    } else if (runner.running() === 0) {
      win?.show()
    }
  })

  createWindow()
  app.on('activate', () => {
    if (!win) createWindow()
    else win.show()
  })
})

app.on('window-all-closed', () => {
  if (runner.running() === 0) app.quit()
})
