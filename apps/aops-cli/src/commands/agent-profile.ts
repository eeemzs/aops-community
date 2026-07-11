import { readFileSync } from 'node:fs'
import { Command } from 'commander'
import { logError, logSuccess } from '@aopslab/xf-cli-ui'

import { applyCommonOptions, compactPayload, normalizeNonEmpty } from '../utils/command.js'
import {
  invokeHostedToolWithApiState,
  requireApiState,
  unwrapHostedToolResult,
  type AgentGatewayContextOptions,
} from '../utils/agent-gateway.js'
import {
  buildHostedSugarEnvelope,
  ensureGuardedWrite,
  ensureDestructiveWrite,
} from '../utils/hosted-sugar.js'
import {
  preferProjectNameBinding,
  resolveOwnerScopeIdFromBinding,
  resolveOwnerScopeIdFromProjectRecord,
  resolveProjectBindingContext,
} from '../utils/project-context.js'
import type { CliApiClientState } from '../utils/api.js'

// -----------------------------------------------------------------------------
// Server-first agent-profile command.
//
// Every subcommand is HOSTED/SERVER-FIRST: create / get / list / update / delete
// all go through the hosted Agentspace agent-profile ops via the agent gateway.
// The local .aops/agentspace/agent-profiles tree is NEVER written or read as
// truth by any subcommand. The hosted `agentspace.agent-profile.*` ops are the
// single source of truth; the CLI maps server rows into the legacy presentation
// shape for UX only.
//
// Hosted op map (toolId prefix agentspace.agent-profile.):
//   create -> create     { data }
//   list   -> list       { filter, options } (+ client presentation filter)
//   get    -> get-by-id  { id }
//   update -> update     { id, patch }
//   delete -> delete     { id }
//
// FIELD MAPPING (CLI option -> hosted agent_profiles field):
//   --default-agent          -> defaultAgents (NOT defaultAgentIds)
//   --text (supports @file)  -> body          (NOT content)
//   --name                   -> name
//   --role                   -> role
//   --version                -> version
//   --kind                   -> kind
//   --capability             -> capabilities
//   --allowed-surface        -> allowedSurfaces
//   --requires-approval-for  -> requiresApprovalFor
//   --prompt-ref             -> promptRef
//   --skill-ref              -> skillRefs
//   --resource-ref           -> resourceRefs
//   --overlay-ref            -> overlayRefs
//   --additional-context-ref -> additionalContextRefs
//   --tag                    -> tags
//   --slug                   -> slug (optional; server derives from name otherwise)
// The hosted insert schema is strict; only the fields above plus scopeId/projectId
// are sent. There is no `meta`/`content`/`defaultAgentIds` field on agent_profiles.
// -----------------------------------------------------------------------------

type AgentProfileContextOptions = AgentGatewayContextOptions & {
  scopeId?: string
  json?: boolean
}

type GuardedWriteOptions = {
  apply?: boolean
  preview?: boolean
  confirm?: boolean
  idempotencyKey?: string
}

type AgentProfileCreateOptions = AgentProfileContextOptions & GuardedWriteOptions & {
  name?: string
  slug?: string
  version?: number
  kind?: string
  role?: string
  defaultAgent?: string[]
  capability?: string[]
  allowedSurface?: string[]
  requiresApprovalFor?: string[]
  promptRef?: string
  skillRef?: string[]
  resourceRef?: string[]
  overlayRef?: string[]
  additionalContextRef?: string[]
  tag?: string[]
  text?: string
}

type AgentProfileListOptions = AgentProfileContextOptions & {
  role?: string
  agent?: string
  limit?: number
}

type AgentProfileGetOptions = AgentProfileContextOptions & {
  id?: string
}

type AgentProfileUpdateOptions = AgentProfileContextOptions & GuardedWriteOptions & {
  id?: string
  name?: string
  slug?: string
  version?: number
  kind?: string
  role?: string
  defaultAgent?: string[]
  capability?: string[]
  allowedSurface?: string[]
  requiresApprovalFor?: string[]
  promptRef?: string
  skillRef?: string[]
  resourceRef?: string[]
  overlayRef?: string[]
  additionalContextRef?: string[]
  tag?: string[]
  text?: string
}

