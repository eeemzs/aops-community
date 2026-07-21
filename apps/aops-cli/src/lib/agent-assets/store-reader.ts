import { createHash } from 'node:crypto'
import {
  existsSync,
  lstatSync,
  readFileSync,
  readdirSync,
  realpathSync,
  type Stats,
} from 'node:fs'
import path from 'node:path'

import { AgentAssetsError } from './envelope.js'
import {
  canonicalPackageSha256V1,
  sha256Bytes,
  validatePackageManifestStructureV1,
  validatePortablePackageV1,
} from './package-manifest.js'
import type {
  ActivationOperationV1,
  ActivationReceiptV1,
  ActivePointerV1,
  AgentAssetsStoreStatusV1,
  ExactVersionPinV1,
  MaintenancePointerV1,
  MaintenanceReceiptV1,
  PackageOriginV1,
  PackageRefV1,
  PublicationCapabilityV1,
  ResolverEnvelopeV1,
  StoreAuthorityV1,
} from './store-types.js'
import type { PackageManifestV1, PackageTrustClassV1 } from './types.js'
import { portablePackageCaseKeyV1, validatePortablePackagePath } from './portable-path.js'

const SHA256_HEX = /^[a-f0-9]{64}$/
const MAX_STATE_BYTES = 1024 * 1024
const MAX_STORE_DIRECTORY_ENTRIES = 10_000
const MAX_STAGING_TREE_ENTRIES = 10_000
const MAX_STAGING_TREE_DEPTH = 64
const STAGING_OPERATION_ID = /^(?:[a-f0-9]{40}(?:\.[a-f0-9]{40})?|[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12})$/
const AUTHORITY_KEYS = [
  'schemaVersion',
  'storeId',
  'authorityRevision',
  'boundMachineId',
  'rootIdentitySha256',
  'publicationCapability',
  'capabilityEvidenceSha256',
  'lastIssuedFenceEpoch',
  'previousAuthoritySha256',
  'createdAt',
  'updatedAt',
] as const
const ACTIVE_KEYS = [
  'schemaVersion',
  'storeId',
  'generation',
  'receiptId',
  'receiptSha256',
  'writerFenceEpoch',
  'authorityRevision',
  'updatedAt',
] as const
const RECEIPT_KEYS = [
  'schemaVersion',
  'storeId',
  'receiptId',
  'operationId',
  'operation',
  'generation',
  'createdAt',
  'writerFenceEpoch',
  'authorityRevision',
  'previousReceiptId',
  'previousReceiptSha256',
  'core',
  'assets',
] as const
const PACKAGE_REF_KEYS = [
  'name',
  'version',
  'versionId',
  'packageSha256',
  'entryFile',
  'origin',
  'trustClass',
] as const
const PIN_KEYS = [
  'schemaVersion',
  'storeId',
  'leaseId',
  'packageSha256',
  'owner',
  'createdAt',
  'expiresAt',
  'writerFenceEpoch',
  'authorityRevision',
] as const
const MAINTENANCE_POINTER_KEYS = [
  'schemaVersion',
  'storeId',
  'receiptId',
  'receiptSha256',
  'writerFenceEpoch',
  'authorityRevision',
  'updatedAt',
] as const
const MAINTENANCE_RECEIPT_KEYS = [
  'schemaVersion',
  'storeId',
  'receiptId',
  'operationId',
  'operation',
  'createdAt',
  'writerFenceEpoch',
  'authorityRevision',
  'previousReceiptId',
  'previousReceiptSha256',
  'protectedPackageSha256s',
  'removedPackageSha256s',
  'affectedManagedPaths',
] as const

type JsonRecord = Record<string, unknown>

export type AgentAssetsStoreReaderOptions = Readonly<{
  assetRoot: string
  expectedMachineId?: string
  expectedRootIdentitySha256?: string
  now?: Date
}>

export type ResolveAgentAssetOptions = AgentAssetsStoreReaderOptions & Readonly<{
  gateway?: 'aops'
  name?: string
  versionId?: string
}>

export type ResolvedAgentAssetPackageV1 = Readonly<{
  resolved: ResolverEnvelopeV1
  manifest: PackageManifestV1
}>

export type AgentAssetsStoreSnapshotV1 =
  | Readonly<{ authority: StoreAuthorityV1; active: null; receipt: null }>
  | Readonly<{ authority: StoreAuthorityV1; active: ActivePointerV1; receipt: ActivationReceiptV1 }>

export type AgentAssetsRollbackTargetV1 = Readonly<{
  authority: StoreAuthorityV1
  active: ActivePointerV1
  current: ActivationReceiptV1
  target: ActivationReceiptV1
}>

export type AgentAssetsMaintenanceHeadV1 = Readonly<{
  pointer: MaintenancePointerV1
  receipt: MaintenanceReceiptV1
}>

export type AgentAssetsPrunePlanV1 = Readonly<{
  authority: StoreAuthorityV1
  protectedPackageSha256s: readonly string[]
  removablePackageSha256s: readonly string[]
  removableManagedPaths: readonly string[]
}>

export type AgentAssetsStagingCleanupPlanV1 = Readonly<{
  authority: StoreAuthorityV1
  active: ActivePointerV1 | null
  receipt: ActivationReceiptV1 | null
  removableManagedPaths: readonly string[]
  treeIdentitySha256: string
}>

type OpenStore = Readonly<{
  assetRoot: string
  realRoot: string
  authority: StoreAuthorityV1
  active: ActivePointerV1
  receipt: ActivationReceiptV1
}>

function storeError(
  code: ConstructorParameters<typeof AgentAssetsError>[0],
  message: string,
  details?: Readonly<Record<string, unknown>>,
): AgentAssetsError {
  return new AgentAssetsError(code, message, {
    nextActions: ['Run `aops assets status --verify full --json` before retrying.'],
    ...(details === undefined ? {} : { details }),
  })
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function exactRecord(value: unknown, keys: readonly string[], label: string): JsonRecord {
  if (!isRecord(value)) throw storeError('schema_incompatible', `${label} must be an object.`)
  const actual = Object.keys(value).sort()
  const expected = [...keys].sort()
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw storeError('schema_incompatible', `${label} has missing or unknown fields.`, { actual, expected })
  }
  return value
}

function stringField(record: JsonRecord, key: string, label: string, minimumLength = 1): string {
  const value = record[key]
  if (typeof value !== 'string' || value.length < minimumLength) {
    throw storeError('schema_incompatible', `${label}.${key} must be a non-empty string.`)
  }
  return value
}

function integerField(record: JsonRecord, key: string, label: string, minimum: number): number {
  const value = record[key]
  if (!Number.isSafeInteger(value) || (value as number) < minimum) {
    throw storeError('schema_incompatible', `${label}.${key} must be an integer greater than or equal to ${minimum}.`)
  }
  return value as number
}

function shaField(record: JsonRecord, key: string, label: string): string {
  const value = stringField(record, key, label)
  if (!SHA256_HEX.test(value)) throw storeError('schema_incompatible', `${label}.${key} must be lowercase SHA-256.`)
  return value
}

function nullableShaField(record: JsonRecord, key: string, label: string): string | null {
  if (record[key] === null) return null
  return shaField(record, key, label)
}

function dateField(record: JsonRecord, key: string, label: string): string {
  const value = stringField(record, key, label)
  if (!Number.isFinite(Date.parse(value))) throw storeError('schema_incompatible', `${label}.${key} must be an ISO date-time.`)
  return value
}

