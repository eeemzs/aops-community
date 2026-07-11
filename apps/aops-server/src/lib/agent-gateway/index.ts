import { dispatchDomainRequest } from '@aopslab/host-core'
import type { DomainPluginRegistry } from '@aopslab/host-core'
import {
  buildAgentGatewayOpenApi,
  type FederatedCatalogTool,
  type FederatedCatalogToolSource,
  type FederatedToolCatalog,
} from '@aopslab/manifest'

import type { HostAgentGatewayConfig } from '$lib/host-config'

import { buildGatewayCatalogSnapshot, fetchRemoteRoutes } from './catalog'
import {
  chooseSourceForInvocation,
  createTimeoutController,
  findDomainRouteByOperation,
  findFirstRemoteSource,
  findRemoteRouteByOperation,
  normalizeApiBasePath,
  normalizeBaseUrl,
  normalizeDomain,
  normalizeInvokeInputForRoute,
  normalizeSourceId,
  normalizeToolId,
  parseFetchBody,
  parseRouteInvokeInput,
  patternToPathSegments,
  pickResponseHeaders,
  resolveSourceHeaders,
  shouldFallbackFromLocalError,
} from './helpers'
import { normalizeAgentGatewayOpenApiDocument } from './openapi-normalize'
import {
  buildInvokeFailureStatus,
  buildInvokeGovernancePreview,
  reserveInvokeIdempotency,
  writeAgentInvokeAuditEvent,
} from './invoke-hardening'
import { buildAgentSemanticPreview, resolveAgentSemanticIdempotencyKey } from './semantic-preview'
import type {
  AgentGatewayDomainDocs,
  AgentGatewayDomainMetadata,
  AgentGatewayDiagnostics,
  AgentGatewayInvokeArgs,
  AgentGatewayInvokeResult,
  AgentGatewayListResult,
  AgentGatewayOperationDocs,
  AgentGatewayOpenApiArgs,
  CreateAgentGatewayOptions,
  GatewayCatalogSnapshot,
} from './types'
import {
  resetToolSchemaValidationCache,
  resolveToolInvokeRequirements,
  validateToolInvokeAuthorization,
  validateToolInvokeSafety,
  validateToolInvokeScope,
  validateToolInputByContract,
  validateToolInputBySchema,
} from './validation'

const CATALOG_REFRESH_ERROR_PREFIXES = [
  'tool_not_found:',
  'tool_source_unavailable:',
  'tool_source_not_found:',
  'domain_not_registered:',
  'operation_route_not_found:',
] as const

const LOCAL_RUNTIME_REFRESH_ERROR_PREFIXES = [
  'domain_not_registered:',
  'operation_route_not_found:',
] as const

type DurableActivityStatus = 'success' | 'error'
type DurableActivitySourceKind = 'aops-cli' | 'desktop' | 'runner' | 'system'
type DurableActivityRef = {
  type: string
  id: string
  label?: string
}

const MUTATING_ACTIVITY_OPERATION_PATTERN =
  /(^|[.])(create|update|remove|delete|archive|publish|add|save|upsert|write|link|attach|enqueue|start|stop|interrupt|cancel|approve|dispatch|operate|loop|work|restore|copy|rebase|zip|clean)([.-]|$)/

function resolveGatewayConfig(config: HostAgentGatewayConfig | undefined): HostAgentGatewayConfig {
  return config ?? {
    enabled: true,
    includeLocal: true,
    sources: [],
    catalog: { enabled: false, manifestProviders: [] },
  }
}

