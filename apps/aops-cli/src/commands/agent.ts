import { writeFileSync } from 'node:fs'
import { Command } from 'commander'
import { banner, logError, logInfo, logSuccess } from '@aopslab/xf-cli-ui'

import { applyCommonOptions, compactPayload, normalizeNonEmpty, type CommonOptions } from '../utils/command.js'
import {
  buildAgentContextHeaders,
  invokeHostedToolWithApiState,
  parseJsonInput,
  requireApiState,
  unwrapHostedToolResult,
  type AgentGatewayContextOptions,
} from '../utils/agent-gateway.js'
import { promptInput } from '../utils/prompts.js'

type AgentContextOptions = AgentGatewayContextOptions & {
  domain?: string
}

type AgentToolsOptions = AgentContextOptions & {
  summary?: boolean
  examples?: boolean
  q?: string
  limit?: number
}

type AgentInvokeOptions = AgentContextOptions & {
  tool?: string
  sourceId?: string
  input?: string
  preview?: boolean
  apply?: boolean
  confirm?: boolean
  idempotencyKey?: string
}

type AgentOpenApiOptions = CommonOptions & {
  domain?: string
  out?: string
}

type AgentSchemaOptions = CommonOptions & {
  tool?: string
  out?: string
  summary?: boolean
}

function augmentAgentInvokeErrorMessage(toolId: string, message: string): string {
  const normalized = String(message ?? '').toLowerCase()
  if (normalized.includes('apply_required')) {
    return `${message}\nRetry with --apply because ${toolId} is a guarded write tool.`
  }
  if (normalized.includes('confirmation_required')) {
    return `${message}\nRetry with --confirm after verifying the destructive action is intended.`
  }
  return message
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((entry) => normalizeNonEmpty(entry)).filter((entry): entry is string => Boolean(entry))
    : []
}

function parsePositiveInteger(value: string): number {
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error('Expected a positive integer.')
  }
  return parsed
}

function extractTagValue(tags: string[], prefix: string): string | undefined {
  const match = tags.find((tag) => tag.toLowerCase().startsWith(prefix))
  if (!match) return undefined
  return normalizeNonEmpty(match.slice(prefix.length))
}

function compactTool(tool: Record<string, unknown>, options: { examples?: boolean } = {}): Record<string, unknown> {
  const tags = asStringArray(tool.tags)
  const policy = asRecord(tool.policy)
  const safety = asRecord(policy?.safety)
  const links = asRecord(tool.links)
  const examples = asStringArray(tool.examples)
  const toolId =
    normalizeNonEmpty(tool.toolId) ??
    normalizeNonEmpty(tool.id) ??
    normalizeNonEmpty(tool.operationId) ??
    '(unknown-tool)'
  const title = normalizeNonEmpty(tool.title)
  const summary = normalizeNonEmpty(tool.summary)
  const guard = compactPayload({
    apply: safety?.applyRequired,
    confirm: safety?.confirmationRequired,
    destructive: safety?.destructive,
  })

  return compactPayload({
    id: toolId,
    domain: normalizeNonEmpty(tool.domain),
    op: normalizeNonEmpty(tool.operationId),
    title,
    summary: summary && summary !== title ? summary : undefined,
    resource: extractTagValue(tags, 'resource:'),
    kind: extractTagValue(tags, 'kind:'),
    action: extractTagValue(tags, 'action:'),
    effect: normalizeNonEmpty(tool.sideEffect),
    schema: normalizeNonEmpty(tool.inputSchemaRef),
    guard: Object.keys(guard).length > 0 ? guard : undefined,
    source: normalizeNonEmpty(tool.defaultSourceId),
    detail: normalizeNonEmpty(links?.detail),
    invoke: normalizeNonEmpty(links?.invoke),
    example: options.examples ? examples[0] : undefined,
  })
}

function toolMatchesQuery(tool: Record<string, unknown>, query: string): boolean {
  const tags = asStringArray(tool.tags)
  const haystack = [
    tool.toolId,
    tool.id,
    tool.domain,
    tool.operationId,
    tool.title,
    tool.summary,
    tool.description,
    tool.inputSchemaRef,
    tool.outputSchemaRef,
    tool.sideEffect,
    tool.defaultSourceId,
    ...tags,
  ]
    .map((value) => normalizeNonEmpty(value)?.toLowerCase())
    .filter((value): value is string => Boolean(value))
    .join('\n')
  return haystack.includes(query)
}