function stringArrayField(
  record: JsonRecord,
  key: string,
  label: string,
  validate?: (value: string) => boolean,
): readonly string[] {
  const value = record[key]
  if (!Array.isArray(value) || value.some((entry) => typeof entry !== 'string' || !entry || (validate && !validate(entry)))) {
    throw storeError('schema_incompatible', `${label}.${key} must be an array of valid non-empty strings.`)
  }
  if (new Set(value).size !== value.length) {
    throw storeError('schema_incompatible', `${label}.${key} must not contain duplicates.`)
  }
  return value
}

function enumField<T extends string>(
  record: JsonRecord,
  key: string,
  values: readonly T[],
  label: string,
): T {
  const value = record[key]
  if (typeof value !== 'string' || !values.includes(value as T)) {
    throw storeError('schema_incompatible', `${label}.${key} is not a supported value.`)
  }
  return value as T
}

function assertSchemaV1(record: JsonRecord, label: string): void {
  if (record.schemaVersion !== 1) throw storeError('schema_incompatible', `${label}.schemaVersion must equal 1.`)
}

/** RFC 8785-compatible for the JSON-only v1 records (finite JSON numbers and UTF-16 key ordering). */
export function canonicalJsonV1(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value)
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw storeError('schema_incompatible', 'Canonical JSON cannot contain non-finite numbers.')
    return JSON.stringify(value)
  }
  if (Array.isArray(value)) return `[${value.map((entry) => canonicalJsonV1(entry)).join(',')}]`
  if (!isRecord(value)) throw storeError('schema_incompatible', 'Canonical JSON contains a non-JSON value.')
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJsonV1(value[key])}`)
    .join(',')}}`
}

export function canonicalJsonSha256V1(value: unknown): string {
  return createHash('sha256').update(canonicalJsonV1(value), 'utf8').digest('hex')
}

function assertRoot(assetRoot: string): { assetRoot: string; realRoot: string } | null {
  if (!path.isAbsolute(assetRoot)) throw storeError('store_identity_mismatch', 'The agent-assets root must be absolute.')
  const normalized = path.normalize(assetRoot)
  if (!existsSync(normalized)) return null
  const stat = lstatSync(normalized)
  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    throw storeError('link_unsafe_path', 'The agent-assets root must be a real directory, not a link or special file.')
  }
  return { assetRoot: normalized, realRoot: realpathSync.native(normalized) }
}

function safeChild(root: Readonly<{ assetRoot: string; realRoot: string }>, segments: readonly string[]): string {
  for (const segment of segments) {
    if (!segment || segment === '.' || segment === '..' || segment.includes('/') || segment.includes('\\')) {
      throw storeError('link_unsafe_path', 'A managed store path contains an unsafe segment.')
    }
  }
  const candidate = path.join(root.assetRoot, ...segments)
  const relative = path.relative(root.assetRoot, candidate)
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw storeError('link_unsafe_path', 'Managed path escaped the store root.')
  let cursor = root.assetRoot
  for (const segment of segments) {
    cursor = path.join(cursor, segment)
    if (!existsSync(cursor)) break
    const stat = lstatSync(cursor)
    if (stat.isSymbolicLink()) throw storeError('link_unsafe_path', 'Managed store paths may not traverse links.', { path: cursor })
  }
  if (existsSync(candidate)) {
    const realCandidate = realpathSync.native(candidate)
    const realRelative = path.relative(root.realRoot, realCandidate)
    if (realRelative.startsWith('..') || path.isAbsolute(realRelative)) {
      throw storeError('link_unsafe_path', 'Managed path resolves outside the store root.')
    }
  }
  return candidate
}

function requiredFile(root: Readonly<{ assetRoot: string; realRoot: string }>, segments: readonly string[]): string {
  const candidate = safeChild(root, segments)
  if (!existsSync(candidate)) throw storeError('not_found', 'Required agent-assets state is missing.', { relativePath: segments.join('/') })
  const stat = lstatSync(candidate)
  if (!stat.isFile() || stat.size < 1 || stat.size > MAX_STATE_BYTES) {
    throw storeError('schema_incompatible', 'Managed state file has an invalid type or size.', {
      relativePath: segments.join('/'),
      byteLength: stat.size,
    })
  }
  return candidate
}

function readJsonFile(root: Readonly<{ assetRoot: string; realRoot: string }>, segments: readonly string[]): unknown {
  const filePath = requiredFile(root, segments)
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'))
  } catch (error) {
    throw storeError('schema_incompatible', 'Managed state file is not valid JSON.', {
      relativePath: segments.join('/'),
      cause: error instanceof Error ? error.message : String(error),
    })
  }
}

export function parseStoreAuthorityV1(value: unknown): StoreAuthorityV1 {
  const label = 'StoreAuthorityV1'
  const record = exactRecord(value, AUTHORITY_KEYS, label)
  assertSchemaV1(record, label)
  const authorityRevision = integerField(record, 'authorityRevision', label, 1)
  const previousAuthoritySha256 = nullableShaField(record, 'previousAuthoritySha256', label)
  if ((authorityRevision === 1) !== (previousAuthoritySha256 === null)) {
    throw storeError('schema_incompatible', 'StoreAuthorityV1 previous-authority lineage is inconsistent.')
  }
  return {
    schemaVersion: 1,
    storeId: stringField(record, 'storeId', label, 16),
    authorityRevision,
    boundMachineId: stringField(record, 'boundMachineId', label),
    rootIdentitySha256: shaField(record, 'rootIdentitySha256', label),
    publicationCapability: enumField<PublicationCapabilityV1>(record, 'publicationCapability', [
      'posix-durable-v1',
      'macos-durable-v1',
      'windows-ntfs-crash-recoverable-v1',
    ], label),
    capabilityEvidenceSha256: shaField(record, 'capabilityEvidenceSha256', label),
    lastIssuedFenceEpoch: integerField(record, 'lastIssuedFenceEpoch', label, 0),
    previousAuthoritySha256,
    createdAt: dateField(record, 'createdAt', label),
    updatedAt: dateField(record, 'updatedAt', label),
  }
}

export function parseActivePointerV1(value: unknown): ActivePointerV1 {
  const label = 'ActivePointerV1'
  const record = exactRecord(value, ACTIVE_KEYS, label)
  assertSchemaV1(record, label)
  return {
    schemaVersion: 1,
    storeId: stringField(record, 'storeId', label, 16),
    generation: integerField(record, 'generation', label, 1),
    receiptId: stringField(record, 'receiptId', label),
    receiptSha256: shaField(record, 'receiptSha256', label),
    writerFenceEpoch: integerField(record, 'writerFenceEpoch', label, 1),
    authorityRevision: integerField(record, 'authorityRevision', label, 1),
    updatedAt: dateField(record, 'updatedAt', label),
  }
}

export function parsePackageRefV1(value: unknown): PackageRefV1 {
  const label = 'PackageRefV1'
  const record = exactRecord(value, PACKAGE_REF_KEYS, label)
  return {
    name: stringField(record, 'name', label),
    version: stringField(record, 'version', label),
    versionId: stringField(record, 'versionId', label),
    packageSha256: shaField(record, 'packageSha256', label),
    entryFile: stringField(record, 'entryFile', label),
    origin: enumField<PackageOriginV1>(record, 'origin', ['bundled', 'hosted-cache', 'reserved-catalog'], label),
    trustClass: enumField<PackageTrustClassV1>(record, 'trustClass', [
      'signed-community-release',
      'verified-hosted-package',
    ], label),
  }
}