function normalizeNonEmpty(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const normalized = value.trim()
  return normalized.length > 0 ? normalized : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function sanitizeActivityPayload(value: unknown, depth = 0): unknown {
  if (depth > 3) return '[truncated]'
  if (typeof value === 'string') {
    const normalized = value.trim()
    return normalized.length <= 400 ? normalized : `${normalized.slice(0, 397)}...`
  }
  if (typeof value === 'number' || typeof value === 'boolean' || value === null || value === undefined) {
    return value
  }
  if (Array.isArray(value)) {
    return value.slice(0, 12).map((entry) => sanitizeActivityPayload(entry, depth + 1))
  }
  if (!isRecord(value)) return String(value)

  const next: Record<string, unknown> = {}
  for (const [key, entry] of Object.entries(value)) {
    const lower = key.toLowerCase()
    if (lower.includes('token') || lower.includes('secret') || lower.includes('password') || lower.includes('authorization')) {
      continue
    }
    next[key] = sanitizeActivityPayload(entry, depth + 1)
  }
  return next
}

function maybePushActivityRef(target: DurableActivityRef[], type: string, id: unknown, label?: string): void {
  const normalizedId = normalizeNonEmpty(id)
  if (!normalizedId) return
  if (target.some((entry) => entry.type === type && entry.id === normalizedId)) return
  target.push(label ? { type, id: normalizedId, label } : { type, id: normalizedId })
}

function collectActivityRefs(value: unknown, refs: DurableActivityRef[]): void {
  if (!isRecord(value)) return
  maybePushActivityRef(refs, 'scope', value.scopeId)
  maybePushActivityRef(refs, 'project', value.projectId)
  maybePushActivityRef(refs, 'task', value.taskId)
  maybePushActivityRef(refs, 'sprint', value.sprintId)
  maybePushActivityRef(refs, 'microtask', value.microtaskId)
  maybePushActivityRef(refs, 'issue', value.issueId)
  maybePushActivityRef(refs, 'feedback', value.feedbackId)
  maybePushActivityRef(refs, 'prompt', value.promptId)
  maybePushActivityRef(refs, 'prompt-version', value.promptVersionId)
  maybePushActivityRef(refs, 'skill', value.skillId)
  maybePushActivityRef(refs, 'skill-version', value.skillVersionId)
  maybePushActivityRef(refs, 'resource', value.resourceId)
  maybePushActivityRef(refs, 'artifact', value.artifactId)
  maybePushActivityRef(refs, 'run', value.runId ?? value.runRecordId)
  maybePushActivityRef(refs, 'workflow', value.workflowId ?? value.workflowInstanceId)
  maybePushActivityRef(refs, 'workflow-definition', value.workflowDefinitionId)
  maybePushActivityRef(refs, 'document', value.documentId)
  maybePushActivityRef(refs, 'document-version', value.documentVersionId)
  maybePushActivityRef(refs, 'page', value.pageId)
  maybePushActivityRef(refs, 'page-version', value.pageVersionId)
  maybePushActivityRef(refs, 'section', value.sectionId)
  if (isRecord(value.data)) collectActivityRefs(value.data, refs)
  if (isRecord(value.input)) collectActivityRefs(value.input, refs)
  if (isRecord(value.response)) collectActivityRefs(value.response, refs)
  if (isRecord(value.result)) collectActivityRefs(value.result, refs)
}

function resolveGatewayActivityAction(tool: FederatedCatalogTool): string {
  const segments = String(tool.operationId ?? '').split('.').filter(Boolean)
  return segments[segments.length - 1] ?? 'invoke'
}

function summarizeGatewayActivity(tool: FederatedCatalogTool, status: DurableActivityStatus): string {
  const action = resolveGatewayActivityAction(tool)
  const entity = String(tool.toolId ?? tool.operationId ?? 'operation')
    .replace(/^aops\./, '')
    .replace(/^agentspace\./, '')
    .replace(/^tasker\./, '')
    .replace(/^projectman\./, '')
    .replace(/^docman\./, '')
    .replace(/^fileman\./, '')
    .split('.')
    .slice(0, 2)
    .join(' ')
    .replace(/[-_]+/g, ' ')
    .trim() || 'operation'
  const verbMap: Record<string, string> = {
    create: 'created',
    add: 'added',
    update: 'updated',
    set: 'updated',
    publish: 'published',
    remove: 'removed',
    delete: 'deleted',
    restore: 'restored',
    copy: 'copied',
    rebase: 'rebased',
    zip: 'archived',
    clean: 'cleaned',
    link: 'linked',
    attach: 'attached',
    enqueue: 'enqueued',
    start: 'started',
    stop: 'stopped',
    cancel: 'cancelled',
    interrupt: 'interrupted',
    approve: 'approved',
    save: 'saved',
    write: 'written',
    record: 'recorded',
    store: 'stored',
  }
  const actionKey = action.split('-')[0] ?? action
  const verb = verbMap[actionKey] ?? `${action.replace(/[-_]+/g, ' ')} completed`
  return status === 'success'
    ? `${entity} ${verb}`
    : `${entity} ${action.replace(/[-_]+/g, ' ')} failed`
}

function shouldAppendDurableGatewayActivity(tool: FederatedCatalogTool, args: AgentGatewayInvokeArgs): boolean {
  const normalizedToolId = normalizeToolId(tool.toolId)
  if (!normalizedToolId) return false
  if (args.preview === true) return false
  if (normalizedToolId.startsWith('agentspace.activity-item.')) return false
  if (args.apply !== true && args.confirm !== true) return false
  return (
    MUTATING_ACTIVITY_OPERATION_PATTERN.test(normalizedToolId)
    || MUTATING_ACTIVITY_OPERATION_PATTERN.test(String(tool.operationId ?? '').toLowerCase())
  )
}

function resolveGatewayActivitySourceKind(context: AgentGatewayInvokeArgs['context']): DurableActivitySourceKind {
  const candidate = normalizeNonEmpty(context?.activitySourceKind)
  if (candidate === 'aops-cli' || candidate === 'desktop' || candidate === 'runner' || candidate === 'system') {
    return candidate
  }
  return 'system'
}

function cloneStringList(values: unknown): string[] | undefined {
  if (!Array.isArray(values)) return undefined
  const normalized = values.map((value) => String(value ?? '').trim()).filter(Boolean)
  return normalized.length > 0 ? normalized : undefined
}

function mergeStringLists(...lists: Array<string[] | undefined>): string[] | undefined {
  const values = new Set<string>()
  for (const list of lists) {
    for (const entry of list ?? []) {
      const normalized = String(entry ?? '').trim()
      if (!normalized) continue
      values.add(normalized)
    }
  }
  return values.size > 0 ? [...values] : undefined
}

function toOperationDocs(value: unknown): AgentGatewayOperationDocs | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const input = value as Record<string, unknown>
  const summary =
    typeof input.summary === 'string' && input.summary.trim().length > 0 ? input.summary.trim() : undefined
  const notes = cloneStringList(input.notes)
  const examples = cloneStringList(input.examples)
  const antiPatterns = cloneStringList(input.antiPatterns)
  const preconditions = cloneStringList(input.preconditions)
  const postconditions = cloneStringList(input.postconditions)
  const docs: AgentGatewayOperationDocs = {
    ...(summary ? { summary } : {}),
    ...(notes ? { notes } : {}),
    ...(examples ? { examples } : {}),
    ...(antiPatterns ? { antiPatterns } : {}),
    ...(preconditions ? { preconditions } : {}),
    ...(postconditions ? { postconditions } : {}),
  }

  return Object.keys(docs).length > 0 ? docs : null
}

function toDomainDocs(value: unknown): AgentGatewayDomainDocs | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const input = value as Record<string, unknown>
  const summary =
    typeof input.summary === 'string' && input.summary.trim().length > 0 ? input.summary.trim() : undefined
  const notes = cloneStringList(input.notes)
  const docs: AgentGatewayDomainDocs = {
    ...(summary ? { summary } : {}),
    ...(notes ? { notes } : {}),
  }

  return Object.keys(docs).length > 0 ? docs : null
}

