import { lstatSync, realpathSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

import { verifyAndLoadCommunityCatalogReleaseInputs } from './agent-assets/release-input.js'
import { inspectCommunityInstall } from './community-lifecycle.js'
import { inspectCommunityNativeInstall } from './community-native-lifecycle.js'
import { resolveCommunityRepo } from './community-repo-discovery.js'
import { createHostedOfficialCatalogAdapterV1 } from './official-catalog-gateway.js'
import {
  buildOfficialCatalogPackageImports,
  OFFICIAL_CATALOG_NO_ACTIVATION_EFFECTS_V1,
  OFFICIAL_CATALOG_SCOPE_V1,
  OFFICIAL_CATALOG_TOOL_IDS_V1,
  reconcileOfficialCatalog,
  type OfficialCatalogAdapterV1,
} from './official-catalog.js'

export const SETUP_OFFICIAL_CATALOG_CONTRACT_V1 = Object.freeze({
  schemaVersion: 1 as const,
  scope: OFFICIAL_CATALOG_SCOPE_V1,
  defaultMode: 'import-inert' as const,
  optOutFlag: '--no-catalog' as const,
  releaseSource: 'verified-community-release-only' as const,
  activation: 'none' as const,
  reconcileCommand: 'aops-cli setup catalog reconcile --from-release <path> --apply --json',
  rollbackCommand: 'aops-cli setup catalog rollback --receipt <id> --apply --confirm --json',
  requiredTools: OFFICIAL_CATALOG_TOOL_IDS_V1,
})

export type SetupOfficialCatalogResultV1 = Readonly<{
  state: 'current'
  scopeSlug: typeof OFFICIAL_CATALOG_SCOPE_V1.slug
  releaseSetSha256: string
  mutation: 'applied' | 'not-required'
  receiptId?: string
  catalogRevision?: number
  historyDeleteCount: 0
  activationEffects: readonly []
}>

export interface SetupOfficialCatalogProviderV1 {
  resolveRelease(options: Readonly<{
    sourceRoot?: string
    instance?: string
    dataRoot?: string
  }>): Promise<SetupOfficialCatalogReleaseResolutionV1>
  reconcile(options: Readonly<{
    fromRelease: string
    apiBaseUrl?: string
    timeoutMs?: number
    idempotencyKey?: string
  }>): Promise<SetupOfficialCatalogResultV1>
}

export type SetupOfficialCatalogReleaseResolutionV1 = Readonly<{
  fromRelease: string
  source: 'bundled-npm' | 'source-root' | 'installed-native' | 'installed-oci' | 'cwd-community-repo'
}>

export type SetupOfficialCatalogProviderDependenciesV1 = Readonly<{
  loadRelease?: typeof verifyAndLoadCommunityCatalogReleaseInputs
  createAdapter?: (options: Readonly<{
    apiBaseUrl?: string
    timeoutMs?: number
  }>) => Promise<OfficialCatalogAdapterV1>
  inspectNative?: typeof inspectCommunityNativeInstall
  inspectOci?: typeof inspectCommunityInstall
  resolveRepo?: typeof resolveCommunityRepo
  cwd?: () => string
  bundledCandidates?: () => readonly string[]
}>

type OfficialCatalogRetryDependencies = Readonly<{
  now?: () => number
  sleep?: (milliseconds: number) => Promise<void>
}>

function isOfficialCatalogAdapterUnavailable(error: unknown): boolean {
  return typeof error === 'object' && error !== null &&
    (error as { code?: unknown }).code === 'catalog_adapter_unavailable'
}

export async function retryOfficialCatalogAdapterReady<T>(
  operation: () => Promise<T>,
  timeoutMs = 120_000,
  dependencies: OfficialCatalogRetryDependencies = {},
): Promise<T> {
  const now = dependencies.now ?? Date.now
  const sleep = dependencies.sleep ?? ((milliseconds) => new Promise<void>((resolve) => {
    setTimeout(resolve, milliseconds)
  }))
  const deadline = now() + Math.min(Math.max(timeoutMs, 1_000), 120_000)
  let attempt = 0
  for (;;) {
    try {
      return await operation()
    } catch (error) {
      if (!isOfficialCatalogAdapterUnavailable(error)) throw error
      const remaining = deadline - now()
      if (remaining <= 0) throw error
      const delayMs = Math.min(250 * (2 ** Math.min(attempt, 3)), 2_000, remaining)
      attempt += 1
      await sleep(delayMs)
    }
  }
}

function localSignedReleaseRoot(candidate: string | undefined): string | undefined {
  if (!candidate) return undefined
  const releaseRoot = path.resolve(candidate)
  try {
    const root = lstatSync(releaseRoot)
    if (!root.isDirectory() || root.isSymbolicLink()) return undefined
    for (const name of ['agent-assets-release.json', 'agent-assets-release.sigstore.json']) {
      const entry = lstatSync(path.join(releaseRoot, name))
      if (!entry.isFile() || entry.isSymbolicLink()) return undefined
    }
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

export async function resolveSetupOfficialCatalogReleaseV1(
  options: Readonly<{ sourceRoot?: string; instance?: string; dataRoot?: string }> = {},
  dependencies: SetupOfficialCatalogProviderDependenciesV1 = {},
): Promise<SetupOfficialCatalogReleaseResolutionV1> {
  const sourceRoot = localSignedReleaseRoot(
    options.sourceRoot ? path.join(path.resolve(options.sourceRoot), 'release') : undefined,
  )
  if (sourceRoot) return Object.freeze({ fromRelease: sourceRoot, source: 'source-root' as const })

  for (const candidate of (dependencies.bundledCandidates ?? defaultBundledCandidates)()) {
    const bundledRoot = localSignedReleaseRoot(candidate)
    if (bundledRoot) return Object.freeze({ fromRelease: bundledRoot, source: 'bundled-npm' as const })
  }

  const inspectNative = dependencies.inspectNative ?? inspectCommunityNativeInstall
  const native = inspectNative({ instanceName: options.instance, dataRoot: options.dataRoot })
  const nativeRoot = localSignedReleaseRoot(
    native.status === 'installed' ? path.join(native.state!.source.root, 'release') : undefined,
  )
  if (nativeRoot) return Object.freeze({ fromRelease: nativeRoot, source: 'installed-native' as const })

  const inspectOci = dependencies.inspectOci ?? inspectCommunityInstall
  const oci = inspectOci({ instanceName: options.instance, dataRoot: options.dataRoot })
  const ociRoot = localSignedReleaseRoot(
    oci.status === 'installed' ? path.dirname(oci.state!.activeRelease.manifestPath) : undefined,
  )
  if (ociRoot) return Object.freeze({ fromRelease: ociRoot, source: 'installed-oci' as const })

  try {
    const repo = (dependencies.resolveRepo ?? resolveCommunityRepo)({ cwd: (dependencies.cwd ?? process.cwd)() })
    const cwdRoot = localSignedReleaseRoot(repo.releaseDir)
    if (cwdRoot) return Object.freeze({ fromRelease: cwdRoot, source: 'cwd-community-repo' as const })
  } catch {
    // Discovery is optional. Signature verification still happens before import.
  }
  throw new Error(
    'setup_init_catalog_verified_release_unavailable:reinstall_the_official_aops_cli_or_run_from_a_signed_community_release_or_use_--catalog-release_<path>_or_--no-catalog',
  )
}

export function createSetupOfficialCatalogProviderV1(
  dependencies: SetupOfficialCatalogProviderDependenciesV1 = {},
): SetupOfficialCatalogProviderV1 {
  const loadRelease = dependencies.loadRelease ?? verifyAndLoadCommunityCatalogReleaseInputs
  const createAdapter = dependencies.createAdapter ?? createHostedOfficialCatalogAdapterV1
  return Object.freeze({
    async resolveRelease(
      options: Parameters<SetupOfficialCatalogProviderV1['resolveRelease']>[0],
    ): Promise<SetupOfficialCatalogReleaseResolutionV1> {
      return resolveSetupOfficialCatalogReleaseV1(options, dependencies)
    },
    async reconcile(
      options: Parameters<SetupOfficialCatalogProviderV1['reconcile']>[0],
    ): Promise<SetupOfficialCatalogResultV1> {
      const inputs = await loadRelease({
        releaseRoot: options.fromRelease,
        verificationMode: 'offline',
      })
      const packages = buildOfficialCatalogPackageImports(inputs)
      const adapter = await createAdapter({
        apiBaseUrl: options.apiBaseUrl,
        timeoutMs: options.timeoutMs,
      })
      const result = await retryOfficialCatalogAdapterReady(() => reconcileOfficialCatalog({
        adapter,
        packages,
        mode: 'apply',
        idempotencyKey: options.idempotencyKey,
      }), options.timeoutMs)
      if (result.kind === 'aops-official-catalog-reconcile-plan-v1') {
        return Object.freeze({
          state: 'current' as const,
          scopeSlug: OFFICIAL_CATALOG_SCOPE_V1.slug,
          releaseSetSha256: result.releaseSetSha256,
          mutation: 'not-required' as const,
          historyDeleteCount: 0 as const,
          activationEffects: OFFICIAL_CATALOG_NO_ACTIVATION_EFFECTS_V1,
        })
      }
      return Object.freeze({
        state: 'current' as const,
        scopeSlug: OFFICIAL_CATALOG_SCOPE_V1.slug,
        releaseSetSha256: result.releaseSetSha256,
        mutation: 'applied' as const,
        receiptId: result.receiptId,
        catalogRevision: result.catalogRevision,
        historyDeleteCount: 0 as const,
        activationEffects: OFFICIAL_CATALOG_NO_ACTIVATION_EFFECTS_V1,
      })
    },
  })
}
