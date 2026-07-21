export const AGENT_ASSETS_SURFACE = 'agent-assets-client-v1' as const

export const AGENT_ASSETS_ERROR_CODES = [
  'not_found',
  'ambiguous',
  'remote_unavailable',
  'hash_mismatch',
  'untrusted_origin',
  'expected_manifest_required',
  'invalid_package_path',
  'link_unsafe_path',
  'binding_conflict',
  'concurrent_writer',
  'different_machine_store',
  'store_identity_mismatch',
  'publication_conflict',
  'atomic_replace_blocked',
  'atomic_primitive_unavailable',
  'durability_unavailable',
  'recovery_confirmation_required',
  'schema_incompatible',
  'rollback_unavailable',
] as const

export type AgentAssetsErrorCode = (typeof AGENT_ASSETS_ERROR_CODES)[number]

export type AgentAssetsDiagnosticV1 = Readonly<{
  code: string
  message: string
  details?: Readonly<Record<string, unknown>>
}>

export type AgentAssetsCommandErrorV1 = Readonly<{
  code: AgentAssetsErrorCode
  message: string
  nextActions: readonly string[]
  details?: Readonly<Record<string, unknown>>
}>

export type AgentAssetsCommandEnvelopeV1<T> = Readonly<{
  schemaVersion: 1
  command: `assets.${string}`
  surface: typeof AGENT_ASSETS_SURFACE
  ok: true
  result: T
  diagnostics: readonly AgentAssetsDiagnosticV1[]
  nextActions: readonly string[]
}>

export type AgentAssetsFailureEnvelopeV1 = Readonly<{
  schemaVersion: 1
  command: `assets.${string}`
  surface: typeof AGENT_ASSETS_SURFACE
  ok: false
  error: AgentAssetsCommandErrorV1
  diagnostics: readonly AgentAssetsDiagnosticV1[]
  nextActions: readonly string[]
}>

export class AgentAssetsError extends Error {
  readonly code: AgentAssetsErrorCode
  readonly nextActions: readonly string[]
  readonly details?: Readonly<Record<string, unknown>>

  constructor(
    code: AgentAssetsErrorCode,
    message: string,
    options: Readonly<{
      nextActions: readonly string[]
      details?: Readonly<Record<string, unknown>>
      cause?: unknown
    }>,
  ) {
    super(message, { cause: options.cause })
    this.name = 'AgentAssetsError'
    this.code = code
    this.nextActions = Object.freeze([...options.nextActions])
    this.details = options.details === undefined ? undefined : Object.freeze({ ...options.details })
  }
}

export function agentAssetsSuccess<T>(input: Readonly<{
  command: `assets.${string}`
  result: T
  diagnostics?: readonly AgentAssetsDiagnosticV1[]
  nextActions?: readonly string[]
}>): AgentAssetsCommandEnvelopeV1<T> {
  return Object.freeze({
    schemaVersion: 1,
    command: input.command,
    surface: AGENT_ASSETS_SURFACE,
    ok: true,
    result: input.result,
    diagnostics: Object.freeze([...(input.diagnostics ?? [])]),
    nextActions: Object.freeze([...(input.nextActions ?? [])]),
  })
}

export function agentAssetsFailure(
  command: `assets.${string}`,
  error: unknown,
  diagnostics: readonly AgentAssetsDiagnosticV1[] = [],
): AgentAssetsFailureEnvelopeV1 {
  const normalized = error instanceof AgentAssetsError
    ? error
    : new AgentAssetsError('schema_incompatible', error instanceof Error ? error.message : String(error), {
      nextActions: ['Run `aops assets status --verify quick --json` and inspect the reported diagnostics.'],
      cause: error,
    })
  const commandError = Object.freeze({
    code: normalized.code,
    message: normalized.message,
    nextActions: normalized.nextActions,
    ...(normalized.details === undefined ? {} : { details: normalized.details }),
  })
  return Object.freeze({
    schemaVersion: 1,
    command,
    surface: AGENT_ASSETS_SURFACE,
    ok: false,
    error: commandError,
    diagnostics: Object.freeze([...diagnostics]),
    nextActions: normalized.nextActions,
  })
}

export function assertBoundedDiscoveryEnvelope(
  envelope: AgentAssetsCommandEnvelopeV1<unknown>,
  candidateCount: number,
): void {
  if (candidateCount > 5) {
    throw new AgentAssetsError('schema_incompatible', 'Discovery returned more than five metadata candidates.', {
      nextActions: ['Retry with `--limit 5` or lower.'],
      details: { candidateCount, maximum: 5 },
    })
  }
  // The frozen budget applies to the complete discovery result before any
  // selected body is loaded. The common command envelope is transport
  // metadata shared by every assets command and is outside that result.
  const byteLength = Buffer.byteLength(JSON.stringify(envelope.result), 'utf8')
  if (byteLength > 2_048) {
    throw new AgentAssetsError('schema_incompatible', 'Discovery metadata result exceeds the 2 KiB pre-body budget.', {
      nextActions: ['Narrow the query or reduce `--limit`; do not load candidate bodies to compensate.'],
      details: { byteLength, maximumBytes: 2_048 },
    })
  }
}