function buildDomainMetadataByDomain(
  snapshot: GatewayCatalogSnapshot,
  domain?: string,
): Record<string, AgentGatewayDomainMetadata> | undefined {
  const normalizedDomain = normalizeDomain(domain ?? '')
  const metadataByDomain: Record<string, AgentGatewayDomainMetadata> = {}

  for (const manifest of snapshot.manifests) {
    const manifestDomain = normalizeDomain(manifest.domain.id)
    if (!manifestDomain) continue
    if (normalizedDomain.length > 0 && manifestDomain !== normalizedDomain) continue

    const existing = metadataByDomain[manifestDomain]
    const domainDocs = toDomainDocs(manifest.docs?.domain)
    const resources = manifest.capabilities.resources ?? []
    const resourceDocsMap =
      manifest.docs?.resources && typeof manifest.docs.resources === 'object' && !Array.isArray(manifest.docs.resources)
        ? manifest.docs.resources
        : {}

    const mergedResources = new Map(
      (existing?.resources ?? []).map((resource) => [normalizeDomain(resource.resourceId), resource]),
    )

    for (const resource of resources) {
      const resourceId = String(resource.resourceId ?? '').trim().toLowerCase()
      if (!resourceId) continue
      const docEntryRaw = resourceDocsMap[resource.resourceId] ?? resourceDocsMap[resourceId]
      const docEntry = toDomainDocs(docEntryRaw)
      const current = mergedResources.get(resourceId)
      const title = current?.title ?? (String(resource.title ?? '').trim() || resourceId)
      const kind =
        current?.kind ??
        (typeof resource.kind === 'string' && resource.kind.trim().length > 0 ? resource.kind.trim() : undefined)
      const schemaRef =
        current?.schemaRef ??
        (typeof resource.schemaRef === 'string' && resource.schemaRef.trim().length > 0
          ? resource.schemaRef.trim()
          : undefined)
      mergedResources.set(resourceId, {
        resourceId,
        title,
        kind,
        schemaRef,
        summary: current?.summary ?? docEntry?.summary,
        notes: mergeStringLists(current?.notes, docEntry?.notes),
      })
    }

    const description =
      existing?.description ??
      (typeof manifest.domain.description === 'string' && manifest.domain.description.trim().length > 0
        ? manifest.domain.description.trim()
        : undefined)
    const summary = existing?.summary ?? domainDocs?.summary ?? description
    const notes = mergeStringLists(existing?.notes, domainDocs?.notes)

    metadataByDomain[manifestDomain] = {
      domain: manifestDomain,
      displayName:
        existing?.displayName ??
        (typeof manifest.domain.displayName === 'string' && manifest.domain.displayName.trim().length > 0
          ? manifest.domain.displayName.trim()
          : undefined),
      ...(description ? { description } : {}),
      ...(summary ? { summary } : {}),
      ...(notes ? { notes } : {}),
      ...(mergedResources.size > 0
        ? {
            resources: [...mergedResources.values()].sort((left, right) => left.title.localeCompare(right.title)),
          }
        : {}),
    }
  }

  return Object.keys(metadataByDomain).length > 0 ? metadataByDomain : undefined
}

function buildOperationDocsByOperationId(
  snapshot: GatewayCatalogSnapshot,
  domain?: string,
): Record<string, AgentGatewayOperationDocs> | undefined {
  const normalizedDomain = normalizeDomain(domain ?? '')
  const docsByOperationId: Record<string, AgentGatewayOperationDocs> = {}

  for (const manifest of snapshot.manifests) {
    if (normalizedDomain.length > 0 && normalizeDomain(manifest.domain.id) !== normalizedDomain) continue
    const operations = manifest.docs?.operations
    if (!operations || typeof operations !== 'object' || Array.isArray(operations)) continue

    for (const [operationIdRaw, value] of Object.entries(operations)) {
      const operationId = String(operationIdRaw ?? '').trim().toLowerCase()
      if (!operationId) continue
      const docs = toOperationDocs(value)
      if (!docs) continue
      docsByOperationId[operationId] = docs
    }
  }

  return Object.keys(docsByOperationId).length > 0 ? docsByOperationId : undefined
}

function buildListResult(snapshot: GatewayCatalogSnapshot, domain?: string): AgentGatewayListResult {
  const normalizedDomain = normalizeDomain(domain ?? '')
  const tools =
    normalizedDomain.length > 0
      ? snapshot.catalog.tools.filter((tool) => normalizeDomain(tool.domain) === normalizedDomain)
      : snapshot.catalog.tools
  const operationDocsByOperationId = buildOperationDocsByOperationId(snapshot, domain)
  const domainMetadataByDomain = buildDomainMetadataByDomain(snapshot, domain)

  return {
    catalogVersion: snapshot.catalog.catalogVersion,
    generatedAt: snapshot.catalog.generatedAt,
    tools,
    errors: snapshot.errors,
    ...(operationDocsByOperationId ? { operationDocsByOperationId } : {}),
    ...(domainMetadataByDomain ? { domainMetadataByDomain } : {}),
  }
}

function findToolInputJsonSchemaInManifests(
  snapshot: GatewayCatalogSnapshot,
  tool: FederatedCatalogTool,
): Record<string, unknown> | null {
  const inputSchemaRef = typeof tool.inputSchemaRef === 'string' ? tool.inputSchemaRef.trim() : ''
  if (!inputSchemaRef) return null
  const toolDomain = normalizeDomain(tool.domain)

  for (const manifest of snapshot.manifests) {
    if (normalizeDomain(manifest.domain.id) !== toolDomain) continue
    const schema = manifest.contracts?.schemas?.[inputSchemaRef]
    if (schema && typeof schema === 'object' && !Array.isArray(schema)) {
      return schema as Record<string, unknown>
    }
  }

  return null
}

