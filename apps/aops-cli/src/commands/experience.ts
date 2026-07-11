import { readFileSync } from 'node:fs'
import { Command } from 'commander'
import { logError, logSuccess } from '@aopslab/xf-cli-ui'

import { applyCommonOptions, compactPayload, normalizeNonEmpty } from '../utils/command.js'
import {
  hydrateProjectContextWithApiState,
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
// Server-first experience command.
//
// Every subcommand is HOSTED/SERVER-FIRST: capture / read / update / delete all
// go through the hosted Agentspace experience-item ops via the agent gateway.
// The local .aops/agentspace/experience tree is NEVER written or read as truth
// by any experience subcommand. The hosted `agentspace.experience-item.*` ops
// are the source of truth; the CLI maps server data into the legacy
// presentation shape (normalized record / score) for UX only.
//
// Hosted op map (toolId prefix agentspace.experience-item.):
//   capture -> add-experience-item   { data }
//   list    -> list-experience-items { filter, options } (+ client presentation filter)
//   get     -> get-by-id             { id }
//   search  -> list-experience-items (server truth) + client lexical ranking
//   update  -> update-experience-item { id, patch }
//   delete  -> remove-experience-item { id }
//   promote -> memory-item.promote-from-experience { experienceId, asPlaybook?, overrides? }
//
// promote (S1.3b.2) is server-first too: it calls the hosted
// `agentspace.memory-item.promote-from-experience` op, which reads the experience
// server-side and creates a derived memory item. Default flavor = durable memory;
// `--as-playbook` creates a playbook-projectable rule/constraint memory item. No
// local memory write fallback.
// -----------------------------------------------------------------------------

type ExperienceContextOptions = AgentGatewayContextOptions & {
  scopeId?: string
  json?: boolean
}

type GuardedWriteOptions = {
  apply?: boolean
  preview?: boolean
  confirm?: boolean
  idempotencyKey?: string
}

type ExperienceCaptureOptions = ExperienceContextOptions & GuardedWriteOptions & {
  type?: string
  title?: string
  content?: string
  problem?: string
  solution?: string
  area?: string[]
  stack?: string[]
  command?: string[]
  file?: string[]
  tag?: string[]
  sourceRef?: string[]
  sessionId?: string
  missionId?: string
  chatv3Seq?: string
  pmRef?: string[]
  discussRef?: string[]
  confidence?: string
  reusability?: string
}

type ExperienceListOptions = ExperienceContextOptions & {
  type?: string
  area?: string[]
  stack?: string[]
  tag?: string[]
  limit?: number
}

type ExperienceGetOptions = ExperienceContextOptions & {
  id?: string
}

type ExperienceSearchOptions = ExperienceListOptions & {
  query?: string
}

type ExperienceUpdateOptions = ExperienceCaptureOptions & {
  id?: string
}

type ExperienceDeleteOptions = ExperienceContextOptions & GuardedWriteOptions & {
  id?: string
}

type ExperiencePromoteOptions = ExperienceContextOptions & GuardedWriteOptions & {
  id?: string
  kind?: string
  durability?: 'durable' | 'sticky'
  content?: string
  tag?: string[]
  asPlaybook?: boolean
  playbookScope?: string
  playbookArea?: string
  appliesWhen?: string
  step?: string[]
  enforcement?: string
  reviewState?: string
  playbookId?: string
  supersedes?: string
}

type ResolvedExperienceContext = Awaited<ReturnType<typeof resolveProjectBindingContext>> & {
  scopeId?: string
}

type ExperienceType =
  | 'technique'
  | 'problem-solution'
  | 'tool'
  | 'script'
  | 'pattern'
  | 'anti-pattern'
  | 'idea'

const EXPERIENCE_TYPES: ExperienceType[] = [
  'technique',
  'problem-solution',
  'tool',
  'script',
  'pattern',
  'anti-pattern',
  'idea',
]

const EXPERIENCE_LIST_TOOL_ID = 'agentspace.experience-item.list-experience-items'
// search ranks client-side, so it must fetch enough server rows BEFORE applying the
// user --limit (codex S1.3b.1 RRR 9981de10: a small --limit passed to the server fetch
// pre-rank dropped matches beyond the first server page). Fetch up to N rows for
// ranking; the user --limit is applied AFTER ranking.
const EXPERIENCE_SEARCH_RANK_FETCH_LIMIT = 1000
const EXPERIENCE_GET_TOOL_ID = 'agentspace.experience-item.get-by-id'
const EXPERIENCE_ADD_TOOL_ID = 'agentspace.experience-item.add-experience-item'
const EXPERIENCE_UPDATE_TOOL_ID = 'agentspace.experience-item.update-experience-item'
const EXPERIENCE_REMOVE_TOOL_ID = 'agentspace.experience-item.remove-experience-item'

function collectRepeatedOption(value: string, previous: string[] = []): string[] {
  const normalized = normalizeNonEmpty(value)
  return normalized ? [...previous, normalized] : previous
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

function parseInteger(value: string): number {
  return Number.parseInt(value, 10)
}

function toNonNegativeInteger(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined
  const parsed = typeof value === 'number' ? value : Number.parseInt(String(value), 10)
  if (!Number.isInteger(parsed) || parsed < 0) return undefined
  return parsed
}

function normalizeExperienceType(value: unknown): ExperienceType {
  const normalized = normalizeNonEmpty(value)?.toLowerCase()
  if (EXPERIENCE_TYPES.includes(normalized as ExperienceType)) return normalized as ExperienceType
  throw new Error(`Unsupported experience type. Use one of: ${EXPERIENCE_TYPES.join(', ')}.`)
}

function expandAtFileContent(value: string | undefined): string | undefined {
  if (typeof value === 'string' && value.startsWith('@')) {
    return readFileSync(value.slice(1).trim(), 'utf8')
  }
  return value
}

function buildResolvedContextRecord(context: ResolvedExperienceContext): Record<string, unknown> {
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

async function resolveExperienceContext(
  options: ExperienceContextOptions,
  params: { requireScope?: boolean } = {},
): Promise<ResolvedExperienceContext> {
  const resolved = await resolveProjectBindingContext(options, {
    requireProject: params.requireScope === true,
  })
  const scopeId = normalizeNonEmpty(options.scopeId) ?? resolveOwnerScopeIdFromBinding(resolved)
  // A pending server lookup (--project-slug/--project-name unresolved by config) is resolved
  // downstream in invokeHostedToolWithApiState, so it counts as resolvable here.
  if (
    params.requireScope === true &&
    !scopeId &&
    !normalizeNonEmpty(resolved.projectId) &&
    !resolved.pendingServerProjectLookup
  ) {
    throw new Error(
      'Experience context could not be resolved. Provide --project-id/--project-name/--project-slug. `--scope-id` remains a legacy/internal alias.',
    )
  }
  return { ...resolved, scopeId }
}

function buildGatewayOptions(
  options: AgentGatewayContextOptions,
  resolvedContext: ResolvedExperienceContext,
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

/**
 * Hydrate scopeId + projectName from the hosted project record when the repo
 * config only resolved a projectId. Mirrors the memory command so write/read
 * inputs always carry an owner scope. Best-effort: never blocks the command.
 */
async function hydrateProjectScopeContext(
  apiState: CliApiClientState,
  options: AgentGatewayContextOptions,
  resolvedContext: ResolvedExperienceContext,
): Promise<ResolvedExperienceContext> {
  // Resolve a pending --project-slug/--project-name server lookup first so the
  // resolvedContext rendered in the JSON envelope reflects the RESOLVED projectId/scope
  // (matching what invokeHostedToolWithApiState resolves internally), not the pending
  // pre-lookup placeholder. No-op for --project-id and non-pending contexts.
  const lookupResolved = await hydrateProjectContextWithApiState(apiState, options, resolvedContext)
  resolvedContext = {
    ...resolvedContext,
    ...lookupResolved,
    scopeId: normalizeNonEmpty(lookupResolved.scopeId) ?? resolvedContext.scopeId,
  }
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

function parseSourceRefs(values: string[] | undefined): unknown[] {
  const refs: unknown[] = []
  for (const value of values ?? []) {
    const normalized = normalizeNonEmpty(value)
    if (!normalized) continue
    try {
      refs.push(JSON.parse(normalized))
    } catch {
      refs.push({ ref: normalized })
    }
  }
  return refs
}

function buildExperienceMeta(options: ExperienceCaptureOptions): Record<string, unknown> | undefined {
  const sessionContext = compactPayload({
    sessionId: normalizeNonEmpty(options.sessionId),
    missionId: normalizeNonEmpty(options.missionId),
    chatv3Seq: normalizeNonEmpty(options.chatv3Seq),
    pmRefs: toStringArray(options.pmRef),
    discussRefs: toStringArray(options.discussRef),
  })
  if (Object.keys(sessionContext).length === 0) return undefined
  return {
    experience: {
      scope: 'session',
      sessionContext,
    },
  }
}

/**
 * Map the hosted experience-item row into the legacy presentation record the
 * CLI has always emitted (id/localId/type/title/.../content). Presentation only;
 * the server row is the truth.
 */
function normalizeHostedExperienceRecord(row: Record<string, unknown>): Record<string, unknown> {
  const id = normalizeNonEmpty(row.id) ?? normalizeNonEmpty(row.localId)
  const meta = isRecord(row.meta) ? row.meta : undefined
  return compactPayload({
    id,
    localId: id,
    remoteId: normalizeNonEmpty(row.id) ?? normalizeNonEmpty(row.remoteId),
    projectId: normalizeNonEmpty(row.projectId) ?? (meta ? normalizeNonEmpty(meta.projectId) : undefined),
    scopeId: normalizeNonEmpty(row.scopeId),
    type: normalizeNonEmpty(row.type),
    title: normalizeNonEmpty(row.title),
    problem: normalizeNonEmpty(row.problem),
    solution: normalizeNonEmpty(row.solution),
    areas: toStringArray(row.areas),
    stack: toStringArray(row.stack),
    commands: toStringArray(row.commands),
    files: toStringArray(row.files),
    sourceRefs: Array.isArray(row.sourceRefs) ? row.sourceRefs : undefined,
    tags: toStringArray(row.tags),
    confidence: normalizeNonEmpty(row.confidence),
    reusability: normalizeNonEmpty(row.reusability),
    createdAt: normalizeNonEmpty(row.createdAt),
    updatedAt: normalizeNonEmpty(row.updatedAt),
    storage: 'hosted',
    content: normalizeNonEmpty(row.content),
    meta,
  })
}

function extractHostedRows(result: unknown): Record<string, unknown>[] {
  const data = unwrapResultData<unknown>(result)
  if (Array.isArray(data)) return data.filter(isRecord)
  if (Array.isArray(result)) return result.filter(isRecord)
  return []
}

function buildExperienceListFilter(resolvedContext: ResolvedExperienceContext): Record<string, unknown> {
  return compactPayload({
    scopeId: resolvedContext.scopeId,
    scopeResolution: 'cascade',
  })
}

/**
 * Client-side presentation filter over hosted rows (type/area/stack/tag). The
 * hosted list op filters by scope only, so type/classification narrowing is a
 * presentation concern applied to server-truth rows. Never reads local files.
 */
function filterHostedExperienceRecords(
  records: Record<string, unknown>[],
  options: ExperienceListOptions,
): Record<string, unknown>[] {
  const type = normalizeNonEmpty(options.type)?.toLowerCase()
  const areas = toStringArray(options.area).map((entry) => entry.toLowerCase())
  const stack = toStringArray(options.stack).map((entry) => entry.toLowerCase())
  const tags = toStringArray(options.tag).map((entry) => entry.toLowerCase())
  const limit = toNonNegativeInteger(options.limit)
  const filtered = records.filter((record) => {
    if (type && normalizeNonEmpty(record.type)?.toLowerCase() !== type) return false
    const recordAreas = toStringArray(record.areas).map((entry) => entry.toLowerCase())
    const recordStack = toStringArray(record.stack).map((entry) => entry.toLowerCase())
    const recordTags = toStringArray(record.tags).map((entry) => entry.toLowerCase())
    if (areas.length > 0 && !areas.every((area) => recordAreas.includes(area))) return false
    if (stack.length > 0 && !stack.every((entry) => recordStack.includes(entry))) return false
    if (tags.length > 0 && !tags.every((tag) => recordTags.includes(tag))) return false
    return true
  })
  return typeof limit === 'number' && limit > 0 ? filtered.slice(0, limit) : filtered
}

function scoreHostedExperienceRecord(record: Record<string, unknown>, query: string): number {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (terms.length === 0) return 0
  const title = (normalizeNonEmpty(record.title) ?? '').toLowerCase()
  const classification = [
    ...toStringArray(record.tags),
    ...toStringArray(record.areas),
    ...toStringArray(record.stack),
    normalizeNonEmpty(record.type),
  ].filter(Boolean).join(' ').toLowerCase()
  const structured = [
    normalizeNonEmpty(record.problem),
    normalizeNonEmpty(record.solution),
    ...toStringArray(record.commands),
    ...toStringArray(record.files),
  ].filter(Boolean).join(' ').toLowerCase()
  const content = (normalizeNonEmpty(record.content) ?? '').toLowerCase()
  let score = 0
  for (const term of terms) {
    if (title.includes(term)) score += 8
    if (classification.includes(term)) score += 5
    if (structured.includes(term)) score += 4
    if (content.includes(term)) score += 2
  }
  return score
}

function emitExperienceCommandError(params: {
  options: { json?: boolean }
  command: string
  toolId?: string
  resolvedContext?: ResolvedExperienceContext
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

function buildCaptureDataInput(options: ExperienceCaptureOptions, context: ResolvedExperienceContext): Record<string, unknown> {
  const title = normalizeNonEmpty(options.title)
  if (!title) throw new Error('Provide --title.')
  const content = normalizeNonEmpty(expandAtFileContent(options.content))
    ?? normalizeNonEmpty(options.solution)
    ?? normalizeNonEmpty(options.problem)
  if (!content) throw new Error('Provide --content, --solution, or --problem.')
  return compactPayload({
    scopeId: context.scopeId,
    type: normalizeExperienceType(options.type ?? 'technique'),
    title,
    problem: normalizeNonEmpty(options.problem),
    solution: normalizeNonEmpty(options.solution),
    content,
    areas: toStringArray(options.area),
    stack: toStringArray(options.stack),
    commands: toStringArray(options.command),
    files: toStringArray(options.file),
    sourceRefs: parseSourceRefs(options.sourceRef),
    tags: uniqueStrings(toStringArray(options.tag)),
    confidence: normalizeNonEmpty(options.confidence),
    reusability: normalizeNonEmpty(options.reusability),
    meta: buildExperienceMeta(options),
  })
}

export async function runExperienceCapture(options: ExperienceCaptureOptions = {}): Promise<void> {
  let resolvedContext: ResolvedExperienceContext | undefined
  let apiState: CliApiClientState | null
  try {
    ensureGuardedWrite(options, 'This command writes an Agentspace experience item.')
    apiState = await requireApiState(options)
    if (!apiState) return
    resolvedContext = await resolveExperienceContext(options, { requireScope: true })
    resolvedContext = await hydrateProjectScopeContext(apiState, options, resolvedContext)
  } catch (error) {
    logError(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
    return
  }

  try {
    const data = buildCaptureDataInput(options, resolvedContext)
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
      toolId: EXPERIENCE_ADD_TOOL_ID,
      input,
      preview: options.preview,
      apply: options.apply,
      idempotencyKey: options.idempotencyKey,
    })

    const result = unwrapHostedToolResult(payload)
    const row = unwrapResultData<Record<string, unknown>>(result)
    const record = isRecord(row) ? normalizeHostedExperienceRecord(row) : result
    if (options.json) {
      console.log(JSON.stringify(buildHostedSugarEnvelope({
        command: 'experience.capture',
        toolId: EXPERIENCE_ADD_TOOL_ID,
        resolvedContext: buildResolvedContextRecord(resolvedContext),
        input,
        result: record,
      }), null, 2))
      return
    }
    logSuccess('Experience item captured.')
    console.log(JSON.stringify(record, null, 2))
  } catch (error) {
    emitExperienceCommandError({
      options,
      command: 'experience.capture',
      toolId: EXPERIENCE_ADD_TOOL_ID,
      resolvedContext,
      error,
    })
  }
}

export async function runExperienceList(options: ExperienceListOptions = {}): Promise<void> {
  let resolvedContext: ResolvedExperienceContext | undefined
  let apiState: CliApiClientState | null
  try {
    apiState = await requireApiState(options)
    if (!apiState) return
    resolvedContext = await resolveExperienceContext(options, { requireScope: true })
    resolvedContext = await hydrateProjectScopeContext(apiState, options, resolvedContext)
  } catch (error) {
    logError(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
    return
  }

  try {
    const input = compactPayload({
      filter: buildExperienceListFilter(resolvedContext),
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
      toolId: EXPERIENCE_LIST_TOOL_ID,
      input,
    })

    const result = unwrapHostedToolResult(payload)
    const records = extractHostedRows(result).map(normalizeHostedExperienceRecord)
    const filtered = filterHostedExperienceRecords(records, options)
    const data = { data: filtered }
    if (options.json) {
      console.log(JSON.stringify(buildHostedSugarEnvelope({
        command: 'experience.list',
        toolId: EXPERIENCE_LIST_TOOL_ID,
        resolvedContext: buildResolvedContextRecord(resolvedContext),
        input,
        result: data,
      }), null, 2))
      return
    }
    logSuccess('Experience items loaded.')
    console.log(JSON.stringify(data, null, 2))
  } catch (error) {
    emitExperienceCommandError({
      options,
      command: 'experience.list',
      toolId: EXPERIENCE_LIST_TOOL_ID,
      resolvedContext,
      error,
    })
  }
}

export async function runExperienceGet(options: ExperienceGetOptions = {}): Promise<void> {
  let resolvedContext: ResolvedExperienceContext | undefined
  let apiState: CliApiClientState | null
  try {
    const id = normalizeNonEmpty(options.id)
    if (!id) throw new Error('Provide --id.')
    apiState = await requireApiState(options)
    if (!apiState) return
    resolvedContext = await resolveExperienceContext(options, { requireScope: false })
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
      toolId: EXPERIENCE_GET_TOOL_ID,
      input,
    })

    const result = unwrapHostedToolResult(payload)
    const row = unwrapResultData<Record<string, unknown>>(result)
    if (!isRecord(row)) throw new Error('Experience item was not found.')
    const data = { data: normalizeHostedExperienceRecord(row) }
    if (options.json) {
      console.log(JSON.stringify(buildHostedSugarEnvelope({
        command: 'experience.get',
        toolId: EXPERIENCE_GET_TOOL_ID,
        resolvedContext: buildResolvedContextRecord(resolvedContext),
        input,
        result: data,
      }), null, 2))
      return
    }
    logSuccess('Experience item loaded.')
    console.log(JSON.stringify(data, null, 2))
  } catch (error) {
    emitExperienceCommandError({
      options,
      command: 'experience.get',
      toolId: EXPERIENCE_GET_TOOL_ID,
      resolvedContext,
      error,
    })
  }
}

export async function runExperienceSearch(options: ExperienceSearchOptions = {}): Promise<void> {
  let resolvedContext: ResolvedExperienceContext | undefined
  let apiState: CliApiClientState | null
  try {
    const query = normalizeNonEmpty(options.query)
    if (!query) throw new Error('Provide --query.')
    apiState = await requireApiState(options)
    if (!apiState) return
    resolvedContext = await resolveExperienceContext(options, { requireScope: true })
    resolvedContext = await hydrateProjectScopeContext(apiState, options, resolvedContext)
  } catch (error) {
    logError(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
    return
  }

  try {
    const query = normalizeNonEmpty(options.query)!
    // Server-first: there is no hosted experience search op. Read server-truth
    // rows via list-experience-items and apply lexical ranking client-side
    // (presentation only). No local experience file is read. Ranking must see
    // enough rows BEFORE the user --limit (codex S1.3b.1 RRR 9981de10), so fetch
    // up to EXPERIENCE_SEARCH_RANK_FETCH_LIMIT here; the user --limit is applied
    // after ranking below.
    const input = compactPayload({
      filter: buildExperienceListFilter(resolvedContext),
      options: compactPayload({ limit: EXPERIENCE_SEARCH_RANK_FETCH_LIMIT }),
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
      toolId: EXPERIENCE_LIST_TOOL_ID,
      input,
    })

    const result = unwrapHostedToolResult(payload)
    const rawRows = extractHostedRows(result)
    if (rawRows.length >= EXPERIENCE_SEARCH_RANK_FETCH_LIMIT) {
      // No silent cap: if the server returned a full fetch page, ranking only saw the
      // first EXPERIENCE_SEARCH_RANK_FETCH_LIMIT rows; tell the user to narrow filters.
      console.error(`[experience search] ranked over the first ${EXPERIENCE_SEARCH_RANK_FETCH_LIMIT} server rows; narrow --query/--type/--area/--stack/--tag if an expected match is missing.`)
    }
    // Drop the user --limit from the client presentation filter too: it must NOT slice
    // before ranking (codex RRR 9981de10). type/area/stack/tag filters still apply; the
    // user --limit is applied AFTER ranking below.
    const records = filterHostedExperienceRecords(rawRows.map(normalizeHostedExperienceRecord), { ...options, limit: undefined })
    const limit = toNonNegativeInteger(options.limit) ?? 10
    const ranked = records
      .map((record) => ({ record, score: scoreHostedExperienceRecord(record, query) }))
      .filter((entry) => entry.score > 0)
      .sort((left, right) =>
        right.score - left.score
        || (normalizeNonEmpty(right.record.updatedAt) ?? '').localeCompare(normalizeNonEmpty(left.record.updatedAt) ?? ''),
      )
      .slice(0, limit > 0 ? limit : 10)
    const data = { data: ranked.map(({ record, score }) => ({ ...record, score })) }
    if (options.json) {
      console.log(JSON.stringify(buildHostedSugarEnvelope({
        command: 'experience.search',
        toolId: EXPERIENCE_LIST_TOOL_ID,
        resolvedContext: buildResolvedContextRecord(resolvedContext),
        input: compactPayload({ ...input, query }),
        result: data,
      }), null, 2))
      return
    }
    logSuccess('Experience search completed.')
    console.log(JSON.stringify(data, null, 2))
  } catch (error) {
    emitExperienceCommandError({
      options,
      command: 'experience.search',
      toolId: EXPERIENCE_LIST_TOOL_ID,
      resolvedContext,
      error,
    })
  }
}

function buildUpdatePatch(options: ExperienceUpdateOptions): Record<string, unknown> {
  return compactPayload({
    type: options.type ? normalizeExperienceType(options.type) : undefined,
    title: normalizeNonEmpty(options.title),
    problem: normalizeNonEmpty(options.problem),
    solution: normalizeNonEmpty(options.solution),
    content: normalizeNonEmpty(expandAtFileContent(options.content)),
    areas: toStringArray(options.area).length > 0 ? uniqueStrings(toStringArray(options.area)) : undefined,
    stack: toStringArray(options.stack).length > 0 ? uniqueStrings(toStringArray(options.stack)) : undefined,
    commands: toStringArray(options.command).length > 0 ? uniqueStrings(toStringArray(options.command)) : undefined,
    files: toStringArray(options.file).length > 0 ? uniqueStrings(toStringArray(options.file)) : undefined,
    sourceRefs: parseSourceRefs(options.sourceRef).length > 0 ? parseSourceRefs(options.sourceRef) : undefined,
    tags: toStringArray(options.tag).length > 0 ? uniqueStrings(toStringArray(options.tag)) : undefined,
    confidence: normalizeNonEmpty(options.confidence),
    reusability: normalizeNonEmpty(options.reusability),
    meta: buildExperienceMeta(options),
  })
}

export async function runExperienceUpdate(options: ExperienceUpdateOptions = {}): Promise<void> {
  let resolvedContext: ResolvedExperienceContext | undefined
  let apiState: CliApiClientState | null
  try {
    const id = normalizeNonEmpty(options.id)
    if (!id) throw new Error('Provide --id.')
    ensureGuardedWrite(options, 'This command updates an Agentspace experience item.')
    apiState = await requireApiState(options)
    if (!apiState) return
    resolvedContext = await resolveExperienceContext(options, { requireScope: false })
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
      throw new Error('Provide at least one patch field such as --title, --content, --area, --stack, --command, --file, or --tag.')
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
      toolId: EXPERIENCE_UPDATE_TOOL_ID,
      input,
      preview: options.preview,
      apply: options.apply,
      idempotencyKey: options.idempotencyKey,
    })

    const result = unwrapHostedToolResult(payload)
    const row = unwrapResultData<Record<string, unknown>>(result)
    const data = { data: isRecord(row) ? normalizeHostedExperienceRecord(row) : result }
    if (options.json) {
      console.log(JSON.stringify(buildHostedSugarEnvelope({
        command: 'experience.update',
        toolId: EXPERIENCE_UPDATE_TOOL_ID,
        resolvedContext: buildResolvedContextRecord(resolvedContext),
        input,
        result: data,
      }), null, 2))
      return
    }
    logSuccess('Experience item updated.')
    console.log(JSON.stringify(data, null, 2))
  } catch (error) {
    emitExperienceCommandError({
      options,
      command: 'experience.update',
      toolId: EXPERIENCE_UPDATE_TOOL_ID,
      resolvedContext,
      error,
    })
  }
}

export async function runExperienceDelete(options: ExperienceDeleteOptions = {}): Promise<void> {
  let resolvedContext: ResolvedExperienceContext | undefined
  let apiState: CliApiClientState | null
  try {
    const id = normalizeNonEmpty(options.id)
    if (!id) throw new Error('Provide --id.')
    ensureDestructiveWrite(options, 'This command deletes an Agentspace experience item.')
    apiState = await requireApiState(options)
    if (!apiState) return
    resolvedContext = await resolveExperienceContext(options, { requireScope: false })
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
      toolId: EXPERIENCE_REMOVE_TOOL_ID,
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
        command: 'experience.delete',
        toolId: EXPERIENCE_REMOVE_TOOL_ID,
        resolvedContext: buildResolvedContextRecord(resolvedContext),
        input,
        result: data,
      }), null, 2))
      return
    }
    logSuccess('Experience item deleted.')
    console.log(JSON.stringify(data, null, 2))
  } catch (error) {
    emitExperienceCommandError({
      options,
      command: 'experience.delete',
      toolId: EXPERIENCE_REMOVE_TOOL_ID,
      resolvedContext,
      error,
    })
  }
}

