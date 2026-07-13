import { createHash } from 'node:crypto'
import { lstatSync, readFileSync, realpathSync, type BigIntStats, type Stats } from 'node:fs'
import path from 'node:path'
import { TextDecoder } from 'node:util'

const RELEASE_DIRECTORY = 'release'
const RELEASE_MANIFEST = 'release.json'
const MAX_RELEASE_MANIFEST_BYTES = 1024 * 1024
const MAX_RELEASE_VERSION_LENGTH = 256
const PUBLIC_SOURCE_REPOSITORY = 'git+https://github.com/eeemzs/aops-community'
const RELEASE_VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*))?$/
const UTF8 = new TextDecoder('utf-8', { fatal: true })

export type CommunityRepoResolutionSource = 'explicit' | 'discovered'

export type CommunityRepoResolution = {
  repoRoot: string
  releaseDir: string
  manifestPath: string
  source: CommunityRepoResolutionSource
  verification: 'candidate-requires-signed-release-verification'
  releaseIdentity: Readonly<{
    schemaVersion: 1
    releaseVersion: string
    sourceRepository: string
  }>
  snapshot: CommunityRepoSnapshot
}

export type CommunityRepoEntrySnapshot = Readonly<{
  realPath: string
  device: string
  inode: string
  mode: string
  size: string
  modifiedNanoseconds: string
}>

export type CommunityRepoSnapshot = Readonly<{
  schemaVersion: 1
  root: CommunityRepoEntrySnapshot
  release: CommunityRepoEntrySnapshot
  manifest: CommunityRepoEntrySnapshot
  manifestByteLength: number
  manifestSha256: string
}>

export type CommunityRepoResolutionOptions = {
  repo?: string
  cwd?: string
}

function fail(code: string, detail?: string): never {
  throw new Error(detail ? `${code}:${detail}` : code)
}

function isCanonicalReleaseVersion(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > MAX_RELEASE_VERSION_LENGTH) return false
  const match = value.match(RELEASE_VERSION)
  if (!match) return false
  for (const component of match.slice(1, 4)) {
    if (!Number.isSafeInteger(Number(component))) return false
  }
  for (const identifier of String(match[4] ?? '').split('.')) {
    if (/^\d+$/.test(identifier) && !Number.isSafeInteger(Number(identifier))) return false
  }
  return true
}

function lstatOrFail(candidate: string, code: string): Stats {
  try {
    return lstatSync(candidate)
  } catch {
    return fail(code, candidate)
  }
}

function canonicalPath(candidate: string, code: string): string {
  try {
    return realpathSync.native(candidate)
  } catch {
    return fail(code, candidate)
  }
}

function lstatBigIntOrFail(candidate: string, code: string): BigIntStats {
  try {
    return lstatSync(candidate, { bigint: true })
  } catch {
    return fail(code, candidate)
  }
}

function sameEntryIdentity(left: BigIntStats, right: BigIntStats): boolean {
  return left.dev === right.dev
    && left.ino === right.ino
    && left.mode === right.mode
    && left.size === right.size
    && left.mtimeNs === right.mtimeNs
}

function entrySnapshot(realPath: string, stat: BigIntStats): CommunityRepoEntrySnapshot {
  return Object.freeze({
    realPath,
    device: stat.dev.toString(),
    inode: stat.ino.toString(),
    mode: stat.mode.toString(),
    size: stat.size.toString(),
    modifiedNanoseconds: stat.mtimeNs.toString(),
  })
}

function captureEntry(
  lexicalPath: string,
  expectedKind: 'directory' | 'file',
  missingCode: string,
  kindCode = expectedKind === 'directory' ? 'community_repo_not_directory' : 'community_repo_marker_not_file',
): CommunityRepoEntrySnapshot {
  const before = lstatBigIntOrFail(lexicalPath, missingCode)
  if (before.isSymbolicLink()) fail('community_repo_reparse_refused', lexicalPath)
  if (expectedKind === 'directory' ? !before.isDirectory() : !before.isFile()) {
    fail(kindCode, lexicalPath)
  }
  const resolved = canonicalPath(lexicalPath, 'community_repo_realpath_failed')
  const after = lstatBigIntOrFail(lexicalPath, 'community_repo_snapshot_changed')
  const physical = lstatBigIntOrFail(resolved, 'community_repo_snapshot_changed')
  if (!sameEntryIdentity(before, after) || !sameEntryIdentity(after, physical)) {
    fail('community_repo_snapshot_changed', lexicalPath)
  }
  return entrySnapshot(resolved, after)
}

