import { createHash, randomUUID } from 'node:crypto'
import {
  closeSync,
  constants,
  fstatSync,
  fsyncSync,
  ftruncateSync,
  lstatSync,
  mkdirSync,
  openSync,
  readSync,
  realpathSync,
  readdirSync,
  writeSync,
  type BigIntStats,
  type Stats,
} from 'node:fs'
import path from 'node:path'

import type { CommunityInstallPaths, CommunityInstallState } from './community-lifecycle.js'
import type { CommunityOperation, CommunityOperationLockReceipt } from './community-operation-lock.js'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const SHA256 = /^sha256:[a-f0-9]{64}$/
const STEP = /^[a-z0-9][a-z0-9-]{0,95}$/
const MAX_FRAME_BYTES = 65_536
const MAX_JOURNAL_BYTES = 1_048_576
const MAX_JOURNAL_FILES = 2_048
const ZERO_HASH = `sha256:${'0'.repeat(64)}`

export type CommunityOperationJournalStatus = 'running' | 'aborted' | 'failed' | 'succeeded' | 'reconciled'
export type CommunityOperationJournalPhase =
  | 'prepared'
  | 'side-effect-before'
  | 'side-effect-after'
  | 'promotion-before'
  | 'promotion-after'
  | 'terminal'

export type CommunityOperationJournalDigestSet = Readonly<{
  state: string | null
  env: string | null
  ledger: string | null
}>

export type CommunityOperationReconciliationAction =
  | 'acknowledge-no-side-effect'
  | 'acknowledge-native-runtime-state'
  | 'restore-source-runtime'
  | 'acknowledge-artifact-preserved'
  | 'acknowledge-partial-install-preserved'
  | 'complete-reset-preserving-volumes'
  | 'complete-native-reset-preserving-volume'

export type CommunityOperationJournalRecord = Readonly<{
  schemaVersion: 1
  runtimeMode: 'oci' | 'native'
  id: string
  operation: CommunityOperation
  status: CommunityOperationJournalStatus
  phase: CommunityOperationJournalPhase
  step: string
  sequence: number
  createdAt: string
  updatedAt: string
  receipt: CommunityOperationLockReceipt
  preDigests: CommunityOperationJournalDigestSet
  postDigests: CommunityOperationJournalDigestSet | null
  sourceState: CommunityInstallState | null
  permittedActions: readonly CommunityOperationReconciliationAction[]
  outcome?: 'aborted' | 'operation-failed' | 'completed' | 'operator-reconciled'
}>

type JournalFrame = Readonly<{
  sequence: number
  prevHash: string
  recordHash: string
  record: CommunityOperationJournalRecord
}>

export type CommunityOperationJournalInspection = Readonly<{
  path: string
  integrity: 'complete' | 'partial-tail' | 'corrupt-tail'
  validBytes: number
  fileSha256: string
  lastHash: string
  lastRunningPhase: CommunityOperationJournalPhase
  lastRunningStep: string
  record: CommunityOperationJournalRecord
}>

export type CommunityOperationJournalHandle = Readonly<{
  path: string
  record: () => CommunityOperationJournalRecord
  assertOwned: () => void
  transition: (phase: CommunityOperationJournalPhase, step: string) => CommunityOperationJournalRecord
  finish: (status: Extract<CommunityOperationJournalStatus, 'aborted' | 'failed' | 'succeeded' | 'reconciled'>,
    outcome: NonNullable<CommunityOperationJournalRecord['outcome']>,
    postDigests?: CommunityOperationJournalDigestSet) => CommunityOperationJournalRecord
  close: () => void
}>

function digest(content: string | Buffer): string {
  return `sha256:${createHash('sha256').update(content).digest('hex')}`
}

function isErrno(error: unknown, code: string): boolean {
  return (error as NodeJS.ErrnoException | undefined)?.code === code
}

function samePath(left: string, right: string): boolean {
  return path.relative(left, right) === '' && path.relative(right, left) === ''
}

function tryLstat(candidate: string) {
  try {
    return lstatSync(candidate)
  } catch (error) {
    if (isErrno(error, 'ENOENT')) return undefined
    throw error
  }
}

function ensureCanonicalDirectoryChain(target: string): string {
  const resolved = path.resolve(target)
  const missing: string[] = []
  let ancestor = resolved
  let stat = tryLstat(ancestor)
  while (!stat) {
    const parent = path.dirname(ancestor)
    if (samePath(parent, ancestor)) throw new Error('community_operation_journal_parent_missing')
    missing.unshift(path.basename(ancestor))
    ancestor = parent
    stat = tryLstat(ancestor)
  }
  if (stat.isSymbolicLink() || !stat.isDirectory() || !samePath(ancestor, realpathSync.native(ancestor))) {
    throw new Error('community_operation_journal_parent_unsafe')
  }
  let current = ancestor
  for (const segment of missing) {
    const next = path.join(current, segment)
    if (!samePath(path.dirname(next), current)) throw new Error('community_operation_journal_path_escape')
    try {
      mkdirSync(next, { mode: 0o700 })
    } catch (error) {
      if (!isErrno(error, 'EEXIST')) throw error
    }
    const nextStat = lstatSync(next)
    if (nextStat.isSymbolicLink() || !nextStat.isDirectory() ||
        !samePath(next, realpathSync.native(next)) || !samePath(path.dirname(next), current)) {
      throw new Error('community_operation_journal_directory_unsafe')
    }
    current = next
  }
  return current
}

function assertCanonicalJournalDirectory(target: string): string {
  const resolved = path.resolve(target)
  const stat = lstatSync(resolved)
  if (stat.isSymbolicLink() || !stat.isDirectory() || !samePath(resolved, realpathSync.native(resolved))) {
    throw new Error('community_operation_journal_directory_unsafe')
  }
  return resolved
}

function sameIdentity(
  left: Pick<Stats, 'dev' | 'ino'> | Pick<BigIntStats, 'dev' | 'ino'>,
  right: Pick<Stats, 'dev' | 'ino'> | Pick<BigIntStats, 'dev' | 'ino'>,
): boolean {
  return String(left.dev) === String(right.dev) && String(left.ino) === String(right.ino)
}

