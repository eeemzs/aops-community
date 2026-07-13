import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { execFile } from 'node:child_process'
import { constants } from 'node:fs'
import {
  lstat,
  mkdir,
  open,
  readFile,
  readdir,
  realpath,
  rename,
  rmdir,
  unlink,
  type FileHandle,
} from 'node:fs/promises'
import path from 'node:path'
import { promisify } from 'node:util'

export const COMMUNITY_OPERATION_LOCK_DIRECTORY_NAME = '.aops-community-operation.lock'
const CLAIM_DIRECTORY_PREFIX = '.aops-community-operation.claim-'
const OWNER_RECEIPT_NAME = /^owner-([a-f0-9]{64})\.json$/
const DEFAULT_STALE_AFTER_MS = 6 * 60 * 60 * 1_000
const OWNER_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/
const OWNER_TOKEN_SHA256_PATTERN = /^sha256:[a-f0-9]{64}$/
const PROCESS_START_IDENTITY_PATTERN = /^sha256:[a-f0-9]{64}$/
const COMMUNITY_OPERATIONS = new Set<CommunityOperation>([
  'setup',
  'update',
  'recover',
  'rollback',
  'start',
  'stop',
  'restart',
  'backup',
  'restore',
  'reset',
])
const RECEIPT_KEYS_V1 = ['operation', 'ownerTokenSha256', 'pid', 'schemaVersion', 'startedAt'] as const
const RECEIPT_KEYS_V2 = ['operation', 'ownerTokenSha256', 'pid', 'processStartIdentity', 'schemaVersion', 'startedAt'] as const
const execFileAsync = promisify(execFile)

export type CommunityOperation =
  | 'setup'
  | 'update'
  | 'recover'
  | 'rollback'
  | 'start'
  | 'stop'
  | 'restart'
  | 'backup'
  | 'restore'
  | 'reset'

export type CommunityOperationLockReceipt = Readonly<{
  schemaVersion: 1 | 2
  pid: number
  operation: CommunityOperation
  startedAt: string
  ownerTokenSha256: string
  processStartIdentity?: string
}>

export type CommunityProcessIdentityInspection =
  | Readonly<{ status: 'alive'; processStartIdentity?: string }>
  | Readonly<{ status: 'dead' | 'unknown' }>

export type CommunityOperationLockErrorCode =
  | 'COMMUNITY_OPERATION_ABORTED'
  | 'COMMUNITY_OPERATION_INVALID'
  | 'COMMUNITY_OPERATION_INSTANCE_UNSAFE'
  | 'COMMUNITY_OPERATION_LOCK_BUSY'
  | 'COMMUNITY_OPERATION_LOCK_STALE'
  | 'COMMUNITY_OPERATION_LOCK_LIVE'
  | 'COMMUNITY_OPERATION_LOCK_RECOVERY_CONFIRMATION_REQUIRED'
  | 'COMMUNITY_OPERATION_LOCK_GENERATION_MISMATCH'
  | 'COMMUNITY_OPERATION_LOCK_RECOVERY_FAILED'
  | 'COMMUNITY_OPERATION_LOCK_UNREADABLE'
  | 'COMMUNITY_OPERATION_LOCK_INITIALIZATION_FAILED'
  | 'COMMUNITY_OPERATION_LOCK_INITIALIZATION_CLEANUP_FAILED'
  | 'COMMUNITY_OPERATION_LOCK_NOT_OWNER'
  | 'COMMUNITY_OPERATION_LOCK_OWNERSHIP_LOST'
  | 'COMMUNITY_OPERATION_LOCK_RELEASE_FAILED'

export type CommunityOperationLockDiagnostic = Readonly<{
  code: CommunityOperationLockErrorCode
  requestedOperation?: CommunityOperation
  holderOperation?: CommunityOperation
  holderPid?: number
  holderStartedAt?: string
  action: string
}>

const ERROR_MESSAGES: Record<CommunityOperationLockErrorCode, string> = {
  COMMUNITY_OPERATION_ABORTED: 'The Community operation was cancelled.',
  COMMUNITY_OPERATION_INVALID: 'The requested Community operation is not supported.',
  COMMUNITY_OPERATION_INSTANCE_UNSAFE: 'The Community instance directory is not a safe canonical directory.',
  COMMUNITY_OPERATION_LOCK_BUSY: 'Another Community operation is active for this instance.',
  COMMUNITY_OPERATION_LOCK_STALE: 'The existing Community operation lock appears stale and was not removed.',
  COMMUNITY_OPERATION_LOCK_LIVE: 'The recorded Community operation owner is still alive or cannot be distinguished safely.',
  COMMUNITY_OPERATION_LOCK_RECOVERY_CONFIRMATION_REQUIRED: 'Stale lock recovery requires exact receipt confirmation.',
  COMMUNITY_OPERATION_LOCK_GENERATION_MISMATCH: 'The Community operation lock generation changed during recovery.',
  COMMUNITY_OPERATION_LOCK_RECOVERY_FAILED: 'The stale Community operation lock could not be recovered safely.',
  COMMUNITY_OPERATION_LOCK_UNREADABLE: 'The existing Community operation lock cannot be safely identified.',
  COMMUNITY_OPERATION_LOCK_INITIALIZATION_FAILED: 'The Community operation lock could not be initialized.',
  COMMUNITY_OPERATION_LOCK_INITIALIZATION_CLEANUP_FAILED: 'An incomplete Community operation lock could not be cleaned up safely.',
  COMMUNITY_OPERATION_LOCK_NOT_OWNER: 'Only the exact lock owner can release this Community operation lock.',
  COMMUNITY_OPERATION_LOCK_OWNERSHIP_LOST: 'The Community operation lock no longer belongs to this owner.',
  COMMUNITY_OPERATION_LOCK_RELEASE_FAILED: 'The Community operation lock could not be released safely.',
}