const EXPERIENCE_PROMOTE_TOOL_ID = 'agentspace.memory-item.promote-from-experience'

/**
 * Build the hosted promote `overrides` payload from the CLI options. Only
 * non-empty values are included so server-side defaults apply. The durable-memory
 * flavor honors kind (note|decision) + durability; the playbook flavor honors the
 * playbook-* shaping fields. Server validates/normalizes.
 */
function buildPromoteOverrides(options: ExperiencePromoteOptions): Record<string, unknown> {
  return compactPayload({
    kind: normalizeNonEmpty(options.kind),
    durability: normalizeNonEmpty(options.durability),
    content: normalizeNonEmpty(expandAtFileContent(options.content)),
    tags: uniqueStrings(toStringArray(options.tag)),
    playbookId: normalizeNonEmpty(options.playbookId),
    playbookScope: normalizeNonEmpty(options.playbookScope),
    playbookArea: normalizeNonEmpty(options.playbookArea),
    appliesWhen: normalizeNonEmpty(options.appliesWhen),
    steps: uniqueStrings(toStringArray(options.step)),
    enforcement: normalizeNonEmpty(options.enforcement),
    reviewState: normalizeNonEmpty(options.reviewState),
    supersedes: normalizeNonEmpty(options.supersedes),
  })
}

