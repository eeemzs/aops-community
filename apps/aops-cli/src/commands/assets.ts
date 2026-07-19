import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'

import { Command } from 'commander'

import {
  AgentAssetsError,
  agentAssetsFailure,
  agentAssetsSuccess,
  assertBoundedDiscoveryEnvelope,
  type AgentAssetsCommandEnvelopeV1,
  type AgentAssetsDiagnosticV1,
  type AgentAssetsFailureEnvelopeV1,
} from '../lib/agent-assets/envelope.js'
import { resolveAgentAssetsMutationGuard, type AgentAssetsMutationGuard } from '../lib/agent-assets/guards.js'
import { discoverHostedSkills } from '../lib/agent-assets/hosted-discovery.js'
import {
  inspectLegacyAopsPointers,
  LEGACY_POINTER_GENERATOR_CONTRACT_V1,
  migrateLegacyAopsPointers,
} from '../lib/agent-assets/legacy-pointer-migration.js'
import {
  assertExpectedSkillPackageManifestV1,
  pullHostedSkillPackage,
} from '../lib/agent-assets/hosted-package-input.js'
import { validatePackageManifestStructureV1 } from '../lib/agent-assets/package-manifest.js'
import { verifyAndLoadCommunityCoreReleaseInput } from '../lib/agent-assets/release-input.js'
import { resolveAgentAssetsRoots, type AgentAssetsResolvedRoots } from '../lib/agent-assets/roots.js'
import { inspectRuntimeGatewayBindings } from '../lib/agent-assets/runtime-binding-reader.js'
import {
  readAgentAssetsStoreStatus,
  readAgentAssetsRollbackTarget,
  readAgentAssetsPrunePlan,
  readResolvedAgentAssetPackage,
  resolveAgentAsset,
} from '../lib/agent-assets/store-reader.js'
import {
  applyVerifiedCommunityCore,
  applyVerifiedHostedSkillPackage,
  cleanupAgentAssetsStaging,
  pinAgentAssetsExactVersion,
  pruneAgentAssets,
  repairAgentAssetRuntimeBindings,
  rollbackAgentAssets,
} from '../lib/agent-assets/store-writer.js'

export type AgentAssetsCommandName =
  | 'assets.status'
  | 'assets.discover'
  | 'assets.resolve'
  | 'assets.install'
  | 'assets.update'
  | 'assets.package.inspect'
  | 'assets.package.pull'
  | 'assets.pin'
  | 'assets.repair'
  | 'assets.rollback'
  | 'assets.prune'
  | 'assets.migrate.inspect'
  | 'assets.migrate.legacy-pointers'

type RootOptions = {
  dataRoot?: string
  codexHome?: string
  claudeHome?: string
  json?: boolean
}

type GuardOptions = {
  preview?: boolean
  apply?: boolean
  confirm?: boolean
}

export type AgentAssetsCommandOptions = RootOptions & GuardOptions & {
  verify?: string
  query?: string
  limit?: number
  origin?: string
  offline?: boolean
  apiBaseUrl?: string
  gateway?: string
  name?: string
  versionId?: string
  pinId?: string
  pinUntil?: string
  fromRelease?: string
  target?: string
  idempotencyKey?: string
  manifest?: string
  expectedManifest?: string
  leaseId?: string
  expiresAt?: string
  cleanupStaging?: boolean
  repairBindings?: boolean
  takeoverStaleLock?: boolean
  rebindMachine?: boolean
  toReceipt?: string
}

export type AgentAssetsRunnerRequest = Readonly<{
  command: AgentAssetsCommandName
  options: Readonly<AgentAssetsCommandOptions>
  roots: AgentAssetsResolvedRoots
  guard?: AgentAssetsMutationGuard
}>

export type AgentAssetsRunnerResult = Readonly<{
  result: unknown
  diagnostics?: readonly AgentAssetsDiagnosticV1[]
  nextActions?: readonly string[]
}>

/**
 * The command tree owns public grammar, validation, roots and envelopes. The
 * store implementation owns execution behind this deliberately narrow seam.
 */
export interface AgentAssetsCommandRunner {
  run(request: AgentAssetsRunnerRequest): Promise<AgentAssetsRunnerResult> | AgentAssetsRunnerResult
}

export type AgentAssetsCommandOutput = AgentAssetsCommandEnvelopeV1<unknown> | AgentAssetsFailureEnvelopeV1

function stableRootId(kind: 'store' | 'codex' | 'claude', absolutePath: string): string {
  const canonicalPath = process.platform === 'win32'
    ? path.normalize(absolutePath).toLowerCase()
    : path.normalize(absolutePath)
  return createHash('sha256').update(`agent-assets-${kind}\0${canonicalPath}`, 'utf8').digest('hex')
}

function rootContext(roots: AgentAssetsResolvedRoots): Readonly<Record<string, unknown>> {
  return Object.freeze({
    storeId: stableRootId('store', roots.assetRoot),
    runtimeHomeIds: Object.freeze({
      codex: stableRootId('codex', roots.runtimeHomes.codex.absolutePath),
      claude: stableRootId('claude', roots.runtimeHomes.claude.absolutePath),
    }),
    sources: Object.freeze({
      dataRoot: roots.dataRoot.source,
      codexHome: roots.runtimeHomes.codex.source,
      claudeHome: roots.runtimeHomes.claude.source,
    }),
  })
}

function required(value: string | undefined, flag: string): string {
  const normalized = value?.trim()
  if (!normalized) {
    throw new AgentAssetsError('schema_incompatible', `${flag} is required.`, {
      nextActions: [`Re-run the command with ${flag} <value>.`],
    })
  }
  return normalized
}

function oneOf(value: string | undefined, flag: string, allowed: readonly string[], fallback?: string): string {
  const selected = value?.trim() || fallback
  if (!selected || !allowed.includes(selected)) {
    throw new AgentAssetsError('schema_incompatible', `${flag} must be one of: ${allowed.join(', ')}.`, {
      nextActions: [`Re-run with ${flag} ${allowed[0]}.`],
      details: { allowed },
    })
  }
  return selected
}

function positiveLimit(value: number | undefined): number {
  const selected = value ?? 5
  if (!Number.isInteger(selected) || selected < 1 || selected > 5) {
    throw new AgentAssetsError('schema_incompatible', '--limit must be an integer from 1 through 5.', {
      nextActions: ['Re-run with --limit 5 or lower.'],
      details: { minimum: 1, maximum: 5 },
    })
  }
  return selected
}