export class CommunityOperationLockError extends Error {
  readonly code: CommunityOperationLockErrorCode
  readonly diagnostic: CommunityOperationLockDiagnostic

  constructor(diagnostic: CommunityOperationLockDiagnostic) {
    super(ERROR_MESSAGES[diagnostic.code])
    this.name = 'CommunityOperationLockError'
    this.code = diagnostic.code
    this.diagnostic = Object.freeze({ ...diagnostic })
  }
}

export type CommunityOperationLockRelease = Readonly<{
  status: 'released' | 'already-released'
}>

export type CommunityOperationLockHandle = Readonly<{
  receipt: CommunityOperationLockReceipt
  ownerToken: string
  release: (ownerToken: string) => Promise<CommunityOperationLockRelease>
}>

export type AcquireCommunityOperationLockInput = Readonly<{
  instanceDirectory: string
  operation: CommunityOperation
  staleAfterMs?: number
  signal?: AbortSignal
}>

export type CommunityOperationLockContext = Readonly<{
  receipt: CommunityOperationLockReceipt
  signal?: AbortSignal
}>

export type InspectCommunityOperationLockInput = Readonly<{
  instanceDirectory: string
  staleAfterMs?: number
}>

export type CommunityOperationLockInspection = Readonly<{
  status: 'absent' | 'busy' | 'stale-live' | 'stale-dead' | 'stale-pid-reused' | 'stale-unknown' | 'unreadable'
  receipt?: CommunityOperationLockReceipt
  process?: CommunityProcessIdentityInspection
  recoverable: boolean
}>

export type RecoverStaleCommunityOperationLockInput = Readonly<{
  instanceDirectory: string
  expectedReceipt: CommunityOperationLockReceipt
  confirm: boolean
  staleAfterMs?: number
}>

export type CommunityOperationLockRecovery = Readonly<{
  status: 'recovered'
  receipt: CommunityOperationLockReceipt
  reason: 'dead-owner' | 'pid-reused'
}>

export type CommunityOperationLockService = Readonly<{
  acquire: (input: AcquireCommunityOperationLockInput) => Promise<CommunityOperationLockHandle>
  inspect: (input: InspectCommunityOperationLockInput) => Promise<CommunityOperationLockInspection>
  recoverStale: (input: RecoverStaleCommunityOperationLockInput) => Promise<CommunityOperationLockRecovery>
  withLock: <T>(
    input: AcquireCommunityOperationLockInput,
    operation: (context: CommunityOperationLockContext) => Promise<T>,
  ) => Promise<T>
}>

export type CommunityOperationLockDependencies = Readonly<{
  /** A narrow fault-injection seam. Normal callers should use the default writer. */
  writeReceipt?: (file: FileHandle, content: string) => Promise<void>
  /** A narrow race-injection seam. Normal callers must not provide it. */
  beforeOwnedReceiptUnlink?: () => Promise<void>
  /** Process liveness/start identity seam for deterministic stale-lock recovery tests. */
  inspectProcess?: (pid: number) => Promise<CommunityProcessIdentityInspection>
  /** Race seam immediately before a stale generation is quarantined. */
  beforeStaleLockQuarantine?: () => Promise<void>
}>

function lockError(
  code: CommunityOperationLockErrorCode,
  action: string,
  details: Omit<CommunityOperationLockDiagnostic, 'code' | 'action'> = {},
): CommunityOperationLockError {
  return new CommunityOperationLockError({ code, action, ...details })
}

function isErrno(error: unknown, code: string): boolean {
  return (error as NodeJS.ErrnoException | undefined)?.code === code
}

function isSamePhysicalPath(left: string, right: string): boolean {
  return path.relative(left, right) === '' && path.relative(right, left) === ''
}

function isWithin(root: string, candidate: string): boolean {
  const relative = path.relative(root, candidate)
  return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)
}