function summarizeRecommendedTool(value: unknown): Record<string, unknown> | undefined {
  const tool = asRecord(value)
  if (!tool) return undefined
  return compactPayload({
    toolId: normalizeNonEmpty(tool.toolId),
    title: normalizeNonEmpty(tool.title),
    summary: normalizeNonEmpty(tool.summary),
    reason: normalizeNonEmpty(tool.reason),
    operationKind: normalizeNonEmpty(tool.operationKind),
    resource: normalizeNonEmpty(tool.resource),
    safety: normalizeNonEmpty(tool.safety),
  })
}

function summarizeResource(value: unknown): Record<string, unknown> | undefined {
  const resource = asRecord(value)
  if (!resource) return undefined
  return compactPayload({
    resourceId: normalizeNonEmpty(resource.resourceId),
    title: normalizeNonEmpty(resource.title),
    summary: normalizeNonEmpty(resource.summary),
    kind: normalizeNonEmpty(resource.kind),
    toolCount: resource.toolCount,
    operationKinds: asStringArray(resource.operationKinds),
    sampleToolIds: asStringArray(resource.sampleToolIds).slice(0, 6),
  })
}

function resourceMatchesQuery(resource: Record<string, unknown>, query: string): boolean {
  const haystack = [
    resource.resourceId,
    resource.title,
    resource.summary,
    resource.kind,
    ...asStringArray(resource.operationKinds),
    ...asStringArray(resource.sampleToolIds),
  ]
    .map((value) => normalizeNonEmpty(value)?.toLowerCase())
    .filter((value): value is string => Boolean(value))
    .join('\n')
  return haystack.includes(query)
}

function buildAgentToolsSummary(params: {
  payload: Record<string, unknown>
  tools: Record<string, unknown>[]
  originalToolCount: number
  matchedToolCount: number
  domain?: string
  q?: string
  limit?: number
  examples?: boolean
}): Record<string, unknown> {
  const { payload, tools, originalToolCount, matchedToolCount, domain, q, limit, examples } = params
  const flow = asRecord(payload.flow)
  const discovery = asRecord(payload.discovery)
  const routes = asRecord(discovery?.routes)
  const provenance = asRecord(discovery?.provenance)
  const referenceDomain = asRecord(discovery?.referenceDomain) ?? asRecord(provenance?.referenceDomain)
  const rawResources = Array.isArray(referenceDomain?.humanReadableResources)
    ? referenceDomain.humanReadableResources
    : []
  const resources = rawResources
    .map((entry) => asRecord(entry))
    .filter((entry): entry is Record<string, unknown> => Boolean(entry))
    .filter((entry) => q ? resourceMatchesQuery(entry, q) : true)
    .map((entry) => summarizeResource(entry))
    .filter((entry): entry is Record<string, unknown> => Boolean(entry))

  const recommendedFirstTools = (Array.isArray(referenceDomain?.recommendedFirstTools)
    ? referenceDomain.recommendedFirstTools
    : []
  )
    .map((entry) => summarizeRecommendedTool(entry))
    .filter((entry): entry is Record<string, unknown> => Boolean(entry))
    .filter((entry) => {
      if (!q) return true
      return Object.values(entry)
        .map((value) => normalizeNonEmpty(value)?.toLowerCase())
        .filter((value): value is string => Boolean(value))
        .join('\n')
        .includes(q)
    })
    .slice(0, 8)

  return compactPayload({
    ok: payload.ok,
    catalogVersion: payload.catalogVersion,
    generatedAt: payload.generatedAt,
    partial: payload.partial,
    domain: domain ?? normalizeNonEmpty(referenceDomain?.domain),
    counts: {
      total: originalToolCount,
      matched: matchedToolCount,
      returned: tools.length,
      resources: resources.length,
    },
    filters: compactPayload({ domain, q, limit }),
    flow: flow
      ? compactPayload({
        summary: normalizeNonEmpty(flow.summary),
        routes: asRecord(flow.routes),
      })
      : undefined,
    discovery: compactPayload({
      toolCatalog: normalizeNonEmpty(routes?.toolCatalog),
      toolDetailTemplate: normalizeNonEmpty(routes?.toolDetailTemplate),
      invokeTemplate: normalizeNonEmpty(routes?.invokeTemplate),
      rawDiscoveryDocument: normalizeNonEmpty(routes?.rawDiscoveryDocument),
      rawOpenapi: normalizeNonEmpty(routes?.rawOpenapi),
    }),
    resources,
    recommendedFirstTools,
    tools: tools.map((tool) => compactTool(tool, { examples })),
    next: {
      narrow: 'aops-cli agent tools --domain <domain> --q <keyword> --summary --json',
      schema: 'aops-cli agent schema --tool <toolId> --json',
      invoke: "aops-cli agent invoke --tool <toolId> --input '@payload.json' --preview|--apply --json",
    },
    errors: Array.isArray(payload.errors) && payload.errors.length > 0 ? payload.errors : undefined,
  })
}

