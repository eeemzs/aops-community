import { createHash } from 'node:crypto'

import type { HostRequestContext } from '@aopslab/host-core'
import type { FederatedCatalogTool, FederatedCatalogToolSource } from '@aopslab/manifest'
import type { XfLogger } from '@aopslab/xf-logger'

import { getLogger } from '$lib/server/logger'

import type { AgentGatewayInvokeArgs, AgentGatewayInvokeResult } from './types'

export const AGENT_INVOKE_AUDIT_POLICY = {
  enabled: true,
  sink: 'structured-server-log',
  persistence: 'best-effort',
  events: ['preview', 'blocked', 'success', 'failure', 'replayed'] as const,
  approvalMode: 'explicit-confirm-flag',
} as const

const GUARDED_WRITE_IDEMPOTENCY_MODE = 'best-effort-host-cache'
const IDEMPOTENCY_ENTRY_TTL_MS = 10 * 60 * 1000

type InvokeIdempotencyEntry = {
  fingerprint: string
  expiresAt: number
  state: 'pending' | 'completed'
  result?: AgentGatewayInvokeResult
}

type InvokeIdempotencySelection = {
  tool: FederatedCatalogTool
  source: FederatedCatalogToolSource
  args: AgentGatewayInvokeArgs
}

export type InvokeGovernancePreview = {
  audit: typeof AGENT_INVOKE_AUDIT_POLICY
  approval: {
    mode: 'none' | 'explicit-confirm-flag'
    required: boolean
    satisfied: boolean
    provided: boolean
  }
  idempotency: {
    supported: boolean
    mode: 'not-applicable' | typeof GUARDED_WRITE_IDEMPOTENCY_MODE
    provided: boolean
    key: string | null
    recommendedKey: string | null
    recommendedKeySource?: 'host-derived' | 'domain-natural-key'
    enforced: false
  }
  nextIdempotencyKey?: string
}

export type InvokeIdempotencyReservation =
  | {
      kind: 'skip'
      recommendedKey?: string
    }
  | {
      kind: 'resolved'
      result: AgentGatewayInvokeResult
      idempotencyStatus: 'replayed' | 'in-progress' | 'conflict'
      recommendedKey: string
    }
  | {
      kind: 'active'
      key: string
      recommendedKey: string
      settle: (result: AgentGatewayInvokeResult) => void
      release: () => void
    }

type AgentInvokeAuditEvent = {
  tool: FederatedCatalogTool
  requestedSourceId?: string
  effectiveSourceId?: string
  outcome: 'preview' | 'blocked' | 'success' | 'failure' | 'replayed'
  status: number
  durationMs?: number
  context?: HostRequestContext
  apply?: boolean
  confirm?: boolean
  idempotencyKey?: string
  idempotencyStatus?: 'fresh' | 'replayed' | 'in-progress' | 'conflict'
  preview?: boolean
  errorCode?: string
}

const idempotencyStore = new Map<string, InvokeIdempotencyEntry>()
let loggerPromise: Promise<XfLogger | undefined> | null = null

function normalizeText(value: unknown): string {
  if (typeof value !== 'string') return ''
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : ''
}

function normalizeRoles(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  const roles = value.map((entry) => normalizeText(entry)).filter(Boolean)
  return roles.length > 0 ? roles : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function cloneHeaders(headers?: Record<string, string>): Record<string, string> | undefined {
  if (!headers) return undefined
  return { ...headers }
}

function cloneResult(result: AgentGatewayInvokeResult): AgentGatewayInvokeResult {
  return {
    tool: { ...result.tool },
    status: result.status,
    data: result.data,
    headers: cloneHeaders(result.headers),
  }
}

function attachHeaders(
  result: AgentGatewayInvokeResult,
  headers: Record<string, string>,
): AgentGatewayInvokeResult {
  return {
    ...cloneResult(result),
    headers: {
      ...(result.headers ?? {}),
      ...headers,
    },
  }
}

function toCanonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((entry) => toCanonicalValue(entry))
  if (!isRecord(value)) return value

  const output: Record<string, unknown> = {}
  for (const key of Object.keys(value).sort((left, right) => left.localeCompare(right))) {
    const nextValue = toCanonicalValue(value[key])
    if (nextValue === undefined) continue
    output[key] = nextValue
  }
  return output
}

