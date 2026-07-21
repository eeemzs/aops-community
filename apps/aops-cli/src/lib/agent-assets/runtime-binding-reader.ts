import { createHash } from 'node:crypto'
import {
  closeSync,
  constants,
  existsSync,
  fstatSync,
  lstatSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
  type Stats,
} from 'node:fs'
import path from 'node:path'

import { AgentAssetsError } from './envelope.js'
import {
  AOPS_AGENT_ASSETS_GATEWAY,
  AOPS_AGENT_ASSETS_GATEWAY_RELATIVE_PATH,
  AOPS_AGENT_ASSETS_GATEWAY_SHA256,
} from './gateway.js'
import {
  canonicalJsonSha256V1,
  canonicalJsonV1,
  parseActivationReceiptV1,
  parseStoreAuthorityV1,
} from './store-reader.js'
import type {
  ActivationReceiptV1,
  RuntimeBindingReceiptV1,
  RuntimeBindingV1,
  RuntimeGatewayOwnerMarkerV1,
  StoreAuthorityV1,
} from './store-types.js'

const SHA256_HEX = /^[a-f0-9]{64}$/
const MAX_BINDING_BYTES = 64 * 1024
const MAX_GATEWAY_BYTES = 16 * 1024
const MAX_RECEIPT_ENTRIES = 10_000
const RUNTIME_BINDING_KEYS = [
  'schemaVersion',
  'storeId',
  'bindingId',
  'bindingGeneration',
  'runtime',
  'runtimeHomeId',
  'runtimeRootIdentitySha256',
  'gatewayName',
  'relativePath',
  'ownerMarkerRelativePath',
  'contentSha256',
  'ownerMarkerSha256',
  'activationReceiptId',
  'activationReceiptSha256',
  'bindingReceiptId',
  'bindingReceiptSha256',
  'previousContentSha256',
  'installedAt',
  'writerFenceEpoch',
  'authorityRevision',
] as const
const RUNTIME_BINDING_RECEIPT_KEYS = RUNTIME_BINDING_KEYS.filter((key) => key !== 'bindingReceiptSha256')
const OWNER_MARKER_KEYS = [
  'schemaVersion',
  'owner',
  'storeId',
  'runtime',
  'bindingId',
  'bindingGeneration',
  'relativePath',
  'contentSha256',
] as const

type JsonRecord = Record<string, unknown>
type Runtime = 'codex' | 'claude'

export type RuntimeBindingInspectionState =
  | 'absent'
  | 'ready'
  | 'managed-drift'
  | 'ownership-conflict'
  | 'unsafe-path'

export type RuntimeBindingInspectionReason =
  | 'store-binding-absent'
  | 'store-binding-invalid'
  | 'store-binding-unsafe'
  | 'owner-marker-absent'
  | 'owner-marker-invalid'
  | 'owner-marker-unsafe'
  | 'gateway-absent'
  | 'gateway-tampered'
  | 'gateway-unsafe'
  | 'binding-content-outdated'
  | 'binding-context-mismatch'
  | 'binding-marker-mismatch'

export type RuntimeBindingProofStateV1 = 'absent' | 'verified' | 'invalid' | 'unsafe-path'
export type RuntimeOwnerMarkerProofStateV1 = 'absent' | 'verified' | 'mismatch' | 'unavailable' | 'unsafe-path'
export type RuntimeRootIdentityEvidenceV1 =
  | 'unavailable'
  | 'recorded-not-live-verified'
  | 'native-qualified-match'
  | 'native-qualified-mismatch'