function parseReleaseIdentity(content: Buffer): CommunityRepoResolution['releaseIdentity'] {
  if (content.byteLength === 0 || content.byteLength > MAX_RELEASE_MANIFEST_BYTES) {
    fail('community_repo_marker_size_invalid')
  }
  let manifest: unknown
  try {
    manifest = JSON.parse(UTF8.decode(content))
  } catch {
    fail('community_repo_marker_json_invalid')
  }
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    fail('community_repo_marker_identity_invalid')
  }
  const candidate = manifest as {
    schemaVersion?: unknown
    releaseVersion?: unknown
    source?: { repository?: unknown }
  }
  if (
    candidate.schemaVersion !== 1
    || !isCanonicalReleaseVersion(candidate.releaseVersion)
    || candidate.source?.repository !== PUBLIC_SOURCE_REPOSITORY
  ) fail('community_repo_marker_identity_invalid')
  return Object.freeze({
    schemaVersion: 1,
    releaseVersion: candidate.releaseVersion,
    sourceRepository: PUBLIC_SOURCE_REPOSITORY,
  })
}

function assertManifestSnapshotSize(snapshot: CommunityRepoEntrySnapshot): void {
  let size: bigint
  try {
    size = BigInt(snapshot.size)
  } catch {
    return fail('community_repo_marker_size_invalid')
  }
  if (size <= 0n || size > BigInt(MAX_RELEASE_MANIFEST_BYTES)) {
    fail('community_repo_marker_size_invalid')
  }
}

function sameSnapshot(left: CommunityRepoEntrySnapshot, right: CommunityRepoEntrySnapshot): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

function pathIdentity(candidate: string): string {
  const normalized = path.normalize(candidate)
  return process.platform === 'win32' ? normalized.toLocaleLowerCase('en-US') : normalized
}

function pathsEqual(left: string, right: string): boolean {
  return pathIdentity(left) === pathIdentity(right)
}

function isConfined(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate)
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))
}

function validateRepoRoot(candidate: string, source: CommunityRepoResolutionSource): CommunityRepoResolution {
  const lexicalRoot = path.resolve(candidate)
  const lexicalReleaseDir = path.join(lexicalRoot, RELEASE_DIRECTORY)
  const lexicalManifestPath = path.join(lexicalReleaseDir, RELEASE_MANIFEST)
  const rootSnapshot = captureEntry(lexicalRoot, 'directory', 'community_repo_missing')
  const releaseSnapshot = captureEntry(
    lexicalReleaseDir,
    'directory',
    'community_repo_marker_missing',
    'community_repo_release_not_directory',
  )
  const manifestBeforeRead = captureEntry(
    lexicalManifestPath,
    'file',
    'community_repo_marker_missing',
  )
  const repoRoot = rootSnapshot.realPath
  const releaseDir = releaseSnapshot.realPath
  const manifestPath = manifestBeforeRead.realPath
  const expectedReleaseDir = path.join(repoRoot, RELEASE_DIRECTORY)
  const expectedManifestPath = path.join(expectedReleaseDir, RELEASE_MANIFEST)

  if (
    !pathsEqual(lexicalRoot, repoRoot) ||
    !pathsEqual(releaseDir, expectedReleaseDir) ||
    !pathsEqual(manifestPath, expectedManifestPath) ||
    !isConfined(repoRoot, releaseDir) ||
    !isConfined(releaseDir, manifestPath)
  ) {
    fail('community_repo_marker_escape', lexicalManifestPath)
  }

  assertManifestSnapshotSize(manifestBeforeRead)
  const manifestBytes = readFileSync(manifestPath)
  const manifestAfterRead = captureEntry(
    lexicalManifestPath,
    'file',
    'community_repo_marker_missing',
  )
  if (!sameSnapshot(manifestBeforeRead, manifestAfterRead)) {
    fail('community_repo_snapshot_changed', lexicalManifestPath)
  }
  const releaseIdentity = parseReleaseIdentity(manifestBytes)
  return {
    repoRoot,
    releaseDir,
    manifestPath,
    source,
    verification: 'candidate-requires-signed-release-verification',
    releaseIdentity,
    snapshot: Object.freeze({
      schemaVersion: 1,
      root: rootSnapshot,
      release: releaseSnapshot,
      manifest: manifestAfterRead,
      manifestByteLength: manifestBytes.byteLength,
      manifestSha256: `sha256:${createHash('sha256').update(manifestBytes).digest('hex')}`,
    }),
  }
}