function assertOperation(operation: CommunityOperation): void {
  if (!COMMUNITY_OPERATIONS.has(operation)) {
    throw lockError(
      'COMMUNITY_OPERATION_INVALID',
      'Use one of: setup, update, rollback, start, stop, restart, backup, restore, or reset.',
    )
  }
}

function staleAfterMs(input: number | undefined): number {
  const value = input ?? DEFAULT_STALE_AFTER_MS
  if (!Number.isSafeInteger(value) || value < 0) {
    throw lockError(
      'COMMUNITY_OPERATION_INVALID',
      'Use a non-negative whole-number stale threshold.',
    )
  }
  return value
}

function throwIfAborted(signal: AbortSignal | undefined, operation: CommunityOperation): void {
  if (!signal?.aborted) return
  throw lockError(
    'COMMUNITY_OPERATION_ABORTED',
    'Retry the operation when cancellation is no longer requested.',
    { requestedOperation: operation },
  )
}

function digestProcessIdentity(raw: string): string {
  return `sha256:${createHash('sha256').update(raw, 'utf8').digest('hex')}`
}

const CURRENT_PROCESS_FALLBACK_IDENTITY = digestProcessIdentity(
  `node:${process.pid}:${Math.round(Date.now() - (process.uptime() * 1_000))}`,
)
const processIdentityCache = new Map<number, string>()

async function defaultInspectProcess(pid: number): Promise<CommunityProcessIdentityInspection> {
  if (!Number.isSafeInteger(pid) || pid <= 0) return Object.freeze({ status: 'unknown' })
  try {
    process.kill(pid, 0)
  } catch (error) {
    if (isErrno(error, 'ESRCH')) return Object.freeze({ status: 'dead' })
    if (!isErrno(error, 'EPERM')) return Object.freeze({ status: 'unknown' })
  }
  const cached = processIdentityCache.get(pid)
  if (cached) return Object.freeze({ status: 'alive', processStartIdentity: cached })
  try {
    let rawIdentity: string
    if (process.platform === 'linux') {
      const [bootId, stat] = await Promise.all([
        readFile('/proc/sys/kernel/random/boot_id', 'utf8'),
        readFile(`/proc/${pid}/stat`, 'utf8'),
      ])
      const commandEnd = stat.lastIndexOf(')')
      const fieldsAfterCommand = commandEnd >= 0 ? stat.slice(commandEnd + 2).trim().split(/\s+/) : []
      const startTicks = fieldsAfterCommand[19]
      if (!startTicks || !/^\d+$/.test(startTicks)) throw new Error('process_stat_invalid')
      rawIdentity = `linux:${bootId.trim()}:${startTicks}`
    } else if (process.platform === 'win32') {
      const result = await execFileAsync(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-Command', `(Get-Process -Id ${pid} -ErrorAction Stop).StartTime.ToUniversalTime().Ticks`],
        { encoding: 'utf8', windowsHide: true, timeout: 5_000 },
      )
      rawIdentity = `win32:${String(result.stdout).trim()}`
    } else {
      const result = await execFileAsync(
        'ps',
        ['-o', 'lstart=', '-p', String(pid)],
        { encoding: 'utf8', windowsHide: true, timeout: 5_000 },
      )
      rawIdentity = `${process.platform}:${String(result.stdout).trim()}`
    }
    if (!rawIdentity.split(':').at(-1)) throw new Error('process_identity_empty')
    const processStartIdentity = digestProcessIdentity(rawIdentity)
    if (pid === process.pid) processIdentityCache.set(pid, processStartIdentity)
    return Object.freeze({ status: 'alive', processStartIdentity })
  } catch {
    if (pid === process.pid) {
      processIdentityCache.set(pid, CURRENT_PROCESS_FALLBACK_IDENTITY)
      return Object.freeze({ status: 'alive', processStartIdentity: CURRENT_PROCESS_FALLBACK_IDENTITY })
    }
    try {
      process.kill(pid, 0)
      return Object.freeze({ status: 'alive' })
    } catch (error) {
      return Object.freeze({ status: isErrno(error, 'ESRCH') ? 'dead' : 'unknown' })
    }
  }
}

async function resolveSafeInstanceDirectory(instanceDirectory: string): Promise<string> {
  if (!path.isAbsolute(instanceDirectory)) {
    throw lockError(
      'COMMUNITY_OPERATION_INSTANCE_UNSAFE',
      'Pass the existing physical instance directory as an absolute canonical path.',
    )
  }

  const resolved = path.resolve(instanceDirectory)
  let entry
  let canonical
  try {
    entry = await lstat(resolved)
    canonical = await realpath(resolved)
  } catch {
    throw lockError(
      'COMMUNITY_OPERATION_INSTANCE_UNSAFE',
      'Create and resolve the physical instance directory before acquiring its lock.',
    )
  }

  if (!entry.isDirectory() || entry.isSymbolicLink() || !isSamePhysicalPath(resolved, canonical)) {
    throw lockError(
      'COMMUNITY_OPERATION_INSTANCE_UNSAFE',
      'Use the physical instance directory directly; links and reparse-point aliases are not accepted.',
    )
  }

  return canonical
}

