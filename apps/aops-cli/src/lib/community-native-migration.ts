import {
  applyCommunityStrictPgSchema,
  planCommunityStrictPgSchema,
  type CommunityStrictMigrationApplyResultV1,
  type CommunityStrictMigrationPlanAcceptedContextV1,
  type CommunityStrictMigrationPlanningResultV1,
  type CommunityStrictMigrationPolicyV1,
  type CommunityStrictSnapshotPolicyV1,
} from '@aops/pg-bootstrap'
import { lstatSync, readFileSync, realpathSync } from 'node:fs'
import path from 'node:path'

export const COMMUNITY_NATIVE_MIGRATION_POLICY_PATH =
  'apps/aops-server/scripts/community-migration-policy-v1.json'
export const COMMUNITY_NATIVE_PACKAGE_MIGRATION_POLICY_PATH =
  'scripts/community-migration-policy-v1.json'

const MAX_POLICY_BYTES = 2 * 1024 * 1024
const INSTANCE_NAME = /^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const PREFIXED_SHA256 = /^sha256:[a-f0-9]{64}$/
const RAW_SHA256 = /^[a-f0-9]{64}$/

export type CommunityNativeMigrationReceiptV1 = Readonly<{
  schemaVersion: 1
  status: 'community-native-migration-verified'
  instanceName: string
  installId: string
  sourceFingerprint: string
  completedAt: string
  policyId: string
  targetLineageId: string
  resultLineageId: string
  action: 'migrate' | 'verify-only'
  pendingMigrationCount: number
  policySha256: string
  bundleSha256: string
  acceptedPlanSha256: string
  sourceMigrationStateFingerprintSha256: string
  resultSchemaFingerprintSha256: string
  resultReceiptFingerprintSha256: string
  resultMigrationStateFingerprintSha256: string
  durableAcceptanceAction: 'migrate' | 'verify-only'
  durableAcceptanceAt: string
  snapshotEvidenceKind: 'managed-verified-backup' | 'external-snapshot-attestation' | null
  snapshotEvidenceSha256: string | null
  latestAppliedPlanSha256: string | null
  latestAppliedSourceMigrationStateFingerprintSha256: string | null
  latestAppliedResultStateFingerprintSha256: string | null
  latestAppliedEvidenceKind: 'managed-verified-backup' | 'external-snapshot-attestation' | null
  latestAppliedEvidenceSha256: string | null
  latestAppliedAt: string | null
  recoveredAppliedPlanSha256: string | null
  migrationLogCount: number
}>

export type CommunityNativeSnapshotEvidenceSelection = Readonly<{
  path: string
  policy: CommunityStrictSnapshotPolicyV1
}>

export type CommunityNativeMigrationIntentExpectationV1 = Readonly<{
  acceptedPlanSha256: string
  sourceMigrationStateFingerprintSha256: string
  snapshotEvidenceKind: 'managed-verified-backup' | 'external-snapshot-attestation' | null
  snapshotEvidenceSha256: string | null
}>

export type CommunityNativeSnapshotEvidenceProviderContext = Readonly<{
  planning: CommunityStrictMigrationPlanningResultV1
  policy: CommunityStrictMigrationPolicyV1
  sourceRoot: string
  repoUrl: string
  signal?: AbortSignal
}>

export type CommunityNativeMigrationInvocation = Readonly<{
  sourceRoot: string
  repoUrl: string
  instanceName: string
  installId: string
  sourceFingerprint: string
  snapshotEvidenceProvider?: (
    context: CommunityNativeSnapshotEvidenceProviderContext,
  ) => Promise<CommunityNativeSnapshotEvidenceSelection | null>
  onPlanAccepted?: (context: CommunityStrictMigrationPlanAcceptedContextV1) => void | Promise<void>
  priorIntentExpectation?: CommunityNativeMigrationIntentExpectationV1 | null
  requiredPlanSha256?: string
  requiredAction?: 'verify-only'
  signal?: AbortSignal
}>

