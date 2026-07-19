import { createHash } from 'node:crypto'

import type { VerifiedCommunityCatalogReleaseInputV1 } from './agent-assets/release-input.js'

export const OFFICIAL_CATALOG_SCOPE_V1 = Object.freeze({
  schemaVersion: 1 as const,
  slug: 'aops-official-catalog',
  kind: 'agentspace-skill-catalog' as const,
  owner: 'aops-community-setup' as const,
  reserved: true as const,
})

export const OFFICIAL_CATALOG_META_KEY_V1 = 'aopsOfficialCatalog' as const

export const OFFICIAL_CATALOG_TOOL_IDS_V1 = Object.freeze({
  inspect: 'agentspace.official-catalog.inspect',
  reconcile: 'agentspace.official-catalog.reconcile',
  rollback: 'agentspace.official-catalog.rollback',
})

export const OFFICIAL_CATALOG_NO_ACTIVATION_EFFECTS_V1: readonly [] = Object.freeze([])

export type OfficialCatalogErrorCodeV1 =
  | 'catalog_adapter_unavailable'
  | 'catalog_release_invalid'
  | 'catalog_scope_conflict'
  | 'catalog_snapshot_invalid'
  | 'catalog_package_conflict'
  | 'catalog_apply_result_invalid'

export class OfficialCatalogError extends Error {
  readonly code: OfficialCatalogErrorCodeV1
  readonly details?: Readonly<Record<string, unknown>>

  constructor(
    code: OfficialCatalogErrorCodeV1,
    message: string,
    details?: Readonly<Record<string, unknown>>,
  ) {
    super(message)
    this.name = 'OfficialCatalogError'
    this.code = code
    this.details = details
  }
}

export type OfficialCatalogCurrentVersionMapV1 = Readonly<Record<string, string | null>>

export type OfficialCatalogVersionSnapshotV1 = Readonly<{
  recordId: string
  skillId: string
  name: string
  versionId: string
  packageSha256: string
  releaseSetSha256: string
  status: 'published'
  inert: true
}>

export type OfficialCatalogSnapshotV1 = Readonly<{
  schemaVersion: 1
  scopeSlug: typeof OFFICIAL_CATALOG_SCOPE_V1.slug
  state: 'absent' | 'ready'
  scopeId: string | null
  projectId: string | null
  catalogRevision: number
  currentVersionMap: OfficialCatalogCurrentVersionMapV1
  versions: readonly OfficialCatalogVersionSnapshotV1[]
  lastReceiptId: string | null
}>

export type OfficialCatalogPackageImportV1 = Readonly<{
  name: string
  version: string
  versionId: string
  packageSha256: string
  manifestSha256: string
  entryFile: 'SKILL.md'
  manifest: VerifiedCommunityCatalogReleaseInputV1['manifest']
  files: readonly Readonly<{
    path: string
    sha256: string
    byteLength: number
    content: string
  }>[]
  meta: Readonly<{
    aopsOfficialCatalog: Readonly<{
      schemaVersion: 1
      scopeSlug: typeof OFFICIAL_CATALOG_SCOPE_V1.slug
      source: 'signed-community-release'
      releaseSetSha256: string
      manifestSha256: string
      packageSha256: string
      inert: true
    }>
  }>
}>

export type OfficialCatalogReconcileActionV1 = Readonly<{
  name: string
  action: 'append-version' | 'set-current' | 'clear-current' | 'unchanged'
  versionId: string | null
  packageSha256: string | null
  existingRecordId: string | null
}>

export type OfficialCatalogReconcilePlanV1 = Readonly<{
  schemaVersion: 1
  kind: 'aops-official-catalog-reconcile-plan-v1'
  scope: typeof OFFICIAL_CATALOG_SCOPE_V1
  releaseSetSha256: string
  expectedCatalogRevision: number
  expectedPreviousReceiptId: string | null
  expectedCurrentVersionMap: OfficialCatalogCurrentVersionMapV1
  desiredPackageVersionMap: OfficialCatalogCurrentVersionMapV1
  packages: readonly OfficialCatalogPackageImportV1[]
  actions: readonly OfficialCatalogReconcileActionV1[]
  mutationRequired: boolean
  activationEffects: readonly []
  historyDeleteCount: 0
  idempotencyKey: string
}>

