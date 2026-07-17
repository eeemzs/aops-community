import { createHash } from 'node:crypto'
import { lstatSync, readFileSync, realpathSync, type BigIntStats } from 'node:fs'
import path from 'node:path'

import {
  verifyCommunityReleaseDescriptor,
  type CommunityReleaseSignatureVerifier,
  type CommunityVerifiedReleaseDescriptor,
} from './community-release-verifier.js'

const RELEASE_VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/
const RAW_ORIGIN = 'https://raw.githubusercontent.com'
const PUBLIC_REPOSITORY_PATH = 'eeemzs/aops-community'
const FETCH_TIMEOUT_MS = 15_000

const MAX_BYTES = Object.freeze({
  manifest: 256 * 1024,
  signature: 2 * 1024 * 1024,
  compose: 1024 * 1024,
})

type CommunityReleaseFetcher = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>

export type CommunityPublishedRelease = CommunityVerifiedReleaseDescriptor & {
  descriptorSource: Readonly<{
    kind: 'published-tag'
    repository: 'https://github.com/eeemzs/aops-community'
    tag: string
    manifestUrl: string
    signatureBundleUrl: string
    composeUrl: string
  }>
}

type CommunityOfflineEntrySnapshot = Readonly<{
  lexicalPath: string
  realPath: string
  device: string
  inode: string
  mode: string
  size: string
  modifiedNanoseconds: string
  sha256?: string
}>

type CommunityOfflineReleaseSnapshot = Readonly<{
  root: CommunityOfflineEntrySnapshot
  manifest: CommunityOfflineEntrySnapshot
  signatureBundle: CommunityOfflineEntrySnapshot
  compose: CommunityOfflineEntrySnapshot
}>

export type CommunityOfflineRelease = Readonly<{
  verified: CommunityVerifiedReleaseDescriptor
  assertCurrent: () => void
  descriptorSource: Readonly<{
    kind: 'offline-descriptor'
    releaseDirectory: string
    manifestPath: string
    manifestSha256: string
    signatureBundlePath: string
    signatureBundleSha256: string
    composePath: string
    composeSha256: string
  }>
}>

function fail(code: string, detail?: string): never {
  throw new Error(detail ? `${code}:${detail}` : code)
}

function lstatBigInt(candidate: string, code: string): BigIntStats {
  try {
    return lstatSync(candidate, { bigint: true })
  } catch {
    fail(code, candidate)
  }
}

function canonicalPath(candidate: string, code: string): string {
  try {
    return realpathSync.native(candidate)
  } catch {
    fail(code, candidate)
  }
}

function sameEntry(left: BigIntStats, right: BigIntStats): boolean {
  return left.dev === right.dev
    && left.ino === right.ino
    && left.mode === right.mode
    && left.size === right.size
    && left.mtimeNs === right.mtimeNs
}

function entrySnapshot(
  lexicalPath: string,
  realPath: string,
  stat: BigIntStats,
  bytes?: Buffer,
): CommunityOfflineEntrySnapshot {
  return Object.freeze({
    lexicalPath,
    realPath,
    device: stat.dev.toString(),
    inode: stat.ino.toString(),
    mode: stat.mode.toString(),
    size: stat.size.toString(),
    modifiedNanoseconds: stat.mtimeNs.toString(),
    ...(bytes ? { sha256: `sha256:${createHash('sha256').update(bytes).digest('hex')}` } : {}),
  })
}

function captureOfflineRoot(rootPath: string): CommunityOfflineEntrySnapshot {
  const lexicalPath = path.resolve(rootPath)
  const before = lstatBigInt(lexicalPath, 'community_offline_release_root_missing')
  if (before.isSymbolicLink() || !before.isDirectory()) fail('community_offline_release_root_invalid', lexicalPath)
  const realPath = canonicalPath(lexicalPath, 'community_offline_release_root_realpath_failed')
  const after = lstatBigInt(lexicalPath, 'community_offline_release_snapshot_changed')
  const physical = lstatBigInt(realPath, 'community_offline_release_snapshot_changed')
  if (!sameEntry(before, after) || !sameEntry(after, physical)) {
    fail('community_offline_release_snapshot_changed', lexicalPath)
  }
  return entrySnapshot(lexicalPath, realPath, after)
}

function isConfined(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate)
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))
}