export type CommunityNativeMigrationRunner = (
  invocation: CommunityNativeMigrationInvocation,
) => Promise<CommunityNativeMigrationReceiptV1>

type CommunityNativeMigrationDependencies = Readonly<{
  applyStrictPgSchema?: typeof applyCommunityStrictPgSchema
  planStrictPgSchema?: typeof planCommunityStrictPgSchema
  now?: () => Date
}>

export type CommunityNativeMigrationPlanningContextV1 = Readonly<{
  planning: CommunityStrictMigrationPlanningResultV1
  policy: CommunityStrictMigrationPolicyV1
}>

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort()
  const wanted = [...expected].sort()
  return actual.length === wanted.length && actual.every((key, index) => key === wanted[index])
}

function isWithin(root: string, candidate: string): boolean {
  const relative = path.relative(path.resolve(root), path.resolve(candidate))
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new Error('community_operation_aborted')
}

export function readCommunityNativeMigrationPolicy(sourceRoot: string): CommunityStrictMigrationPolicyV1 {
  const resolvedRoot = path.resolve(sourceRoot)
  const rootStats = lstatSync(resolvedRoot)
  if (!rootStats.isDirectory() || rootStats.isSymbolicLink()) {
    throw new Error('community_native_migration_source_root_invalid')
  }
  const canonicalRoot = realpathSync.native(resolvedRoot)
  if (path.relative(resolvedRoot, canonicalRoot) !== '' || path.relative(canonicalRoot, resolvedRoot) !== '') {
    throw new Error('community_native_migration_source_root_alias_refused')
  }
  const manifest = (() => {
    try { return JSON.parse(readFileSync(path.join(canonicalRoot, 'package.json'), 'utf8')) as Record<string, unknown> }
    catch { return {} }
  })()
  const relativePolicyPath = manifest.name === '@aopslab/aops-server'
    ? COMMUNITY_NATIVE_PACKAGE_MIGRATION_POLICY_PATH
    : COMMUNITY_NATIVE_MIGRATION_POLICY_PATH
  const policyPath = path.resolve(canonicalRoot, ...relativePolicyPath.split('/'))
  if (!isWithin(canonicalRoot, policyPath)) throw new Error('community_native_migration_policy_path_escape')
  const stats = lstatSync(policyPath)
  if (!stats.isFile() || stats.isSymbolicLink() || stats.size < 1 || stats.size > MAX_POLICY_BYTES) {
    throw new Error('community_native_migration_policy_file_invalid')
  }
  const canonicalPolicyPath = realpathSync.native(policyPath)
  if (!isWithin(canonicalRoot, canonicalPolicyPath) || path.relative(policyPath, canonicalPolicyPath) !== '') {
    throw new Error('community_native_migration_policy_path_unsafe')
  }
  try {
    return JSON.parse(readFileSync(canonicalPolicyPath, 'utf8')) as CommunityStrictMigrationPolicyV1
  } catch {
    throw new Error('community_native_migration_policy_json_invalid')
  }
}

export async function planCommunityNativeMigration(params: {
  sourceRoot: string
  repoUrl: string
  signal?: AbortSignal
}, dependencies: Pick<CommunityNativeMigrationDependencies, 'planStrictPgSchema'> = {}):
Promise<CommunityNativeMigrationPlanningContextV1> {
  if (!path.isAbsolute(params.sourceRoot) || !params.repoUrl) {
    throw new Error('community_native_migration_planning_invocation_invalid')
  }
  throwIfAborted(params.signal)
  const policy = readCommunityNativeMigrationPolicy(params.sourceRoot)
  const planning = await (dependencies.planStrictPgSchema ?? planCommunityStrictPgSchema)({
    repoUrl: params.repoUrl,
    workspaceRoot: params.sourceRoot,
    policy,
  })
  throwIfAborted(params.signal)
  return { planning, policy }
}