export type RuntimeBindingInspectionV1 = Readonly<{
  schemaVersion: 1
  runtime: Runtime
  state: RuntimeBindingInspectionState
  managed: boolean
  runtimeHomeId: string
  gatewayRelativePath: typeof AOPS_AGENT_ASSETS_GATEWAY_RELATIVE_PATH
  ownerMarkerRelativePath: 'skills/aops/.aops-gateway-owner.json'
  storeBinding: 'absent' | 'ready' | 'invalid' | 'unsafe-path'
  bindingProof: RuntimeBindingProofStateV1
  ownerMarker: 'absent' | 'ready' | 'invalid' | 'unsafe-path'
  ownerMarkerProof: RuntimeOwnerMarkerProofStateV1
  gateway: 'absent' | 'canonical' | 'tampered' | 'unsafe-path'
  gatewayContentSha256?: string
  runtimeRootIdentityEvidence: RuntimeRootIdentityEvidenceV1
  reasons: readonly RuntimeBindingInspectionReason[]
}>

export type InspectRuntimeGatewayBindingOptions = Readonly<{
  assetRoot: string
  runtime: Runtime
  runtimeHome: string
  /** Native root identity, when the caller has already qualified the runtime root. */
  expectedRuntimeRootIdentitySha256?: string
  /** Optional pre-loaded authority. The on-disk authority must still match it. */
  authority?: StoreAuthorityV1
}>

type SafeFileResult =
  | Readonly<{ state: 'absent' }>
  | Readonly<{ state: 'unsafe-path'; reason: string }>
  | Readonly<{ state: 'ready'; bytes: Buffer }>

type SafeDirectoryResult =
  | Readonly<{ state: 'absent' }>
  | Readonly<{ state: 'unsafe-path'; reason: string }>
  | Readonly<{ state: 'ready'; names: readonly string[] }>

type StoreBindingRead =
  | Readonly<{ state: 'absent' }>
  | Readonly<{ state: 'unsafe-path'; reason: string }>
  | Readonly<{ state: 'invalid'; reason: string }>
  | Readonly<{ state: 'ready'; binding: RuntimeBindingV1 }>

function bindingError(message: string, details?: Readonly<Record<string, unknown>>): AgentAssetsError {
  return new AgentAssetsError('schema_incompatible', message, {
    nextActions: ['Run `aops assets status --verify full --json` and inspect the binding diagnostics.'],
    ...(details === undefined ? {} : { details }),
  })
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function exactRecord(value: unknown, keys: readonly string[], label: string): JsonRecord {
  if (!isRecord(value)) throw bindingError(`${label} must be an object.`)
  const actual = Object.keys(value).sort()
  const expected = [...keys].sort()
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw bindingError(`${label} has missing or unknown fields.`, { actual, expected })
  }
  return value
}

function stringField(record: JsonRecord, key: string, label: string, minimumLength = 1): string {
  const value = record[key]
  if (typeof value !== 'string' || value.length < minimumLength) {
    throw bindingError(`${label}.${key} must be a non-empty string.`)
  }
  return value
}

function integerField(record: JsonRecord, key: string, label: string, minimum: number): number {
  const value = record[key]
  if (!Number.isSafeInteger(value) || (value as number) < minimum) {
    throw bindingError(`${label}.${key} must be an integer greater than or equal to ${minimum}.`)
  }
  return value as number
}

function shaField(record: JsonRecord, key: string, label: string): string {
  const value = stringField(record, key, label)
  if (!SHA256_HEX.test(value)) throw bindingError(`${label}.${key} must be lowercase SHA-256.`)
  return value
}

function exactString<T extends string>(record: JsonRecord, key: string, expected: T, label: string): T {
  if (record[key] !== expected) throw bindingError(`${label}.${key} must equal ${expected}.`)
  return expected
}

function runtimeField(record: JsonRecord, key: string, label: string): Runtime {
  const value = record[key]
  if (value !== 'codex' && value !== 'claude') throw bindingError(`${label}.${key} must be codex or claude.`)
  return value
}

function dateField(record: JsonRecord, key: string, label: string): string {
  const value = stringField(record, key, label)
  if (!Number.isFinite(Date.parse(value))) throw bindingError(`${label}.${key} must be an ISO date-time.`)
  return value
}

