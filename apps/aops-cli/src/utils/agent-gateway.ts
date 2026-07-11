import { logError } from '@aopslab/xf-cli-ui'
import {
  buildHostedToolInvokeRequestBody,
  buildOperatorHeaders,
} from '@aopslab/xf-cli-operator'
export { parseJsonInput } from '@aopslab/xf-cli-operator'

import {
  createCliApiClientFromOptions,
  isCliHostReachable,
  isCliAuthRequired,
  type CliApiClientState,
} from './api.js'
import {
  normalizeNonEmpty,
  type CommonOptions,
} from './command.js'
import {
  hydrateProjectIdFromServerLookup,
  resolveProjectBindingContext,
  type HydrateProjectContextDeps,
  type ResolvedProjectBindingContext,
} from './project-context.js'

export type AgentGatewayContextOptions = CommonOptions & {
  tenantId?: string
  locale?: string
  fallbackLocale?: string
  scopeId?: string
  scopeResolution?: 'explicit' | 'cascade'
  projectId?: string
  projectName?: string
  projectSlug?: string
}

export type HostedToolInvokeOptions = AgentGatewayContextOptions & {
  toolId: string
  sourceId?: string
  input?: unknown
  preview?: boolean
  apply?: boolean
  confirm?: boolean
  idempotencyKey?: string
  disableDurableActivityLog?: boolean
}

function normalizeScopeResolution(value: unknown): 'explicit' | 'cascade' | undefined {
  return value === 'explicit' || value === 'cascade' ? value : undefined
}

export type ResolvedAgentGatewayContext = {
  tenantId?: string
  locale?: string
  fallbackLocale?: string
  scopeId?: string
  projectId?: string
  projectName?: string
  scopeResolution?: 'explicit' | 'cascade'
}

export async function resolveAgentGatewayContext(
  options: AgentGatewayContextOptions,
): Promise<ResolvedAgentGatewayContext> {
  const resolvedContext = await resolveProjectBindingContext(options, {
    requireProject: false,
  })
  const projectName = normalizeNonEmpty(options.projectName) ?? normalizeNonEmpty(resolvedContext.projectName)

  return {
    tenantId: normalizeNonEmpty(options.tenantId),
    locale: normalizeNonEmpty(options.locale),
    fallbackLocale: normalizeNonEmpty(options.fallbackLocale),
    scopeId: normalizeNonEmpty(options.scopeId) ?? normalizeNonEmpty(resolvedContext.scopeId),
    projectId: normalizeNonEmpty(options.projectId) ?? resolvedContext.projectId,
    projectName,
    scopeResolution: normalizeScopeResolution(options.scopeResolution),
  }
}

/**
 * Build a hosted-invoke adapter for server-side project resolution that carries NO project
 * binding (no slug/name/id/scope). This keeps the `list-projects` lookup a clean tenant-scoped
 * read and guarantees no re-entrant slug/name resolution while building its own headers.
 */
function buildProjectLookupDeps(
  apiState: CliApiClientState,
  options: AgentGatewayContextOptions,
): HydrateProjectContextDeps {
  return {
    invokeHostedTool: ({ toolId, input }) =>
      invokeHostedToolWithApiState(apiState, {
        // Auth/tenant/locale/transport only — strip every project-binding field.
        apiBaseUrl: options.apiBaseUrl,
        accessToken: options.accessToken,
        refreshToken: options.refreshToken,
        timeoutMs: options.timeoutMs,
        tenantId: options.tenantId,
        locale: options.locale,
        fallbackLocale: options.fallbackLocale,
        toolId,
        input,
        disableDurableActivityLog: true,
      }),
  }
}

/**
 * Resolve a pending `--project-slug`/`--project-name` server lookup into explicit
 * projectId/scopeId options. The `--project-id`/`--scope-id` fast path produces no pending
 * lookup, so this is a no-op (no server call) for those. Returns options unchanged when there
 * is nothing to resolve.
 */
