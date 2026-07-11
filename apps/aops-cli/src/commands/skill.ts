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

type SkillContextOptions = AgentGatewayContextOptions & {
  projectName?: string
  projectSlug?: string
  scopeId?: string
  scopeResolution?: 'explicit' | 'cascade'
  hostedProjectSlug?: string
}

type SkillVersionPayloadOptions = {
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

type SkillVersionStatus = 'draft' | 'published' | 'archived'

type SkillListOptions = SkillContextOptions & {
  name?: string
  tag?: string[]
  limit?: string | number
}

type SkillGetOptions = SkillContextOptions & {
  id?: string
}

type SkillCreateOptions = SkillContextOptions &
  JsonSeedOptions &
  GuardedWriteOptions & {
    name?: string
    description?: string
    shortDescription?: string
    tag?: string[]
  }

type SkillUpdateOptions = SkillContextOptions &
  JsonSeedOptions &
  GuardedWriteOptions & {
    id?: string
    name?: string
    description?: string
    shortDescription?: string
    tag?: string[]
    currentVersionId?: string
  }

type SkillDeleteOptions = SkillContextOptions &
  GuardedWriteOptions & {
    id?: string
  }

type SkillInspectOptions = SkillContextOptions & {
  id?: string
  summary?: boolean
}

type SkillCurrentOptions = SkillContextOptions & {
  id?: string
  summary?: boolean
}

type SkillVersionListOptions = SkillContextOptions &
  SkillVersionPayloadOptions & {
    skillId?: string
    status?: SkillVersionStatus
    refType?: string
    refId?: string
    limit?: string | number
    summary?: boolean
  }

type SkillVersionGetOptions = SkillContextOptions & {
  id?: string
}

type SkillVersionCreateOptions = SkillContextOptions &
  SkillVersionPayloadOptions &
  JsonSeedOptions &
  GuardedWriteOptions & {
    skillId?: string
    version?: string | number
    status?: SkillVersionStatus
    content?: string
    entryFile?: string
    skillStandard?: string
    meta?: string
    refType?: string
    refId?: string
  }

type SkillVersionUpdateOptions = SkillContextOptions &
  SkillVersionPayloadOptions &
  JsonSeedOptions &
  GuardedWriteOptions & {
    id?: string
    version?: string | number
    status?: SkillVersionStatus
    content?: string
    entryFile?: string
    skillStandard?: string
    meta?: string
    refType?: string
    refId?: string
  }

type SkillVersionPublishOptions = SkillContextOptions &
  GuardedWriteOptions & {
    id?: string
  }

type SkillVersionDeleteOptions = SkillContextOptions &
  GuardedWriteOptions & {
    id?: string
  }

type ResolvedSkillContext = Awaited<ReturnType<typeof resolveProjectBindingContext>> & {
  scopeId?: string
}

type SkillVersionConflictHint = {
  skillId?: string
  version?: number
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

function slugifyProjectSelector(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
}

function matchesHostedProjectSlugSelector(row: Record<string, unknown>, selector: string): boolean {
  const normalizedSelector = slugifyProjectSelector(selector)
  if (!normalizedSelector) return false
  const aliases = [
    normalizeNonEmpty(row.slug),
    normalizeNonEmpty(row.projectSlug),
    normalizeNonEmpty(row.name),
  ]
  return aliases.some((alias) => alias ? slugifyProjectSelector(alias) === normalizedSelector : false)
}

function stripRepoProjectSelectors(options: SkillContextOptions): SkillContextOptions {
  const {
    projectId: _projectId,
    projectName: _projectName,
    projectSlug: _projectSlug,
    ...rest
  } = options
  return rest
}

function stripHostedProjectSlug(options: SkillContextOptions): AgentGatewayContextOptions {
  const cleaned = { ...options } as Record<string, unknown>
  for (const key of ['hostedProjectSlug', 'projectSlug', 'preview', 'apply', 'confirm', 'idempotencyKey', 'input']) {
    delete cleaned[key]
  }
  return cleaned as AgentGatewayContextOptions
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

function collectSkillArtifacts(result: unknown): Record<string, string> | undefined {
  const root = unwrapResultData<Record<string, unknown>>(result) ?? (isRecord(result) ? result : {})
  const artifacts: Record<string, string> = {}
  const push = (key: string, value: unknown) => {
    const normalized = extractId(value)
    if (normalized) artifacts[key] = normalized
  }

  push('skillId', root.skillId)
  if (!artifacts.skillId && !normalizeNonEmpty(root.skillId) && !normalizeNonEmpty(root.content)) {
    push('skillId', root.id)
  }
  push('currentVersionId', root.currentVersionId)
  push('skillVersionId', root.skillVersionId)
  if (!artifacts.skillVersionId && (normalizeNonEmpty(root.skillId) || normalizeNonEmpty(root.content))) {
    push('skillVersionId', root.id)
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

function summarizeSkillVersionRecord(value: unknown): unknown {
  if (!isRecord(value)) return value
  const { content, ...rest } = value
  return compactPayload({
    ...rest,
    contentSummary: summarizeContent(content),
  })
}

function summarizeSkillCurrentResult(result: unknown): unknown {
  if (!isRecord(result)) return result
  return compactPayload({
    ...result,
    currentVersion: summarizeSkillVersionRecord(result.currentVersion),
    summary: {
      mode: 'skill-current-summary',
      omitted: ['currentVersion.content'],
      fullRecordHint: 'Use `aops-cli skill current --id <skill-id> --json` for full content.',
    },
  })
}

function summarizeSkillInspectResult(result: unknown): unknown {
  if (!isRecord(result)) return result
  const versions = Array.isArray(result.versions)
    ? result.versions.map(summarizeSkillVersionRecord)
    : result.versions
  return compactPayload({
    ...result,
    versions,
    currentVersion: summarizeSkillVersionRecord(result.currentVersion),
    summary: {
      ...(isRecord(result.summary) ? result.summary : {}),
      mode: 'skill-inspect-summary',
      omitted: ['versions[].content', 'currentVersion.content'],
      fullRecordHint: 'Use `aops-cli skill inspect --id <skill-id> --json` for full content.',
    },
  })
}

function summarizeSkillVersionListResult(result: unknown): unknown {
  if (Array.isArray(result)) return result.map(summarizeSkillVersionRecord)
  if (!isRecord(result)) return result
  const data = Array.isArray(result.data)
    ? result.data.map(summarizeSkillVersionRecord)
    : result.data
  const items = Array.isArray(result.items)
    ? result.items.map(summarizeSkillVersionRecord)
    : result.items
  return compactPayload({
    ...result,
    data,
    items,
    summary: {
      ...(isRecord(result.summary) ? result.summary : {}),
      mode: 'skill-version-list-summary',
      omitted: ['data[].content', 'items[].content'],
      fullRecordHint: 'Use `aops-cli skill version list --skill-id <skill-id> --json` for full content.',
    },
  })
}

function buildGatewayOptions(options: SkillContextOptions, resolvedContext: ResolvedSkillContext): AgentGatewayContextOptions {
  const baseOptions = stripHostedProjectSlug(options)
  if (normalizeNonEmpty(options.hostedProjectSlug)) {
    return {
      ...baseOptions,
      projectId: normalizeNonEmpty(resolvedContext.projectId),
      projectName: undefined,
      scopeId: normalizeNonEmpty(resolvedContext.scopeId),
    }
  }
  return {
    ...baseOptions,
    projectId: normalizeNonEmpty(options.projectId) ?? normalizeNonEmpty(resolvedContext.projectId),
    projectName: normalizeNonEmpty(options.projectName) ?? normalizeNonEmpty(resolvedContext.projectName),
  }
}

async function hydrateProjectContext(
  apiState: CliApiClientState,
  options: SkillContextOptions,
  resolvedContext: ResolvedSkillContext,
): Promise<ResolvedSkillContext> {
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

async function listHostedProjectsForSlug(
  apiState: CliApiClientState,
  options: SkillContextOptions,
  resolvedContext: ResolvedSkillContext,
  input: Record<string, unknown>,
): Promise<Record<string, unknown>[]> {
  const payload = await invokeHostedToolWithApiState(apiState, {
    ...buildGatewayOptions(stripRepoProjectSelectors(options), resolvedContext),
    tenantId: options.tenantId,
    locale: options.locale,
    fallbackLocale: options.fallbackLocale,
    timeoutMs: options.timeoutMs,
    apiBaseUrl: options.apiBaseUrl,
    accessToken: options.accessToken,
    refreshToken: options.refreshToken,
    toolId: 'agentspace.project.list-projects',
    input,
  })
  return unwrapListItems(unwrapHostedToolResult(payload))
}

async function resolveHostedProjectBySlug(
  apiState: CliApiClientState,
  options: SkillContextOptions,
  resolvedContext: ResolvedSkillContext,
  selector: string,
): Promise<ResolvedSkillContext> {
  const slug = normalizeNonEmpty(selector)
  if (!slug) return resolvedContext

  const filteredRows = await listHostedProjectsForSlug(apiState, options, resolvedContext, {
    filter: { slug },
    options: { limit: 20 },
  })
  const fallbackRows = filteredRows.length > 0
    ? []
    : await listHostedProjectsForSlug(apiState, options, resolvedContext, {
        filter: {},
        options: { limit: 500 },
      })
  const rows = filteredRows.length > 0 ? filteredRows : fallbackRows
  const matches = rows.filter((row) => matchesHostedProjectSlugSelector(row, slug))

  if (matches.length === 0) {
    throw new Error(`Hosted project slug "${slug}" was not found.`)
  }
  if (matches.length > 1) {
    const ids = matches
      .map((project) => `${normalizeNonEmpty(project.slug) ?? normalizeNonEmpty(project.name) ?? '(unnamed)'} (${normalizeNonEmpty(project.id) ?? normalizeNonEmpty(project.projectId) ?? normalizeNonEmpty(project.scopeId) ?? 'no-id'})`)
      .join(', ')
    throw new Error(`Hosted project slug "${slug}" is ambiguous: ${ids}.`)
  }

  const project = matches[0]
  const projectId = normalizeNonEmpty(project.id) ?? normalizeNonEmpty(project.projectId) ?? normalizeNonEmpty(project.scopeId)
  const scopeId = normalizeNonEmpty(project.scopeId) ?? projectId
  if (!projectId && !scopeId) {
    throw new Error(`Hosted project slug "${slug}" resolved without a project id.`)
  }

  return {
    ...resolvedContext,
    projectId: projectId ?? scopeId,
    scopeId: scopeId ?? projectId,
    projectName: normalizeNonEmpty(project.name),
    projectSlug: normalizeNonEmpty(project.slug) ?? normalizeNonEmpty(project.projectSlug) ?? slug,
  }
}

async function resolveSkillContext(
  options: SkillContextOptions,
  apiState: CliApiClientState,
): Promise<ResolvedSkillContext> {
  const hostedProjectSlug = normalizeNonEmpty(options.hostedProjectSlug)
  const bindingOptions = hostedProjectSlug ? stripRepoProjectSelectors(options) : options
  const resolved = await resolveProjectBindingContext(bindingOptions, {
    requireProject: false,
  })
  const scopeId = normalizeNonEmpty(bindingOptions.scopeId) ?? resolveOwnerScopeIdFromBinding(resolved)
  const baseContext = {
    ...resolved,
    scopeId,
  }
  if (hostedProjectSlug) {
    return resolveHostedProjectBySlug(apiState, options, baseContext, hostedProjectSlug)
  }
  return hydrateProjectContext(apiState, options, baseContext)
}

function buildResolvedContextRecord(context: ResolvedSkillContext): Record<string, unknown> {
  return compactPayload({
    repoRoot: context.repoRoot,
    configPath: context.configPath,
    configFound: context.configFound,
    scopeId: context.scopeId,
    projectId: context.projectId,
    projectName: context.projectName,
    projectSlug: context.projectSlug,
  })
}

const buildEnvelope = buildHostedSugarEnvelope

function ensureSkillId(id: unknown, label = '--id'): string {
  const resolved = normalizeNonEmpty(id)
  if (!resolved) throw new Error(`Provide ${label}.`)
  return resolved
}

function requireScopeId(context: ResolvedSkillContext, seed: Record<string, unknown>): string {
  const scopeId = normalizeNonEmpty(context.scopeId) ?? normalizeNonEmpty(seed.scopeId)
  if (!scopeId) {
    throw new Error(missingScopeIdMessage('Skill create'))
  }
  return scopeId
}

function requireProjectId(
  options: SkillVersionPayloadOptions & AgentGatewayContextOptions,
  context: ResolvedSkillContext,
  seed: Record<string, unknown>,
): string {
  const projectId =
    normalizeNonEmpty(options.projectId) ??
    normalizeNonEmpty(context.projectId) ??
    normalizeNonEmpty(seed.projectId)
  if (!projectId) {
    throw new Error('Skill version commands require repo-bound project context or --project-id.')
  }
  return projectId
}

function isSkillVersionConflictMessage(message: string): boolean {
  const normalized = message.toLowerCase()
  return (
    normalized.includes('api 409') ||
    normalized.includes('agentspace_operation_failed.conflict') ||
    (normalized.includes('skill-version') && normalized.includes('unique'))
  )
}

function formatSkillVersionCreateError(message: string, hint: SkillVersionConflictHint): string {
  if (hint.skillId && hint.version !== undefined && isSkillVersionConflictMessage(message)) {
    return `skill version ${hint.version} already exists for skill ${hint.skillId}; pass --version ${hint.version + 1} or omit to auto-resolve`
  }
  return message
}

async function invokeSkillTool(
  apiState: CliApiClientState,
  options: SkillContextOptions & HostedWriteOptions,
  resolvedContext: ResolvedSkillContext,
  params: {
    command: string
    toolId: string
    input: Record<string, unknown>
    successText: string
  },
): Promise<void> {
  ensureGuardedWrite(options, 'This command mutates hosted skill state.')
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
      artifacts: collectSkillArtifacts(result),
      result,
    }), null, 2))
    return
  }

  logSuccess(params.successText)
  console.log(JSON.stringify(result, null, 2))
}

export async function runSkillList(options: SkillListOptions = {}): Promise<void> {
  try {
    const apiState = await requireApiState(options)
    if (!apiState) return
    const resolvedContext = await resolveSkillContext(options, apiState)
    const input = {
      filter: compactPayload({
        scopeId: normalizeNonEmpty(resolvedContext.scopeId),
        scopeResolution: options.scopeResolution,
        name: normalizeNonEmpty(options.name),
        tags: options.tag && options.tag.length > 0 ? options.tag : undefined,
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
      toolId: 'agentspace.skill.list-skills',
      input,
    })
    const result = unwrapHostedToolResult(payload)

    if (options.json) {
      console.log(JSON.stringify(buildEnvelope({
        command: 'skill.list',
        toolId: 'agentspace.skill.list-skills',
        resolvedContext: buildResolvedContextRecord(resolvedContext),
        input,
        result,
      }), null, 2))
      return
    }

    logSuccess('Skill list loaded.')
    console.log(JSON.stringify(result, null, 2))
  } catch (error) {
    logError(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}

export async function runSkillGet(options: SkillGetOptions = {}): Promise<void> {
  try {
    const apiState = await requireApiState(options)
    if (!apiState) return
    const resolvedContext = await resolveSkillContext(options, apiState)
    const id = ensureSkillId(options.id)
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
      toolId: 'agentspace.skill.get-skill',
      input,
    })
    const result = unwrapHostedToolResult(payload)

    if (options.json) {
      console.log(JSON.stringify(buildEnvelope({
        command: 'skill.get',
        toolId: 'agentspace.skill.get-skill',
        resolvedContext: buildResolvedContextRecord(resolvedContext),
        input,
        artifacts: collectSkillArtifacts(result),
        result,
      }), null, 2))
      return
    }

    logSuccess('Skill loaded.')
    console.log(JSON.stringify(result, null, 2))
  } catch (error) {
    logError(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}

export async function runSkillCreate(options: SkillCreateOptions = {}): Promise<void> {
  try {
    const apiState = await requireApiState(options)
    if (!apiState) return
    const resolvedContext = await resolveSkillContext(options, apiState)
    const seed = parseJsonSeed(options.input)
    const name = resolveStringField(options.name, seed, 'name')
    if (!name) throw new Error('Skill create requires --name or input.name.')
    const input = {
      data: compactPayload({
        scopeId: requireScopeId(resolvedContext, seed),
        name,
        description: resolveStringField(options.description, seed, 'description'),
        shortDescription: resolveStringField(options.shortDescription, seed, 'shortDescription'),
        tags: resolveStringArrayField(options.tag, seed, 'tags'),
      }),
    }
    await invokeSkillTool(apiState, options, resolvedContext, {
      command: 'skill.create',
      toolId: 'agentspace.skill.create',
      input,
      successText: 'Skill created.',
    })
  } catch (error) {
    logError(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}

export async function runSkillUpdate(options: SkillUpdateOptions = {}): Promise<void> {
  try {
    const apiState = await requireApiState(options)
    if (!apiState) return
    const resolvedContext = await resolveSkillContext(options, apiState)
    const seed = parseJsonSeed(options.input)
    const id = ensureSkillId(resolveStringField(options.id, seed, 'id'))
    const patch = compactPayload({
      name: resolveStringField(options.name, seed, 'name'),
      description: resolveStringField(options.description, seed, 'description'),
      shortDescription: resolveStringField(options.shortDescription, seed, 'shortDescription'),
      tags: resolveStringArrayField(options.tag, seed, 'tags'),
      currentVersionId: resolveStringField(options.currentVersionId, seed, 'currentVersionId'),
    })
    if (Object.keys(patch).length === 0) {
      throw new Error('Provide at least one skill field to update.')
    }
    const input = { id, patch }
    await invokeSkillTool(apiState, options, resolvedContext, {
      command: 'skill.update',
      toolId: 'agentspace.skill.update-skill',
      input,
      successText: 'Skill updated.',
    })
  } catch (error) {
    logError(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}

export async function runSkillDelete(options: SkillDeleteOptions = {}): Promise<void> {
  try {
    ensureDestructiveWrite(options, 'This command deletes hosted skills.')
    const apiState = await requireApiState(options)
    if (!apiState) return
    const resolvedContext = await resolveSkillContext(options, apiState)
    const id = ensureSkillId(options.id)
    const input = { id }
    await invokeSkillTool(apiState, options, resolvedContext, {
      command: 'skill.delete',
      toolId: 'agentspace.skill.remove-skill',
      input,
      successText: 'Skill deleted.',
    })
  } catch (error) {
    logError(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}

async function loadSkill(
  apiState: CliApiClientState,
  options: SkillContextOptions,
  resolvedContext: ResolvedSkillContext,
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
    toolId: 'agentspace.skill.get-skill',
    input: { id },
  })
  const result = unwrapHostedToolResult(payload)
  const skill = unwrapResultData<Record<string, unknown>>(result)
  return isRecord(skill) ? skill : null
}

async function loadSkillVersionById(
  apiState: CliApiClientState,
  options: SkillContextOptions,
  resolvedContext: ResolvedSkillContext,
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
    toolId: 'agentspace.skill-version.get-skill-version',
    input: { id },
  })
  const result = unwrapHostedToolResult(payload)
  const version = unwrapResultData<Record<string, unknown>>(result)
  return isRecord(version) ? version : null
}

async function loadSkillVersions(
  apiState: CliApiClientState,
  options: SkillContextOptions & SkillVersionPayloadOptions,
  resolvedContext: ResolvedSkillContext,
  skillId: string,
  extraFilter: Record<string, unknown> = {},
): Promise<Record<string, unknown>[]> {
  const filter = compactPayload({
    skillId,
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
    toolId: 'agentspace.skill-version.list-skill-versions',
    input: { filter },
  })
  return unwrapListItems(unwrapHostedToolResult(payload))
}

export async function runSkillInspect(options: SkillInspectOptions = {}): Promise<void> {
  try {
    const apiState = await requireApiState(options)
    if (!apiState) return
    const resolvedContext = await resolveSkillContext(options, apiState)
    const id = ensureSkillId(options.id)
    const skill = await loadSkill(apiState, options, resolvedContext, id)
    if (!skill) throw new Error(`Skill not found: ${id}`)
    const versions = await loadSkillVersions(apiState, options, resolvedContext, id)
    const currentVersionId = normalizeNonEmpty(skill.currentVersionId)
    const currentVersion =
      versions.find((entry) => normalizeNonEmpty(entry.id) === currentVersionId) ??
      (currentVersionId ? await loadSkillVersionById(apiState, options, resolvedContext, currentVersionId) : null)
    const result = compactPayload({
      skill,
      versions,
      currentVersion,
      summary: compactPayload({
        skillId: normalizeNonEmpty(skill.id),
        currentVersionId,
        versionCount: versions.length,
      }),
    })
    const outputResult = options.summary ? summarizeSkillInspectResult(result) : result

    if (options.json) {
      console.log(JSON.stringify(buildEnvelope({
        command: 'skill.inspect',
        surface: 'skill inspection pack',
        resolvedContext: buildResolvedContextRecord(resolvedContext),
        input: { id },
        result: outputResult,
      }), null, 2))
      return
    }

    logSuccess('Skill inspection pack ready.')
    console.log(JSON.stringify(outputResult, null, 2))
  } catch (error) {
    logError(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}

export async function runSkillCurrent(options: SkillCurrentOptions = {}): Promise<void> {
  try {
    const apiState = await requireApiState(options)
    if (!apiState) return
    const resolvedContext = await resolveSkillContext(options, apiState)
    const id = ensureSkillId(options.id)
    const skill = await loadSkill(apiState, options, resolvedContext, id)
    if (!skill) throw new Error(`Skill not found: ${id}`)
    const currentVersionId = normalizeNonEmpty(skill.currentVersionId)
    if (!currentVersionId) {
      throw new Error(`Skill ${id} does not have a currentVersionId. Publish or select a skill version first.`)
    }
    const currentVersion = await loadSkillVersionById(apiState, options, resolvedContext, currentVersionId)
    if (!currentVersion) {
      throw new Error(`Current skill version ${currentVersionId} could not be loaded.`)
    }
    const result = { skill, currentVersion }
    const outputResult = options.summary ? summarizeSkillCurrentResult(result) : result

    if (options.json) {
      console.log(JSON.stringify(buildEnvelope({
        command: 'skill.current',
        surface: 'skill current resolution',
        resolvedContext: buildResolvedContextRecord(resolvedContext),
        input: { id },
        artifacts: compactPayload({ skillId: normalizeNonEmpty(skill.id), skillVersionId: currentVersionId }) as Record<string, string>,
        result: outputResult,
      }), null, 2))
      return
    }

    logSuccess('Current skill version loaded.')
    console.log(JSON.stringify(outputResult, null, 2))
  } catch (error) {
    logError(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}

export async function runSkillVersionList(options: SkillVersionListOptions = {}): Promise<void> {
  try {
    const apiState = await requireApiState(options)
    if (!apiState) return
    const resolvedContext = await resolveSkillContext(options, apiState)
    const input = {
      filter: compactPayload({
        skillId: normalizeNonEmpty(options.skillId),
        projectId: normalizeNonEmpty(options.projectId) ?? normalizeNonEmpty(resolvedContext.projectId),
        status: normalizeNonEmpty(options.status),
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
      toolId: 'agentspace.skill-version.list-skill-versions',
      input,
    })
    const result = unwrapHostedToolResult(payload)
    const outputResult = options.summary ? summarizeSkillVersionListResult(result) : result

    if (options.json) {
      console.log(JSON.stringify(buildEnvelope({
        command: 'skill.version.list',
        toolId: 'agentspace.skill-version.list-skill-versions',
        resolvedContext: buildResolvedContextRecord(resolvedContext),
        input,
        result: outputResult,
      }), null, 2))
      return
    }

    logSuccess('Skill version list loaded.')
    console.log(JSON.stringify(outputResult, null, 2))
  } catch (error) {
    logError(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}

export async function runSkillVersionGet(options: SkillVersionGetOptions = {}): Promise<void> {
  try {
    const apiState = await requireApiState(options)
    if (!apiState) return
    const resolvedContext = await resolveSkillContext(options, apiState)
    const id = ensureSkillId(options.id)
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
      toolId: 'agentspace.skill-version.get-skill-version',
      input,
    })
    const result = unwrapHostedToolResult(payload)

    if (options.json) {
      console.log(JSON.stringify(buildEnvelope({
        command: 'skill.version.get',
        toolId: 'agentspace.skill-version.get-skill-version',
        resolvedContext: buildResolvedContextRecord(resolvedContext),
        input,
        artifacts: collectSkillArtifacts(result),
        result,
      }), null, 2))
      return
    }

    logSuccess('Skill version loaded.')
    console.log(JSON.stringify(result, null, 2))
  } catch (error) {
    logError(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}

export async function runSkillVersionCreate(options: SkillVersionCreateOptions = {}): Promise<void> {
  const conflictHint: SkillVersionConflictHint = {}
  try {
    const apiState = await requireApiState(options)
    if (!apiState) return
    const resolvedContext = await resolveSkillContext(options, apiState)
    const seed = parseJsonSeed(options.input)
    const skillId = resolveStringField(options.skillId, seed, 'skillId')
    if (!skillId) throw new Error('Skill version create requires --skill-id or input.skillId.')
    const content = resolveTextField(options.content, seed, 'content')
    if (!content) throw new Error('Skill version create requires --content or input.content.')
    const projectId = requireProjectId(options, resolvedContext, seed)
    const version =
      resolveIntegerField(options.version, seed, 'version', '--version') ??
      resolveNextVersionNumber(
        await loadSkillVersions(
          apiState,
          { ...options, projectId },
          { ...resolvedContext, projectId: normalizeNonEmpty(resolvedContext.projectId) ?? projectId },
          skillId,
        ),
      )
    conflictHint.skillId = skillId
    conflictHint.version = version
    const input = {
      data: compactPayload({
        projectId,
        skillId,
        version,
        status: resolveStringField(options.status, seed, 'status') ?? 'draft',
        content,
        entryFile: resolveStringField(options.entryFile, seed, 'entryFile'),
        skillStandard: resolveStringField(options.skillStandard, seed, 'skillStandard'),
        meta: resolveUnknownField(options.meta, seed, 'meta', '--meta'),
        refType: resolveStringField(options.refType, seed, 'refType'),
        refId: resolveStringField(options.refId, seed, 'refId'),
      }),
    }
    await invokeSkillTool(apiState, options, resolvedContext, {
      command: 'skill.version.create',
      toolId: 'agentspace.skill-version.create',
      input,
      successText: 'Skill version created.',
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    logError(formatSkillVersionCreateError(message, conflictHint))
    process.exitCode = 1
  }
}

export async function runSkillVersionUpdate(options: SkillVersionUpdateOptions = {}): Promise<void> {
  try {
    const apiState = await requireApiState(options)
    if (!apiState) return
    const resolvedContext = await resolveSkillContext(options, apiState)
    const seed = parseJsonSeed(options.input)
    const id = ensureSkillId(resolveStringField(options.id, seed, 'id'))
    const patch = compactPayload({
      projectId:
        normalizeNonEmpty(options.projectId) ??
        normalizeNonEmpty(seed.projectId),
      version: resolveIntegerField(options.version, seed, 'version', '--version'),
      status: resolveStringField(options.status, seed, 'status'),
      content: resolveTextField(options.content, seed, 'content'),
      entryFile: resolveStringField(options.entryFile, seed, 'entryFile'),
      skillStandard: resolveStringField(options.skillStandard, seed, 'skillStandard'),
      meta: resolveUnknownField(options.meta, seed, 'meta', '--meta'),
      refType: resolveStringField(options.refType, seed, 'refType'),
      refId: resolveStringField(options.refId, seed, 'refId'),
    })
    if (Object.keys(patch).length === 0) {
      throw new Error('Provide at least one skill version field to update.')
    }
    const input = { id, patch }
    await invokeSkillTool(apiState, options, resolvedContext, {
      command: 'skill.version.update',
      toolId: 'agentspace.skill-version.update-skill-version',
      input,
      successText: 'Skill version updated.',
    })
  } catch (error) {
    logError(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}

export async function runSkillVersionPublish(options: SkillVersionPublishOptions = {}): Promise<void> {
  try {
    const apiState = await requireApiState(options)
    if (!apiState) return
    const resolvedContext = await resolveSkillContext(options, apiState)
    const id = ensureSkillId(options.id)
    const input = { id }
    await invokeSkillTool(apiState, options, resolvedContext, {
      command: 'skill.version.publish',
      toolId: 'agentspace.skill-version.publish-skill-version',
      input,
      successText: 'Skill version published.',
    })
  } catch (error) {
    logError(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}

export async function runSkillVersionDelete(options: SkillVersionDeleteOptions = {}): Promise<void> {
  try {
    ensureDestructiveWrite(options, 'This command deletes hosted skill versions.')
    const apiState = await requireApiState(options)
    if (!apiState) return
    const resolvedContext = await resolveSkillContext(options, apiState)
    const id = ensureSkillId(options.id)
    const input = { id }
    await invokeSkillTool(apiState, options, resolvedContext, {
      command: 'skill.version.delete',
      toolId: 'agentspace.skill-version.remove-skill-version',
      input,
      successText: 'Skill version deleted.',
    })
  } catch (error) {
    logError(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}

function applySkillContextOptions(
  cmd: Command,
  params: {
    withScopeResolution?: boolean
  } = {},
): Command {
  applyCommonOptions(cmd)
  cmd.option('--project-id <id>', 'Project id used to resolve repo-bound skill ownership')
  cmd.option('--project-name <name>', 'Project name used to resolve repo-bound skill ownership')
  cmd.option('--hosted-project-slug <slug>', 'Resolve a hosted project by slug through the gateway, bypassing repo config lookup')
  cmd.option('--scope-id <id>', 'Explicit scope id override for skill shell ownership')
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

export function makeSkillCommand(): Command {
  const cmd = new Command('skill').description('Agentspace skill and skill-version sugar commands over the hosted AOPS gateway')

  applySkillContextOptions(
    cmd.command('list')
      .description('List reusable skill shells')
      .option('--name <text>', 'Skill name filter')
      .option('--tag <tag>', 'Skill tag filter', collectRepeatedOption, [])
      .option('--limit <n>', 'Optional item limit'),
    { withScopeResolution: true },
  ).action(async (options: SkillListOptions) => {
    await runSkillList(options)
  })

  applySkillContextOptions(
    cmd.command('get')
      .description('Get a skill shell by id')
      .requiredOption('--id <id>', 'Skill id'),
  ).action(async (options: SkillGetOptions) => {
    await runSkillGet(options)
  })

  applyWriteGuards(applyJsonSeedOption(applySkillContextOptions(
    cmd.command('create')
      .description('Create a scope-owned skill shell')
      .requiredOption('--name <text>', 'Skill name')
      .option('--description <text>', 'Skill description')
      .option('--short-description <text>', 'Short skill description')
      .option('--tag <tag>', 'Skill tag', collectRepeatedOption, []),
  ))).action(async (options: SkillCreateOptions) => {
    await runSkillCreate(options)
  })

  applyWriteGuards(applyJsonSeedOption(applySkillContextOptions(
    cmd.command('update')
      .description('Update a skill shell')
      .requiredOption('--id <id>', 'Skill id')
      .option('--name <text>', 'Skill name')
      .option('--description <text>', 'Skill description')
      .option('--short-description <text>', 'Short skill description')
      .option('--tag <tag>', 'Skill tag', collectRepeatedOption, [])
      .option('--current-version-id <id>', 'Explicitly set currentVersionId on the skill shell'),
  ))).action(async (options: SkillUpdateOptions) => {
    await runSkillUpdate(options)
  })

  applyWriteGuards(applySkillContextOptions(
    cmd.command('delete')
      .description('Delete a skill shell')
      .requiredOption('--id <id>', 'Skill id'),
  ), { destructive: true }).action(async (options: SkillDeleteOptions) => {
    await runSkillDelete(options)
  })

  applySkillContextOptions(
    cmd.command('inspect')
      .description('Load the skill shell, versions, and current version together')
      .requiredOption('--id <id>', 'Skill id')
      .option('--summary', 'Omit skill-version content and print content size summaries'),
  ).action(async (options: SkillInspectOptions) => {
    await runSkillInspect(options)
  })

  applySkillContextOptions(
    cmd.command('current')
      .description('Resolve the current skill version for a skill shell')
      .requiredOption('--id <id>', 'Skill id')
      .option('--summary', 'Omit current version content and print content size summary'),
  ).action(async (options: SkillCurrentOptions) => {
    await runSkillCurrent(options)
  })

  const version = cmd.command('version').description('Skill-version authoring and lifecycle commands')

  applySkillContextOptions(
    version.command('list')
      .description('List skill versions')
      .option('--skill-id <id>', 'Skill id filter')
      .option('--status <status>', 'Skill version status filter')
      .option('--ref-type <type>', 'Skill version refType filter')
      .option('--ref-id <id>', 'Skill version refId filter')
      .option('--limit <n>', 'Optional item limit')
      .option('--summary', 'Omit skill-version content and print content size summaries'),
  ).action(async (options: SkillVersionListOptions) => {
    await runSkillVersionList(options)
  })

  applySkillContextOptions(
    version.command('get')
      .description('Get a skill version by id')
      .requiredOption('--id <id>', 'Skill version id'),
  ).action(async (options: SkillVersionGetOptions) => {
    await runSkillVersionGet(options)
  })

  applyWriteGuards(applyJsonSeedOption(applySkillContextOptions(
    version.command('create')
      .description('Create a new skill version')
      .requiredOption('--skill-id <id>', 'Skill id')
      .option('--version <n>', 'Optional explicit version number')
      .option('--status <status>', 'Skill version status')
      .option('--content <textOrFile>', 'Skill content or @file.md')
      .option('--entry-file <path>', 'Optional entry file path')
      .option('--skill-standard <id>', 'Optional skill standard id')
      .option('--meta <jsonOrFile>', 'JSON meta object/array/value or @file.json')
      .option('--ref-type <type>', 'Optional refType linkage')
      .option('--ref-id <id>', 'Optional refId linkage'),
  ))).action(async (options: SkillVersionCreateOptions) => {
    await runSkillVersionCreate(options)
  })

  applyWriteGuards(applyJsonSeedOption(applySkillContextOptions(
    version.command('update')
      .description('Update an existing skill version')
      .requiredOption('--id <id>', 'Skill version id')
      .option('--version <n>', 'Explicit version number')
      .option('--status <status>', 'Skill version status')
      .option('--content <textOrFile>', 'Skill content or @file.md')
      .option('--entry-file <path>', 'Optional entry file path')
      .option('--skill-standard <id>', 'Optional skill standard id')
      .option('--meta <jsonOrFile>', 'JSON meta object/array/value or @file.json')
      .option('--ref-type <type>', 'Optional refType linkage')
      .option('--ref-id <id>', 'Optional refId linkage'),
  ))).action(async (options: SkillVersionUpdateOptions) => {
    await runSkillVersionUpdate(options)
  })

  applyWriteGuards(applySkillContextOptions(
    version.command('publish')
      .description('Publish a skill version and sync the skill current version')
      .requiredOption('--id <id>', 'Skill version id'),
  )).action(async (options: SkillVersionPublishOptions) => {
    await runSkillVersionPublish(options)
  })

  applyWriteGuards(applySkillContextOptions(
    version.command('delete')
      .description('Delete a skill version')
      .requiredOption('--id <id>', 'Skill version id'),
  ), { destructive: true }).action(async (options: SkillVersionDeleteOptions) => {
    await runSkillVersionDelete(options)
  })

  cmd.addHelpText(
    'after',
    buildOperatorCookbook({
      examples: [
        'aops-cli skill create --name "Projectman Delivery" --apply --json',
        'aops-cli skill version list --skill-id <skill-id> --summary --json',
        'aops-cli skill version create --skill-id <skill-id> --content @./SKILL.md --apply --json',
        'aops-cli skill version publish --id <skill-version-id> --hosted-project-slug aops --apply --json',
        'aops-cli sync pull --apply --hosted-project-slug aops --json',
        'aops-cli skill inspect --id <skill-id> --json',
        'aops-cli skill current --id <skill-id> --summary --json',
      ],
      guide: GUIDE_PATHS.agentspace,
      notes: [
        'Canonical reusable skill truth lives in aops-server/DB; create/update/publish through these skill commands.',
        '.aops/hosted/skills/** is a read-only repo mirror refreshed by sync pull/bootstrap, not an authoring source.',
        'Skill version list/inspect/current are curated read surfaces and do not require --apply.',
        'Use version list/inspect/current --summary for token-efficient checks; omit --summary only when full skill content is needed.',
        'Use --hosted-project-slug <slug> from a non-bound repo when the hosted project is not in local repo config.',
        'When --version is omitted, the CLI resolves the next version number from existing skill versions.',
        'After publishing a hosted skill, run sync pull for the hosted project and verify the mirror currentVersionId/currentVersionStatus before review.',
      ],
    }),
  )

  return cmd
}