function parseRuntimeBindingRecord(
  value: unknown,
  receipt: boolean,
): RuntimeBindingV1 | RuntimeBindingReceiptV1 {
  const label = receipt ? 'RuntimeBindingReceiptV1' : 'RuntimeBindingV1'
  const allKeys = receipt ? RUNTIME_BINDING_RECEIPT_KEYS : RUNTIME_BINDING_KEYS
  const actualRecord = isRecord(value) ? value : undefined
  const keys = actualRecord && !Object.hasOwn(actualRecord, 'previousContentSha256')
    ? allKeys.filter((key) => key !== 'previousContentSha256')
    : allKeys
  const record = exactRecord(value, keys, label)
  if (record.schemaVersion !== 1) throw bindingError(`${label}.schemaVersion must equal 1.`)
  const hasPreviousContentSha256 = Object.hasOwn(record, 'previousContentSha256')
  const previousContentSha256 = hasPreviousContentSha256
    ? record.previousContentSha256 === null
      ? null
      : shaField(record, 'previousContentSha256', label)
    : undefined
  const common: RuntimeBindingReceiptV1 = {
    schemaVersion: 1,
    storeId: stringField(record, 'storeId', label, 16),
    bindingId: stringField(record, 'bindingId', label),
    bindingGeneration: integerField(record, 'bindingGeneration', label, 1),
    runtime: runtimeField(record, 'runtime', label),
    runtimeHomeId: shaField(record, 'runtimeHomeId', label),
    runtimeRootIdentitySha256: shaField(record, 'runtimeRootIdentitySha256', label),
    gatewayName: exactString(record, 'gatewayName', 'aops', label),
    relativePath: exactString(record, 'relativePath', 'skills/aops/SKILL.md', label),
    ownerMarkerRelativePath: exactString(
      record,
      'ownerMarkerRelativePath',
      'skills/aops/.aops-gateway-owner.json',
      label,
    ),
    contentSha256: shaField(record, 'contentSha256', label),
    ownerMarkerSha256: shaField(record, 'ownerMarkerSha256', label),
    activationReceiptId: stringField(record, 'activationReceiptId', label),
    activationReceiptSha256: shaField(record, 'activationReceiptSha256', label),
    bindingReceiptId: stringField(record, 'bindingReceiptId', label),
    ...(hasPreviousContentSha256 ? { previousContentSha256 } : {}),
    installedAt: dateField(record, 'installedAt', label),
    writerFenceEpoch: integerField(record, 'writerFenceEpoch', label, 1),
    authorityRevision: integerField(record, 'authorityRevision', label, 1),
  }
  if (receipt) return common
  return { ...common, bindingReceiptSha256: shaField(record, 'bindingReceiptSha256', label) }
}

export function parseRuntimeBindingV1(value: unknown): RuntimeBindingV1 {
  return parseRuntimeBindingRecord(value, false) as RuntimeBindingV1
}

export function parseRuntimeBindingReceiptV1(value: unknown): RuntimeBindingReceiptV1 {
  return parseRuntimeBindingRecord(value, true)
}

export function parseRuntimeGatewayOwnerMarkerV1(value: unknown): RuntimeGatewayOwnerMarkerV1 {
  const label = 'RuntimeGatewayOwnerMarkerV1'
  const record = exactRecord(value, OWNER_MARKER_KEYS, label)
  if (record.schemaVersion !== 1) throw bindingError(`${label}.schemaVersion must equal 1.`)
  return {
    schemaVersion: 1,
    owner: exactString(record, 'owner', 'aops-cli-agent-assets', label),
    storeId: stringField(record, 'storeId', label, 16),
    runtime: runtimeField(record, 'runtime', label),
    bindingId: stringField(record, 'bindingId', label),
    bindingGeneration: integerField(record, 'bindingGeneration', label, 1),
    relativePath: exactString(record, 'relativePath', 'skills/aops/SKILL.md', label),
    contentSha256: shaField(record, 'contentSha256', label),
  }
}

