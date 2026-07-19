export const AGENT_ASSETS_SCHEMA_VERSION = 1 as const

export type AgentAssetKindV1 = 'community-core' | 'skill-package'

export type PackageTrustClassV1 =
  | 'signed-community-release'
  | 'verified-hosted-package'

export type PackageExpectedDigestSourceV1 =
  | 'signed-release-manifest'
  | 'immutable-hosted-metadata'

export type Sha256Hex = string

export interface FileDigestV1 {
  readonly path: string
  readonly sha256: Sha256Hex
  readonly byteLength: number
}

export interface PackageCompatibilityV1 {
  readonly minCliVersion: string
  readonly maxSchemaVersion: 1
}

export interface PackageProvenanceV1 {
  readonly trustClass: PackageTrustClassV1
  readonly expectedDigestSource: PackageExpectedDigestSourceV1
  readonly reference: string
  readonly releaseSha256?: Sha256Hex
  readonly signatureRef?: string
}

interface PackageManifestBaseV1 {
  readonly schemaVersion: 1
  readonly name: string
  readonly version: string
  readonly versionId: string
  readonly entryFile: 'SKILL.md'
  readonly packageSha256: Sha256Hex
  readonly files: readonly FileDigestV1[]
  readonly compatibility?: PackageCompatibilityV1
}

export interface CommunityCorePackageManifestV1 extends PackageManifestBaseV1 {
  readonly assetKind: 'community-core'
  readonly name: 'aops'
  readonly standard: 'aops-community-core-v1'
  readonly provenance: PackageProvenanceV1 & {
    readonly trustClass: 'signed-community-release'
    readonly expectedDigestSource: 'signed-release-manifest'
  }
}

export interface SkillPackageManifestV1 extends PackageManifestBaseV1 {
  readonly assetKind: 'skill-package'
  readonly standard: 'aops-skill-package-v1'
  readonly provenance: PackageProvenanceV1 & {
    readonly trustClass: 'verified-hosted-package'
    readonly expectedDigestSource: 'immutable-hosted-metadata'
  }
}

export type PackageManifestV1 =
  | CommunityCorePackageManifestV1
  | SkillPackageManifestV1

export interface PackageTransferFileV1 {
  readonly path: string
  readonly bytes: Uint8Array
}

export type PackageValidationIssueCode =
  | 'missing_property'
  | 'unknown_property'
  | 'invalid_type'
  | 'invalid_value'
  | 'schema_incompatible'
  | 'invalid_sha256'
  | 'invalid_package_path'
  | 'duplicate_manifest_item'
  | 'duplicate_raw_path'
  | 'duplicate_normalized_path'
  | 'portable_case_collision'
  | 'entry_file_missing'
  | 'duplicate_transfer_path'
  | 'transfer_membership_mismatch'
  | 'file_byte_length_mismatch'
  | 'file_digest_mismatch'
  | 'package_digest_mismatch'

export interface PackageValidationIssue {
  readonly code: PackageValidationIssueCode
  readonly at: string
  readonly message: string
}

export type PackageValidationResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly issues: readonly PackageValidationIssue[] }

/**
 * Portable validation is deliberately not the complete materialization gate.
 * The store writer must still perform the frozen target-volume native alias
 * probe before staging or activation.
 */
export interface PortableValidatedPackageV1 {
  readonly manifest: PackageManifestV1
  readonly normalizedManifest: PackageManifestV1
  readonly packageSha256: Sha256Hex
  readonly portableValidationComplete: true
  readonly nativeAliasValidation: 'required'
}