function parseReceipt(content: string): CommunityOperationLockReceipt | undefined {
  let value: unknown
  try {
    value = JSON.parse(content)
  } catch {
    return undefined
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const keys = Object.keys(value).sort()
  const schemaVersion = (value as { schemaVersion?: unknown }).schemaVersion
  const expectedKeys = schemaVersion === 1 ? RECEIPT_KEYS_V1 : schemaVersion === 2 ? RECEIPT_KEYS_V2 : undefined
  if (!expectedKeys || keys.length !== expectedKeys.length || keys.some((key, index) => key !== expectedKeys[index])) {
    return undefined
  }
  const receipt = value as Partial<CommunityOperationLockReceipt>
  const parsedStartedAt = typeof receipt.startedAt === 'string' ? Date.parse(receipt.startedAt) : Number.NaN
  if (
    (receipt.schemaVersion !== 1 && receipt.schemaVersion !== 2)
    || !Number.isSafeInteger(receipt.pid)
    || Number(receipt.pid) <= 0
    || !COMMUNITY_OPERATIONS.has(receipt.operation as CommunityOperation)
    || typeof receipt.startedAt !== 'string'
    || !Number.isFinite(parsedStartedAt)
    || new Date(parsedStartedAt).toISOString() !== receipt.startedAt
    || typeof receipt.ownerTokenSha256 !== 'string'
    || !OWNER_TOKEN_SHA256_PATTERN.test(receipt.ownerTokenSha256)
    || (receipt.schemaVersion === 2 && (
      typeof receipt.processStartIdentity !== 'string'
      || !PROCESS_START_IDENTITY_PATTERN.test(receipt.processStartIdentity)
    ))
  ) {
    return undefined
  }
  return Object.freeze({
    schemaVersion: receipt.schemaVersion,
    pid: Number(receipt.pid),
    operation: receipt.operation as CommunityOperation,
    startedAt: receipt.startedAt,
    ownerTokenSha256: receipt.ownerTokenSha256,
    ...(receipt.schemaVersion === 2 ? { processStartIdentity: receipt.processStartIdentity } : {}),
  })
}

async function assertLockDirectoryIsSafe(
  lockDirectory: string,
  instanceDirectory: string,
): Promise<'absent' | 'directory'> {
  if (!isWithin(instanceDirectory, lockDirectory) || path.dirname(lockDirectory) !== instanceDirectory) {
    throw lockError(
      'COMMUNITY_OPERATION_INSTANCE_UNSAFE',
      'Resolve the canonical instance directory again before retrying.',
    )
  }
  try {
    const entry = await lstat(lockDirectory)
    if (!entry.isDirectory() || entry.isSymbolicLink()) {
      throw lockError(
        'COMMUNITY_OPERATION_INSTANCE_UNSAFE',
        'Remove the unsafe lock-directory entry manually only after inspecting it.',
      )
    }
    const canonicalLockDirectory = await realpath(lockDirectory)
    if (!isWithin(instanceDirectory, canonicalLockDirectory) || canonicalLockDirectory !== lockDirectory) {
      throw lockError(
        'COMMUNITY_OPERATION_INSTANCE_UNSAFE',
        'Remove the unsafe linked lock-directory entry manually only after inspecting it.',
      )
    }
    return 'directory'
  } catch (error) {
    if (isErrno(error, 'ENOENT')) return 'absent'
    if (error instanceof CommunityOperationLockError) throw error
    throw lockError(
      'COMMUNITY_OPERATION_INSTANCE_UNSAFE',
      'Inspect the instance lock entry and retry after it is safe to read.',
    )
  }
}

async function readReceiptFile(
  receiptPath: string,
  lockDirectory: string,
): Promise<CommunityOperationLockReceipt | undefined> {
  if (!isWithin(lockDirectory, receiptPath) || path.dirname(receiptPath) !== lockDirectory) {
    throw lockError(
      'COMMUNITY_OPERATION_INSTANCE_UNSAFE',
      'Inspect the lock receipt path before retrying.',
    )
  }
  const receiptName = path.basename(receiptPath)
  const nameMatch = receiptName.match(OWNER_RECEIPT_NAME)
  if (!nameMatch) return undefined

  let entry
  try {
    entry = await lstat(receiptPath)
  } catch (error) {
    if (isErrno(error, 'ENOENT')) return undefined
    throw lockError(
      'COMMUNITY_OPERATION_LOCK_UNREADABLE',
      'Inspect the lock receipt locally; do not delete it until no operation is running.',
    )
  }
  if (!entry.isFile() || entry.isSymbolicLink()) {
    throw lockError(
      'COMMUNITY_OPERATION_INSTANCE_UNSAFE',
      'Inspect the non-regular lock receipt before retrying.',
    )
  }

  let file: FileHandle | undefined
  try {
    const noFollow = typeof constants.O_NOFOLLOW === 'number' ? constants.O_NOFOLLOW : 0
    file = await open(receiptPath, constants.O_RDONLY | noFollow)
    const openedEntry = await file.stat()
    if (!openedEntry.isFile()) {
      throw lockError(
        'COMMUNITY_OPERATION_INSTANCE_UNSAFE',
        'Inspect the instance lock receipt and retry after it is a regular file.',
      )
    }
    const receipt = parseReceipt(await file.readFile({ encoding: 'utf8' }))
    if (!receipt || receipt.ownerTokenSha256 !== `sha256:${nameMatch[1]}`) return undefined
    return receipt
  } catch (error) {
    if (error instanceof CommunityOperationLockError) throw error
    if (isErrno(error, 'ENOENT')) return undefined
    throw lockError(
      'COMMUNITY_OPERATION_LOCK_UNREADABLE',
      'Inspect the lock receipt locally; do not delete it until no operation is running.',
    )
  } finally {
    await file?.close().catch(() => undefined)
  }
}

async function readExistingReceipt(
  lockDirectory: string,
  instanceDirectory: string,
): Promise<CommunityOperationLockReceipt | undefined> {
  const state = await assertLockDirectoryIsSafe(lockDirectory, instanceDirectory)
  if (state === 'absent') return undefined

  let entries
  try {
    entries = await readdir(lockDirectory, { withFileTypes: true })
  } catch (error) {
    if (isErrno(error, 'ENOENT')) return undefined
    throw lockError(
      'COMMUNITY_OPERATION_LOCK_UNREADABLE',
      'Inspect the lock directory locally; do not delete it until no operation is running.',
    )
  }
  if (
    entries.length !== 1
    || !entries[0].isFile()
    || entries[0].isSymbolicLink()
    || !OWNER_RECEIPT_NAME.test(entries[0].name)
  ) return undefined
  return readReceiptFile(path.join(lockDirectory, entries[0].name), lockDirectory)
}

function hashOwnerToken(ownerToken: string): string {
  return `sha256:${createHash('sha256').update(ownerToken, 'utf8').digest('hex')}`
}

function ownerTokenDigestsMatch(expected: string, actual: string): boolean {
  const expectedBytes = Buffer.from(expected, 'utf8')
  const actualBytes = Buffer.from(actual, 'utf8')
  return expectedBytes.length === actualBytes.length && timingSafeEqual(expectedBytes, actualBytes)
}

function existingLockError(
  requestedOperation: CommunityOperation,
  receipt: CommunityOperationLockReceipt | undefined,
  thresholdMs: number,
): CommunityOperationLockError {
  if (!receipt) {
    return lockError(
      'COMMUNITY_OPERATION_LOCK_UNREADABLE',
      'Inspect the lock receipt locally; do not delete it until no operation is running.',
      { requestedOperation },
    )
  }
  const ageMs = Math.max(0, Date.now() - Date.parse(receipt.startedAt))
  const details = {
    requestedOperation,
    holderOperation: receipt.operation,
    holderPid: receipt.pid,
    holderStartedAt: receipt.startedAt,
  }
  if (ageMs >= thresholdMs) {
    return lockError(
      'COMMUNITY_OPERATION_LOCK_STALE',
      'Confirm the recorded process is no longer running, then recover the lock explicitly; it was not stolen.',
      details,
    )
  }
  return lockError(
    'COMMUNITY_OPERATION_LOCK_BUSY',
    'Wait for the active operation to finish, then retry.',
    details,
  )
}

async function defaultWriteReceipt(file: FileHandle, content: string): Promise<void> {
  await file.writeFile(content, { encoding: 'utf8' })
  await file.sync()
}

function sameReceipt(
  left: CommunityOperationLockReceipt | undefined,
  right: CommunityOperationLockReceipt | undefined,
): boolean {
  return Boolean(left && right)
    && left!.schemaVersion === right!.schemaVersion
    && left!.pid === right!.pid
    && left!.operation === right!.operation
    && left!.startedAt === right!.startedAt
    && left!.ownerTokenSha256 === right!.ownerTokenSha256
    && left!.processStartIdentity === right!.processStartIdentity
}

function assertExpectedReceipt(receipt: CommunityOperationLockReceipt): CommunityOperationLockReceipt {
  const parsed = parseReceipt(JSON.stringify(receipt))
  if (!parsed || !sameReceipt(parsed, receipt)) {
    throw lockError(
      'COMMUNITY_OPERATION_LOCK_RECOVERY_CONFIRMATION_REQUIRED',
      'Read the lock status again and confirm every exact receipt field.',
    )
  }
  return parsed
}

export function createCommunityOperationLockService(
  dependencies: CommunityOperationLockDependencies = {},
): CommunityOperationLockService {
  const writeReceipt = dependencies.writeReceipt ?? defaultWriteReceipt
  const beforeOwnedReceiptUnlink = dependencies.beforeOwnedReceiptUnlink
  const inspectProcess = dependencies.inspectProcess ?? defaultInspectProcess
  const beforeStaleLockQuarantine = dependencies.beforeStaleLockQuarantine

  const inspect = async (
    input: InspectCommunityOperationLockInput,
  ): Promise<CommunityOperationLockInspection> => {
    const thresholdMs = staleAfterMs(input.staleAfterMs)
    const instanceDirectory = await resolveSafeInstanceDirectory(input.instanceDirectory)
    const lockDirectory = path.join(instanceDirectory, COMMUNITY_OPERATION_LOCK_DIRECTORY_NAME)
    const state = await assertLockDirectoryIsSafe(lockDirectory, instanceDirectory)
    if (state === 'absent') return Object.freeze({ status: 'absent', recoverable: false })
    const receipt = await readExistingReceipt(lockDirectory, instanceDirectory)
    if (!receipt) return Object.freeze({ status: 'unreadable', recoverable: false })
    const ageMs = Math.max(0, Date.now() - Date.parse(receipt.startedAt))
    if (ageMs < thresholdMs) return Object.freeze({ status: 'busy', receipt, recoverable: false })
    const processInspection = await inspectProcess(receipt.pid)
    if (processInspection.status === 'dead') {
      return Object.freeze({ status: 'stale-dead', receipt, process: processInspection, recoverable: true })
    }
    if (processInspection.status === 'alive' && receipt.schemaVersion === 2 &&
        processInspection.processStartIdentity &&
        processInspection.processStartIdentity !== receipt.processStartIdentity) {
      return Object.freeze({ status: 'stale-pid-reused', receipt, process: processInspection, recoverable: true })
    }
    if (processInspection.status === 'alive' && receipt.schemaVersion === 2 &&
        processInspection.processStartIdentity === receipt.processStartIdentity) {
      return Object.freeze({ status: 'stale-live', receipt, process: processInspection, recoverable: false })
    }
    return Object.freeze({ status: 'stale-unknown', receipt, process: processInspection, recoverable: false })
  }

  const recoverStale = async (
    input: RecoverStaleCommunityOperationLockInput,
  ): Promise<CommunityOperationLockRecovery> => {
    if (input.confirm !== true) {
      throw lockError(
        'COMMUNITY_OPERATION_LOCK_RECOVERY_CONFIRMATION_REQUIRED',
        'Pass explicit stale-lock recovery confirmation with the exact inspected receipt.',
      )
    }
    const expectedReceipt = assertExpectedReceipt(input.expectedReceipt)
    const inspection = await inspect(input)
    if (!sameReceipt(inspection.receipt, expectedReceipt)) {
      throw lockError(
        'COMMUNITY_OPERATION_LOCK_GENERATION_MISMATCH',
        'Read the lock status again; do not remove the changed generation.',
      )
    }
    if (!inspection.recoverable) {
      throw lockError(
        inspection.status === 'stale-live' ? 'COMMUNITY_OPERATION_LOCK_LIVE' : 'COMMUNITY_OPERATION_LOCK_STALE',
        'Do not recover this lock until the exact owner is proven dead or the PID start identity proves reuse.',
        {
          holderOperation: expectedReceipt.operation,
          holderPid: expectedReceipt.pid,
          holderStartedAt: expectedReceipt.startedAt,
        },
      )
    }

    const instanceDirectory = await resolveSafeInstanceDirectory(input.instanceDirectory)
    const lockDirectory = path.join(instanceDirectory, COMMUNITY_OPERATION_LOCK_DIRECTORY_NAME)
    const quarantineDirectory = path.join(
      instanceDirectory,
      `.aops-community-operation.recovery-${expectedReceipt.ownerTokenSha256.slice('sha256:'.length)}-${randomBytes(8).toString('hex')}`,
    )
    await beforeStaleLockQuarantine?.()
    try {
      await rename(lockDirectory, quarantineDirectory)
    } catch {
      throw lockError(
        'COMMUNITY_OPERATION_LOCK_GENERATION_MISMATCH',
        'Another recovery or owner transition won; inspect the current lock generation again.',
      )
    }
    const quarantinedReceipt = await readExistingReceipt(quarantineDirectory, instanceDirectory).catch(() => undefined)
    if (!sameReceipt(quarantinedReceipt, expectedReceipt)) {
      if (await assertLockDirectoryIsSafe(lockDirectory, instanceDirectory).catch(() => 'directory') === 'absent') {
        await rename(quarantineDirectory, lockDirectory).catch(() => undefined)
      }
      throw lockError(
        'COMMUNITY_OPERATION_LOCK_GENERATION_MISMATCH',
        'The quarantined receipt did not match; it was not deleted.',
      )
    }
    const quarantinedReceiptPath = path.join(
      quarantineDirectory,
      `owner-${expectedReceipt.ownerTokenSha256.slice('sha256:'.length)}.json`,
    )
    try {
      await unlink(quarantinedReceiptPath)
      await rmdir(quarantineDirectory)
    } catch {
      if (await assertLockDirectoryIsSafe(lockDirectory, instanceDirectory).catch(() => 'directory') === 'absent') {
        await rename(quarantineDirectory, lockDirectory).catch(() => undefined)
      }
      throw lockError(
        'COMMUNITY_OPERATION_LOCK_RECOVERY_FAILED',
        'The exact stale generation was preserved; inspect it before retrying.',
      )
    }
    return Object.freeze({
      status: 'recovered',
      receipt: expectedReceipt,
      reason: inspection.status === 'stale-dead' ? 'dead-owner' : 'pid-reused',
    })
  }

  const acquire = async (input: AcquireCommunityOperationLockInput): Promise<CommunityOperationLockHandle> => {
    assertOperation(input.operation)
    const thresholdMs = staleAfterMs(input.staleAfterMs)
    throwIfAborted(input.signal, input.operation)
    const instanceDirectory = await resolveSafeInstanceDirectory(input.instanceDirectory)
    const lockDirectory = path.join(instanceDirectory, COMMUNITY_OPERATION_LOCK_DIRECTORY_NAME)
    const initialState = await assertLockDirectoryIsSafe(lockDirectory, instanceDirectory)
    if (initialState === 'directory') {
      throw existingLockError(
        input.operation,
        await readExistingReceipt(lockDirectory, instanceDirectory),
        thresholdMs,
      )
    }

    const currentProcess = await inspectProcess(process.pid)
    if (currentProcess.status !== 'alive' || !currentProcess.processStartIdentity ||
        !PROCESS_START_IDENTITY_PATTERN.test(currentProcess.processStartIdentity)) {
      throw lockError(
        'COMMUNITY_OPERATION_LOCK_INITIALIZATION_FAILED',
        'The current process start identity could not be recorded safely.',
        { requestedOperation: input.operation },
      )
    }

    const ownerToken = randomBytes(32).toString('base64url')
    const ownerTokenSha256 = hashOwnerToken(ownerToken)
    const ownerReceiptName = `owner-${ownerTokenSha256.slice('sha256:'.length)}.json`
    const claimDirectory = path.join(
      instanceDirectory,
      `${CLAIM_DIRECTORY_PREFIX}${process.pid}-${randomBytes(16).toString('hex')}`,
    )
    const claimReceiptPath = path.join(claimDirectory, ownerReceiptName)
    const ownedReceiptPath = path.join(lockDirectory, ownerReceiptName)
    const receipt: CommunityOperationLockReceipt = Object.freeze({
      schemaVersion: 2,
      pid: process.pid,
      operation: input.operation,
      startedAt: new Date().toISOString(),
      ownerTokenSha256,
      processStartIdentity: currentProcess.processStartIdentity,
    })

    let file: FileHandle | undefined
    let claimExists = false
    try {
      await mkdir(claimDirectory, { mode: 0o700 })
      claimExists = true
      const noFollow = typeof constants.O_NOFOLLOW === 'number' ? constants.O_NOFOLLOW : 0
      file = await open(
        claimReceiptPath,
        constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | noFollow,
        0o600,
      )
      throwIfAborted(input.signal, input.operation)
      await writeReceipt(file, `${JSON.stringify(receipt, null, 2)}\n`)
      await file.close()
      file = undefined
      throwIfAborted(input.signal, input.operation)

      try {
        await rename(claimDirectory, lockDirectory)
        claimExists = false
      } catch (publishError) {
        try {
          await unlink(claimReceiptPath)
          await rmdir(claimDirectory)
          claimExists = false
        } catch (cleanupError) {
          if (!isErrno(cleanupError, 'ENOENT')) {
            throw lockError(
              'COMMUNITY_OPERATION_LOCK_INITIALIZATION_CLEANUP_FAILED',
              'Inspect the unpublished claim locally before retrying; it was not reused.',
              { requestedOperation: input.operation },
            )
          }
          claimExists = false
        }
        const state = await assertLockDirectoryIsSafe(lockDirectory, instanceDirectory)
        if (state === 'directory') {
          throw existingLockError(
            input.operation,
            await readExistingReceipt(lockDirectory, instanceDirectory),
            thresholdMs,
          )
        }
        throw publishError
      }
    } catch (error) {
      await file?.close().catch(() => undefined)
      file = undefined
      if (claimExists) {
        try {
          await unlink(claimReceiptPath).catch((cleanupError) => {
            if (!isErrno(cleanupError, 'ENOENT')) throw cleanupError
          })
          await rmdir(claimDirectory).catch((cleanupError) => {
            if (!isErrno(cleanupError, 'ENOENT')) throw cleanupError
          })
        } catch {
          throw lockError(
            'COMMUNITY_OPERATION_LOCK_INITIALIZATION_CLEANUP_FAILED',
            'Inspect the unpublished claim locally before retrying; it was not reused.',
            { requestedOperation: input.operation },
          )
        }
      }
      if (error instanceof CommunityOperationLockError) throw error
      throw lockError(
        'COMMUNITY_OPERATION_LOCK_INITIALIZATION_FAILED',
        'The incomplete lock was removed; correct the write failure and retry.',
        { requestedOperation: input.operation },
      )
    }

    let released = false
    let releaseInFlight: Promise<CommunityOperationLockRelease> | undefined
    const release = async (candidateOwnerToken: string): Promise<CommunityOperationLockRelease> => {
      if (
        !OWNER_TOKEN_PATTERN.test(candidateOwnerToken)
        || !ownerTokenDigestsMatch(ownerTokenSha256, hashOwnerToken(candidateOwnerToken))
      ) {
        throw lockError(
          'COMMUNITY_OPERATION_LOCK_NOT_OWNER',
          'Keep the operation handle and use only its receipt owner token for release.',
          { requestedOperation: input.operation },
        )
      }
      if (released) return Object.freeze({ status: 'already-released' })
      if (releaseInFlight) {
        await releaseInFlight
        return Object.freeze({ status: 'already-released' })
      }

      releaseInFlight = (async () => {
        const state = await assertLockDirectoryIsSafe(lockDirectory, instanceDirectory)
        const current = state === 'directory'
          ? await readReceiptFile(ownedReceiptPath, lockDirectory)
          : undefined
        if (!current || !ownerTokenDigestsMatch(ownerTokenSha256, current.ownerTokenSha256)) {
          throw lockError(
            'COMMUNITY_OPERATION_LOCK_OWNERSHIP_LOST',
            'Do not remove the current lock; inspect ownership before retrying.',
            { requestedOperation: input.operation },
          )
        }
        await beforeOwnedReceiptUnlink?.()
        try {
          await unlink(ownedReceiptPath)
        } catch (error) {
          if (isErrno(error, 'ENOENT')) {
            throw lockError(
              'COMMUNITY_OPERATION_LOCK_OWNERSHIP_LOST',
              'Do not remove the current lock; a different lock generation is now visible.',
              { requestedOperation: input.operation },
            )
          }
          throw lockError(
            'COMMUNITY_OPERATION_LOCK_RELEASE_FAILED',
            'Inspect the owned lock locally and retry its release without starting another operation.',
            { requestedOperation: input.operation },
          )
        }
        try {
          await rmdir(lockDirectory)
        } catch (error) {
          if (!isErrno(error, 'ENOENT')) {
            const successor = await readExistingReceipt(lockDirectory, instanceDirectory).catch(() => undefined)
            if (!successor || ownerTokenDigestsMatch(ownerTokenSha256, successor.ownerTokenSha256)) {
              throw lockError(
                'COMMUNITY_OPERATION_LOCK_RELEASE_FAILED',
                'The owner receipt was removed but the lock directory is not safely empty.',
                { requestedOperation: input.operation },
              )
            }
          }
        }
        released = true
        return Object.freeze({ status: 'released' }) as CommunityOperationLockRelease
      })()

      try {
        return await releaseInFlight
      } catch (error) {
        releaseInFlight = undefined
        throw error
      }
    }

    return Object.freeze({ receipt, ownerToken, release })
  }

  const withLock = async <T>(
    input: AcquireCommunityOperationLockInput,
    operation: (context: CommunityOperationLockContext) => Promise<T>,
  ): Promise<T> => {
    const handle = await acquire(input)
    let result: T
    try {
      throwIfAborted(input.signal, input.operation)
      result = await operation(Object.freeze({ receipt: handle.receipt, signal: input.signal }))
    } catch (operationError) {
      try {
        await handle.release(handle.ownerToken)
      } catch (releaseError) {
        throw new AggregateError(
          [operationError, releaseError],
          'The Community operation failed and its owned lock could not be released.',
        )
      }
      throw operationError
    }
    await handle.release(handle.ownerToken)
    return result
  }

  return Object.freeze({ acquire, inspect, recoverStale, withLock })
}

const defaultService = createCommunityOperationLockService()

export function acquireCommunityOperationLock(
  input: AcquireCommunityOperationLockInput,
): Promise<CommunityOperationLockHandle> {
  return defaultService.acquire(input)
}

export function inspectCommunityOperationLock(
  input: InspectCommunityOperationLockInput,
): Promise<CommunityOperationLockInspection> {
  return defaultService.inspect(input)
}

export function recoverStaleCommunityOperationLock(
  input: RecoverStaleCommunityOperationLockInput,
): Promise<CommunityOperationLockRecovery> {
  return defaultService.recoverStale(input)
}

export function withCommunityOperationLock<T>(
  input: AcquireCommunityOperationLockInput,
  operation: (context: CommunityOperationLockContext) => Promise<T>,
): Promise<T> {
  return defaultService.withLock(input, operation)
}