function sha256Bytes(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}

export function agentAssetsRuntimeHomeId(runtime: Runtime, runtimeHome: string): string {
  if (!path.isAbsolute(runtimeHome)) throw bindingError('The runtime home must be absolute.')
  const canonicalPath = process.platform === 'win32'
    ? path.normalize(runtimeHome).toLowerCase()
    : path.normalize(runtimeHome)
  return createHash('sha256').update(`agent-assets-${runtime}\0${canonicalPath}`, 'utf8').digest('hex')
}

function isSameFile(before: Stats, after: Stats): boolean {
  return before.dev === after.dev && before.ino === after.ino && before.size === after.size
}

function realPathIsWithin(realRoot: string, candidate: string): boolean {
  const relative = path.relative(realRoot, candidate)
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}

function linkedExistingAncestor(absolutePath: string): boolean {
  const normalized = path.normalize(absolutePath)
  const parsed = path.parse(normalized)
  let cursor = parsed.root
  const relative = normalized.slice(parsed.root.length)
  for (const segment of relative.split(path.sep).filter(Boolean)) {
    cursor = path.join(cursor, segment)
    if (!existsSync(cursor)) break
    if (lstatSync(cursor).isSymbolicLink()) return true
  }
  return false
}

function safeReadBoundedFile(rootPath: string, segments: readonly string[], maximumBytes: number): SafeFileResult {
  if (!path.isAbsolute(rootPath)) return { state: 'unsafe-path', reason: 'root-not-absolute' }
  const root = path.normalize(rootPath)
  if (linkedExistingAncestor(root)) return { state: 'unsafe-path', reason: 'root-or-parent-link' }
  if (!existsSync(root)) return { state: 'absent' }
  try {
    const rootStat = lstatSync(root)
    if (rootStat.isSymbolicLink() || !rootStat.isDirectory()) {
      return { state: 'unsafe-path', reason: 'root-link-or-special' }
    }
    const realRoot = realpathSync.native(root)
    let cursor = root
    for (const segment of segments.slice(0, -1)) {
      if (!segment || segment === '.' || segment === '..' || segment.includes('/') || segment.includes('\\')) {
        return { state: 'unsafe-path', reason: 'unsafe-segment' }
      }
      cursor = path.join(cursor, segment)
      if (!existsSync(cursor)) return { state: 'absent' }
      const stat = lstatSync(cursor)
      if (stat.isSymbolicLink() || !stat.isDirectory()) {
        return { state: 'unsafe-path', reason: 'ancestor-link-or-special' }
      }
      if (!realPathIsWithin(realRoot, realpathSync.native(cursor))) {
        return { state: 'unsafe-path', reason: 'ancestor-escaped-root' }
      }
    }
    const finalSegment = segments.at(-1)
    if (!finalSegment || finalSegment === '.' || finalSegment === '..' || finalSegment.includes('/') || finalSegment.includes('\\')) {
      return { state: 'unsafe-path', reason: 'unsafe-segment' }
    }
    const filePath = path.join(cursor, finalSegment)
    if (!existsSync(filePath)) return { state: 'absent' }
    const before = lstatSync(filePath)
    if (before.isSymbolicLink() || !before.isFile() || before.size < 1 || before.size > maximumBytes) {
      return { state: 'unsafe-path', reason: 'file-link-special-or-unbounded' }
    }
    if (!realPathIsWithin(realRoot, realpathSync.native(filePath))) {
      return { state: 'unsafe-path', reason: 'file-escaped-root' }
    }
    const noFollow = process.platform === 'win32' ? 0 : (constants.O_NOFOLLOW ?? 0)
    const fd = openSync(filePath, constants.O_RDONLY | noFollow)
    try {
      const opened = fstatSync(fd)
      if (!opened.isFile() || !isSameFile(before, opened)) {
        return { state: 'unsafe-path', reason: 'file-changed-during-open' }
      }
      const bytes = readFileSync(fd)
      const after = lstatSync(filePath)
      if (!isSameFile(opened, after) || after.isSymbolicLink()) {
        return { state: 'unsafe-path', reason: 'file-changed-during-read' }
      }
      if (!realPathIsWithin(realRoot, realpathSync.native(filePath))) {
        return { state: 'unsafe-path', reason: 'file-escaped-after-read' }
      }
      return { state: 'ready', bytes }
    } finally {
      closeSync(fd)
    }
  } catch (error) {
    return { state: 'unsafe-path', reason: error instanceof Error ? error.name : 'read-failed' }
  }
}

