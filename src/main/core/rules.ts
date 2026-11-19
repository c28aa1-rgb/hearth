export interface Rule {
  action: 'allow' | 'disallow'
  os?: { name?: string; arch?: string; version?: string }
  features?: Record<string, boolean>
}

export interface RuleEnv {
  osName: string
  arch: string
  osVersion: string
  features: Record<string, boolean>
}

/** An Apple Silicon Mac (used by tests; the running machine is HOST in platform.ts). */
export const MAC_ARM64: RuleEnv = {
  osName: 'osx',
  arch: 'arm64',
  osVersion: '15.0',
  features: {}
}

function matches(rule: Rule, env: RuleEnv): boolean {
  if (rule.os) {
    if (rule.os.name && rule.os.name !== env.osName) return false
    if (rule.os.arch && rule.os.arch !== env.arch) return false
    if (rule.os.version && !new RegExp(rule.os.version).test(env.osVersion)) return false
  }
  if (rule.features) {
    for (const [key, value] of Object.entries(rule.features)) {
      if ((env.features[key] ?? false) !== value) return false
    }
  }
  return true
}

/** Mojang's rule semantics: start disallowed, last matching rule wins. No rules = allowed. */
export function rulesAllow(rules: Rule[] | undefined, env: RuleEnv): boolean {
  if (!rules || rules.length === 0) return true
  let allowed = false
  for (const rule of rules) {
    if (matches(rule, env)) allowed = rule.action === 'allow'
  }
  return allowed
}
