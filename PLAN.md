# Hearth — plan

A small, good-looking Minecraft: Java Edition launcher for Apple Silicon Macs, with
instances and Fabric mods from Modrinth. Anyone can run it from source:

```bash
git clone https://github.com/c28aa1-rgb/hearth.git && cd hearth && npm install && npm run dev
```

Node is the only thing a person needs installed. Hearth downloads Java and Minecraft itself.

---

## 1. Decisions

| Area | Decision |
|---|---|
| Platform | macOS only, Apple Silicon (arm64) only |
| Distribution | Run from source with `npm run dev`. Public GitHub repo, MIT license. No signing needed (locally built apps are not quarantined) |
| Stack | Electron + React + TypeScript + Vite (`electron-vite`). Motion for animation. Zustand for UI state. No native npm modules |
| Minecraft versions | 1.19 and newer (first versions with native arm64 natives). Releases by default, snapshots behind a toggle |
| Loaders | Vanilla and Fabric. Fabric API is added to every new Fabric instance |
| Mods | Modrinth only. Search, install with required dependencies, enable/disable, remove, update badges (never auto-update) |
| Accounts | Microsoft sign-in in a pop-up window (auth code + PKCE), several accounts, tokens encrypted with `safeStorage` (Keychain). No offline accounts: playing always needs a Microsoft account that owns the game |
| Java | Downloaded automatically from Mojang's Java runtime manifest (arm64 builds), shared across instances |
| Storage | One shared store for libraries, assets, game jars, Java and mod files. Instances get copy-on-write clones (APFS) of mod files, so duplicates cost no disk space |
| Memory | Automatic default (2 GB vanilla, 4–6 GB modded, capped at half of system RAM) with a per-instance slider |
| Launch behaviour | Several games can run at once. Launcher hides when a game starts (setting), comes back when all games close, and comes back with the log open if a game crashes |
| Telemetry | None |

### Not in v1
`.mrpack` import/export, resource/shader pack managers, Quilt, Forge/NeoForge, CurseForge,
versions older than 1.19, skins, server list, light theme, other platforms.

### Action item for the owner
Register an Azure app (public client, personal Microsoft account is fine) and submit the
Minecraft API review form at <https://aka.ms/mce-reviewappid>. Until it is approved,
`api.minecraftservices.com` rejects the app with 403 "Invalid app registration". Put the
client ID in `src/main/auth/config.ts`. A public client ID is safe to commit.

---

## 2. Storage footprint

| Piece | Size |
|---|---|
| Repo + `node_modules` (includes the Electron binary) | ~400 MB |
| One Minecraft version (jar + libraries + assets) | ~0.5–1 GB, shared by every instance on that version |
| Java runtime | ~200 MB each (1.19–1.20.4 use Java 17, 1.20.5+ use Java 21) |
| An instance | its own saves, configs and screenshots; mods are APFS clones |

A typical setup with two Minecraft versions stays under 3 GB.

---

## 3. Architecture

```
src/
  main/                 Electron main process (Node). All disk + network work lives here.
    index.ts            window, protocol, IPC registration
    paths.ts            data directory layout
    ipc.ts              typed IPC handlers
    core/
      http.ts           fetch with retries + User-Agent
      download.ts       parallel queue (8), SHA-1 verify, resume-safe temp files, progress
      rules.ts          Mojang library/argument rule evaluation (os, arch, features)
      maven.ts          maven coordinate -> path
      mojang.ts         version manifest, version JSON, client jar, libraries, assets
      java.ts           Mojang runtime manifest -> download + chmod + symlinks
      fabric.ts         Fabric meta: loader list, profile JSON, merge onto vanilla
      modrinth.ts       search, versions, dependency resolution, update check
      instances.ts      instance.json CRUD, clone, delete, screenshots
      launch.ts         install pipeline + argument building + spawn + log streaming
      settings.ts       app settings
    auth/
      config.ts         Azure client ID
      microsoft.ts      PKCE pop-up -> MSA -> Xbox Live -> XSTS -> Minecraft token
      accounts.ts       account list + safeStorage encryption + refresh
  preload/index.ts      contextBridge: exposes a typed `window.hearth` API
  shared/types.ts       types shared by main + renderer (IPC contract)
  renderer/             React UI
    main.tsx, App.tsx
    styles/             tokens.css, global.css
    components/         Sidebar, Hero, Backdrop, PlayButton, tabs, dialogs
    lib/                landscape generator, seeded RNG, formatting
    store.ts            Zustand store
```

