import { buildOperationInputJsonSchema } from '@aopslab/xf-validation'

import type { DomainPlugin, DomainRequest, DomainRouteManifestEntry } from './types.js'
import { Ajv, type AnySchema, type ErrorObject, type ValidateFunction } from 'ajv'
import {
  buildAgentspaceHostRouteProjection,
  getAgentspaceContractSchema,
  getAgentspaceOperationIoSchemaRefs,
  getAgentspaceToolInputSchema,
  listAgentspaceOperationSpecs,
  mapErrorToFriendly,
  parseAgentspaceToolInput,
  runAgentspaceKitOperationByTypedId,
  type AgentspaceOperationInput,
  type AgentspaceTypedOperationId,
} from '@aopslab/domain-kit-agentspace'
import {
  hasNonEmptyValue,
  normalizeAgentspaceOperationInputForCompatibility,
  normalizeNonEmpty,
  resolveProjectContextValue,
  isProjectContextArgName,
  toRecord,
} from '@aopslab/domain-kit-agentspace/shared'
import {
  buildContextScopedInput,
  resolveOperationTimeoutMs,
  runWithOperationTimeout,
  toSafeFailureEnvelope,
} from './lifecycle-guards.js'
import {
  resolveAgentspacePluginOptions,
  type AgentspacePluginOptions,
  type AgentspaceResolvedPluginOptions,
  type AgentspaceRunner,
} from './plugin-config.js'
import {
  assertIntegratedHostStorageEnv,
  assertRuntimeEnv,
  resolveMissingRuntimeEnvKeys,
} from './runtime-env.js'

export type {
  AgentspacePluginOptions,
  AgentspaceRunner,
} from './plugin-config.js'

const HOST_CONTEXT_INPUT_KEYS = new Set([
  'tenantId',
  'projectId',
  'scopeId',
  'locale',
  'fallbackLocale',
])
void HOST_CONTEXT_INPUT_KEYS

const inputSchemaValidatorAjv = new Ajv({
  allErrors: true,
  strict: false,
  coerceTypes: false,
  allowUnionTypes: true,
})

type AgentspaceRequiredArg = ReadonlyArray<{ name: string; optional: boolean }>

type AgentspacePluginSetupStatus = 'idle' | 'ready' | 'failed'

type AgentspacePluginState = {
  routes: DomainRouteManifestEntry[]
  requiredArgsByOperationId: Map<AgentspaceTypedOperationId, AgentspaceRequiredArg>
  inputValidatorByOperationId: Map<AgentspaceTypedOperationId, ValidateFunction>
  projectionRefreshedAt: string
  runtimeEnvVerifiedAt: string | null
  setup: {
    attempts: number
    status: AgentspacePluginSetupStatus
    lastAttemptAt: string | null
    readyAt: string | null
    lastError: string | null
  }
}