export async function resolveProjectScopeOptionsWithApiState<T extends AgentGatewayContextOptions>(
  apiState: CliApiClientState,
  options: T,
): Promise<T> {
  if (normalizeNonEmpty(options.projectId) ?? normalizeNonEmpty(options.scopeId)) {
    return options
  }
  if (!normalizeNonEmpty(options.projectSlug) && !normalizeNonEmpty(options.projectName)) {
    return options
  }

  const baseContext: ResolvedProjectBindingContext = await resolveProjectBindingContext(options, {
    requireProject: false,
  })
  if (!baseContext.pendingServerProjectLookup) {
    return options
  }

  const hydrated = await hydrateProjectIdFromServerLookup(baseContext, buildProjectLookupDeps(apiState, options))
  const projectId = normalizeNonEmpty(hydrated.projectId)
  if (!projectId) return options

  return {
    ...options,
    projectId,
    scopeId: normalizeNonEmpty(options.scopeId) ?? normalizeNonEmpty(hydrated.scopeId) ?? projectId,
    projectName: normalizeNonEmpty(hydrated.projectName) ?? normalizeNonEmpty(options.projectName),
  }
}

/**
 * Resolve a `ResolvedProjectBindingContext`'s pending `--project-slug`/`--project-name`
 * server lookup into populated id/scope/name/slug, mirroring the resolution
 * {@link invokeHostedToolWithApiState} performs internally via
 * {@link resolveProjectScopeOptionsWithApiState}.
 *
 * This exists so command JSON envelopes can render the RESOLVED project (post-lookup id)
 * in `resolvedContext` instead of the pre-hydration pending placeholder. It is a no-op
 * (no server call) when the context already carries a `projectId` (the `--project-id`
 * fast path) or has no pending lookup, so it never forces a redundant round-trip. Best
 * effort: on lookup failure the original context is returned unchanged — the authoritative
 * resolution still runs inside the hosted invoke, so cosmetics never block the command.
 */
export async function hydrateProjectContextWithApiState(
  apiState: CliApiClientState,
  options: AgentGatewayContextOptions,
  context: ResolvedProjectBindingContext,
): Promise<ResolvedProjectBindingContext> {
  if (normalizeNonEmpty(context.projectId) || !context.pendingServerProjectLookup) {
    return context
  }
  try {
    return await hydrateProjectIdFromServerLookup(context, buildProjectLookupDeps(apiState, options))
  } catch {
    return context
  }
}

export async function buildAgentContextHeaders(options: AgentGatewayContextOptions): Promise<Record<string, string>> {
  const resolved = await resolveAgentGatewayContext(options)
  return buildOperatorHeaders({
    tenantId: resolved.tenantId,
    locale: resolved.locale,
    fallbackLocale: resolved.fallbackLocale,
    scopeId: resolved.scopeId,
    projectId: resolved.projectId,
    projectName: normalizeNonEmpty(options.projectName) ?? normalizeNonEmpty(resolved.projectName),
    scopeResolution: resolved.scopeResolution,
  })
}

export async function requireApiState(options: CommonOptions): Promise<CliApiClientState | null> {
  const apiState = await createCliApiClientFromOptions(options)

  const accessToken = apiState.getAccessToken()
  if (!accessToken) {
    if ((await isCliAuthRequired(apiState, { timeoutMs: options.timeoutMs })) === false) {
      return apiState
    }
    if ((await isCliHostReachable(apiState, { timeoutMs: options.timeoutMs })) === false) {
      logError(
        `Cannot reach the API host at ${apiState.baseUrl}. Start the target host or provide --api-base-url. Trusted-local auth can only be detected while the host is running.`,
      )
      process.exitCode = 1
      return null
    }
    logError('Missing access token. Run `aops-cli auth login` or provide --access-token / AOPS_API_ACCESS_TOKEN.')
    process.exitCode = 1
    return null
  }

  return apiState
}