type AgentProfileDeleteOptions = AgentProfileContextOptions & GuardedWriteOptions & {
  id?: string
}

type ResolvedAgentProfileContext = Awaited<ReturnType<typeof resolveProjectBindingContext>> & {
  scopeId?: string
}

const AGENT_PROFILE_CREATE_TOOL_ID = 'agentspace.agent-profile.create'
const AGENT_PROFILE_LIST_TOOL_ID = 'agentspace.agent-profile.list'
const AGENT_PROFILE_GET_TOOL_ID = 'agentspace.agent-profile.get-by-id'
const AGENT_PROFILE_UPDATE_TOOL_ID = 'agentspace.agent-profile.update'
const AGENT_PROFILE_DELETE_TOOL_ID = 'agentspace.agent-profile.delete'

function collectRepeatedOption(value: string, previous: string[] = []): string[] {
  const normalized = normalizeNonEmpty(value)
  return normalized ? [...previous, normalized] : previous
}

function parseInteger(value: string): number {
  return Number.parseInt(value, 10)
}

function toStringArray(values: unknown): string[] {
  return Array.isArray(values)
    ? values.map((entry) => normalizeNonEmpty(entry)).filter((entry): entry is string => Boolean(entry))
    : []
}

function uniqueStrings(values: unknown[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const value of values) {
    const normalized = normalizeNonEmpty(value)
    if (!normalized) continue
    const key = normalized.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    result.push(normalized)
  }
  return result
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function toNonNegativeInteger(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined
  const parsed = typeof value === 'number' ? value : Number.parseInt(String(value), 10)
  if (!Number.isInteger(parsed) || parsed < 0) return undefined
  return parsed
}

function numberOrUndefined(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function expandAtFileContent(value: string | undefined): string | undefined {
  if (typeof value === 'string' && value.startsWith('@')) {
    return readFileSync(value.slice(1).trim(), 'utf8')
  }
  return value
}

function readInlineBody(text: unknown): string | undefined {
  return normalizeNonEmpty(expandAtFileContent(typeof text === 'string' ? text : undefined))
}

function buildResolvedContextRecord(context: ResolvedAgentProfileContext): Record<string, unknown> {
  return compactPayload({
    repoRoot: context.repoRoot,
    configPath: context.configPath,
    configFound: context.configFound,
    scopeId: context.scopeId,
    projectId: context.projectId,
    projectName: context.projectName,
  })
}

async function resolveAgentProfileContext(
  options: AgentProfileContextOptions,
  params: { requireScope?: boolean } = {},
): Promise<ResolvedAgentProfileContext> {
  const resolved = await resolveProjectBindingContext(options, {
    requireProject: params.requireScope === true,
  })
  const scopeId = normalizeNonEmpty(options.scopeId) ?? resolveOwnerScopeIdFromBinding(resolved)
  if (params.requireScope === true && !scopeId && !normalizeNonEmpty(resolved.projectId)) {
    throw new Error(
      'Agent profile context could not be resolved. Provide --project-id/--project-name. `--scope-id` remains a legacy/internal alias.',
    )
  }
  return { ...resolved, scopeId }
}

function buildGatewayOptions(
  options: AgentGatewayContextOptions,
  resolvedContext: ResolvedAgentProfileContext,
): AgentGatewayContextOptions {
  return {
    ...options,
    ...preferProjectNameBinding(resolvedContext),
  }
}

function unwrapResultData<T>(result: unknown): T | undefined {
  if (isRecord(result) && Object.prototype.hasOwnProperty.call(result, 'data')) {
    return result.data as T
  }
  return result as T
}

function extractHostedRows(result: unknown): Record<string, unknown>[] {
  const data = unwrapResultData<unknown>(result)
  if (Array.isArray(data)) return data.filter(isRecord)
  if (Array.isArray(result)) return result.filter(isRecord)
  return []
}

/**
 * Hydrate scopeId + projectName from the hosted project record when the repo
 * config only resolved a projectId. Mirrors the experience/memory commands so
 * write/read inputs always carry an owner scope. Best-effort: never blocks.
 */
async function hydrateProjectScopeContext(
  apiState: CliApiClientState,
  options: AgentGatewayContextOptions,
  resolvedContext: ResolvedAgentProfileContext,
): Promise<ResolvedAgentProfileContext> {
  const projectId = normalizeNonEmpty(resolvedContext.projectId)
  if (!projectId) {
    return resolvedContext
  }
  if (normalizeNonEmpty(resolvedContext.scopeId) === projectId && normalizeNonEmpty(resolvedContext.projectName)) {
    return resolvedContext
  }

  try {
    const payload = await invokeHostedToolWithApiState(apiState, {
      ...buildGatewayOptions(options, resolvedContext),
      toolId: 'agentspace.project.get-by-id',
      input: { id: projectId },
    })
    const result = unwrapHostedToolResult(payload)
    const project = unwrapResultData<Record<string, unknown>>(result)
    if (!isRecord(project)) {
      return resolvedContext
    }
    const scopeId = resolveOwnerScopeIdFromProjectRecord(project, resolvedContext.scopeId ?? projectId)
    const projectName = normalizeNonEmpty(project.name) ?? resolvedContext.projectName
    return {
      ...resolvedContext,
      scopeId: scopeId ?? resolvedContext.scopeId,
      projectName,
    }
  } catch {
    return resolvedContext
  }
}

/**
 * Map a hosted agent_profiles row into the legacy presentation record the CLI has
 * always emitted (id/localId/name/role/.../content). Presentation only; the server
 * row is the truth. `defaultAgents` (server) is surfaced as `defaultAgentIds` and
 * `body` (server) is surfaced as `content` for backward-compatible output.
 */
function normalizeHostedAgentProfileRecord(row: Record<string, unknown>): Record<string, unknown> {
  const id = normalizeNonEmpty(row.id) ?? normalizeNonEmpty(row.localId)
  return compactPayload({
    id,
    localId: id,
    remoteId: normalizeNonEmpty(row.id) ?? normalizeNonEmpty(row.remoteId),
    name: normalizeNonEmpty(row.name),
    slug: normalizeNonEmpty(row.slug),
    version: numberOrUndefined(row.version),
    kind: normalizeNonEmpty(row.kind),
    role: normalizeNonEmpty(row.role),
    defaultAgentIds: toStringArray(row.defaultAgents),
    capabilities: toStringArray(row.capabilities),
    allowedSurfaces: toStringArray(row.allowedSurfaces),
    requiresApprovalFor: toStringArray(row.requiresApprovalFor),
    promptRef: normalizeNonEmpty(row.promptRef),
    skillRefs: toStringArray(row.skillRefs),
    resourceRefs: toStringArray(row.resourceRefs),
    overlayRefs: toStringArray(row.overlayRefs),
    additionalContextRefs: toStringArray(row.additionalContextRefs),
    tags: toStringArray(row.tags),
    projectId: normalizeNonEmpty(row.projectId),
    scopeId: normalizeNonEmpty(row.scopeId),
    createdAt: normalizeNonEmpty(row.createdAt),
    updatedAt: normalizeNonEmpty(row.updatedAt),
    storage: 'hosted',
    content: normalizeNonEmpty(row.body),
  })
}

function buildAgentProfileListFilter(resolvedContext: ResolvedAgentProfileContext, options: AgentProfileListOptions): Record<string, unknown> {
  return compactPayload({
    scopeId: resolvedContext.scopeId,
    scopeResolution: 'cascade',
    // defaultAgent is a convenience filter the hosted service post-filters in memory.
    defaultAgent: normalizeNonEmpty(options.agent),
  })
}

/**
 * Client-side presentation filter over hosted rows (role/agent/limit). The hosted
 * list op filters by scope (and post-filters defaultAgent server-side), so role
 * narrowing and limit are applied here for parity with the previous surface. Never
 * reads local files.
 */
function filterHostedAgentProfileRecords(
  records: Record<string, unknown>[],
  options: AgentProfileListOptions,
): Record<string, unknown>[] {
  const role = normalizeNonEmpty(options.role)?.toLowerCase()
  const agent = normalizeNonEmpty(options.agent)?.toLowerCase()
  const limit = toNonNegativeInteger(options.limit)
  const filtered = records.filter((record) => {
    if (role && normalizeNonEmpty(record.role)?.toLowerCase() !== role) return false
    if (agent && !toStringArray(record.defaultAgentIds).some((entry) => entry.toLowerCase() === agent)) return false
    return true
  })
  return typeof limit === 'number' && limit > 0 ? filtered.slice(0, limit) : filtered
}

function emitAgentProfileCommandError(params: {
  options: { json?: boolean }
  command: string
  toolId?: string
  resolvedContext?: ResolvedAgentProfileContext
  input?: Record<string, unknown>
  error: unknown
}): void {
  const message = params.error instanceof Error ? params.error.message : String(params.error)
  if (params.options.json) {
    console.log(JSON.stringify(buildHostedSugarEnvelope({
      command: params.command,
      toolId: params.toolId,
      resolvedContext: params.resolvedContext ? buildResolvedContextRecord(params.resolvedContext) : {},
      input: params.input ?? {},
      result: { error: { message } },
    }), null, 2))
  } else {
    logError(message)
  }
  process.exitCode = 1
}

function buildCreateDataInput(options: AgentProfileCreateOptions, context: ResolvedAgentProfileContext): Record<string, unknown> {
  const name = normalizeNonEmpty(options.name)
  if (!name) throw new Error('Provide --name.')
  const role = normalizeNonEmpty(options.role)
  if (!role) throw new Error('Provide --role.')
  return compactPayload({
    scopeId: context.scopeId,
    projectId: context.projectId,
    slug: normalizeNonEmpty(options.slug),
    name,
    role,
    version: numberOrUndefined(options.version) ?? 1,
    kind: normalizeNonEmpty(options.kind) ?? 'role-profile',
    defaultAgents: uniqueStrings(toStringArray(options.defaultAgent)),
    capabilities: uniqueStrings(toStringArray(options.capability)),
    allowedSurfaces: uniqueStrings(toStringArray(options.allowedSurface)),
    requiresApprovalFor: uniqueStrings(toStringArray(options.requiresApprovalFor)),
    promptRef: normalizeNonEmpty(options.promptRef),
    skillRefs: uniqueStrings(toStringArray(options.skillRef)),
    resourceRefs: uniqueStrings(toStringArray(options.resourceRef)),
    overlayRefs: uniqueStrings(toStringArray(options.overlayRef)),
    additionalContextRefs: uniqueStrings(toStringArray(options.additionalContextRef)),
    tags: uniqueStrings(toStringArray(options.tag)),
    body: readInlineBody(options.text),
  })
}

export async function runAgentProfileCreate(options: AgentProfileCreateOptions = {}): Promise<void> {
  let resolvedContext: ResolvedAgentProfileContext | undefined
  let apiState: CliApiClientState | null
  try {
    ensureGuardedWrite(options, 'This command writes an Agentspace agent profile.')
    apiState = await requireApiState(options)
    if (!apiState) return
    resolvedContext = await resolveAgentProfileContext(options, { requireScope: true })
    resolvedContext = await hydrateProjectScopeContext(apiState, options, resolvedContext)
  } catch (error) {
    logError(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
    return
  }

  try {
    const data = buildCreateDataInput(options, resolvedContext)
    const input = { data }
    const payload = await invokeHostedToolWithApiState(apiState, {
      ...buildGatewayOptions(options, resolvedContext),
      tenantId: options.tenantId,
      locale: options.locale,
      fallbackLocale: options.fallbackLocale,
      timeoutMs: options.timeoutMs,
      apiBaseUrl: options.apiBaseUrl,
      accessToken: options.accessToken,
      refreshToken: options.refreshToken,
      toolId: AGENT_PROFILE_CREATE_TOOL_ID,
      input,
      preview: options.preview,
      apply: options.apply,
      idempotencyKey: options.idempotencyKey,
    })

    const result = unwrapHostedToolResult(payload)
    const row = unwrapResultData<Record<string, unknown>>(result)
    const data2 = { profile: isRecord(row) ? normalizeHostedAgentProfileRecord(row) : result }
    if (options.json) {
      console.log(JSON.stringify(buildHostedSugarEnvelope({
        command: 'agent-profile.create',
        toolId: AGENT_PROFILE_CREATE_TOOL_ID,
        resolvedContext: buildResolvedContextRecord(resolvedContext),
        input,
        result: data2,
      }), null, 2))
      return
    }
    logSuccess('Agent profile created.')
    console.log(JSON.stringify(data2, null, 2))
  } catch (error) {
    emitAgentProfileCommandError({
      options,
      command: 'agent-profile.create',
      toolId: AGENT_PROFILE_CREATE_TOOL_ID,
      resolvedContext,
      error,
    })
  }
}

export async function runAgentProfileList(options: AgentProfileListOptions = {}): Promise<void> {
  let resolvedContext: ResolvedAgentProfileContext | undefined
  let apiState: CliApiClientState | null
  try {
    apiState = await requireApiState(options)
    if (!apiState) return
    resolvedContext = await resolveAgentProfileContext(options, { requireScope: true })
    resolvedContext = await hydrateProjectScopeContext(apiState, options, resolvedContext)
  } catch (error) {
    logError(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
    return
  }

  try {
    const input = compactPayload({
      filter: buildAgentProfileListFilter(resolvedContext, options),
      options: compactPayload({ limit: toNonNegativeInteger(options.limit) }),
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
      toolId: AGENT_PROFILE_LIST_TOOL_ID,
      input,
    })

    const result = unwrapHostedToolResult(payload)
    const records = extractHostedRows(result).map(normalizeHostedAgentProfileRecord)
    const filtered = filterHostedAgentProfileRecords(records, options)
    const data = { data: filtered }
    if (options.json) {
      console.log(JSON.stringify(buildHostedSugarEnvelope({
        command: 'agent-profile.list',
        toolId: AGENT_PROFILE_LIST_TOOL_ID,
        resolvedContext: buildResolvedContextRecord(resolvedContext),
        input,
        result: data,
      }), null, 2))
      return
    }
    logSuccess('Agent profiles loaded.')
    console.log(JSON.stringify(data, null, 2))
  } catch (error) {
    emitAgentProfileCommandError({
      options,
      command: 'agent-profile.list',
      toolId: AGENT_PROFILE_LIST_TOOL_ID,
      resolvedContext,
      error,
    })
  }
}

export async function runAgentProfileGet(options: AgentProfileGetOptions = {}): Promise<void> {
  let resolvedContext: ResolvedAgentProfileContext | undefined
  let apiState: CliApiClientState | null
  try {
    const id = normalizeNonEmpty(options.id)
    if (!id) throw new Error('Provide --id.')
    apiState = await requireApiState(options)
    if (!apiState) return
    resolvedContext = await resolveAgentProfileContext(options, { requireScope: false })
    resolvedContext = await hydrateProjectScopeContext(apiState, options, resolvedContext)

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
      toolId: AGENT_PROFILE_GET_TOOL_ID,
      input,
    })

    const result = unwrapHostedToolResult(payload)
    const row = unwrapResultData<Record<string, unknown>>(result)
    if (!isRecord(row)) throw new Error('Agent profile was not found.')
    const data = { profile: normalizeHostedAgentProfileRecord(row) }
    if (options.json) {
      console.log(JSON.stringify(buildHostedSugarEnvelope({
        command: 'agent-profile.get',
        toolId: AGENT_PROFILE_GET_TOOL_ID,
        resolvedContext: buildResolvedContextRecord(resolvedContext),
        input,
        result: data,
      }), null, 2))
      return
    }
    logSuccess('Agent profile loaded.')
    console.log(JSON.stringify(data, null, 2))
  } catch (error) {
    emitAgentProfileCommandError({
      options,
      command: 'agent-profile.get',
      toolId: AGENT_PROFILE_GET_TOOL_ID,
      resolvedContext,
      input: compactPayload({ id: normalizeNonEmpty(options.id) }),
      error,
    })
  }
}

function buildUpdatePatch(options: AgentProfileUpdateOptions): Record<string, unknown> {
  const defaultAgents = uniqueStrings(toStringArray(options.defaultAgent))
  const capabilities = uniqueStrings(toStringArray(options.capability))
  const allowedSurfaces = uniqueStrings(toStringArray(options.allowedSurface))
  const requiresApprovalFor = uniqueStrings(toStringArray(options.requiresApprovalFor))
  const skillRefs = uniqueStrings(toStringArray(options.skillRef))
  const resourceRefs = uniqueStrings(toStringArray(options.resourceRef))
  const overlayRefs = uniqueStrings(toStringArray(options.overlayRef))
  const additionalContextRefs = uniqueStrings(toStringArray(options.additionalContextRef))
  const tags = uniqueStrings(toStringArray(options.tag))
  return compactPayload({
    name: normalizeNonEmpty(options.name),
    slug: normalizeNonEmpty(options.slug),
    role: normalizeNonEmpty(options.role),
    version: numberOrUndefined(options.version),
    kind: normalizeNonEmpty(options.kind),
    defaultAgents: defaultAgents.length > 0 ? defaultAgents : undefined,
    capabilities: capabilities.length > 0 ? capabilities : undefined,
    allowedSurfaces: allowedSurfaces.length > 0 ? allowedSurfaces : undefined,
    requiresApprovalFor: requiresApprovalFor.length > 0 ? requiresApprovalFor : undefined,
    promptRef: normalizeNonEmpty(options.promptRef),
    skillRefs: skillRefs.length > 0 ? skillRefs : undefined,
    resourceRefs: resourceRefs.length > 0 ? resourceRefs : undefined,
    overlayRefs: overlayRefs.length > 0 ? overlayRefs : undefined,
    additionalContextRefs: additionalContextRefs.length > 0 ? additionalContextRefs : undefined,
    tags: tags.length > 0 ? tags : undefined,
    body: readInlineBody(options.text),
  })
}

export async function runAgentProfileUpdate(options: AgentProfileUpdateOptions = {}): Promise<void> {
  let resolvedContext: ResolvedAgentProfileContext | undefined
  let apiState: CliApiClientState | null
  try {
    const id = normalizeNonEmpty(options.id)
    if (!id) throw new Error('Provide --id.')
    ensureGuardedWrite(options, 'This command updates an Agentspace agent profile.')
    apiState = await requireApiState(options)
    if (!apiState) return
    resolvedContext = await resolveAgentProfileContext(options, { requireScope: false })
    resolvedContext = await hydrateProjectScopeContext(apiState, options, resolvedContext)
  } catch (error) {
    logError(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
    return
  }

  try {
    const id = normalizeNonEmpty(options.id)!
    const patch = buildUpdatePatch(options)
    if (Object.keys(patch).length === 0) {
      throw new Error('Provide at least one patch field such as --name, --role, --capability, --allowed-surface, --prompt-ref, --skill-ref, --tag, or --text.')
    }
    const input = { id, patch }
    const payload = await invokeHostedToolWithApiState(apiState, {
      ...buildGatewayOptions(options, resolvedContext),
      tenantId: options.tenantId,
      locale: options.locale,
      fallbackLocale: options.fallbackLocale,
      timeoutMs: options.timeoutMs,
      apiBaseUrl: options.apiBaseUrl,
      accessToken: options.accessToken,
      refreshToken: options.refreshToken,
      toolId: AGENT_PROFILE_UPDATE_TOOL_ID,
      input,
      preview: options.preview,
      apply: options.apply,
      idempotencyKey: options.idempotencyKey,
    })

    const result = unwrapHostedToolResult(payload)
    const row = unwrapResultData<Record<string, unknown>>(result)
    const data = { profile: isRecord(row) ? normalizeHostedAgentProfileRecord(row) : result }
    if (options.json) {
      console.log(JSON.stringify(buildHostedSugarEnvelope({
        command: 'agent-profile.update',
        toolId: AGENT_PROFILE_UPDATE_TOOL_ID,
        resolvedContext: buildResolvedContextRecord(resolvedContext),
        input,
        result: data,
      }), null, 2))
      return
    }
    logSuccess('Agent profile updated.')
    console.log(JSON.stringify(data, null, 2))
  } catch (error) {
    emitAgentProfileCommandError({
      options,
      command: 'agent-profile.update',
      toolId: AGENT_PROFILE_UPDATE_TOOL_ID,
      resolvedContext,
      input: compactPayload({ id: normalizeNonEmpty(options.id) }),
      error,
    })
  }
}

export async function runAgentProfileDelete(options: AgentProfileDeleteOptions = {}): Promise<void> {
  let resolvedContext: ResolvedAgentProfileContext | undefined
  let apiState: CliApiClientState | null
  try {
    const id = normalizeNonEmpty(options.id)
    if (!id) throw new Error('Provide --id.')
    ensureDestructiveWrite(options, 'This command deletes an Agentspace agent profile.')
    apiState = await requireApiState(options)
    if (!apiState) return
    resolvedContext = await resolveAgentProfileContext(options, { requireScope: false })
    resolvedContext = await hydrateProjectScopeContext(apiState, options, resolvedContext)
  } catch (error) {
    logError(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
    return
  }

  try {
    const id = normalizeNonEmpty(options.id)!
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
      toolId: AGENT_PROFILE_DELETE_TOOL_ID,
      input,
      preview: options.preview,
      apply: options.apply,
      confirm: options.confirm,
      idempotencyKey: options.idempotencyKey,
    })

    const result = unwrapHostedToolResult(payload)
    const row = unwrapResultData<Record<string, unknown>>(result)
    const data = isRecord(row) ? { deleted: true, id, ...row } : { deleted: true, id }
    if (options.json) {
      console.log(JSON.stringify(buildHostedSugarEnvelope({
        command: 'agent-profile.delete',
        toolId: AGENT_PROFILE_DELETE_TOOL_ID,
        resolvedContext: buildResolvedContextRecord(resolvedContext),
        input,
        result: data,
      }), null, 2))
      return
    }
    logSuccess('Agent profile deleted.')
    console.log(JSON.stringify(data, null, 2))
  } catch (error) {
    emitAgentProfileCommandError({
      options,
      command: 'agent-profile.delete',
      toolId: AGENT_PROFILE_DELETE_TOOL_ID,
      resolvedContext,
      input: compactPayload({ id: normalizeNonEmpty(options.id) }),
      error,
    })
  }
}

export function makeAgentProfileCommand(): Command {
  const cmd = new Command('agent-profile')
    .description('Author and read hosted Agentspace agent profiles (server-first)')

  applyCommonOptions(cmd, { withAuth: false, withProject: true, withYes: true, withJson: true })
  cmd.addHelpText(
    'after',
    `
Agent profiles are server-first: every subcommand reads and writes the hosted
\`agentspace.agent-profile.*\` ops through the agent gateway. The hosted store is
the single source of truth.

V1 semantics:
  - agent profiles compose promptRef/skillRefs/resourceRefs
  - overlayRefs/additionalContextRefs are metadata for runtime prompt assembly
  - profiles do not copy prompt bodies
  - requiresApprovalFor is declarative-only in V1

Author and read hosted agent profiles:
  aops-cli agent-profile create --name "Reviewer" --role reviewer --default-agent claude --apply --json
  aops-cli agent-profile list --role reviewer --json
  aops-cli agent-profile get --id <id> --json
  aops-cli agent-profile update --id <id> --capability code-review --apply --json
  aops-cli agent-profile delete --id <id> --apply --confirm --json
`,
  )

  const create = cmd.command('create')
    .description('Create a hosted Agentspace agent profile')
    .requiredOption('--name <name>', 'Profile name')
    .requiredOption('--role <role>', 'Role name, for example implementer|reviewer|tester')
    .option('--slug <slug>', 'Optional stable profile slug (server derives from name otherwise)')
    .option('--version <n>', 'Profile version number', parseInteger)
    .option('--kind <kind>', 'Profile kind (default: role-profile)')
    .option('--default-agent <id>', 'Default agent id; repeatable', collectRepeatedOption, [])
    .option('--capability <value>', 'Capability label; repeatable', collectRepeatedOption, [])
    .option('--allowed-surface <value>', 'Allowed surface label; repeatable', collectRepeatedOption, [])
    .option('--requires-approval-for <value>', 'Declarative approval hint; repeatable', collectRepeatedOption, [])
    .option('--prompt-ref <ref>', 'Prompt reference')
    .option('--skill-ref <ref>', 'Skill reference; repeatable', collectRepeatedOption, [])
    .option('--resource-ref <ref>', 'Resource reference; repeatable', collectRepeatedOption, [])
    .option('--overlay-ref <ref>', 'Profile overlay reference; repeatable', collectRepeatedOption, [])
    .option('--additional-context-ref <ref>', 'Additional context reference; repeatable', collectRepeatedOption, [])
    .option('--tag <tag>', 'Tag; repeatable', collectRepeatedOption, [])
    .option('--text <text>', 'Inline profile body (supports @file)')
    .option('--preview', 'Preview the hosted write without applying')
    .option('--apply', 'Write the profile')
    .option('--idempotency-key <key>', 'Idempotency key for the hosted write')
    .action((commandOptions) => runAgentProfileCreate({ ...cmd.opts(), ...commandOptions }))
  applyCommonOptions(create, { withAuth: false, withProject: true, withYes: true, withJson: true })

  const list = cmd.command('list')
    .description('List hosted agent profiles within the current owner scope')
    .option('--role <role>', 'Filter by role')
    .option('--agent <id>', 'Filter by default agent id')
    .option('--limit <n>', 'Result limit', parseInteger)
    .action((commandOptions) => runAgentProfileList({ ...cmd.opts(), ...commandOptions }))
  applyCommonOptions(list, { withAuth: false, withProject: true, withYes: true, withJson: true })

  const get = cmd.command('get')
    .description('Get one hosted agent profile by id')
    .requiredOption('--id <id>', 'Agent profile id')
    .action((commandOptions) => runAgentProfileGet({ ...cmd.opts(), ...commandOptions }))
  applyCommonOptions(get, { withAuth: false, withProject: true, withYes: true, withJson: true })

  const update = cmd.command('update')
    .description('Patch one hosted agent profile')
    .requiredOption('--id <id>', 'Agent profile id')
    .option('--name <name>', 'New profile name')
    .option('--slug <slug>', 'New profile slug')
    .option('--role <role>', 'New role name')
    .option('--version <n>', 'Profile version number', parseInteger)
    .option('--kind <kind>', 'Profile kind')
    .option('--default-agent <id>', 'Replace default agent ids; repeatable', collectRepeatedOption, [])
    .option('--capability <value>', 'Replace capability labels; repeatable', collectRepeatedOption, [])
    .option('--allowed-surface <value>', 'Replace allowed surface labels; repeatable', collectRepeatedOption, [])
    .option('--requires-approval-for <value>', 'Replace declarative approval hints; repeatable', collectRepeatedOption, [])
    .option('--prompt-ref <ref>', 'Replace prompt reference')
    .option('--skill-ref <ref>', 'Replace skill references; repeatable', collectRepeatedOption, [])
    .option('--resource-ref <ref>', 'Replace resource references; repeatable', collectRepeatedOption, [])
    .option('--overlay-ref <ref>', 'Replace profile overlay references; repeatable', collectRepeatedOption, [])
    .option('--additional-context-ref <ref>', 'Replace additional context references; repeatable', collectRepeatedOption, [])
    .option('--tag <tag>', 'Replace tags; repeatable', collectRepeatedOption, [])
    .option('--text <text>', 'Replace profile body (supports @file)')
    .option('--preview', 'Preview the hosted update without applying')
    .option('--apply', 'Write the profile')
    .option('--idempotency-key <key>', 'Idempotency key for the hosted write')
    .action((commandOptions) => runAgentProfileUpdate({ ...cmd.opts(), ...commandOptions }))
  applyCommonOptions(update, { withAuth: false, withProject: true, withYes: true, withJson: true })

  const del = cmd.command('delete')
    .description('Delete one hosted agent profile')
    .requiredOption('--id <id>', 'Agent profile id')
    .option('--preview', 'Preview the hosted delete without applying')
    .option('--apply', 'Delete the profile')
    .option('--confirm', 'Confirm destructive delete')
    .option('--idempotency-key <key>', 'Idempotency key for the hosted delete')
    .action((commandOptions) => runAgentProfileDelete({ ...cmd.opts(), ...commandOptions }))
  applyCommonOptions(del, { withAuth: false, withProject: true, withYes: true, withJson: true })

  return cmd
}