Security: `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`. The renderer
only sees the `window.hearth` API. Local images (screenshots, icons) are served through a
`hearth://` protocol that only reads inside the data directory.

### Data directory

```
~/Library/Application Support/Hearth/
  settings.json
  accounts.json               tokens encrypted with safeStorage
  store/
    versions/<id>/<id>.json, <id>.jar
    libraries/<maven path>
    assets/indexes/, assets/objects/<2>/<hash>
    java/<component>/
    mods/<sha1>.jar           content-addressed mod files
  instances/<id>/
    instance.json             name, version, loader, memory, icon, mods metadata
    minecraft/                game directory: mods/, saves/, config/, screenshots/ …
```

### Launch pipeline (one progress ring, several phases)
1. Resolve version JSON (vanilla, merged with the Fabric profile if needed).
2. Make sure the Java runtime named in `javaVersion.component` is installed.
3. Download client jar, libraries (rules evaluated for `osx` + `arm64`) and assets.
4. Sync mods: clone enabled mods from `store/mods` into the instance's `mods/`.
5. Refresh the account token if it is close to expiring.
6. Build JVM + game arguments, substitute placeholders, spawn Java, stream logs.

From 1.19 onwards, LWJGL natives ship as classpath jars, so nothing has to be extracted.

---

## 4. Design spec

### Subject
A launcher is the doorway into a world you've built. People open it dozens of times, so
it should get out of the way, and the one place it spends personality is the instance
backdrop: your world, waiting.

### Colour

| Token | Hex | Use |
|---|---|---|
| `--hearthstone` | `#1B1612` | window background behind the hero |
| `--soot` | `#241D18` | sidebar (semi-transparent over macOS vibrancy) and panels |
| `--ash` | `#322923` | raised surfaces, inputs, hover |
| `--bone` | `#EEE5D8` | primary text |
| `--cinder` | `#A3958A` | secondary text |
| `--ember` | `#F0913A` | the one accent: Play, focus rings, progress |
| `--ember-hot` | `#FFC27A` | inner glow of the Play button only |
| `--redstone` | `#E25B45` | errors, crash lines in logs |
| `--moss` | `#93B36D` | running dot, success |

The blacks are warm brown, never neutral grey. Ember is a yellow-leaning amber, kept
deliberately away from vermilion and terracotta.

### Type
- **Geist** (variable) for all interface text. Scale: 12 / 13 / 15 / 18 / 24.
- **Fraunces** (variable, `opsz` 144, `SOFT` 100) only for the instance name in the hero,
  set large (64–88 px) with tight tracking. This is the type moment of the app.
- **Geist Mono** only inside the log viewer, where text is genuinely machine output.
- Sentence case everywhere. No all-caps labels, no eyebrow labels.

### Layout

```
┌──────────────┬───────────────────────────────────────────────────┐
│ ● ● ●        │                                                   │
│              │            backdrop (landscape or screenshot)     │
│  [▣] Survival│                                                   │
│  [▣] Create… │                                                   │
│  [▣] Test 1.2│   Survival Island                 (Fraunces, big) │
│              │   1.21.4 · Fabric · 32 mods                       │
│              │   [  Play  ]                                      │
│              ├───────────────────────────────────────────────────┤
│  + New       │   Mods   Settings   Logs                          │
│              │   tab content on a soot sheet that slides up      │
│  (◉) Account │                                                   │
└──────────────┴───────────────────────────────────────────────────┘
```