function readBoundRegularFile(filePath: string, maxBytes: number, errorCode: string): Buffer {
  const resolved = path.resolve(filePath)
  const parent = path.dirname(resolved)
  const parentStat = lstatSync(parent, { bigint: true })
  if (parentStat.isSymbolicLink() || !parentStat.isDirectory() || !samePath(parent, realpathSync.native(parent))) {
    throw new Error(errorCode)
  }
  const visibleBefore = lstatSync(resolved, { bigint: true })
  if (visibleBefore.isSymbolicLink() || !visibleBefore.isFile() || visibleBefore.nlink !== 1n ||
      visibleBefore.size > BigInt(maxBytes) || !samePath(resolved, realpathSync.native(resolved))) {
    throw new Error(errorCode)
  }
  const noFollow = typeof constants.O_NOFOLLOW === 'number' ? constants.O_NOFOLLOW : 0
  const fd = openSync(resolved, constants.O_RDONLY | noFollow)
  try {
    const heldBefore = fstatSync(fd, { bigint: true })
    if (!heldBefore.isFile() || heldBefore.nlink !== 1n || heldBefore.size !== visibleBefore.size ||
        !sameIdentity(heldBefore, visibleBefore)) {
      throw new Error(errorCode)
    }
    const byteLength = Number(heldBefore.size)
    if (!Number.isSafeInteger(byteLength)) throw new Error(errorCode)
    const content = Buffer.alloc(byteLength)
    let offset = 0
    while (offset < content.byteLength) {
      const count = readSync(fd, content, offset, content.byteLength - offset, offset)
      if (count <= 0) throw new Error(errorCode)
      offset += count
    }
    const heldAfter = fstatSync(fd, { bigint: true })
    const visibleAfter = lstatSync(resolved, { bigint: true })
    const parentAfter = lstatSync(parent, { bigint: true })
    if (!heldAfter.isFile() || heldAfter.nlink !== 1n || heldAfter.size !== heldBefore.size ||
        heldAfter.mtimeNs !== heldBefore.mtimeNs || heldAfter.ctimeNs !== heldBefore.ctimeNs ||
        !sameIdentity(heldAfter, heldBefore) || visibleAfter.isSymbolicLink() || !visibleAfter.isFile() ||
        visibleAfter.nlink !== 1n || visibleAfter.size !== heldBefore.size ||
        visibleAfter.mtimeNs !== heldBefore.mtimeNs || visibleAfter.ctimeNs !== heldBefore.ctimeNs ||
        !sameIdentity(visibleAfter, heldBefore) ||
        !parentAfter.isDirectory() || parentAfter.isSymbolicLink() || !sameIdentity(parentAfter, parentStat) ||
        !samePath(parent, realpathSync.native(parent))) {
      throw new Error(errorCode)
    }
    return content
  } finally {
    closeSync(fd)
  }
}

function digestOwnedFile(filePath: string): string | null {
  if (!tryLstat(filePath)) return null
  return digest(readBoundRegularFile(filePath, 8_388_608, 'community_operation_journal_digest_source_unsafe'))
}

export function captureCommunityOperationDigests(paths: CommunityInstallPaths): CommunityOperationJournalDigestSet {
  return Object.freeze({
    state: digestOwnedFile(paths.statePath),
    env: digestOwnedFile(paths.envPath),
    ledger: digestOwnedFile(paths.ledgerPath),
  })
}

function assertDigestSet(value: unknown): asserts value is CommunityOperationJournalDigestSet {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      JSON.stringify(Object.keys(value).sort()) !== JSON.stringify(['env', 'ledger', 'state'])) {
    throw new Error('community_operation_journal_record_invalid')
  }
  for (const entry of Object.values(value)) {
    if (entry !== null && (typeof entry !== 'string' || !SHA256.test(entry))) {
      throw new Error('community_operation_journal_record_invalid')
    }
  }
}

function assertIso(value: unknown): asserts value is string {
  if (typeof value !== 'string' || new Date(value).toISOString() !== value) {
    throw new Error('community_operation_journal_record_invalid')
  }
}

function assertInstalledRelease(value: unknown): void {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('community_operation_journal_record_invalid')
  }
  const release = value as CommunityInstallState['activeRelease']
  const keys = [
    'composePath', 'composeSha256', 'imageIndexDigest', 'imageRef', 'manifestPath', 'manifestSha256',
    'migrationSetDigest', 'migrationTags', 'releaseVersion',
  ]
  if (JSON.stringify(Object.keys(value).sort()) !== JSON.stringify(keys) ||
      typeof release.releaseVersion !== 'string' || release.releaseVersion.length < 1 || release.releaseVersion.length > 128 ||
      typeof release.imageRef !== 'string' || !/@sha256:[a-f0-9]{64}$/.test(release.imageRef) ||
      !SHA256.test(release.imageIndexDigest) || !SHA256.test(release.manifestSha256) ||
      !SHA256.test(release.composeSha256) || !SHA256.test(release.migrationSetDigest) ||
      !Array.isArray(release.migrationTags) || release.migrationTags.some((tag) => typeof tag !== 'string' || tag.length > 128) ||
      typeof release.manifestPath !== 'string' || !path.isAbsolute(release.manifestPath) ||
      typeof release.composePath !== 'string' || !path.isAbsolute(release.composePath)) {
    throw new Error('community_operation_journal_record_invalid')
  }
}

