import { createHash } from 'node:crypto'
import { lstatSync, readFileSync, realpathSync, statSync } from 'node:fs'
import path from 'node:path'
import { verify as verifySigstore, type Bundle } from 'sigstore'

import { parseCommunityRelease, type CommunityReleaseIdentity } from './community-lifecycle.js'

const SHA256 = /^sha256:[a-f0-9]{64}$/
const NPM_INTEGRITY_SHA512 = /^sha512-[A-Za-z0-9+/]{86}==$/
export const COMMUNITY_GITHUB_OIDC_ISSUER = 'https://token.actions.githubusercontent.com'
export const COMMUNITY_PUBLIC_SOURCE_REPOSITORY = 'git+https://github.com/eeemzs/aops-community'
export const COMMUNITY_PUBLIC_CLI_PACKAGE_NAME = '@aopslab/aops-cli'

type ArtifactRef = { ref: string; sha256: string; kind: string }
type ReleaseManifest = {
  schemaVersion: 1
  releaseVersion: string
  source: { repository: string; treeRef: string; treeDigest: string }
  image: { repository: string; tag: string; indexDigest: string }
  cli: {
    packageName: string
    version: string
    commandSchemaVersion: number
    bundleSha256: string
    bundleByteLength: number
    npmDistTag: string
    artifactRef: string
    artifactSha256: string
    npmIntegrity: string
  }
  compose: { ref: string; sha256: string }
  migrations: { setDigest: string; tags: string[]; files: Array<{ ref: string; sha256: string }> }
  legal: {
    license: { ref: 'LICENSE'; sha256: string }
    notice: { ref: 'NOTICE'; sha256: string }
    thirdPartyNotices: { ref: 'THIRD_PARTY_NOTICES'; sha256: string }
    thirdPartyInventory: { ref: 'THIRD_PARTY_NOTICES.inventory.json'; sha256: string }
  }
  evidence: {
    sbom: { ref: string; sha256: string }
    provenance: { ref: string; sha256: string }
    signature: { bundleRef: string }
  }
}

export type CommunityVerifiedReleaseBundle = {
  releaseRoot: string
  manifestPath: string
  signatureBundlePath: string
  manifestContent: string
  composeContent: string
  identity: CommunityReleaseIdentity
  certificateIdentity: string
  certificateOidcIssuer: string
  verifiedArtifactCount: number
}

type SignatureVerifier = (
  bundle: Bundle,
  payload: Buffer,
  options: { certificateIssuer: string; certificateIdentityURI: string },
) => Promise<unknown>

function fail(code: string, detail?: string): never {
  throw new Error(detail ? `${code}:${detail}` : code)
}

function digestFile(filePath: string): string {
  return `sha256:${createHash('sha256').update(readFileSync(filePath)).digest('hex')}`
}

function npmIntegrityFile(filePath: string): string {
  return `sha512-${createHash('sha512').update(readFileSync(filePath)).digest('base64')}`
}

function assertExactObject(value: unknown, keys: readonly string[], code: string): asserts value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(code)
  const actual = Object.keys(value).sort()
  const expected = [...keys].sort()
  if (JSON.stringify(actual) !== JSON.stringify(expected)) fail(code)
}

function requireConfinedFile(root: string, ref: unknown, code: string): string {
  if (typeof ref !== 'string' || !ref || path.isAbsolute(ref)) fail(`${code}_ref_invalid`)
  const normalizedRef = ref.replaceAll('\\', '/')
  if (normalizedRef.split('/').some((segment) => segment === '..' || segment === '')) fail(`${code}_ref_invalid`)
  const candidate = path.resolve(root, ...normalizedRef.split('/'))
  const relative = path.relative(root, candidate)
  if (relative.startsWith('..') || path.isAbsolute(relative)) fail(`${code}_ref_escape`)
  let cursor = root
  for (const segment of relative.split(path.sep).filter(Boolean)) {
    cursor = path.join(cursor, segment)
    const stat = lstatSync(cursor)
    if (stat.isSymbolicLink()) fail(`${code}_reparse_refused`, cursor)
  }
  const stat = statSync(candidate)
  if (!stat.isFile() || stat.size <= 0) fail(`${code}_file_invalid`, candidate)
  const realRoot = realpathSync(root)
  const realCandidate = realpathSync(candidate)
  const realRelative = path.relative(realRoot, realCandidate)
  if (realRelative.startsWith('..') || path.isAbsolute(realRelative)) fail(`${code}_real_escape`)
  return candidate
}

