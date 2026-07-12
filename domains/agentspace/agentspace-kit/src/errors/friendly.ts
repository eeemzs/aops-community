import {
  XfInputRequiredError,
  XfMessageType,
  XfNotFoundError,
  XfResult,
  XfValidationError,
  failure,
  invalid,
  xfAddMsg,
} from '@aopslab/xf-core'
import { RepositoryError, type RepositoryErrorCode } from '@aopslab/xf-db'
import * as Cause from 'effect/Cause'
import { FiberFailureCauseId } from 'effect/Runtime'
import { normalizeNonEmpty } from '../shared/tool-input.js'

export type FriendlyMessageType = 'error' | 'validation'

export interface FriendlyMessage {
  key: string
  field?: string
  params?: Record<string, string>
  type?: FriendlyMessageType
}

export interface XfFriendlyError {
  scope: string
  code: string
  status?: number
  severity: 'user' | 'system'
  messages: FriendlyMessage[]
  logLevel?: 'debug' | 'info' | 'warn' | 'error'
  trace?: {
    stage?: string
    operation?: string
  }
  cause?: unknown
}

const DOMAIN_SCOPE = 'aops'

const RUNTIME_SQL_PATTERNS = [
  /failed query:/i,
  /\bparams:\s*\[/i,
  /\binsert into\b/i,
  /\bupdate\b.+\bset\b/i,
  /\bdelete from\b/i,
  /\bselect\b.+\bfrom\b/i,
  /\bsqlite/i,
  /\bpostgres/i,
  /\bdrizzle/i,
]
const INPUT_VALIDATION_PATTERNS = [
  /missing_required_arg:/i,
  /unknown_input_arg:/i,
  /tool_input_schema_invalid:/i,
  /invalid_input/i,
  /validation/i,
  /input required/i,
]
const NOT_FOUND_PATTERNS = [/record not found/i, /not found/i, /not[_\s-]?found/i]
const UNAUTHORIZED_PATTERNS = [/^unauthorized$/i, /auth required/i, /missing access token/i]
const FORBIDDEN_PATTERNS = [/^forbidden$/i, /permission denied/i]
const CONFLICT_PATTERNS = [/duplicate/i, /already exists/i, /conflict/i, /e11000/i]
const RATE_LIMIT_PATTERNS = [/rate limit/i, /too many requests/i, /too many attempts/i]
const INVALID_REFERENCE_PATTERNS = [
  /\bforeign key\b/i,
  /violates foreign key/i,
  /foreign key kısıtlamasını ihlal ediyor/i,
  /anahtarı mevcut değildir/i,
  /is not present in table/i,
]

function normalizeRepositoryErrorCode(value: unknown): RepositoryErrorCode | undefined {
  switch (value) {
    case 'NotFound':
    case 'UniqueViolation':
    case 'MultipleRecordsFound':
    case 'MultipleRecordsReturned':
    case 'NoRecordReturned':
    case 'DeleteRecordNotFound':
    case 'ForeignKeyViolation':
    case 'NotNullViolation':
    case 'CheckViolation':
    case 'Exception':
      return value
    default:
      return undefined
  }
}

function isRepositoryErrorLike(candidate: unknown): candidate is {
  message?: unknown
  code?: unknown
  _tag?: unknown
} {
  return Boolean(candidate) && typeof candidate === 'object' && (candidate instanceof RepositoryError || (candidate as { _tag?: unknown })._tag === 'RepositoryError')
}

function extractTrace(error: unknown): { stage?: string; operation?: string } | undefined {
  if (!error || typeof error !== 'object') return undefined
  const rec = error as Record<PropertyKey, unknown>
  const stage = typeof rec.stage === 'string' ? rec.stage : undefined
  const operation = typeof rec.operation === 'string' ? rec.operation : undefined
  if (!stage && !operation) return undefined
  return { stage, operation }
}

function unwrapEffectError(error: unknown): unknown {
  if (error && typeof error === 'object') {
    const rec = error as Record<PropertyKey, unknown>
    const key = FiberFailureCauseId as unknown as PropertyKey
    const cause = rec[key] as unknown
    if (cause) {
      const root = cause as Cause.Cause<unknown>
      const failureCause = Cause.failureOption(root)
      if (failureCause._tag === 'Some') return failureCause.value
      const defect = Cause.dieOption(root)
      if (defect._tag === 'Some') return defect.value
    }
  }
  return error
}

function collectErrorCandidates(root: unknown, maxDepth = 6): unknown[] {
  const queue: Array<{ value: unknown; depth: number }> = [{ value: root, depth: 0 }]
  const seen = new Set<unknown>()
  const out: unknown[] = []

  while (queue.length > 0) {
    const next = queue.shift()
    if (!next) continue
    const { value, depth } = next
    if (value === undefined || value === null) continue
    if (seen.has(value)) continue
    seen.add(value)
    out.push(value)

    if (depth >= maxDepth) continue
    if (typeof value !== 'object') continue

    const rec = value as Record<PropertyKey, unknown>
    const nested: unknown[] = []

    if (value instanceof Error) {
      const errorCause = (value as Error & { cause?: unknown }).cause
      if (errorCause !== undefined) nested.push(errorCause)
    }

    if ('cause' in rec && rec.cause !== undefined) nested.push(rec.cause)
    if ('error' in rec && rec.error !== undefined) nested.push(rec.error)
    if ('errors' in rec && rec.errors !== undefined) {
      if (Array.isArray(rec.errors)) nested.push(...rec.errors)
      else nested.push(rec.errors)
    }

    for (const candidate of nested) {
      queue.push({ value: candidate, depth: depth + 1 })
    }
  }

  return out
}

function classifyCandidate(candidate: unknown): XfFriendlyError | null {
  if (candidate instanceof XfValidationError || candidate instanceof XfInputRequiredError) {
    return wrapValidation(candidate)
  }
  if (candidate instanceof XfNotFoundError) {
    return wrapNotFound(candidate)
  }
  if (isRepositoryErrorLike(candidate)) {
    const message = normalizeNonEmpty(extractCandidateMessage(candidate)) ?? ''
    const code = normalizeRepositoryErrorCode(candidate.code)
    if (
      code === 'NotFound' ||
      code === 'DeleteRecordNotFound' ||
      code === 'NoRecordReturned' ||
      code === 'ForeignKeyViolation'
    ) {
      return wrapNotFound(candidate)
    }
    if (code === 'UniqueViolation' || code === 'MultipleRecordsFound' || code === 'MultipleRecordsReturned') {
      return wrapConflict(candidate)
    }
    if (code === 'NotNullViolation' || code === 'CheckViolation') {
      return wrapValidation(candidate)
    }
    if (matches(CONFLICT_PATTERNS, message)) return wrapConflict(candidate)
    return wrapServiceUnavailable(candidate)
  }

  if (candidate instanceof Error) {
    const message = normalizeNonEmpty(candidate.message) ?? ''
    if (matches(UNAUTHORIZED_PATTERNS, message)) return wrapUnauthorized(candidate)
    if (matches(FORBIDDEN_PATTERNS, message)) return wrapForbidden(candidate)
    if (matches(NOT_FOUND_PATTERNS, message)) return wrapNotFound(candidate)
    if (matches(RATE_LIMIT_PATTERNS, message)) return wrapRateLimit(candidate)
    if (matches(CONFLICT_PATTERNS, message)) return wrapConflict(candidate)
    if (matches(INPUT_VALIDATION_PATTERNS, message)) return wrapValidation(candidate)
    if (matches(RUNTIME_SQL_PATTERNS, message)) return wrapServiceUnavailable(candidate)
    return null
  }

  if (typeof candidate === 'string') {
    if (matches(UNAUTHORIZED_PATTERNS, candidate)) return wrapUnauthorized(candidate)
    if (matches(FORBIDDEN_PATTERNS, candidate)) return wrapForbidden(candidate)
    if (matches(NOT_FOUND_PATTERNS, candidate)) return wrapNotFound(candidate)
    if (matches(RATE_LIMIT_PATTERNS, candidate)) return wrapRateLimit(candidate)
    if (matches(CONFLICT_PATTERNS, candidate)) return wrapConflict(candidate)
    if (matches(INPUT_VALIDATION_PATTERNS, candidate)) return wrapValidation(candidate)
    if (matches(RUNTIME_SQL_PATTERNS, candidate)) return wrapServiceUnavailable(candidate)
  }

  return null
}

function matches(patterns: RegExp[], value: string): boolean {
  return patterns.some((rx) => rx.test(value))
}

function extractCandidateMessage(candidate: unknown): string {
  if (typeof candidate === 'string') return candidate
  if (candidate instanceof Error) return candidate.message
  if (candidate && typeof candidate === 'object' && 'message' in candidate) {
    const value = (candidate as { message?: unknown }).message
    return typeof value === 'string' ? value : ''
  }
  return ''
}

function extractCandidateSearchText(candidate: unknown): string {
  const parts = [extractCandidateMessage(candidate)]
  if (candidate && typeof candidate === 'object') {
    try {
      parts.push(JSON.stringify(candidate))
    } catch {
      // ignore
    }
  }
  return parts.filter(Boolean).join(' ')
}

function hasInvalidReferenceSignal(candidate: unknown): boolean {
  return matches(INVALID_REFERENCE_PATTERNS, extractCandidateSearchText(candidate))
}

function buildFriendly(partial: Omit<XfFriendlyError, 'scope' | 'severity'> & { severity?: 'user' | 'system' }): XfFriendlyError {
  return {
    scope: DOMAIN_SCOPE,
    severity: partial.severity ?? 'user',
    ...partial,
  }
}

function wrapValidation(error: unknown): XfFriendlyError {
  let field: string | undefined
  if (error instanceof XfInputRequiredError) {
    const maybeField = (error as XfInputRequiredError & { field?: unknown }).field
    field = typeof maybeField === 'string' ? maybeField : undefined
  }

  return buildFriendly({
    code: `${DOMAIN_SCOPE}.validation`,
    status: 400,
    messages: [{ key: 'error__validation', field, type: 'validation' }],
    logLevel: 'info',
    trace: extractTrace(error),
    cause: error,
  })
}

function wrapNotFound(error: unknown): XfFriendlyError {
  return buildFriendly({
    code: `${DOMAIN_SCOPE}.notFound`,
    status: 404,
    messages: [{ key: 'error__notFound' }],
    logLevel: 'info',
    trace: extractTrace(error),
    cause: error,
  })
}

function wrapUnauthorized(error: unknown): XfFriendlyError {
  return buildFriendly({
    code: `${DOMAIN_SCOPE}.unauthorized`,
    status: 401,
    messages: [{ key: 'error__unauthorized' }],
    logLevel: 'info',
    trace: extractTrace(error),
    cause: error,
  })
}

function wrapForbidden(error: unknown): XfFriendlyError {
  return buildFriendly({
    code: `${DOMAIN_SCOPE}.forbidden`,
    status: 403,
    messages: [{ key: 'error__forbidden' }],
    logLevel: 'info',
    trace: extractTrace(error),
    cause: error,
  })
}

function wrapConflict(error: unknown): XfFriendlyError {
  return buildFriendly({
    code: `${DOMAIN_SCOPE}.conflict`,
    status: 409,
    messages: [{ key: 'error__conflict' }],
    logLevel: 'warn',
    trace: extractTrace(error),
    cause: error,
  })
}

function wrapRateLimit(error: unknown): XfFriendlyError {
  return buildFriendly({
    code: `${DOMAIN_SCOPE}.rateLimit`,
    status: 429,
    messages: [{ key: 'error__rateLimit' }],
    logLevel: 'warn',
    trace: extractTrace(error),
    cause: error,
  })
}

function wrapServiceUnavailable(error: unknown): XfFriendlyError {
  return buildFriendly({
    code: `${DOMAIN_SCOPE}.serviceUnavailable`,
    status: 503,
    messages: [{ key: 'error__serviceUnavailable' }],
    logLevel: 'error',
    severity: 'system',
    trace: extractTrace(error),
    cause: error,
  })
}

function wrapUnexpected(error: unknown): XfFriendlyError {
  return buildFriendly({
    code: `${DOMAIN_SCOPE}.unexpected`,
    status: 500,
    messages: [{ key: 'error__unexpected' }],
    logLevel: 'error',
    severity: 'system',
    trace: extractTrace(error),
    cause: error,
  })
}

export function toFriendlyError(inputError: unknown): XfFriendlyError {
  const unwrapped = unwrapEffectError(inputError)
  const candidates = collectErrorCandidates(unwrapped)
  const invalidReferenceCandidate = candidates.find((candidate) => hasInvalidReferenceSignal(candidate))
  if (invalidReferenceCandidate) {
    return wrapNotFound(invalidReferenceCandidate)
  }
  for (const candidate of candidates) {
    const classified = classifyCandidate(candidate)
    if (classified) return classified
  }

  return wrapUnexpected(unwrapped)
}

type ResultMessageOpts = {
  code: string
  domain: string
  field?: string
  params?: Record<string, string>
  trace?: {
    stage?: string
    operation?: string
  }
}

function toResultMessageOptsGeneric(opts: ResultMessageOpts) {
  const { code, domain, field, params, trace } = opts
  return {
    code,
    path: field,
    domain,
    stage: trace?.stage,
    operation: trace?.operation,
    debug: params ? { params } : undefined,
  }
}

function sanitizeCause(cause: unknown): unknown {
  if (cause instanceof Error) {
    return { name: cause.name, message: cause.message }
  }
  if (cause && typeof cause === 'object') {
    try {
      JSON.stringify(cause)
      return cause as object
    } catch {
      return undefined
    }
  }
  return cause
}

function sanitizeParams(params?: Record<string, unknown>): Record<string, string> | undefined {
  if (!params || typeof params !== 'object') return undefined
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(params)) {
    if (typeof value === 'string') out[key] = value
    else if (value != null) out[key] = String(value)
  }
  return out
}