export function parseActivationReceiptV1(value: unknown): ActivationReceiptV1 {
  const label = 'ActivationReceiptV1'
  const record = exactRecord(value, RECEIPT_KEYS, label)
  assertSchemaV1(record, label)
  const generation = integerField(record, 'generation', label, 1)
  const previousReceiptId = record.previousReceiptId === null
    ? null
    : stringField(record, 'previousReceiptId', label)
  const previousReceiptSha256 = nullableShaField(record, 'previousReceiptSha256', label)
  if ((generation === 1) !== (previousReceiptId === null && previousReceiptSha256 === null)) {
    throw storeError('schema_incompatible', 'ActivationReceiptV1 previous-receipt lineage is inconsistent.')
  }
  if (!Array.isArray(record.assets)) throw storeError('schema_incompatible', 'ActivationReceiptV1.assets must be an array.')
  const assets = record.assets.map(parsePackageRefV1)
  const packageIdentities = assets.map((entry) => canonicalJsonV1(entry))
  if (new Set(packageIdentities).size !== packageIdentities.length) {
    throw storeError('schema_incompatible', 'ActivationReceiptV1.assets contains duplicate package references.')
  }
  return {
    schemaVersion: 1,
    storeId: stringField(record, 'storeId', label, 16),
    receiptId: stringField(record, 'receiptId', label),
    operationId: stringField(record, 'operationId', label),
    operation: enumField<ActivationOperationV1>(record, 'operation', [
      'install',
      'update',
      'rollback',
      'repair',
      'migrate',
    ], label),
    generation,
    createdAt: dateField(record, 'createdAt', label),
    writerFenceEpoch: integerField(record, 'writerFenceEpoch', label, 1),
    authorityRevision: integerField(record, 'authorityRevision', label, 1),
    previousReceiptId,
    previousReceiptSha256,
    core: parsePackageRefV1(record.core),
    assets,
  }
}

export function parseExactVersionPinV1(value: unknown): ExactVersionPinV1 {
  const label = 'ExactVersionPinV1'
  const record = exactRecord(value, PIN_KEYS, label)
  assertSchemaV1(record, label)
  return {
    schemaVersion: 1,
    storeId: stringField(record, 'storeId', label, 16),
    leaseId: stringField(record, 'leaseId', label),
    packageSha256: shaField(record, 'packageSha256', label),
    owner: stringField(record, 'owner', label),
    createdAt: dateField(record, 'createdAt', label),
    expiresAt: dateField(record, 'expiresAt', label),
    writerFenceEpoch: integerField(record, 'writerFenceEpoch', label, 1),
    authorityRevision: integerField(record, 'authorityRevision', label, 1),
  }
}

export function parseMaintenancePointerV1(value: unknown): MaintenancePointerV1 {
  const label = 'MaintenancePointerV1'
  const record = exactRecord(value, MAINTENANCE_POINTER_KEYS, label)
  assertSchemaV1(record, label)
  return {
    schemaVersion: 1,
    storeId: stringField(record, 'storeId', label, 16),
    receiptId: stringField(record, 'receiptId', label),
    receiptSha256: shaField(record, 'receiptSha256', label),
    writerFenceEpoch: integerField(record, 'writerFenceEpoch', label, 1),
    authorityRevision: integerField(record, 'authorityRevision', label, 1),
    updatedAt: dateField(record, 'updatedAt', label),
  }
}

export function parseMaintenanceReceiptV1(value: unknown): MaintenanceReceiptV1 {
  const label = 'MaintenanceReceiptV1'
  const record = exactRecord(value, MAINTENANCE_RECEIPT_KEYS, label)
  assertSchemaV1(record, label)
  const previousReceiptId = record.previousReceiptId === null
    ? null
    : stringField(record, 'previousReceiptId', label)
  const previousReceiptSha256 = nullableShaField(record, 'previousReceiptSha256', label)
  if ((previousReceiptId === null) !== (previousReceiptSha256 === null)) {
    throw storeError('schema_incompatible', 'MaintenanceReceiptV1 previous-receipt lineage is inconsistent.')
  }
  return {
    schemaVersion: 1,
    storeId: stringField(record, 'storeId', label, 16),
    receiptId: stringField(record, 'receiptId', label),
    operationId: stringField(record, 'operationId', label),
    operation: enumField(record, 'operation', ['pin', 'prune'] as const, label),
    createdAt: dateField(record, 'createdAt', label),
    writerFenceEpoch: integerField(record, 'writerFenceEpoch', label, 1),
    authorityRevision: integerField(record, 'authorityRevision', label, 1),
    previousReceiptId,
    previousReceiptSha256,
    protectedPackageSha256s: stringArrayField(record, 'protectedPackageSha256s', label, (entry) => SHA256_HEX.test(entry)),
    removedPackageSha256s: stringArrayField(record, 'removedPackageSha256s', label, (entry) => SHA256_HEX.test(entry)),
    affectedManagedPaths: stringArrayField(record, 'affectedManagedPaths', label, (entry) => {
      const normalized = entry.replaceAll('\\', '/')
      return normalized === entry
        && !entry.startsWith('/')
        && entry.split('/').every((segment) => Boolean(segment) && segment !== '.' && segment !== '..')
    }),
  }
}

function safeDirectoryEntries(
  root: Readonly<{ assetRoot: string; realRoot: string }>,
  segments: readonly string[],
): readonly string[] {
  const directory = safeChild(root, segments)
  if (!existsSync(directory)) return []
  const stat = lstatSync(directory)
  if (!stat.isDirectory()) throw storeError('link_unsafe_path', 'Managed store directory is not a real directory.')
  const entries = readdirSync(directory)
  if (entries.length > MAX_STORE_DIRECTORY_ENTRIES) {
    throw storeError('schema_incompatible', 'Managed store directory exceeds the bounded entry count.')
  }
  return entries.sort((left, right) => Buffer.compare(Buffer.from(left), Buffer.from(right)))
}

type StagingTreeIdentityEntry = Readonly<{
  relativePath: string
  kind: 'directory' | 'file'
  size: number
  modifiedAtMs: number
  changedAtMs: number
  device: number
  inode: number
}>

function stagingTreeEntry(
  root: Readonly<{ assetRoot: string; realRoot: string }>,
  segments: readonly string[],
  kind: StagingTreeIdentityEntry['kind'],
): StagingTreeIdentityEntry {
  const candidate = safeChild(root, segments)
  const stat = lstatSync(candidate)
  if (stat.isSymbolicLink()) {
    throw storeError('link_unsafe_path', 'Managed staging cleanup may not traverse links.', {
      relativePath: segments.join('/'),
    })
  }
  if ((kind === 'directory' && !stat.isDirectory()) || (kind === 'file' && !stat.isFile())) {
    throw storeError('link_unsafe_path', 'Managed staging contains a special or unexpected node type.', {
      relativePath: segments.join('/'),
    })
  }
  return {
    relativePath: segments.join('/'),
    kind,
    size: stat.size,
    modifiedAtMs: stat.mtimeMs,
    changedAtMs: stat.ctimeMs,
    device: stat.dev,
    inode: stat.ino,
  }
}