function assertSourceState(value: unknown): asserts value is CommunityInstallState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('community_operation_journal_record_invalid')
  }
  const state = value as CommunityInstallState
  const keys = [
    'activeRelease', 'composeProjectName', 'createdAt', 'installId', 'instanceName', 'lastSuccessfulUpdateId',
    'postgresVolumeName', 'previousRelease', 'schemaVersion', 'updatedAt',
  ]
  if (JSON.stringify(Object.keys(value).sort()) !== JSON.stringify(keys) || state.schemaVersion !== 1 ||
      !/^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$/.test(state.instanceName) || !UUID.test(state.installId) ||
      state.composeProjectName !== `aops-community-${state.installId.replace(/-/g, '').slice(0, 12)}` ||
      typeof state.postgresVolumeName !== 'string' || !/^[a-z0-9][a-z0-9-]{0,179}$/.test(state.postgresVolumeName) ||
      (state.lastSuccessfulUpdateId !== null && !UUID.test(state.lastSuccessfulUpdateId))) {
    throw new Error('community_operation_journal_record_invalid')
  }
  assertIso(state.createdAt)
  assertIso(state.updatedAt)
  assertInstalledRelease(state.activeRelease)
  if (state.previousRelease !== null) assertInstalledRelease(state.previousRelease)
}

function deepFreeze<T>(value: T, seen = new WeakSet<object>()): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    if (seen.has(value)) return value
    seen.add(value)
    for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested, seen)
    Object.freeze(value)
  }
  return value
}

function assertRecord(value: unknown): asserts value is CommunityOperationJournalRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('community_operation_journal_record_invalid')
  }
  const record = value as Partial<CommunityOperationJournalRecord>
  const allowedKeys = [
    'createdAt', 'id', 'operation', 'outcome', 'permittedActions', 'phase', 'postDigests', 'preDigests',
    'receipt', 'runtimeMode', 'schemaVersion', 'sequence', 'sourceState', 'status', 'step', 'updatedAt',
  ]
  if (Object.keys(value).some((key) => !allowedKeys.includes(key)) || record.schemaVersion !== 1 ||
      !['oci', 'native'].includes(String(record.runtimeMode)) ||
      typeof record.id !== 'string' || !UUID.test(record.id) ||
      !['setup', 'update', 'recover', 'rollback', 'start', 'stop', 'restart', 'backup', 'restore', 'reset'].includes(String(record.operation)) ||
      !['running', 'aborted', 'failed', 'succeeded', 'reconciled'].includes(String(record.status)) ||
      !['prepared', 'side-effect-before', 'side-effect-after', 'promotion-before', 'promotion-after', 'terminal'].includes(String(record.phase)) ||
      typeof record.step !== 'string' || !STEP.test(record.step) ||
      !Number.isSafeInteger(record.sequence) || Number(record.sequence) < 0 ||
      !record.receipt || typeof record.receipt !== 'object' ||
      !Array.isArray(record.permittedActions) || record.permittedActions.some((action) =>
        !['acknowledge-no-side-effect', 'acknowledge-native-runtime-state', 'restore-source-runtime',
          'acknowledge-artifact-preserved', 'acknowledge-partial-install-preserved',
          'complete-reset-preserving-volumes', 'complete-native-reset-preserving-volume'].includes(action))) {
    throw new Error('community_operation_journal_record_invalid')
  }
  assertIso(record.createdAt)
  assertIso(record.updatedAt)
  assertDigestSet(record.preDigests)
  if (record.postDigests !== null) assertDigestSet(record.postDigests)
  if (record.receipt.operation !== record.operation || record.receipt.schemaVersion !== 2 ||
      !Number.isSafeInteger(record.receipt.pid) || Number(record.receipt.pid) <= 0 ||
      typeof record.receipt.ownerTokenSha256 !== 'string' || !SHA256.test(record.receipt.ownerTokenSha256) ||
      typeof record.receipt.processStartIdentity !== 'string' || !SHA256.test(record.receipt.processStartIdentity)) {
    throw new Error('community_operation_journal_record_invalid')
  }
  assertIso(record.receipt.startedAt)
  if (record.runtimeMode === 'native' && record.sourceState !== null) {
    throw new Error('community_operation_journal_record_invalid')
  }
  if (record.runtimeMode === 'oci' && record.sourceState !== null) assertSourceState(record.sourceState)
  if (record.outcome !== undefined && !['aborted', 'operation-failed', 'completed', 'operator-reconciled'].includes(record.outcome)) {
    throw new Error('community_operation_journal_record_invalid')
  }
}

function frameHash(sequence: number, prevHash: string, record: CommunityOperationJournalRecord): string {
  return digest(`${sequence}\0${prevHash}\0${JSON.stringify(record)}`)
}

function encodeFrame(record: CommunityOperationJournalRecord, prevHash: string): { content: Buffer; hash: string } {
  const recordHash = frameHash(record.sequence, prevHash, record)
  const body = Buffer.from(JSON.stringify({ sequence: record.sequence, prevHash, recordHash, record } satisfies JournalFrame), 'utf8')
  if (body.byteLength > MAX_FRAME_BYTES) throw new Error('community_operation_journal_frame_too_large')
  const content = Buffer.concat([Buffer.from(body.byteLength.toString(16).padStart(8, '0') + ':', 'ascii'), body, Buffer.from('\n')])
  return { content, hash: recordHash }
}

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

function assertTerminalRecord(record: CommunityOperationJournalRecord): void {
  const expected = record.status === 'succeeded'
    ? { step: 'succeeded', outcome: 'completed', post: true }
    : record.status === 'reconciled'
      ? { step: 'reconciled', outcome: 'operator-reconciled', post: true }
      : record.status === 'aborted'
        ? { step: 'aborted', outcome: 'aborted', post: false }
        : record.status === 'failed'
          ? { step: 'failed', outcome: 'operation-failed', post: false }
          : undefined
  if (!expected || record.phase !== 'terminal' || record.step !== expected.step ||
      record.outcome !== expected.outcome || (record.postDigests !== null) !== expected.post) {
    throw new Error('community_operation_journal_semantic_chain_invalid')
  }
}

function assertInitialRecord(record: CommunityOperationJournalRecord): void {
  if (record.sequence !== 0 || record.status !== 'running' || record.phase !== 'prepared' ||
      record.step !== 'prepared' || record.outcome !== undefined || record.postDigests !== null ||
      record.updatedAt !== record.createdAt ||
      !sameJson(record.permittedActions, permittedActions(record.operation, record.sourceState, record.runtimeMode))) {
    throw new Error('community_operation_journal_semantic_chain_invalid')
  }
}