function normalizeOptions(command: AgentAssetsCommandName, raw: AgentAssetsCommandOptions): AgentAssetsCommandOptions {
  const options = { ...raw }
  if (options.preview && options.apply) {
    throw new AgentAssetsError('schema_incompatible', '--preview and --apply are mutually exclusive.', {
      nextActions: ['Choose preview (the default) or re-run with only --apply.'],
    })
  }

  switch (command) {
    case 'assets.status':
      options.verify = oneOf(options.verify, '--verify', ['quick', 'full'], 'quick')
      break
    case 'assets.discover':
      options.query = required(options.query, '--query')
      options.limit = positiveLimit(options.limit)
      if (options.origin) options.origin = oneOf(options.origin, '--origin', ['bundled', 'hosted-cache', 'reserved-catalog'])
      break
    case 'assets.resolve': {
      const selectors = [options.gateway, options.name, options.versionId].filter((entry) => Boolean(entry?.trim()))
      if (selectors.length !== 1) {
        throw new AgentAssetsError('ambiguous', 'Exactly one of --gateway, --name, or --version-id is required.', {
          nextActions: ['Re-run with exactly one resolver selector.'],
        })
      }
      if (options.gateway && options.gateway !== 'aops') {
        throw new AgentAssetsError('not_found', 'Only --gateway aops is supported in v1.', {
          nextActions: ['Re-run with --gateway aops or select an exact installed asset.'],
        })
      }
      if (Boolean(options.pinId) !== Boolean(options.pinUntil)) {
        throw new AgentAssetsError('schema_incompatible', '--pin-id and --pin-until must be supplied together.', {
          nextActions: ['Supply both pin flags, or omit both for mutation-free resolution.'],
        })
      }
      if (options.apply && !options.pinId) {
        throw new AgentAssetsError('schema_incompatible', '--apply is valid for resolve only when creating or renewing a pin.', {
          nextActions: ['Omit --apply, or provide both --pin-id and --pin-until.'],
        })
      }
      break
    }
    case 'assets.install':
    case 'assets.update':
      options.fromRelease = required(options.fromRelease, '--from-release')
      options.target = oneOf(options.target, '--target', ['codex', 'claude', 'both'], 'both')
      break
    case 'assets.package.inspect':
      options.manifest = required(options.manifest, '--manifest')
      break
    case 'assets.package.pull':
      options.versionId = required(options.versionId, '--version-id')
      options.expectedManifest = required(options.expectedManifest, '--expected-manifest')
      break
    case 'assets.pin':
      options.versionId = required(options.versionId, '--version-id')
      options.leaseId = required(options.leaseId, '--lease-id')
      options.expiresAt = required(options.expiresAt, '--expires-at')
      if (!Number.isFinite(Date.parse(options.expiresAt))) {
        throw new AgentAssetsError('schema_incompatible', '--expires-at must be a valid ISO timestamp.', {
          nextActions: ['Re-run with an explicit finite ISO-8601 expiry.'],
        })
      }
      break
    case 'assets.repair':
      if ([
        options.cleanupStaging,
        options.repairBindings,
        options.takeoverStaleLock,
        options.rebindMachine,
      ].filter(Boolean).length > 1) {
        throw new AgentAssetsError('ambiguous', 'Repair accepts at most one recovery action at a time.', {
          nextActions: ['Choose exactly one repair flag after inspecting status.'],
        })
      }
      break
    case 'assets.migrate.legacy-pointers':
      options.target = oneOf(options.target, '--target', ['codex', 'claude', 'both'], 'both')
      break
    default:
      break
  }
  return Object.freeze(options)
}

function mutationGuard(command: AgentAssetsCommandName, options: AgentAssetsCommandOptions): AgentAssetsMutationGuard | undefined {
  const mutations = new Set<AgentAssetsCommandName>([
    'assets.install',
    'assets.update',
    'assets.package.pull',
    'assets.pin',
    'assets.repair',
    'assets.rollback',
    'assets.prune',
    'assets.migrate.legacy-pointers',
  ])
  const resolvePin = command === 'assets.resolve' && Boolean(options.pinId)
  if (!mutations.has(command) && !resolvePin) return undefined

  const destructive = command === 'assets.rollback'
    || command === 'assets.prune'
    || command === 'assets.migrate.legacy-pointers'
    || (command === 'assets.repair' && Boolean(
      options.cleanupStaging || options.takeoverStaleLock || options.rebindMachine,
    ))
  return resolveAgentAssetsMutationGuard({
    action: `aops-cli ${command.replaceAll('.', ' ')}`,
    apply: options.apply,
    confirm: options.confirm,
    destructive,
  })
}

function readManifestReference(reference: string): unknown {
  if (!reference.startsWith('@')) {
    throw new AgentAssetsError(
      'expected_manifest_required',
      'This build can inspect local @file.json manifests; immutable release-ref resolution is not wired yet.',
      { nextActions: ['Provide --manifest @/absolute/path/to/package-manifest.json.'] },
    )
  }
  const filePath = path.resolve(reference.slice(1))
  let raw: string
  try {
    raw = readFileSync(filePath, 'utf8')
  } catch (error) {
    throw new AgentAssetsError('not_found', 'The requested manifest file could not be read.', {
      nextActions: ['Verify the absolute @file.json path and file permissions.'],
      cause: error,
    })
  }
  if (Buffer.byteLength(raw, 'utf8') > 1_048_576) {
    throw new AgentAssetsError('schema_incompatible', 'Manifest input exceeds the 1 MiB inspection limit.', {
      nextActions: ['Inspect a bounded PackageManifestV1 JSON file.'],
    })
  }
  try {
    return JSON.parse(raw) as unknown
  } catch (error) {
    throw new AgentAssetsError('schema_incompatible', 'Manifest input is not valid JSON.', {
      nextActions: ['Fix the JSON syntax and retry package inspect.'],
      cause: error,
    })
  }
}

function unsupportedApply(request: AgentAssetsRunnerRequest): never {
  throw new AgentAssetsError(
    'atomic_primitive_unavailable',
    `${request.command} apply is unavailable until the reviewed native agent-assets writer is installed.`,
    {
      nextActions: [
        'Keep this preview as evidence and retry only after the native publication primitive is available.',
      ],
      details: { mutationFreeFallback: false },
    },
  )
}