function sanitizeMessages(messages: FriendlyMessage[]): FriendlyMessage[] {
  return messages.map((message) => ({
    key: String(message.key || ''),
    field: typeof message.field === 'string' ? message.field : undefined,
    params: sanitizeParams(message.params as Record<string, unknown> | undefined),
    type: message.type === 'validation' ? 'validation' : message.type === 'error' ? 'error' : undefined,
  }))
}

function sanitizeTrace(trace?: { stage?: unknown; operation?: unknown }): { stage?: string; operation?: string } | undefined {
  if (!trace || typeof trace !== 'object') return undefined
  const stage = typeof trace.stage === 'string' ? trace.stage : undefined
  const operation = typeof trace.operation === 'string' ? trace.operation : undefined
  if (!stage && !operation) return undefined
  return { stage, operation }
}

function sanitizeFriendly(friendly: XfFriendlyError): XfFriendlyError {
  return {
    ...friendly,
    messages: sanitizeMessages(Array.isArray(friendly.messages) ? friendly.messages : []),
    trace: sanitizeTrace(friendly.trace),
    cause: sanitizeCause(friendly.cause),
  }
}

function appendMessagesGeneric<TData, TError>(
  result: XfResult<TData, TError>,
  messages: FriendlyMessage[],
  friendly: XfFriendlyError
): XfResult<TData, TError> {
  return messages.reduce((acc, message) => {
    return xfAddMsg(
      acc,
      message.type === 'validation' ? XfMessageType.ValidationErr : XfMessageType.Error,
      message.key,
      toResultMessageOptsGeneric({
        code: message.key,
        domain: friendly.scope,
        field: message.field,
        params: message.params,
        trace: friendly.trace,
      })
    )
  }, result)
}