function assertSemanticTransition(
  previous: CommunityOperationJournalRecord,
  next: CommunityOperationJournalRecord,
): void {
  for (const key of ['id', 'operation', 'runtimeMode', 'createdAt', 'receipt', 'preDigests', 'sourceState', 'permittedActions'] as const) {
    if (!sameJson(previous[key], next[key])) throw new Error('community_operation_journal_semantic_chain_invalid')
  }
  if (next.sequence !== previous.sequence + 1 || Date.parse(next.updatedAt) < Date.parse(previous.updatedAt)) {
    throw new Error('community_operation_journal_semantic_chain_invalid')
  }
  if (previous.status === 'succeeded' || previous.status === 'reconciled') {
    throw new Error('community_operation_journal_semantic_chain_invalid')
  }
  if (next.status === 'reconciled') {
    if (!['running', 'aborted', 'failed'].includes(previous.status)) {
      throw new Error('community_operation_journal_semantic_chain_invalid')
    }
    assertTerminalRecord(next)
    return
  }
  if (previous.status !== 'running') throw new Error('community_operation_journal_semantic_chain_invalid')
  if (next.status !== 'running') {
    assertTerminalRecord(next)
    return
  }
  if (next.outcome !== undefined || next.postDigests !== null || next.phase === 'terminal') {
    throw new Error('community_operation_journal_semantic_chain_invalid')
  }
  const valid = (
    (previous.phase === 'prepared' || previous.phase === 'side-effect-after' || previous.phase === 'promotion-after') &&
      (next.phase === 'side-effect-before' || next.phase === 'promotion-before')
  ) || (previous.phase === 'side-effect-before' && next.phase === 'side-effect-after' && previous.step === next.step) ||
    (previous.phase === 'promotion-before' && next.phase === 'promotion-after' && previous.step === next.step)
  if (!valid) throw new Error('community_operation_journal_semantic_chain_invalid')
}

function parseJournalBuffer(content: Buffer, journalPath: string): CommunityOperationJournalInspection {
  if (content.byteLength === 0 || content.byteLength > MAX_JOURNAL_BYTES) {
    throw new Error('community_operation_journal_invalid')
  }
  let offset = 0
  let validBytes = 0
  let expectedSequence = 0
  let expectedPrevHash = ZERO_HASH
  let latest: CommunityOperationJournalRecord | undefined
  let previous: CommunityOperationJournalRecord | undefined
  let lastRunning: CommunityOperationJournalRecord | undefined
  let integrity: CommunityOperationJournalInspection['integrity'] = 'complete'
  while (offset < content.byteLength) {
    if (content.byteLength - offset < 9) {
      integrity = 'partial-tail'
      break
    }
    const header = content.subarray(offset, offset + 9).toString('ascii')
    if (!/^[a-f0-9]{8}:$/.test(header)) {
      integrity = 'corrupt-tail'
      break
    }
    const length = Number.parseInt(header.slice(0, 8), 16)
    if (length < 2 || length > MAX_FRAME_BYTES) {
      integrity = 'corrupt-tail'
      break
    }
    const frameEnd = offset + 9 + length
    if (frameEnd >= content.byteLength) {
      integrity = 'partial-tail'
      break
    }
    if (content[frameEnd] !== 0x0a) {
      integrity = 'corrupt-tail'
      break
    }
    let frame: JournalFrame
    try {
      frame = JSON.parse(content.subarray(offset + 9, frameEnd).toString('utf8')) as JournalFrame
      assertRecord(frame.record)
    } catch {
      integrity = 'corrupt-tail'
      break
    }
    if (frame.sequence !== expectedSequence || frame.record.sequence !== expectedSequence ||
        frame.prevHash !== expectedPrevHash || frame.recordHash !== frameHash(frame.sequence, frame.prevHash, frame.record)) {
      integrity = 'corrupt-tail'
      break
    }
    try {
      if (previous) assertSemanticTransition(previous, frame.record)
      else assertInitialRecord(frame.record)
    } catch {
      integrity = 'corrupt-tail'
      break
    }
    latest = deepFreeze(frame.record)
    previous = latest
    if (latest.status === 'running') lastRunning = latest
    expectedPrevHash = frame.recordHash
    expectedSequence += 1
    offset = frameEnd + 1
    validBytes = offset
  }
  if (!latest || !lastRunning || path.basename(journalPath) !== `${latest.id}.json`) {
    throw new Error('community_operation_journal_invalid')
  }
  return Object.freeze({
    path: journalPath,
    integrity,
    validBytes,
    fileSha256: digest(content),
    lastHash: expectedPrevHash,
    lastRunningPhase: lastRunning.phase,
    lastRunningStep: lastRunning.step,
    record: latest,
  })
}

function assertJournalFile(pathname: string, expectedParent: string) {
  const stat = lstatSync(pathname)
  if (stat.isSymbolicLink() || !stat.isFile() || stat.nlink !== 1 || stat.size > MAX_JOURNAL_BYTES ||
      !samePath(path.dirname(path.resolve(pathname)), expectedParent) || !samePath(path.resolve(pathname), realpathSync.native(pathname))) {
    throw new Error('community_operation_journal_file_unsafe')
  }
  return stat
}

export function inspectCommunityOperationJournalFile(
  paths: CommunityInstallPaths,
  operationId: string,
): CommunityOperationJournalInspection {
  if (!UUID.test(operationId)) throw new Error('community_operation_journal_id_invalid')
  const journalRoot = assertCanonicalJournalDirectory(paths.operationJournalRoot)
  const rootBefore = lstatSync(journalRoot)
  const journalPath = path.join(journalRoot, `${operationId}.json`)
  assertJournalFile(journalPath, journalRoot)
  const inspection = parseJournalBuffer(
    readBoundRegularFile(journalPath, MAX_JOURNAL_BYTES, 'community_operation_journal_file_unsafe'),
    journalPath,
  )
  const rootAfter = lstatSync(journalRoot)
  if (!rootAfter.isDirectory() || rootAfter.isSymbolicLink() || !sameIdentity(rootBefore, rootAfter) ||
      !samePath(journalRoot, realpathSync.native(journalRoot))) {
    throw new Error('community_operation_journal_directory_unsafe')
  }
  return inspection
}