export async function invokeHostedToolWithApiState(
  apiState: CliApiClientState,
  options: HostedToolInvokeOptions,
): Promise<Record<string, unknown>> {
  // Server-first slug/name resolution chokepoint: if the caller passed
  // `--project-slug`/`--project-name` (without an explicit id and unresolved by the optional
  // config cache), resolve it to a project id here, where apiState exists. The `--project-id`
  // fast path and the binding-stripped lookup calls themselves are no-ops, so this neither
  // forces a redundant server round-trip nor recurses.
  const resolvedOptions = await resolveProjectScopeOptionsWithApiState(apiState, options)

  const requestBody = buildHostedToolInvokeRequestBody(resolvedOptions)
  const headers = await buildAgentContextHeaders(resolvedOptions)
  if (resolvedOptions.disableDurableActivityLog !== true) {
    headers['x-activity-source-kind'] = 'aops-cli'
  }

  return apiState.client.fetchJson<Record<string, unknown>>(
    `/api/agent/tools/${encodeURIComponent(resolvedOptions.toolId)}/invoke`,
    {
      method: 'POST',
      body: requestBody,
      headers,
      timeoutMs: resolvedOptions.timeoutMs,
    },
  )
}

export function unwrapHostedToolResult(payload: Record<string, unknown>): unknown {
  if (Object.prototype.hasOwnProperty.call(payload, 'response')) {
    return payload.response
  }
  return payload
}

type DurableActivityStatus = 'success' | 'error'
type DurableActivitySourceKind = 'aops-cli' | 'desktop' | 'runner' | 'system'

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function sanitizeActivityValue(value: unknown, depth = 0): unknown {
  if (depth > 3) return '[truncated]'
  if (typeof value === 'string') {
    const normalized = value.trim()
    if (normalized.length <= 400) return normalized
    return `${normalized.slice(0, 397)}...`
  }
  if (typeof value === 'number' || typeof value === 'boolean' || value === null || value === undefined) {
    return value
  }
  if (Array.isArray(value)) {
    return value.slice(0, 12).map((entry) => sanitizeActivityValue(entry, depth + 1))
  }
  if (!isRecord(value)) return String(value)

  const next: Record<string, unknown> = {}
  for (const [key, entry] of Object.entries(value)) {
    const lower = key.toLowerCase()
    if (lower.includes('token') || lower.includes('secret') || lower.includes('password') || lower.includes('authorization')) {
      continue
    }
    next[key] = sanitizeActivityValue(entry, depth + 1)
  }
  return next
}

type ActivityRef = { type: string; id: string; label?: string }

function maybePushRef(target: ActivityRef[], type: string, id: unknown, label?: string): void {
  const normalizedId = normalizeNonEmpty(id)
  if (!normalizedId) return
  if (target.some((entry) => entry.type === type && entry.id === normalizedId)) return
  target.push(label ? { type, id: normalizedId, label } : { type, id: normalizedId })
}

function collectRefsFromObject(value: unknown, refs: ActivityRef[]): void {
  if (!isRecord(value)) return
  maybePushRef(refs, 'project', value.projectId)
  maybePushRef(refs, 'scope', value.scopeId)
  maybePushRef(refs, 'task', value.taskId)
  maybePushRef(refs, 'sprint', value.sprintId)
  maybePushRef(refs, 'microtask', value.microtaskId)
  maybePushRef(refs, 'issue', value.issueId)
  maybePushRef(refs, 'feedback', value.feedbackId)
  maybePushRef(refs, 'prompt', value.promptId)
  maybePushRef(refs, 'prompt-version', value.promptVersionId)
  maybePushRef(refs, 'skill', value.skillId)
  maybePushRef(refs, 'skill-version', value.skillVersionId)
  maybePushRef(refs, 'resource', value.resourceId)
  maybePushRef(refs, 'artifact', value.artifactId)
  maybePushRef(refs, 'run', value.runId)
  maybePushRef(refs, 'run-record', value.runRecordId)
  maybePushRef(refs, 'workflow', value.workflowId ?? value.workflowInstanceId)
  maybePushRef(refs, 'workflow-definition', value.workflowDefinitionId)
  maybePushRef(refs, 'document', value.documentId)
  maybePushRef(refs, 'document-version', value.documentVersionId)
  maybePushRef(refs, 'page', value.pageId)
  maybePushRef(refs, 'page-version', value.pageVersionId)
  maybePushRef(refs, 'section', value.sectionId)

  if (isRecord(value.data)) collectRefsFromObject(value.data, refs)
  if (isRecord(value.input)) collectRefsFromObject(value.input, refs)
  if (isRecord(value.result)) collectRefsFromObject(value.result, refs)
  if (isRecord(value.response)) collectRefsFromObject(value.response, refs)
}