export function assertCommunityNativeMigrationReceiptV1(
  value: unknown,
): CommunityNativeMigrationReceiptV1 {
  if (!isRecord(value) || !exactKeys(value, [
    'schemaVersion', 'status', 'instanceName', 'installId', 'sourceFingerprint', 'completedAt',
    'policyId', 'targetLineageId', 'resultLineageId', 'action', 'pendingMigrationCount',
    'policySha256', 'bundleSha256', 'acceptedPlanSha256', 'sourceMigrationStateFingerprintSha256',
    'resultSchemaFingerprintSha256', 'resultReceiptFingerprintSha256',
    'resultMigrationStateFingerprintSha256', 'durableAcceptanceAction', 'durableAcceptanceAt',
    'snapshotEvidenceKind', 'snapshotEvidenceSha256', 'latestAppliedPlanSha256',
    'latestAppliedSourceMigrationStateFingerprintSha256',
    'latestAppliedResultStateFingerprintSha256',
    'latestAppliedEvidenceKind', 'latestAppliedEvidenceSha256', 'latestAppliedAt',
    'recoveredAppliedPlanSha256', 'migrationLogCount',
  ])) {
    throw new Error('community_native_migration_receipt_schema_invalid')
  }
  if (
    value.schemaVersion !== 1 || value.status !== 'community-native-migration-verified' ||
    !INSTANCE_NAME.test(String(value.instanceName)) || !UUID.test(String(value.installId)) ||
    !PREFIXED_SHA256.test(String(value.sourceFingerprint)) ||
    Number.isNaN(Date.parse(String(value.completedAt))) ||
    typeof value.policyId !== 'string' || value.policyId.length < 1 ||
    typeof value.targetLineageId !== 'string' || value.targetLineageId.length < 1 ||
    typeof value.resultLineageId !== 'string' || value.resultLineageId.length < 1 ||
    (value.action !== 'migrate' && value.action !== 'verify-only') ||
    (value.durableAcceptanceAction !== 'migrate' && value.durableAcceptanceAction !== 'verify-only') ||
    Number.isNaN(Date.parse(String(value.durableAcceptanceAt))) ||
    !['managed-verified-backup', 'external-snapshot-attestation', null]
      .includes(value.snapshotEvidenceKind as any) ||
    !['managed-verified-backup', 'external-snapshot-attestation', null]
      .includes(value.latestAppliedEvidenceKind as any) ||
    (value.latestAppliedAt !== null && Number.isNaN(Date.parse(String(value.latestAppliedAt)))) ||
    !Number.isSafeInteger(value.pendingMigrationCount) || Number(value.pendingMigrationCount) < 0 ||
    !Number.isSafeInteger(value.migrationLogCount) || Number(value.migrationLogCount) < 0 ||
    ![
      value.policySha256,
      value.bundleSha256,
      value.acceptedPlanSha256,
      value.sourceMigrationStateFingerprintSha256,
      value.resultSchemaFingerprintSha256,
      value.resultReceiptFingerprintSha256,
      value.resultMigrationStateFingerprintSha256,
    ].every((digest) => RAW_SHA256.test(String(digest)))
    || ![value.snapshotEvidenceSha256, value.latestAppliedPlanSha256,
      value.latestAppliedSourceMigrationStateFingerprintSha256,
      value.latestAppliedResultStateFingerprintSha256,
      value.latestAppliedEvidenceSha256, value.recoveredAppliedPlanSha256]
      .every((digest) => digest === null || RAW_SHA256.test(String(digest)))
    || (value.snapshotEvidenceKind === null) !== (value.snapshotEvidenceSha256 === null)
    || (value.latestAppliedEvidenceKind === null) !== (value.latestAppliedEvidenceSha256 === null)
    || (value.latestAppliedPlanSha256 === null) !== (value.latestAppliedAt === null)
    || (value.latestAppliedPlanSha256 === null) !==
      (value.latestAppliedSourceMigrationStateFingerprintSha256 === null)
    || (value.latestAppliedPlanSha256 === null) !==
      (value.latestAppliedResultStateFingerprintSha256 === null)
    || value.action !== value.durableAcceptanceAction
    || (value.action === 'migrate' && value.latestAppliedPlanSha256 !== value.acceptedPlanSha256)
    || (value.action === 'migrate' && (
      value.latestAppliedSourceMigrationStateFingerprintSha256 !==
        value.sourceMigrationStateFingerprintSha256 ||
      value.latestAppliedResultStateFingerprintSha256 !==
        value.resultMigrationStateFingerprintSha256 ||
      value.latestAppliedEvidenceKind !== value.snapshotEvidenceKind ||
      value.latestAppliedEvidenceSha256 !== value.snapshotEvidenceSha256 ||
      value.latestAppliedAt !== value.durableAcceptanceAt
    ))
    || (value.recoveredAppliedPlanSha256 !== null &&
      value.recoveredAppliedPlanSha256 !== value.latestAppliedPlanSha256)
  ) {
    throw new Error('community_native_migration_receipt_schema_invalid')
  }
  return value as CommunityNativeMigrationReceiptV1
}