function selectAgentTools(
  tools: unknown[],
  options: AgentToolsOptions
): { selectedTools: Record<string, unknown>[]; matchedToolCount: number; q?: string; limit?: number } {
  const q = normalizeNonEmpty(options.q)?.toLowerCase()
  const limit = Number.isFinite(options.limit) && options.limit && options.limit > 0
    ? options.limit
    : undefined
  const normalizedTools = tools
    .map((entry) => asRecord(entry))
    .filter((entry): entry is Record<string, unknown> => Boolean(entry))
  const matchedTools = q
    ? normalizedTools.filter((tool) => toolMatchesQuery(tool, q))
    : normalizedTools
  const selectedTools = typeof limit === 'number' ? matchedTools.slice(0, limit) : matchedTools
  return {
    selectedTools,
    matchedToolCount: matchedTools.length,
    q,
    limit,
  }
}

function schemaType(schema: Record<string, unknown>): string | undefined {
  const type = schema.type
  if (Array.isArray(type)) {
    return type.map((entry) => normalizeNonEmpty(entry)).filter(Boolean).join('|') || undefined
  }
  const explicitType = normalizeNonEmpty(type)
  if (explicitType) return explicitType
  if (Array.isArray(schema.enum)) return 'enum'
  if (Object.prototype.hasOwnProperty.call(schema, 'const')) return 'const'
  for (const key of ['oneOf', 'anyOf', 'allOf'] as const) {
    const variants = schema[key]
    if (Array.isArray(variants)) return `${key}(${variants.length})`
  }
  return undefined
}

function summarizeAdditionalProperties(value: unknown): unknown {
  if (typeof value === 'boolean') return value
  const schema = asRecord(value)
  return schema ? schemaType(schema) ?? 'schema' : undefined
}

function schemaHasProperties(schema: Record<string, unknown>): boolean {
  const properties = asRecord(schema.properties)
  return Boolean(properties && Object.keys(properties).length > 0)
}

function isFlexibleObjectSchema(schema: Record<string, unknown>): boolean {
  return !schemaHasProperties(schema) && (
    schema.additionalProperties === true ||
    Boolean(asRecord(schema.additionalProperties))
  )
}

function isOpaqueInputSchema(schema: Record<string, unknown>): boolean {
  if (isFlexibleObjectSchema(schema)) return true
  const properties = asRecord(schema.properties)
  if (!properties) return false

  return ['data', 'input', 'patch', 'payload'].some((key) => {
    const child = asRecord(properties[key])
    return child ? isFlexibleObjectSchema(child) : false
  })
}

function summarizeEnum(value: unknown): unknown[] | undefined {
  if (!Array.isArray(value)) return undefined
  return value.slice(0, 12).map((entry) => {
    if (entry === null || ['string', 'number', 'boolean'].includes(typeof entry)) return entry
    return String(entry)
  })
}

