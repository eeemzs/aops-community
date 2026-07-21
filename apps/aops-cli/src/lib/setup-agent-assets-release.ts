import { lstatSync, realpathSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

import {
  resolveSetupOfficialCatalogReleaseV1,
  type SetupOfficialCatalogReleaseResolutionV1,
} from './setup-official-catalog-bridge.js'

export type SetupAgentAssetsReleaseResolutionV1 = Readonly<{
  fromRelease: string
  source: 'bundled-npm' | SetupOfficialCatalogReleaseResolutionV1['source']
}>

export type SetupAgentAssetsReleaseDependenciesV1 = Readonly<{
  bundledCandidates?: () => readonly string[]
  fallback?: typeof resolveSetupOfficialCatalogReleaseV1
}>

function localAgentAssetsReleaseRoot(candidate: string | undefined): string | undefined {
  if (!candidate) return undefined
  const releaseRoot = path.resolve(candidate)
  try {
    const root = lstatSync(releaseRoot)
    if (!root.isDirectory() || root.isSymbolicLink()) return undefined
    for (const name of ['agent-assets-release.json', 'agent-assets-release.sigstore.json']) {
      const entry = lstatSync(path.join(releaseRoot, name))
      if (!entry.isFile() || entry.isSymbolicLink()) return undefined
    }
    const assets = lstatSync(path.join(releaseRoot, 'agent-assets'))
    if (!assets.isDirectory() || assets.isSymbolicLink()) return undefined
    return realpathSync.native(releaseRoot)
  } catch {
    return undefined
  }
}

function defaultBundledCandidates(): readonly string[] {
  const moduleDirectory = path.dirname(fileURLToPath(import.meta.url))
  return Object.freeze([
    path.resolve(moduleDirectory, '..', 'agent-assets-release'),
    path.resolve(moduleDirectory, '..', '..', 'agent-assets-release'),
  ])
}

export function resolveBundledAgentAssetsReleaseV1(
  dependencies: Pick<SetupAgentAssetsReleaseDependenciesV1, 'bundledCandidates'> = {},
): SetupAgentAssetsReleaseResolutionV1 | undefined {
  for (const candidate of (dependencies.bundledCandidates ?? defaultBundledCandidates)()) {
    const fromRelease = localAgentAssetsReleaseRoot(candidate)
    if (fromRelease) return Object.freeze({ fromRelease, source: 'bundled-npm' as const })
  }
  return undefined
}

export async function resolveSetupAgentAssetsReleaseV1(
  options: Readonly<{ sourceRoot?: string; instance?: string; dataRoot?: string }> = {},
  dependencies: SetupAgentAssetsReleaseDependenciesV1 = {},
): Promise<SetupAgentAssetsReleaseResolutionV1> {
  const bundled = resolveBundledAgentAssetsReleaseV1(dependencies)
  if (bundled) return bundled
  try {
    return await (dependencies.fallback ?? resolveSetupOfficialCatalogReleaseV1)(options)
  } catch {
    throw new Error(
      'agent_assets_verified_source_unavailable:reinstall_the_official_aops_cli_package_or_use_--from-release_as_an_offline_override',
    )
  }
}