function captureOfflineFile(options: {
  filePath: string
  root: CommunityOfflineEntrySnapshot
  maxBytes: number
  code: string
}): { content: string; snapshot: CommunityOfflineEntrySnapshot } {
  const lexicalPath = path.resolve(options.filePath)
  const before = lstatBigInt(lexicalPath, `${options.code}_missing`)
  if (before.isSymbolicLink() || !before.isFile()) fail(`${options.code}_invalid`, lexicalPath)
  if (before.size <= 0n || before.size > BigInt(options.maxBytes)) fail(`${options.code}_size_invalid`)
  const realPath = canonicalPath(lexicalPath, `${options.code}_realpath_failed`)
  if (!isConfined(options.root.realPath, realPath)) fail(`${options.code}_escape`, realPath)
  const physical = lstatBigInt(realPath, 'community_offline_release_snapshot_changed')
  if (!sameEntry(before, physical)) fail('community_offline_release_snapshot_changed', lexicalPath)
  let bytes: Buffer
  try {
    bytes = readFileSync(realPath)
  } catch {
    fail(`${options.code}_read_failed`, realPath)
  }
  const after = lstatBigInt(lexicalPath, 'community_offline_release_snapshot_changed')
  if (!sameEntry(before, after) || bytes.byteLength !== Number(after.size)) {
    fail('community_offline_release_snapshot_changed', lexicalPath)
  }
  let content: string
  try {
    content = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    fail(`${options.code}_utf8_invalid`)
  }
  return { content, snapshot: entrySnapshot(lexicalPath, realPath, after, bytes) }
}

function captureOfflineReleaseSnapshot(descriptorPath: string): {
  snapshot: CommunityOfflineReleaseSnapshot
  manifestContent: string
  signatureBundleContent: string
  composeContent: string
} {
  const lexicalManifestPath = path.resolve(descriptorPath)
  if (path.basename(lexicalManifestPath) !== 'release.json') {
    fail('community_offline_release_descriptor_name_invalid')
  }
  const root = captureOfflineRoot(path.dirname(lexicalManifestPath))
  const manifest = captureOfflineFile({
    filePath: lexicalManifestPath,
    root,
    maxBytes: MAX_BYTES.manifest,
    code: 'community_offline_release_manifest',
  })
  const signatureBundle = captureOfflineFile({
    filePath: path.join(root.lexicalPath, 'release.sigstore.json'),
    root,
    maxBytes: MAX_BYTES.signature,
    code: 'community_offline_release_signature',
  })
  const compose = captureOfflineFile({
    filePath: path.join(root.lexicalPath, 'compose.yaml'),
    root,
    maxBytes: MAX_BYTES.compose,
    code: 'community_offline_release_compose',
  })
  return {
    snapshot: Object.freeze({
      root,
      manifest: manifest.snapshot,
      signatureBundle: signatureBundle.snapshot,
      compose: compose.snapshot,
    }),
    manifestContent: manifest.content,
    signatureBundleContent: signatureBundle.content,
    composeContent: compose.content,
  }
}

function assertOfflineReleaseCurrent(expected: CommunityOfflineReleaseSnapshot): void {
  let current: CommunityOfflineReleaseSnapshot
  try {
    current = captureOfflineReleaseSnapshot(expected.manifest.lexicalPath).snapshot
  } catch (error) {
    fail('community_offline_release_snapshot_changed', error instanceof Error ? error.message : String(error))
  }
  if (JSON.stringify(current) !== JSON.stringify(expected)) fail('community_offline_release_snapshot_changed')
}

function exactReleaseBase(releaseVersion: string): string {
  if (!RELEASE_VERSION.test(releaseVersion)) fail('community_published_release_version_invalid')
  return `${RAW_ORIGIN}/${PUBLIC_REPOSITORY_PATH}/v${releaseVersion}/release`
}

function boundedSignal(signal?: AbortSignal): AbortSignal {
  const timeout = AbortSignal.timeout(FETCH_TIMEOUT_MS)
  return signal ? AbortSignal.any([signal, timeout]) : timeout
}

async function readBoundedUtf8(response: Response, maxBytes: number, code: string): Promise<string> {
  const declared = response.headers.get('content-length')
  if (declared !== null && (!/^\d+$/.test(declared) || Number(declared) > maxBytes)) {
    fail(`${code}_size_invalid`)
  }
  if (!response.body) fail(`${code}_body_missing`)
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let byteLength = 0
  try {
    while (true) {
      const result = await reader.read()
      if (result.done) break
      byteLength += result.value.byteLength
      if (byteLength > maxBytes) fail(`${code}_size_invalid`)
      chunks.push(result.value)
    }
  } finally {
    reader.releaseLock()
  }
  if (byteLength === 0) fail(`${code}_body_empty`)
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))))
  } catch {
    fail(`${code}_utf8_invalid`)
  }
}