function safeDirectoryEntries(rootPath: string, segments: readonly string[]): SafeDirectoryResult {
  if (!path.isAbsolute(rootPath)) return { state: 'unsafe-path', reason: 'root-not-absolute' }
  const root = path.normalize(rootPath)
  if (linkedExistingAncestor(root)) return { state: 'unsafe-path', reason: 'root-or-parent-link' }
  if (!existsSync(root)) return { state: 'absent' }
  try {
    const rootStat = lstatSync(root)
    if (rootStat.isSymbolicLink() || !rootStat.isDirectory()) {
      return { state: 'unsafe-path', reason: 'root-link-or-special' }
    }
    const realRoot = realpathSync.native(root)
    let cursor = root
    for (const segment of segments) {
      if (!segment || segment === '.' || segment === '..' || segment.includes('/') || segment.includes('\\')) {
        return { state: 'unsafe-path', reason: 'unsafe-segment' }
      }
      cursor = path.join(cursor, segment)
      if (!existsSync(cursor)) return { state: 'absent' }
      const stat = lstatSync(cursor)
      if (stat.isSymbolicLink() || !stat.isDirectory()) {
        return { state: 'unsafe-path', reason: 'directory-link-or-special' }
      }
      if (!realPathIsWithin(realRoot, realpathSync.native(cursor))) {
        return { state: 'unsafe-path', reason: 'directory-escaped-root' }
      }
    }
    const names = readdirSync(cursor)
    if (names.length > MAX_RECEIPT_ENTRIES) return { state: 'unsafe-path', reason: 'directory-unbounded' }
    return { state: 'ready', names }
  } catch (error) {
    return { state: 'unsafe-path', reason: error instanceof Error ? error.name : 'directory-read-failed' }
  }
}

function parseJson(bytes: Buffer, label: string): unknown {
  try {
    return JSON.parse(bytes.toString('utf8'))
  } catch {
    throw bindingError(`${label} is not valid JSON.`)
  }
}

function bindingReceiptBody(binding: RuntimeBindingV1): RuntimeBindingReceiptV1 {
  const { bindingReceiptSha256: _bindingReceiptSha256, ...receipt } = binding
  return receipt
}

function assertBindingReceiptMatches(binding: RuntimeBindingV1, receipt: RuntimeBindingReceiptV1, value: unknown): void {
  if (canonicalJsonSha256V1(value) !== binding.bindingReceiptSha256) {
    throw bindingError('Runtime binding receipt digest does not match the current pointer.')
  }
  if (canonicalJsonV1(receipt) !== canonicalJsonV1(bindingReceiptBody(binding))) {
    throw bindingError('Runtime binding current pointer and immutable receipt disagree.')
  }
}

