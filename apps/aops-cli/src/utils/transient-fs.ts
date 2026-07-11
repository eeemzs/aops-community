import fs from 'node:fs/promises'
import { setTimeout as delay } from 'node:timers/promises'

type FsErrorLike = {
  code?: unknown
  errno?: unknown
  syscall?: unknown
}

export type TransientFsRetryOptions = {
  attempts?: number
  baseDelayMs?: number
  maxDelayMs?: number
  jitterMs?: number
  platform?: NodeJS.Platform
}

const DEFAULT_RETRY_OPTIONS: Required<Omit<TransientFsRetryOptions, 'platform'>> = {
  attempts: 8,
  baseDelayMs: 50,
  maxDelayMs: 1500,
  jitterMs: 75,
}

const RETRYABLE_CODES = new Set(['EBUSY', 'EPERM', 'EACCES'])

function isRecord(value: unknown): value is FsErrorLike {
  return value !== null && typeof value === 'object'
}

function normalizeString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined
}

export function isTransientFsError(error: unknown, platform: NodeJS.Platform = process.platform): boolean {
  if (!isRecord(error)) return false
  const code = normalizeString(error.code)
  const syscall = normalizeString(error.syscall)
  if (code && RETRYABLE_CODES.has(code)) return true
  return platform === 'win32' && code === 'UNKNOWN' && (!syscall || ['open', 'write', 'close'].includes(syscall))
}

function retryDelayMs(attemptIndex: number, options: Required<Omit<TransientFsRetryOptions, 'platform'>>): number {
  const exponential = Math.min(options.maxDelayMs, options.baseDelayMs * 2 ** attemptIndex)
  const jitter = options.jitterMs > 0 ? Math.floor(Math.random() * (options.jitterMs + 1)) : 0
  return exponential + jitter
}

export async function withTransientFsRetry<T>(
  operation: () => Promise<T>,
  options: TransientFsRetryOptions = {},
): Promise<T> {
  const resolved = {
    ...DEFAULT_RETRY_OPTIONS,
    ...options,
  }
  const attempts = Math.max(1, Math.floor(resolved.attempts))
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await operation()
    } catch (error) {
      if (attempt >= attempts - 1 || !isTransientFsError(error, options.platform)) throw error
      await delay(retryDelayMs(attempt, resolved))
    }
  }
}

export async function writeFileWithRetry(
  filePath: Parameters<typeof fs.writeFile>[0],
  data: Parameters<typeof fs.writeFile>[1],
  options?: Parameters<typeof fs.writeFile>[2],
): Promise<void> {
  await withTransientFsRetry(() => fs.writeFile(filePath, data, options))
}