function inspectStagingFilesTree(
  root: Readonly<{ assetRoot: string; realRoot: string }>,
  operationId: string,
  entries: StagingTreeIdentityEntry[],
  portableCaseKeys: Set<string>,
  relativeSegments: readonly string[] = [],
): void {
  if (relativeSegments.length > MAX_STAGING_TREE_DEPTH) {
    throw storeError('schema_incompatible', 'Managed staging exceeds the bounded directory depth.')
  }
  const directorySegments = ['staging', operationId, 'files', ...relativeSegments]
  for (const name of safeDirectoryEntries(root, directorySegments)) {
    if (entries.length >= MAX_STAGING_TREE_ENTRIES) {
      throw storeError('schema_incompatible', 'Managed staging exceeds the bounded total entry count.')
    }
    const packagePath = [...relativeSegments, name].join('/')
    const portable = validatePortablePackagePath(packagePath)
    if (!portable.ok) {
      throw storeError('invalid_package_path', 'Managed staging contains a non-portable package path.', {
        relativePath: packagePath,
        issues: portable.issues.map((entry) => entry.code),
      })
    }
    const caseKey = portablePackageCaseKeyV1(portable.normalizedPath)
    if (portableCaseKeys.has(caseKey)) {
      throw storeError('invalid_package_path', 'Managed staging contains a portable case-fold collision.', {
        relativePath: packagePath,
      })
    }
    portableCaseKeys.add(caseKey)
    const segments = [...directorySegments, name]
    const candidate = safeChild(root, segments)
    const stat = lstatSync(candidate)
    if (stat.isSymbolicLink()) {
      throw storeError('link_unsafe_path', 'Managed staging cleanup may not traverse links.', {
        relativePath: segments.join('/'),
      })
    }
    if (stat.isDirectory()) {
      entries.push(stagingTreeEntry(root, segments, 'directory'))
      inspectStagingFilesTree(root, operationId, entries, portableCaseKeys, [...relativeSegments, name])
      continue
    }
    if (!stat.isFile()) {
      throw storeError('link_unsafe_path', 'Managed staging contains a special node.', {
        relativePath: segments.join('/'),
      })
    }
    entries.push(stagingTreeEntry(root, segments, 'file'))
  }
}

/**
 * Strict, bounded, read-only cleanup plan for the writer-owned staging
 * namespace. Every candidate is preflighted before a mutation can begin.
 */
export function readAgentAssetsStagingCleanupPlan(
  options: AgentAssetsStoreReaderOptions,
): AgentAssetsStagingCleanupPlanV1 {
  const snapshot = readAgentAssetsStoreSnapshot(options)
  if (!snapshot) throw storeError('not_found', 'Agent assets are not installed; staging ownership cannot be proven.')
  const root = assertRoot(options.assetRoot)
  if (!root) throw storeError('not_found', 'Agent assets disappeared during staging inspection.')
  const removableManagedPaths: string[] = []
  const identityEntries: StagingTreeIdentityEntry[] = []
  for (const operationId of safeDirectoryEntries(root, ['staging'])) {
    if (!STAGING_OPERATION_ID.test(operationId)) {
      throw storeError('schema_incompatible', 'Staging contains an entry outside the managed operation namespace.', {
        entryName: operationId,
      })
    }
    if (identityEntries.length >= MAX_STAGING_TREE_ENTRIES) {
      throw storeError('schema_incompatible', 'Managed staging exceeds the bounded total entry count.')
    }
    const operationSegments = ['staging', operationId]
    identityEntries.push(stagingTreeEntry(root, operationSegments, 'directory'))
    const topLevelEntries = safeDirectoryEntries(root, operationSegments)
    if (topLevelEntries.some((entry) => entry !== 'files' && entry !== 'manifest.json')) {
      throw storeError('schema_incompatible', 'Managed staging has an unexpected top-level entry.', {
        operationId,
        entries: topLevelEntries,
      })
    }
    if (topLevelEntries.includes('manifest.json')) {
      const manifestValue = readJsonFile(root, [...operationSegments, 'manifest.json'])
      const manifest = validatePackageManifestStructureV1(manifestValue)
      if (!manifest.ok) {
        throw storeError('schema_incompatible', 'Managed staging manifest is not a valid PackageManifestV1.', {
          operationId,
          issues: manifest.issues,
        })
      }
      identityEntries.push(stagingTreeEntry(root, [...operationSegments, 'manifest.json'], 'file'))
    }
    if (topLevelEntries.includes('files')) {
      identityEntries.push(stagingTreeEntry(root, [...operationSegments, 'files'], 'directory'))
      inspectStagingFilesTree(root, operationId, identityEntries, new Set<string>())
    }
    removableManagedPaths.push(`staging/${operationId}`)
  }
  return Object.freeze({
    authority: structuredClone(snapshot.authority),
    active: snapshot.active === null ? null : structuredClone(snapshot.active),
    receipt: snapshot.receipt === null ? null : structuredClone(snapshot.receipt),
    removableManagedPaths: Object.freeze(removableManagedPaths),
    treeIdentitySha256: canonicalJsonSha256V1(identityEntries),
  })
}

function findReceipt(
  root: Readonly<{ assetRoot: string; realRoot: string }>,
  generation: number,
  receiptId: string,
  expectedSha256: string,
): ActivationReceiptV1 {
  const names = safeDirectoryEntries(root, ['state', 'receipts'])
    .filter((name) => name.startsWith(`${generation}-`) && name.endsWith('.json'))
  let found: ActivationReceiptV1 | undefined
  for (const name of names) {
    const value = readJsonFile(root, ['state', 'receipts', name])
    const receipt = parseActivationReceiptV1(value)
    if (receipt.generation !== generation || receipt.receiptId !== receiptId) continue
    if (found) throw storeError('schema_incompatible', 'Multiple receipt files claim the same activation identity.')
    if (canonicalJsonSha256V1(value) !== expectedSha256) {
      throw storeError('hash_mismatch', 'Activation receipt digest does not match its pointer.')
    }
    found = receipt
  }
  if (!found) throw storeError('not_found', 'The activation receipt referenced by state/active.json was not found.')
  return found
}

function assertAuthorityCoherence(authority: StoreAuthorityV1, active: ActivePointerV1, receipt: ActivationReceiptV1): void {
  if (active.storeId !== authority.storeId || receipt.storeId !== authority.storeId) {
    throw storeError('store_identity_mismatch', 'Store records disagree on storeId.')
  }
  if (active.generation !== receipt.generation || active.receiptId !== receipt.receiptId) {
    throw storeError('schema_incompatible', 'The active pointer does not identify the loaded receipt.')
  }
  if (active.writerFenceEpoch !== receipt.writerFenceEpoch || active.authorityRevision !== receipt.authorityRevision) {
    throw storeError('schema_incompatible', 'The active pointer and receipt disagree on fencing authority.')
  }
  if (
    active.authorityRevision > authority.authorityRevision ||
    active.writerFenceEpoch > authority.lastIssuedFenceEpoch ||
    receipt.authorityRevision > authority.authorityRevision ||
    receipt.writerFenceEpoch > authority.lastIssuedFenceEpoch
  ) {
    throw storeError('concurrent_writer', 'Active state claims an authority or fence epoch newer than store authority.')
  }
}

function openStore(options: AgentAssetsStoreReaderOptions): OpenStore | null {
  const root = assertRoot(options.assetRoot)
  if (!root) return null
  const authority = parseStoreAuthorityV1(readJsonFile(root, ['state', 'store-authority.json']))
  if (options.expectedMachineId !== undefined && authority.boundMachineId !== options.expectedMachineId) {
    throw storeError('different_machine_store', 'The store is bound to another machine identity.')
  }
  if (
    options.expectedRootIdentitySha256 !== undefined &&
    authority.rootIdentitySha256 !== options.expectedRootIdentitySha256
  ) {
    throw storeError('store_identity_mismatch', 'The store root identity does not match the current root.')
  }
  const active = parseActivePointerV1(readJsonFile(root, ['state', 'active.json']))
  const receipt = findReceipt(root, active.generation, active.receiptId, active.receiptSha256)
  assertAuthorityCoherence(authority, active, receipt)
  return { ...root, authority, active, receipt }
}

/**
 * Strict state snapshot for the single-writer mutation layer. Callers must
 * already hold the native publication guard before using this in a mutation.
 */
