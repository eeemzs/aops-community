import { existsSync, lstatSync, readFileSync, realpathSync } from 'node:fs'
import path from 'node:path'

import {
  verifyCommunityAgentAssetsReleaseBundle,
  type AgentAssetsPackageRecord,
  type CommunityReleaseSignatureVerifier,
  type CommunityVerifiedAgentAssetsReleaseBundle,
} from '../community-release-verifier.js'
import { AgentAssetsError } from './envelope.js'
import { sha256Bytes, validatePortablePackageV1 } from './package-manifest.js'
import type { PackageRefV1 } from './store-types.js'
import type { PackageManifestV1, PackageTransferFileV1, PortableValidatedPackageV1 } from './types.js'

export type VerifiedCommunityCoreReleaseInputV1 = Readonly<{
  releaseRoot: string
  packageRef: PackageRefV1
  manifest: PackageManifestV1
  transferFiles: readonly PackageTransferFileV1[]
  validation: PortableValidatedPackageV1
  releaseSetSha256: string
}>

export type VerifiedCommunityCatalogReleaseInputV1 = Readonly<{
  releaseRoot: string
  manifestRef: string
  manifestSha256: string
  packageRef: PackageRefV1
  manifest: PackageManifestV1 & { readonly assetKind: 'skill-package' }
  transferFiles: readonly PackageTransferFileV1[]
  validation: PortableValidatedPackageV1
  releaseSetSha256: string
  /** Trust in the official catalog import comes from the signed outer release. */
  releaseTrustClass: 'signed-community-release'
}>

function releaseInputError(
  code: ConstructorParameters<typeof AgentAssetsError>[0],
  message: string,
  details?: Readonly<Record<string, unknown>>,
): AgentAssetsError {
  return new AgentAssetsError(code, message, {
    nextActions: ['Acquire an exact signed Community release bundle and retry without modifying its contents.'],
    ...(details === undefined ? {} : { details }),
  })
}

function safeReleaseFile(releaseRoot: string, reference: string): string {
  if (
    !reference ||
    path.isAbsolute(reference) ||
    reference.includes('\\') ||
    reference.split('/').some((segment) => !segment || segment === '.' || segment === '..')
  ) {
    throw releaseInputError('invalid_package_path', 'Signed release contains an unsafe asset reference.', { reference })
  }
  const normalizedRoot = path.normalize(releaseRoot)
  const rootStat = lstatSync(normalizedRoot)
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) {
    throw releaseInputError('link_unsafe_path', 'Signed release root is not a real directory.')
  }
  const realRoot = realpathSync.native(normalizedRoot)
  const candidate = path.join(normalizedRoot, ...reference.split('/'))
  const relative = path.relative(normalizedRoot, candidate)
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw releaseInputError('invalid_package_path', 'Signed release asset escaped its root.')
  }
  let cursor = normalizedRoot
  for (const segment of reference.split('/')) {
    cursor = path.join(cursor, segment)
    if (!existsSync(cursor)) throw releaseInputError('not_found', 'Signed release asset is missing.', { reference })
    if (lstatSync(cursor).isSymbolicLink()) {
      throw releaseInputError('link_unsafe_path', 'Signed release asset traverses a link.', { reference })
    }
  }
  const stat = lstatSync(candidate)
  if (!stat.isFile()) throw releaseInputError('link_unsafe_path', 'Signed release asset is not a regular file.', { reference })
  const realCandidate = realpathSync.native(candidate)
  const realRelative = path.relative(realRoot, realCandidate)
  if (realRelative.startsWith('..') || path.isAbsolute(realRelative)) {
    throw releaseInputError('link_unsafe_path', 'Signed release asset resolves outside its root.', { reference })
  }
  return candidate
}