/** Default grammar-lane runner: real safe reads, preview, and fail-closed apply. */
export function createDefaultAgentAssetsCommandRunner(dependencies: Readonly<{
  readStoreStatus?: typeof readAgentAssetsStoreStatus
  inspectRuntimeBindings?: typeof inspectRuntimeGatewayBindings
  pullHostedPackage?: typeof pullHostedSkillPackage
  readResolvedPackage?: typeof readResolvedAgentAssetPackage
  verifyCommunityRelease?: typeof verifyAndLoadCommunityCoreReleaseInput
  discoverHosted?: typeof discoverHostedSkills
  applyCommunityCore?: typeof applyVerifiedCommunityCore
  applyHostedPackage?: typeof applyVerifiedHostedSkillPackage
  repairRuntimeBindings?: typeof repairAgentAssetRuntimeBindings
  cleanupStaging?: typeof cleanupAgentAssetsStaging
  rollback?: typeof rollbackAgentAssets
  pinExactVersion?: typeof pinAgentAssetsExactVersion
  prune?: typeof pruneAgentAssets
  inspectLegacyPointers?: typeof inspectLegacyAopsPointers
  migrateLegacyPointers?: typeof migrateLegacyAopsPointers
}> = {}): AgentAssetsCommandRunner {
  const readStoreStatus = dependencies.readStoreStatus ?? readAgentAssetsStoreStatus
  const inspectRuntimeBindings = dependencies.inspectRuntimeBindings ?? inspectRuntimeGatewayBindings
  const pullHostedPackage = dependencies.pullHostedPackage ?? pullHostedSkillPackage
  const readResolvedPackage = dependencies.readResolvedPackage ?? readResolvedAgentAssetPackage
  const verifyCommunityRelease = dependencies.verifyCommunityRelease ?? verifyAndLoadCommunityCoreReleaseInput
  const discoverHosted = dependencies.discoverHosted ?? discoverHostedSkills
  const applyCommunityCore = dependencies.applyCommunityCore ?? applyVerifiedCommunityCore
  const applyHostedPackage = dependencies.applyHostedPackage ?? applyVerifiedHostedSkillPackage
  const repairRuntimeBindings = dependencies.repairRuntimeBindings ?? repairAgentAssetRuntimeBindings
  const cleanupStaging = dependencies.cleanupStaging ?? cleanupAgentAssetsStaging
  const rollback = dependencies.rollback ?? rollbackAgentAssets
  const pinExactVersion = dependencies.pinExactVersion ?? pinAgentAssetsExactVersion
  const prune = dependencies.prune ?? pruneAgentAssets
  const inspectLegacyPointers = dependencies.inspectLegacyPointers ?? inspectLegacyAopsPointers
  const migrateLegacyPointers = dependencies.migrateLegacyPointers ?? migrateLegacyAopsPointers
  return Object.freeze({
    async run(request: AgentAssetsRunnerRequest): Promise<AgentAssetsRunnerResult> {
    const roots = rootContext(request.roots)

    switch (request.command) {
      case 'assets.status': {
        const store = readStoreStatus({
          assetRoot: request.roots.assetRoot,
          verify: request.options.verify === 'full' ? 'full' : 'quick',
        })
        const runtimeBindings = inspectRuntimeBindings({
          assetRoot: request.roots.assetRoot,
          runtimeHomes: {
            codex: request.roots.runtimeHomes.codex.absolutePath,
            claude: request.roots.runtimeHomes.claude.absolutePath,
          },
        })
        const diagnostics: AgentAssetsDiagnosticV1[] = []
        if (store.authorityHistory?.state === 'incomplete') {
          diagnostics.push({
            code: 'authority_history_incomplete',
            message: 'The current authority is readable, but a referenced immutable history revision is missing.',
            details: { missingRevision: store.authorityHistory.missingRevision },
          })
        }
        if (store.nativeIdentityEvidence?.state === 'recorded-not-live-verified') {
          diagnostics.push({
            code: 'native_identity_recorded_only',
            message: 'Status reports signed/recorded native identity evidence; v1 has no mutation-free live native probe.',
          })
        }
        if ((store.recoveryReasons?.length ?? 0) > 0) {
          diagnostics.push({
            code: 'managed_recovery_state_detected',
            message: 'The active core remains readable, but authenticated managed staging or receipt drift requires reconciliation.',
            details: { recoveryReasons: store.recoveryReasons },
          })
        }
        return {
          result: {
            roots,
            store,
            runtimeBindings,
            mutationFree: true,
          },
          diagnostics,
          nextActions: (store.recoveryReasons?.length ?? 0) > 0
            ? ['Inspect this full status result and reconcile only the reported managed recovery state.']
            : [],
        }
      }
      case 'assets.discover':
        if (
          request.options.offline
          || (request.options.origin !== undefined && request.options.origin !== 'hosted-cache')
        ) {
          return {
            result: {
              query: request.options.query,
              candidates: [],
              metadataOnly: true,
              networkUsed: false,
            },
            diagnostics: [{
              code: 'offline_core_only',
              message: 'Hosted discovery was not queried; resolve the installed AOPS gateway to enter the offline core.',
            }],
          }
        }
        {
          const discovery = await discoverHosted({
            query: required(request.options.query, '--query'),
            limit: request.options.limit ?? 5,
            apiBaseUrl: request.options.apiBaseUrl,
          })
          return {
            result: {
              query: discovery.query,
              normalizedQuery: discovery.normalizedQuery,
              candidates: discovery.candidates,
              metadataOnly: true,
              networkUsed: true,
            },
            diagnostics: [],
            nextActions: discovery.candidates.length === 0
              ? ['Refine the query or use `aops-cli assets resolve --gateway aops --json` for the installed core.']
              : [],
          }
        }
      case 'assets.package.inspect': {
        const manifest = readManifestReference(required(request.options.manifest, '--manifest'))
        const validation = validatePackageManifestStructureV1(manifest)
        if (!validation.ok) {
          throw new AgentAssetsError('schema_incompatible', 'PackageManifestV1 validation failed.', {
            nextActions: ['Correct the reported structural issues before any package transfer or staging.'],
            details: { issues: validation.issues },
          })
        }
        return {
          result: {
            roots,
            valid: true,
            identity: {
              assetKind: validation.value.assetKind,
              name: validation.value.name,
              version: validation.value.version,
              versionId: validation.value.versionId,
              packageSha256: validation.value.packageSha256,
            },
            entryFile: validation.value.entryFile,
            fileCount: validation.value.files.length,
            files: validation.value.files,
            nativeAliasValidation: 'required-before-materialization',
            mutationFree: true,
          },
        }
      }
      case 'assets.package.pull': {
        const versionId = required(request.options.versionId, '--version-id')
        const expectedManifest = required(request.options.expectedManifest, '--expected-manifest')
        try {
          const cached = readResolvedPackage({
            assetRoot: request.roots.assetRoot,
            versionId,
          })
          assertExpectedSkillPackageManifestV1(expectedManifest, versionId, cached.manifest)
          if (request.guard?.mode === 'apply') {
            const applied = await applyHostedPackage({
              assetRoot: request.roots.assetRoot,
              manifest: cached.manifest,
            })
            return {
              result: {
                roots,
                mode: 'applied',
                mutationFree: false,
                cacheHit: true,
                idempotent: applied.idempotent,
                packageInstalled: applied.packageInstalled,
                identity: applied.packageRef,
                generation: applied.active.generation,
                receiptId: applied.receipt.receiptId,
              },
              diagnostics: [{
                code: applied.idempotent ? 'hosted_package_already_active' : 'hosted_package_activated_from_cache',
                message: 'The exact full-verified cached package is active in the authenticated receipt chain.',
              }],
              nextActions: ['Resolve the exact version with `aops-cli assets resolve --version-id <id> --json`.'],
            }
          }
          return {
            result: {
              roots,
              mode: 'preview',
              mutationFree: true,
              cacheHit: true,
              ...cached.resolved,
              fileCount: cached.manifest.files.length,
              files: cached.manifest.files,
            },
            nextActions: request.guard?.nextActions ?? [],
            diagnostics: [{
              code: 'verified_cache_hit',
              message: 'The exact installed version passed full verification; no network request was made.',
            }],
          }
        } catch (error) {
          if (!(error instanceof AgentAssetsError) || error.code !== 'not_found') throw error
        }
        const pulled = await pullHostedPackage({
          versionId,
          expectedManifest,
          apiBaseUrl: request.options.apiBaseUrl,
        })
        if (request.guard?.mode === 'apply') {
          const applied = await applyHostedPackage({
            assetRoot: request.roots.assetRoot,
            manifest: pulled.manifest,
            transferFiles: pulled.transferFiles,
          })
          return {
            result: {
              roots,
              mode: 'applied',
              mutationFree: false,
              cacheHit: false,
              idempotent: applied.idempotent,
              packageInstalled: applied.packageInstalled,
              identity: applied.packageRef,
              generation: applied.active.generation,
              receiptId: applied.receipt.receiptId,
            },
            diagnostics: [{
              code: applied.idempotent ? 'hosted_package_already_active' : 'hosted_package_pulled_and_activated',
              message: 'Hosted bytes matched immutable publish-time metadata and were activated through the native writer.',
            }],
            nextActions: ['Resolve the exact version with `aops-cli assets resolve --version-id <id> --json`.'],
          }
        }
        return {
          result: {
            roots,
            mode: 'preview',
            mutationFree: true,
            identity: {
              name: pulled.manifest.name,
              version: pulled.manifest.version,
              versionId: pulled.manifest.versionId,
              packageSha256: pulled.manifest.packageSha256,
              origin: 'hosted-cache',
              trustClass: pulled.manifest.provenance.trustClass,
            },
            entryFile: pulled.manifest.entryFile,
            fileCount: pulled.manifest.files.length,
            files: pulled.manifest.files,
            nativeAliasValidation: pulled.validation.nativeAliasValidation,
          },
          nextActions: request.guard?.nextActions ?? [],
          diagnostics: [{
            code: 'verified_transfer_preview',
            message: 'Exact hosted bytes matched immutable publish-time metadata; no local store write was attempted.',
          }],
        }
      }
      case 'assets.install':
      case 'assets.update': {
        const release = await verifyCommunityRelease({
          releaseRoot: required(request.options.fromRelease, '--from-release'),
          verificationMode: 'offline',
        })
        const operation = request.command === 'assets.install' ? 'install' : 'update'
        if (request.guard?.mode === 'apply') {
          const target = request.options.target ?? 'both'
          const applied = await applyCommunityCore({
            assetRoot: request.roots.assetRoot,
            release,
            requestedOperation: operation,
            ...(request.options.idempotencyKey ? { idempotencyKey: request.options.idempotencyKey } : {}),
            runtimeHomes: {
              ...(target === 'codex' || target === 'both'
                ? { codex: request.roots.runtimeHomes.codex.absolutePath }
                : {}),
              ...(target === 'claude' || target === 'both'
                ? { claude: request.roots.runtimeHomes.claude.absolutePath }
                : {}),
            },
          })
          return {
            result: {
              roots,
              mode: 'applied',
              mutationFree: false,
              operation,
              target,
              idempotent: applied.idempotent,
              packageInstalled: applied.packageInstalled,
              releaseSetSha256: release.releaseSetSha256,
              identity: release.packageRef,
              store: {
                storeId: applied.authority.storeId,
                authorityRevision: applied.authority.authorityRevision,
                writerFenceEpoch: applied.authority.lastIssuedFenceEpoch,
                generation: applied.active.generation,
                receiptId: applied.receipt.receiptId,
                publicationCapability: applied.authority.publicationCapability,
                capabilityEvidenceSha256: applied.authority.capabilityEvidenceSha256,
              },
              runtimeBindings: applied.bindings,
            },
            diagnostics: [{
              code: applied.idempotent ? 'verified_install_idempotent' : 'verified_install_applied',
              message: applied.idempotent
                ? 'The exact verified core and selected runtime gateways were already ready.'
                : 'The verified core and selected runtime gateways were published through the native writer.',
            }],
            nextActions: ['Run `aops-cli assets status --verify full --json` to inspect the exact active chain.'],
          }
        }
        return {
          result: {
            roots,
            mode: 'preview',
            mutationFree: true,
            operation,
            target: request.options.target,
            releaseSetSha256: release.releaseSetSha256,
            identity: release.packageRef,
            entryFile: release.manifest.entryFile,
            fileCount: release.manifest.files.length,
            files: release.manifest.files,
            nativeAliasValidation: release.validation.nativeAliasValidation,
          },
          nextActions: request.guard?.nextActions ?? [],
          diagnostics: [{
            code: 'verified_release_preview',
            message: 'The signed Community release and exact client core bytes passed verification; no local write was attempted.',
          }],
        }
      }
      case 'assets.migrate.inspect': {
        const classifications = inspectLegacyPointers({
          assetRoot: request.roots.assetRoot,
          runtimeHomes: {
            codex: request.roots.runtimeHomes.codex.absolutePath,
            claude: request.roots.runtimeHomes.claude.absolutePath,
          },
        })
        return {
          result: {
            roots,
            classifications,
            generatorContract: LEGACY_POINTER_GENERATOR_CONTRACT_V1,
            mutationFree: true,
          },
          diagnostics: classifications.some((entry) => entry.state === 'unknown-user-owned')
            ? [{
                code: 'legacy_pointer_user_file_preserved',
                message: 'One or more runtime files are unknown/user-owned and are not eligible for migration.',
              }]
            : [],
        }
      }
      case 'assets.migrate.legacy-pointers': {
        const target = request.options.target ?? 'both'
        const runtimeHomes = {
          ...(target === 'codex' || target === 'both'
            ? { codex: request.roots.runtimeHomes.codex.absolutePath }
            : {}),
          ...(target === 'claude' || target === 'both'
            ? { claude: request.roots.runtimeHomes.claude.absolutePath }
            : {}),
        }
        if (request.guard?.mode === 'apply') {
          const migrated = await migrateLegacyPointers({
            assetRoot: request.roots.assetRoot,
            runtimeHomes,
          })
          return {
            result: {
              roots,
              mode: 'applied',
              mutationFree: false,
              target,
              idempotent: migrated.idempotent,
              migrated: migrated.migrated,
              unchanged: migrated.unchanged,
              store: {
                storeId: migrated.authority.storeId,
                authorityRevision: migrated.authority.authorityRevision,
                writerFenceEpoch: migrated.authority.lastIssuedFenceEpoch,
                generation: migrated.active.generation,
                receiptId: migrated.receipt.receiptId,
              },
              classifications: migrated.classifications,
            },
            diagnostics: [{
              code: migrated.idempotent ? 'legacy_pointers_already_migrated' : 'legacy_pointers_migrated',
              message: migrated.idempotent
                ? 'Selected runtimes had no recognized legacy pointer requiring migration.'
                : 'Only exact recognized legacy AOPS pointers were replaced through the native writer.',
            }],
            nextActions: ['Run `aops-cli assets status --verify full --json` to verify the stable gateway bindings.'],
          }
        }
        const classifications = inspectLegacyPointers({
          assetRoot: request.roots.assetRoot,
          runtimeHomes,
        })
        return {
          result: {
            roots,
            mode: 'preview',
            mutationFree: true,
            target,
            classifications,
          },
          diagnostics: [{
            code: 'legacy_pointer_migration_preview',
            message: 'Preview only; exact recognized pointers are eligible and unknown/user-owned files remain untouched.',
          }],
          nextActions: request.guard?.nextActions ?? [],
        }
      }
      case 'assets.repair':
        if (request.guard?.mode === 'apply') {
          if (request.options.cleanupStaging === true) {
            const cleaned = await cleanupStaging({ assetRoot: request.roots.assetRoot })
            return {
              result: {
                roots,
                mode: 'applied',
                mutationFree: false,
                action: 'cleanup-staging',
                idempotent: cleaned.idempotent,
                removedManagedPaths: cleaned.removedManagedPaths,
                store: {
                  storeId: cleaned.authority.storeId,
                  authorityRevision: cleaned.authority.authorityRevision,
                  writerFenceEpoch: cleaned.authority.lastIssuedFenceEpoch,
                  generation: cleaned.active?.generation ?? null,
                  receiptId: cleaned.receipt?.receiptId ?? null,
                },
              },
              diagnostics: [{
                code: cleaned.idempotent ? 'staging_cleanup_not_required' : 'staging_cleanup_applied',
                message: cleaned.idempotent
                  ? 'No provably managed incomplete staging required cleanup.'
                  : 'Only fully preflighted writer-owned staging trees were removed through the native writer.',
              }],
              nextActions: ['Run `aops-cli assets status --verify full --json` to verify that staging drift is clear.'],
            }
          }
          if (
            request.options.repairBindings !== true
            || request.options.takeoverStaleLock
            || request.options.rebindMachine
          ) {
            unsupportedApply(request)
          }
          const repaired = await repairRuntimeBindings({
            assetRoot: request.roots.assetRoot,
            runtimeHomes: {
              codex: request.roots.runtimeHomes.codex.absolutePath,
              claude: request.roots.runtimeHomes.claude.absolutePath,
            },
          })
          return {
            result: {
              roots,
              mode: 'applied',
              mutationFree: false,
              action: 'repair-bindings',
              target: 'both',
              idempotent: repaired.idempotent,
              store: {
                storeId: repaired.authority.storeId,
                authorityRevision: repaired.authority.authorityRevision,
                writerFenceEpoch: repaired.authority.lastIssuedFenceEpoch,
                generation: repaired.active.generation,
                receiptId: repaired.receipt.receiptId,
              },
              runtimeBindings: repaired.bindings,
            },
            diagnostics: [{
              code: repaired.idempotent ? 'runtime_bindings_already_ready' : 'runtime_bindings_repaired',
              message: repaired.idempotent
                ? 'Codex and Claude gateway bindings were already ready.'
                : 'Codex and Claude gateway bindings were repaired through the native writer.',
            }],
            nextActions: ['Run `aops-cli assets status --verify full --json` to inspect the exact binding chain.'],
          }
        }
        return {
          result: {
            roots,
            mode: 'preview',
            mutationFree: true,
            action: request.options.cleanupStaging
              ? 'cleanup-staging'
              : request.options.repairBindings
                ? 'repair-bindings'
                : 'inspect-repair-options',
          },
          nextActions: request.guard?.nextActions ?? [],
          diagnostics: [{
            code: request.options.cleanupStaging ? 'staging_cleanup_preview' : 'runtime_binding_repair_preview',
            message: request.options.cleanupStaging
              ? 'Preview only; no managed staging or store state was changed.'
              : 'Preview only; no runtime binding or store state was changed.',
          }],
        }
      case 'assets.rollback': {
        if (request.guard?.mode === 'apply') {
          const applied = await rollback({
            assetRoot: request.roots.assetRoot,
            ...(request.options.toReceipt ? { toReceiptId: request.options.toReceipt } : {}),
            ...(request.options.idempotencyKey ? { idempotencyKey: request.options.idempotencyKey } : {}),
          })
          return {
            result: {
              roots,
              mode: 'applied',
              mutationFree: false,
              idempotent: applied.idempotent,
              rolledBackToReceiptId: applied.rolledBackToReceiptId,
              store: {
                storeId: applied.authority.storeId,
                authorityRevision: applied.authority.authorityRevision,
                writerFenceEpoch: applied.authority.lastIssuedFenceEpoch,
                generation: applied.active.generation,
                receiptId: applied.receipt.receiptId,
              },
            },
            diagnostics: [{
              code: applied.idempotent ? 'rollback_idempotent' : 'rollback_applied',
              message: applied.idempotent
                ? 'The requested rollback operation was already active.'
                : 'A new activation receipt selected the prior verified package set.',
            }],
            nextActions: ['Run `aops-cli assets status --verify full --json` to verify protected current and previous packages.'],
          }
        }
        const target = readAgentAssetsRollbackTarget({
          assetRoot: request.roots.assetRoot,
          ...(request.options.toReceipt ? { receiptId: request.options.toReceipt } : {}),
        })
        return {
          result: {
            roots,
            mode: 'preview',
            mutationFree: true,
            currentReceiptId: target.current.receiptId,
            targetReceiptId: target.target.receiptId,
            targetGeneration: target.target.generation,
            targetCore: target.target.core,
            targetAssetCount: target.target.assets.length,
          },
          nextActions: request.guard?.nextActions ?? [],
          diagnostics: [{
            code: 'verified_rollback_preview',
            message: 'The rollback target is in the active authenticated receipt lineage and its packages passed full verification.',
          }],
        }
      }
      case 'assets.pin': {
        const versionId = required(request.options.versionId, '--version-id')
        const resolved = readResolvedPackage({ assetRoot: request.roots.assetRoot, versionId })
        if (request.guard?.mode === 'apply') {
          const applied = await pinExactVersion({
            assetRoot: request.roots.assetRoot,
            versionId,
            leaseId: required(request.options.leaseId, '--lease-id'),
            expiresAt: required(request.options.expiresAt, '--expires-at'),
          })
          return {
            result: {
              roots,
              mode: 'applied',
              mutationFree: false,
              idempotent: applied.idempotent,
              pin: applied.pin,
              maintenanceReceiptId: applied.maintenanceReceipt?.receiptId ?? null,
            },
            diagnostics: [{
              code: applied.idempotent ? 'pin_already_current' : 'pin_applied',
              message: applied.idempotent
                ? 'The exact immutable package already has the requested lease and expiry.'
                : 'The exact immutable package pin and maintenance receipt were published through the native writer.',
            }],
            nextActions: ['Run `aops-cli assets status --verify full --json` to verify the protected package set.'],
          }
        }
        return {
          result: {
            roots,
            mode: 'preview',
            mutationFree: true,
            identity: resolved.resolved,
            leaseId: request.options.leaseId,
            expiresAt: request.options.expiresAt,
          },
          nextActions: request.guard?.nextActions ?? [],
          diagnostics: [{ code: 'verified_pin_preview', message: 'The exact installed package passed full verification; no pin was written.' }],
        }
      }
      case 'assets.prune': {
        if (request.guard?.mode === 'apply') {
          const applied = await prune({ assetRoot: request.roots.assetRoot })
          return {
            result: {
              roots,
              mode: 'applied',
              mutationFree: false,
              idempotent: applied.idempotent,
              protectedPackageSha256s: applied.protectedPackageSha256s,
              removedPackageSha256s: applied.removedPackageSha256s,
              maintenanceReceiptId: applied.maintenanceReceipt?.receiptId ?? null,
            },
            diagnostics: [{
              code: applied.idempotent ? 'prune_not_required' : 'prune_applied',
              message: applied.idempotent
                ? 'No unprotected managed immutable package required removal.'
                : 'Only full-verified unprotected immutable packages were removed through the native writer.',
            }],
            nextActions: ['Run `aops-cli assets status --verify full --json` to verify the protected package set.'],
          }
        }
        const plan = readAgentAssetsPrunePlan({ assetRoot: request.roots.assetRoot })
        return {
          result: {
            roots,
            mode: 'preview',
            mutationFree: true,
            protectedPackageSha256s: plan.protectedPackageSha256s,
            removablePackageSha256s: plan.removablePackageSha256s,
            removableManagedPaths: plan.removableManagedPaths,
          },
          diagnostics: [{
            code: 'verified_prune_preview',
            message: 'All managed immutable core directories were full-verified; no path was removed.',
          }],
          nextActions: request.guard?.nextActions ?? [],
        }
      }
      case 'assets.resolve': {
        const selector = {
          ...(request.options.gateway === 'aops' ? { gateway: 'aops' as const } : {}),
          ...(request.options.name ? { name: request.options.name } : {}),
          ...(request.options.versionId ? { versionId: request.options.versionId } : {}),
        }
        if (request.options.pinId && request.options.pinUntil) {
          const resolved = resolveAgentAsset({ assetRoot: request.roots.assetRoot, ...selector })
          if (request.guard?.mode === 'apply') {
            const applied = await pinExactVersion({
              assetRoot: request.roots.assetRoot,
              versionId: resolved.versionId,
              leaseId: request.options.pinId,
              expiresAt: request.options.pinUntil,
            })
            return {
              result: { ...resolveAgentAsset({ assetRoot: request.roots.assetRoot, versionId: resolved.versionId }), pin: applied.pin },
              diagnostics: [{ code: applied.idempotent ? 'pin_already_current' : 'pin_applied', message: 'Exact resolution is protected by the requested finite pin.' }],
              nextActions: [],
            }
          }
          return {
            result: { roots, mode: 'preview', mutationFree: true, selector, resolved },
            nextActions: request.guard?.nextActions ?? [],
          }
        }
        if (request.guard?.mode === 'preview') {
          return {
            result: { roots, mode: 'preview', mutationFree: true, selector },
            nextActions: request.guard.nextActions,
          }
        }
        return {
          result: resolveAgentAsset({ assetRoot: request.roots.assetRoot, ...selector }),
          diagnostics: [],
          nextActions: [],
        }
      }
      default:
        if (request.guard?.mode === 'apply') unsupportedApply(request)
        return {
          result: {
            roots,
            mode: 'preview',
            mutationFree: true,
            plannedCommand: request.command,
          },
          nextActions: request.guard?.nextActions ?? [],
          diagnostics: [{
            code: 'native_writer_not_loaded',
            message: 'Preview is available; no store or runtime mutation was attempted.',
          }],
        }
    }
    },
  })
}

