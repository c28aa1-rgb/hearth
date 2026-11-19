import os from 'node:os'
import { delimiter, join } from 'node:path'
import type { Platform } from '@shared/types'
import type { RuleEnv } from './rules'

/** The operating system Hearth runs on. Hearth supports macOS and Windows. */
export const PLATFORM: Platform = process.platform === 'win32' ? 'win32' : process.platform === 'darwin' ? 'darwin' : 'linux'

/** Mojang's name for an architecture in library/argument rules. */
function mojangArch(arch: string): string {
  if (arch === 'x64') return 'x86_64'
  if (arch === 'ia32') return 'x86'
  return arch // arm64
}

/** This machine, as Mojang's version rules see it. */
export function hostEnv(platform: Platform = PLATFORM, arch: string = process.arch, release: string = os.release()): RuleEnv {
  return {
    osName: platform === 'win32' ? 'windows' : platform === 'darwin' ? 'osx' : 'linux',
    arch: mojangArch(arch),
    osVersion: release,
    features: {}
  }
}

export const HOST: RuleEnv = hostEnv()

/** Key of this machine in Mojang's Java runtime index. */
export function javaPlatformKey(platform: Platform = PLATFORM, arch: string = process.arch): string {
  if (platform === 'darwin') return arch === 'arm64' ? 'mac-os-arm64' : 'mac-os'
  if (platform === 'win32') return arch === 'arm64' ? 'windows-arm64' : arch === 'ia32' ? 'windows-x86' : 'windows-x64'
  return arch === 'ia32' ? 'linux-i386' : 'linux'
}

/** Where the java binary sits inside an installed Mojang runtime. */
export function javaBinaryIn(runtimeRoot: string, platform: Platform = PLATFORM): string {
  if (platform === 'darwin') return join(runtimeRoot, 'jre.bundle', 'Contents', 'Home', 'bin', 'java')
  if (platform === 'win32') return join(runtimeRoot, 'bin', 'java.exe')
  return join(runtimeRoot, 'bin', 'java')
}

/** Separator between classpath entries (":" on macOS, ";" on Windows). */
export const CLASSPATH_SEPARATOR = delimiter

/** Human name of this platform, for messages. */
export function platformName(platform: Platform = PLATFORM): string {
  if (platform === 'darwin') return process.arch === 'arm64' ? 'Apple Silicon Macs' : 'Intel Macs'
  if (platform === 'win32') return 'Windows'
  return 'Linux'
}