export type OfficialCatalogReceiptV1 = Readonly<{
  schemaVersion: 1
  kind: 'aops-official-catalog-receipt-v1'
  receiptId: string
  operation: 'reconcile' | 'rollback'
  scopeSlug: typeof OFFICIAL_CATALOG_SCOPE_V1.slug
  scopeId: string
  projectId: string
  catalogRevision: number
  releaseSetSha256: string
  priorCurrentVersionMap: OfficialCatalogCurrentVersionMapV1
  currentVersionMap: OfficialCatalogCurrentVersionMapV1
  packageSha256: readonly string[]
  historyDeleteCount: 0
  activationEffects: readonly []
  previousReceiptId: string | null
  createdAt: string
}>

export type OfficialCatalogRollbackRequestV1 = Readonly<{
  schemaVersion: 1
  kind: 'aops-official-catalog-rollback-request-v1'
  scope: typeof OFFICIAL_CATALOG_SCOPE_V1
  receiptId: string
  expectedCatalogRevision: number
  idempotencyKey: string
  deleteHistory: false
  activationEffects: readonly []
}>

export interface OfficialCatalogAdapterV1 {
  inspect(): Promise<OfficialCatalogSnapshotV1>
  reconcile(
    plan: OfficialCatalogReconcilePlanV1,
    mode: 'preview' | 'apply',
  ): Promise<OfficialCatalogReconcilePlanV1 | OfficialCatalogReceiptV1>
  rollback(
    request: OfficialCatalogRollbackRequestV1,
    mode: 'preview' | 'apply',
  ): Promise<OfficialCatalogRollbackRequestV1 | OfficialCatalogReceiptV1>
}

function fail(
  code: OfficialCatalogErrorCodeV1,
  message: string,
  details?: Readonly<Record<string, unknown>>,
): never {
  throw new OfficialCatalogError(code, message, details)
}

function nonEmpty(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) fail('catalog_snapshot_invalid', `${label} must be non-empty.`)
  return value
}

function compareUtf8(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left, 'utf8'), Buffer.from(right, 'utf8'))
}