- Sidebar 232 px, vibrancy shows through. Instance rows: icon, name, a moss dot when running.
- The hero fills the rest of the window. Text is left-aligned on a soft bottom-left scrim so it
  stays readable over any screenshot.
- Tabs sit on a sheet that rises from the bottom. When no tab is open the hero gets the
  whole window. Opening a tab pushes the hero up and scales the backdrop slightly.
- Border radius by hierarchy: window sheet 14 px, panels 10 px, rows and inputs 8 px,
  the Play button fully round.

### The generated landscape
Seeded from the instance id, so each instance always gets the same scene.
- Sky: a three-stop gradient from one of a few times of day (dusk, night, pre-dawn, haze).
- Four to five ridgelines whose heights snap to a step grid, so the hills read as blocky
  terrain without pixel art. Nearer ridges use bigger steps and darker, warmer colours
  (atmospheric perspective).
- Night scenes get stars, other scenes a sun or moon disc low on the horizon.
- Ambient motion: ridges drift sideways at different speeds (parallax, ~90 s loop).
  Turned off under Reduce motion.
- Once an instance has screenshots, the latest one replaces the landscape. Users can pin
  a specific image or go back to the generated scene.

### Motion
Personality: calm and physical. One signature curve, three durations.

| Token | Value | Use |
|---|---|---|
| Signature spring | `{ type: "spring", stiffness: 260, damping: 32 }` (no overshoot) | panels, sheets, layout |
| Quick | 140 ms, `cubic-bezier(0.2, 0, 0, 1)` | press, hover, toggles |
| Standard | 280 ms, `cubic-bezier(0.2, 0, 0, 1)` | tabs, dialogs |
| Slow | 700 ms, `cubic-bezier(0.4, 0, 0.2, 1)` | backdrop crossfade |

Choreography:
- **Switching instance (the signature moment):** the old backdrop holds while the new one
  fades in over it and settles from 1.04 to 1.0 scale. Title and meta swap with a short
  12 px upward slide. The sidebar highlight glides to the new row (shared layout).
- **Play:** press scales to 0.96 (quick). On release the pill collapses into a circle and
  a ring traces progress. The phase text ("Downloading assets 1,204 of 3,412") appears
  beside it. When the game is running, the button becomes a quiet "Stop" with a moss dot.
- **Lists:** mod results cascade in at 30 ms per row, capped at 8 rows (under 250 ms).
- **Dialogs:** fade + 8 px rise in, faster fade out (exit 70% of entry).
- **Reduce motion:** all movement becomes plain opacity fades. Parallax off.

### Copy
Plain verbs, sentence case. Buttons say what happens: "Play", "Create instance",
"Install", "Update 3 mods", "Sign in with Microsoft". Errors say what happened and what to
do next ("Java download failed: no internet connection. Check your connection and press
Play again.").

---

## 5. Milestones

Status as of 2026-11-13: M0–M4 and most of M6 are built and checked in a real run
(1.21.4 + Fabric + Sodium + Iris, 26.3 vanilla on Java 25, 1.20.1 on Java 17, crash
recovery). M5 code is written but can't be tested until Microsoft approves the Azure app.
The device-code sign-in fallback is not built yet.

| # | Milestone | Done when |
|---|---|---|
| M0 | Scaffold, design tokens, app shell with sidebar, hero, landscape backdrop | `npm run dev` opens Hearth with working instance switching |
| M1 | Core install + launch for vanilla | A 1.21 instance launches into the title screen |
| M2 | Instances wired end to end: create, clone, delete, settings, logs | All of it persists across restarts |
| M3 | Fabric | A Fabric instance with Fabric API launches |
| M4 | Modrinth browser, dependencies, enable/disable, updates | Sodium + Iris install and launch |
| M5 | Microsoft accounts | Sign-in works once the Azure app is approved |
| M6 | Polish | Screenshot backdrops, icons, crash return, Reduce motion, README |

Tests (Vitest) cover the pure logic: rule evaluation, maven paths, argument building,
Fabric merge, dependency resolution.
