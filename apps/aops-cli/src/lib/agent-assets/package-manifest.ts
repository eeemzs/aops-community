import { createHash } from 'node:crypto'

import { portablePackageCaseKeyV1, validatePortablePackagePath } from './portable-path.js'
import type {
  FileDigestV1,
  PackageManifestV1,
  PackageTransferFileV1,
  PackageValidationIssue,
  PackageValidationResult,
  PortableValidatedPackageV1,
  Sha256Hex,
} from './types.js'

const SHA256_HEX = /^[a-f0-9]{64}$/

const MANIFEST_KEYS = new Set([
  'schemaVersion',
  'assetKind',
  'name',
  'version',
  'versionId',
  'entryFile',
  'standard',
  'packageSha256',
  'files',
  'compatibility',
  'provenance',
])
const FILE_DIGEST_KEYS = new Set(['path', 'sha256', 'byteLength'])
const COMPATIBILITY_KEYS = new Set(['minCliVersion', 'maxSchemaVersion'])
const PROVENANCE_KEYS = new Set([
  'trustClass',
  'expectedDigestSource',
  'reference',
  'releaseSha256',
  'signatureRef',
])

type UnknownRecord = Record<string, unknown>

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasOwn(record: UnknownRecord, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key)
}

function issue(code: PackageValidationIssue['code'], at: string, message: string): PackageValidationIssue {
  return { code, at, message }
}

function requireKeys(
  record: UnknownRecord,
  required: readonly string[],
  at: string,
  issues: PackageValidationIssue[],
): void {
  for (const key of required) {
    if (!hasOwn(record, key)) issues.push(issue('missing_property', `${at}.${key}`, 'Required property is missing.'))
  }
}

function rejectUnknownKeys(
  record: UnknownRecord,
  allowed: ReadonlySet<string>,
  at: string,
  issues: PackageValidationIssue[],
): void {
  for (const key of Object.keys(record)) {
    if (!allowed.has(key)) issues.push(issue('unknown_property', `${at}.${key}`, 'Unknown property is not allowed.'))
  }
}

function validateNonEmptyString(
  record: UnknownRecord,
  key: string,
  at: string,
  issues: PackageValidationIssue[],
): void {
  if (!hasOwn(record, key)) return
  if (typeof record[key] !== 'string' || record[key].length === 0) {
    issues.push(issue('invalid_type', `${at}.${key}`, 'Expected a non-empty string.'))
  }
}

function validateSha256(
  record: UnknownRecord,
  key: string,
  at: string,
  issues: PackageValidationIssue[],
): void {
  if (!hasOwn(record, key)) return
  if (typeof record[key] !== 'string' || !SHA256_HEX.test(record[key])) {
    issues.push(issue('invalid_sha256', `${at}.${key}`, 'Expected a lowercase SHA-256 hex digest.'))
  }
}

function validateRelativePath(
  record: UnknownRecord,
  key: string,
  at: string,
  issues: PackageValidationIssue[],
): void {
  if (!hasOwn(record, key)) return
  const value = record[key]
  if (typeof value !== 'string') {
    issues.push(issue('invalid_type', `${at}.${key}`, 'Expected a package-relative path string.'))
    return
  }
  const result = validatePortablePackagePath(value)
  if (!result.ok) {
    issues.push(issue(
      'invalid_package_path',
      `${at}.${key}`,
      `Path violates the portable package contract: ${result.issues.map((entry) => entry.code).join(', ')}.`,
    ))
  }
}

function validateCompatibility(value: unknown, issues: PackageValidationIssue[]): void {
  const at = '$.compatibility'
  if (!isRecord(value)) {
    issues.push(issue('invalid_type', at, 'Expected a compatibility object.'))
    return
  }
  rejectUnknownKeys(value, COMPATIBILITY_KEYS, at, issues)
  requireKeys(value, ['minCliVersion', 'maxSchemaVersion'], at, issues)
  validateNonEmptyString(value, 'minCliVersion', at, issues)
  if (hasOwn(value, 'maxSchemaVersion') && value.maxSchemaVersion !== 1) {
    issues.push(issue('schema_incompatible', `${at}.maxSchemaVersion`, 'Only schema version 1 is supported.'))
  }
}