async function fetchExactText(options: {
  url: string
  maxBytes: number
  code: string
  fetcher: CommunityReleaseFetcher
  signal?: AbortSignal
}): Promise<string> {
  let response: Response
  try {
    response = await options.fetcher(options.url, {
      method: 'GET',
      redirect: 'error',
      cache: 'no-store',
      headers: { accept: 'application/octet-stream, application/json;q=0.9, text/plain;q=0.8' },
      signal: boundedSignal(options.signal),
    })
  } catch (error) {
    fail(`${options.code}_fetch_failed`, error instanceof Error ? error.message : String(error))
  }
  if (response.status !== 200) fail(`${options.code}_http_status`, String(response.status))
  if (response.redirected || (response.url && response.url !== options.url)) {
    fail(`${options.code}_redirect_refused`)
  }
  return readBoundedUtf8(response, options.maxBytes, options.code)
}

export async function resolveCommunityPublishedRelease(options: {
  releaseVersion: string
  certificateIdentity?: string
  certificateOidcIssuer?: string
  signal?: AbortSignal
  fetcher?: CommunityReleaseFetcher
  signatureVerifier?: CommunityReleaseSignatureVerifier
}): Promise<CommunityPublishedRelease> {
  const base = exactReleaseBase(options.releaseVersion)
  const descriptorSource = Object.freeze({
    kind: 'published-tag' as const,
    repository: 'https://github.com/eeemzs/aops-community' as const,
    tag: `v${options.releaseVersion}`,
    manifestUrl: `${base}/release.json`,
    signatureBundleUrl: `${base}/release.sigstore.json`,
    composeUrl: `${base}/compose.yaml`,
  })
  const fetcher = options.fetcher ?? globalThis.fetch
  const manifestContent = await fetchExactText({
    url: descriptorSource.manifestUrl,
    maxBytes: MAX_BYTES.manifest,
    code: 'community_published_release_manifest',
    fetcher,
    signal: options.signal,
  })
  const [signatureBundleContent, composeContent] = await Promise.all([
    fetchExactText({
      url: descriptorSource.signatureBundleUrl,
      maxBytes: MAX_BYTES.signature,
      code: 'community_published_release_signature',
      fetcher,
      signal: options.signal,
    }),
    fetchExactText({
      url: descriptorSource.composeUrl,
      maxBytes: MAX_BYTES.compose,
      code: 'community_published_release_compose',
      fetcher,
      signal: options.signal,
    }),
  ])
  const verified = await verifyCommunityReleaseDescriptor({
    manifestContent,
    signatureBundleContent,
    composeContent,
    expectedReleaseVersion: options.releaseVersion,
    certificateIdentity: options.certificateIdentity,
    certificateOidcIssuer: options.certificateOidcIssuer,
    signatureVerifier: options.signatureVerifier,
    verificationMode: 'online',
  })
  return { ...verified, descriptorSource }
}

export async function resolveCommunityOfflineRelease(options: {
  descriptorPath: string
  releaseVersion: string
  certificateIdentity?: string
  certificateOidcIssuer?: string
  signal?: AbortSignal
  signatureVerifier?: CommunityReleaseSignatureVerifier
}): Promise<CommunityOfflineRelease> {
  if (typeof options.descriptorPath !== 'string' || options.descriptorPath.trim() === '') {
    fail('community_offline_release_descriptor_path_invalid')
  }
  options.signal?.throwIfAborted()
  const captured = captureOfflineReleaseSnapshot(options.descriptorPath)
  const verified = await verifyCommunityReleaseDescriptor({
    manifestContent: captured.manifestContent,
    signatureBundleContent: captured.signatureBundleContent,
    composeContent: captured.composeContent,
    expectedReleaseVersion: options.releaseVersion,
    certificateIdentity: options.certificateIdentity,
    certificateOidcIssuer: options.certificateOidcIssuer,
    signatureVerifier: options.signatureVerifier,
    verificationMode: 'offline',
  })
  options.signal?.throwIfAborted()
  const assertCurrent = () => assertOfflineReleaseCurrent(captured.snapshot)
  assertCurrent()
  return Object.freeze({
    verified,
    assertCurrent,
    descriptorSource: Object.freeze({
      kind: 'offline-descriptor' as const,
      releaseDirectory: captured.snapshot.root.realPath,
      manifestPath: captured.snapshot.manifest.realPath,
      manifestSha256: captured.snapshot.manifest.sha256!,
      signatureBundlePath: captured.snapshot.signatureBundle.realPath,
      signatureBundleSha256: captured.snapshot.signatureBundle.sha256!,
      composePath: captured.snapshot.compose.realPath,
      composeSha256: captured.snapshot.compose.sha256!,
    }),
  })
}