function assertDigest(value: unknown, code: string): asserts value is string {
  if (typeof value !== 'string' || !SHA256.test(value)) fail(code)
}

function parseManifest(content: string): ReleaseManifest {
  let value: unknown
  try {
    value = JSON.parse(content)
  } catch {
    fail('community_release_manifest_json_invalid')
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('community_release_manifest_invalid')
  const manifest = value as ReleaseManifest
  if (manifest.schemaVersion !== 1 || typeof manifest.releaseVersion !== 'string' || !manifest.releaseVersion) {
    fail('community_release_manifest_invalid')
  }
  if (!manifest.source || !manifest.cli || !manifest.compose || !manifest.migrations || !manifest.legal || !manifest.evidence) {
    fail('community_release_manifest_incomplete')
  }
  if (manifest.source.repository !== COMMUNITY_PUBLIC_SOURCE_REPOSITORY) {
    fail('community_release_source_repository_invalid')
  }
  if (
    manifest.image?.repository !== 'ghcr.io/aopslab/aops-community' ||
    manifest.image.tag !== `v${manifest.releaseVersion}`
  ) {
    fail('community_release_image_identity_invalid')
  }
  assertDigest(manifest.source.treeDigest, 'community_release_source_digest_invalid')
  assertExactObject(manifest.cli, [
    'packageName',
    'version',
    'commandSchemaVersion',
    'bundleSha256',
    'bundleByteLength',
    'npmDistTag',
    'artifactRef',
    'artifactSha256',
    'npmIntegrity',
  ], 'community_release_cli_identity_invalid')
  if (
    manifest.cli.packageName !== COMMUNITY_PUBLIC_CLI_PACKAGE_NAME ||
    manifest.cli.version !== manifest.releaseVersion ||
    manifest.cli.artifactRef !== `aopslab-aops-cli-${manifest.releaseVersion}.tgz` ||
    manifest.cli.npmDistTag !== (manifest.releaseVersion.includes('-') ? 'next' : 'latest') ||
    !Number.isSafeInteger(manifest.cli.commandSchemaVersion) ||
    manifest.cli.commandSchemaVersion <= 0 ||
    !Number.isSafeInteger(manifest.cli.bundleByteLength) ||
    manifest.cli.bundleByteLength <= 0 ||
    !NPM_INTEGRITY_SHA512.test(manifest.cli.npmIntegrity)
  ) {
    fail('community_release_cli_identity_invalid')
  }
  if (manifest.cli.commandSchemaVersion !== 1) fail('community_release_cli_command_schema_unsupported')
  assertDigest(manifest.cli.bundleSha256, 'community_release_cli_bundle_digest_invalid')
  assertDigest(manifest.cli.artifactSha256, 'community_release_cli_digest_invalid')
  assertDigest(manifest.compose.sha256, 'community_release_compose_digest_invalid')
  assertDigest(manifest.migrations.setDigest, 'community_release_migration_digest_invalid')
  for (const [kind, expectedRef] of [
    ['license', 'LICENSE'],
    ['notice', 'NOTICE'],
    ['thirdPartyNotices', 'THIRD_PARTY_NOTICES'],
    ['thirdPartyInventory', 'THIRD_PARTY_NOTICES.inventory.json'],
  ] as const) {
    const entry = manifest.legal[kind]
    if (entry?.ref !== expectedRef) fail(`community_release_legal_${kind}_ref_invalid`)
    assertDigest(entry.sha256, `community_release_legal_${kind}_digest_invalid`)
  }
  assertDigest(manifest.evidence.sbom?.sha256, 'community_release_sbom_digest_invalid')
  assertDigest(manifest.evidence.provenance?.sha256, 'community_release_provenance_digest_invalid')
  if (!Array.isArray(manifest.migrations.files) || manifest.migrations.files.length === 0) {
    fail('community_release_migration_files_invalid')
  }
  for (const entry of manifest.migrations.files) assertDigest(entry?.sha256, 'community_release_migration_file_digest_invalid')
  return manifest
}

function defaultCertificateIdentity(manifest: ReleaseManifest): string {
  const tag = manifest.image.tag || `v${manifest.releaseVersion}`
  return `https://github.com/aopslab/aops/.github/workflows/community-release.yml@refs/tags/${tag}`
}

function exactRegex(value: string): string {
  return `^${value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`
}

export async function verifyCommunityReleaseBundle(options: {
  releaseRoot: string
  certificateIdentity?: string
  certificateOidcIssuer?: string
  signatureVerifier?: SignatureVerifier
}): Promise<CommunityVerifiedReleaseBundle> {
  const releaseRoot = path.resolve(options.releaseRoot)
  const rootStat = lstatSync(releaseRoot)
  if (!rootStat.isDirectory() || rootStat.isSymbolicLink()) fail('community_release_root_invalid')
  const manifestPath = requireConfinedFile(releaseRoot, 'release.json', 'community_release_manifest')
  const manifestContent = readFileSync(manifestPath, 'utf8')
  const manifest = parseManifest(manifestContent)
  const artifacts: ArtifactRef[] = [
    { ref: manifest.source.treeRef, sha256: manifest.source.treeDigest, kind: 'source' },
    { ref: manifest.cli.artifactRef, sha256: manifest.cli.artifactSha256, kind: 'cli' },
    { ref: manifest.compose.ref, sha256: manifest.compose.sha256, kind: 'compose' },
    ...manifest.migrations.files.map((entry) => ({ ...entry, kind: 'migration' })),
    { ref: manifest.legal.license.ref, sha256: manifest.legal.license.sha256, kind: 'legal_license' },
    { ref: manifest.legal.notice.ref, sha256: manifest.legal.notice.sha256, kind: 'legal_notice' },
    { ref: manifest.legal.thirdPartyNotices.ref, sha256: manifest.legal.thirdPartyNotices.sha256, kind: 'legal_third_party_notices' },
    { ref: manifest.legal.thirdPartyInventory.ref, sha256: manifest.legal.thirdPartyInventory.sha256, kind: 'legal_third_party_inventory' },
    { ref: manifest.evidence.sbom.ref, sha256: manifest.evidence.sbom.sha256, kind: 'sbom' },
    { ref: manifest.evidence.provenance.ref, sha256: manifest.evidence.provenance.sha256, kind: 'provenance' },
  ]
  let composePath = ''
  for (const artifact of artifacts) {
    const artifactPath = requireConfinedFile(releaseRoot, artifact.ref, `community_release_${artifact.kind}`)
    if (digestFile(artifactPath) !== artifact.sha256) fail(`community_release_${artifact.kind}_digest_mismatch`, artifact.ref)
    if (artifact.kind === 'cli' && npmIntegrityFile(artifactPath) !== manifest.cli.npmIntegrity) {
      fail('community_release_cli_npm_integrity_mismatch', artifact.ref)
    }
    if (artifact.kind === 'compose') composePath = artifactPath
  }
  const signatureBundlePath = requireConfinedFile(
    releaseRoot,
    manifest.evidence.signature?.bundleRef,
    'community_release_signature',
  )
  const certificateIdentity = options.certificateIdentity ?? defaultCertificateIdentity(manifest)
  const certificateOidcIssuer = options.certificateOidcIssuer ?? COMMUNITY_GITHUB_OIDC_ISSUER
  let signatureBundle: Bundle
  try {
    signatureBundle = JSON.parse(readFileSync(signatureBundlePath, 'utf8')) as Bundle
  } catch {
    fail('community_release_signature_bundle_json_invalid')
  }
  try {
    await (options.signatureVerifier ?? verifySigstore)(signatureBundle, Buffer.from(manifestContent), {
      certificateIssuer: certificateOidcIssuer,
      certificateIdentityURI: exactRegex(certificateIdentity),
    })
  } catch (error) {
    fail('community_release_sigstore_verification_failed', error instanceof Error ? error.message : String(error))
  }
  const composeContent = readFileSync(composePath, 'utf8')
  return {
    releaseRoot,
    manifestPath,
    signatureBundlePath,
    manifestContent,
    composeContent,
    identity: parseCommunityRelease(manifestContent, composeContent),
    certificateIdentity,
    certificateOidcIssuer,
    verifiedArtifactCount: artifacts.length + 2,
  }
}