function validateProvenance(value: unknown, issues: PackageValidationIssue[]): UnknownRecord | undefined {
  const at = '$.provenance'
  if (!isRecord(value)) {
    issues.push(issue('invalid_type', at, 'Expected a provenance object.'))
    return undefined
  }
  rejectUnknownKeys(value, PROVENANCE_KEYS, at, issues)
  requireKeys(value, ['trustClass', 'expectedDigestSource', 'reference'], at, issues)
  validateNonEmptyString(value, 'reference', at, issues)
  if (
    hasOwn(value, 'trustClass') &&
    value.trustClass !== 'signed-community-release' &&
    value.trustClass !== 'verified-hosted-package'
  ) {
    issues.push(issue('invalid_value', `${at}.trustClass`, 'Unknown package trust class.'))
  }
  if (
    hasOwn(value, 'expectedDigestSource') &&
    value.expectedDigestSource !== 'signed-release-manifest' &&
    value.expectedDigestSource !== 'immutable-hosted-metadata'
  ) {
    issues.push(issue('invalid_value', `${at}.expectedDigestSource`, 'Unknown expected digest source.'))
  }
  if (hasOwn(value, 'releaseSha256')) validateSha256(value, 'releaseSha256', at, issues)
  if (hasOwn(value, 'signatureRef')) validateNonEmptyString(value, 'signatureRef', at, issues)
  return value
}

function validateFileDigests(value: unknown, issues: PackageValidationIssue[]): void {
  const at = '$.files'
  if (!Array.isArray(value) || value.length === 0) {
    issues.push(issue('invalid_type', at, 'Expected a non-empty file digest array.'))
    return
  }

  const exactItems = new Set<string>()
  for (const [index, candidate] of value.entries()) {
    const rowAt = `${at}[${index}]`
    if (!isRecord(candidate)) {
      issues.push(issue('invalid_type', rowAt, 'Expected a file digest object.'))
      continue
    }
    rejectUnknownKeys(candidate, FILE_DIGEST_KEYS, rowAt, issues)
    requireKeys(candidate, ['path', 'sha256', 'byteLength'], rowAt, issues)
    validateRelativePath(candidate, 'path', rowAt, issues)
    validateSha256(candidate, 'sha256', rowAt, issues)
    if (
      hasOwn(candidate, 'byteLength') &&
      (typeof candidate.byteLength !== 'number' || !Number.isInteger(candidate.byteLength) || candidate.byteLength < 0)
    ) {
      issues.push(issue('invalid_type', `${rowAt}.byteLength`, 'Expected a non-negative integer.'))
    }

    if (
      typeof candidate.path === 'string' &&
      typeof candidate.sha256 === 'string' &&
      typeof candidate.byteLength === 'number'
    ) {
      const identity = `${candidate.path}\0${candidate.sha256}\0${candidate.byteLength}`
      if (exactItems.has(identity)) {
        issues.push(issue('duplicate_manifest_item', rowAt, 'JSON Schema uniqueItems forbids duplicate file rows.'))
      }
      exactItems.add(identity)
    }
  }
}

