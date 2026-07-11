import { Command } from 'commander'
import { logError, logSuccess } from '@aopslab/xf-cli-ui'

import { applyCommonOptions, compactPayload, normalizeNonEmpty } from '../utils/command.js'
import { runExperiencePromote } from './experience.js'
import {
  buildProjectPlaybookSet,
  filterPlaybookRecords,
  renderPlaybookMarkdown,
  toPlaybookBrief,
  type PlaybookRecord,
} from '../utils/playbook-workspace.js'
import {
  invokeHostedToolWithApiState,
  requireApiState,
  unwrapHostedToolResult,
  type AgentGatewayContextOptions,
} from '../utils/agent-gateway.js'
import {
  preferProjectNameBinding,
  resolveOwnerScopeIdFromBinding,
  resolveOwnerScopeIdFromProjectRecord,
  resolveProjectBindingContext,
  type ProjectBindingContextOptions,
  type ResolvedProjectBindingContext,
} from '../utils/project-context.js'
import type { CliApiClientState } from '../utils/api.js'

// -----------------------------------------------------------------------------
// Server-first playbook READ surface.
//
// Playbooks are reviewed prescriptive memory rules/constraints (kind=rule|constraint
// with meta.playbook / playbook tags). The READ side (list / get / show / project-set)
// is HOSTED/SERVER-FIRST: it projects the hosted `agentspace.playbook.list` op through
// the agent gateway. The hosted memory store is the single source of truth; the local
// .aops tree is a read-only cache only and is NEVER read as truth or rewritten by any
// playbook subcommand. There is no local index rebuild.
//
// `promote` delegates to the server-first experience promote op
// (agentspace.memory-item.promote-from-experience); it is the only WRITE surface and is
// implemented in experience.ts.
// -----------------------------------------------------------------------------

const PLAYBOOK_TOOL_ID = 'agentspace.playbook.list'

type PlaybookContextOptions = ProjectBindingContextOptions & AgentGatewayContextOptions & {
  scopeId?: string
  json?: boolean
}

type PlaybookListOptions = PlaybookContextOptions & {
  scope?: string
  area?: string[]
  durability?: string[]
  reviewState?: string
  tag?: string[]
  limit?: number
}

type PlaybookGetOptions = PlaybookContextOptions & {
  id?: string
}

type PlaybookProjectSetOptions = PlaybookListOptions

type PlaybookPromoteOptions = PlaybookContextOptions & {
  id?: string
  kind?: string
  durability?: 'durable' | 'sticky'
  content?: string
  tag?: string[]
  scope?: string
  playbookScope?: string
  area?: string
  playbookArea?: string
  appliesWhen?: string
  step?: string[]
  enforcement?: string
  reviewState?: string
  playbookId?: string
  supersedes?: string
  apply?: boolean
  preview?: boolean
  idempotencyKey?: string
}

type ResolvedPlaybookContext = ResolvedProjectBindingContext & {
  scopeId?: string
}

function collectRepeatedOption(value: string, previous: string[] = []): string[] {
  const normalized = normalizeNonEmpty(value)
  return normalized ? [...previous, normalized] : previous
}

function parseInteger(value: string): number {
  return Number.parseInt(value, 10)
}