export function friendlyErrorToResult<TData = unknown>(friendly: XfFriendlyError): XfResult<TData, XfFriendlyError> {
  const safe = sanitizeFriendly(friendly)
  const [primary, ...rest] = safe.messages.length ? safe.messages : [{ key: 'error__unexpected' }]
  const factory = primary.type === 'validation' ? invalid<TData, XfFriendlyError> : failure<TData, XfFriendlyError>

  let result = factory({
    messageText: primary.key,
    opts: toResultMessageOptsGeneric({
      code: primary.key,
      domain: safe.scope,
      field: primary.field,
      params: primary.params,
      trace: safe.trace,
    }),
    error: safe,
  })

  if (rest.length > 0) {
    result = appendMessagesGeneric(result, rest, safe)
  }

  return result
}

export function friendlyErrorToResultI18n<TData = unknown, TKey extends string = string>(
  friendly: XfFriendlyError,
  t: (key: TKey, params?: Record<string, string>) => string
): XfResult<TData, XfFriendlyError> {
  const safe = sanitizeFriendly(friendly)
  const [primary, ...rest] = safe.messages.length ? safe.messages : [{ key: 'error__unexpected' } as FriendlyMessage]
  const primaryText = t(primary.key as TKey, primary.params)
  const factory = primary.type === 'validation' ? invalid<TData, XfFriendlyError> : failure<TData, XfFriendlyError>

  let result = factory({
    messageText: primaryText,
    opts: toResultMessageOptsGeneric({
      code: primary.key,
      domain: safe.scope,
      field: primary.field,
      params: primary.params,
      trace: safe.trace,
    }),
    error: safe,
  })

  if (rest.length > 0) {
    result = rest.reduce((acc, message) => {
      return xfAddMsg(
        acc,
        message.type === 'validation' ? XfMessageType.ValidationErr : XfMessageType.Error,
        t(message.key as TKey, message.params),
        toResultMessageOptsGeneric({
          code: message.key,
          domain: safe.scope,
          field: message.field,
          params: message.params,
          trace: safe.trace,
        })
      )
    }, result)
  }

  return result
}

export function friendlyErrorToHttpBody(friendly: XfFriendlyError) {
  const safe = sanitizeFriendly(friendly)
  return {
    ok: false as const,
    code: safe.code,
    severity: safe.severity,
    messages: safe.messages,
  }
}

export function errorToResult<TData = unknown>(error: unknown): XfResult<TData, XfFriendlyError> {
  return friendlyErrorToResult<TData>(toFriendlyError(error))
}
