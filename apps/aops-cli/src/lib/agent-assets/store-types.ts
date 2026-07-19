import type { PackageTrustClassV1, Sha256Hex } from './types.js'

export type PackageOriginV1 = 'bundled' | 'hosted-cache' | 'reserved-catalog'

export interface PackageRefV1 {
  readonly name: string
  readonly version: string
  readonly versionId: string
  readonly packageSha256: Sha256Hex
  readonly entryFile: string
  readonly origin: PackageOriginV1
  readonly trustClass: PackageTrustClassV1
}

export type PublicationCapabilityV1 =
  | 'posix-durable-v1'
  | 'macos-durable-v1'
  | 'windows-ntfs-crash-recoverable-v1'

export interface StoreAuthorityV1 {
  readonly schemaVersion: 1
  readonly storeId: string
  readonly authorityRevision: number
  readonly boundMachineId: string
  readonly rootIdentitySha256: Sha256Hex
  readonly publicationCapability: PublicationCapabilityV1
  readonly capabilityEvidenceSha256: Sha256Hex
  readonly lastIssuedFenceEpoch: number
  readonly previousAuthoritySha256: Sha256Hex | null
  readonly createdAt: string
  readonly updatedAt: string
}

export interface ActivePointerV1 {
  readonly schemaVersion: 1
  readonly storeId: string
  readonly generation: number
  readonly receiptId: string
  readonly receiptSha256: Sha256Hex
  readonly writerFenceEpoch: number
  readonly authorityRevision: number
  readonly updatedAt: string
}

export type ActivationOperationV1 = 'install' | 'update' | 'rollback' | 'repair' | 'migrate'

export interface ActivationReceiptV1 {
  readonly schemaVersion: 1
  readonly storeId: string
  readonly receiptId: string
  readonly operationId: string
  readonly operation: ActivationOperationV1
  readonly generation: number
  readonly createdAt: string
  readonly writerFenceEpoch: number
  readonly authorityRevision: number
  readonly previousReceiptId: string | null
  readonly previousReceiptSha256: Sha256Hex | null
  readonly core: PackageRefV1
  readonly assets: readonly PackageRefV1[]
}

export interface RuntimeBindingV1 {
  readonly schemaVersion: 1
  readonly storeId: string
  readonly bindingId: string
  readonly bindingGeneration: number
  readonly runtime: 'codex' | 'claude'
  readonly runtimeHomeId: Sha256Hex
  readonly runtimeRootIdentitySha256: Sha256Hex
  readonly gatewayName: 'aops'
  readonly relativePath: 'skills/aops/SKILL.md'
  readonly ownerMarkerRelativePath: 'skills/aops/.aops-gateway-owner.json'
  readonly contentSha256: Sha256Hex
  readonly ownerMarkerSha256: Sha256Hex
  readonly activationReceiptId: string
  readonly activationReceiptSha256: Sha256Hex
  readonly bindingReceiptId: string
  readonly bindingReceiptSha256: Sha256Hex
  readonly previousContentSha256?: Sha256Hex | null
  readonly installedAt: string
  readonly writerFenceEpoch: number
  readonly authorityRevision: number
}

/** Immutable receipt body referenced by the mutable per-runtime binding pointer. */
export type RuntimeBindingReceiptV1 = Omit<RuntimeBindingV1, 'bindingReceiptSha256'>

/**
 * Small runtime-local ownership proof. This record deliberately excludes
 * receipt hashes so it can remain stable while store receipts advance.
 */
export interface RuntimeGatewayOwnerMarkerV1 {
  readonly schemaVersion: 1
  readonly owner: 'aops-cli-agent-assets'
  readonly storeId: string
  readonly runtime: 'codex' | 'claude'
  readonly bindingId: string
  readonly bindingGeneration: number
  readonly relativePath: 'skills/aops/SKILL.md'
  readonly contentSha256: Sha256Hex
}

export interface ExactVersionPinV1 {
  readonly schemaVersion: 1
  readonly storeId: string
  readonly leaseId: string
  readonly packageSha256: Sha256Hex
  readonly owner: string
  readonly createdAt: string
  readonly expiresAt: string
  readonly writerFenceEpoch: number
  readonly authorityRevision: number
}

export interface MaintenancePointerV1 {
  readonly schemaVersion: 1
  readonly storeId: string
  readonly receiptId: string
  readonly receiptSha256: Sha256Hex
  readonly writerFenceEpoch: number
  readonly authorityRevision: number
  readonly updatedAt: string
}

export interface MaintenanceReceiptV1 {
  readonly schemaVersion: 1
  readonly storeId: string
  readonly receiptId: string
  readonly operationId: string
  readonly operation: 'pin' | 'prune'
  readonly createdAt: string
  readonly writerFenceEpoch: number
  readonly authorityRevision: number
  readonly previousReceiptId: string | null
  readonly previousReceiptSha256: Sha256Hex | null
  readonly protectedPackageSha256s: readonly Sha256Hex[]
  readonly removedPackageSha256s: readonly Sha256Hex[]
  readonly affectedManagedPaths: readonly string[]
}

export interface ResolverEnvelopeV1 {
  readonly entryPath: string
  readonly name: string
  readonly version: string
  readonly versionId: string
  readonly contentSha256: Sha256Hex
  readonly packageSha256: Sha256Hex
  readonly origin: PackageOriginV1
  readonly computedTrustClass: PackageTrustClassV1
  readonly matchedBy: 'gateway' | 'name' | 'versionId'
}

export interface AgentAssetsStoreStatusV1 {
  readonly state: 'not-installed' | 'partial-genesis' | 'activation-incomplete' | 'ready'
  readonly verify: 'quick' | 'full'
  readonly assetRoot: string
  readonly storeId?: string
  readonly authorityRevision?: number
  readonly generation?: number
  readonly activeReceiptId?: string
  readonly activePackageCount?: number
  readonly verifiedPackageCount: number
  readonly protectedPackageCount: number
  readonly publicationCapability?: PublicationCapabilityV1
  readonly capabilityEvidenceSha256?: Sha256Hex
  readonly maintenanceReceiptId?: string
  readonly recoveryReasons?: readonly string[]
  readonly authorityHistory?: Readonly<{
    state: 'genesis' | 'verified' | 'incomplete'
    verifiedRevisionCount: number
    missingRevision?: number
  }>
  readonly nativeIdentityEvidence?: Readonly<{
    state: 'recorded-not-live-verified'
    boundMachineId: string
    rootIdentitySha256: Sha256Hex
    liveProbe: 'unavailable-in-read-only-status-v1'
  }>
}