/** Strict PackageManifestV1 structural validation with additionalProperties=false semantics. */
export function validatePackageManifestStructureV1(value: unknown): PackageValidationResult<PackageManifestV1> {
  if (!isRecord(value)) {
    return { ok: false, issues: [issue('invalid_type', '$', 'Expected a PackageManifestV1 object.')] }
  }

  const issues: PackageValidationIssue[] = []
  rejectUnknownKeys(value, MANIFEST_KEYS, '$', issues)
  requireKeys(value, [
    'schemaVersion',
    'assetKind',
    'name',
    'version',
    'versionId',
    'entryFile',
    'standard',
    'packageSha256',
    'files',
    'provenance',
  ], '$', issues)

  if (hasOwn(value, 'schemaVersion') && value.schemaVersion !== 1) {
    issues.push(issue('schema_incompatible', '$.schemaVersion', 'Only PackageManifest schema version 1 is supported.'))
  }
  if (hasOwn(value, 'assetKind') && value.assetKind !== 'community-core' && value.assetKind !== 'skill-package') {
    issues.push(issue('invalid_value', '$.assetKind', 'Unknown package asset kind.'))
  }
  for (const key of ['name', 'version', 'versionId', 'standard'] as const) {
    validateNonEmptyString(value, key, '$', issues)
  }
  validateRelativePath(value, 'entryFile', '$', issues)
  validateSha256(value, 'packageSha256', '$', issues)
  validateFileDigests(value.files, issues)
  if (hasOwn(value, 'compatibility')) validateCompatibility(value.compatibility, issues)
  const provenance = validateProvenance(value.provenance, issues)

  if (value.assetKind === 'community-core') {
    if (value.name !== 'aops') issues.push(issue('invalid_value', '$.name', 'Community core name must be aops.'))
    if (value.entryFile !== 'SKILL.md') {
      issues.push(issue('invalid_value', '$.entryFile', 'Community core entry file must be SKILL.md.'))
    }
    if (value.standard !== 'aops-community-core-v1') {
      issues.push(issue('invalid_value', '$.standard', 'Community core standard must be aops-community-core-v1.'))
    }
    if (provenance?.trustClass !== 'signed-community-release') {
      issues.push(issue('invalid_value', '$.provenance.trustClass', 'Community core must use signed-community-release.'))
    }
    if (provenance?.expectedDigestSource !== 'signed-release-manifest') {
      issues.push(issue(
        'invalid_value',
        '$.provenance.expectedDigestSource',
        'Community core must use signed-release-manifest.',
      ))
    }
  }

  if (value.assetKind === 'skill-package') {
    if (value.entryFile !== 'SKILL.md') {
      issues.push(issue('invalid_value', '$.entryFile', 'Skill package entry file must be SKILL.md.'))
    }
    if (value.standard !== 'aops-skill-package-v1') {
      issues.push(issue('invalid_value', '$.standard', 'Skill package standard must be aops-skill-package-v1.'))
    }
    if (provenance?.trustClass !== 'verified-hosted-package') {
      issues.push(issue('invalid_value', '$.provenance.trustClass', 'Skill package must use verified-hosted-package.'))
    }
    if (provenance?.expectedDigestSource !== 'immutable-hosted-metadata') {
      issues.push(issue(
        'invalid_value',
        '$.provenance.expectedDigestSource',
        'Skill package must use immutable-hosted-metadata.',
      ))
    }
  }

  return issues.length > 0
    ? { ok: false, issues }
    : { ok: true, value: value as unknown as PackageManifestV1 }
}

export function sha256Bytes(bytes: Uint8Array): Sha256Hex {
  return createHash('sha256').update(bytes).digest('hex')
}

/**
 * Frozen package identity: NFC path + NUL + lowercase file SHA-256 + LF,
 * ordered by unsigned UTF-8 path bytes. byteLength is intentionally excluded.
 */
export function canonicalPackageSha256V1(files: readonly Pick<FileDigestV1, 'path' | 'sha256'>[]): Sha256Hex {
  const records = files.map((file) => {
    if (!SHA256_HEX.test(file.sha256)) throw new TypeError('invalid_file_sha256')
    return { path: file.path.normalize('NFC'), sha256: file.sha256 }
  })
  records.sort((left, right) => Buffer.compare(Buffer.from(left.path, 'utf8'), Buffer.from(right.path, 'utf8')))

  const hash = createHash('sha256')
  for (const record of records) {
    hash.update(Buffer.from(record.path, 'utf8'))
    hash.update(Buffer.from([0]))
    hash.update(record.sha256, 'ascii')
    hash.update(Buffer.from([0x0a]))
  }
  return hash.digest('hex')
}

function transferFileRecord(value: unknown): value is PackageTransferFileV1 {
  return isRecord(value) && typeof value.path === 'string' && value.bytes instanceof Uint8Array
}

/**
 * Runs structural, portable-path, exact-membership, byte-length and digest
 * validation. A successful result still requires the target-volume native
 * alias probe before the store may stage or materialize these files.
 */