function applyProjectSlugOption(cmd: Command): Command {
  if (cmd.options.some((option) => option.long === '--project-slug')) return cmd
  return cmd.option('--project-slug <slug>', 'Project slug from repo project registry')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function toStringArray(values: unknown): string[] {
  return Array.isArray(values)
    ? values.map((entry) => normalizeNonEmpty(entry)).filter((entry): entry is string => Boolean(entry))
    : []
}

function buildResolvedContextRecord(context: ResolvedPlaybookContext): Record<string, unknown> {
  return compactPayload({
    repoRoot: context.repoRoot,
    configPath: context.configPath,
    configFound: context.configFound,
    scopeId: context.scopeId,
    projectId: context.projectId,
    projectName: context.projectName,
  })
}

function buildEnvelope(params: {
  command: string
  resolvedContext: ResolvedPlaybookContext
  input: Record<string, unknown>
  result: unknown
}): Record<string, unknown> {
  return {
    command: params.command,
    toolId: PLAYBOOK_TOOL_ID,
    resolvedContext: buildResolvedContextRecord(params.resolvedContext),
    input: params.input,
    result: params.result,
  }
}

function emitResult(options: { json?: boolean }, message: string, envelope: Record<string, unknown>, plainResult: unknown): void {
  if (options.json) {
    console.log(JSON.stringify(envelope, null, 2))
    return
  }
  logSuccess(message)
  console.log(JSON.stringify(plainResult, null, 2))
}

function buildGatewayOptions(
  options: AgentGatewayContextOptions,
  resolvedContext: ResolvedPlaybookContext,
): AgentGatewayContextOptions {
  return {
    ...options,
    ...preferProjectNameBinding(resolvedContext),
  }
}

async function resolvePlaybookContext(options: PlaybookContextOptions): Promise<ResolvedPlaybookContext> {
  const resolved = await resolveProjectBindingContext(options, { requireProject: false })
  const scopeId = normalizeNonEmpty(options.scopeId) ?? resolveOwnerScopeIdFromBinding(resolved)
  return { ...resolved, scopeId }
}

/**
 * Hydrate scopeId + projectName from the hosted project record when the repo
 * config only resolved a projectId. Mirrors the experience/memory commands so the
 * playbook.list scope filter always carries an owner scope. Best-effort: never
 * blocks the command.
 */
async function hydrateProjectScopeContext(
  apiState: CliApiClientState,
  options: AgentGatewayContextOptions,
  resolvedContext: ResolvedPlaybookContext,
): Promise<ResolvedPlaybookContext> {
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
    const project = isRecord(result) && Object.prototype.hasOwnProperty.call(result, 'data')
      ? result.data
      : result
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

function extractHostedRows(result: unknown): Record<string, unknown>[] {
  const data = isRecord(result) && Object.prototype.hasOwnProperty.call(result, 'data') ? result.data : result
  if (Array.isArray(data)) return data.filter(isRecord)
  if (Array.isArray(result)) return result.filter(isRecord)
  return []
}

/**
 * Map a hosted `agentspace.playbook.list` projection row (toPlaybookProjection
 * shape) into the PlaybookRecord presentation shape the CLI emits. The hosted
 * projection is server truth; this is presentation only. No local file is read.
 */
function hostedProjectionToPlaybookRecord(row: Record<string, unknown>): PlaybookRecord {
  const id = normalizeNonEmpty(row.id) ?? normalizeNonEmpty(row.playbookId)
  return {
    id,
    playbookId: normalizeNonEmpty(row.playbookId) ?? id,
    title: normalizeNonEmpty(row.title) ?? id,
    memoryItemId: normalizeNonEmpty(row.memoryItemId) ?? normalizeNonEmpty(row.sourceMemoryItemId),
    kind: normalizeNonEmpty(row.kind),
    durability: normalizeNonEmpty(row.durability),
    scope: normalizeNonEmpty(row.scope),
    area: normalizeNonEmpty(row.area),
    appliesWhen: normalizeNonEmpty(row.appliesWhen),
    steps: toStringArray(row.steps),
    enforcement: normalizeNonEmpty(row.enforcement),
    confidence: normalizeNonEmpty(row.confidence),
    reviewState: normalizeNonEmpty(row.reviewState),
    supersedes: normalizeNonEmpty(row.supersedes),
    promotedFromExperienceId: normalizeNonEmpty(row.promotedFromExperienceId),
    sessionContext: row.sessionContext,
    sourceType: normalizeNonEmpty(row.sourceType),
    sourceId: normalizeNonEmpty(row.sourceId),
    sourceRefs: Array.isArray(row.sourceRefs) ? row.sourceRefs : undefined,
    content: normalizeNonEmpty(row.content),
    tags: toStringArray(row.tags),
    updatedAt: normalizeNonEmpty(row.updatedAt),
    createdAt: normalizeNonEmpty(row.createdAt),
  }
}

/**
 * Server-first playbook read. Invokes the hosted `agentspace.playbook.list` op
 * (which projects playbook-tagged memory rules/constraints) within the resolved
 * owner scope and maps the projection rows into PlaybookRecord. Never reads local
 * files and never rewrites a local index.
 */
async function loadPlaybooks(
  apiState: CliApiClientState,
  context: ResolvedPlaybookContext,
  options: AgentGatewayContextOptions,
): Promise<PlaybookRecord[]> {
  const input = compactPayload({
    filter: compactPayload({
      scopeId: context.scopeId,
      scopeResolution: 'cascade',
      projectId: context.projectId,
    }),
  })
  const payload = await invokeHostedToolWithApiState(apiState, {
    ...buildGatewayOptions(options, context),
    tenantId: options.tenantId,
    locale: options.locale,
    fallbackLocale: options.fallbackLocale,
    timeoutMs: options.timeoutMs,
    apiBaseUrl: options.apiBaseUrl,
    accessToken: options.accessToken,
    refreshToken: options.refreshToken,
    toolId: PLAYBOOK_TOOL_ID,
    input,
  })
  const result = unwrapHostedToolResult(payload)
  return extractHostedRows(result)
    .map(hostedProjectionToPlaybookRecord)
    .sort((left, right) => (right.updatedAt ?? right.createdAt ?? '').localeCompare(left.updatedAt ?? left.createdAt ?? ''))
}

function emitPlaybookCommandError(params: {
  options: { json?: boolean }
  command: string
  resolvedContext?: ResolvedPlaybookContext
  input?: Record<string, unknown>
  error: unknown
}): void {
  const message = params.error instanceof Error ? params.error.message : String(params.error)
  if (params.options.json) {
    console.log(JSON.stringify({
      command: params.command,
      toolId: PLAYBOOK_TOOL_ID,
      resolvedContext: params.resolvedContext ? buildResolvedContextRecord(params.resolvedContext) : {},
      input: params.input ?? {},
      result: { error: { message } },
    }, null, 2))
  } else {
    logError(message)
  }
  process.exitCode = 1
}

export async function runPlaybookList(options: PlaybookListOptions = {}): Promise<void> {
  let context: ResolvedPlaybookContext | undefined
  let apiState: CliApiClientState | null
  try {
    apiState = await requireApiState(options)
    if (!apiState) return
    context = await resolvePlaybookContext(options)
    context = await hydrateProjectScopeContext(apiState, options, context)
  } catch (error) {
    logError(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
    return
  }

  try {
    const playbooks = filterPlaybookRecords(await loadPlaybooks(apiState, context, options), {
      scope: options.scope,
      area: options.area,
      durability: options.durability,
      reviewState: options.reviewState,
      tag: options.tag,
      limit: options.limit,
    })
    const result = {
      data: playbooks.map((record) => ({ ...record, brief: toPlaybookBrief(record) })),
      count: playbooks.length,
      filters: compactPayload({
        scope: options.scope,
        area: options.area,
        durability: options.durability,
        reviewState: options.reviewState,
        tag: options.tag,
        limit: options.limit,
      }),
    }
    emitResult(
      options,
      'Hosted playbook list completed.',
      buildEnvelope({ command: 'playbook.list', resolvedContext: context, input: compactPayload({ hostedFirst: true, ...options }), result }),
      result,
    )
  } catch (error) {
    emitPlaybookCommandError({ options, command: 'playbook.list', resolvedContext: context, error })
  }
}

export async function runPlaybookGet(options: PlaybookGetOptions = {}): Promise<void> {
  let context: ResolvedPlaybookContext | undefined
  let apiState: CliApiClientState | null
  try {
    const id = normalizeNonEmpty(options.id)
    if (!id) throw new Error('Provide --id.')
    apiState = await requireApiState(options)
    if (!apiState) return
    context = await resolvePlaybookContext(options)
    context = await hydrateProjectScopeContext(apiState, options, context)
  } catch (error) {
    logError(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
    return
  }

  try {
    const id = normalizeNonEmpty(options.id)!
    const [record] = filterPlaybookRecords(await loadPlaybooks(apiState, context, options), { id })
    if (!record) throw new Error('Hosted playbook was not found.')
    const result = { data: { ...record, brief: toPlaybookBrief(record) } }
    emitResult(
      options,
      'Hosted playbook loaded.',
      buildEnvelope({ command: 'playbook.get', resolvedContext: context, input: { id, hostedFirst: true }, result }),
      result,
    )
  } catch (error) {
    emitPlaybookCommandError({ options, command: 'playbook.get', resolvedContext: context, input: compactPayload({ id: normalizeNonEmpty(options.id) }), error })
  }
}

export async function runPlaybookShow(options: PlaybookGetOptions = {}): Promise<void> {
  let context: ResolvedPlaybookContext | undefined
  let apiState: CliApiClientState | null
  try {
    const id = normalizeNonEmpty(options.id)
    if (!id) throw new Error('Provide --id.')
    apiState = await requireApiState(options)
    if (!apiState) return
    context = await resolvePlaybookContext(options)
    context = await hydrateProjectScopeContext(apiState, options, context)
  } catch (error) {
    logError(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
    return
  }

  try {
    const id = normalizeNonEmpty(options.id)!
    const [record] = filterPlaybookRecords(await loadPlaybooks(apiState, context, options), { id })
    if (!record) throw new Error('Hosted playbook was not found.')
    const markdown = renderPlaybookMarkdown(record)
    const result = { data: { ...record, brief: toPlaybookBrief(record) }, markdown }
    if (options.json) {
      console.log(JSON.stringify(buildEnvelope({
        command: 'playbook.show',
        resolvedContext: context,
        input: { id, hostedFirst: true },
        result,
      }), null, 2))
      return
    }
    process.stdout.write(markdown)
  } catch (error) {
    emitPlaybookCommandError({ options, command: 'playbook.show', resolvedContext: context, input: compactPayload({ id: normalizeNonEmpty(options.id) }), error })
  }
}

export async function runPlaybookProjectSet(options: PlaybookProjectSetOptions = {}): Promise<void> {
  let context: ResolvedPlaybookContext | undefined
  let apiState: CliApiClientState | null
  try {
    apiState = await requireApiState(options)
    if (!apiState) return
    context = await resolvePlaybookContext(options)
    context = await hydrateProjectScopeContext(apiState, options, context)
  } catch (error) {
    logError(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
    return
  }

  try {
    const records = filterPlaybookRecords(await loadPlaybooks(apiState, context, options), {
      scope: normalizeNonEmpty(options.scope) ?? 'project',
      area: options.area,
      durability: options.durability,
      reviewState: options.reviewState,
      tag: options.tag,
      limit: options.limit,
    })
    const result = buildProjectPlaybookSet(records, {
      projectSlug: context.projectSlug,
      reviewState: options.reviewState ? [options.reviewState] : undefined,
      durability: options.durability,
      limit: options.limit,
    })
    emitResult(
      options,
      'Hosted project playbook set loaded.',
      buildEnvelope({
        command: 'playbook.project-set',
        resolvedContext: context,
        input: compactPayload({ hostedFirst: true, scope: options.scope ?? 'project', reviewState: options.reviewState, limit: options.limit }),
        result,
      }),
      result,
    )
  } catch (error) {
    emitPlaybookCommandError({ options, command: 'playbook.project-set', resolvedContext: context, error })
  }
}

export async function runPlaybookPromote(options: PlaybookPromoteOptions = {}): Promise<void> {
  await runExperiencePromote({
    ...options,
    asPlaybook: true,
    playbookScope: normalizeNonEmpty(options.scope) ?? normalizeNonEmpty(options.playbookScope),
    playbookArea: normalizeNonEmpty(options.area) ?? normalizeNonEmpty(options.playbookArea),
  })
}

export function makePlaybookCommand(): Command {
  const cmd = new Command('playbook')
    .description('List reviewed playbooks projected from hosted Agentspace memory rules/constraints (server-first)')

  applyCommonOptions(cmd, { withAuth: false, withProject: true, withYes: true, withJson: true })
  applyProjectSlugOption(cmd)
  cmd.addHelpText(
    'after',
    `
Playbooks are prescriptive methods/patterns/rules stored as hosted memory items
and read server-first through the hosted playbook.list projection:
  Source of truth (hosted):
    agentspace.playbook.list (projects memory items kind=rule|constraint with meta.playbook)
  Storage contract:
    kind=rule|constraint, tags include playbook/playbook-scope:*, meta.playbook
  Local .aops is a read-only cache only; it is never read as truth or rewritten.

Experience stays descriptive. Promote reviewed experience into a playbook explicitly:
  aops-cli experience promote --id <experience-id> --as-playbook --playbook-area backend --apply --json
Operator alias:
  aops-cli playbook promote --id <experience-id> --area backend --review-state accepted --apply --json
`,
  )

  const list = cmd.command('list')
    .description('List hosted playbook projections')
    .option('--scope <scope>', 'Filter by playbook scope: session or project')
    .option('--area <area>', 'Filter by playbook area; repeatable', collectRepeatedOption, [])
    .option('--durability <durability>', 'Filter by memory durability; repeatable', collectRepeatedOption, [])
    .option('--review-state <state>', 'Filter by review state')
    .option('--tag <tag>', 'Filter by tag; repeatable', collectRepeatedOption, [])
    .option('--limit <n>', 'Limit result count', parseInteger)
    .action((options) => runPlaybookList({ ...cmd.opts(), ...options }))
  applyCommonOptions(list, { withAuth: false, withProject: true, withYes: true, withJson: true })
  applyProjectSlugOption(list)

  const get = cmd.command('get')
    .description('Get one hosted playbook projection')
    .requiredOption('--id <id>', 'Playbook id, memory id, or title prefix')
    .action((options) => runPlaybookGet({ ...cmd.opts(), ...options }))
  applyCommonOptions(get, { withAuth: false, withProject: true, withYes: true, withJson: true })
  applyProjectSlugOption(get)

  const show = cmd.command('show')
    .description('Render one hosted playbook as agent-readable markdown')
    .requiredOption('--id <id>', 'Playbook id, memory id, or title prefix')
    .action((options) => runPlaybookShow({ ...cmd.opts(), ...options }))
  applyCommonOptions(show, { withAuth: false, withProject: true, withYes: true, withJson: true })
  applyProjectSlugOption(show)

  const projectSet = cmd.command('project-set')
    .description('Load accepted sticky/durable project-scope playbooks for start/resume guidance')
    .option('--scope <scope>', 'Playbook scope (default: project)', 'project')
    .option('--area <area>', 'Filter by playbook area; repeatable', collectRepeatedOption, [])
    .option('--durability <durability>', 'Filter by memory durability; repeatable', collectRepeatedOption, [])
    .option('--review-state <state>', 'Filter by review state (default: accepted)', 'accepted')
    .option('--tag <tag>', 'Filter by tag; repeatable', collectRepeatedOption, [])
    .option('--limit <n>', 'Limit result count (default: 8)', parseInteger)
    .action((options) => runPlaybookProjectSet({ ...cmd.opts(), ...options }))
  applyCommonOptions(projectSet, { withAuth: false, withProject: true, withYes: true, withJson: true })
  applyProjectSlugOption(projectSet)

  const promote = cmd.command('promote')
    .description('Promote reviewed experience into a playbook memory rule/constraint')
    .requiredOption('--id <experience-id>', 'Experience id')
    .option('--kind <kind>', 'Memory kind: rule or constraint (default: rule)')
    .option('--durability <durability>', 'Memory durability: durable or sticky (default: durable)')
    .option('--content <text>', 'Reviewed promoted playbook content')
    .option('--tag <tag>', 'Extra memory tag; repeatable', collectRepeatedOption, [])
    .option('--playbook-id <id>', 'Stable playbook id (default: experience id)')
    .option('--scope <scope>', 'Playbook scope: session or project (default: project)')
    .option('--playbook-scope <scope>', 'Compatibility alias for --scope')
    .option('--area <area>', 'Playbook area tag, such as backend or hexagen')
    .option('--playbook-area <area>', 'Compatibility alias for --area')
    .option('--applies-when <text>', 'When this playbook should be applied')
    .option('--step <text>', 'Playbook step; repeatable (default: experience commands)', collectRepeatedOption, [])
    .option('--enforcement <level>', 'Playbook enforcement: advisory | soft-preflight | strict-opt-in')
    .option('--review-state <state>', 'Playbook review state: proposed | accepted | superseded | archived')
    .option('--supersedes <id>', 'Older playbook id this one supersedes')
    .option('--preview', 'Preview the hosted promotion without applying')
    .option('--apply', 'Write the memory item')
    .option('--idempotency-key <key>', 'Idempotency key for the hosted write')
    .action((options) => runPlaybookPromote({ ...cmd.opts(), ...options }))
  applyCommonOptions(promote, { withAuth: false, withProject: true, withYes: true, withJson: true })
  applyProjectSlugOption(promote)

  return cmd
}