function parseJsonBytes(bytes: Uint8Array): unknown {
  try {
    return JSON.parse(Buffer.from(bytes).toString('utf8'))
  } catch (error) {
    throw releaseInputError('schema_incompatible', 'Community agent-asset package manifest is not valid JSON.', {
      cause: error instanceof Error ? error.message : String(error),
    })
  }
}

function loadVerifiedReleasePackage(
  bundle: CommunityVerifiedAgentAssetsReleaseBundle,
  pointer: AgentAssetsPackageRecord,
  expected: Readonly<{
    assetKind: 'community-core' | 'skill-package'
    optional: boolean
    origin: PackageRefV1['origin']
  }>,
): Readonly<{
  releaseRoot: string
  manifestRef: string
  manifestSha256: string
  packageRef: PackageRefV1
  manifest: PackageManifestV1
  transferFiles: readonly PackageTransferFileV1[]
  validation: PortableValidatedPackageV1
  releaseSetSha256: string
}> {
  const { files, setSha256 } = bundle.agentAssets
  const manifestPath = safeReleaseFile(bundle.releaseRoot, pointer.manifestRef)
  const manifestBaseRef = pointer.manifestRef.endsWith('/manifest.json')
    ? pointer.manifestRef.slice(0, -'/manifest.json'.length)
    : ''
  if (!manifestBaseRef) {
    throw releaseInputError('expected_manifest_required', 'Community package manifest reference has an unexpected shape.')
  }
  const signedRows = new Map(files.map((row) => [row.ref, row]))
  const manifestSignedRow = signedRows.get(pointer.manifestRef)
  if (!manifestSignedRow) {
    throw releaseInputError('expected_manifest_required', 'Community package manifest is outside the signed asset closure.')
  }
  const manifestBytes = readFileSync(manifestPath)
  if (
    manifestBytes.byteLength !== manifestSignedRow.byteLength ||
    sha256Bytes(manifestBytes) !== manifestSignedRow.sha256
  ) {
    throw releaseInputError('hash_mismatch', 'Community package manifest changed after release verification.')
  }
  const manifestValue = parseJsonBytes(manifestBytes)

  if (!manifestValue || typeof manifestValue !== 'object' || Array.isArray(manifestValue)) {
    throw releaseInputError('schema_incompatible', 'Community package manifest must be an object.')
  }
  const candidateFiles = (manifestValue as { files?: unknown }).files
  if (!Array.isArray(candidateFiles)) {
    throw releaseInputError('schema_incompatible', 'Community package manifest does not declare files.')
  }
  const transferFiles: PackageTransferFileV1[] = []
  for (const candidate of candidateFiles) {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate) || typeof candidate.path !== 'string') {
      throw releaseInputError('schema_incompatible', 'Community package manifest contains an invalid file row.')
    }
    const reference = `${manifestBaseRef}/files/${candidate.path}`
    const signedRow = signedRows.get(reference)
    if (!signedRow) {
      throw releaseInputError('expected_manifest_required', 'A declared Community package file is outside the signed closure.', {
        reference,
      })
    }
    const bytes = readFileSync(safeReleaseFile(bundle.releaseRoot, reference))
    if (bytes.byteLength !== signedRow.byteLength || sha256Bytes(bytes) !== signedRow.sha256) {
      throw releaseInputError('hash_mismatch', 'Signed Community package file changed after release verification.', {
        reference,
      })
    }
    transferFiles.push({ path: candidate.path, bytes })
  }

  const validation = validatePortablePackageV1(manifestValue, transferFiles)
  if (!validation.ok) {
    throw releaseInputError('hash_mismatch', 'Signed Community package failed the portable package contract.', {
      issues: validation.issues,
    })
  }
  const manifest = validation.value.normalizedManifest
  if (
    manifest.assetKind !== expected.assetKind ||
    pointer.name !== manifest.name ||
    pointer.version !== manifest.version ||
    pointer.versionId !== manifest.versionId ||
    pointer.packageSha256 !== manifest.packageSha256 ||
    pointer.entryFile !== manifest.entryFile ||
    pointer.optional !== expected.optional
  ) {
    throw releaseInputError('hash_mismatch', 'Signed release package pointer and package manifest disagree.')
  }

  return {
    releaseRoot: realpathSync.native(bundle.releaseRoot),
    manifestRef: pointer.manifestRef,
    manifestSha256: manifestSignedRow.sha256,
    packageRef: {
      name: manifest.name,
      version: manifest.version,
      versionId: manifest.versionId,
      packageSha256: manifest.packageSha256,
      entryFile: manifest.entryFile,
      origin: expected.origin,
      trustClass: manifest.provenance.trustClass,
    },
    manifest,
    transferFiles,
    validation: validation.value,
    releaseSetSha256: setSha256,
  }
}