const UNSAFE_RUNTIME_MESSAGE_PATTERNS = [
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
const RUNTIME_FAILURE_MESSAGE = 'Runtime operation failed. Check server logs for details.'
const INVALID_REFERENCE_MESSAGE_PATTERNS = [
  /\bforeign key\b/i,
  /violates foreign key constraint/i,
  /is not present in table/i,
  /anahtarı mevcut değildir/i,
]
const INVALID_REFERENCE_FAILURE_MESSAGE =
  'Referenced project or owner scope record was not found for the supplied ids.'

function buildRoutes(refresh: boolean): DomainRouteManifestEntry[] {
  return buildAgentspaceHostRouteProjection({ refresh }).map((route) => {
    const inputJsonSchema = buildOperationInputJsonSchema(
      getAgentspaceToolInputSchema(route.operation as AgentspaceTypedOperationId),
    )
    return {
      id: route.id,
      method: route.method,
      pattern: route.pattern,
      operation: route.operation,
      summary: route.summary,
      ...(inputJsonSchema ? { inputJsonSchema } : {}),
      buildInput: (request, params) => buildInputForOperation(route.operation as AgentspaceTypedOperationId, request, params),
    }
  })
}

function buildRequiredArgsByOperationId(refresh: boolean): Map<AgentspaceTypedOperationId, AgentspaceRequiredArg> {
  return new Map<AgentspaceTypedOperationId, AgentspaceRequiredArg>(
    listAgentspaceOperationSpecs({ refresh }).map((operation) => [
      operation.operationId as AgentspaceTypedOperationId,
      operation.args,
    ]),
  )
}

function createPluginState(options: AgentspaceResolvedPluginOptions): AgentspacePluginState {
  const refresh = options.refreshProjectionOnCreate
  return {
    routes: buildRoutes(refresh),
    requiredArgsByOperationId: buildRequiredArgsByOperationId(refresh),
    inputValidatorByOperationId: new Map<AgentspaceTypedOperationId, ValidateFunction>(),
    projectionRefreshedAt: new Date().toISOString(),
    runtimeEnvVerifiedAt: null,
    setup: {
      attempts: 0,
      status: 'idle',
      lastAttemptAt: null,
      readyAt: null,
      lastError: null,
    },
  }
}

function extractErrorMessage(error: unknown): string | null {
  return normalizeNonEmpty(error instanceof Error ? error.message : error) ?? null
}

function ensureRuntimeEnvReady(
  state: AgentspacePluginState,
  requiredRuntimeEnv: string[],
  enforceRuntimeEnv: boolean,
): void {
  if (!enforceRuntimeEnv) return
  if (state.runtimeEnvVerifiedAt) return
  assertRuntimeEnv(requiredRuntimeEnv)
  assertIntegratedHostStorageEnv()
  state.runtimeEnvVerifiedAt = new Date().toISOString()
}

function runPluginSetup(
  state: AgentspacePluginState,
  options: AgentspaceResolvedPluginOptions,
  enforceRuntimeEnv: boolean,
): void {
  state.setup.attempts += 1
  state.setup.lastAttemptAt = new Date().toISOString()

  try {
    ensureRuntimeEnvReady(state, options.requiredRuntimeEnv, enforceRuntimeEnv)
    state.setup.status = 'ready'
    state.setup.readyAt = new Date().toISOString()
    state.setup.lastError = null
  } catch (error) {
    state.setup.status = 'failed'
    state.setup.readyAt = null
    state.setup.lastError = extractErrorMessage(error) ?? 'plugin_setup_failed'
    throw error
  }
}

function isAgentspaceTypedOperationId(
  operationId: string,
  requiredArgsByOperationId: Map<AgentspaceTypedOperationId, AgentspaceRequiredArg>,
): operationId is AgentspaceTypedOperationId {
  return requiredArgsByOperationId.has(operationId as AgentspaceTypedOperationId)
}

function formatSchemaErrors(errors: ErrorObject[] | null | undefined): string {
  if (!errors || errors.length === 0) return 'invalid_input'
  const first = errors[0]
  const path = first.instancePath && first.instancePath.length > 0 ? first.instancePath : '/'
  const message = first.message ?? first.keyword
  return `${path} ${message}`.trim()
}

function resolveInputValidator(state: AgentspacePluginState, operationId: AgentspaceTypedOperationId): ValidateFunction | null {
  const existing = state.inputValidatorByOperationId.get(operationId)
  if (existing) return existing

  const refs = getAgentspaceOperationIoSchemaRefs(operationId)
  const schema = getAgentspaceContractSchema(refs.inputRef)
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) return null

  const validator = inputSchemaValidatorAjv.compile(schema as AnySchema)
  state.inputValidatorByOperationId.set(operationId, validator)
  return validator
}

function validateInputBySchema(
  state: AgentspacePluginState,
  operationId: AgentspaceTypedOperationId,
  input: Record<string, unknown>,
): void {
  const validator = resolveInputValidator(state, operationId)
  if (!validator) return
  const valid = validator(input)
  if (valid) return
  const detail = formatSchemaErrors(validator.errors)
  throw new Error(`tool_input_schema_invalid:agentspace.${operationId}:${detail}`)
}