function buildToolResponse(
  tool: FederatedCatalogTool,
  source: FederatedCatalogToolSource,
  status: number,
  data: unknown,
  headers?: Record<string, string>,
): AgentGatewayInvokeResult {
  return {
    tool: {
      ...tool,
      sourceId: source.id,
      sourceKind: source.kind,
      sourceBaseUrl: source.baseUrl,
      sourceApiBasePath: source.apiBasePath,
    },
    status,
    data,
    headers,
  }
}

function isSuccessfulInvokeResult(result: AgentGatewayInvokeResult): boolean {
  if (result.status >= 400) return false
  if (!result.data || typeof result.data !== 'object' || Array.isArray(result.data)) return true
  return (result.data as Record<string, unknown>).ok !== false
}

function appendPreviewQueryValue(target: Record<string, unknown>, key: string, value: string): void {
  const existing = target[key]
  if (existing === undefined) {
    target[key] = value
    return
  }
  if (Array.isArray(existing)) {
    existing.push(value)
    return
  }
  target[key] = [existing, value]
}

function toPreviewQueryObject(query: URLSearchParams): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, value] of query.entries()) {
    appendPreviewQueryValue(out, key, value)
  }
  return out
}

function buildPreviewHeaders(context: AgentGatewayInvokeArgs['context']): Record<string, string> {
  const headers: Record<string, string> = {}
  if (typeof context?.tenantId === 'string' && context.tenantId.trim().length > 0) {
    headers['x-tenant-id'] = context.tenantId.trim()
  }
  if (typeof context?.locale === 'string' && context.locale.trim().length > 0) {
    headers['x-locale'] = context.locale.trim()
  }
  if (typeof context?.fallbackLocale === 'string' && context.fallbackLocale.trim().length > 0) {
    headers['x-fallback-locale'] = context.fallbackLocale.trim()
  }
  if (typeof context?.projectId === 'string' && context.projectId.trim().length > 0) {
    headers['x-project-id'] = context.projectId.trim()
  }
  return headers
}

async function appendDurableGatewayActivityBestEffort(params: {
  registry: DomainPluginRegistry
  tool: FederatedCatalogTool
  args: AgentGatewayInvokeArgs
  status: DurableActivityStatus
  responseData?: unknown
  errorMessage?: string
}): Promise<void> {
  const scopeId = normalizeNonEmpty(params.args.context?.scopeId)
  const projectId = normalizeNonEmpty(params.args.context?.projectId)
  if (!scopeId && !projectId) return
  const resolvedScopeId = scopeId || projectId
  const refs: DurableActivityRef[] = []
  maybePushActivityRef(refs, 'scope', resolvedScopeId)
  maybePushActivityRef(refs, 'project', projectId)
  collectActivityRefs(params.args.input, refs)
  collectActivityRefs(params.responseData, refs)

  const requestHeaders = new Headers()
  const tenantId = normalizeNonEmpty(params.args.context?.tenantId)
  if (tenantId) requestHeaders.set('x-tenant-id', tenantId)
  const url = new URL('https://xf-host.local/api/agentspace/operations/activity-item/add-activity-item')

  const payload =
    params.status === 'error'
      ? {
          input: params.args.input,
          error: params.errorMessage ? { message: params.errorMessage } : undefined,
        }
      : {
          input: params.args.input,
          result: params.responseData,
        }

  try {
    await params.registry.ensureSetup('agentspace')
    await dispatchDomainRequest({
      registry: params.registry,
      request: {
        method: 'POST',
        domain: 'agentspace',
        path: ['operations', 'activity-item', 'add-activity-item'],
        query: new URLSearchParams(),
        body: {
          data: {
            scopeId: resolvedScopeId,
            projectId,
            sourceKind: resolveGatewayActivitySourceKind(params.args.context),
            sourceId: params.tool.toolId,
            action: resolveGatewayActivityAction(params.tool),
            status: params.status,
            summary: summarizeGatewayActivity(params.tool, params.status),
            refs,
            payload: sanitizeActivityPayload(payload),
          },
        },
        headers: requestHeaders,
        url,
        context: {
          ...(params.args.context ?? {}),
          scopeId: resolvedScopeId,
          ...(projectId ? { projectId } : {}),
        },
      },
    })
  } catch {
    // best effort only
  }
}

function buildPreflightInvokeBody(
  args: AgentGatewayInvokeArgs,
  requirements: ReturnType<typeof resolveToolInvokeRequirements>,
  nextIdempotencyKey?: string,
): Record<string, unknown> {
  return {
    ...(args.sourceId ? { sourceId: args.sourceId } : {}),
    input: args.input ?? {},
    ...(nextIdempotencyKey ? { idempotencyKey: nextIdempotencyKey } : {}),
    ...(requirements.applyRequired ? { apply: true } : {}),
    ...(requirements.confirmationRequired ? { confirm: true } : {}),
  }
}