export const defaultAgentAssetsCommandRunner = createDefaultAgentAssetsCommandRunner()

function printEnvelope(envelope: AgentAssetsCommandOutput): void {
  console.log(JSON.stringify(envelope, null, 2))
}

export async function runAgentAssetsCommand(
  command: AgentAssetsCommandName,
  rawOptions: AgentAssetsCommandOptions,
  runner: AgentAssetsCommandRunner = defaultAgentAssetsCommandRunner,
): Promise<AgentAssetsCommandOutput> {
  try {
    const options = normalizeOptions(command, rawOptions)
    const roots = resolveAgentAssetsRoots(options)
    const guard = mutationGuard(command, options)
    const output = await runner.run({ command, options, roots, ...(guard ? { guard } : {}) })
    const envelope = agentAssetsSuccess({
      command,
      result: output.result,
      diagnostics: output.diagnostics,
      nextActions: output.nextActions,
    })
    if (command === 'assets.discover') {
      const result = output.result as { candidates?: unknown[] }
      assertBoundedDiscoveryEnvelope(envelope, Array.isArray(result.candidates) ? result.candidates.length : 0)
    }
    printEnvelope(envelope)
    return envelope
  } catch (error) {
    const envelope = agentAssetsFailure(command, error)
    process.exitCode = 1
    printEnvelope(envelope)
    return envelope
  }
}

