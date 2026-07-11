import { Command } from 'commander'
import { logError, logSuccess } from '@aopslab/xf-cli-ui'

import { applyCommonOptions, compactPayload, normalizeNonEmpty } from '../utils/command.js'
import {
  invokeHostedToolWithApiState,
  parseJsonInput,
  requireApiState,
  unwrapHostedToolResult,
  type AgentGatewayContextOptions,
} from '../utils/agent-gateway.js'
import {
  preferProjectNameBinding,
  resolveOwnerScopeIdFromBinding,
  resolveOwnerScopeIdFromProjectRecord,
  resolveProjectBindingContext,
} from '../utils/project-context.js'
import {
  buildHostedSugarEnvelope,
  buildOperatorCookbook,
  ensureDestructiveWrite,
  ensureGuardedWrite,
  missingScopeIdMessage,
} from '../utils/hosted-sugar.js'
import { GUIDE_PATHS } from '../utils/guide-paths.js'
import type { CliApiClientState } from '../utils/api.js'

type ResourceContextOptions = AgentGatewayContextOptions & {
  projectName?: string
  scopeId?: string
  scopeResolution?: 'explicit' | 'cascade'
}

type GuardedWriteOptions = {
  preview?: boolean
  apply?: boolean
  confirm?: boolean
  idempotencyKey?: string
}

type JsonSeedOptions = {
  input?: string
}

type ResourceType = 'document' | 'rule' | 'spec' | 'link' | 'reference' | 'template' | 'dataset' | 'code' | 'skill'

type ResourceListOptions = ResourceContextOptions & {
  name?: string
  resourceType?: ResourceType
  tag?: string[]
  refType?: string
  refId?: string
  limit?: string | number
  summary?: boolean
}

type ResourceGetOptions = ResourceContextOptions & {
  id?: string
}

type ResourceCreateOptions = ResourceContextOptions &
  JsonSeedOptions &
  GuardedWriteOptions & {
    name?: string
    description?: string
    resourceType?: ResourceType
    uri?: string
    tag?: string[]
    refType?: string
    refId?: string
    meta?: string
  }

type ResourceUpdateOptions = ResourceContextOptions &
  JsonSeedOptions &
  GuardedWriteOptions & {
    id?: string
    name?: string
    description?: string
    resourceType?: ResourceType
    uri?: string
    tag?: string[]
    refType?: string
    refId?: string
    meta?: string
  }

type ResourceDeleteOptions = ResourceContextOptions &
  GuardedWriteOptions & {
    id?: string
  }

type ResolvedResourceContext = Awaited<ReturnType<typeof resolveProjectBindingContext>> & {
  scopeId?: string
}