function resolveProjectValue(input: Record<string, unknown>): string | undefined {
  return resolveProjectContextValue(input)
}

function hasRequiredOperationArg(input: Record<string, unknown>, argName: string): boolean {
  if (isProjectContextArgName(argName)) return hasNonEmptyValue(resolveProjectValue(input))
  return hasNonEmptyValue(input[argName])
}

function assignTypedValue<TInput>(
  target: Partial<TInput>,
  key: string,
  value: unknown,
): void {
  ;(target as Record<string, unknown>)[key] = value
}

void hasRequiredOperationArg
void assignTypedValue

function isUnsafeRuntimeMessage(message: string): boolean {
  return UNSAFE_RUNTIME_MESSAGE_PATTERNS.some((pattern) => pattern.test(message))
}

function isInvalidReferenceMessage(message: string): boolean {
  return INVALID_REFERENCE_MESSAGE_PATTERNS.some((pattern) => pattern.test(message))
}

function toExecutionReason(error: unknown, friendlyCode?: string, friendlyMessage?: string): string {
  const candidates = [
    normalizeNonEmpty(friendlyCode),
    normalizeNonEmpty(friendlyMessage),
    normalizeNonEmpty(error instanceof Error ? error.message : error),
  ].filter(Boolean) as string[]

  if (candidates.some((candidate) => isInvalidReferenceMessage(candidate))) {
    return 'invalid_reference'
  }

  for (const candidate of candidates) {
    const lower = candidate.trim().toLowerCase()
    if (!lower) continue

    if (lower.startsWith('aops.validation') || lower.startsWith('agentspace.validation')) return 'invalid_input'
    if (lower.startsWith('aops.notfound') || lower.startsWith('agentspace.notfound')) return 'not_found'
    if (lower.startsWith('aops.unauthorized') || lower.startsWith('agentspace.unauthorized')) return 'unauthorized'
    if (lower.startsWith('aops.forbidden') || lower.startsWith('agentspace.forbidden')) return 'forbidden'
    if (lower.startsWith('aops.conflict') || lower.startsWith('agentspace.conflict')) return 'conflict'
    if (lower.startsWith('aops.ratelimit') || lower.startsWith('agentspace.ratelimit')) return 'rate_limit'
    if (
      lower.startsWith('aops.serviceunavailable') ||
      lower.startsWith('agentspace.serviceunavailable')
    ) {
      return 'service_unavailable'
    }

    const colonPrefix = lower.match(/^([a-z][a-z0-9_]+):/)
    if (colonPrefix && colonPrefix[1] !== 'failed') {
      return colonPrefix[1]
    }

    const knownCode = lower.match(
      /\b(runtime_env_missing|plugin_contract_invalid|project_context_required|missing_required_[a-z0-9_]+|invalid_[a-z0-9_]+|tool_input_schema_invalid|unknown_input_[a-z0-9_]+|not_found|unauthorized|forbidden)\b/
    )
    if (knownCode) return knownCode[1]
    if (lower.includes('record not found') || lower.includes('not found')) return 'not_found'
    if (lower === 'unauthorized') return 'unauthorized'
    if (lower === 'forbidden') return 'forbidden'
    if (lower.includes('input required') || lower.includes('validation')) return 'invalid_input'
  }

  return 'runtime'
}

function toErrorStatus(reason: string, message: string): number {
  if (reason === 'unauthorized' || message.toLowerCase() === 'unauthorized') return 401
  if (reason === 'forbidden' || message.toLowerCase() === 'forbidden') return 403
  if (reason === 'not_found' || reason === 'invalid_reference' || /record not found/i.test(message)) return 404
  if (reason === 'conflict') return 409
  if (reason === 'project_context_required') return 409
  if (reason === 'rate_limit') return 429
  if (reason === 'runtime_env_missing') return 503
  if (reason === 'service_unavailable') return 503
  if (
    reason === 'invalid_input' ||
    reason === 'validation_failed' ||
    reason === 'missing_required_arg' ||
    reason === 'unknown_input_arg' ||
    reason === 'tool_input_schema_invalid' ||
    reason.startsWith('missing_required_') ||
    reason.startsWith('invalid_') ||
    reason.startsWith('unknown_input_') ||
    /validation_failed:/i.test(message) ||
    /missing_required_arg:/i.test(message) ||
    /unknown_input_arg:/i.test(message) ||
    /tool_input_schema_invalid:/i.test(message)
  ) {
    return 400
  }
  return 500
}