function readActivationReceipt(
  assetRoot: string,
  binding: RuntimeBindingV1,
): ActivationReceiptV1 {
  const listed = safeDirectoryEntries(assetRoot, ['state', 'receipts'])
  if (listed.state !== 'ready') {
    if (listed.state === 'absent') throw bindingError('Activation receipt directory is missing.')
    throw new AgentAssetsError('link_unsafe_path', 'Activation receipt directory is link-unsafe.', {
      nextActions: ['Do not repair or overwrite the runtime binding until the unsafe path is resolved.'],
    })
  }
  let found: ActivationReceiptV1 | undefined
  for (const name of listed.names) {
    if (!name.endsWith('.json')) throw bindingError('Activation receipt directory contains an unknown entry.')
    const loaded = safeReadBoundedFile(assetRoot, ['state', 'receipts', name], MAX_BINDING_BYTES)
    if (loaded.state !== 'ready') {
      if (loaded.state === 'unsafe-path') {
        throw new AgentAssetsError('link_unsafe_path', 'Activation receipt path is link-unsafe.', {
          nextActions: ['Do not repair or overwrite the runtime binding until the unsafe path is resolved.'],
        })
      }
      throw bindingError('Activation receipt disappeared during inspection.')
    }
    const value = parseJson(loaded.bytes, 'ActivationReceiptV1')
    const receipt = parseActivationReceiptV1(value)
    if (receipt.receiptId !== binding.activationReceiptId) continue
    if (canonicalJsonSha256V1(value) !== binding.activationReceiptSha256) {
      throw bindingError('Runtime binding activation receipt digest does not match.')
    }
    if (found) throw bindingError('Multiple activation receipts claim the runtime binding activation id.')
    found = receipt
  }
  if (!found) throw bindingError('Runtime binding activation receipt was not found.')
  return found
}

function readStoreBinding(options: InspectRuntimeGatewayBindingOptions): StoreBindingRead {
  const current = safeReadBoundedFile(
    options.assetRoot,
    ['state', 'bindings', `${options.runtime}.json`],
    MAX_BINDING_BYTES,
  )
  if (current.state !== 'ready') return current
  try {
    const binding = parseRuntimeBindingV1(parseJson(current.bytes, 'RuntimeBindingV1'))
    const receiptFile = `${binding.bindingGeneration}-${binding.bindingReceiptId}.json`
    const receiptRead = safeReadBoundedFile(
      options.assetRoot,
      ['state', 'bindings', 'receipts', options.runtime, receiptFile],
      MAX_BINDING_BYTES,
    )
    if (receiptRead.state === 'unsafe-path') return receiptRead
    if (receiptRead.state === 'absent') throw bindingError('Immutable runtime binding receipt is missing.')
    const receiptValue = parseJson(receiptRead.bytes, 'RuntimeBindingReceiptV1')
    const receipt = parseRuntimeBindingReceiptV1(receiptValue)
    assertBindingReceiptMatches(binding, receipt, receiptValue)

    const authorityRead = safeReadBoundedFile(options.assetRoot, ['state', 'store-authority.json'], MAX_BINDING_BYTES)
    if (authorityRead.state === 'unsafe-path') return authorityRead
    if (authorityRead.state === 'absent') throw bindingError('Store authority is missing for a runtime binding.')
    const authority = parseStoreAuthorityV1(parseJson(authorityRead.bytes, 'StoreAuthorityV1'))
    if (options.authority && canonicalJsonV1(options.authority) !== canonicalJsonV1(authority)) {
      throw bindingError('Supplied authority context disagrees with the on-disk store authority.')
    }
    if (binding.storeId !== authority.storeId) throw bindingError('Runtime binding belongs to another store.')
    if (
      binding.authorityRevision > authority.authorityRevision
      || binding.writerFenceEpoch > authority.lastIssuedFenceEpoch
    ) {
      throw bindingError('Runtime binding claims a future authority or writer fence.')
    }
    const activation = readActivationReceipt(options.assetRoot, binding)
    if (activation.storeId !== authority.storeId) throw bindingError('Runtime binding activation receipt belongs to another store.')
    if (
      activation.authorityRevision > authority.authorityRevision
      || activation.writerFenceEpoch > authority.lastIssuedFenceEpoch
    ) {
      throw bindingError('Runtime binding activation receipt claims a future authority or writer fence.')
    }
    return { state: 'ready', binding }
  } catch (error) {
    if (error instanceof AgentAssetsError && error.code === 'link_unsafe_path') {
      return { state: 'unsafe-path', reason: error.message }
    }
    return { state: 'invalid', reason: error instanceof Error ? error.message : 'invalid-binding' }
  }
}