function permittedActions(
  operation: CommunityOperation,
  sourceState: CommunityInstallState | null,
  runtimeMode: 'oci' | 'native',
): CommunityOperationReconciliationAction[] {
  if (runtimeMode === 'native') {
    return ['acknowledge-no-side-effect', 'acknowledge-native-runtime-state', 'complete-native-reset-preserving-volume']
  }
  if (operation === 'setup') {
    return sourceState
      ? ['acknowledge-no-side-effect', 'restore-source-runtime']
      : ['acknowledge-no-side-effect', 'acknowledge-partial-install-preserved', 'complete-reset-preserving-volumes']
  }
  if (operation === 'backup') return ['acknowledge-no-side-effect', 'acknowledge-artifact-preserved']
  if (operation === 'reset') return ['acknowledge-no-side-effect', 'complete-reset-preserving-volumes']
  return sourceState ? ['acknowledge-no-side-effect', 'restore-source-runtime'] : ['acknowledge-no-side-effect']
}

function fsyncDirectoryEntry(directory: string): void {
  let fd: number | undefined
  try {
    fd = openSync(directory, constants.O_RDONLY)
    fsyncSync(fd)
  } catch (error) {
    const code = String((error as NodeJS.ErrnoException)?.code ?? '')
    if (process.platform !== 'win32' || !['EACCES', 'EINVAL', 'EPERM'].includes(code)) throw error
  } finally {
    if (fd !== undefined) closeSync(fd)
  }
}

function createHandle(params: {
  fd: number
  journalPath: string
  journalRoot: string
  initial: CommunityOperationJournalRecord
  initialHash: string
  initialSize: number
  allowReconcile?: boolean
  rootOriginal: BigIntStats
  parentOriginal: BigIntStats
}): CommunityOperationJournalHandle {
  let current = params.initial
  let currentHash = params.initialHash
  let currentSize = params.initialSize
  let closed = false
  const original = fstatSync(params.fd, { bigint: true })
  let baseline = original
  const rootOriginal = params.rootOriginal
  const journalParent = path.dirname(params.journalRoot)
  const parentOriginal = params.parentOriginal

  const assertOwned = () => {
    if (closed) throw new Error('community_operation_journal_handle_closed')
    assertJournalFile(params.journalPath, params.journalRoot)
    const held = fstatSync(params.fd, { bigint: true })
    const visible = lstatSync(params.journalPath, { bigint: true })
    const root = lstatSync(params.journalRoot, { bigint: true })
    const parent = lstatSync(journalParent, { bigint: true })
    if (!held.isFile() || held.nlink !== 1n || !sameIdentity(held, original) || held.size !== BigInt(currentSize) ||
        held.mtimeNs !== baseline.mtimeNs || held.ctimeNs !== baseline.ctimeNs ||
        visible.isSymbolicLink() || !visible.isFile() || visible.nlink !== 1n || !sameIdentity(visible, original) ||
        visible.size !== held.size || visible.mtimeNs !== held.mtimeNs || visible.ctimeNs !== held.ctimeNs ||
        root.isSymbolicLink() || !root.isDirectory() || !sameIdentity(root, rootOriginal) ||
        root.mtimeNs !== rootOriginal.mtimeNs || root.ctimeNs !== rootOriginal.ctimeNs ||
        parent.isSymbolicLink() || !parent.isDirectory() || !sameIdentity(parent, parentOriginal) ||
        !samePath(params.journalRoot, realpathSync.native(params.journalRoot))) {
      throw new Error('community_operation_journal_path_identity_changed')
    }
  }

  const append = (next: CommunityOperationJournalRecord) => {
    assertOwned()
    const encoded = encodeFrame(next, currentHash)
    if (currentSize + encoded.content.byteLength > MAX_JOURNAL_BYTES) {
      throw new Error('community_operation_journal_size_limit')
    }
    const written = writeSync(params.fd, encoded.content, 0, encoded.content.byteLength, currentSize)
    if (written !== encoded.content.byteLength) throw new Error('community_operation_journal_short_write')
    fsyncSync(params.fd)
    const nextSize = currentSize + written
    assertJournalFile(params.journalPath, params.journalRoot)
    const heldAfter = fstatSync(params.fd, { bigint: true })
    const visibleAfter = lstatSync(params.journalPath, { bigint: true })
    const rootAfter = lstatSync(params.journalRoot, { bigint: true })
    const parentAfter = lstatSync(journalParent, { bigint: true })
    if (!heldAfter.isFile() || heldAfter.nlink !== 1n || !sameIdentity(heldAfter, original) ||
        heldAfter.size !== BigInt(nextSize) || visibleAfter.isSymbolicLink() || !visibleAfter.isFile() ||
        visibleAfter.nlink !== 1n || !sameIdentity(visibleAfter, heldAfter) || visibleAfter.size !== heldAfter.size ||
        visibleAfter.mtimeNs !== heldAfter.mtimeNs || visibleAfter.ctimeNs !== heldAfter.ctimeNs ||
        rootAfter.isSymbolicLink() || !rootAfter.isDirectory() || !sameIdentity(rootAfter, rootOriginal) ||
        rootAfter.mtimeNs !== rootOriginal.mtimeNs || rootAfter.ctimeNs !== rootOriginal.ctimeNs) {
      throw new Error('community_operation_journal_path_identity_changed')
    }
    if (parentAfter.isSymbolicLink() || !parentAfter.isDirectory() || !sameIdentity(parentAfter, parentOriginal)) {
      throw new Error('community_operation_journal_path_identity_changed')
    }
    currentSize = nextSize
    baseline = heldAfter
    current = deepFreeze(next)
    currentHash = encoded.hash
    assertOwned()
    return current
  }

  const transition = (phase: CommunityOperationJournalPhase, step: string) => {
    if (!STEP.test(step) || phase === 'terminal' || current.status !== 'running') {
      throw new Error('community_operation_journal_transition_invalid')
    }
    const valid = (
      (current.phase === 'prepared' || current.phase === 'side-effect-after' || current.phase === 'promotion-after') &&
        (phase === 'side-effect-before' || phase === 'promotion-before')
    ) || (current.phase === 'side-effect-before' && phase === 'side-effect-after' && current.step === step) ||
      (current.phase === 'promotion-before' && phase === 'promotion-after' && current.step === step)
    if (!valid) throw new Error('community_operation_journal_transition_invalid')
    return append({
      ...current,
      phase,
      step,
      sequence: current.sequence + 1,
      updatedAt: new Date().toISOString(),
    })
  }

  const finish = (
    status: Extract<CommunityOperationJournalStatus, 'aborted' | 'failed' | 'succeeded' | 'reconciled'>,
    outcome: NonNullable<CommunityOperationJournalRecord['outcome']>,
    postDigests?: CommunityOperationJournalDigestSet,
  ) => {
    const reconciliationAllowed = status === 'reconciled' && params.allowReconcile === true &&
      ['running', 'aborted', 'failed'].includes(current.status)
    if ((!reconciliationAllowed && current.status !== 'running') || (status === 'reconciled' && !reconciliationAllowed) ||
        (status === 'succeeded' && (current.phase === 'side-effect-before' || current.phase === 'promotion-before')) ||
        ((status === 'succeeded' || status === 'reconciled') && !postDigests)) {
      throw new Error('community_operation_journal_transition_invalid')
    }
    return append({
      ...current,
      status,
      phase: 'terminal',
      step: status,
      sequence: current.sequence + 1,
      updatedAt: new Date().toISOString(),
      postDigests: status === 'succeeded' || status === 'reconciled' ? postDigests! : null,
      outcome,
    })
  }

  const close = () => {
    if (closed) return
    closed = true
    closeSync(params.fd)
  }

  return Object.freeze({ path: params.journalPath, record: () => current, assertOwned, transition, finish, close })
}