function stableObject(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableObject).join(',')}]`
  const record = value as Record<string, unknown>
  return `{${Object.keys(record).sort(compareUtf8).map((key) => `${JSON.stringify(key)}:${stableObject(record[key])}`).join(',')}}`
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex')
}

function sortedMap(input: OfficialCatalogCurrentVersionMapV1): OfficialCatalogCurrentVersionMapV1 {
  return Object.freeze(Object.fromEntries(
    Object.entries(input).sort(([left], [right]) => compareUtf8(left, right)),
  ))
}

function assertCurrentVersionMap(
  value: unknown,
  code: OfficialCatalogErrorCodeV1,
  label: string,
): asserts value is OfficialCatalogCurrentVersionMapV1 {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail(code, `${label} must be an object map.`)
  }
  for (const [name, recordId] of Object.entries(value as Record<string, unknown>)) {
    if (!name.trim() || (recordId !== null && (typeof recordId !== 'string' || !recordId.trim()))) {
      fail(code, `${label} contains an invalid name or version record id.`)
    }
  }
}

export function assertOfficialCatalogSnapshotV1(snapshot: OfficialCatalogSnapshotV1): void {
  if (
    snapshot.schemaVersion !== 1 ||
    snapshot.scopeSlug !== OFFICIAL_CATALOG_SCOPE_V1.slug ||
    (snapshot.state !== 'absent' && snapshot.state !== 'ready') ||
    !Number.isSafeInteger(snapshot.catalogRevision) ||
    snapshot.catalogRevision < 0 ||
    !Array.isArray(snapshot.versions)
  ) {
    fail('catalog_snapshot_invalid', 'Official catalog snapshot does not match schemaVersion 1.')
  }
  assertCurrentVersionMap(snapshot.currentVersionMap, 'catalog_snapshot_invalid', 'currentVersionMap')
  if (snapshot.state === 'absent') {
    if (
      snapshot.scopeId !== null ||
      snapshot.projectId !== null ||
      snapshot.catalogRevision !== 0 ||
      Object.keys(snapshot.currentVersionMap).length !== 0 ||
      snapshot.versions.length !== 0 ||
      snapshot.lastReceiptId !== null
    ) {
      fail('catalog_scope_conflict', 'An absent reserved catalog snapshot contains server-owned state.')
    }
    return
  }
  nonEmpty(snapshot.scopeId, 'scopeId')
  nonEmpty(snapshot.projectId, 'projectId')
  for (const [name, recordId] of Object.entries(snapshot.currentVersionMap)) {
    nonEmpty(name, 'currentVersionMap.name')
    if (recordId !== null) nonEmpty(recordId, `currentVersionMap.${name}`)
  }
  const recordIds = new Set<string>()
  const identities = new Set<string>()
  for (const version of snapshot.versions) {
    if (
      version.status !== 'published' ||
      version.inert !== true ||
      !/^[a-f0-9]{64}$/.test(version.packageSha256) ||
      !/^[a-f0-9]{64}$/.test(version.releaseSetSha256)
    ) {
      fail('catalog_snapshot_invalid', 'Reserved catalog version metadata is incomplete or untrusted.')
    }
    for (const [label, value] of Object.entries({
      recordId: version.recordId,
      skillId: version.skillId,
      name: version.name,
      versionId: version.versionId,
    })) nonEmpty(value, label)
    if (recordIds.has(version.recordId)) fail('catalog_snapshot_invalid', 'Catalog snapshot repeats a version record id.')
    const identity = `${version.name}\0${version.versionId}`
    if (identities.has(identity)) fail('catalog_snapshot_invalid', 'Catalog snapshot repeats a logical package version.')
    recordIds.add(version.recordId)
    identities.add(identity)
  }
  for (const [name, recordId] of Object.entries(snapshot.currentVersionMap)) {
    if (recordId === null) continue
    const selected = snapshot.versions.find((entry) => entry.recordId === recordId)
    if (!selected || selected.name !== name) {
      fail('catalog_scope_conflict', 'Reserved current-version mapping points outside its catalog snapshot.', { name })
    }
  }
}

function utf8Content(bytes: Uint8Array, label: string): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    fail('catalog_release_invalid', `Official catalog package file is not valid UTF-8: ${label}.`)
  }
}

export function buildOfficialCatalogPackageImports(
  inputs: readonly VerifiedCommunityCatalogReleaseInputV1[],
): readonly OfficialCatalogPackageImportV1[] {
  const releaseSetSha256 = inputs[0]?.releaseSetSha256
  const identities = new Set<string>()
  const digests = new Set<string>()
  const packages = inputs.map((input) => {
    if (!releaseSetSha256 || input.releaseSetSha256 !== releaseSetSha256 || input.releaseTrustClass !== 'signed-community-release') {
      fail('catalog_release_invalid', 'Official catalog packages must share one signature-verified Community release set.')
    }
    if (input.packageRef.origin !== 'reserved-catalog' || input.manifest.assetKind !== 'skill-package') {
      fail('catalog_release_invalid', 'Official catalog input is not an inert reserved-catalog package.')
    }
    const identity = `${input.manifest.name}\0${input.manifest.versionId}`
    if (identities.has(identity) || digests.has(input.manifest.packageSha256)) {
      fail('catalog_release_invalid', 'Official catalog release repeats a package identity or digest.')
    }
    identities.add(identity)
    digests.add(input.manifest.packageSha256)
    const rows = new Map(input.manifest.files.map((row) => [row.path, row]))
    const files = input.transferFiles.map((file) => {
      const row = rows.get(file.path)
      if (!row) fail('catalog_release_invalid', 'Verified transfer contains a file outside its manifest.')
      return Object.freeze({
        path: file.path,
        sha256: row.sha256,
        byteLength: row.byteLength,
        content: utf8Content(file.bytes, `${input.manifest.name}/${file.path}`),
      })
    }).sort((left, right) => compareUtf8(left.path, right.path))
    return Object.freeze({
      name: input.manifest.name,
      version: input.manifest.version,
      versionId: input.manifest.versionId,
      packageSha256: input.manifest.packageSha256,
      manifestSha256: input.manifestSha256,
      entryFile: input.manifest.entryFile,
      manifest: input.manifest,
      files: Object.freeze(files),
      meta: Object.freeze({
        [OFFICIAL_CATALOG_META_KEY_V1]: Object.freeze({
          schemaVersion: 1 as const,
          scopeSlug: OFFICIAL_CATALOG_SCOPE_V1.slug,
          source: 'signed-community-release' as const,
          releaseSetSha256: input.releaseSetSha256,
          manifestSha256: input.manifestSha256,
          packageSha256: input.manifest.packageSha256,
          inert: true as const,
        }),
      }),
    })
  })
  return Object.freeze(packages.sort((left, right) => compareUtf8(
    `${left.name}\0${left.versionId}`,
    `${right.name}\0${right.versionId}`,
  )))
}

export function buildOfficialCatalogReconcilePlan(options: Readonly<{
  snapshot: OfficialCatalogSnapshotV1
  packages: readonly OfficialCatalogPackageImportV1[]
  idempotencyKey?: string
}>): OfficialCatalogReconcilePlanV1 {
  assertOfficialCatalogSnapshotV1(options.snapshot)
  const releaseSetSha256 = options.packages[0]?.meta.aopsOfficialCatalog.releaseSetSha256
  if (!releaseSetSha256 || !/^[a-f0-9]{64}$/.test(releaseSetSha256)) {
    fail('catalog_release_invalid', 'A non-empty signed official catalog package set is required.')
  }
  if (options.packages.some((entry) => entry.meta.aopsOfficialCatalog.releaseSetSha256 !== releaseSetSha256)) {
    fail('catalog_release_invalid', 'Official catalog reconcile cannot mix release sets.')
  }

  const existingByIdentity = new Map(options.snapshot.versions.map((entry) => [`${entry.name}\0${entry.versionId}`, entry]))
  const desiredPackageVersionMap: Record<string, string | null> = {}
  const actions: OfficialCatalogReconcileActionV1[] = []
  for (const packageInput of options.packages) {
    desiredPackageVersionMap[packageInput.name] = packageInput.versionId
    const existing = existingByIdentity.get(`${packageInput.name}\0${packageInput.versionId}`)
    if (existing && (
      existing.packageSha256 !== packageInput.packageSha256 ||
      existing.releaseSetSha256 !== releaseSetSha256
    )) {
      fail('catalog_package_conflict', 'A reserved catalog version identity already exists with different signed provenance.', {
        name: packageInput.name,
        versionId: packageInput.versionId,
      })
    }
    if (!existing) {
      actions.push(Object.freeze({
        name: packageInput.name,
        action: 'append-version' as const,
        versionId: packageInput.versionId,
        packageSha256: packageInput.packageSha256,
        existingRecordId: null,
      }))
      continue
    }
    actions.push(Object.freeze({
      name: packageInput.name,
      action: options.snapshot.currentVersionMap[packageInput.name] === existing.recordId ? 'unchanged' as const : 'set-current' as const,
      versionId: packageInput.versionId,
      packageSha256: packageInput.packageSha256,
      existingRecordId: existing.recordId,
    }))
  }
  for (const name of Object.keys(options.snapshot.currentVersionMap).sort(compareUtf8)) {
    if (Object.prototype.hasOwnProperty.call(desiredPackageVersionMap, name)) continue
    desiredPackageVersionMap[name] = null
    actions.push(Object.freeze({
      name,
      action: options.snapshot.currentVersionMap[name] === null ? 'unchanged' as const : 'clear-current' as const,
      versionId: null,
      packageSha256: null,
      existingRecordId: options.snapshot.currentVersionMap[name] ?? null,
    }))
  }
  actions.sort((left, right) => compareUtf8(`${left.name}\0${left.action}`, `${right.name}\0${right.action}`))
  const expectedCurrentVersionMap = sortedMap(options.snapshot.currentVersionMap)
  const desired = sortedMap(desiredPackageVersionMap)
  const idempotencyKey = options.idempotencyKey?.trim() || `official-catalog-reconcile-v1:${sha256(stableObject({
    releaseSetSha256,
    catalogRevision: options.snapshot.catalogRevision,
    lastReceiptId: options.snapshot.lastReceiptId,
    desired,
  }))}`
  return Object.freeze({
    schemaVersion: 1,
    kind: 'aops-official-catalog-reconcile-plan-v1',
    scope: OFFICIAL_CATALOG_SCOPE_V1,
    releaseSetSha256,
    expectedCatalogRevision: options.snapshot.catalogRevision,
    expectedPreviousReceiptId: options.snapshot.lastReceiptId,
    expectedCurrentVersionMap,
    desiredPackageVersionMap: desired,
    packages: Object.freeze([...options.packages]),
    actions: Object.freeze(actions),
    mutationRequired: actions.some((entry) => entry.action !== 'unchanged'),
    activationEffects: OFFICIAL_CATALOG_NO_ACTIVATION_EFFECTS_V1,
    historyDeleteCount: 0,
    idempotencyKey,
  })
}

export function buildOfficialCatalogRollbackRequest(options: Readonly<{
  snapshot: OfficialCatalogSnapshotV1
  receiptId: string
  idempotencyKey?: string
}>): OfficialCatalogRollbackRequestV1 {
  assertOfficialCatalogSnapshotV1(options.snapshot)
  const receiptId = nonEmpty(options.receiptId, 'receiptId')
  const idempotencyKey = options.idempotencyKey?.trim() || `official-catalog-rollback-v1:${sha256(stableObject({
    receiptId,
    catalogRevision: options.snapshot.catalogRevision,
    lastReceiptId: options.snapshot.lastReceiptId,
  }))}`
  return Object.freeze({
    schemaVersion: 1,
    kind: 'aops-official-catalog-rollback-request-v1',
    scope: OFFICIAL_CATALOG_SCOPE_V1,
    receiptId,
    expectedCatalogRevision: options.snapshot.catalogRevision,
    idempotencyKey,
    deleteHistory: false,
    activationEffects: OFFICIAL_CATALOG_NO_ACTIVATION_EFFECTS_V1,
  })
}

export function assertOfficialCatalogReceiptV1(receipt: OfficialCatalogReceiptV1, operation: OfficialCatalogReceiptV1['operation']): void {
  if (
    receipt.schemaVersion !== 1 ||
    receipt.kind !== 'aops-official-catalog-receipt-v1' ||
    receipt.operation !== operation ||
    receipt.scopeSlug !== OFFICIAL_CATALOG_SCOPE_V1.slug ||
    receipt.historyDeleteCount !== 0 ||
    !Array.isArray(receipt.activationEffects) ||
    receipt.activationEffects.length !== 0 ||
    !Number.isSafeInteger(receipt.catalogRevision) ||
    receipt.catalogRevision < 1 ||
    !/^[a-f0-9]{64}$/.test(receipt.releaseSetSha256) ||
    !Array.isArray(receipt.packageSha256) ||
    receipt.packageSha256.some((digest) => !/^[a-f0-9]{64}$/.test(digest)) ||
    !Number.isFinite(Date.parse(receipt.createdAt))
  ) fail('catalog_apply_result_invalid', 'Official catalog operation returned an invalid receipt.')
  for (const [label, value] of Object.entries({
    receiptId: receipt.receiptId,
    scopeId: receipt.scopeId,
    projectId: receipt.projectId,
  })) nonEmpty(value, label)
  assertCurrentVersionMap(receipt.priorCurrentVersionMap, 'catalog_apply_result_invalid', 'priorCurrentVersionMap')
  assertCurrentVersionMap(receipt.currentVersionMap, 'catalog_apply_result_invalid', 'currentVersionMap')
  if (receipt.previousReceiptId !== null) nonEmpty(receipt.previousReceiptId, 'previousReceiptId')
  if (new Set(receipt.packageSha256).size !== receipt.packageSha256.length) {
    fail('catalog_apply_result_invalid', 'Official catalog receipt repeats a package digest.')
  }
}

export async function reconcileOfficialCatalog(options: Readonly<{
  adapter?: OfficialCatalogAdapterV1
  packages: readonly OfficialCatalogPackageImportV1[]
  mode: 'preview' | 'apply'
  idempotencyKey?: string
}>): Promise<OfficialCatalogReconcilePlanV1 | OfficialCatalogReceiptV1> {
  if (!options.adapter) fail('catalog_adapter_unavailable', 'Agentspace official-catalog operations are not available in this server build.')
  const snapshot = await options.adapter.inspect()
  const plan = buildOfficialCatalogReconcilePlan({
    snapshot,
    packages: options.packages,
    idempotencyKey: options.idempotencyKey,
  })
  if (options.mode === 'preview' || !plan.mutationRequired) return plan
  const receipt = await options.adapter.reconcile(plan, 'apply') as OfficialCatalogReceiptV1
  assertOfficialCatalogReceiptV1(receipt, 'reconcile')
  if (receipt.releaseSetSha256 !== plan.releaseSetSha256) {
    fail('catalog_apply_result_invalid', 'Official catalog receipt release digest differs from the verified plan.')
  }
  if (
    receipt.catalogRevision !== plan.expectedCatalogRevision + 1 ||
    receipt.previousReceiptId !== plan.expectedPreviousReceiptId ||
    stableObject(receipt.priorCurrentVersionMap) !== stableObject(plan.expectedCurrentVersionMap)
  ) {
    fail('catalog_apply_result_invalid', 'Official catalog receipt does not prove the accepted compare-and-swap baseline.')
  }
  const expectedDigests = [...new Set(plan.packages.map((entry) => entry.packageSha256))].sort(compareUtf8)
  const receiptDigests = [...receipt.packageSha256].sort(compareUtf8)
  if (stableObject(receiptDigests) !== stableObject(expectedDigests)) {
    fail('catalog_apply_result_invalid', 'Official catalog receipt package digests differ from the signed reconcile plan.')
  }
  if (stableObject(Object.keys(receipt.currentVersionMap).sort(compareUtf8)) !== stableObject(Object.keys(plan.desiredPackageVersionMap).sort(compareUtf8))) {
    fail('catalog_apply_result_invalid', 'Official catalog receipt current-map keys differ from the reserved reconcile plan.')
  }
  return receipt
}

export async function rollbackOfficialCatalog(options: Readonly<{
  adapter?: OfficialCatalogAdapterV1
  receiptId: string
  mode: 'preview' | 'apply'
  idempotencyKey?: string
}>): Promise<OfficialCatalogRollbackRequestV1 | OfficialCatalogReceiptV1> {
  if (!options.adapter) fail('catalog_adapter_unavailable', 'Agentspace official-catalog operations are not available in this server build.')
  const snapshot = await options.adapter.inspect()
  const request = buildOfficialCatalogRollbackRequest({
    snapshot,
    receiptId: options.receiptId,
    idempotencyKey: options.idempotencyKey,
  })
  if (options.mode === 'preview') {
    const preview = await options.adapter.rollback(request, 'preview') as OfficialCatalogRollbackRequestV1
    if (stableObject(preview) !== stableObject(request)) {
      fail('catalog_apply_result_invalid', 'Official catalog rollback preview changed the fail-closed local request.')
    }
    return preview
  }
  const receipt = await options.adapter.rollback(request, 'apply') as OfficialCatalogReceiptV1
  assertOfficialCatalogReceiptV1(receipt, 'rollback')
  if (
    receipt.catalogRevision !== snapshot.catalogRevision + 1 ||
    receipt.previousReceiptId !== snapshot.lastReceiptId ||
    stableObject(receipt.priorCurrentVersionMap) !== stableObject(snapshot.currentVersionMap)
  ) {
    fail('catalog_apply_result_invalid', 'Official catalog rollback receipt does not prove the accepted compare-and-swap baseline.')
  }
  return receipt
}