function receiptFromResult(
  invocation: CommunityNativeMigrationInvocation,
  result: CommunityStrictMigrationApplyResultV1,
  completedAt: string,
  migrationLogCount: number,
): CommunityNativeMigrationReceiptV1 {
  let recoveredAppliedPlanSha256: string | null = null
  const prior = invocation.priorIntentExpectation
  if (prior) {
    const latest = result.latestAppliedAcceptance
    if (!latest || latest.acceptedPlanSha256 !== prior.acceptedPlanSha256 ||
        latest.sourceFingerprintSha256 !== prior.sourceMigrationStateFingerprintSha256 ||
        latest.evidenceKind !== prior.snapshotEvidenceKind ||
        latest.evidenceSha256 !== prior.snapshotEvidenceSha256) {
      throw new Error('community_native_migration_intent_not_reconciled')
    }
    recoveredAppliedPlanSha256 = prior.acceptedPlanSha256
  }
  return assertCommunityNativeMigrationReceiptV1({
    schemaVersion: 1,
    status: 'community-native-migration-verified',
    instanceName: invocation.instanceName,
    installId: invocation.installId,
    sourceFingerprint: invocation.sourceFingerprint,
    completedAt,
    policyId: result.policyId,
    targetLineageId: result.migrationPlan.target.lineageId,
    resultLineageId: result.lineageId,
    action: result.migrationPlan.action,
    pendingMigrationCount: result.migrationPlan.pendingMigrations.length,
    policySha256: result.migrationPlan.policySha256,
    bundleSha256: result.migrationPlan.bundleSha256,
    acceptedPlanSha256: result.acceptedPlanSha256,
    sourceMigrationStateFingerprintSha256: result.sourceFingerprintSha256,
    resultSchemaFingerprintSha256: result.schemaFingerprintSha256,
    resultReceiptFingerprintSha256: result.receiptFingerprintSha256,
    resultMigrationStateFingerprintSha256: result.stateFingerprintSha256,
    durableAcceptanceAction: result.durableAcceptance.action,
    durableAcceptanceAt: result.durableAcceptance.acceptedAt,
    snapshotEvidenceKind: result.durableAcceptance.evidenceKind,
    snapshotEvidenceSha256: result.durableAcceptance.evidenceSha256,
    latestAppliedPlanSha256: result.latestAppliedPlanSha256,
    latestAppliedSourceMigrationStateFingerprintSha256:
      result.latestAppliedAcceptance?.sourceFingerprintSha256 ?? null,
    latestAppliedResultStateFingerprintSha256:
      result.latestAppliedAcceptance?.resultStateFingerprintSha256 ?? null,
    latestAppliedEvidenceKind: result.latestAppliedAcceptance?.evidenceKind ?? null,
    latestAppliedEvidenceSha256: result.latestAppliedAcceptance?.evidenceSha256 ?? null,
    latestAppliedAt: result.latestAppliedAcceptance?.acceptedAt ?? null,
    recoveredAppliedPlanSha256,
    migrationLogCount,
  })
}