export function readAgentAssetsStoreSnapshot(
  options: AgentAssetsStoreReaderOptions,
): AgentAssetsStoreSnapshotV1 | null {
  const root = assertRoot(options.assetRoot)
  if (!root) return null
  const authorityPath = safeChild(root, ['state', 'store-authority.json'])
  if (!existsSync(authorityPath)) return null
  const authority = parseStoreAuthorityV1(readJsonFile(root, ['state', 'store-authority.json']))
  if (options.expectedMachineId !== undefined && authority.boundMachineId !== options.expectedMachineId) {
    throw storeError('different_machine_store', 'The store is bound to another machine identity.')
  }
  if (
    options.expectedRootIdentitySha256 !== undefined
    && authority.rootIdentitySha256 !== options.expectedRootIdentitySha256
  ) {
    throw storeError('store_identity_mismatch', 'The store root identity does not match the current root.')
  }
  const activePath = safeChild(root, ['state', 'active.json'])
  if (!existsSync(activePath)) return { authority: structuredClone(authority), active: null, receipt: null }
  const active = parseActivePointerV1(readJsonFile(root, ['state', 'active.json']))
  const receipt = findReceipt(root, active.generation, active.receiptId, active.receiptSha256)
  assertAuthorityCoherence(authority, active, receipt)
  return {
    authority: structuredClone(authority),
    active: structuredClone(active),
    receipt: structuredClone(receipt),
  }
}

function maintenanceReceiptFileName(receiptId: string): string {
  return `${createHash('sha256').update(`aops-agent-assets-maintenance-receipt-v1\0${receiptId}`, 'utf8').digest('hex')}.json`
}

export function readAgentAssetsMaintenanceHead(
  options: AgentAssetsStoreReaderOptions,
): AgentAssetsMaintenanceHeadV1 | null {
  const root = assertRoot(options.assetRoot)
  if (!root) return null
  const authority = parseStoreAuthorityV1(readJsonFile(root, ['state', 'store-authority.json']))
  if (options.expectedMachineId !== undefined && authority.boundMachineId !== options.expectedMachineId) {
    throw storeError('different_machine_store', 'The store is bound to another machine identity.')
  }
  if (
    options.expectedRootIdentitySha256 !== undefined
    && authority.rootIdentitySha256 !== options.expectedRootIdentitySha256
  ) {
    throw storeError('store_identity_mismatch', 'The store root identity does not match the current root.')
  }
  const pointerPath = safeChild(root, ['state', 'maintenance.json'])
  if (!existsSync(pointerPath)) return null
  const pointer = parseMaintenancePointerV1(readJsonFile(root, ['state', 'maintenance.json']))
  if (pointer.storeId !== authority.storeId) {
    throw storeError('store_identity_mismatch', 'Maintenance pointer belongs to another store.')
  }
  if (
    pointer.authorityRevision > authority.authorityRevision
    || pointer.writerFenceEpoch > authority.lastIssuedFenceEpoch
  ) {
    throw storeError('concurrent_writer', 'Maintenance pointer claims a future authority or fence epoch.')
  }
  const value = readJsonFile(root, [
    'state',
    'maintenance-receipts',
    maintenanceReceiptFileName(pointer.receiptId),
  ])
  if (canonicalJsonSha256V1(value) !== pointer.receiptSha256) {
    throw storeError('hash_mismatch', 'Maintenance receipt digest does not match its pointer.')
  }
  const receipt = parseMaintenanceReceiptV1(value)
  if (
    receipt.storeId !== authority.storeId
    || receipt.receiptId !== pointer.receiptId
    || receipt.authorityRevision !== pointer.authorityRevision
    || receipt.writerFenceEpoch !== pointer.writerFenceEpoch
  ) {
    throw storeError('schema_incompatible', 'Maintenance pointer and receipt disagree on identity or fencing authority.')
  }
  return { pointer, receipt }
}

function assertPackageRefMatchesManifest(packageRef: PackageRefV1, manifest: PackageManifestV1): void {
  if (
    packageRef.name !== manifest.name ||
    packageRef.version !== manifest.version ||
    packageRef.versionId !== manifest.versionId ||
    packageRef.packageSha256 !== manifest.packageSha256 ||
    packageRef.entryFile !== manifest.entryFile ||
    packageRef.trustClass !== manifest.provenance.trustClass
  ) {
    throw storeError('hash_mismatch', 'Activation package reference does not match the installed manifest.', {
      packageSha256: packageRef.packageSha256,
    })
  }
  if (
    (packageRef.origin === 'bundled' && manifest.assetKind !== 'community-core') ||
    (packageRef.origin !== 'bundled' && manifest.assetKind !== 'skill-package')
  ) {
    throw storeError('untrusted_origin', 'Package origin and signed manifest kind disagree.')
  }
}

function readInstalledManifest(
  root: Readonly<{ assetRoot: string; realRoot: string }>,
  packageSha256: string,
): { manifest: PackageManifestV1; value: unknown } {
  if (!SHA256_HEX.test(packageSha256)) throw storeError('schema_incompatible', 'Package digest is invalid.')
  const value = readJsonFile(root, ['core', packageSha256, 'manifest.json'])
  const structural = validatePackageManifestStructureV1(value)
  if (!structural.ok) {
    throw storeError('schema_incompatible', 'Installed package manifest is invalid.', { issues: structural.issues })
  }
  if (structural.value.packageSha256 !== packageSha256) {
    throw storeError('hash_mismatch', 'Installed package directory does not match the manifest package digest.')
  }
  if (canonicalPackageSha256V1(structural.value.files) !== packageSha256) {
    throw storeError('hash_mismatch', 'Installed manifest file records do not match packageSha256.')
  }
  return { manifest: structural.value, value }
}

function readPackageFile(
  root: Readonly<{ assetRoot: string; realRoot: string }>,
  packageSha256: string,
  relativePath: string,
  expectedStats?: Pick<Stats, 'size'>,
): Uint8Array {
  const segments = relativePath.split('/')
  const filePath = requiredFile(root, ['core', packageSha256, 'files', ...segments])
  const stat = lstatSync(filePath)
  if (expectedStats !== undefined && stat.size !== expectedStats.size) {
    throw storeError('hash_mismatch', 'Installed package file byte length does not match its manifest.')
  }
  return readFileSync(filePath)
}

function verifyPackage(
  root: Readonly<{ assetRoot: string; realRoot: string }>,
  packageRef: PackageRefV1,
  verify: 'quick' | 'full',
): { manifest: PackageManifestV1; entryPath: string; entrySha256: string } {
  const { manifest } = readInstalledManifest(root, packageRef.packageSha256)
  assertPackageRefMatchesManifest(packageRef, manifest)
  if (packageRef.origin === 'reserved-catalog') {
    throw storeError('untrusted_origin', 'Reserved catalog packages are inert and cannot be active resolver sources.')
  }
  const entryRow = manifest.files.find((row) => row.path === manifest.entryFile)
  if (!entryRow) throw storeError('schema_incompatible', 'Installed package entry file is not declared.')
  const entryBytes = readPackageFile(root, packageRef.packageSha256, manifest.entryFile, { size: entryRow.byteLength })
  const entrySha256 = sha256Bytes(entryBytes)
  if (entrySha256 !== entryRow.sha256) throw storeError('hash_mismatch', 'Installed package entry digest does not match.')

  if (verify === 'full') {
    const transferFiles = manifest.files.map((row) => ({
      path: row.path,
      bytes: readPackageFile(root, packageRef.packageSha256, row.path, { size: row.byteLength }),
    }))
    const portable = validatePortablePackageV1(manifest, transferFiles)
    if (!portable.ok) throw storeError('hash_mismatch', 'Installed package failed full validation.', { issues: portable.issues })
  }

  return {
    manifest,
    entryPath: safeChild(root, ['core', packageRef.packageSha256, 'files', ...manifest.entryFile.split('/')]),
    entrySha256,
  }
}

