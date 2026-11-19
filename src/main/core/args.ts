import type { Argument, VersionJson } from './mojang'
import { rulesAllow, type RuleEnv } from './rules'

export interface LaunchContext {
  javaPath: string
  classpath: string[]
  gameDir: string
  assetsDir: string
  librariesDir: string
  nativesDir: string
  memoryMb: number
  player: { name: string; uuid: string; accessToken: string; userType: 'msa'; xuid?: string }
  launcherName: string
  launcherVersion: string
  /** ":" on macOS, ";" on Windows. */
  classpathSeparator: string
}

function expand(args: Argument[] | undefined, env: RuleEnv): string[] {
  const out: string[] = []
  for (const arg of args ?? []) {
    if (typeof arg === 'string') out.push(arg)
    else if (rulesAllow(arg.rules, env)) out.push(...(Array.isArray(arg.value) ? arg.value : [arg.value]))
  }
  return out
}

function substitute(value: string, vars: Record<string, string>): string {
  return value.replace(/\$\{([a-zA-Z0-9_]+)\}/g, (match, key: string) => vars[key] ?? match)
}

/** The full `java …` argument list (without the java binary itself). */
export function buildLaunchArgs(version: VersionJson, ctx: LaunchContext, env: RuleEnv): string[] {
  const vars: Record<string, string> = {
    auth_player_name: ctx.player.name,
    auth_uuid: ctx.player.uuid,
    auth_access_token: ctx.player.accessToken,
    auth_xuid: ctx.player.xuid ?? '',
    clientid: '',
    user_type: ctx.player.userType,
    user_properties: '{}',
    version_name: version.id,
    version_type: version.type ?? 'release',
    game_directory: ctx.gameDir,
    assets_root: ctx.assetsDir,
    game_assets: ctx.assetsDir,
    assets_index_name: version.assetIndex?.id ?? version.assets ?? '',
    natives_directory: ctx.nativesDir,
    library_directory: ctx.librariesDir,
    classpath: ctx.classpath.join(ctx.classpathSeparator),
    classpath_separator: ctx.classpathSeparator,
    launcher_name: ctx.launcherName,
    launcher_version: ctx.launcherVersion
  }
  const jvm = expand(version.arguments?.jvm, env).map((a) => substitute(a, vars))
  const game = expand(version.arguments?.game, env).map((a) => substitute(a, vars))
  return [`-Xmx${ctx.memoryMb}M`, `-Xms${Math.min(ctx.memoryMb, 1024)}M`, ...jvm, version.mainClass, ...game]
}