function parseInteger(value: string): number {
  return Number.parseInt(value, 10)
}

function addSharedSelectors(command: Command): Command {
  return command
    .option('--data-root <path>', 'AOPS data-root containing agent-assets')
    .option('--codex-home <path>', 'Codex runtime-home override')
    .option('--claude-home <path>', 'Claude runtime-home override')
}

function addPreviewApply(command: Command, applyDescription: string): Command {
  return command
    .option('--preview', 'Explicit preview alias; preview is the default')
    .option('--apply', applyDescription)
}

function action(
  commandName: AgentAssetsCommandName,
  runner: AgentAssetsCommandRunner,
): (options: AgentAssetsCommandOptions) => Promise<void> {
  return async (options) => {
    await runAgentAssetsCommand(commandName, options, runner)
  }
}

function makePackageCommand(runner: AgentAssetsCommandRunner): Command {
  const command = new Command('package').description('Inspect or pull one exact package')

  addSharedSelectors(command.command('inspect')
    .description('Validate one exact PackageManifestV1 without writing')
    .option('--manifest <ref>', 'Local @file.json PackageManifestV1')
    .option('--json', 'Validation result, identity, file count, and digests'))
    .addHelpText('after', `
Notes:
  Inspect is read-only and does not trust a post-download self-hash as origin.
`)
    .action(action('assets.package.inspect', runner))

  addSharedSelectors(addPreviewApply(command.command('pull')
    .description('Transfer and verify one exact hosted skill package')
    .option('--version-id <id>', 'Exact hosted SkillVersion id')
    .option('--expected-manifest <ref>', 'Required @file.json or immutable release ref')
    .option('--api-base-url <url>', 'AOPS server URL; auth comes from the secure target store or environment')
    .option('--idempotency-key <key>', 'Optional local operation key')
    .option('--json', 'Stable common envelope'), 'Transfer, verify, and install immutable bytes'))
    .addHelpText('after', `
Required discovery step for raw invoke debugging:
  aops-cli agent schema --tool agentspace.skill-version.export-skill-package

Notes:
  The client transfers files[].content; server-local paths are rejected.
  Authentication comes from the secure target store or environment; secrets
  are never accepted on argv. The sugar uses the Agent Gateway and never calls
  Agentspace storage directly.
`)
    .action(action('assets.package.pull', runner))

  return command
}