/**
 * Verifies one content-addressed package even when no active pointer exists
 * yet (for example after interruption between promotion and activation).
 */
export function verifyAgentAssetsPackageAtRoot(options: AgentAssetsStoreReaderOptions & Readonly<{
  packageRef: PackageRefV1
  verify?: 'quick' | 'full'
}>): Readonly<{ entryPath: string; entrySha256: string; manifest: PackageManifestV1 }> {
  const root = assertRoot(options.assetRoot)
  if (!root) throw storeError('not_found', 'Agent assets are not installed.')
  return verifyPackage(root, options.packageRef, options.verify ?? 'full')
}

/** Resolves only a receipt in the authenticated active lineage. */
export function readAgentAssetsRollbackTarget(
  options: AgentAssetsStoreReaderOptions & Readonly<{ receiptId?: string }>,
): AgentAssetsRollbackTargetV1 {
  const root = openStore(options)
  if (!root) throw storeError('not_found', 'Agent assets are not installed.')
  const requested = options.receiptId?.trim()
  if (requested && requested === root.receipt.receiptId) {
    throw storeError('rollback_unavailable', 'The requested receipt is already active.')
  }
  let cursor = root.receipt
  while (cursor.previousReceiptId !== null && cursor.previousReceiptSha256 !== null) {
    const previous = findReceipt(
      root,
      cursor.generation - 1,
      cursor.previousReceiptId,
      cursor.previousReceiptSha256,
    )
    if (!requested || previous.receiptId === requested) {
      for (const packageRef of packageRefs(previous)) verifyPackage(root, packageRef, 'full')
      return {
        authority: structuredClone(root.authority),
        active: structuredClone(root.active),
        current: structuredClone(root.receipt),
        target: structuredClone(previous),
      }
    }
    cursor = previous
  }
  throw storeError('rollback_unavailable', requested
    ? 'The requested receipt is not in the active verified lineage.'
    : 'No previous activation receipt is available for rollback.')
}

function loadPreviousReceipt(root: OpenStore): ActivationReceiptV1 | null {
  const { receipt } = root
  if (receipt.generation === 1 || receipt.previousReceiptId === null || receipt.previousReceiptSha256 === null) return null
  return findReceipt(root, receipt.generation - 1, receipt.previousReceiptId, receipt.previousReceiptSha256)
}

function loadUnexpiredPins(root: OpenStore, now: Date): readonly ExactVersionPinV1[] {
  const pins: ExactVersionPinV1[] = []
  for (const name of safeDirectoryEntries(root, ['state', 'pins'])) {
    if (!name.endsWith('.json')) throw storeError('schema_incompatible', 'Unknown entry exists in the managed pins directory.')
    const pin = parseExactVersionPinV1(readJsonFile(root, ['state', 'pins', name]))
    if (pin.storeId !== root.authority.storeId) throw storeError('store_identity_mismatch', 'Pin belongs to another store.')
    if (pin.authorityRevision > root.authority.authorityRevision || pin.writerFenceEpoch > root.authority.lastIssuedFenceEpoch) {
      throw storeError('concurrent_writer', 'Pin claims a future authority or fence epoch.')
    }
    if (Date.parse(pin.expiresAt) > now.getTime()) pins.push(pin)
  }
  return pins
}

function packageRefs(receipt: ActivationReceiptV1): readonly PackageRefV1[] {
  return [receipt.core, ...receipt.assets]
}

function refsByDigest(...receipts: readonly (ActivationReceiptV1 | null)[]): Map<string, PackageRefV1> {
  const result = new Map<string, PackageRefV1>()
  for (const receipt of receipts) {
    if (!receipt) continue
    for (const packageRef of packageRefs(receipt)) result.set(packageRef.packageSha256, packageRef)
  }
  return result
}

function readAuthorityHistoryEvidence(
  root: Readonly<{ assetRoot: string; realRoot: string }>,
  current: StoreAuthorityV1,
): NonNullable<AgentAssetsStoreStatusV1['authorityHistory']> {
  if (current.authorityRevision === 1) {
    return Object.freeze({ state: 'genesis' as const, verifiedRevisionCount: 1 })
  }
  if (current.authorityRevision > MAX_STORE_DIRECTORY_ENTRIES + 1) {
    throw storeError('schema_incompatible', 'Store authority history exceeds the bounded v1 revision count.')
  }
  let cursor = current
  let verifiedRevisionCount = 1
  while (cursor.authorityRevision > 1) {
    const previousRevision = cursor.authorityRevision - 1
    const expectedSha256 = cursor.previousAuthoritySha256
    if (!expectedSha256) {
      throw storeError('schema_incompatible', 'Store authority history lost its previous revision digest.')
    }
    const segments = ['state', 'authorities', `${previousRevision}-${expectedSha256}.json`]
    const previousPath = safeChild(root, segments)
    if (!existsSync(previousPath)) {
      return Object.freeze({
        state: 'incomplete' as const,
        verifiedRevisionCount,
        missingRevision: previousRevision,
      })
    }
    const value = readJsonFile(root, segments)
    if (canonicalJsonSha256V1(value) !== expectedSha256) {
      throw storeError('hash_mismatch', 'Store authority history digest does not match its immutable reference.', {
        authorityRevision: previousRevision,
      })
    }
    const previous = parseStoreAuthorityV1(value)
    if (
      previous.authorityRevision !== previousRevision
      || previous.storeId !== current.storeId
      || previous.boundMachineId !== current.boundMachineId
      || previous.rootIdentitySha256 !== current.rootIdentitySha256
      || previous.publicationCapability !== current.publicationCapability
      || previous.capabilityEvidenceSha256 !== current.capabilityEvidenceSha256
      || previous.createdAt !== current.createdAt
      || previous.lastIssuedFenceEpoch + 1 !== cursor.lastIssuedFenceEpoch
    ) {
      throw storeError('schema_incompatible', 'Store authority history breaks immutable identity or fence lineage.', {
        authorityRevision: previousRevision,
      })
    }
    cursor = previous
    verifiedRevisionCount += 1
  }
  return Object.freeze({ state: 'verified' as const, verifiedRevisionCount })
}

function recordedNativeIdentityEvidence(
  authority: StoreAuthorityV1,
): NonNullable<AgentAssetsStoreStatusV1['nativeIdentityEvidence']> {
  return Object.freeze({
    state: 'recorded-not-live-verified' as const,
    boundMachineId: authority.boundMachineId,
    rootIdentitySha256: authority.rootIdentitySha256,
    liveProbe: 'unavailable-in-read-only-status-v1' as const,
  })
}