function buildToolInvokePreviewPayload(params: {
  tool: FederatedCatalogTool
  source: FederatedCatalogToolSource
  route: { method: string; pattern: string }
  pathSegments: string[]
  parsedInput: ReturnType<typeof parseRouteInvokeInput>
  context: NonNullable<AgentGatewayInvokeArgs['context']>
  args: AgentGatewayInvokeArgs
  requestUrl?: string
}): Record<string, unknown> {
  const semantic = buildAgentSemanticPreview({
    domain: params.tool.domain,
    operationId: params.tool.operationId,
    input: params.parsedInput.body ?? params.args.input ?? {},
  })
  const requirements = resolveToolInvokeRequirements({
    tool: params.tool,
    context: params.context,
    apply: params.args.apply,
    confirm: params.args.confirm,
  })
  const governance = buildInvokeGovernancePreview(
    {
      tool: params.tool,
      source: params.source,
      args: params.args,
    },
    requirements,
    {
      recommendedKey: semantic?.idempotency?.recommendedKey,
      recommendedKeySource: semantic?.idempotency ? 'domain-natural-key' : undefined,
    },
  )
  const path =
    `/api/${normalizeDomain(params.tool.domain)}${params.pathSegments.length > 0 ? `/${params.pathSegments.join('/')}` : ''}`
  const headers = buildPreviewHeaders(params.context)

  return {
    ok: true,
    preview: true,
    mode: 'preflight',
    ready:
      requirements.authSatisfied &&
      requirements.scopeSatisfied &&
      requirements.applySatisfied &&
      requirements.confirmationSatisfied,
    tool: {
      toolId: params.tool.toolId,
      domain: params.tool.domain,
      operationId: params.tool.operationId,
      sourceId: params.source.id,
      sourceKind: params.source.kind,
    },
    route: {
      method: params.route.method,
      pattern: params.route.pattern,
      path,
      ...(params.requestUrl ? { requestUrl: params.requestUrl } : {}),
    },
    requirements: {
      auth: {
        required: requirements.authRequired,
        principalPresent: requirements.principalPresent,
        satisfied: requirements.authSatisfied,
        ...(requirements.rolesRequired.length > 0 ? { roles: requirements.rolesRequired } : {}),
        ...(requirements.capabilitiesRequired.length > 0
          ? { capabilities: requirements.capabilitiesRequired }
          : {}),
      },
      scope: {
        required: requirements.scopeRequired,
        satisfied: requirements.scopeSatisfied,
        ...(typeof params.context.scopeId === 'string' && params.context.scopeId.trim().length > 0
          ? { scopeId: params.context.scopeId.trim() }
          : typeof params.context.projectId === 'string' && params.context.projectId.trim().length > 0
            ? { projectId: params.context.projectId.trim() }
          : {}),
      },
      apply: {
        required: requirements.applyRequired,
        satisfied: requirements.applySatisfied,
      },
      confirm: {
        required: requirements.confirmationRequired,
        satisfied: requirements.confirmationSatisfied,
      },
    },
    policy: params.tool.policy ?? null,
    audit: governance.audit,
    approval: governance.approval,
    idempotency: governance.idempotency,
    ...(semantic ? { semantic } : {}),
    normalizedInvoke: {
      pathParams: { ...params.parsedInput.pathParams },
      query: toPreviewQueryObject(params.parsedInput.query),
      body: params.parsedInput.body ?? null,
      context: params.context,
      headers,
    },
    nextInvoke: {
      headers,
      body: buildPreflightInvokeBody(params.args, requirements, governance.nextIdempotencyKey),
    },
  }
}