export function createCommunityOperationJournal(params: {
  paths: CommunityInstallPaths
  operation: CommunityOperation
  receipt: CommunityOperationLockReceipt
  sourceState: CommunityInstallState | null
  runtimeMode?: 'oci' | 'native'
  createId?: () => string
  now?: () => Date
}): CommunityOperationJournalHandle {
  const id = (params.createId ?? randomUUID)()
  if (!UUID.test(id) || params.receipt.operation !== params.operation || params.receipt.schemaVersion !== 2) {
    throw new Error('community_operation_journal_create_invalid')
  }
  const runtimeMode = params.runtimeMode ?? 'oci'
  if (runtimeMode === 'native' && params.sourceState !== null) {
    throw new Error('community_operation_journal_native_source_state_refused')
  }
  const sourceState = params.sourceState ? deepFreeze(structuredClone(params.sourceState)) : null
  if (runtimeMode === 'oci' && sourceState) assertSourceState(sourceState)
  const journalRoot = ensureCanonicalDirectoryChain(params.paths.operationJournalRoot)
  const journalParent = path.dirname(journalRoot)
  const rootOriginal = lstatSync(journalRoot, { bigint: true })
  const parentOriginal = lstatSync(journalParent, { bigint: true })
  const journalPath = path.join(journalRoot, `${id}.json`)
  const noFollow = typeof constants.O_NOFOLLOW === 'number' ? constants.O_NOFOLLOW : 0
  const syncFlag = typeof constants.O_SYNC === 'number' ? constants.O_SYNC : 0
  const fd = openSync(journalPath, constants.O_CREAT | constants.O_EXCL | constants.O_RDWR | noFollow | syncFlag, 0o600)
  try {
    const createdAt = (params.now ?? (() => new Date()))().toISOString()
    const initial: CommunityOperationJournalRecord = deepFreeze({
      schemaVersion: 1,
      runtimeMode,
      id,
      operation: params.operation,
      status: 'running',
      phase: 'prepared',
      step: 'prepared',
      sequence: 0,
      createdAt,
      updatedAt: createdAt,
      receipt: Object.freeze({ ...params.receipt }),
      preDigests: captureCommunityOperationDigests(params.paths),
      postDigests: null,
      sourceState,
      permittedActions: permittedActions(params.operation, sourceState, runtimeMode),
    })
    const encoded = encodeFrame(initial, ZERO_HASH)
    const written = writeSync(fd, encoded.content, 0, encoded.content.byteLength, 0)
    if (written !== encoded.content.byteLength) throw new Error('community_operation_journal_short_write')
    fsyncSync(fd)
    fsyncDirectoryEntry(journalRoot)
    const rootAfterCreate = lstatSync(journalRoot, { bigint: true })
    const parentAfterCreate = lstatSync(journalParent, { bigint: true })
    if (!sameIdentity(rootAfterCreate, rootOriginal) || !sameIdentity(parentAfterCreate, parentOriginal)) {
      throw new Error('community_operation_journal_path_identity_changed')
    }
    const handle = createHandle({
      fd,
      journalPath,
      journalRoot,
      initial,
      initialHash: encoded.hash,
      initialSize: written,
      rootOriginal: rootAfterCreate,
      parentOriginal,
    })
    handle.assertOwned()
    return handle
  } catch (error) {
    closeSync(fd)
    // The unique evidence path is intentionally preserved. Exact-identity GC is a later maintenance concern.
    throw error
  }
}