function stableStringify(value: unknown): string {
  return JSON.stringify(toCanonicalValue(value))
}

function isGuardedWriteTool(tool: FederatedCatalogTool): boolean {
  const policy = isRecord(tool.policy) ? tool.policy : null
  const safety = policy && isRecord(policy.safety) ? policy.safety : null
  return safety?.applyRequired === true || safety?.destructive === true || safety?.confirmationRequired === true
}

function buildApprovalMode(tool: FederatedCatalogTool): 'none' | 'explicit-confirm-flag' {
  const policy = isRecord(tool.policy) ? tool.policy : null
  const safety = policy && isRecord(policy.safety) ? policy.safety : null
  return safety?.confirmationRequired === true ? 'explicit-confirm-flag' : 'none'
}

function buildInvokeFingerprint(selection: InvokeIdempotencySelection): string {
  const fingerprintInput = {
    toolId: selection.tool.toolId,
    requestedSourceId: selection.source.id,
    input: selection.args.input ?? null,
    context: {
      tenantId: normalizeText(selection.args.context?.tenantId) || null,
      scopeId:
        normalizeText(selection.args.context?.scopeId) ||
        normalizeText(selection.args.context?.projectId) ||
        null,
      locale: normalizeText(selection.args.context?.locale) || null,
      fallbackLocale: normalizeText(selection.args.context?.fallbackLocale) || null,
    },
    apply: selection.args.apply === true,
    confirm: selection.args.confirm === true,
  }
  return createHash('sha256').update(stableStringify(fingerprintInput)).digest('hex')
}

export function buildRecommendedInvokeIdempotencyKey(selection: InvokeIdempotencySelection): string {
  const digest = buildInvokeFingerprint(selection).slice(0, 16)
  return `${selection.tool.toolId}:${digest}`
}

function buildStoreKey(selection: InvokeIdempotencySelection, idempotencyKey: string): string {
  return [
    selection.tool.toolId,
    selection.source.id,
    normalizeText(selection.args.context?.tenantId) || 'tenant',
    normalizeText(selection.args.context?.scopeId) ||
      normalizeText(selection.args.context?.projectId) ||
      'scope',
    idempotencyKey,
  ].join('::')
}

function cleanupExpiredEntries(now = Date.now()): void {
  for (const [key, entry] of idempotencyStore.entries()) {
    if (entry.expiresAt > now) continue
    idempotencyStore.delete(key)
  }
}

function buildIdempotencyPayload(
  selection: InvokeIdempotencySelection,
  args: {
    error: 'idempotency_in_progress' | 'idempotency_key_conflict'
    key: string
    message: string
    recommendedKey: string
  },
): AgentGatewayInvokeResult {
  return {
    tool: {
      ...selection.tool,
      sourceId: selection.source.id,
      sourceKind: selection.source.kind,
      sourceBaseUrl: selection.source.baseUrl,
      sourceApiBasePath: selection.source.apiBasePath,
    },
    status: 409,
    data: {
      ok: false,
      error: args.error,
      toolId: selection.tool.toolId,
      domain: selection.tool.domain,
      operationId: selection.tool.operationId,
      message: args.message,
      idempotency: {
        mode: GUARDED_WRITE_IDEMPOTENCY_MODE,
        key: args.key,
        recommendedKey: args.recommendedKey,
      },
    },
    headers: {
      'x-agent-idempotency-status': args.error === 'idempotency_in_progress' ? 'in-progress' : 'conflict',
      'x-agent-idempotency-key': args.key,
    },
  }
}

function isSuccessfulResult(result: AgentGatewayInvokeResult): boolean {
  if (result.status >= 400) return false
  if (!isRecord(result.data)) return true
  return result.data.ok !== false
}