type DurableActivityContext = {
  scopeId?: string
  projectId?: string
  projectName?: string
}

async function resolveProjectContextById(
  apiState: CliApiClientState,
  options: AgentGatewayContextOptions,
  projectId: string,
): Promise<{ scopeId?: string }> {
  try {
    const headers = await buildAgentContextHeaders(options)
    const payload = await apiState.client.fetchJson<Record<string, unknown>>(
      `/api/agentspace/projects/${encodeURIComponent(projectId)}`,
      {
        method: 'GET',
        headers,
        timeoutMs: options.timeoutMs,
      },
    )
    if (isRecord(payload)) {
      const data = isRecord(payload.data) ? payload.data : payload
      return {
        scopeId: normalizeNonEmpty(data.id) ?? normalizeNonEmpty(data.projectId) ?? projectId,
      }
    }
  } catch {
    // best effort only
  }
  return {}
}

async function resolveDurableActivityContext(
  apiState: CliApiClientState,
  options: HostedToolInvokeOptions,
  resolved: ResolvedAgentGatewayContext,
  payload?: Record<string, unknown>,
): Promise<DurableActivityContext> {
  const scopeIdFromPayload =
    normalizeNonEmpty(isRecord(options.input) ? options.input.scopeId : undefined) ??
    normalizeNonEmpty(isRecord(payload) ? payload.scopeId : undefined)
  const projectId =
    normalizeNonEmpty(resolved.projectId) ??
    normalizeNonEmpty(isRecord(options.input) ? options.input.projectId : undefined) ??
    normalizeNonEmpty(isRecord(payload) ? payload.projectId : undefined)

  let scopeId = normalizeNonEmpty(resolved.scopeId) ?? scopeIdFromPayload
  if (projectId && !scopeId) {
    const projectContext = await resolveProjectContextById(apiState, options, projectId)
    if (!scopeId) scopeId = normalizeNonEmpty(projectContext.scopeId)
  }

  return {
    scopeId,
    projectId,
    projectName: resolved.projectName,
  }
}

export async function appendCliDurableActivityLogBestEffort(params: {
  apiState: CliApiClientState
  options: AgentGatewayContextOptions
  sourceKind?: DurableActivitySourceKind
  sourceId: string
  action: string
  status: DurableActivityStatus
  summary: string
  payload?: unknown
  refs?: Array<{ type: string; id: string; label?: string }>
}): Promise<void> {
  const resolved = await resolveAgentGatewayContext(params.options)
  const context = await resolveDurableActivityContext(
    params.apiState,
    { ...params.options, toolId: params.sourceId, apply: true },
    resolved,
    isRecord(params.payload) ? params.payload : undefined,
  )
  const scopeId = context.scopeId
  const projectId = context.projectId
  if (!scopeId || !projectId) return

  const refs: ActivityRef[] = []
  maybePushRef(refs, 'scope', scopeId)
  maybePushRef(refs, 'project', projectId)
  params.refs?.forEach((entry) => maybePushRef(refs, entry.type, entry.id, entry.label))
  collectRefsFromObject(params.payload, refs)

  try {
    const headers = await buildAgentContextHeaders({
      ...params.options,
      scopeId,
      projectId: context.projectId,
      projectName: context.projectName,
    })
    await params.apiState.client.fetchJson<Record<string, unknown>>(
      '/api/agentspace/operations/activity-item/add-activity-item',
      {
        method: 'POST',
        headers,
        body: {
          data: {
            scopeId,
            projectId,
            sourceKind: params.sourceKind ?? 'aops-cli',
            sourceId: params.sourceId,
            action: params.action,
            status: params.status,
            summary: params.summary,
            refs,
            payload: sanitizeActivityValue(params.payload),
          },
        },
        timeoutMs: params.options.timeoutMs,
      },
    )
  } catch {
    // best effort only
  }
}