function markerCanBeInspected(candidateRoot: string): boolean {
  try {
    lstatSync(path.join(candidateRoot, RELEASE_DIRECTORY, RELEASE_MANIFEST))
    return true
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code === 'ENOENT' || code === 'ENOTDIR') return false
    return fail('community_repo_marker_inspection_failed', path.join(candidateRoot, RELEASE_DIRECTORY, RELEASE_MANIFEST))
  }
}

function resolveDiscoveryStart(cwd: string): string {
  const lexicalCwd = path.resolve(cwd)
  const cwdStat = lstatOrFail(lexicalCwd, 'community_repo_cwd_missing')
  if (!cwdStat.isDirectory()) fail('community_repo_cwd_not_directory', lexicalCwd)
  return canonicalPath(lexicalCwd, 'community_repo_cwd_realpath_failed')
}

function discoverCommunityRepo(cwd: string): CommunityRepoResolution {
  let cursor = resolveDiscoveryStart(cwd)
  const matches = new Map<string, CommunityRepoResolution>()

  while (true) {
    if (markerCanBeInspected(cursor)) {
      const match = validateRepoRoot(cursor, 'discovered')
      matches.set(pathIdentity(match.repoRoot), match)
    }
    const parent = path.dirname(cursor)
    if (parent === cursor) break
    cursor = parent
  }

  if (matches.size === 0) fail('community_repo_not_found', cwd)
  if (matches.size > 1) {
    fail('community_repo_ambiguous', [...matches.values()].map((match) => match.repoRoot).join(','))
  }
  return matches.values().next().value as CommunityRepoResolution
}

export function resolveCommunityRepo(options: CommunityRepoResolutionOptions = {}): CommunityRepoResolution {
  const cwd = options.cwd ?? process.cwd()
  if (options.repo !== undefined) {
    if (typeof options.repo !== 'string' || options.repo.trim() === '') fail('community_repo_explicit_invalid')
    const explicitCandidate = path.isAbsolute(options.repo) ? options.repo : path.resolve(cwd, options.repo)
    return validateRepoRoot(explicitCandidate, 'explicit')
  }
  return discoverCommunityRepo(cwd)
}

export function assertCommunityRepoCandidateCurrent(
  resolution: CommunityRepoResolution,
): CommunityRepoResolution {
  if (
    !resolution
    || resolution.verification !== 'candidate-requires-signed-release-verification'
    || resolution.snapshot?.schemaVersion !== 1
  ) fail('community_repo_candidate_invalid')

  const currentRoot = captureEntry(resolution.repoRoot, 'directory', 'community_repo_snapshot_changed')
  const currentRelease = captureEntry(
    resolution.releaseDir,
    'directory',
    'community_repo_snapshot_changed',
    'community_repo_snapshot_changed',
  )
  const currentManifestBeforeRead = captureEntry(
    resolution.manifestPath,
    'file',
    'community_repo_snapshot_changed',
    'community_repo_snapshot_changed',
  )
  assertManifestSnapshotSize(currentManifestBeforeRead)
  const manifestBytes = readFileSync(resolution.manifestPath)
  const currentManifestAfterRead = captureEntry(
    resolution.manifestPath,
    'file',
    'community_repo_snapshot_changed',
    'community_repo_snapshot_changed',
  )
  const manifestSha256 = `sha256:${createHash('sha256').update(manifestBytes).digest('hex')}`
  const releaseIdentity = parseReleaseIdentity(manifestBytes)
  if (
    !sameSnapshot(resolution.snapshot.root, currentRoot)
    || !sameSnapshot(resolution.snapshot.release, currentRelease)
    || !sameSnapshot(resolution.snapshot.manifest, currentManifestBeforeRead)
    || !sameSnapshot(currentManifestBeforeRead, currentManifestAfterRead)
    || manifestBytes.byteLength !== resolution.snapshot.manifestByteLength
    || manifestSha256 !== resolution.snapshot.manifestSha256
    || JSON.stringify(releaseIdentity) !== JSON.stringify(resolution.releaseIdentity)
  ) fail('community_repo_snapshot_changed')
  return resolution
}
