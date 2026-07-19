import os from 'node:os'
import path from 'node:path'

import { getAgentAssetsConfig, type AopsAgentAssetsConfig } from '../../utils/config.js'

export type AgentAssetsRootSource = 'option' | 'environment' | 'user-config' | 'default'

export type AgentAssetsResolvedRoot = Readonly<{
  absolutePath: string
  source: AgentAssetsRootSource
}>

export type AgentAssetsResolvedRoots = Readonly<{
  dataRoot: AgentAssetsResolvedRoot
  assetRoot: string
  runtimeHomes: Readonly<{
    codex: AgentAssetsResolvedRoot
    claude: AgentAssetsResolvedRoot
  }>
}>

export type ResolveAgentAssetsRootsOptions = Readonly<{
  dataRoot?: string
  codexHome?: string
  claudeHome?: string
  env?: NodeJS.ProcessEnv
  homeDir?: string
  config?: AopsAgentAssetsConfig
}>

function selectRoot(
  name: 'dataRoot' | 'codexHome' | 'claudeHome',
  candidates: readonly Readonly<{ value: string | undefined; source: AgentAssetsRootSource }>[],
): AgentAssetsResolvedRoot {
  const selected = candidates.find((candidate) => candidate.value !== undefined && candidate.value.trim().length > 0)
  if (!selected?.value) throw new Error(`agent_assets_${name}_missing`)
  const candidate = selected.value.trim()
  if (!path.isAbsolute(candidate)) throw new Error(`agent_assets_${name}_must_be_absolute`)
  return Object.freeze({
    absolutePath: path.normalize(candidate),
    source: selected.source,
  })
}

/** Resolve all client roots once with the frozen option > env > config > default precedence. */
export function resolveAgentAssetsRoots(options: ResolveAgentAssetsRootsOptions = {}): AgentAssetsResolvedRoots {
  const env = options.env ?? process.env
  const homeDir = options.homeDir ?? os.homedir()
  if (!path.isAbsolute(homeDir)) throw new Error('agent_assets_home_must_be_absolute')
  const config = options.config ?? getAgentAssetsConfig()

  const dataRoot = selectRoot('dataRoot', [
    { value: options.dataRoot, source: 'option' },
    { value: env.AOPS_AGENT_ASSETS_DATA_ROOT, source: 'environment' },
    { value: config.dataRoot, source: 'user-config' },
    { value: path.join(homeDir, '.aops'), source: 'default' },
  ])
  const codex = selectRoot('codexHome', [
    { value: options.codexHome, source: 'option' },
    { value: env.CODEX_HOME, source: 'environment' },
    { value: config.runtimeHomes?.codex, source: 'user-config' },
    { value: path.join(homeDir, '.codex'), source: 'default' },
  ])
  const claude = selectRoot('claudeHome', [
    { value: options.claudeHome, source: 'option' },
    { value: env.CLAUDE_HOME, source: 'environment' },
    { value: config.runtimeHomes?.claude, source: 'user-config' },
    { value: path.join(homeDir, '.claude'), source: 'default' },
  ])

  return Object.freeze({
    dataRoot,
    assetRoot: path.join(dataRoot.absolutePath, 'agent-assets'),
    runtimeHomes: Object.freeze({ codex, claude }),
  })
}