export async function runCommunityNativeMigration(
  invocation: CommunityNativeMigrationInvocation,
  dependencies: CommunityNativeMigrationDependencies = {},
): Promise<CommunityNativeMigrationReceiptV1> {
  const prior = invocation.priorIntentExpectation
  if (!path.isAbsolute(invocation.sourceRoot) || !invocation.repoUrl ||
      !INSTANCE_NAME.test(invocation.instanceName) || !UUID.test(invocation.installId) ||
      !PREFIXED_SHA256.test(invocation.sourceFingerprint) ||
      (prior !== undefined && prior !== null && (
        !RAW_SHA256.test(prior.acceptedPlanSha256) ||
        !RAW_SHA256.test(prior.sourceMigrationStateFingerprintSha256) ||
        !['managed-verified-backup', 'external-snapshot-attestation', null]
          .includes(prior.snapshotEvidenceKind) ||
        (prior.snapshotEvidenceSha256 !== null && !RAW_SHA256.test(prior.snapshotEvidenceSha256)) ||
        (prior.snapshotEvidenceKind === null) !== (prior.snapshotEvidenceSha256 === null)
      )) ||
      (invocation.requiredPlanSha256 !== undefined && !RAW_SHA256.test(invocation.requiredPlanSha256)) ||
      (invocation.requiredAction !== undefined && invocation.requiredAction !== 'verify-only')) {
    throw new Error('community_native_migration_invocation_invalid')
  }
  throwIfAborted(invocation.signal)
  const policy = readCommunityNativeMigrationPolicy(invocation.sourceRoot)
  const logs: string[] = []
  let planning: CommunityStrictMigrationPlanningResultV1 | undefined
  let evidence: CommunityNativeSnapshotEvidenceSelection | null = null
  if (invocation.snapshotEvidenceProvider) {
    planning = await (dependencies.planStrictPgSchema ?? planCommunityStrictPgSchema)({
      repoUrl: invocation.repoUrl,
      workspaceRoot: invocation.sourceRoot,
      policy,
    })
    throwIfAborted(invocation.signal)
    if (invocation.requiredPlanSha256 !== undefined &&
        planning.acceptedPlanSha256 !== invocation.requiredPlanSha256) {
      throw new Error(
        `community_native_required_migration_plan_mismatch:expected=${invocation.requiredPlanSha256}:actual=${planning.acceptedPlanSha256}`,
      )
    }
    if (invocation.requiredAction !== undefined && planning.migrationPlan.action !== invocation.requiredAction) {
      throw new Error(`community_native_required_migration_action_mismatch:${planning.migrationPlan.action}`)
    }
    evidence = await invocation.snapshotEvidenceProvider({
      planning,
      policy,
      sourceRoot: invocation.sourceRoot,
      repoUrl: invocation.repoUrl,
      signal: invocation.signal,
    })
    throwIfAborted(invocation.signal)
    if (planning.requiresSnapshotEvidence && evidence === null) {
      throw new Error('community_native_snapshot_evidence_required')
    }
    if (!planning.requiresSnapshotEvidence && evidence !== null) {
      throw new Error('community_native_snapshot_evidence_unexpected')
    }
    if (evidence && !path.isAbsolute(evidence.path)) {
      throw new Error('community_native_snapshot_evidence_path_invalid')
    }
  }
  let result: CommunityStrictMigrationApplyResultV1
  try {
    result = await (dependencies.applyStrictPgSchema ?? applyCommunityStrictPgSchema)({
      repoUrl: invocation.repoUrl,
      workspaceRoot: invocation.sourceRoot,
      policy,
      expectedPlanSha256: planning?.acceptedPlanSha256,
      snapshotEvidencePath: evidence?.path,
      snapshotPolicy: evidence?.policy,
      onPlanAccepted: invocation.onPlanAccepted,
      logs,
    })
  } catch (error) {
    if (invocation.signal?.aborted) throw new Error('community_operation_aborted')
    throw error
  }
  throwIfAborted(invocation.signal)
  return receiptFromResult(
    invocation,
    result,
    (dependencies.now ?? (() => new Date()))().toISOString(),
    logs.length,
  )
}