export function createAgentGateway(options: CreateAgentGatewayOptions) {
  const config = resolveGatewayConfig(options.config)
  let catalogSnapshotPromise: Promise<GatewayCatalogSnapshot> | null = null
  let latestCatalogSnapshot: GatewayCatalogSnapshot | null = null

  function normalizeErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error ?? 'unknown_error')
  }

  function shouldRefreshCatalogForError(error: unknown): boolean {
    const message = normalizeErrorMessage(error)
    return CATALOG_REFRESH_ERROR_PREFIXES.some((prefix) => message.startsWith(prefix))
  }

  function shouldRefreshLocalRuntimeForError(error: unknown): boolean {
    const message = normalizeErrorMessage(error)
    return LOCAL_RUNTIME_REFRESH_ERROR_PREFIXES.some((prefix) => message.startsWith(prefix))
  }

  function invalidateCatalogSnapshot(): void {
    catalogSnapshotPromise = null
    latestCatalogSnapshot = null
    resetToolSchemaValidationCache()
  }

  async function getCatalogSnapshot(params: { forceRefresh?: boolean } = {}): Promise<GatewayCatalogSnapshot> {
    if (params.forceRefresh) invalidateCatalogSnapshot()
    if (catalogSnapshotPromise) return catalogSnapshotPromise
    const snapshotPromise = buildGatewayCatalogSnapshot({
      config,
      configPath: options.configPath,
    })
      .then((snapshot) => {
        latestCatalogSnapshot = snapshot
        return snapshot
      })
      .catch((error) => {
        if (catalogSnapshotPromise === snapshotPromise) {
          catalogSnapshotPromise = null
          latestCatalogSnapshot = null
        }
        throw error
      })
    catalogSnapshotPromise = snapshotPromise
    return catalogSnapshotPromise
  }

  async function refreshCatalogSnapshot(): Promise<GatewayCatalogSnapshot> {
    return getCatalogSnapshot({ forceRefresh: true })
  }

  async function refreshLocalRuntimeSnapshot(): Promise<GatewayCatalogSnapshot> {
    options.registryResetter?.()
    return refreshCatalogSnapshot()
  }

  function getDiagnostics(): AgentGatewayDiagnostics {
    return {
      enabled: config.enabled !== false,
      snapshotLoaded: latestCatalogSnapshot !== null,
      loadedAt: latestCatalogSnapshot?.loadedAt,
      catalogVersion: latestCatalogSnapshot?.catalog.catalogVersion,
      generatedAt: latestCatalogSnapshot?.catalog.generatedAt,
      toolCount: latestCatalogSnapshot?.catalog.tools.length ?? 0,
      errorCount: latestCatalogSnapshot?.errors.length ?? 0,
    }
  }

  async function listTools(domain?: string): Promise<AgentGatewayListResult> {
    if (config.enabled === false) {
      return { catalogVersion: '1.0.0', generatedAt: new Date().toISOString(), tools: [], errors: [] }
    }
    const snapshot = await getCatalogSnapshot()
    return buildListResult(snapshot, domain)
  }

  async function getToolInputJsonSchema(toolId: string): Promise<Record<string, unknown> | null> {
    if (config.enabled === false) return null
    const normalized = normalizeToolId(toolId)
    const snapshot = await getCatalogSnapshot()
    const tool = snapshot.catalog.tools.find((entry) => normalizeToolId(entry.toolId) === normalized)
    if (!tool) return null
    const manifestSchema = findToolInputJsonSchemaInManifests(snapshot, tool)
    if (manifestSchema) return manifestSchema
    const registry = await options.registryResolver()
    const plugin = registry.get(normalizeDomain(tool.domain))
    if (!plugin) return null
    const route = findDomainRouteByOperation(plugin.manifest.routes, tool.operationId)
    if (!route) return null
    const schema = (route as { inputJsonSchema?: unknown }).inputJsonSchema
    return schema && typeof schema === 'object' && !Array.isArray(schema)
      ? (schema as Record<string, unknown>)
      : null
  }

  async function invokeLocalSource(
    snapshot: GatewayCatalogSnapshot,
    tool: FederatedCatalogTool,
    source: FederatedCatalogToolSource,
    args: AgentGatewayInvokeArgs,
    invokeOptions: {
      effectiveIdempotencyKey?: string
    },
  ): Promise<AgentGatewayInvokeResult> {
    const registry = await options.registryResolver()
    const domain = normalizeDomain(tool.domain)
    const plugin = registry.get(domain)
    if (!plugin) {
      throw new Error(`domain_not_registered:${domain}`)
    }
    await registry.ensureSetup(domain)

    const route = findDomainRouteByOperation(plugin.manifest.routes, tool.operationId)
    if (!route) {
      throw new Error(`operation_route_not_found:${domain}:${tool.operationId}`)
    }

    const parsedInput = normalizeInvokeInputForRoute({
      parsedInput: parseRouteInvokeInput(args.input),
      routePattern: route.pattern,
      routeMethod: route.method,
      tool,
      manifests: snapshot.manifests,
    })
    const context = { ...parsedInput.context, ...(args.context ?? {}) }
    const authValidation = validateToolInvokeAuthorization({
      tool,
      context,
    })
    if (!authValidation.ok && args.preview !== true) {
      throw new Error(authValidation.message)
    }
    const scopeValidation = validateToolInvokeScope({
      tool,
      context,
    })
    if (!scopeValidation.ok && args.preview !== true) {
      throw new Error(scopeValidation.message)
    }
    const safetyValidation = validateToolInvokeSafety({
      tool,
      apply: args.apply,
      confirm: args.confirm,
    })
    if (!safetyValidation.ok && args.preview !== true) {
      throw new Error(safetyValidation.message)
    }
    const contractValidation = validateToolInputByContract({
      tool,
      manifests: snapshot.manifests,
      parsedInput,
      context,
    })
    if (!contractValidation.ok) {
      throw new Error(contractValidation.message)
    }
    const schemaValidation = validateToolInputBySchema({
      tool,
      manifests: snapshot.manifests,
      parsedInput,
    })
    if (!schemaValidation.ok) {
      throw new Error(schemaValidation.message)
    }

    const pathSegments = patternToPathSegments(route.pattern, parsedInput.pathParams)
    const query = parsedInput.query
    const url = new URL(`https://xf-host.local/api/${domain}${pathSegments.length > 0 ? `/${pathSegments.join('/')}` : ''}`)
    for (const [key, value] of query.entries()) {
      url.searchParams.append(key, value)
    }

    if (args.preview === true) {
      return buildToolResponse(
        tool,
        source,
        200,
        buildToolInvokePreviewPayload({
          tool,
          source,
          route,
          pathSegments,
          parsedInput,
          context,
          args,
        }),
      )
    }

    const requestHeaders = new Headers()
    if (typeof invokeOptions.effectiveIdempotencyKey === 'string' && invokeOptions.effectiveIdempotencyKey.length > 0) {
      requestHeaders.set('x-idempotency-key', invokeOptions.effectiveIdempotencyKey)
    }

    const response = await dispatchDomainRequest({
      registry,
      request: {
        method: route.method,
        domain,
        path: pathSegments,
        query,
        body: parsedInput.body,
        headers: requestHeaders,
        url,
        context,
      },
    })

    return buildToolResponse(tool, source, response.status, response.data, response.headers)
  }

  async function invokeRemoteSource(
    snapshot: GatewayCatalogSnapshot,
    tool: FederatedCatalogTool,
    source: FederatedCatalogToolSource,
    args: AgentGatewayInvokeArgs,
    invokeOptions: {
      effectiveIdempotencyKey?: string
    },
  ): Promise<AgentGatewayInvokeResult> {
    const remoteSource = config.sources.find(
      (candidate) =>
        candidate.enabled &&
        candidate.id === source.id &&
        normalizeDomain(candidate.domain) === normalizeDomain(tool.domain)
    )
    if (!remoteSource) {
      throw new Error(`tool_source_not_found:${source.id}`)
    }

    const routes = await fetchRemoteRoutes(remoteSource)
    const route = findRemoteRouteByOperation(routes, tool.operationId)
    if (!route) {
      throw new Error(`operation_route_not_found:${tool.domain}:${tool.operationId}`)
    }

    const parsedInput = normalizeInvokeInputForRoute({
      parsedInput: parseRouteInvokeInput(args.input),
      routePattern: route.pattern,
      routeMethod: route.method,
      tool,
      manifests: snapshot.manifests,
    })
    const mergedContext = { ...parsedInput.context, ...(args.context ?? {}) }
    const authValidation = validateToolInvokeAuthorization({
      tool,
      context: mergedContext,
    })
    if (!authValidation.ok && args.preview !== true) {
      throw new Error(authValidation.message)
    }
    const scopeValidation = validateToolInvokeScope({
      tool,
      context: mergedContext,
    })
    if (!scopeValidation.ok && args.preview !== true) {
      throw new Error(scopeValidation.message)
    }
    const safetyValidation = validateToolInvokeSafety({
      tool,
      apply: args.apply,
      confirm: args.confirm,
    })
    if (!safetyValidation.ok && args.preview !== true) {
      throw new Error(safetyValidation.message)
    }
    const contractValidation = validateToolInputByContract({
      tool,
      manifests: snapshot.manifests,
      parsedInput,
      context: mergedContext,
    })
    if (!contractValidation.ok) {
      throw new Error(contractValidation.message)
    }
    const schemaValidation = validateToolInputBySchema({
      tool,
      manifests: snapshot.manifests,
      parsedInput,
    })
    if (!schemaValidation.ok) {
      throw new Error(schemaValidation.message)
    }

    const pathSegments = patternToPathSegments(route.pattern, parsedInput.pathParams)
    const baseUrl = normalizeBaseUrl(remoteSource.baseUrl)
    const apiBasePath = normalizeApiBasePath(remoteSource.apiBasePath)
    const requestUrl = new URL(
      `${baseUrl}${apiBasePath}/${remoteSource.domain}${pathSegments.length > 0 ? `/${pathSegments.join('/')}` : ''}`
    )
    for (const [key, value] of parsedInput.query.entries()) {
      requestUrl.searchParams.append(key, value)
    }

    if (args.preview === true) {
      return buildToolResponse(
        tool,
        source,
        200,
        buildToolInvokePreviewPayload({
          tool,
          source,
          route,
          pathSegments,
          parsedInput,
          context: mergedContext,
          args,
          requestUrl: requestUrl.toString(),
        }),
      )
    }

    const headers = resolveSourceHeaders(remoteSource)
    if (typeof mergedContext.tenantId === 'string' && mergedContext.tenantId.trim().length > 0) {
      headers['x-tenant-id'] = mergedContext.tenantId
    }
    if (typeof mergedContext.locale === 'string' && mergedContext.locale.trim().length > 0) {
      headers['x-locale'] = mergedContext.locale
    }
    if (typeof mergedContext.fallbackLocale === 'string' && mergedContext.fallbackLocale.trim().length > 0) {
      headers['x-fallback-locale'] = mergedContext.fallbackLocale
    }
    if (typeof mergedContext.projectId === 'string' && mergedContext.projectId.trim().length > 0) {
      headers['x-project-id'] = mergedContext.projectId.trim()
    }
    if (typeof invokeOptions.effectiveIdempotencyKey === 'string' && invokeOptions.effectiveIdempotencyKey.length > 0) {
      headers['x-idempotency-key'] = invokeOptions.effectiveIdempotencyKey
    }

    const method = route.method.toUpperCase()
    let bodyPayload: BodyInit | undefined
    if (method !== 'GET' && method !== 'HEAD' && parsedInput.body !== undefined) {
      headers['content-type'] = 'application/json'
      bodyPayload = JSON.stringify(parsedInput.body)
    }

    const { controller, cleanup } = createTimeoutController(remoteSource.timeoutMs)
    try {
      const response = await fetch(requestUrl, {
        method,
        headers,
        body: bodyPayload,
        signal: controller.signal,
      })
      const responseData = await parseFetchBody(response)
      return buildToolResponse(tool, source, response.status, responseData, pickResponseHeaders(response))
    } finally {
      cleanup()
    }
  }

  async function resolveToolFromSnapshot(toolIdRaw: string): Promise<{
    snapshot: GatewayCatalogSnapshot
    toolId: string
    tool: FederatedCatalogTool
  }> {
    const toolId = normalizeToolId(toolIdRaw)
    if (!toolId) throw new Error('tool_id_missing')

    let snapshot = await getCatalogSnapshot()
    let tool = snapshot.toolsById.get(toolId)
    if (tool) {
      return { snapshot, toolId, tool }
    }

    snapshot = await refreshCatalogSnapshot()
    tool = snapshot.toolsById.get(toolId)
    if (!tool) {
      throw new Error(`tool_not_found:${toolIdRaw}`)
    }

    return { snapshot, toolId, tool }
  }

  async function invokeResolvedTool(
    snapshot: GatewayCatalogSnapshot,
    tool: FederatedCatalogTool,
    args: AgentGatewayInvokeArgs,
    sourceId: string | undefined,
    options: {
      preferRefreshOnLocalMiss: boolean
      effectiveIdempotencyKey?: string
    },
  ): Promise<AgentGatewayInvokeResult> {
    const source = chooseSourceForInvocation(tool, sourceId)
    if (source.kind === 'local-route') {
      try {
        return await invokeLocalSource(snapshot, tool, source, args, {
          effectiveIdempotencyKey: options.effectiveIdempotencyKey,
        })
      } catch (error) {
        if (options.preferRefreshOnLocalMiss && shouldRefreshLocalRuntimeForError(error)) {
          throw error
        }
        if (sourceId || !shouldFallbackFromLocalError(error)) {
          throw error
        }
        const fallbackSource = findFirstRemoteSource(tool)
        if (!fallbackSource) {
          throw error
        }
        return invokeRemoteSource(snapshot, tool, fallbackSource, args, {
          effectiveIdempotencyKey: options.effectiveIdempotencyKey,
        })
      }
    }
    return invokeRemoteSource(snapshot, tool, source, args, {
      effectiveIdempotencyKey: options.effectiveIdempotencyKey,
    })
  }

  async function invokeTool(args: AgentGatewayInvokeArgs): Promise<AgentGatewayInvokeResult> {
    if (config.enabled === false) {
      throw new Error('agent_gateway_disabled')
    }

    const startedAt = Date.now()
    const { snapshot, toolId, tool } = await resolveToolFromSnapshot(args.toolId)
    const sourceId = normalizeSourceId(args.sourceId)
    const requestedSource = chooseSourceForInvocation(tool, sourceId)
    const semanticRecommendedIdempotencyKey = resolveAgentSemanticIdempotencyKey({
      domain: tool.domain,
      operationId: tool.operationId,
      input: args.input ?? {},
    })
    const effectiveIdempotencyKey =
      typeof args.idempotencyKey === 'string' && args.idempotencyKey.trim().length > 0
        ? args.idempotencyKey.trim()
        : semanticRecommendedIdempotencyKey
    const reservation = reserveInvokeIdempotency({
      tool,
      source: requestedSource,
      args: {
        ...args,
        sourceId: requestedSource.id,
      },
    }, {
      recommendedKey: semanticRecommendedIdempotencyKey,
      effectiveKey: effectiveIdempotencyKey,
    })

    if (reservation.kind === 'resolved') {
      await writeAgentInvokeAuditEvent({
        tool,
        requestedSourceId: requestedSource.id,
        effectiveSourceId: reservation.result.tool.sourceId,
        outcome: reservation.idempotencyStatus === 'replayed' ? 'replayed' : 'blocked',
        status: reservation.result.status,
        durationMs: Date.now() - startedAt,
        context: args.context,
        apply: args.apply,
        confirm: args.confirm,
        idempotencyKey: effectiveIdempotencyKey,
        idempotencyStatus: reservation.idempotencyStatus,
        preview: args.preview,
        errorCode:
          reservation.idempotencyStatus === 'replayed'
            ? undefined
            : reservation.idempotencyStatus === 'conflict'
              ? 'idempotency_key_conflict'
              : 'idempotency_in_progress',
      })
      return reservation.result
    }

    try {
      let result: AgentGatewayInvokeResult

      try {
        result = await invokeResolvedTool(snapshot, tool, args, sourceId, {
          preferRefreshOnLocalMiss: true,
          effectiveIdempotencyKey,
        })
      } catch (error) {
        if (!shouldRefreshCatalogForError(error)) {
          throw error
        }

        const refreshedSnapshot = shouldRefreshLocalRuntimeForError(error)
          ? await refreshLocalRuntimeSnapshot()
          : await refreshCatalogSnapshot()
        const refreshedTool = refreshedSnapshot.toolsById.get(toolId)
        if (!refreshedTool) {
          throw new Error(`tool_not_found:${args.toolId}`)
        }

        result = await invokeResolvedTool(refreshedSnapshot, refreshedTool, args, sourceId, {
          preferRefreshOnLocalMiss: false,
          effectiveIdempotencyKey,
        })
      }

      if (reservation.kind === 'active') {
        reservation.settle(result)
      }
      const responseResult =
        reservation.kind === 'active' && effectiveIdempotencyKey
          ? {
              ...result,
              headers: {
                ...(result.headers ?? {}),
                'x-agent-idempotency-status': 'fresh',
                'x-agent-idempotency-key': effectiveIdempotencyKey,
              },
            }
          : result

      await writeAgentInvokeAuditEvent({
        tool,
        requestedSourceId: requestedSource.id,
        effectiveSourceId: responseResult.tool.sourceId,
        outcome: args.preview === true ? 'preview' : isSuccessfulInvokeResult(responseResult) ? 'success' : 'failure',
        status: responseResult.status,
        durationMs: Date.now() - startedAt,
        context: args.context,
        apply: args.apply,
        confirm: args.confirm,
        idempotencyKey: effectiveIdempotencyKey,
        idempotencyStatus:
          reservation.kind === 'active' && effectiveIdempotencyKey ? 'fresh' : undefined,
        preview: args.preview,
      })

      if (shouldAppendDurableGatewayActivity(tool, args)) {
        await appendDurableGatewayActivityBestEffort({
          registry: await options.registryResolver(),
          tool,
          args,
          status: isSuccessfulInvokeResult(responseResult) ? 'success' : 'error',
          responseData: responseResult.data,
        })
      }

      return responseResult
    } catch (error) {
      if (reservation.kind === 'active') {
        reservation.release()
      }
      await writeAgentInvokeAuditEvent({
        tool,
        requestedSourceId: requestedSource.id,
        effectiveSourceId: requestedSource.id,
        outcome:
          buildInvokeFailureStatus(error) === 409 ? 'blocked' : 'failure',
        status: buildInvokeFailureStatus(error),
        durationMs: Date.now() - startedAt,
        context: args.context,
        apply: args.apply,
        confirm: args.confirm,
        idempotencyKey: effectiveIdempotencyKey,
        preview: args.preview,
        errorCode: error instanceof Error ? error.message : String(error ?? 'unknown_error'),
      })
      if (shouldAppendDurableGatewayActivity(tool, args)) {
        await appendDurableGatewayActivityBestEffort({
          registry: await options.registryResolver(),
          tool,
          args,
          status: 'error',
          errorMessage: error instanceof Error ? error.message : String(error ?? 'unknown_error'),
        })
      }
      throw error
    }
  }

  async function getOpenApi(args: AgentGatewayOpenApiArgs = {}): Promise<Record<string, unknown>> {
    const snapshot = await getCatalogSnapshot()
    const normalizedDomain = normalizeDomain(args.domain ?? '')
    const manifests =
      normalizedDomain.length > 0
        ? snapshot.manifests.filter((manifest) => normalizeDomain(manifest.domain?.id ?? '') === normalizedDomain)
        : snapshot.manifests
    const tools =
      normalizedDomain.length > 0
        ? snapshot.catalog.tools.filter((tool) => normalizeDomain(tool.domain) === normalizedDomain)
        : snapshot.catalog.tools

    const catalog: FederatedToolCatalog = {
      ...snapshot.catalog,
      tools,
    }

    const document = buildAgentGatewayOpenApi({
      manifests,
      catalog,
      serverBaseUrl: args.serverBaseUrl,
    })
    return normalizeAgentGatewayOpenApiDocument(document)
  }

  return {
    listTools,
    getToolInputJsonSchema,
    invokeTool,
    getOpenApi,
    getDiagnostics,
    refreshCatalogSnapshot,
    invalidateCatalogSnapshot,
  }
}