export function openCommunityOperationJournalForReconciliation(params: {
  paths: CommunityInstallPaths
  operationId: string
  expectedOperation: CommunityOperation
  action: CommunityOperationReconciliationAction
  confirm: boolean
  expectedSequence?: number
  expectedLastHash?: string
  expectedFileSha256?: string
}): CommunityOperationJournalHandle {
  if (params.confirm !== true || !UUID.test(params.operationId)) {
    throw new Error('community_operation_journal_reconciliation_confirmation_required')
  }
  const journalRoot = assertCanonicalJournalDirectory(params.paths.operationJournalRoot)
  const journalParent = path.dirname(journalRoot)
  const rootOriginal = lstatSync(journalRoot, { bigint: true })
  const parentOriginal = lstatSync(journalParent, { bigint: true })
  const journalPath = path.join(journalRoot, `${params.operationId}.json`)
  const noFollow = typeof constants.O_NOFOLLOW === 'number' ? constants.O_NOFOLLOW : 0
  const syncFlag = typeof constants.O_SYNC === 'number' ? constants.O_SYNC : 0
  const fd = openSync(journalPath, constants.O_RDWR | noFollow | syncFlag)
  try {
    const heldBefore = fstatSync(fd, { bigint: true })
    const visibleBefore = lstatSync(journalPath, { bigint: true })
    if (!heldBefore.isFile() || heldBefore.nlink !== 1n || heldBefore.size < 1n ||
        heldBefore.size > BigInt(MAX_JOURNAL_BYTES) || visibleBefore.isSymbolicLink() || !visibleBefore.isFile() ||
        visibleBefore.nlink !== 1n || !sameIdentity(visibleBefore, heldBefore)) {
      throw new Error('community_operation_journal_file_unsafe')
    }
    const byteLength = Number(heldBefore.size)
    const content = Buffer.alloc(byteLength)
    let offset = 0
    while (offset < byteLength) {
      const count = readSync(fd, content, offset, byteLength - offset, offset)
      if (count <= 0) throw new Error('community_operation_journal_read_failed')
      offset += count
    }
    const heldAfter = fstatSync(fd, { bigint: true })
    const visibleAfter = lstatSync(journalPath, { bigint: true })
    if (!sameIdentity(heldAfter, heldBefore) || heldAfter.size !== heldBefore.size ||
        heldAfter.mtimeNs !== heldBefore.mtimeNs || heldAfter.ctimeNs !== heldBefore.ctimeNs ||
        !sameIdentity(visibleAfter, heldBefore) || visibleAfter.size !== heldBefore.size ||
        visibleAfter.mtimeNs !== heldBefore.mtimeNs || visibleAfter.ctimeNs !== heldBefore.ctimeNs ||
        !sameIdentity(lstatSync(journalRoot, { bigint: true }), rootOriginal) ||
        !sameIdentity(lstatSync(journalParent, { bigint: true }), parentOriginal)) {
      throw new Error('community_operation_journal_path_identity_changed')
    }
    const inspection = parseJournalBuffer(content, journalPath)
    if (inspection.record.id !== params.operationId || inspection.record.operation !== params.expectedOperation ||
        !inspection.record.permittedActions.includes(params.action) ||
        (params.expectedSequence !== undefined && inspection.record.sequence !== params.expectedSequence) ||
        (params.expectedLastHash !== undefined && inspection.lastHash !== params.expectedLastHash) ||
        (params.expectedFileSha256 !== undefined && inspection.fileSha256 !== params.expectedFileSha256) ||
        ['succeeded', 'reconciled'].includes(inspection.record.status)) {
      throw new Error('community_operation_journal_reconciliation_identity_mismatch')
    }
    if (inspection.validBytes !== byteLength) {
      ftruncateSync(fd, inspection.validBytes)
      fsyncSync(fd)
    }
    const handle = createHandle({
      fd,
      journalPath,
      journalRoot,
      initial: inspection.record,
      initialHash: inspection.lastHash,
      initialSize: inspection.validBytes,
      allowReconcile: true,
      rootOriginal,
      parentOriginal,
    })
    handle.assertOwned()
    return handle
  } catch (error) {
    closeSync(fd)
    throw error
  }
}

export function finishCommunityOperationJournal(
  handle: CommunityOperationJournalHandle,
  paths: CommunityInstallPaths,
  status: Extract<CommunityOperationJournalStatus, 'aborted' | 'failed' | 'succeeded' | 'reconciled'>,
): CommunityOperationJournalRecord {
  const postDigests = status === 'succeeded' || status === 'reconciled'
    ? captureCommunityOperationDigests(paths)
    : undefined
  const outcome = status === 'aborted' ? 'aborted'
    : status === 'failed' ? 'operation-failed'
      : status === 'reconciled' ? 'operator-reconciled'
        : 'completed'
  return handle.finish(status, outcome, postDigests)
}

export async function runCommunityJournaledSideEffect<T>(params: {
  handle: CommunityOperationJournalHandle
  step: string
  signal?: AbortSignal
  effect: () => Promise<T> | T
}): Promise<T> {
  if (params.signal?.aborted) throw new Error('community_operation_aborted')
  params.handle.transition('side-effect-before', params.step)
  params.handle.assertOwned()
  if (params.signal?.aborted) throw new Error('community_operation_aborted')
  const result = await params.effect()
  if (params.signal?.aborted) throw new Error('community_operation_aborted')
  params.handle.transition('side-effect-after', params.step)
  params.handle.assertOwned()
  return result
}

export async function runCommunityJournaledPromotion<T>(params: {
  handle: CommunityOperationJournalHandle
  step: string
  signal?: AbortSignal
  promote: () => Promise<T> | T
}): Promise<T> {
  if (params.signal?.aborted) throw new Error('community_operation_aborted')
  params.handle.transition('promotion-before', params.step)
  params.handle.assertOwned()
  if (params.signal?.aborted) throw new Error('community_operation_aborted')
  const result = await params.promote()
  if (params.signal?.aborted) throw new Error('community_operation_aborted')
  params.handle.transition('promotion-after', params.step)
  params.handle.assertOwned()
  return result
}