function makeMigrateCommand(runner: AgentAssetsCommandRunner): Command {
  const command = new Command('migrate').description('Inspect or explicitly migrate recognized legacy pointers')
  addSharedSelectors(command.command('inspect')
    .description('Classify recognized legacy pointers without changing them')
    .option('--json', 'Stable common envelope'))
    .action(action('assets.migrate.inspect', runner))

  addSharedSelectors(command.command('legacy-pointers')
    .description('Migrate exact recognized AOPS-generated pointer templates')
    .option('--target <target>', 'codex | claude | both (default: both)', 'both')
    .option('--apply', 'Apply exact-template managed migration')
    .option('--confirm', 'Confirm runtime-file ownership transition')
    .option('--json', 'Stable common envelope'))
    .addHelpText('after', `
Notes:
  Only recognized AOPS-generated templates are eligible.
  Unknown/user-owned pointers remain untouched.
`)
    .action(action('assets.migrate.legacy-pointers', runner))
  return command
}

export function makeAssetsCommand(runner: AgentAssetsCommandRunner = defaultAgentAssetsCommandRunner): Command {
  const command = new Command('assets')
    .description(`Install, inspect, resolve, repair, and roll back verified AOPS client assets in
the user-local agent-assets store. This family does not choose a working method
and does not treat repository mirrors as installation truth.`)
    .addHelpText('after', `
Safety:
  Read-only commands never mutate the store.
  Mutations preview by default and require --apply.
  Destructive takeover, rebind, rollback, prune, and migration require
  --apply --confirm.

Shared selectors (available on every subcommand):
  --data-root <path>    AOPS data-root containing agent-assets
  --codex-home <path>   Codex runtime-home override
  --claude-home <path>  Claude runtime-home override

Selector precedence:
  explicit CLI option
  > AOPS_AGENT_ASSETS_DATA_ROOT / CODEX_HOME / CLAUDE_HOME
  > user aops.config.json agentAssets.dataRoot /
    agentAssets.runtimeHomes.codex / agentAssets.runtimeHomes.claude
  > ~/.aops / ~/.codex / ~/.claude defaults.

All resolved roots must be absolute. Every JSON envelope reports non-secret
storeId/runtimeHomeId values. Commands that do not bind a runtime accept the
shared selectors for deterministic context but perform no runtime write.

Canonical guide:
  aops-cli assets --help
  aops-cli agent schema --tool <domain>.<operation> for raw hosted payloads
`)

  addSharedSelectors(command.command('status')
    .description('Inspect active state, runtime bindings, staging, and drift')
    .option('--verify <mode>', 'Verification depth: quick | full (default: quick)', 'quick')
    .option('--json', 'Stable agent-assets-client-v1 JSON envelope'))
    .addHelpText('after', `
Notes:
  quick validates schemas, receipt links, immutable binding proofs, ownership
  markers, referenced paths, and every available authority-history revision.
  full rehashes every active/previous/pinned immutable package file.
  Both report recorded publicationCapability, capabilityEvidenceSha256,
  authority-history coverage, native root/machine identity, and the
  maintenance-receipt chain head. V1 status has no read-only live native probe;
  mutation commands requalify the current machine, root, filesystem, helper,
  and Windows crash-injection evidence before writing.
  status never repairs, downloads, syncs, or rewrites runtime bindings.
`)
    .action(action('assets.status', runner))

  addSharedSelectors(command.command('discover')
    .description('Return bounded metadata candidates without body loading')
    .option('--query <text>', 'Intent, domain, CLI family, alias, or exact asset name')
    .option('--limit <n>', 'Candidate limit, 1..5 (default: 5)', parseInteger, 5)
    .option('--origin <origin>', 'bundled | hosted-cache | reserved-catalog')
    .option('--offline', 'Do not query configured AOPS servers')
    .option('--api-base-url <url>', 'Optional AOPS server for hosted metadata discovery')
    .option('--json', 'Stable bounded JSON envelope'))
    .addHelpText('after', `
Contract:
  Before body load the complete result is <=2 KiB and contains <=5 candidates.
  Results use approved raw metadata only and include matchedBy/rationale.
`)
    .action(action('assets.discover', runner))

  addSharedSelectors(command.command('resolve')
    .description('Resolve one exact verified local entry')
    .option('--gateway <name>', 'Stable runtime gateway identity; v1 supports aops')
    .option('--name <name>', 'Exact asset name/current installed selection')
    .option('--version-id <id>', 'Exact immutable installed version')
    .option('--offline', 'Never use network discovery/package transfer')
    .option('--pin-id <id>', 'Pin an exact historical version before returning it')
    .option('--pin-until <iso>', 'Required with --pin-id')
    .option('--apply', 'Required only when creating/renewing a pin')
    .option('--json', 'ResolverEnvelopeV1 in the common command envelope'))
    .addHelpText('after', `
Notes:
  Exactly one of --gateway, --name, or --version-id is required.
  --gateway aops resolves only the active signed client core.
  Repository .aops mirrors are never implicit candidates.
  Historical exact resolution requires an active/previous reference or pin.
`)
    .action(action('assets.resolve', runner))

  for (const [name, description, applyDescription] of [
    ['install', 'Install the signed client core from a Community release', 'Apply verified local writes'],
    ['update', 'Activate verified assets from a newer Community release', 'Activate the verified update'],
  ] as const) {
    addSharedSelectors(addPreviewApply(command.command(name)
      .description(description)
      .option('--from-release <path>', 'Verified Community release/package root')
      .option('--target <target>', 'codex | claude | both (default: both)', 'both')
      .option('--idempotency-key <key>', 'Optional replay/conflict key')
      .option('--json', 'Stable common envelope'), applyDescription))
      .addHelpText('after', name === 'install' ? `
Notes:
  Install verifies signed expected digests before activation.
  It refuses unowned runtime files and never scans a repository for core bytes.
` : `
Notes:
  Update installs side-by-side immutable content and appends a receipt.
  It never mutates the stable gateway merely because a package digest changed.
`)
      .action(action(`assets.${name}`, runner))
  }

  command.addCommand(makePackageCommand(runner))

  addSharedSelectors(addPreviewApply(command.command('pin')
    .description('Protect one exact package until an explicit expiry')
    .option('--version-id <id>', 'Exact installed immutable version')
    .option('--lease-id <id>', 'Stable caller/session lease identity')
    .option('--expires-at <iso>', 'Explicit finite expiry')
    .option('--json', 'Stable common envelope'), 'Create or renew the exact-version pin'))
    .addHelpText('after', `
Notes:
  Pin and prune serialize through the same writer lease.
  Applied pin/renewal appends MaintenanceReceiptV1 with authority revision and
  fence epoch; an unrecorded mutation is not reported as applied.
  V1 creates no permanent implicit pin.
`)
    .action(action('assets.pin', runner))

  addSharedSelectors(addPreviewApply(command.command('repair')
    .description('Diagnose or repair managed incomplete/drifted state')
    .option('--cleanup-staging', 'Remove only provably incomplete managed staging')
    .option('--repair-bindings', 'Restore modified/missing AOPS-managed gateways')
    .option('--takeover-stale-lock', 'Reserved in v1; apply fails closed')
    .option('--rebind-machine', 'Reserved in v1; apply fails closed')
    .option('--confirm', 'Required for takeover/rebind or destructive repair')
    .option('--json', 'Stable common envelope'), 'Apply non-destructive managed repairs'))
    .addHelpText('after', `
Notes:
  No flag steals a live or unverifiable kernel publication guard.
  --cleanup-staging requires --apply --confirm and removes only strictly
  preflighted writer-owned operation trees after acquiring a native writer
  guard and issuing a new CAS fence. --takeover-stale-lock and --rebind-machine
  are reserved in v1 and fail closed; no lease or copied-store adoption is
  claimed by this build.
  User-owned files are reported but never changed.
`)
    .action(action('assets.repair', runner))

  addSharedSelectors(addPreviewApply(command.command('rollback')
    .description('Create a new activation from a prior verified receipt')
    .option('--to-receipt <id>', 'Prior verified activation; default previous')
    .option('--confirm', 'Explicit rollback confirmation')
    .option('--idempotency-key <key>', 'Optional replay/conflict key')
    .option('--json', 'Stable common envelope'), 'Apply a new rollback activation receipt'))
    .addHelpText('after', `
Notes:
  Rollback appends history and never edits/deletes an earlier receipt.
`)
    .action(action('assets.rollback', runner))

  addSharedSelectors(addPreviewApply(command.command('prune')
    .description('Remove only unprotected managed immutable cores')
    .option('--confirm', 'Explicit deletion confirmation')
    .option('--json', 'Stable common envelope'), 'Apply managed cleanup'))
    .addHelpText('after', `
Notes:
  Active, previous, current-release, and unexpired pinned digests are protected.
  Applied prune appends MaintenanceReceiptV1 with protected/removed digests and
  affected managed paths before reporting success.
  Unknown files, unsafe links, and unowned paths abort cleanup.
`)
    .action(action('assets.prune', runner))

  command.addCommand(makeMigrateCommand(runner))
  return command
}