function collectSchemaFields(params: {
  schema: Record<string, unknown>
  path: string
  required: Set<string>
  fields: Record<string, unknown>[]
  depth: number
}): void {
  if (params.depth > 8) return

  const properties = asRecord(params.schema.properties)
  if (properties) {
    for (const [key, rawChild] of Object.entries(properties)) {
      const child = asRecord(rawChild)
      if (!child) continue
      const childPath = params.path ? `${params.path}.${key}` : key
      const childRequired = params.required.has(key)
      const childRequiredSet = new Set(asStringArray(child.required))
      const description = normalizeNonEmpty(child.description)
      const defaultValue = Object.prototype.hasOwnProperty.call(child, 'default')
        ? child.default
        : undefined

      params.fields.push(compactPayload({
        path: childPath,
        type: schemaType(child),
        required: childRequired,
        format: normalizeNonEmpty(child.format),
        description,
        enum: summarizeEnum(child.enum),
        const: Object.prototype.hasOwnProperty.call(child, 'const') ? child.const : undefined,
        default: defaultValue,
        additionalProperties: summarizeAdditionalProperties(child.additionalProperties),
      }))

      collectSchemaFields({
        schema: child,
        path: childPath,
        required: childRequiredSet,
        fields: params.fields,
        depth: params.depth + 1,
      })

      const items = asRecord(child.items)
      if (items) {
        collectSchemaFields({
          schema: items,
          path: `${childPath}[]`,
          required: new Set(asStringArray(items.required)),
          fields: params.fields,
          depth: params.depth + 1,
        })
      }
    }
  }

  for (const key of ['oneOf', 'anyOf', 'allOf'] as const) {
    const variants = params.schema[key]
    if (!Array.isArray(variants)) continue
    params.fields.push(compactPayload({
      path: params.path || '$',
      type: `${key}(${variants.length})`,
    }))
    for (const [index, rawVariant] of variants.slice(0, 4).entries()) {
      const variant = asRecord(rawVariant)
      if (!variant) continue
      collectSchemaFields({
        schema: variant,
        path: params.path ? `${params.path}.${key}[${index}]` : `${key}[${index}]`,
        required: new Set(asStringArray(variant.required)),
        fields: params.fields,
        depth: params.depth + 1,
      })
    }
  }
}

function buildAgentSchemaSummary(params: {
  toolId: string
  payload: Record<string, unknown>
  inputJsonSchema: Record<string, unknown>
}): Record<string, unknown> {
  const tool = asRecord(params.payload.tool)
  const rootRequired = asStringArray(params.inputJsonSchema.required)
  const fields: Record<string, unknown>[] = []
  collectSchemaFields({
    schema: params.inputJsonSchema,
    path: '',
    required: new Set(rootRequired),
    fields,
    depth: 0,
  })

  const domain =
    normalizeNonEmpty(tool?.domain) ??
    normalizeNonEmpty(params.toolId.split('.')[0])
  const opaque = isOpaqueInputSchema(params.inputJsonSchema)
  const returnedFields = fields.slice(0, 80)

  return compactPayload({
    toolId: params.toolId,
    title: normalizeNonEmpty(tool?.title),
    operationId: normalizeNonEmpty(tool?.operationId),
    domain,
    schemaSummary: compactPayload({
      rootType: schemaType(params.inputJsonSchema),
      required: rootRequired,
      additionalProperties: summarizeAdditionalProperties(params.inputJsonSchema.additionalProperties),
      opaque,
      fieldCount: fields.length,
      returnedFieldCount: returnedFields.length,
      truncated: fields.length > returnedFields.length,
      fields: returnedFields,
    }),
    next: compactPayload({
      fullSchema: `aops-cli agent schema --tool ${params.toolId} --json`,
      openapi: domain ? `aops-cli agent openapi --domain ${domain} --json` : undefined,
      detail: `GET /api/agent/tools/${params.toolId}`,
      invoke: `aops-cli agent invoke --tool ${params.toolId} --input @payload.json --preview|--apply --json`,
      fallback: opaque
        ? [
          'If this summary is opaque, inspect OpenAPI for the operation requestBody schema.',
          'If OpenAPI is also opaque, inspect the domain kit/Zod source before raw invoke payload authoring.',
          'For routine sugar use, prefer the matching command --help surface.',
        ]
        : undefined,
    }),
  })
}