function readActivationReceiptOrphanCount(root: OpenStore): number {
  const receipts: ActivationReceiptV1[] = []
  const byIdentity = new Map<string, ActivationReceiptV1>()
  for (const name of safeDirectoryEntries(root, ['state', 'receipts'])) {
    if (!name.endsWith('.json')) {
      throw storeError('schema_incompatible', 'Unknown entry exists in the managed activation receipt directory.', {
        name,
      })
    }
    const receipt = parseActivationReceiptV1(readJsonFile(root, ['state', 'receipts', name]))
    if (receipt.storeId !== root.authority.storeId) {
      throw storeError('store_identity_mismatch', 'An activation receipt belongs to another store.')
    }
    const identity = `${receipt.generation}\0${receipt.receiptId}`
    if (byIdentity.has(identity)) {
      throw storeError('schema_incompatible', 'Multiple receipt files claim the same activation identity.')
    }
    byIdentity.set(identity, receipt)
    receipts.push(receipt)
  }

  const lineage = new Set<string>()
  let cursor: ActivationReceiptV1 | null = root.receipt
  while (cursor) {
    const identity = `${cursor.generation}\0${cursor.receiptId}`
    if (lineage.has(identity)) {
      throw storeError('schema_incompatible', 'The activation receipt lineage contains a cycle.')
    }
    const stored = byIdentity.get(identity)
    if (!stored || canonicalJsonSha256V1(stored) !== canonicalJsonSha256V1(cursor)) {
      throw storeError('hash_mismatch', 'The active receipt lineage is not present exactly in the immutable ledger.')
    }
    lineage.add(identity)
    if (cursor.previousReceiptId === null || cursor.previousReceiptSha256 === null) {
      cursor = null
      continue
    }
    const previousIdentity = `${cursor.generation - 1}\0${cursor.previousReceiptId}`
    const previous = byIdentity.get(previousIdentity)
    if (!previous || canonicalJsonSha256V1(previous) !== cursor.previousReceiptSha256) {
      throw storeError('hash_mismatch', 'The activation receipt lineage does not match its previous receipt digest.')
    }
    cursor = previous
  }
  return receipts.length - lineage.size
}

function readMaintenanceReceiptOrphanCount(
  root: OpenStore,
  maintenance: AgentAssetsMaintenanceHeadV1 | null,
): number {
  const receipts: MaintenanceReceiptV1[] = []
  const byId = new Map<string, MaintenanceReceiptV1>()
  for (const name of safeDirectoryEntries(root, ['state', 'maintenance-receipts'])) {
    if (!SHA256_HEX.test(name.slice(0, -5)) || !name.endsWith('.json')) {
      throw storeError('schema_incompatible', 'Unknown entry exists in the managed maintenance receipt directory.', {
        name,
      })
    }
    const value = readJsonFile(root, ['state', 'maintenance-receipts', name])
    const receipt = parseMaintenanceReceiptV1(value)
    if (name !== maintenanceReceiptFileName(receipt.receiptId)) {
      throw storeError('hash_mismatch', 'A maintenance receipt is stored under the wrong immutable identity.', {
        name,
        receiptId: receipt.receiptId,
      })
    }
    if (receipt.storeId !== root.authority.storeId) {
      throw storeError('store_identity_mismatch', 'A maintenance receipt belongs to another store.')
    }
    if (byId.has(receipt.receiptId)) {
      throw storeError('schema_incompatible', 'Multiple maintenance receipts claim the same immutable identity.')
    }
    byId.set(receipt.receiptId, receipt)
    receipts.push(receipt)
  }

  const lineage = new Set<string>()
  let cursor: MaintenanceReceiptV1 | null = maintenance?.receipt ?? null
  while (cursor) {
    if (lineage.has(cursor.receiptId)) {
      throw storeError('schema_incompatible', 'The maintenance receipt lineage contains a cycle.')
    }
    const stored = byId.get(cursor.receiptId)
    if (!stored || canonicalJsonSha256V1(stored) !== canonicalJsonSha256V1(cursor)) {
      throw storeError('hash_mismatch', 'The maintenance head is not present exactly in the immutable ledger.')
    }
    lineage.add(cursor.receiptId)
    if (cursor.previousReceiptId === null || cursor.previousReceiptSha256 === null) {
      cursor = null
      continue
    }
    const previous = byId.get(cursor.previousReceiptId)
    if (!previous || canonicalJsonSha256V1(previous) !== cursor.previousReceiptSha256) {
      throw storeError('hash_mismatch', 'The maintenance receipt lineage does not match its previous receipt digest.')
    }
    if (
      previous.authorityRevision >= cursor.authorityRevision
      || previous.writerFenceEpoch >= cursor.writerFenceEpoch
    ) {
      throw storeError('schema_incompatible', 'The maintenance receipt lineage does not advance authority and fence epochs.')
    }
    cursor = previous
  }
  return receipts.length - lineage.size
}

export function readAgentAssetsStoreStatus(
  options: AgentAssetsStoreReaderOptions & Readonly<{ verify?: 'quick' | 'full' }>,
): AgentAssetsStoreStatusV1 {
  const verify = options.verify ?? 'quick'
  const existingRoot = assertRoot(options.assetRoot)
  if (!existingRoot) {
    return {
      state: 'not-installed',
      verify,
      assetRoot: path.normalize(options.assetRoot),
      verifiedPackageCount: 0,
      protectedPackageCount: 0,
    }
  }
  const authorityPath = safeChild(existingRoot, ['state', 'store-authority.json'])
  if (!existsSync(authorityPath)) {
    return {
      state: 'partial-genesis',
      verify,
      assetRoot: existingRoot.assetRoot,
      verifiedPackageCount: 0,
      protectedPackageCount: 0,
      recoveryReasons: ['store-root-exists-without-authority'],
    }
  }
  const preflightAuthority = parseStoreAuthorityV1(readJsonFile(existingRoot, ['state', 'store-authority.json']))
  const authorityHistory = readAuthorityHistoryEvidence(existingRoot, preflightAuthority)
  const nativeIdentityEvidence = recordedNativeIdentityEvidence(preflightAuthority)
  const activePath = safeChild(existingRoot, ['state', 'active.json'])
  if (!existsSync(activePath)) {
    const stagingEntries = safeDirectoryEntries(existingRoot, ['staging']).length
    const receiptEntries = safeDirectoryEntries(existingRoot, ['state', 'receipts']).length
    return {
      state: 'activation-incomplete',
      verify,
      assetRoot: existingRoot.assetRoot,
      storeId: preflightAuthority.storeId,
      authorityRevision: preflightAuthority.authorityRevision,
      publicationCapability: preflightAuthority.publicationCapability,
      capabilityEvidenceSha256: preflightAuthority.capabilityEvidenceSha256,
      authorityHistory,
      nativeIdentityEvidence,
      verifiedPackageCount: 0,
      protectedPackageCount: 0,
      recoveryReasons: [
        'authority-exists-without-active-pointer',
        ...(stagingEntries > 0 ? [`staging-entry-count:${stagingEntries}`] : []),
        ...(receiptEntries > 0 ? [`orphan-receipt-count:${receiptEntries}`] : []),
      ],
    }
  }
  const root = openStore(options)
  if (!root) throw storeError('not_found', 'Agent assets store disappeared during status inspection.')

  const activeRefs = packageRefs(root.receipt)
  const maintenance = readAgentAssetsMaintenanceHead(options)
  const stagingEntryCount = readAgentAssetsStagingCleanupPlan(options).removableManagedPaths.length
  const orphanActivationReceiptCount = readActivationReceiptOrphanCount(root)
  const orphanMaintenanceReceiptCount = readMaintenanceReceiptOrphanCount(root, maintenance)
  const recoveryReasons = [
    ...(stagingEntryCount > 0 ? [`staging-entry-count:${stagingEntryCount}`] : []),
    ...(orphanActivationReceiptCount > 0
      ? [`orphan-activation-receipt-count:${orphanActivationReceiptCount}`]
      : []),
    ...(orphanMaintenanceReceiptCount > 0
      ? [`orphan-maintenance-receipt-count:${orphanMaintenanceReceiptCount}`]
      : []),
  ]
  for (const packageRef of activeRefs) verifyPackage(root, packageRef, verify)
  let protectedDigests = new Set(activeRefs.map((entry) => entry.packageSha256))
  let verifiedDigests = new Set(protectedDigests)
  if (verify === 'full') {
    const previous = loadPreviousReceipt(root)
    for (const packageRef of packageRefs(previous ?? root.receipt)) {
      protectedDigests.add(packageRef.packageSha256)
      if (!verifiedDigests.has(packageRef.packageSha256)) verifyPackage(root, packageRef, 'full')
      verifiedDigests.add(packageRef.packageSha256)
    }
    const knownRefs = refsByDigest(root.receipt, previous)
    for (const pin of loadUnexpiredPins(root, options.now ?? new Date())) {
      protectedDigests.add(pin.packageSha256)
      if (verifiedDigests.has(pin.packageSha256)) continue
      const packageRef = knownRefs.get(pin.packageSha256)
      if (packageRef) {
        verifyPackage(root, packageRef, 'full')
      } else {
        const { manifest } = readInstalledManifest(root, pin.packageSha256)
        const inferred: PackageRefV1 = {
          name: manifest.name,
          version: manifest.version,
          versionId: manifest.versionId,
          packageSha256: manifest.packageSha256,
          entryFile: manifest.entryFile,
          origin: manifest.assetKind === 'community-core' ? 'bundled' : 'hosted-cache',
          trustClass: manifest.provenance.trustClass,
        }
        verifyPackage(root, inferred, 'full')
      }
      verifiedDigests.add(pin.packageSha256)
    }
  }

  return {
    state: 'ready',
    verify,
    assetRoot: root.assetRoot,
    storeId: root.authority.storeId,
    authorityRevision: root.authority.authorityRevision,
    generation: root.active.generation,
    activeReceiptId: root.active.receiptId,
    activePackageCount: activeRefs.length,
    verifiedPackageCount: verifiedDigests.size,
    protectedPackageCount: protectedDigests.size,
    publicationCapability: root.authority.publicationCapability,
    capabilityEvidenceSha256: root.authority.capabilityEvidenceSha256,
    authorityHistory,
    nativeIdentityEvidence,
    ...(maintenance ? { maintenanceReceiptId: maintenance.receipt.receiptId } : {}),
    ...(recoveryReasons.length > 0 ? { recoveryReasons } : {}),
  }
}