export function buildInvokeGovernancePreview(
  selection: InvokeIdempotencySelection,
  requirements: {
    applyRequired: boolean
    applySatisfied: boolean
    confirmationRequired: boolean
    confirmationSatisfied: boolean
  },
  options: {
    recommendedKey?: string
    recommendedKeySource?: 'host-derived' | 'domain-natural-key'
  } = {},
): InvokeGovernancePreview {
  const providedKey = normalizeText(selection.args.idempotencyKey)
  const guarded = isGuardedWriteTool(selection.tool)
  const overrideRecommendedKey = normalizeText(options.recommendedKey)
  const recommendedKey = guarded
    ? overrideRecommendedKey || buildRecommendedInvokeIdempotencyKey(selection)
    : null
  const recommendedKeySource = guarded
    ? overrideRecommendedKey
      ? options.recommendedKeySource ?? 'domain-natural-key'
      : 'host-derived'
    : undefined
  const nextIdempotencyKey = providedKey || recommendedKey || undefined

  return {
    audit: AGENT_INVOKE_AUDIT_POLICY,
    approval: {
      mode: buildApprovalMode(selection.tool),
      required: requirements.confirmationRequired,
      satisfied: requirements.confirmationSatisfied,
      provided: selection.args.confirm === true,
    },
    idempotency: {
      supported: isGuardedWriteTool(selection.tool),
      mode: isGuardedWriteTool(selection.tool) ? GUARDED_WRITE_IDEMPOTENCY_MODE : 'not-applicable',
      provided: Boolean(providedKey),
      key: providedKey || null,
      recommendedKey,
      ...(recommendedKeySource ? { recommendedKeySource } : {}),
      enforced: false,
    },
    ...(nextIdempotencyKey ? { nextIdempotencyKey } : {}),
  }
}

export function reserveInvokeIdempotency(
  selection: InvokeIdempotencySelection,
  options: {
    recommendedKey?: string
    effectiveKey?: string
  } = {},
): InvokeIdempotencyReservation {
  const guarded = isGuardedWriteTool(selection.tool)
  const overrideRecommendedKey = normalizeText(options.recommendedKey)
  const recommendedKey = guarded
    ? overrideRecommendedKey || buildRecommendedInvokeIdempotencyKey(selection)
    : ''
  const key = normalizeText(selection.args.idempotencyKey) || normalizeText(options.effectiveKey)
  if (!guarded || selection.args.preview === true || !key) {
    return {
      kind: 'skip',
      ...(recommendedKey ? { recommendedKey } : {}),
    }
  }

  cleanupExpiredEntries()

  const storeKey = buildStoreKey(selection, key)
  const fingerprint = buildInvokeFingerprint(selection)
  const existing = idempotencyStore.get(storeKey)

  if (existing) {
    if (existing.fingerprint !== fingerprint) {
      return {
        kind: 'resolved',
        result: buildIdempotencyPayload(selection, {
          error: 'idempotency_key_conflict',
          key,
          recommendedKey,
          message: `idempotency_key_conflict:${selection.tool.toolId}`,
        }),
        idempotencyStatus: 'conflict',
        recommendedKey,
      }
    }

    if (existing.state === 'pending') {
      return {
        kind: 'resolved',
        result: buildIdempotencyPayload(selection, {
          error: 'idempotency_in_progress',
          key,
          recommendedKey,
          message: `idempotency_in_progress:${selection.tool.toolId}`,
        }),
        idempotencyStatus: 'in-progress',
        recommendedKey,
      }
    }

    if (existing.state === 'completed' && existing.result) {
      return {
        kind: 'resolved',
        result: attachHeaders(cloneResult(existing.result), {
          'x-agent-idempotency-status': 'replayed',
          'x-agent-idempotency-key': key,
        }),
        idempotencyStatus: 'replayed',
        recommendedKey,
      }
    }
  }

  idempotencyStore.set(storeKey, {
    fingerprint,
    expiresAt: Date.now() + IDEMPOTENCY_ENTRY_TTL_MS,
    state: 'pending',
  })

  return {
    kind: 'active',
    key,
    recommendedKey,
    settle(result) {
      if (isSuccessfulResult(result)) {
        idempotencyStore.set(storeKey, {
          fingerprint,
          expiresAt: Date.now() + IDEMPOTENCY_ENTRY_TTL_MS,
          state: 'completed',
          result: attachHeaders(cloneResult(result), {
            'x-agent-idempotency-status': 'fresh',
            'x-agent-idempotency-key': key,
          }),
        })
        return
      }
      idempotencyStore.delete(storeKey)
    },
    release() {
      idempotencyStore.delete(storeKey)
    },
  }
}