/**
 * Converts an already signature-verified Community release into exact package
 * bytes. It still closes every manifest/file reference against the signed
 * agentAssets record before those bytes may reach staging.
 */
export function loadVerifiedCommunityCoreReleaseInput(
  bundle: CommunityVerifiedAgentAssetsReleaseBundle,
): VerifiedCommunityCoreReleaseInputV1 {
  const loaded = loadVerifiedReleasePackage(bundle, bundle.agentAssets.core, {
    assetKind: 'community-core',
    optional: false,
    origin: 'bundled',
  })
  if (loaded.manifest.assetKind !== 'community-core') {
    throw releaseInputError('schema_incompatible', 'Community core package kind changed after validation.')
  }
  return loaded as VerifiedCommunityCoreReleaseInputV1
}

/**
 * Returns only packages named by the signature-verified optional catalog
 * projection. Import remains inert; this function performs no server or store
 * mutation and never consults repo `.aops` mirrors.
 */
export function loadVerifiedCommunityCatalogReleaseInputs(
  bundle: CommunityVerifiedAgentAssetsReleaseBundle,
): readonly VerifiedCommunityCatalogReleaseInputV1[] {
  const loaded = bundle.agentAssets.catalog.packages.map((pointer) => {
    const candidate = loadVerifiedReleasePackage(bundle, pointer, {
      assetKind: 'skill-package',
      optional: true,
      origin: 'reserved-catalog',
    })
    if (candidate.manifest.assetKind !== 'skill-package') {
      throw releaseInputError('schema_incompatible', 'Community catalog package kind changed after validation.')
    }
    return Object.freeze({
      ...candidate,
      manifest: candidate.manifest,
      releaseTrustClass: 'signed-community-release' as const,
    })
  })
  return Object.freeze(loaded.sort((left, right) => Buffer.compare(
    Buffer.from(`${left.manifest.name}\0${left.manifest.versionId}`, 'utf8'),
    Buffer.from(`${right.manifest.name}\0${right.manifest.versionId}`, 'utf8'),
  )))
}

export async function verifyAndLoadCommunityCoreReleaseInput(options: Readonly<{
  releaseRoot: string
  certificateIdentity?: string
  certificateOidcIssuer?: string
  verificationMode?: 'online' | 'offline'
  signatureVerifier?: CommunityReleaseSignatureVerifier
}>): Promise<VerifiedCommunityCoreReleaseInputV1> {
  const bundle = await verifyCommunityAgentAssetsReleaseBundle(options)
  return loadVerifiedCommunityCoreReleaseInput(bundle)
}

export async function verifyAndLoadCommunityCatalogReleaseInputs(options: Readonly<{
  releaseRoot: string
  certificateIdentity?: string
  certificateOidcIssuer?: string
  verificationMode?: 'online' | 'offline'
  signatureVerifier?: CommunityReleaseSignatureVerifier
}>): Promise<readonly VerifiedCommunityCatalogReleaseInputV1[]> {
  const bundle = await verifyCommunityAgentAssetsReleaseBundle(options)
  return loadVerifiedCommunityCatalogReleaseInputs(bundle)
}