export function validatePortablePackageV1(
  manifestValue: unknown,
  transferFiles: readonly PackageTransferFileV1[],
): PackageValidationResult<PortableValidatedPackageV1> {
  const structural = validatePackageManifestStructureV1(manifestValue)
  if (!structural.ok) return structural

  const manifest = structural.value
  const issues: PackageValidationIssue[] = []
  const rawManifestPaths = new Set<string>()
  const normalizedManifestPaths = new Set<string>()
  const foldedManifestPaths = new Set<string>()
  const normalizedRows: FileDigestV1[] = []

  for (const [index, row] of manifest.files.entries()) {
    const normalizedPath = row.path.normalize('NFC')
    const foldedPath = portablePackageCaseKeyV1(normalizedPath)
    if (rawManifestPaths.has(row.path)) {
      issues.push(issue('duplicate_raw_path', `$.files[${index}].path`, 'Duplicate raw manifest path.'))
    }
    if (normalizedManifestPaths.has(normalizedPath)) {
      issues.push(issue('duplicate_normalized_path', `$.files[${index}].path`, 'Duplicate NFC manifest path.'))
    }
    if (foldedManifestPaths.has(foldedPath)) {
      issues.push(issue('portable_case_collision', `$.files[${index}].path`, 'Portable Unicode case-fold collision.'))
    }
    rawManifestPaths.add(row.path)
    normalizedManifestPaths.add(normalizedPath)
    foldedManifestPaths.add(foldedPath)
    normalizedRows.push({ ...row, path: normalizedPath })
  }

  const normalizedEntryFile = manifest.entryFile.normalize('NFC')
  if (!normalizedManifestPaths.has(normalizedEntryFile)) {
    issues.push(issue('entry_file_missing', '$.entryFile', 'entryFile must name exactly one declared file.'))
  }

  const normalizedTransfer = new Map<string, Uint8Array>()
  const rawTransferPaths = new Set<string>()
  const foldedTransferPaths = new Set<string>()
  for (const [index, candidate] of transferFiles.entries()) {
    const at = `$transfer[${index}]`
    if (!transferFileRecord(candidate)) {
      issues.push(issue('invalid_type', at, 'Expected { path, bytes: Uint8Array }.'))
      continue
    }
    const pathResult = validatePortablePackagePath(candidate.path)
    if (!pathResult.ok) {
      issues.push(issue(
        'invalid_package_path',
        `${at}.path`,
        `Transfer path violates the portable package contract: ${pathResult.issues.map((entry) => entry.code).join(', ')}.`,
      ))
      continue
    }
    const normalizedPath = pathResult.normalizedPath
    const foldedPath = portablePackageCaseKeyV1(normalizedPath)
    if (rawTransferPaths.has(candidate.path) || normalizedTransfer.has(normalizedPath)) {
      issues.push(issue('duplicate_transfer_path', `${at}.path`, 'Duplicate raw or NFC transfer path.'))
    }
    if (foldedTransferPaths.has(foldedPath)) {
      issues.push(issue('portable_case_collision', `${at}.path`, 'Portable transfer path case-fold collision.'))
    }
    rawTransferPaths.add(candidate.path)
    foldedTransferPaths.add(foldedPath)
    if (!normalizedTransfer.has(normalizedPath)) normalizedTransfer.set(normalizedPath, candidate.bytes)
  }

  const missing = [...normalizedManifestPaths].filter((path) => !normalizedTransfer.has(path))
  const undeclared = [...normalizedTransfer.keys()].filter((path) => !normalizedManifestPaths.has(path))
  if (missing.length > 0 || undeclared.length > 0 || normalizedTransfer.size !== normalizedManifestPaths.size) {
    issues.push(issue(
      'transfer_membership_mismatch',
      '$transfer',
      `Transfer membership differs from the manifest (missing=${missing.length}, undeclared=${undeclared.length}).`,
    ))
  }

  for (const [index, row] of normalizedRows.entries()) {
    const bytes = normalizedTransfer.get(row.path)
    if (!bytes) continue
    if (bytes.byteLength !== row.byteLength) {
      issues.push(issue(
        'file_byte_length_mismatch',
        `$.files[${index}].byteLength`,
        `Expected ${row.byteLength} bytes but received ${bytes.byteLength}.`,
      ))
    }
    if (sha256Bytes(bytes) !== row.sha256) {
      issues.push(issue('file_digest_mismatch', `$.files[${index}].sha256`, 'Transferred file digest does not match.'))
    }
  }

  const computedPackageSha256 = canonicalPackageSha256V1(normalizedRows)
  if (computedPackageSha256 !== manifest.packageSha256) {
    issues.push(issue('package_digest_mismatch', '$.packageSha256', 'Canonical package digest does not match.'))
  }

  if (issues.length > 0) return { ok: false, issues }
  const normalizedManifest = { ...manifest, entryFile: normalizedEntryFile, files: normalizedRows } as PackageManifestV1
  return {
    ok: true,
    value: {
      manifest,
      normalizedManifest,
      packageSha256: computedPackageSha256,
      portableValidationComplete: true,
      nativeAliasValidation: 'required',
    },
  }
}