export async function runExperiencePromote(options: ExperiencePromoteOptions = {}): Promise<void> {
  const asPlaybook = options.asPlaybook === true
  const command = asPlaybook ? 'experience.promote.playbook' : 'experience.promote'
  let resolvedContext: ResolvedExperienceContext | undefined
  let apiState: CliApiClientState | null
  try {
    const id = normalizeNonEmpty(options.id)
    if (!id) throw new Error('Provide --id.')
    ensureGuardedWrite(options, 'This command promotes an Agentspace experience item into a memory item.')
    apiState = await requireApiState(options)
    if (!apiState) return
    resolvedContext = await resolveExperienceContext(options, { requireScope: false })
    resolvedContext = await hydrateProjectScopeContext(apiState, options, resolvedContext)
  } catch (error) {
    logError(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
    return
  }

  try {
    const experienceId = normalizeNonEmpty(options.id)!
    const overrides = buildPromoteOverrides(options)
    const input = compactPayload({
      experienceId,
      asPlaybook: asPlaybook ? true : undefined,
      overrides: Object.keys(overrides).length > 0 ? overrides : undefined,
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
      toolId: EXPERIENCE_PROMOTE_TOOL_ID,
      input,
      preview: options.preview,
      apply: options.apply,
      idempotencyKey: options.idempotencyKey,
    })

    const result = unwrapHostedToolResult(payload)
    const row = unwrapResultData<Record<string, unknown>>(result)
    const data = { data: isRecord(row) ? row : result }
    if (options.json) {
      console.log(JSON.stringify(buildHostedSugarEnvelope({
        command,
        toolId: EXPERIENCE_PROMOTE_TOOL_ID,
        resolvedContext: buildResolvedContextRecord(resolvedContext),
        input,
        result: data,
      }), null, 2))
      return
    }
    logSuccess(asPlaybook ? 'Experience promoted into a playbook memory item.' : 'Experience promoted into a durable memory item.')
    console.log(JSON.stringify(data, null, 2))
  } catch (error) {
    emitExperienceCommandError({
      options,
      command,
      toolId: EXPERIENCE_PROMOTE_TOOL_ID,
      resolvedContext,
      input: compactPayload({ id: normalizeNonEmpty(options.id), asPlaybook: asPlaybook ? true : undefined }),
      error,
    })
  }
}

export function makeExperienceCommand(): Command {
  const cmd = new Command('exp')
    .alias('experience')
    .description('Author and read hosted Agentspace experience items (server-first)')

  applyCommonOptions(cmd, { withAuth: false, withProject: true, withYes: true, withJson: true })
  cmd.addHelpText(
    'after',
    `
Experience is server-first: every subcommand reads and writes the hosted
\`agentspace.experience-item.*\` ops through the agent gateway. The hosted store
is the single source of truth.

Use experience for techniques, scripts, tools, problem/solution notes, and reusable agent learnings.
Use mem for project state, durable decisions, handoff/resume, sticky bootstrap rules.

Capture and read hosted experience:
  aops-cli exp capture --type problem-solution --title "<title>" --content "<notes>" --apply --json
  aops-cli exp list --type problem-solution --json
  aops-cli exp get --id <id> --json
  aops-cli exp search --query "<terms>" --json

Promote a hosted experience into a durable memory item, or a playbook:
  aops-cli exp promote --id <id> --apply --json
  aops-cli exp promote --id <id> --as-playbook --playbook-area backend --review-state accepted --apply --json
`,
  )

  const capture = cmd.command('capture')
    .description('Capture a hosted experience item')
    .option('--type <type>', `Experience type: ${EXPERIENCE_TYPES.join('|')} (default: technique)`)
    .option('--title <title>', 'Experience title')
    .option('--content <text>', 'Narrative notes (supports @file)')
    .option('--problem <text>', 'Problem statement')
    .option('--solution <text>', 'Solution or technique')
    .option('--area <area>', 'Area tag; repeatable', collectRepeatedOption, [])
    .option('--stack <stack>', 'Stack/tooling tag; repeatable', collectRepeatedOption, [])
    .option('--command <command>', 'Useful command/script; repeatable', collectRepeatedOption, [])
    .option('--file <path>', 'Relevant file path; repeatable', collectRepeatedOption, [])
    .option('--tag <tag>', 'General tag; repeatable', collectRepeatedOption, [])
    .option('--source-ref <json-or-ref>', 'Source reference JSON or string; repeatable', collectRepeatedOption, [])
    .option('--session-id <id>', 'Session id for session-scoped experience context')
    .option('--mission-id <id>', 'Mission id for session-scoped experience context')
    .option('--chatv3-seq <seq>', 'ChatV3 sequence anchor for session-scoped experience context')
    .option('--pm-ref <ref>', 'Projectman reference for session-scoped experience context; repeatable', collectRepeatedOption, [])
    .option('--discuss-ref <ref>', 'Discuss topic/turn reference for session-scoped experience context; repeatable', collectRepeatedOption, [])
    .option('--confidence <level>', 'Confidence note')
    .option('--reusability <level>', 'Reusability note')
    .option('--preview', 'Preview the hosted write without applying')
    .option('--apply', 'Write the item')
    .option('--idempotency-key <key>', 'Idempotency key for the hosted write')
    .action((options) => runExperienceCapture({ ...cmd.opts(), ...options }))
  applyCommonOptions(capture, { withAuth: false, withProject: true, withYes: true, withJson: true })

  const list = cmd.command('list')
    .description('List hosted experience items within the current owner scope')
    .option('--type <type>', 'Filter by type')
    .option('--area <area>', 'Filter by area; repeatable', collectRepeatedOption, [])
    .option('--stack <stack>', 'Filter by stack; repeatable', collectRepeatedOption, [])
    .option('--tag <tag>', 'Filter by tag; repeatable', collectRepeatedOption, [])
    .option('--limit <n>', 'Limit result count', parseInteger)
    .action((options) => runExperienceList({ ...cmd.opts(), ...options }))
  applyCommonOptions(list, { withAuth: false, withProject: true, withYes: true, withJson: true })

  const get = cmd.command('get')
    .description('Get one hosted experience item by id')
    .requiredOption('--id <id>', 'Experience item id')
    .action((options) => runExperienceGet({ ...cmd.opts(), ...options }))
  applyCommonOptions(get, { withAuth: false, withProject: true, withYes: true, withJson: true })

  const search = cmd.command('search')
    .description('Lexically rank hosted experience items (server-truth rows ranked client-side)')
    .requiredOption('--query <text>', 'Search query')
    .option('--type <type>', 'Filter by type')
    .option('--area <area>', 'Filter by area; repeatable', collectRepeatedOption, [])
    .option('--stack <stack>', 'Filter by stack; repeatable', collectRepeatedOption, [])
    .option('--tag <tag>', 'Filter by tag; repeatable', collectRepeatedOption, [])
    .option('--limit <n>', 'Limit result count', parseInteger)
    .action((options) => runExperienceSearch({ ...cmd.opts(), ...options }))
  applyCommonOptions(search, { withAuth: false, withProject: true, withYes: true, withJson: true })

  const update = cmd.command('update')
    .description('Patch one hosted experience item')
    .requiredOption('--id <id>', 'Experience item id')
    .option('--type <type>', `Experience type: ${EXPERIENCE_TYPES.join('|')}`)
    .option('--title <title>', 'New title')
    .option('--content <text>', 'Replace narrative notes (supports @file)')
    .option('--problem <text>', 'Replace problem statement')
    .option('--solution <text>', 'Replace solution')
    .option('--area <area>', 'Replace area tags; repeatable', collectRepeatedOption, [])
    .option('--stack <stack>', 'Replace stack/tooling tags; repeatable', collectRepeatedOption, [])
    .option('--command <command>', 'Replace useful commands/scripts; repeatable', collectRepeatedOption, [])
    .option('--file <path>', 'Replace relevant file paths; repeatable', collectRepeatedOption, [])
    .option('--tag <tag>', 'Replace general tags; repeatable', collectRepeatedOption, [])
    .option('--source-ref <json-or-ref>', 'Replace source references; repeatable', collectRepeatedOption, [])
    .option('--confidence <level>', 'Confidence note')
    .option('--reusability <level>', 'Reusability note')
    .option('--preview', 'Preview the hosted update without applying')
    .option('--apply', 'Write the item')
    .option('--idempotency-key <key>', 'Idempotency key for the hosted write')
    .action((options) => runExperienceUpdate({ ...cmd.opts(), ...options }))
  applyCommonOptions(update, { withAuth: false, withProject: true, withYes: true, withJson: true })

  const del = cmd.command('delete')
    .description('Delete one hosted experience item')
    .requiredOption('--id <id>', 'Experience item id')
    .option('--preview', 'Preview the hosted delete without applying')
    .option('--apply', 'Delete the item')
    .option('--confirm', 'Confirm destructive delete')
    .option('--idempotency-key <key>', 'Idempotency key for the hosted delete')
    .action((options) => runExperienceDelete({ ...cmd.opts(), ...options }))
  applyCommonOptions(del, { withAuth: false, withProject: true, withYes: true, withJson: true })

  const promote = cmd.command('promote')
    .description('Promote a hosted experience item into a durable memory item (or a playbook with --as-playbook)')
    .requiredOption('--id <id>', 'Experience item id')
    .option('--kind <kind>', 'Memory kind: note|decision (durable) or rule|constraint (with --as-playbook)')
    .option('--durability <durability>', 'Memory durability: durable (default) or sticky')
    .option('--content <text>', 'Reviewed promoted memory content (supports @file; defaults to experience content)')
    .option('--tag <tag>', 'Extra memory tag; repeatable', collectRepeatedOption, [])
    .option('--as-playbook', 'Promote as a reviewed playbook rule/constraint memory item')
    .option('--playbook-id <id>', 'Stable playbook id (default: experience id)')
    .option('--playbook-scope <scope>', 'Playbook scope: session or project')
    .option('--playbook-area <area>', 'Playbook area tag, such as backend or hexagen')
    .option('--applies-when <text>', 'When this playbook should be applied')
    .option('--step <text>', 'Playbook step; repeatable', collectRepeatedOption, [])
    .option('--enforcement <level>', 'Playbook enforcement: advisory | soft-preflight | strict-opt-in')
    .option('--review-state <state>', 'Playbook review state: proposed | accepted | superseded | archived')
    .option('--supersedes <id>', 'Older playbook id this one supersedes')
    .option('--preview', 'Preview the hosted promotion without applying')
    .option('--apply', 'Write the memory item')
    .option('--idempotency-key <key>', 'Idempotency key for the hosted write')
    .action((options) => runExperiencePromote({ ...cmd.opts(), ...options }))
  applyCommonOptions(promote, { withAuth: false, withProject: true, withYes: true, withJson: true })

  return cmd
}
