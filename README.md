<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/logo-dark.png">
    <img src="docs/logo-light.png" alt="Hearth" width="420">
  </picture>
</p>

# Hearth

A small Minecraft: Java Edition launcher for macOS and Windows. Hearth manages separate
instances (each with its own version, mods and worlds) and installs mods from Modrinth
for Fabric, Quilt, NeoForge and Forge, along with the other mods they need.

## Download

Get the latest version from the [releases page](https://github.com/c28aa1-rgb/hearth/releases/latest):

| Your computer | File |
|---|---|
| Mac with Apple Silicon (M1 or newer) | `Hearth-…-mac-arm64.dmg` |
| Mac with an Intel chip | `Hearth-…-mac-x64.dmg` |
| Windows 10 or 11 | `Hearth-…-windows-setup.exe` |

Hearth isn't signed with a paid Apple or Microsoft developer certificate yet, so both
systems ask once before the first launch:

- **Mac:** open the .dmg and drag Hearth into Applications, then open it. macOS says it
  can't verify the app. Click **Done**, open **System Settings → Privacy & Security**,
  scroll down and click **Open Anyway** next to Hearth, then confirm. You only do this once.
- **Windows:** the installer may show "Windows protected your PC". Click **More info**,
  then **Run anyway**.

## Run from source

You need [Node.js](https://nodejs.org) 22.12 or newer (and [Git](https://git-scm.com) to
clone the repo). Nothing else: Hearth downloads Java, Minecraft and the mod loaders by itself.
The same commands work in Terminal on a Mac and in PowerShell on Windows.

```bash
git clone https://github.com/c28aa1-rgb/hearth.git
cd hearth
npm install
npm run dev
```

`npm install` takes about 440 MB, most of it the Electron runtime. Each Minecraft version
you play adds roughly 0.5–1 GB to a shared store, and every instance on that version
reuses it.

## Signing in

Hearth ships with its own Azure app ID, approved by Microsoft for the Minecraft API, so
"Sign in with Microsoft" works out of the box.

To use your own Azure app instead (for a fork, say):

1. In the [Azure portal](https://portal.azure.com), open **App registrations** and create an app.
   Pick **Personal Microsoft accounts only**.
2. Under **Authentication**, add the platform **Mobile and desktop applications** with the
   redirect URI `https://login.microsoftonline.com/common/oauth2/nativeclient`.
3. Apply for Minecraft API access at <https://aka.ms/mce-reviewappid>. Approval can take days
   to weeks.
4. Put the **Application (client) ID** in `src/main/auth/config.ts`, or run with
   `HEARTH_AZURE_CLIENT_ID=<id> npm run dev`. The ID isn't a secret, so it's fine to commit.

Hearth only launches the game for a signed-in Microsoft account that owns Minecraft: Java
Edition. There is no offline mode.

## Mod loaders

- **Fabric** and **Quilt** come from their official metadata servers. New instances get
  Fabric API, and Quilt instances can install Fabric mods as well as Quilt ones.
- **NeoForge** and **Forge** need their official installer to patch the game. Hearth
  downloads it and runs it in the background once per loader version, then reuses the result.

Installing a mod also installs every mod it requires. Hearth refuses a mod that says it
can't run alongside one you already have, and removing a mod also removes the dependencies
nothing else needs.

## Where things live

Everything is in `~/Library/Application Support/Hearth/` on a Mac and
`%APPDATA%\Hearth\` on Windows:

```
store/       shared game files, libraries, assets, Java runtimes, loaders and mod files
instances/   one folder per instance; minecraft/ inside is the game directory
settings.json, accounts.json (tokens encrypted with the Keychain on macOS, DPAPI on Windows)
```

Deleting an instance moves its folder to the Trash.

## Development

| Command | What it does |
|---|---|
| `npm run dev` | Run Hearth with hot reload |
| `npm test` | Unit tests for the launcher core |
| `npm run typecheck` | TypeScript check |
| `npm run build` | Production build into `out/` |
| `npm run dist:mac` | Mac apps (.dmg for Apple Silicon and Intel) into `dist/` |
| `npm run dist:win` | Windows installer (.exe) into `dist/`; build it on Windows |

Environment variables for development:

- `HEARTH_DATA_DIR=/some/folder` uses a throwaway data folder instead of the real one.
- `HEARTH_DEBUG_PORT=9333` opens the Chrome DevTools protocol on that port.

Publishing a GitHub release runs `.github/workflows/release.yml`, which builds the Mac and
Windows apps and attaches them to the release.

The icon is drawn by `scripts/icon.py` (the sources are `build/icon.svg` and
`build/icon-windows.svg`).

`PLAN.md` has the design decisions, architecture and milestones.

## License

MIT. Fonts (Geist, Geist Mono, Fraunces) are under the SIL Open Font License.
Minecraft is a trademark of Mojang. Hearth is not affiliated with Mojang or Microsoft.
