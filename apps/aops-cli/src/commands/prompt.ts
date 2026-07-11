import { readFileSync } from 'node:fs'
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
  resolveNextVersionNumber,
} from '../utils/hosted-sugar.js'
import { GUIDE_PATHS } from '../utils/guide-paths.js'
import type { CliApiClientState } from '../utils/api.js'

type PromptContextOptions = AgentGatewayContextOptions & {
  projectName?: string
  scopeId?: string
  scopeResolution?: 'explicit' | 'cascade'
}

type PromptVersionPayloadOptions = {
  projectId?: string
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

type PromptListOptions = PromptContextOptions & {
  name?: string
  status?: 'draft' | 'published' | 'archived'
  tag?: string[]
  limit?: string | number
}

type PromptGetOptions = PromptContextOptions & {
  id?: string
}

type PromptCreateOptions = PromptContextOptions &
  JsonSeedOptions &
  GuardedWriteOptions & {
    name?: string
    description?: string
    status?: 'draft' | 'published' | 'archived'
    tag?: string[]
  }

type PromptUpdateOptions = PromptContextOptions &
  JsonSeedOptions &
  GuardedWriteOptions & {
    id?: string
    name?: string
    description?: string
    status?: 'draft' | 'published' | 'archived'
    tag?: string[]
    currentVersionId?: string
  }

type PromptDeleteOptions = PromptContextOptions &
  GuardedWriteOptions & {
    id?: string
  }

type PromptInspectOptions = PromptContextOptions & {
  id?: string
  summary?: boolean
}

type PromptCurrentOptions = PromptContextOptions & {
  id?: string
  summary?: boolean
}

type PromptVersionListOptions = PromptContextOptions &
  PromptVersionPayloadOptions & {
    promptId?: string
    status?: 'draft' | 'published' | 'archived'
    refType?: string
    refId?: string
    limit?: string | number
    summary?: boolean
  }

type PromptVersionGetOptions = PromptContextOptions & {
  id?: string
}

type PromptVersionCreateOptions = PromptContextOptions &
  PromptVersionPayloadOptions &
  JsonSeedOptions &
  GuardedWriteOptions & {
    promptId?: string
    version?: string | number
    status?: 'draft' | 'published' | 'archived'
    content?: string
    variables?: string
    meta?: string
    refType?: string
    refId?: string
  }

type PromptVersionUpdateOptions = PromptContextOptions &
  PromptVersionPayloadOptions &
  JsonSeedOptions &
  GuardedWriteOptions & {
    id?: string
    version?: string | number
    status?: 'draft' | 'published' | 'archived'
    content?: string
    variables?: string
    meta?: string
    refType?: string
    refId?: string
  }

type PromptVersionPublishOptions = PromptContextOptions &
  GuardedWriteOptions & {
    id?: string
  }

type PromptVersionDeleteOptions = PromptContextOptions &
  GuardedWriteOptions & {
    id?: string
  }

type ResolvedPromptContext = Awaited<ReturnType<typeof resolveProjectBindingContext>> & {
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

function unwrapListItems(result: unknown): Record<string, unknown>[] {
  const data = unwrapResultData<unknown>(result)
  if (Array.isArray(data)) {
    return data.filter((entry): entry is Record<string, unknown> => isRecord(entry))
  }
  if (isRecord(data) && Array.isArray(data.items)) {
    return data.items.filter((entry): entry is Record<string, unknown> => isRecord(entry))
  }
  if (Array.isArray(result)) {
    return result.filter((entry): entry is Record<string, unknown> => isRecord(entry))
  }
  return []
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

function normalizeTags(values: unknown): string[] {
  const seen = new Set<string>()
  const tags: string[] = []
  for (const value of toStringArray(values)) {
    const normalized = value.toLowerCase()
    if (seen.has(normalized)) continue
    seen.add(normalized)
    tags.push(normalized)
  }
  return tags
}

function recordMatchesTags(record: Record<string, unknown>, expectedTags: string[]): boolean {
  if (expectedTags.length === 0) return true
  const actual = new Set(toStringArray(record.tags).map((tag) => tag.toLowerCase()))
  return expectedTags.every((tag) => actual.has(tag))
}

function applyPromptTagFilter(result: unknown, expectedTags: string[], limit?: number): unknown {
  if (expectedTags.length === 0) return result
  const filtered = unwrapListItems(result)
    .filter((entry) => recordMatchesTags(entry, expectedTags))
    .slice(0, limit)

  if (isRecord(result) && Array.isArray(result.data)) {
    return { ...result, data: filtered }
  }
  if (isRecord(result) && isRecord(result.data) && Array.isArray(result.data.items)) {
    return { ...result, data: { ...result.data, items: filtered } }
  }
  if (Array.isArray(result)) return filtered
  return { ok: true, data: filtered }
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

function readTextInput(input: unknown): string | undefined {
  if (typeof input !== 'string') return undefined
  const trimmed = input.trim()
  if (!trimmed) return undefined
  if (trimmed.startsWith('@')) {
    const filePath = trimmed.slice(1).trim()
    if (!filePath) throw new Error('Expected a file path after @.')
    return readFileSync(filePath, 'utf8')
  }
  return input
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

function resolveIntegerField(explicit: unknown, seed: Record<string, unknown>, key: string, label: string): number | undefined {
  if (explicit !== undefined && explicit !== null && explicit !== '') return toInteger(explicit, label)
  if (seed[key] !== undefined && seed[key] !== null && seed[key] !== '') return toInteger(seed[key], label)
  return undefined
}

function resolveTextField(explicit: unknown, seed: Record<string, unknown>, key: string): string | undefined {
  const explicitValue = readTextInput(explicit)
  if (explicitValue !== undefined) return explicitValue
  return typeof seed[key] === 'string' ? (seed[key] as string) : undefined
}

function resolveUnknownField(explicit: unknown, seed: Record<string, unknown>, key: string, label: string): unknown {
  const explicitValue = parseUnknownJsonInput(explicit, label)
  if (explicitValue !== undefined) return explicitValue
  return seed[key]
}

function extractId(value: unknown): string | undefined {
  return normalizeNonEmpty(value)
}

function collectPromptArtifacts(result: unknown): Record<string, string> | undefined {
  const root = unwrapResultData<Record<string, unknown>>(result) ?? (isRecord(result) ? result : {})
  const artifacts: Record<string, string> = {}
  const push = (key: string, value: unknown) => {
    const normalized = extractId(value)
    if (normalized) artifacts[key] = normalized
  }

  push('promptId', root?.promptId)
  if (!artifacts.promptId && !normalizeNonEmpty(root.promptId) && !normalizeNonEmpty(root.content)) {
    push('promptId', root?.id)
  }
  push('currentVersionId', root?.currentVersionId)
  push('promptVersionId', root?.promptVersionId)
  if (!artifacts.promptVersionId && (normalizeNonEmpty(root.promptId) || normalizeNonEmpty(root.content))) {
    push('promptVersionId', root?.id)
  }

  return Object.keys(artifacts).length > 0 ? artifacts : undefined
}

function summarizeContent(value: unknown): Record<string, unknown> | undefined {
  const content = normalizeNonEmpty(value)
  if (!content) return undefined
  return compactPayload({
    omitted: true,
    bytes: Buffer.byteLength(content, 'utf8'),
    lines: content.split(/\r\n|\r|\n/).length,
  })
}

function summarizePromptVersionRecord(value: unknown): unknown {
  if (!isRecord(value)) return value
  const { content, ...rest } = value
  return compactPayload({
    ...rest,
    contentSummary: summarizeContent(content),
  })
}

function summarizePromptCurrentResult(result: unknown): unknown {
  if (!isRecord(result)) return result
  return compactPayload({
    ...result,
    currentVersion: summarizePromptVersionRecord(result.currentVersion),
    summary: {
      mode: 'prompt-current-summary',
      omitted: ['currentVersion.content'],
      fullRecordHint: 'Use `aops-cli prompt current --id <prompt-id> --json` for full content.',
    },
  })
}

function summarizePromptInspectResult(result: unknown): unknown {
  if (!isRecord(result)) return result
  const versions = Array.isArray(result.versions)
    ? result.versions.map(summarizePromptVersionRecord)
    : result.versions
  return compactPayload({
    ...result,
    versions,
    currentVersion: summarizePromptVersionRecord(result.currentVersion),
    summary: {
      ...(isRecord(result.summary) ? result.summary : {}),
      mode: 'prompt-inspect-summary',
      omitted: ['versions[].content', 'currentVersion.content'],
      fullRecordHint: 'Use `aops-cli prompt inspect --id <prompt-id> --json` for full content.',
    },
  })
}

function summarizePromptVersionListResult(result: unknown): unknown {
  if (Array.isArray(result)) return result.map(summarizePromptVersionRecord)
  if (!isRecord(result)) return result
  const data = Array.isArray(result.data)
    ? result.data.map(summarizePromptVersionRecord)
    : result.data
  const items = Array.isArray(result.items)
    ? result.items.map(summarizePromptVersionRecord)
    : result.items
  return compactPayload({
    ...result,
    data,
    items,
    summary: {
      ...(isRecord(result.summary) ? result.summary : {}),
      mode: 'prompt-version-list-summary',
      omitted: ['data[].content', 'items[].content'],
      fullRecordHint: 'Use `aops-cli prompt version list --prompt-id <prompt-id> --json` for full content.',
    },
  })
}

function buildGatewayOptions(
  options: AgentGatewayContextOptions,
  resolvedContext: ResolvedPromptContext,
): AgentGatewayContextOptions {
  return {
    ...options,
    projectId: normalizeNonEmpty(options.projectId) ?? normalizeNonEmpty(resolvedContext.projectId),
    projectName: normalizeNonEmpty(options.projectName) ?? normalizeNonEmpty(resolvedContext.projectName),
  }
}

async function hydrateProjectContext(
  apiState: CliApiClientState,
  options: AgentGatewayContextOptions,
  resolvedContext: ResolvedPromptContext,
): Promise<ResolvedPromptContext> {
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

async function resolvePromptContext(
  options: PromptContextOptions,
  apiState: CliApiClientState,
): Promise<ResolvedPromptContext> {
  const resolved = await resolveProjectBindingContext(options, {
    requireProject: false,
  })
  const scopeId = normalizeNonEmpty(options.scopeId) ?? resolveOwnerScopeIdFromBinding(resolved)
  return hydrateProjectContext(apiState, options, {
    ...resolved,
    scopeId,
  })
}

function buildResolvedContextRecord(context: ResolvedPromptContext): Record<string, unknown> {
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

function ensurePromptId(id: unknown, label = '--id'): string {
  const resolved = normalizeNonEmpty(id)
  if (!resolved) throw new Error(`Provide ${label}.`)
  return resolved
}

function requireScopeId(context: ResolvedPromptContext, seed: Record<string, unknown>): string {
  const scopeId = normalizeNonEmpty(context.scopeId) ?? normalizeNonEmpty(seed.scopeId)
  if (!scopeId) {
    throw new Error(missingScopeIdMessage('Prompt create'))
  }
  return scopeId
}

function requireProjectId(
  options: PromptVersionPayloadOptions & AgentGatewayContextOptions,
  context: ResolvedPromptContext,
  seed: Record<string, unknown>,
): string {
  const projectId =
    normalizeNonEmpty(options.projectId) ??
    normalizeNonEmpty(context.projectId) ??
    normalizeNonEmpty(seed.projectId)
  if (!projectId) {
    throw new Error('Prompt version commands require repo-bound project context or --project-id.')
  }
  return projectId
}

async function invokePromptTool(
  apiState: CliApiClientState,
  options: PromptContextOptions & HostedWriteOptions,
  resolvedContext: ResolvedPromptContext,
  params: {
    command: string
    toolId: string
    input: Record<string, unknown>
    successText: string
  },
): Promise<void> {
  ensureGuardedWrite(options, 'This command mutates hosted prompt state.')
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
      artifacts: collectPromptArtifacts(result),
      result,
    }), null, 2))
    return
  }

  logSuccess(params.successText)
  console.log(JSON.stringify(result, null, 2))
}

export async function runPromptList(options: PromptListOptions = {}): Promise<void> {
  try {
    const apiState = await requireApiState(options)
    if (!apiState) return
    const resolvedContext = await resolvePromptContext(options, apiState)
    const tags = normalizeTags(options.tag)
    const limit = options.limit !== undefined ? toInteger(options.limit, '--limit') : undefined

    const input = {
      filter: compactPayload({
        scopeId: normalizeNonEmpty(resolvedContext.scopeId),
        scopeResolution: options.scopeResolution,
        name: normalizeNonEmpty(options.name),
        status: normalizeNonEmpty(options.status),
        tags: options.tag && options.tag.length > 0 ? options.tag : undefined,
      }),
      options: compactPayload({
        limit,
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
      toolId: 'agentspace.prompt.list-prompts',
      input,
    })
    let result = unwrapHostedToolResult(payload)
    if (tags.length > 0 && unwrapListItems(result).length === 0) {
      const fallbackInput = {
        filter: compactPayload({
          scopeId: normalizeNonEmpty(resolvedContext.scopeId),
          scopeResolution: options.scopeResolution,
          name: normalizeNonEmpty(options.name),
          status: normalizeNonEmpty(options.status),
        }),
      }
      const fallbackPayload = await invokeHostedToolWithApiState(apiState, {
        ...buildGatewayOptions(options, resolvedContext),
        tenantId: options.tenantId,
        locale: options.locale,
        fallbackLocale: options.fallbackLocale,
        timeoutMs: options.timeoutMs,
        apiBaseUrl: options.apiBaseUrl,
        accessToken: options.accessToken,
        refreshToken: options.refreshToken,
        toolId: 'agentspace.prompt.list-prompts',
        input: fallbackInput,
      })
      result = applyPromptTagFilter(unwrapHostedToolResult(fallbackPayload), tags, limit)
    }

    if (options.json) {
      console.log(JSON.stringify(buildEnvelope({
        command: 'prompt.list',
        toolId: 'agentspace.prompt.list-prompts',
        resolvedContext: buildResolvedContextRecord(resolvedContext),
        input,
        result,
      }), null, 2))
      return
    }

    logSuccess('Prompt list loaded.')
    console.log(JSON.stringify(result, null, 2))
  } catch (error) {
    logError(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}

export async function runPromptGet(options: PromptGetOptions = {}): Promise<void> {
  try {
    const apiState = await requireApiState(options)
    if (!apiState) return
    const resolvedContext = await resolvePromptContext(options, apiState)
    const id = ensurePromptId(options.id)
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
      toolId: 'agentspace.prompt.get-prompt',
      input,
    })
    const result = unwrapHostedToolResult(payload)

    if (options.json) {
      console.log(JSON.stringify(buildEnvelope({
        command: 'prompt.get',
        toolId: 'agentspace.prompt.get-prompt',
        resolvedContext: buildResolvedContextRecord(resolvedContext),
        input,
        artifacts: collectPromptArtifacts(result),
        result,
      }), null, 2))
      return
    }

    logSuccess('Prompt loaded.')
    console.log(JSON.stringify(result, null, 2))
  } catch (error) {
    logError(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}

export async function runPromptCreate(options: PromptCreateOptions = {}): Promise<void> {
  try {
    const apiState = await requireApiState(options)
    if (!apiState) return
    const resolvedContext = await resolvePromptContext(options, apiState)
    const seed = parseJsonSeed(options.input)
    const name = resolveStringField(options.name, seed, 'name')
    if (!name) throw new Error('Prompt create requires --name or input.name.')
    const input = {
      data: compactPayload({
        scopeId: requireScopeId(resolvedContext, seed),
        name,
        description: resolveStringField(options.description, seed, 'description'),
        tags: resolveStringArrayField(options.tag, seed, 'tags'),
        status: resolveStringField(options.status, seed, 'status') ?? 'draft',
      }),
    }
    await invokePromptTool(apiState, options, resolvedContext, {
      command: 'prompt.create',
      toolId: 'agentspace.prompt.create',
      input,
      successText: 'Prompt created.',
    })
  } catch (error) {
    logError(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}

export async function runPromptUpdate(options: PromptUpdateOptions = {}): Promise<void> {
  try {
    const apiState = await requireApiState(options)
    if (!apiState) return
    const resolvedContext = await resolvePromptContext(options, apiState)
    const seed = parseJsonSeed(options.input)
    const id = ensurePromptId(resolveStringField(options.id, seed, 'id'))
    const patch = compactPayload({
      name: resolveStringField(options.name, seed, 'name'),
      description: resolveStringField(options.description, seed, 'description'),
      status: resolveStringField(options.status, seed, 'status'),
      tags: resolveStringArrayField(options.tag, seed, 'tags'),
      currentVersionId: resolveStringField(options.currentVersionId, seed, 'currentVersionId'),
    })
    if (Object.keys(patch).length === 0) {
      throw new Error('Provide at least one prompt field to update.')
    }
    const input = { id, patch }
    await invokePromptTool(apiState, options, resolvedContext, {
      command: 'prompt.update',
      toolId: 'agentspace.prompt.update-prompt',
      input,
      successText: 'Prompt updated.',
    })
  } catch (error) {
    logError(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}

export async function runPromptDelete(options: PromptDeleteOptions = {}): Promise<void> {
  try {
    ensureDestructiveWrite(options, 'This command deletes hosted prompts.')
    const apiState = await requireApiState(options)
    if (!apiState) return
    const resolvedContext = await resolvePromptContext(options, apiState)
    const id = ensurePromptId(options.id)
    const input = { id }
    await invokePromptTool(apiState, options, resolvedContext, {
      command: 'prompt.delete',
      toolId: 'agentspace.prompt.remove-prompt',
      input,
      successText: 'Prompt deleted.',
    })
  } catch (error) {
    logError(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}

async function loadPrompt(
  apiState: CliApiClientState,
  options: PromptContextOptions,
  resolvedContext: ResolvedPromptContext,
  id: string,
): Promise<Record<string, unknown> | null> {
  const payload = await invokeHostedToolWithApiState(apiState, {
    ...buildGatewayOptions(options, resolvedContext),
    tenantId: options.tenantId,
    locale: options.locale,
    fallbackLocale: options.fallbackLocale,
    timeoutMs: options.timeoutMs,
    apiBaseUrl: options.apiBaseUrl,
    accessToken: options.accessToken,
    refreshToken: options.refreshToken,
    toolId: 'agentspace.prompt.get-prompt',
    input: { id },
  })
  const result = unwrapHostedToolResult(payload)
  const prompt = unwrapResultData<Record<string, unknown>>(result)
  return isRecord(prompt) ? prompt : null
}

async function loadPromptVersionById(
  apiState: CliApiClientState,
  options: PromptContextOptions,
  resolvedContext: ResolvedPromptContext,
  id: string,
): Promise<Record<string, unknown> | null> {
  const payload = await invokeHostedToolWithApiState(apiState, {
    ...buildGatewayOptions(options, resolvedContext),
    tenantId: options.tenantId,
    locale: options.locale,
    fallbackLocale: options.fallbackLocale,
    timeoutMs: options.timeoutMs,
    apiBaseUrl: options.apiBaseUrl,
    accessToken: options.accessToken,
    refreshToken: options.refreshToken,
    toolId: 'agentspace.prompt-version.get-prompt-version',
    input: { id },
  })
  const result = unwrapHostedToolResult(payload)
  const version = unwrapResultData<Record<string, unknown>>(result)
  return isRecord(version) ? version : null
}

async function loadPromptVersions(
  apiState: CliApiClientState,
  options: PromptContextOptions & PromptVersionPayloadOptions,
  resolvedContext: ResolvedPromptContext,
  promptId: string,
  extraFilter: Record<string, unknown> = {},
): Promise<Record<string, unknown>[]> {
  const filter = compactPayload({
    promptId,
    projectId: normalizeNonEmpty(options.projectId) ?? normalizeNonEmpty(resolvedContext.projectId),
    ...extraFilter,
  })
  const payload = await invokeHostedToolWithApiState(apiState, {
    ...buildGatewayOptions(options, resolvedContext),
    tenantId: options.tenantId,
    locale: options.locale,
    fallbackLocale: options.fallbackLocale,
    timeoutMs: options.timeoutMs,
    apiBaseUrl: options.apiBaseUrl,
    accessToken: options.accessToken,
    refreshToken: options.refreshToken,
    toolId: 'agentspace.prompt-version.list-prompt-versions',
    input: { filter },
  })
  return unwrapListItems(unwrapHostedToolResult(payload))
}

export async function runPromptInspect(options: PromptInspectOptions = {}): Promise<void> {
  try {
    const apiState = await requireApiState(options)
    if (!apiState) return
    const resolvedContext = await resolvePromptContext(options, apiState)
    const id = ensurePromptId(options.id)
    const prompt = await loadPrompt(apiState, options, resolvedContext, id)
    if (!prompt) throw new Error(`Prompt not found: ${id}`)
    const versions = await loadPromptVersions(apiState, options, resolvedContext, id)
    const currentVersionId = normalizeNonEmpty(prompt.currentVersionId)
    const currentVersion =
      versions.find((entry) => normalizeNonEmpty(entry.id) === currentVersionId) ??
      (currentVersionId ? await loadPromptVersionById(apiState, options, resolvedContext, currentVersionId) : null)
    const result = compactPayload({
      prompt,
      versions,
      currentVersion,
      summary: compactPayload({
        promptId: normalizeNonEmpty(prompt.id),
        currentVersionId,
        versionCount: versions.length,
      }),
    })
    const outputResult = options.summary ? summarizePromptInspectResult(result) : result

    if (options.json) {
      console.log(JSON.stringify(buildEnvelope({
        command: 'prompt.inspect',
        surface: 'prompt inspection pack',
        resolvedContext: buildResolvedContextRecord(resolvedContext),
        input: { id },
        result: outputResult,
      }), null, 2))
      return
    }

    logSuccess('Prompt inspection pack ready.')
    console.log(JSON.stringify(outputResult, null, 2))
  } catch (error) {
    logError(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}

export async function runPromptCurrent(options: PromptCurrentOptions = {}): Promise<void> {
  try {
    const apiState = await requireApiState(options)
    if (!apiState) return
    const resolvedContext = await resolvePromptContext(options, apiState)
    const id = ensurePromptId(options.id)
    const prompt = await loadPrompt(apiState, options, resolvedContext, id)
    if (!prompt) throw new Error(`Prompt not found: ${id}`)
    const currentVersionId = normalizeNonEmpty(prompt.currentVersionId)
    if (!currentVersionId) {
      throw new Error(`Prompt ${id} does not have a currentVersionId. Publish or select a prompt version first.`)
    }
    const currentVersion = await loadPromptVersionById(apiState, options, resolvedContext, currentVersionId)
    if (!currentVersion) {
      throw new Error(`Current prompt version ${currentVersionId} could not be loaded.`)
    }
    const result = { prompt, currentVersion }
    const outputResult = options.summary ? summarizePromptCurrentResult(result) : result

    if (options.json) {
      console.log(JSON.stringify(buildEnvelope({
        command: 'prompt.current',
        surface: 'prompt current resolution',
        resolvedContext: buildResolvedContextRecord(resolvedContext),
        input: { id },
        artifacts: compactPayload({ promptId: normalizeNonEmpty(prompt.id), promptVersionId: currentVersionId }) as Record<string, string>,
        result: outputResult,
      }), null, 2))
      return
    }

    logSuccess('Current prompt version loaded.')
    console.log(JSON.stringify(outputResult, null, 2))
  } catch (error) {
    logError(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}

export async function runPromptVersionList(options: PromptVersionListOptions = {}): Promise<void> {
  try {
    const apiState = await requireApiState(options)
    if (!apiState) return
    const resolvedContext = await resolvePromptContext(options, apiState)
    const input = {
      filter: compactPayload({
        promptId: normalizeNonEmpty(options.promptId),
        projectId: normalizeNonEmpty(options.projectId) ?? normalizeNonEmpty(resolvedContext.projectId),
        status: normalizeNonEmpty(options.status),
        refType: normalizeNonEmpty(options.refType),
        refId: normalizeNonEmpty(options.refId),
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
      toolId: 'agentspace.prompt-version.list-prompt-versions',
      input,
    })
    const result = unwrapHostedToolResult(payload)
    const outputResult = options.summary ? summarizePromptVersionListResult(result) : result

    if (options.json) {
      console.log(JSON.stringify(buildEnvelope({
        command: 'prompt.version.list',
        toolId: 'agentspace.prompt-version.list-prompt-versions',
        resolvedContext: buildResolvedContextRecord(resolvedContext),
        input,
        result: outputResult,
      }), null, 2))
      return
    }

    logSuccess('Prompt version list loaded.')
    console.log(JSON.stringify(outputResult, null, 2))
  } catch (error) {
    logError(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}

export async function runPromptVersionGet(options: PromptVersionGetOptions = {}): Promise<void> {
  try {
    const apiState = await requireApiState(options)
    if (!apiState) return
    const resolvedContext = await resolvePromptContext(options, apiState)
    const id = ensurePromptId(options.id)
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
      toolId: 'agentspace.prompt-version.get-prompt-version',
      input,
    })
    const result = unwrapHostedToolResult(payload)

    if (options.json) {
      console.log(JSON.stringify(buildEnvelope({
        command: 'prompt.version.get',
        toolId: 'agentspace.prompt-version.get-prompt-version',
        resolvedContext: buildResolvedContextRecord(resolvedContext),
        input,
        artifacts: collectPromptArtifacts(result),
        result,
      }), null, 2))
      return
    }

    logSuccess('Prompt version loaded.')
    console.log(JSON.stringify(result, null, 2))
  } catch (error) {
    logError(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}

export async function runPromptVersionCreate(options: PromptVersionCreateOptions = {}): Promise<void> {
  try {
    const apiState = await requireApiState(options)
    if (!apiState) return
    const resolvedContext = await resolvePromptContext(options, apiState)
    const seed = parseJsonSeed(options.input)
    const promptId = resolveStringField(options.promptId, seed, 'promptId')
    if (!promptId) throw new Error('Prompt version create requires --prompt-id or input.promptId.')
    const content = resolveTextField(options.content, seed, 'content')
    if (!content) throw new Error('Prompt version create requires --content or input.content.')
    const projectId = requireProjectId(options, resolvedContext, seed)
    const version =
      resolveIntegerField(options.version, seed, 'version', '--version') ??
      resolveNextVersionNumber(
        await loadPromptVersions(
          apiState,
          { ...options, projectId },
          { ...resolvedContext, projectId: normalizeNonEmpty(resolvedContext.projectId) ?? projectId },
          promptId,
        ),
      )
    const input = {
      data: compactPayload({
        projectId,
        promptId,
        version,
        status: resolveStringField(options.status, seed, 'status') ?? 'draft',
        content,
        variables: resolveUnknownField(options.variables, seed, 'variables', '--variables'),
        meta: resolveUnknownField(options.meta, seed, 'meta', '--meta'),
        refType: resolveStringField(options.refType, seed, 'refType'),
        refId: resolveStringField(options.refId, seed, 'refId'),
      }),
    }
    await invokePromptTool(apiState, options, resolvedContext, {
      command: 'prompt.version.create',
      toolId: 'agentspace.prompt-version.create',
      input,
      successText: 'Prompt version created.',
    })
  } catch (error) {
    logError(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}

export async function runPromptVersionUpdate(options: PromptVersionUpdateOptions = {}): Promise<void> {
  try {
    const apiState = await requireApiState(options)
    if (!apiState) return
    const resolvedContext = await resolvePromptContext(options, apiState)
    const seed = parseJsonSeed(options.input)
    const id = ensurePromptId(resolveStringField(options.id, seed, 'id'))
    const patch = compactPayload({
      projectId:
        normalizeNonEmpty(options.projectId) ??
        normalizeNonEmpty(seed.projectId),
      version: resolveIntegerField(options.version, seed, 'version', '--version'),
      status: resolveStringField(options.status, seed, 'status'),
      content: resolveTextField(options.content, seed, 'content'),
      variables: resolveUnknownField(options.variables, seed, 'variables', '--variables'),
      meta: resolveUnknownField(options.meta, seed, 'meta', '--meta'),
      refType: resolveStringField(options.refType, seed, 'refType'),
      refId: resolveStringField(options.refId, seed, 'refId'),
    })
    if (Object.keys(patch).length === 0) {
      throw new Error('Provide at least one prompt version field to update.')
    }
    const input = { id, patch }
    await invokePromptTool(apiState, options, resolvedContext, {
      command: 'prompt.version.update',
      toolId: 'agentspace.prompt-version.update-prompt-version',
      input,
      successText: 'Prompt version updated.',
    })
  } catch (error) {
    logError(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}

export async function runPromptVersionPublish(options: PromptVersionPublishOptions = {}): Promise<void> {
  try {
    const apiState = await requireApiState(options)
    if (!apiState) return
    const resolvedContext = await resolvePromptContext(options, apiState)
    const id = ensurePromptId(options.id)
    const input = { id }
    await invokePromptTool(apiState, options, resolvedContext, {
      command: 'prompt.version.publish',
      toolId: 'agentspace.prompt-version.publish-prompt-version',
      input,
      successText: 'Prompt version published.',
    })
  } catch (error) {
    logError(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}

export async function runPromptVersionDelete(options: PromptVersionDeleteOptions = {}): Promise<void> {
  try {
    ensureDestructiveWrite(options, 'This command deletes hosted prompt versions.')
    const apiState = await requireApiState(options)
    if (!apiState) return
    const resolvedContext = await resolvePromptContext(options, apiState)
    const id = ensurePromptId(options.id)
    const input = { id }
    await invokePromptTool(apiState, options, resolvedContext, {
      command: 'prompt.version.delete',
      toolId: 'agentspace.prompt-version.remove-prompt-version',
      input,
      successText: 'Prompt version deleted.',
    })
  } catch (error) {
    logError(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}

function applyPromptContextOptions(
  cmd: Command,
  params: {
    withScopeResolution?: boolean
  } = {},
): Command {
  applyCommonOptions(cmd)
  cmd.option('--project-id <id>', 'Project id used to resolve repo-bound prompt ownership')
  cmd.option('--project-name <name>', 'Project name used to resolve repo-bound prompt ownership')
  cmd.option('--scope-id <id>', 'Explicit scope id override for prompt shell ownership')
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

export function makePromptCommand(): Command {
  const cmd = new Command('prompt').description('Agentspace prompt and prompt-version sugar commands over the hosted AOPS gateway')

  applyPromptContextOptions(
    cmd.command('list')
      .description('List reusable prompt shells')
      .option('--name <text>', 'Prompt name filter')
      .option('--status <status>', 'Prompt status filter')
      .option('--tag <tag>', 'Prompt tag filter', collectRepeatedOption, [])
      .option('--limit <n>', 'Optional item limit'),
    { withScopeResolution: true },
  ).action(async (options: PromptListOptions) => {
    await runPromptList(options)
  })

  applyPromptContextOptions(
    cmd.command('get')
      .description('Get a prompt shell by id')
      .requiredOption('--id <id>', 'Prompt id'),
  ).action(async (options: PromptGetOptions) => {
    await runPromptGet(options)
  })

  applyWriteGuards(applyJsonSeedOption(applyPromptContextOptions(
    cmd.command('create')
      .description('Create a scope-owned prompt shell')
      .requiredOption('--name <text>', 'Prompt name')
      .option('--description <text>', 'Prompt description')
      .option('--status <status>', 'Prompt status')
      .option('--tag <tag>', 'Prompt tag', collectRepeatedOption, []),
  ))).action(async (options: PromptCreateOptions) => {
    await runPromptCreate(options)
  })

  applyWriteGuards(applyJsonSeedOption(applyPromptContextOptions(
    cmd.command('update')
      .description('Update a prompt shell')
      .requiredOption('--id <id>', 'Prompt id')
      .option('--name <text>', 'Prompt name')
      .option('--description <text>', 'Prompt description')
      .option('--status <status>', 'Prompt status')
      .option('--tag <tag>', 'Prompt tag', collectRepeatedOption, [])
      .option('--current-version-id <id>', 'Explicitly set currentVersionId on the prompt shell'),
  ))).action(async (options: PromptUpdateOptions) => {
    await runPromptUpdate(options)
  })

  applyWriteGuards(applyPromptContextOptions(
    cmd.command('delete')
      .description('Delete a prompt shell')
      .requiredOption('--id <id>', 'Prompt id'),
  ), { destructive: true }).action(async (options: PromptDeleteOptions) => {
    await runPromptDelete(options)
  })

  applyPromptContextOptions(
    cmd.command('inspect')
      .description('Load the prompt shell, versions, and current version together')
      .requiredOption('--id <id>', 'Prompt id')
      .option('--summary', 'Omit prompt-version content and print content size summaries'),
  ).action(async (options: PromptInspectOptions) => {
    await runPromptInspect(options)
  })

  applyPromptContextOptions(
    cmd.command('current')
      .description('Resolve the current prompt version for a prompt shell')
      .requiredOption('--id <id>', 'Prompt id')
      .option('--summary', 'Omit current version content and print content size summary'),
  ).action(async (options: PromptCurrentOptions) => {
    await runPromptCurrent(options)
  })

  const version = cmd.command('version').description('Prompt-version authoring and lifecycle commands')

  applyPromptContextOptions(
    version.command('list')
      .description('List prompt versions')
      .option('--prompt-id <id>', 'Prompt id filter')
      .option('--status <status>', 'Prompt version status filter')
      .option('--ref-type <type>', 'Prompt version refType filter')
      .option('--ref-id <id>', 'Prompt version refId filter')
      .option('--limit <n>', 'Optional item limit')
      .option('--summary', 'Omit prompt-version content and print content size summaries'),
  ).action(async (options: PromptVersionListOptions) => {
    await runPromptVersionList(options)
  })

  applyPromptContextOptions(
    version.command('get')
      .description('Get a prompt version by id')
      .requiredOption('--id <id>', 'Prompt version id'),
  ).action(async (options: PromptVersionGetOptions) => {
    await runPromptVersionGet(options)
  })

  applyWriteGuards(applyJsonSeedOption(applyPromptContextOptions(
    version.command('create')
      .description('Create a new prompt version')
      .requiredOption('--prompt-id <id>', 'Prompt id')
      .option('--version <n>', 'Optional explicit version number')
      .option('--status <status>', 'Prompt version status')
      .option('--content <textOrFile>', 'Prompt content or @file.md')
      .option('--variables <jsonOrFile>', 'JSON variables object/array/value or @file.json')
      .option('--meta <jsonOrFile>', 'JSON meta object/array/value or @file.json')
      .option('--ref-type <type>', 'Optional refType linkage')
      .option('--ref-id <id>', 'Optional refId linkage'),
  ))).action(async (options: PromptVersionCreateOptions) => {
    await runPromptVersionCreate(options)
  })

  applyWriteGuards(applyJsonSeedOption(applyPromptContextOptions(
    version.command('update')
      .description('Update an existing prompt version')
      .requiredOption('--id <id>', 'Prompt version id')
      .option('--version <n>', 'Optional explicit version number')
      .option('--status <status>', 'Prompt version status')
      .option('--content <textOrFile>', 'Prompt content or @file.md')
      .option('--variables <jsonOrFile>', 'JSON variables object/array/value or @file.json')
      .option('--meta <jsonOrFile>', 'JSON meta object/array/value or @file.json')
      .option('--ref-type <type>', 'Optional refType linkage')
      .option('--ref-id <id>', 'Optional refId linkage'),
  ))).action(async (options: PromptVersionUpdateOptions) => {
    await runPromptVersionUpdate(options)
  })

  applyWriteGuards(applyPromptContextOptions(
    version.command('publish')
      .description('Publish a prompt version and sync the prompt current version')
      .requiredOption('--id <id>', 'Prompt version id'),
  )).action(async (options: PromptVersionPublishOptions) => {
    await runPromptVersionPublish(options)
  })

  applyWriteGuards(applyPromptContextOptions(
    version.command('delete')
      .description('Delete a prompt version')
      .requiredOption('--id <id>', 'Prompt version id'),
  ), { destructive: true }).action(async (options: PromptVersionDeleteOptions) => {
    await runPromptVersionDelete(options)
  })

  cmd.addHelpText(
    'after',
    buildOperatorCookbook({
      examples: [
        'aops-cli prompt create --name "Kickoff Template" --apply --json',
        'aops-cli prompt version list --prompt-id <prompt-id> --summary --json',
        'aops-cli prompt version create --prompt-id <prompt-id> --content @./template.md --apply --json',
        'aops-cli prompt version publish --id <prompt-version-id> --apply --json',
        'aops-cli prompt inspect --id <prompt-id> --summary --json',
        'aops-cli prompt current --id <prompt-id> --summary --json',
      ],
      guide: GUIDE_PATHS.agentspace,
      notes: [
        'Canonical reusable prompt truth lives in aops-server/DB; create/update/publish through these prompt commands.',
        '.aops/hosted/prompts/** is a read-only repo mirror refreshed by sync pull/bootstrap, not an authoring source.',
        'Prompt version list/inspect/current are curated read surfaces and do not require --apply; use --summary unless you need full prompt-version content.',
        'When --version is omitted, the CLI resolves the next version number from existing prompt versions.',
      ],
    }),
  )

  return cmd
}