export async function runAgentTools(options: AgentToolsOptions = {}): Promise<void> {
  const interactive = !options.yes && !options.json
  const apiState = await requireApiState(options)
  if (!apiState) return

  const domain = normalizeNonEmpty(options.domain)?.toLowerCase()
  const query = domain ? `?domain=${encodeURIComponent(domain)}` : ''
  const path = `/api/agent/tools${query}`
  let headers: Record<string, string>
  try {
    headers = await buildAgentContextHeaders(options)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    logError(message)
    process.exitCode = 1
    return
  }

  if (interactive) {
    banner('AOPS Agent Tools')
    logInfo(`API: ${apiState.baseUrl}`)
    if (domain) logInfo(`Domain filter: ${domain}`)
  }

  try {
    const payload = await apiState.client.fetchJson<Record<string, unknown>>(path, {
      method: 'GET',
      headers,
      timeoutMs: options.timeoutMs,
    })

    const tools = Array.isArray(payload.tools) ? payload.tools : []
    const originalToolCount = tools.length
    const { selectedTools, matchedToolCount, q, limit } = selectAgentTools(tools, options)

    if (options.json) {
      if (options.summary) {
        console.log(JSON.stringify(buildAgentToolsSummary({
          payload,
          tools: selectedTools,
          originalToolCount,
          matchedToolCount,
          domain,
          q,
          limit,
          examples: options.examples,
        }), null, 2))
        return
      }

      const shouldFilter = Boolean(q) || typeof limit === 'number'
      console.log(JSON.stringify(shouldFilter
        ? {
          ...payload,
          filters: compactPayload({ domain, q, limit }),
          toolCount: {
            total: originalToolCount,
            matched: matchedToolCount,
            returned: selectedTools.length,
          },
          tools: selectedTools,
        }
        : payload, null, 2))
      return
    }

    const errors = Array.isArray(payload.errors) ? payload.errors : []
    const catalogVersion = typeof payload.catalogVersion === 'string' ? payload.catalogVersion : 'unknown'
    const flow = (
      payload.flow &&
      typeof payload.flow === 'object' &&
      !Array.isArray(payload.flow)
    ) ? (payload.flow as Record<string, unknown>) : null

    logSuccess(`Tools: ${selectedTools.length}${selectedTools.length === originalToolCount ? '' : `/${originalToolCount}`} (catalog: ${catalogVersion})`)
    if (q) logInfo(`Query: ${q}`)
    if (typeof limit === 'number') logInfo(`Limit: ${limit}`)
    const flowSummary =
      flow && typeof flow.summary === 'string'
        ? flow.summary
        : undefined
    if (flowSummary) {
      logInfo(`Flow: ${flowSummary}`)
    }
    for (const raw of selectedTools) {
      const tool = raw as Record<string, unknown>
      const toolId =
        normalizeNonEmpty(tool.toolId) ??
        normalizeNonEmpty(tool.id) ??
        normalizeNonEmpty(tool.operationId) ??
        '(unknown-tool)'
      const title =
        normalizeNonEmpty(tool.title) ??
        normalizeNonEmpty(tool.name) ??
        normalizeNonEmpty(tool.summary) ??
        normalizeNonEmpty(tool.description)
      const sourceId = normalizeNonEmpty(tool.sourceId) ?? normalizeNonEmpty(tool.domain)
      const suffix = [
        sourceId ? `source=${sourceId}` : undefined,
        title ? title : undefined,
      ]
        .filter(Boolean)
        .join(' | ')
      console.log(`- ${toolId}${suffix ? ` :: ${suffix}` : ''}`)
    }

    if (errors.length > 0) {
      logInfo('Source errors:')
      for (const err of errors) {
        console.log(`- ${JSON.stringify(err)}`)
      }
    }
    if (options.summary) {
      logInfo('Next: inspect one exact input contract with `aops-cli agent schema --tool <toolId> --json`.')
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    logError(`Failed to fetch agent tools: ${message}`)
    process.exitCode = 1
  }
}

export async function runAgentInvoke(options: AgentInvokeOptions = {}): Promise<void> {
  const interactive = !options.yes && !options.json
  const apiState = await requireApiState(options)
  if (!apiState) return

  let toolId = normalizeNonEmpty(options.tool)?.toLowerCase()
  if (!toolId && interactive) {
    toolId = normalizeNonEmpty(await promptInput({ message: 'Tool id:' }))?.toLowerCase()
  }

  if (!toolId) {
    logError('Missing tool id. Provide --tool <id>.')
    process.exitCode = 1
    return
  }

  let input: unknown
  try {
    input = parseJsonInput(options.input, 'input')
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    logError(message)
    process.exitCode = 1
    return
  }

  if (interactive) {
    banner('AOPS Agent Invoke')
    logInfo(`API: ${apiState.baseUrl}`)
    logInfo(`Tool: ${toolId}`)
  }

  try {
    const payload = await invokeHostedToolWithApiState(apiState, {
      ...options,
      toolId,
      input,
    })

    if (options.json) {
      console.log(JSON.stringify(payload, null, 2))
      return
    }

    logSuccess('Tool invocation completed.')
    console.log(JSON.stringify(unwrapHostedToolResult(payload), null, 2))
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    logError(`Failed to invoke tool ${toolId}: ${augmentAgentInvokeErrorMessage(toolId, message)}`)
    process.exitCode = 1
  }
}

export async function runAgentOpenApi(options: AgentOpenApiOptions = {}): Promise<void> {
  const interactive = !options.yes && !options.json
  const apiState = await requireApiState(options)
  if (!apiState) return

  const domain = normalizeNonEmpty(options.domain)?.toLowerCase()
  const query = domain ? `?domain=${encodeURIComponent(domain)}` : ''
  const path = `/api/agent/openapi.json${query}`

  if (interactive) {
    banner('AOPS Agent OpenAPI')
    logInfo(`API: ${apiState.baseUrl}`)
    if (domain) logInfo(`Domain filter: ${domain}`)
  }

  try {
    const payload = await apiState.client.fetchJson<unknown>(path, {
      method: 'GET',
      timeoutMs: options.timeoutMs,
    })
    const pretty = JSON.stringify(payload, null, 2)

    const outPath = normalizeNonEmpty(options.out)
    if (outPath) {
      writeFileSync(outPath, `${pretty}\n`, 'utf8')
      if (!options.json) logSuccess(`Wrote ${outPath}`)
    }

    console.log(pretty)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    logError(`Failed to generate OpenAPI: ${message}`)
    process.exitCode = 1
  }
}

export async function runAgentSchema(options: AgentSchemaOptions = {}): Promise<void> {
  const interactive = !options.yes && !options.json
  const apiState = await requireApiState(options)
  if (!apiState) return

  const toolId = normalizeNonEmpty(options.tool)?.toLowerCase()
  if (!toolId) {
    logError('Missing tool id. Provide --tool <id>.')
    process.exitCode = 1
    return
  }

  const path = `/api/agent/tools/${encodeURIComponent(toolId)}`

  if (interactive) {
    banner('AOPS Agent Schema')
    logInfo(`API: ${apiState.baseUrl}`)
    logInfo(`Tool: ${toolId}`)
  }

  try {
    const payload = await apiState.client.fetchJson<Record<string, unknown>>(path, {
      method: 'GET',
      timeoutMs: options.timeoutMs,
    })
    const inputJsonSchema = (payload as { tool?: { inputJsonSchema?: unknown } })?.tool?.inputJsonSchema
    const inputSchemaRecord = asRecord(inputJsonSchema)
    if (!inputSchemaRecord) {
      logError(`No input schema is published for ${toolId}. The tool's kit may not expose a per-operation input schema yet.`)
      process.exitCode = 1
      return
    }
    const result = options.summary
      ? buildAgentSchemaSummary({ toolId, payload, inputJsonSchema: inputSchemaRecord })
      : { toolId, inputJsonSchema }
    const pretty = JSON.stringify(result, null, 2)
    const outPath = normalizeNonEmpty(options.out)
    if (outPath) {
      writeFileSync(outPath, `${pretty}\n`, 'utf8')
      if (!options.json) logSuccess(`Wrote ${outPath}`)
    }
    if (options.json) {
      console.log(pretty)
      return
    }
    logSuccess('Input schema fetched.')
    console.log(pretty)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    logError(`Failed to fetch schema for ${toolId}: ${message}`)
    process.exitCode = 1
  }
}

export function makeAgentCommand(): Command {
  const cmd = new Command('agent').description('Primary operator plane for federated tool discovery and invoke')

  applyCommonOptions(
    cmd
      .command('tools')
      .description('List federated tools from the canonical operator plane (/api/agent/tools)')
      .option('--domain <id>', 'Filter by domain id (e.g. docman)')
      .option('--q <text>', 'Client-side search over tool id, title, summary, tags, resource, and kind')
      .option('--limit <n>', 'Limit returned tools after filtering', parsePositiveInteger)
      .option('--summary', 'Print a compact, token-efficient catalog summary (especially useful with --json)')
      .option('--examples', 'Include first invoke example in --summary output')
      .option('--tenant-id <id>', 'Tenant id header (x-tenant-id)')
      .option('--locale <locale>', 'Locale header (x-locale)')
      .option('--fallback-locale <locale>', 'Fallback locale header (x-fallback-locale)')
      .option('--scope-id <id>', 'Canonical owner scope override')
      .option('--scope-resolution <mode>', 'Owner scope read mode: explicit or cascade')
      .option('--project-id <id>', 'Project id used to resolve owner scope from the active AOPS context')
      .option('--project-name <name>', 'Project name from repo-local .aops/aops.config.json for owner-scope resolution')
      .action(async (options: AgentToolsOptions) => {
        await runAgentTools(options)
      }),
    { withProject: false }
  )

  applyCommonOptions(
    cmd
      .command('invoke')
      .description('Invoke a tool via the canonical operator plane (/api/agent/tools/{toolId}/invoke)')
      .option('--tool <id>', 'Tool id')
      .option('--source-id <id>', 'Optional source id override')
      .option('--input <json>', 'JSON input payload or @file.json')
      .option('--preview', 'Return a validated preflight summary without executing the tool')
      .option('--apply', 'Explicitly allow guarded write operations')
      .option('--confirm', 'Explicitly confirm destructive operations')
      .option('--idempotency-key <key>', 'Optional guarded-write idempotency key')
      .option('--tenant-id <id>', 'Tenant id header (x-tenant-id)')
      .option('--locale <locale>', 'Locale header (x-locale)')
      .option('--fallback-locale <locale>', 'Fallback locale header (x-fallback-locale)')
      .option('--scope-id <id>', 'Canonical owner scope override')
      .option('--scope-resolution <mode>', 'Owner scope read mode: explicit or cascade')
      .option('--project-id <id>', 'Project id used to resolve owner scope from the active AOPS context')
      .option('--project-name <name>', 'Project name from repo-local .aops/aops.config.json for owner-scope resolution')
      .action(async (options: AgentInvokeOptions) => {
        await runAgentInvoke(options)
      }),
    { withProject: false }
  )

  applyCommonOptions(
    cmd
      .command('openapi')
      .description('Generate OpenAPI from the canonical federated tool catalog')
      .option('--domain <id>', 'Filter OpenAPI by domain')
      .option('--out <path>', 'Write output to file')
      .action(async (options: AgentOpenApiOptions) => {
        await runAgentOpenApi(options)
      }),
    { withProject: false }
  )

  applyCommonOptions(
    cmd
      .command('schema')
      .description("Print the live JSON Schema for one tool's input contract — use this before authoring --input payloads")
      .option('--tool <id>', 'Tool id (e.g. docman.document.create)')
      .option('--summary', 'Print a compact flattened field summary and fallback ladder')
      .option('--out <path>', 'Write output to file')
      .action(async (options: AgentSchemaOptions) => {
        await runAgentSchema(options)
      }),
    { withProject: false }
  )

  cmd.addHelpText(
    'after',
    `
Examples:
  aops-cli agent tools --domain docman
  aops-cli agent tools --domain agentspace --summary --json
  aops-cli agent tools --domain agentspace --q memory --limit 20 --summary --json
  aops-cli agent tools --domain agentspace --q resource.create --summary --examples --json
  aops-cli agent tools --domain docman --scope-id <scope-id>
  aops-cli agent invoke --tool docman.document-group.list --project-id <project-id> --input '{"query":{"limit":10}}'
  aops-cli agent invoke --tool docman.document-group.create --scope-id <scope-id> --apply --input '{"data":{"groupUid":"api-guides","title":"API Guides"}}'
  aops-cli agent invoke --tool inventory.unit.create --project-id <project-id> --preview --input '{"unitTypeUid":"length","unitUid":"mm"}'
  aops-cli agent invoke --tool inventory.unit.create --project-id <project-id> --apply --idempotency-key inventory.unit.create:seed-1 --input '{"unitTypeUid":"length","unitUid":"mm","nameMl":{"en":"Millimeter"}}'
  aops-cli agent schema --tool docman.document.create --summary --json
  aops-cli agent openapi --out ./openapi.json
`
  )

  return cmd
}