export function assertCommunityOperationJournalFence(
  paths: CommunityInstallPaths,
  active?: Readonly<{
    handle: CommunityOperationJournalHandle
    operation: CommunityOperation
    receipt: CommunityOperationLockReceipt
    reconciliation?: boolean
  }>,
): void {
  if (active) {
    active.handle.assertOwned()
    const activeRecord = active.handle.record()
    const statusAllowed = active.reconciliation === true
      ? !['succeeded', 'reconciled'].includes(activeRecord.status)
      : activeRecord.status === 'running'
    if (!statusAllowed || activeRecord.operation !== active.operation ||
        JSON.stringify(activeRecord.receipt) !== JSON.stringify(active.receipt)) {
      throw new Error('community_operation_journal_active_identity_invalid')
    }
  }
  const resolvedRoot = path.resolve(paths.operationJournalRoot)
  const resolvedParent = path.dirname(resolvedRoot)
  let rootProbe = tryLstat(resolvedRoot)
  if (!rootProbe) {
    const parentProbe = tryLstat(resolvedParent)
    if (parentProbe && (parentProbe.isSymbolicLink() || !parentProbe.isDirectory() ||
        !samePath(resolvedParent, realpathSync.native(resolvedParent)))) {
      throw new Error('community_operation_journal_parent_unsafe')
    }
    const parentIdentity = parentProbe ? lstatSync(resolvedParent, { bigint: true }) : undefined
    rootProbe = tryLstat(resolvedRoot)
    if (!rootProbe) {
      if (parentIdentity) {
        const parentAfter = lstatSync(resolvedParent, { bigint: true })
        if (!sameIdentity(parentAfter, parentIdentity) || tryLstat(resolvedRoot)) {
          throw new Error('community_operation_journal_inventory_changed')
        }
      } else if (tryLstat(resolvedParent) || tryLstat(resolvedRoot)) {
        throw new Error('community_operation_journal_inventory_changed')
      }
      if (active) throw new Error('community_operation_journal_active_identity_invalid')
      return
    }
  }
  const journalRoot = assertCanonicalJournalDirectory(paths.operationJournalRoot)
  const rootIdentity = lstatSync(journalRoot, { bigint: true })
  const parentIdentity = lstatSync(resolvedParent, { bigint: true })
  if (parentIdentity.isSymbolicLink() || !parentIdentity.isDirectory() ||
      !samePath(resolvedParent, realpathSync.native(resolvedParent))) {
    throw new Error('community_operation_journal_parent_unsafe')
  }
  const entries = readdirSync(journalRoot, { withFileTypes: true })
  if (entries.length > MAX_JOURNAL_FILES) throw new Error('community_operation_journal_inventory_too_large')
  const initialNames = entries.map((entry) => entry.name).sort()
  const entryIdentities = new Map<string, BigIntStats>()
  let activeSeen = false
  for (const entry of entries) {
    if (!entry.isFile() || !/^([0-9a-f-]{36})\.json$/.test(entry.name)) {
      throw new Error('community_operation_journal_inventory_unsafe')
    }
    const operationId = entry.name.slice(0, -'.json'.length)
    if (!UUID.test(operationId)) throw new Error('community_operation_journal_inventory_unsafe')
    const entryPath = path.join(journalRoot, entry.name)
    const entryIdentity = lstatSync(entryPath, { bigint: true })
    if (entryIdentity.isSymbolicLink() || !entryIdentity.isFile() || entryIdentity.nlink !== 1n) {
      throw new Error('community_operation_journal_inventory_unsafe')
    }
    entryIdentities.set(entry.name, entryIdentity)
    let inspection: CommunityOperationJournalInspection
    try {
      inspection = inspectCommunityOperationJournalFile(paths, operationId)
    } catch {
      throw new Error(`community_operation_reconciliation_required:operation_id=${operationId}:journal_invalid`)
    }
    if (active && operationId === active.handle.record().id) {
      const activeRecord = active.handle.record()
      if (inspection.integrity !== 'complete' || inspection.path !== active.handle.path ||
          inspection.record.sequence !== activeRecord.sequence || inspection.record.operation !== active.operation ||
          inspection.record.status !== activeRecord.status ||
          (active.reconciliation !== true && inspection.record.status !== 'running') ||
          JSON.stringify(inspection.record.receipt) !== JSON.stringify(active.receipt)) {
        throw new Error('community_operation_journal_active_identity_invalid')
      }
      activeSeen = true
      continue
    }
    if (inspection.integrity !== 'complete' || !['succeeded', 'reconciled'].includes(inspection.record.status)) {
      throw new Error(
        `community_operation_reconciliation_required:operation_id=${inspection.record.id}:operation=${inspection.record.operation}:phase=${inspection.record.phase}`,
      )
    }
  }
  const finalNames = readdirSync(journalRoot).sort()
  for (const [name, before] of entryIdentities) {
    const after = lstatSync(path.join(journalRoot, name), { bigint: true })
    if (after.isSymbolicLink() || !after.isFile() || after.nlink !== 1n ||
        !sameIdentity(after, before) || after.size !== before.size ||
        after.mtimeNs !== before.mtimeNs || after.ctimeNs !== before.ctimeNs) {
      throw new Error('community_operation_journal_inventory_changed')
    }
  }
  const rootAfter = lstatSync(journalRoot, { bigint: true })
  const parentAfter = lstatSync(resolvedParent, { bigint: true })
  if (!sameJson(initialNames, finalNames) || !sameIdentity(rootAfter, rootIdentity) ||
      rootAfter.mtimeNs !== rootIdentity.mtimeNs || rootAfter.ctimeNs !== rootIdentity.ctimeNs ||
      !sameIdentity(parentAfter, parentIdentity)) {
    throw new Error('community_operation_journal_inventory_changed')
  }
  if (active && !activeSeen) throw new Error('community_operation_journal_active_identity_invalid')
  active?.handle.assertOwned()
}

export function digestsEqual(left: CommunityOperationJournalDigestSet, right: CommunityOperationJournalDigestSet): boolean {
  return left.state === right.state && left.env === right.env && left.ledger === right.ledger
}