type HostedWriteOptions = GuardedWriteOptions & {
  timeoutMs?: number
  apiBaseUrl?: string
  accessToken?: string
  refreshToken?: string
  tenantId?: string
  locale?: string
  fallbackLocale?: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function unwrapResultData<T>(result: unknown): T | undefined {
  if (isRecord(result) && Object.prototype.hasOwnProperty.call(result, 'data')) {
    return result.data as T
  }
  return result as T
}

function collectRepeatedOption(value: string, previous: string[] = []): string[] {
  const normalized = normalizeNonEmpty(value)
  return normalized ? [...previous, normalized] : previous
}

function toInteger(value: unknown, label: string): number {
  if (typeof value === 'number' && Number.isInteger(value)) return value
  const normalized = normalizeNonEmpty(value)
  if (!normalized) throw new Error(`${label} must be an integer.`)
  const parsed = Number.parseInt(normalized, 10)
  if (!Number.isInteger(parsed)) throw new Error(`${label} must be an integer.`)
  return parsed
}

function toStringArray(values: unknown): string[] {
  return Array.isArray(values)
    ? values.map((entry) => normalizeNonEmpty(entry)).filter((entry): entry is string => Boolean(entry))
    : []
}

function parseJsonSeed(input: unknown, label = '--input'): Record<string, unknown> {
  const normalized = normalizeNonEmpty(input)
  if (!normalized) return {}
  const parsed = parseJsonInput(normalized, label)
  if (!isRecord(parsed)) throw new Error(`${label} must be a JSON object or @file.json object.`)
  return parsed
}

function parseUnknownJsonInput(input: unknown, label: string): unknown {
  const normalized = normalizeNonEmpty(input)
  if (!normalized) return undefined
  return parseJsonInput(normalized, label)
}

function resolveStringField(explicit: unknown, seed: Record<string, unknown>, key: string): string | undefined {
  return normalizeNonEmpty(explicit) ?? normalizeNonEmpty(seed[key])
}

function resolveStringArrayField(explicit: unknown, seed: Record<string, unknown>, key: string): string[] | undefined {
  const explicitValues = toStringArray(explicit)
  if (explicitValues.length > 0) return explicitValues
  const seededValues = toStringArray(seed[key])
  return seededValues.length > 0 ? seededValues : undefined
}

function resolveUnknownField(explicit: unknown, seed: Record<string, unknown>, key: string, label: string): unknown {
  const explicitValue = parseUnknownJsonInput(explicit, label)
  if (explicitValue !== undefined) return explicitValue
  return seed[key]
}

function extractId(value: unknown): string | undefined {
  return normalizeNonEmpty(value)
}

function collectResourceArtifacts(result: unknown): Record<string, string> | undefined {
  const root = unwrapResultData<Record<string, unknown>>(result) ?? (isRecord(result) ? result : {})
  const resourceId = extractId(root?.resourceId) ?? extractId(root?.id)
  return resourceId ? { resourceId } : undefined
}

function jsonByteLength(value: unknown): number | undefined {
  try {
    return Buffer.byteLength(JSON.stringify(value), 'utf8')
  } catch {
    return undefined
  }
}

function summarizeText(value: unknown, maxLength = 180): string | undefined {
  const text = normalizeNonEmpty(value)
  if (!text) return undefined
  if (text.length <= maxLength) return text
  return `${text.slice(0, maxLength - 3)}...`
}

function summarizeMeta(value: unknown): Record<string, unknown> | undefined {
  if (value === undefined) return undefined
  if (isRecord(value)) {
    const keys = Object.keys(value).sort()
    return compactPayload({
      kind: 'object',
      keyCount: keys.length,
      keys,
      bytes: jsonByteLength(value),
    })
  }
  if (Array.isArray(value)) {
    return compactPayload({
      kind: 'array',
      length: value.length,
      bytes: jsonByteLength(value),
    })
  }
  return compactPayload({
    kind: value === null ? 'null' : typeof value,
    bytes: jsonByteLength(value),
    preview: summarizeText(value, 80),
  })
}

function summarizeResourceRecord(value: unknown): unknown {
  if (!isRecord(value)) return value

  const description = normalizeNonEmpty(value.description)
  const descriptionPreview = summarizeText(description)

  return compactPayload({
    id: normalizeNonEmpty(value.id),
    scopeId: normalizeNonEmpty(value.scopeId),
    projectId: normalizeNonEmpty(value.projectId),
    name: normalizeNonEmpty(value.name),
    resourceType: normalizeNonEmpty(value.resourceType),
    uri: normalizeNonEmpty(value.uri),
    url: normalizeNonEmpty(value.url),
    refType: normalizeNonEmpty(value.refType),
    refId: normalizeNonEmpty(value.refId),
    tags: Array.isArray(value.tags) ? value.tags : undefined,
    description: descriptionPreview,
    descriptionBytes: description ? Buffer.byteLength(description, 'utf8') : undefined,
    descriptionTruncated: description && descriptionPreview !== description ? true : undefined,
    metaSummary: summarizeMeta(value.meta),
    createdAt: normalizeNonEmpty(value.createdAt),
    updatedAt: normalizeNonEmpty(value.updatedAt),
  })
}

function summarizeResourceListResult(result: unknown): unknown {
  if (Array.isArray(result)) {
    return result.map(summarizeResourceRecord)
  }

  if (isRecord(result) && Array.isArray(result.data)) {
    const data = result.data.map(summarizeResourceRecord)
    return {
      ...result,
      data,
      summary: {
        mode: 'resource-list-summary',
        count: data.length,
        omitted: ['meta'],
        fullRecordHint: 'Use `aops-cli resource get --id <resource-id> --json` for full metadata.',
      },
    }
  }

  return summarizeResourceRecord(result)
}

function buildGatewayOptions(
  options: AgentGatewayContextOptions,
  resolvedContext: ResolvedResourceContext,
): AgentGatewayContextOptions {
  return {
    ...options,
    ...preferProjectNameBinding(resolvedContext),
  }
}

async function hydrateProjectContext(
  apiState: CliApiClientState,
  options: AgentGatewayContextOptions,
  resolvedContext: ResolvedResourceContext,
): Promise<ResolvedResourceContext> {
  const projectId = normalizeNonEmpty(resolvedContext.projectId)
  if (!projectId) return resolvedContext
  if (normalizeNonEmpty(options.scopeId)) {
    return resolvedContext
  }

  const payload = await invokeHostedToolWithApiState(apiState, {
    ...buildGatewayOptions(options, resolvedContext),
    toolId: 'agentspace.project.get-by-id',
    input: { id: projectId },
  })
  const result = unwrapHostedToolResult(payload)
  const project = unwrapResultData<Record<string, unknown>>(result)
  if (!isRecord(project)) return resolvedContext

  const scopeId = resolveOwnerScopeIdFromProjectRecord(project, resolvedContext.scopeId)
  const projectName = normalizeNonEmpty(project.name) ?? resolvedContext.projectName

  return {
    ...resolvedContext,
    scopeId,
    projectName,
  }
}

async function resolveResourceContext(
  options: ResourceContextOptions,
  apiState: CliApiClientState,
): Promise<ResolvedResourceContext> {
  const resolved = await resolveProjectBindingContext(options, {
    requireProject: false,
  })
  const scopeId = normalizeNonEmpty(options.scopeId) ?? resolveOwnerScopeIdFromBinding(resolved)
  return hydrateProjectContext(apiState, options, {
    ...resolved,
    scopeId,
  })
}

function buildResolvedContextRecord(context: ResolvedResourceContext): Record<string, unknown> {
  return compactPayload({
    repoRoot: context.repoRoot,
    configPath: context.configPath,
    configFound: context.configFound,
    scopeId: context.scopeId,
    projectId: context.projectId,
    projectName: context.projectName,
  })
}

const buildEnvelope = buildHostedSugarEnvelope

function ensureResourceId(id: unknown, label = '--id'): string {
  const resolved = normalizeNonEmpty(id)
  if (!resolved) throw new Error(`Provide ${label}.`)
  return resolved
}

function requireScopeId(context: ResolvedResourceContext, seed: Record<string, unknown>): string {
  const scopeId = normalizeNonEmpty(context.scopeId) ?? normalizeNonEmpty(seed.scopeId)
  if (!scopeId) {
    throw new Error(missingScopeIdMessage('Resource create'))
  }
  return scopeId
}

async function invokeResourceTool(
  apiState: CliApiClientState,
  options: ResourceContextOptions & HostedWriteOptions,
  resolvedContext: ResolvedResourceContext,
  params: {
    command: string
    toolId: string
    input: Record<string, unknown>
    successText: string
  },
): Promise<void> {
  ensureGuardedWrite(options, 'This command mutates hosted resource state.')
  const payload = await invokeHostedToolWithApiState(apiState, {
    ...buildGatewayOptions(options, resolvedContext),
    tenantId: options.tenantId,
    locale: options.locale,
    fallbackLocale: options.fallbackLocale,
    timeoutMs: options.timeoutMs,
    apiBaseUrl: options.apiBaseUrl,
    accessToken: options.accessToken,
    refreshToken: options.refreshToken,
    toolId: params.toolId,
    input: params.input,
    preview: options.preview,
    apply: options.apply,
    confirm: options.confirm,
    idempotencyKey: options.idempotencyKey,
  })
  const result = unwrapHostedToolResult(payload)

  if (options.json) {
    console.log(JSON.stringify(buildEnvelope({
      command: params.command,
      toolId: params.toolId,
      resolvedContext: buildResolvedContextRecord(resolvedContext),
      input: params.input,
      artifacts: collectResourceArtifacts(result),
      result,
    }), null, 2))
    return
  }

  logSuccess(params.successText)
  console.log(JSON.stringify(result, null, 2))
}

export async function runResourceList(options: ResourceListOptions = {}): Promise<void> {
  try {
    const apiState = await requireApiState(options)
    if (!apiState) return
    const resolvedContext = await resolveResourceContext(options, apiState)

    const input = {
      filter: compactPayload({
        scopeId: normalizeNonEmpty(resolvedContext.scopeId),
        scopeResolution: options.scopeResolution,
        name: normalizeNonEmpty(options.name),
        resourceType: normalizeNonEmpty(options.resourceType),
        tags: options.tag && options.tag.length > 0 ? options.tag : undefined,
        refType: normalizeNonEmpty(options.refType),
        refId: normalizeNonEmpty(options.refId),
      }),
      options: compactPayload({
        limit: options.limit !== undefined ? toInteger(options.limit, '--limit') : undefined,
      }),
    }

    const payload = await invokeHostedToolWithApiState(apiState, {
      ...buildGatewayOptions(options, resolvedContext),
      tenantId: options.tenantId,
      locale: options.locale,
      fallbackLocale: options.fallbackLocale,
      timeoutMs: options.timeoutMs,
      apiBaseUrl: options.apiBaseUrl,
      accessToken: options.accessToken,
      refreshToken: options.refreshToken,
      toolId: 'agentspace.resource.list-resources',
      input,
    })
    const result = unwrapHostedToolResult(payload)
    const outputResult = options.summary ? summarizeResourceListResult(result) : result

    if (options.json) {
      console.log(JSON.stringify(buildEnvelope({
        command: 'resource.list',
        toolId: 'agentspace.resource.list-resources',
        resolvedContext: buildResolvedContextRecord(resolvedContext),
        input,
        result: outputResult,
      }), null, 2))
      return
    }

    logSuccess('Resource list loaded.')
    console.log(JSON.stringify(outputResult, null, 2))
  } catch (error) {
    logError(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}

export async function runResourceGet(options: ResourceGetOptions = {}): Promise<void> {
  try {
    const apiState = await requireApiState(options)
    if (!apiState) return
    const resolvedContext = await resolveResourceContext(options, apiState)
    const id = ensureResourceId(options.id)
    const input = { id }
    const payload = await invokeHostedToolWithApiState(apiState, {
      ...buildGatewayOptions(options, resolvedContext),
      tenantId: options.tenantId,
      locale: options.locale,
      fallbackLocale: options.fallbackLocale,
      timeoutMs: options.timeoutMs,
      apiBaseUrl: options.apiBaseUrl,
      accessToken: options.accessToken,
      refreshToken: options.refreshToken,
      toolId: 'agentspace.resource.get-resource',
      input,
    })
    const result = unwrapHostedToolResult(payload)

    if (options.json) {
      console.log(JSON.stringify(buildEnvelope({
        command: 'resource.get',
        toolId: 'agentspace.resource.get-resource',
        resolvedContext: buildResolvedContextRecord(resolvedContext),
        input,
        artifacts: collectResourceArtifacts(result),
        result,
      }), null, 2))
      return
    }

    logSuccess('Resource loaded.')
    console.log(JSON.stringify(result, null, 2))
  } catch (error) {
    logError(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}

export async function runResourceCreate(options: ResourceCreateOptions = {}): Promise<void> {
  try {
    const apiState = await requireApiState(options)
    if (!apiState) return
    const resolvedContext = await resolveResourceContext(options, apiState)
    const seed = parseJsonSeed(options.input)
    const name = resolveStringField(options.name, seed, 'name')
    const resourceType = resolveStringField(options.resourceType, seed, 'resourceType')
    if (!name) throw new Error('Resource create requires --name or input.name.')
    if (!resourceType) throw new Error('Resource create requires --resource-type or input.resourceType.')
    const input = {
      data: compactPayload({
        scopeId: requireScopeId(resolvedContext, seed),
        name,
        description: resolveStringField(options.description, seed, 'description'),
        resourceType,
        uri: resolveStringField(options.uri, seed, 'uri'),
        tags: resolveStringArrayField(options.tag, seed, 'tags'),
        refType: resolveStringField(options.refType, seed, 'refType'),
        refId: resolveStringField(options.refId, seed, 'refId'),
        meta: resolveUnknownField(options.meta, seed, 'meta', '--meta'),
      }),
    }
    await invokeResourceTool(apiState, options, resolvedContext, {
      command: 'resource.create',
      toolId: 'agentspace.resource.create-resource',
      input,
      successText: 'Resource created.',
    })
  } catch (error) {
    logError(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}

export async function runResourceUpdate(options: ResourceUpdateOptions = {}): Promise<void> {
  try {
    const apiState = await requireApiState(options)
    if (!apiState) return
    const resolvedContext = await resolveResourceContext(options, apiState)
    const seed = parseJsonSeed(options.input)
    const id = ensureResourceId(resolveStringField(options.id, seed, 'id'))
    const patch = compactPayload({
      name: resolveStringField(options.name, seed, 'name'),
      description: resolveStringField(options.description, seed, 'description'),
      resourceType: resolveStringField(options.resourceType, seed, 'resourceType'),
      uri: resolveStringField(options.uri, seed, 'uri'),
      tags: resolveStringArrayField(options.tag, seed, 'tags'),
      refType: resolveStringField(options.refType, seed, 'refType'),
      refId: resolveStringField(options.refId, seed, 'refId'),
      meta: resolveUnknownField(options.meta, seed, 'meta', '--meta'),
    })
    if (Object.keys(patch).length === 0) {
      throw new Error('Provide at least one resource field to update.')
    }
    const input = { id, patch }
    await invokeResourceTool(apiState, options, resolvedContext, {
      command: 'resource.update',
      toolId: 'agentspace.resource.update-resource',
      input,
      successText: 'Resource updated.',
    })
  } catch (error) {
    logError(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}

export async function runResourceDelete(options: ResourceDeleteOptions = {}): Promise<void> {
  try {
    ensureDestructiveWrite(options, 'This command deletes hosted resources.')
    const apiState = await requireApiState(options)
    if (!apiState) return
    const resolvedContext = await resolveResourceContext(options, apiState)
    const id = ensureResourceId(options.id)
    const input = { id }
    await invokeResourceTool(apiState, options, resolvedContext, {
      command: 'resource.delete',
      toolId: 'agentspace.resource.remove-resource',
      input,
      successText: 'Resource deleted.',
    })
  } catch (error) {
    logError(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}

function applyResourceContextOptions(
  cmd: Command,
  params: {
    withScopeResolution?: boolean
  } = {},
): Command {
  applyCommonOptions(cmd)
  cmd.option('--project-id <id>', 'Project id used to resolve repo-bound resource ownership')
  cmd.option('--project-name <name>', 'Project name used to resolve repo-bound resource ownership')
  cmd.option('--scope-id <id>', 'Explicit scope id override for resource ownership')
  if (params.withScopeResolution) {
    cmd.option('--scope-resolution <mode>', 'Scope resolution policy: explicit or cascade')
  }
  return cmd
}

function applyWriteGuards(cmd: Command, params: { destructive?: boolean } = {}): Command {
  cmd.option('--preview', 'Return a validated preflight summary without executing the tool')
  cmd.option('--apply', 'Execute the hosted write operation')
  if (params.destructive) {
    cmd.option('--confirm', 'Required with --apply for destructive deletes')
  }
  cmd.option('--idempotency-key <key>', 'Optional idempotency key for hosted writes')
  return cmd
}

function applyJsonSeedOption(cmd: Command): Command {
  cmd.option('--input <jsonOrFile>', 'Optional JSON object seed or @file.json')
  return cmd
}

export function makeResourceCommand(): Command {
  const cmd = new Command('resource').description('Agentspace resource sugar commands over the hosted AOPS gateway')

  applyResourceContextOptions(
    cmd.command('list')
      .description('List reusable resource shells')
      .option('--name <text>', 'Resource name filter')
      .option('--resource-type <type>', 'Resource type filter')
      .option('--tag <tag>', 'Resource tag filter', collectRepeatedOption, [])
      .option('--ref-type <type>', 'Resource refType filter')
      .option('--ref-id <id>', 'Resource refId filter')
      .option('--limit <n>', 'Optional item limit')
      .option('--summary', 'Print compact resource records and omit raw meta payloads'),
    { withScopeResolution: true },
  ).action(async (options: ResourceListOptions) => {
    await runResourceList(options)
  })

  applyResourceContextOptions(
    cmd.command('get')
      .description('Get a resource by id')
      .requiredOption('--id <id>', 'Resource id'),
  ).action(async (options: ResourceGetOptions) => {
    await runResourceGet(options)
  })

  applyWriteGuards(applyJsonSeedOption(applyResourceContextOptions(
    cmd.command('create')
      .description('Create a scope-owned resource')
      .requiredOption('--name <text>', 'Resource name')
      .requiredOption('--resource-type <type>', 'Resource type: document, rule, spec, link, reference, template, dataset, code, skill')
      .option('--description <text>', 'Resource description')
      .option('--uri <text>', 'Resource uri')
      .option('--tag <tag>', 'Resource tag', collectRepeatedOption, [])
      .option('--ref-type <type>', 'Optional resource refType')
      .option('--ref-id <id>', 'Optional resource refId')
      .option('--meta <jsonOrFile>', 'JSON meta object/array/value or @file.json'),
  ))).action(async (options: ResourceCreateOptions) => {
    await runResourceCreate(options)
  })

  applyWriteGuards(applyJsonSeedOption(applyResourceContextOptions(
    cmd.command('update')
      .description('Update a resource')
      .requiredOption('--id <id>', 'Resource id')
      .option('--name <text>', 'Resource name')
      .option('--resource-type <type>', 'Resource type')
      .option('--description <text>', 'Resource description')
      .option('--uri <text>', 'Resource uri')
      .option('--tag <tag>', 'Resource tag', collectRepeatedOption, [])
      .option('--ref-type <type>', 'Optional resource refType')
      .option('--ref-id <id>', 'Optional resource refId')
      .option('--meta <jsonOrFile>', 'JSON meta object/array/value or @file.json'),
  ))).action(async (options: ResourceUpdateOptions) => {
    await runResourceUpdate(options)
  })

  applyWriteGuards(applyResourceContextOptions(
    cmd.command('delete')
      .description('Delete a resource')
      .requiredOption('--id <id>', 'Resource id'),
  ), { destructive: true }).action(async (options: ResourceDeleteOptions) => {
    await runResourceDelete(options)
  })

  cmd.addHelpText(
    'after',
    buildOperatorCookbook({
      examples: [
        'aops-cli resource create --name "Hexagen Guide" --resource-type document --apply --json',
        'aops-cli resource list --resource-type document --summary --json',
        'aops-cli resource update --id <resource-id> --uri https://example.test/spec --apply --json',
        'aops-cli resource get --id <resource-id> --json',
      ],
      guide: GUIDE_PATHS.agentspace,
      notes: [
        'Read-only list/get commands do not require --apply.',
        'Use list --summary for token-efficient inventories; use get --id for full metadata.',
      ],
    }),
  )

  return cmd
}