async function resolveAuditLogger(): Promise<XfLogger | undefined> {
  if (!loggerPromise) {
    loggerPromise = getLogger({ level: 'info', file: false, console: true }).catch(() => undefined)
  }
  return await loggerPromise
}

function toFailureStatus(message: string): number {
  if (message === 'unauthorized') return 401
  if (message === 'forbidden') return 403
  if (
    message.startsWith('apply_required:') ||
    message.startsWith('confirmation_required:') ||
    message === 'project_context_required' ||
    message === 'project_required' ||
    message.startsWith('missing_required_arg:') ||
    message.startsWith('unknown_input_arg:') ||
    message.startsWith('tool_input_schema_invalid:') ||
    message.startsWith('validation_failed:') ||
    message.startsWith('idempotency_in_progress:') ||
    message.startsWith('idempotency_key_conflict:')
  ) {
    return 409
  }
  if (message.startsWith('tool_not_found:')) return 404
  return 500
}

export function buildInvokeFailureStatus(error: unknown): number {
  const message = error instanceof Error ? error.message : String(error ?? 'unknown_error')
  return toFailureStatus(message)
}

export async function writeAgentInvokeAuditEvent(event: AgentInvokeAuditEvent): Promise<void> {
  const payload = {
    owner: 'agent-gateway',
    action: event.preview === true ? 'preview' : 'invoke',
    toolId: event.tool.toolId,
    domain: event.tool.domain,
    operationId: event.tool.operationId,
    requestedSourceId: normalizeText(event.requestedSourceId),
    effectiveSourceId: normalizeText(event.effectiveSourceId),
    result: event.outcome,
    status: event.status,
    durationMs: typeof event.durationMs === 'number' && Number.isFinite(event.durationMs) ? event.durationMs : undefined,
    tenantId: normalizeText(event.context?.tenantId),
    scopeId:
      normalizeText(event.context?.scopeId) ||
      normalizeText(event.context?.projectId),
    actorId:
      normalizeText(event.context?.principal && isRecord(event.context.principal) ? event.context.principal.id : undefined) ||
      undefined,
    roles: normalizeRoles(event.context?.principal && isRecord(event.context.principal) ? event.context.principal.roles : undefined),
    preview: event.preview === true,
    apply: event.apply === true,
    confirm: event.confirm === true,
    approvalMode: buildApprovalMode(event.tool),
    idempotencyKey: normalizeText(event.idempotencyKey) || undefined,
    idempotencyStatus: event.idempotencyStatus,
    errorCode: normalizeText(event.errorCode) || undefined,
    audit: AGENT_INVOKE_AUDIT_POLICY,
  }

  const message = `[agent-invoke:audit] ${payload.toolId} ${payload.result}`

  try {
    const logger = await resolveAuditLogger()
    if (payload.result === 'failure' || payload.result === 'blocked') {
      if (logger?.warn) {
        await logger.warn(payload, message)
        return
      }
      console.warn(message, payload)
      return
    }

    if (logger?.info) {
      await logger.info(payload, message)
      return
    }
    console.info(message, payload)
  } catch {
    if (payload.result === 'failure' || payload.result === 'blocked') {
      console.warn(message, payload)
      return
    }
    console.info(message, payload)
  }
}