function toSafeErrorMessage(reason: string, message: string, status: number): string {
  const normalized = normalizeNonEmpty(message) ?? ''
  if (reason === 'invalid_reference') return INVALID_REFERENCE_FAILURE_MESSAGE
  if (status === 404) {
    if (!normalized || normalized === RUNTIME_FAILURE_MESSAGE || isUnsafeRuntimeMessage(normalized)) {
      return 'Record not found'
    }
    return normalized
  }

  if (status >= 500) {
    if (!normalized || isUnsafeRuntimeMessage(normalized)) {
      return RUNTIME_FAILURE_MESSAGE
    }
  }
  if (normalized) return normalized
  if (status === 400) return 'Invalid input'
  if (status === 401) return 'Unauthorized'
  if (status === 403) return 'Forbidden'
  return RUNTIME_FAILURE_MESSAGE
}

function toTypedOperationInput<TId extends AgentspaceTypedOperationId>(
  state: AgentspacePluginState,
  operationId: TId,
  input: Record<string, unknown>,
): AgentspaceOperationInput<TId> {
  void state
  return parseAgentspaceToolInput(operationId, input)
}

function parseMaybeJson(value: string): unknown {
  const trimmed = value.trim()
  if (!trimmed) return value
  if (trimmed === 'true') return true
  if (trimmed === 'false') return false
  if (!Number.isNaN(Number(trimmed)) && trimmed !== '') return Number(trimmed)
  if (
    (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
    (trimmed.startsWith('[') && trimmed.endsWith(']'))
  ) {
    try {
      return JSON.parse(trimmed)
    } catch {
      return value
    }
  }
  return value
}

function buildQueryPayload(query: URLSearchParams): Record<string, unknown> {
  const payload: Record<string, unknown> = {}
  for (const [key, rawValue] of query.entries()) {
    payload[key] = parseMaybeJson(rawValue)
  }
  return payload
}

function payloadFromBody(body: unknown): Record<string, unknown> {
  return toRecord(body)
}

function buildInputForOperation(
  _operationId: AgentspaceTypedOperationId,
  request: DomainRequest,
  params: Record<string, string>,
): Record<string, unknown> {
  const query = buildQueryPayload(request.query)
  const body = payloadFromBody(request.body)
  const payload: Record<string, unknown> = {
    ...query,
    ...body,
    ...params,
  }

  return payload
}

function resolveRunner(options: AgentspaceResolvedPluginOptions): AgentspaceRunner {
  const defaultRunner: AgentspaceRunner = <TId extends AgentspaceTypedOperationId>(
    operationId: TId,
    input: AgentspaceOperationInput<TId>,
  ) => runAgentspaceKitOperationByTypedId(operationId, input)
  return options.runner ?? defaultRunner
}

export function createAgentspacePlugin(options: AgentspacePluginOptions = {}): DomainPlugin {
  const resolvedOptions = resolveAgentspacePluginOptions(options)
  const state = createPluginState(resolvedOptions)
  const runner = resolveRunner(resolvedOptions)
  const runnerMode = resolvedOptions.runner
    ? 'custom'
    : '@aopslab/domain-kit-agentspace#runAgentspaceKitOperationByTypedId'
  const enforceRuntimeEnv = resolvedOptions.runner === undefined

  return {
    contract: 'v1',
    domain: 'agentspace',
    version: 'v1',
    capabilities: ['project', 'task', 'prompt', 'skill', 'agent'],
    manifest: {
      domain: 'agentspace',
      version: 'v1',
      routes: state.routes,
      meta: {
        adapter: 'agentspace-kit-operation-runner',
        runner: resolvedOptions.runner
          ? 'custom'
          : '@aopslab/domain-kit-agentspace#runAgentspaceKitOperationByTypedId',
        routeProjection: '@aopslab/domain-kit-agentspace#buildAgentspaceHostRouteProjection',
        projectionRefreshedAt: state.projectionRefreshedAt,
      },
    },
    setup: async () => {
      runPluginSetup(state, resolvedOptions, enforceRuntimeEnv)
    },
    health: async () => {
      const missingRuntimeEnv = enforceRuntimeEnv
        ? resolveMissingRuntimeEnvKeys(resolvedOptions.requiredRuntimeEnv)
        : []
      const runtimeOk = missingRuntimeEnv.length === 0
      return {
        ok: runtimeOk,
        details: {
          runner: runnerMode,
          operationTimeoutMs: resolvedOptions.operationTimeoutMs ?? 'default',
          requiredRuntimeEnv: enforceRuntimeEnv ? resolvedOptions.requiredRuntimeEnv : [],
          missingRuntimeEnv,
          projectionRefreshOnCreate: resolvedOptions.refreshProjectionOnCreate,
          projectionRefreshedAt: state.projectionRefreshedAt,
          routesCount: state.routes.length,
          validatorCacheSize: state.inputValidatorByOperationId.size,
          setupStatus: state.setup.status,
          setupAttempts: state.setup.attempts,
          setupLastAttemptAt: state.setup.lastAttemptAt,
          setupReadyAt: state.setup.readyAt,
          setupLastError: state.setup.lastError,
          runtimeEnvVerifiedAt: state.runtimeEnvVerifiedAt,
        },
      }
    },
    execute: async ({ request, match }) => {
      const operationIdRaw = match.route.operation
      if (!isAgentspaceTypedOperationId(operationIdRaw, state.requiredArgsByOperationId)) {
        throw new Error(`unknown_agentspace_operation:${operationIdRaw}`)
      }
      const operationId = operationIdRaw

      const inputBase = match.route.buildInput ? match.route.buildInput(request, match.params) : {}
      const operationTimeoutMs = resolveOperationTimeoutMs(operationId, resolvedOptions)
      const locale =
        normalizeNonEmpty(request.context.locale) ??
        normalizeNonEmpty(request.context.fallbackLocale)
      const localeOpts = locale ? { locale } : undefined

      try {
        ensureRuntimeEnvReady(state, resolvedOptions.requiredRuntimeEnv, enforceRuntimeEnv)
        const scopedInput = buildContextScopedInput(inputBase, request.context, resolvedOptions.defaultTenantId)
        const normalizedInput = normalizeAgentspaceOperationInputForCompatibility(operationId, scopedInput)
        const typedInput = toTypedOperationInput(state, operationId, normalizedInput)
        validateInputBySchema(state, operationId, typedInput as Record<string, unknown>)
        const output = await runWithOperationTimeout(operationId, operationTimeoutMs, () =>
          runner(operationId, typedInput)
        )
        return output
      } catch (error) {
        const friendly = mapErrorToFriendly(error, localeOpts)
        const rawMessage =
          normalizeNonEmpty(error instanceof Error ? error.message : error) ??
          normalizeNonEmpty(friendly.message) ??
          ''
        const reason = toExecutionReason(error, friendly.code, rawMessage)
        const derivedStatus = toErrorStatus(reason, rawMessage)
        const status =
          derivedStatus === 500 && typeof friendly.status === 'number' && Number.isFinite(friendly.status)
            ? friendly.status
            : derivedStatus
        const safeMessage = toSafeErrorMessage(reason, rawMessage || friendly.message, status)

        console.error('[agentspace-plugin] operation failed', {
          operationId,
          operationTimeoutMs,
          status,
          reason,
          code: friendly.code,
          message: rawMessage,
          error,
        })

        return toSafeFailureEnvelope({
          operationId,
          reason,
          status,
          message: safeMessage,
        })
      }
    },
  }
}
