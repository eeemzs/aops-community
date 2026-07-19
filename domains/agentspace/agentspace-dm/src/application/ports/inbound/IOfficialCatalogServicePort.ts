import type { Effect } from 'effect'

import type { SkillServiceError } from '../../errors/SkillServiceError.js'

export const OFFICIAL_CATALOG_SCOPE_SLUG = 'aops-official-catalog' as const

export interface OfficialCatalogScopeV1 {
  schemaVersion: 1
  slug: typeof OFFICIAL_CATALOG_SCOPE_SLUG
  kind: 'agentspace-skill-catalog'
  owner: 'aops-community-setup'
  reserved: true
}

export interface OfficialCatalogFileV1 {
  path: string
  sha256: string
  byteLength: number
  content: string
}

export interface OfficialCatalogManifestV1 {
  schemaVersion: 1
  assetKind: 'skill-package'
  name: string
  version: string
  versionId: string
  entryFile: 'SKILL.md'
  standard: 'aops-skill-package-v1'
  packageSha256: string
  files: Array<{ path: string; sha256: string; byteLength: number }>
  compatibility?: { minCliVersion: string; maxSchemaVersion: 1 }
  provenance: {
    trustClass: 'verified-hosted-package'
    expectedDigestSource: 'immutable-hosted-metadata'
    reference: string
    releaseSha256?: string
    signatureRef?: string
  }
}

export interface OfficialCatalogPackageV1 {
  name: string
  version: string
  versionId: string
  packageSha256: string
  manifestSha256: string
  entryFile: 'SKILL.md'
  manifest: OfficialCatalogManifestV1
  files: OfficialCatalogFileV1[]
  meta: {
    aopsOfficialCatalog: {
      schemaVersion: 1
      scopeSlug: typeof OFFICIAL_CATALOG_SCOPE_SLUG
      source: 'signed-community-release'
      releaseSetSha256: string
      manifestSha256: string
      packageSha256: string
      inert: true
    }
  }
}

export interface OfficialCatalogVersionSnapshotV1 {
  recordId: string
  skillId: string
  name: string
  versionId: string
  packageSha256: string
  releaseSetSha256: string
  status: 'published'
  inert: true
}

export interface OfficialCatalogSnapshotV1 {
  schemaVersion: 1
  scopeSlug: typeof OFFICIAL_CATALOG_SCOPE_SLUG
  state: 'absent' | 'ready'
  scopeId: string | null
  projectId: string | null
  catalogRevision: number
  currentVersionMap: Record<string, string | null>
  versions: OfficialCatalogVersionSnapshotV1[]
  lastReceiptId: string | null
}

export interface OfficialCatalogReconcileActionV1 {
  name: string
  action: 'append-version' | 'set-current' | 'clear-current' | 'unchanged'
  versionId: string | null
  packageSha256: string | null
  existingRecordId: string | null
}

export interface OfficialCatalogReconcilePlanV1 {
  schemaVersion: 1
  kind: 'aops-official-catalog-reconcile-plan-v1'
  scope: OfficialCatalogScopeV1
  releaseSetSha256: string
  expectedCatalogRevision: number
  expectedPreviousReceiptId: string | null
  expectedCurrentVersionMap: Record<string, string | null>
  desiredPackageVersionMap: Record<string, string | null>
  packages: OfficialCatalogPackageV1[]
  actions: OfficialCatalogReconcileActionV1[]
  mutationRequired: boolean
  activationEffects: []
  historyDeleteCount: 0
  idempotencyKey: string
}

export interface OfficialCatalogReceiptV1 {
  schemaVersion: 1
  kind: 'aops-official-catalog-receipt-v1'
  receiptId: string
  operation: 'reconcile' | 'rollback'
  scopeSlug: typeof OFFICIAL_CATALOG_SCOPE_SLUG
  scopeId: string
  projectId: string
  catalogRevision: number
  releaseSetSha256: string
  priorCurrentVersionMap: Record<string, string | null>
  currentVersionMap: Record<string, string | null>
  packageSha256: string[]
  historyDeleteCount: 0
  activationEffects: []
  previousReceiptId: string | null
  createdAt: string
}

export interface OfficialCatalogRollbackRequestV1 {
  schemaVersion: 1
  kind: 'aops-official-catalog-rollback-request-v1'
  scope: OfficialCatalogScopeV1
  receiptId: string
  expectedCatalogRevision: number
  idempotencyKey: string
  deleteHistory: false
  activationEffects: []
}

export interface IOfficialCatalogServicePort {
  inspectOfficialCatalog(scope: OfficialCatalogScopeV1): Effect.Effect<OfficialCatalogSnapshotV1, SkillServiceError>
  reconcileOfficialCatalog(plan: OfficialCatalogReconcilePlanV1): Effect.Effect<OfficialCatalogReceiptV1, SkillServiceError>
  rollbackOfficialCatalog(request: OfficialCatalogRollbackRequestV1): Effect.Effect<OfficialCatalogReceiptV1, SkillServiceError>
}