export function readAgentAssetsPrunePlan(
  options: AgentAssetsStoreReaderOptions,
): AgentAssetsPrunePlanV1 {
  const root = openStore(options)
  if (!root) throw storeError('not_found', 'Agent assets are not installed.')
  const previous = loadPreviousReceipt(root)
  const protectedDigests = new Set(
    [...packageRefs(root.receipt), ...(previous ? packageRefs(previous) : [])]
      .map((entry) => entry.packageSha256),
  )
  for (const pin of loadUnexpiredPins(root, options.now ?? new Date())) {
    protectedDigests.add(pin.packageSha256)
  }
  const installedDigests = safeDirectoryEntries(root, ['core'])
  const removable: string[] = []
  for (const digest of installedDigests) {
    if (!SHA256_HEX.test(digest)) {
      throw storeError('schema_incompatible', 'Unknown entry exists in the managed immutable core directory.')
    }
    const { manifest } = readInstalledManifest(root, digest)
    const inferred: PackageRefV1 = {
      name: manifest.name,
      version: manifest.version,
      versionId: manifest.versionId,
      packageSha256: manifest.packageSha256,
      entryFile: manifest.entryFile,
      origin: manifest.assetKind === 'community-core' ? 'bundled' : 'hosted-cache',
      trustClass: manifest.provenance.trustClass,
    }
    verifyPackage(root, inferred, 'full')
    if (!protectedDigests.has(digest)) removable.push(digest)
  }
  for (const digest of protectedDigests) {
    if (!installedDigests.includes(digest)) {
      throw storeError('not_found', 'A protected package is missing from the immutable core directory.', { packageSha256: digest })
    }
  }
  const protectedPackageSha256s = [...protectedDigests].sort()
  const removablePackageSha256s = removable.sort()
  return {
    authority: structuredClone(root.authority),
    protectedPackageSha256s,
    removablePackageSha256s,
    removableManagedPaths: removablePackageSha256s.map((digest) => `core/${digest}`),
  }
}

function pinnedCandidates(root: OpenStore, now: Date): readonly PackageRefV1[] {
  return loadUnexpiredPins(root, now).map((pin) => {
    const { manifest } = readInstalledManifest(root, pin.packageSha256)
    return {
      name: manifest.name,
      version: manifest.version,
      versionId: manifest.versionId,
      packageSha256: manifest.packageSha256,
      entryFile: manifest.entryFile,
      origin: manifest.assetKind === 'community-core' ? 'bundled' : 'hosted-cache',
      trustClass: manifest.provenance.trustClass,
    }
  })
}

function historicalCandidates(root: OpenStore, now: Date): readonly PackageRefV1[] {
  const previous = loadPreviousReceipt(root)
  return [
    ...(previous ? packageRefs(previous) : []),
    ...pinnedCandidates(root, now),
  ]
}

export function resolveAgentAsset(options: ResolveAgentAssetOptions): ResolverEnvelopeV1 {
  const selectors = [options.gateway !== undefined, options.name !== undefined, options.versionId !== undefined]
  if (selectors.filter(Boolean).length !== 1) {
    throw storeError('schema_incompatible', 'Resolve requires exactly one of gateway, name, or versionId.')
  }
  const root = openStore(options)
  if (!root) throw storeError('not_found', 'Agent assets are not installed.')

  let matchedBy: ResolverEnvelopeV1['matchedBy']
  let selected: PackageRefV1 | undefined
  if (options.gateway !== undefined) {
    matchedBy = 'gateway'
    selected = root.receipt.core.name === 'aops' ? root.receipt.core : undefined
  } else if (options.versionId !== undefined) {
    matchedBy = 'versionId'
    const candidates = [...packageRefs(root.receipt), ...historicalCandidates(root, options.now ?? new Date())]
      .filter((entry) => entry.versionId === options.versionId)
    const unique = new Map(candidates.map((entry) => [entry.packageSha256, entry]))
    if (unique.size > 1) throw storeError('ambiguous', 'versionId matches more than one package digest.')
    selected = [...unique.values()][0]
  } else {
    matchedBy = 'name'
    const candidates = packageRefs(root.receipt).filter((entry) => entry.name === options.name)
    if (candidates.length > 1) throw storeError('ambiguous', 'Active package name is ambiguous.')
    selected = candidates[0]
  }
  if (!selected) throw storeError('not_found', 'No verified installed package matches the selector.')
  if (matchedBy === 'gateway' && (selected.origin !== 'bundled' || selected.trustClass !== 'signed-community-release')) {
    throw storeError('untrusted_origin', 'Gateway resolution only accepts the active signed Community core.')
  }

  const verified = verifyPackage(root, selected, 'quick')
  return {
    entryPath: verified.entryPath,
    name: selected.name,
    version: selected.version,
    versionId: selected.versionId,
    contentSha256: verified.entrySha256,
    packageSha256: selected.packageSha256,
    origin: selected.origin,
    computedTrustClass: selected.trustClass,
    matchedBy,
  }
}

/** Full-verify variant for cache-before-network and explicit expected-manifest checks. */
export function readResolvedAgentAssetPackage(
  options: ResolveAgentAssetOptions,
): ResolvedAgentAssetPackageV1 {
  const resolved = resolveAgentAsset(options)
  const root = openStore(options)
  if (!root) throw storeError('not_found', 'Agent assets are not installed.')
  const { manifest } = readInstalledManifest(root, resolved.packageSha256)
  const packageRef: PackageRefV1 = {
    name: resolved.name,
    version: resolved.version,
    versionId: resolved.versionId,
    packageSha256: resolved.packageSha256,
    entryFile: manifest.entryFile,
    origin: resolved.origin,
    trustClass: resolved.computedTrustClass,
  }
  verifyPackage(root, packageRef, 'full')
  return { resolved, manifest }
}