function markerMatchesBinding(marker: RuntimeGatewayOwnerMarkerV1, binding: RuntimeBindingV1): boolean {
  return marker.storeId === binding.storeId
    && marker.runtime === binding.runtime
    && marker.bindingId === binding.bindingId
    && marker.bindingGeneration === binding.bindingGeneration
    && marker.relativePath === binding.relativePath
    && marker.contentSha256 === binding.contentSha256
}

export function inspectRuntimeGatewayBinding(
  options: InspectRuntimeGatewayBindingOptions,
): RuntimeBindingInspectionV1 {
  const runtimeHomeId = agentAssetsRuntimeHomeId(options.runtime, options.runtimeHome)
  const store = readStoreBinding(options)
  const markerRead = safeReadBoundedFile(
    options.runtimeHome,
    ['skills', 'aops', '.aops-gateway-owner.json'],
    MAX_BINDING_BYTES,
  )
  const gatewayRead = safeReadBoundedFile(
    options.runtimeHome,
    ['skills', 'aops', 'SKILL.md'],
    MAX_GATEWAY_BYTES,
  )

  let marker: RuntimeGatewayOwnerMarkerV1 | undefined
  let ownerMarker: RuntimeBindingInspectionV1['ownerMarker']
  if (markerRead.state === 'ready') {
    try {
      marker = parseRuntimeGatewayOwnerMarkerV1(parseJson(markerRead.bytes, 'RuntimeGatewayOwnerMarkerV1'))
      ownerMarker = 'ready'
    } catch {
      ownerMarker = 'invalid'
    }
  } else {
    ownerMarker = markerRead.state
  }

  const gatewayContentSha256 = gatewayRead.state === 'ready' ? sha256Bytes(gatewayRead.bytes) : undefined
  const gateway = gatewayRead.state === 'ready'
    ? gatewayRead.bytes.equals(Buffer.from(AOPS_AGENT_ASSETS_GATEWAY, 'utf8'))
      && gatewayContentSha256 === AOPS_AGENT_ASSETS_GATEWAY_SHA256
      ? 'canonical'
      : 'tampered'
    : gatewayRead.state

  const reasons: RuntimeBindingInspectionReason[] = []
  if (store.state !== 'ready') reasons.push(`store-binding-${store.state === 'unsafe-path' ? 'unsafe' : store.state}`)
  if (ownerMarker !== 'ready') reasons.push(`owner-marker-${ownerMarker === 'unsafe-path' ? 'unsafe' : ownerMarker}`)
  if (gateway !== 'canonical') reasons.push(`gateway-${gateway === 'unsafe-path' ? 'unsafe' : gateway}`)

  let bindingProof: RuntimeBindingProofStateV1 = store.state === 'ready' ? 'verified' : store.state
  let runtimeRootIdentityEvidence: RuntimeRootIdentityEvidenceV1 = 'unavailable'
  const bindingUsesCurrentGateway = store.state === 'ready'
    && store.binding.contentSha256 === AOPS_AGENT_ASSETS_GATEWAY_SHA256
  if (store.state === 'ready' && !bindingUsesCurrentGateway) reasons.push('binding-content-outdated')
  if (store.state === 'ready') {
    const binding = store.binding
    const contextMatches = binding.runtime === options.runtime
      && binding.runtimeHomeId === runtimeHomeId
    if (!contextMatches) {
      bindingProof = 'invalid'
      reasons.push('binding-context-mismatch')
    }
    if (options.expectedRuntimeRootIdentitySha256 === undefined) {
      runtimeRootIdentityEvidence = 'recorded-not-live-verified'
    } else if (binding.runtimeRootIdentitySha256 === options.expectedRuntimeRootIdentitySha256) {
      runtimeRootIdentityEvidence = 'native-qualified-match'
    } else {
      runtimeRootIdentityEvidence = 'native-qualified-mismatch'
      bindingProof = 'invalid'
      reasons.push('binding-context-mismatch')
    }
  }

  let ownerMarkerProof: RuntimeOwnerMarkerProofStateV1
  if (ownerMarker === 'absent') ownerMarkerProof = 'absent'
  else if (ownerMarker === 'unsafe-path') ownerMarkerProof = 'unsafe-path'
  else if (ownerMarker === 'invalid') ownerMarkerProof = 'mismatch'
  else if (store.state !== 'ready' || bindingProof !== 'verified' || !marker || markerRead.state !== 'ready') {
    ownerMarkerProof = 'unavailable'
  } else if (
    sha256Bytes(markerRead.bytes) === store.binding.ownerMarkerSha256
    && markerMatchesBinding(marker, store.binding)
  ) {
    ownerMarkerProof = 'verified'
  } else {
    ownerMarkerProof = 'mismatch'
  }
  if (ownerMarker === 'ready' && ownerMarkerProof !== 'verified') reasons.push('binding-marker-mismatch')

  const coherent = bindingProof === 'verified'
    && ownerMarkerProof === 'verified'
    && bindingUsesCurrentGateway
    && gateway === 'canonical'

  const unsafe = store.state === 'unsafe-path' || ownerMarker === 'unsafe-path' || gateway === 'unsafe-path'
  const immutableManagedDrift = bindingProof === 'verified' && (
    (ownerMarkerProof === 'verified'
      && (gateway === 'absent' || gateway === 'tampered' || !bindingUsesCurrentGateway))
    || (ownerMarkerProof === 'absent' && (gateway === 'absent' || gateway === 'canonical'))
  )
  let state: RuntimeBindingInspectionState
  if (unsafe) {
    state = 'unsafe-path'
  } else if (coherent) {
    state = 'ready'
  } else if (immutableManagedDrift) {
    state = 'managed-drift'
  } else if (store.state === 'absent' && ownerMarker === 'absent' && gateway === 'absent') {
    state = 'absent'
  } else {
    state = 'ownership-conflict'
  }

  return Object.freeze({
    schemaVersion: 1,
    runtime: options.runtime,
    state,
    managed: state === 'ready' || state === 'managed-drift',
    runtimeHomeId,
    gatewayRelativePath: AOPS_AGENT_ASSETS_GATEWAY_RELATIVE_PATH,
    ownerMarkerRelativePath: 'skills/aops/.aops-gateway-owner.json',
    storeBinding: store.state,
    bindingProof,
    ownerMarker,
    ownerMarkerProof,
    gateway,
    ...(gatewayContentSha256 ? { gatewayContentSha256 } : {}),
    runtimeRootIdentityEvidence,
    reasons: Object.freeze([...new Set(reasons)]),
  })
}

export function inspectRuntimeGatewayBindings(options: Readonly<{
  assetRoot: string
  runtimeHomes: Readonly<Record<Runtime, string>>
  expectedRuntimeRootIdentitySha256?: Readonly<Partial<Record<Runtime, string>>>
  authority?: StoreAuthorityV1
}>): Readonly<Record<Runtime, RuntimeBindingInspectionV1>> {
  const inspect = (runtime: Runtime): RuntimeBindingInspectionV1 => inspectRuntimeGatewayBinding({
    assetRoot: options.assetRoot,
    runtime,
    runtimeHome: options.runtimeHomes[runtime],
    ...(options.expectedRuntimeRootIdentitySha256?.[runtime]
      ? { expectedRuntimeRootIdentitySha256: options.expectedRuntimeRootIdentitySha256[runtime] }
      : {}),
    ...(options.authority ? { authority: options.authority } : {}),
  })
  return Object.freeze({ codex: inspect('codex'), claude: inspect('claude') })
}
