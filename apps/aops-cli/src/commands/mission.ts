import { Command } from 'commander'
import { logError, logSuccess } from '@aopslab/xf-cli-ui'

import { applyCommonOptions, compactPayload, normalizeNonEmpty } from '../utils/command.js'
import { loadAopsRepoConfigReadOnly } from '../utils/repo-config.js'
import {
  buildReadOnlyActivePlaybookNudgePackFromContext,
  type ActivePlaybookNudgePack,
} from '../utils/playbook-workspace.js'
import {
  buildSessionGuidancePack,
  type SessionGuidanceDisciplineInput,
  type SessionGuidancePack,
} from '../utils/session-guidance.js'
import {
  invokeHostedToolWithApiState,
  parseJsonInput,
  requireApiState,
  resolveAgentGatewayContext,
  unwrapHostedToolResult,
  type AgentGatewayContextOptions,
} from '../utils/agent-gateway.js'
import {
  buildHostedSugarEnvelope,
  ensureGuardedWrite,
  missingScopeIdMessage,
} from '../utils/hosted-sugar.js'

type GuardedWriteOptions = {
  apply?: boolean
  preview?: boolean
  idempotencyKey?: string
}

export type MissionBaseOptions = AgentGatewayContextOptions & {
  scopeId?: string
  scopeResolution?: 'explicit' | 'cascade'
}

export type MissionCreateOptions = MissionBaseOptions & GuardedWriteOptions & {
  input?: string
  slug?: string
  status?: string
  objective?: string
  taskDefinition?: string
  successCriterion?: string[]
  constraint?: string[]
  policyJson?: string
  rolesJson?: string
  referenceJson?: string[]
  visionDoc?: string
  activePlan?: string
  body?: string
}

export type MissionListOptions = MissionBaseOptions & {
  status?: string
  slug?: string
  limit?: string | number
  summary?: boolean
}

export type MissionGetOptions = MissionBaseOptions & {
  id?: string
}

export type MissionUpdateOptions = MissionBaseOptions & GuardedWriteOptions & {
  id?: string
  input?: string
  status?: string
  objective?: string
  activePlan?: string
}

export type MissionResumeOptions = MissionBaseOptions & {
  id?: string
  depth?: string
  limit?: string | number
  full?: boolean
  summary?: boolean
}

type ResolvedMissionContext = Awaited<ReturnType<typeof resolveAgentGatewayContext>>

export type LoadedMissionResumePack = {
  command: 'mission.resume'
  toolId: 'agentspace.mission.resume'
  input: Record<string, unknown>
  resolvedContext: Record<string, unknown>
  result: unknown
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function toRecordArray(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) return value.filter(isRecord)
  return []
}

function toStringArray(values: unknown): string[] {
  return Array.isArray(values)
    ? values.map((entry) => normalizeNonEmpty(entry)).filter((entry): entry is string => Boolean(entry))
    : []
}

function collectRepeatedOption(value: string, previous: string[] = []): string[] {
  const normalized = normalizeNonEmpty(value)
  return normalized ? [...previous, normalized] : previous
}

function parsePositiveInteger(value: unknown, label: string): number | undefined {
  if (value === undefined || value === null || value === '') return undefined
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) return value
  const normalized = normalizeNonEmpty(value)
  if (!normalized) return undefined
  const parsed = Number.parseInt(normalized, 10)
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`${label} must be a positive integer.`)
  return parsed
}

function parseJsonObject(value: unknown, label: string): Record<string, unknown> | undefined {
  const normalized = normalizeNonEmpty(value)
  if (!normalized) return undefined
  const parsed = parseJsonInput(normalized, label)
  if (!isRecord(parsed)) throw new Error(`${label} must be a JSON object or @file.json object.`)
  return parsed
}

function parseJsonRecordArray(values: unknown, label: string): Record<string, unknown>[] | undefined {
  const strings = toStringArray(values)
  if (strings.length === 0) return undefined
  return strings.map((entry, index) => {
    const parsed = parseJsonInput(entry, `${label}[${index}]`)
    if (!isRecord(parsed)) throw new Error(`${label}[${index}] must be a JSON object or @file.json object.`)
    return parsed
  })
}

function unwrapResultData<T>(result: unknown): T | undefined {
  if (isRecord(result) && Object.prototype.hasOwnProperty.call(result, 'data')) return result.data as T
  return result as T
}

function requireMissionId(id: unknown): string {
  const normalized = normalizeNonEmpty(id)
  if (!normalized) throw new Error('Provide --id.')
  return normalized
}

function requireScopeId(context: ResolvedMissionContext, seed: Record<string, unknown>): string {
  const scopeId = normalizeNonEmpty(context.scopeId) ?? normalizeNonEmpty(seed.scopeId)
  if (!scopeId) throw new Error(missingScopeIdMessage('Mission create'))
  return scopeId
}

function buildResolvedContextRecord(context: ResolvedMissionContext): Record<string, unknown> {
  return compactPayload({
    tenantId: context.tenantId,
    scopeId: context.scopeId,
    projectId: context.projectId,
    projectName: context.projectName,
    scopeResolution: context.scopeResolution,
  })
}

function missionRef(refType: string, refId: string, title?: string): Record<string, unknown> {
  return compactPayload({ refType, refId, title })
}

function buildMissionCreateData(options: MissionCreateOptions, context: ResolvedMissionContext): Record<string, unknown> {
  const seed = parseJsonObject(options.input, '--input') ?? {}
  const data = isRecord(seed.data) ? { ...seed.data } : { ...seed }
  const scopeId = requireScopeId(context, data)
  const objective = normalizeNonEmpty(options.objective) ?? normalizeNonEmpty(data.objective)
  if (!objective) throw new Error('Provide --objective or --input with objective.')

  return compactPayload({
    ...data,
    scopeId,
    slug: normalizeNonEmpty(options.slug) ?? normalizeNonEmpty(data.slug),
    status: normalizeNonEmpty(options.status) ?? normalizeNonEmpty(data.status),
    objective,
    taskDefinition: normalizeNonEmpty(options.taskDefinition) ?? normalizeNonEmpty(data.taskDefinition),
    successCriteria: toStringArray(options.successCriterion).length > 0 ? toStringArray(options.successCriterion) : data.successCriteria,
    constraints: toStringArray(options.constraint).length > 0 ? toStringArray(options.constraint) : data.constraints,
    policy: parseJsonObject(options.policyJson, '--policy-json') ?? data.policy,
    roles: parseJsonObject(options.rolesJson, '--roles-json') ?? data.roles,
    references: parseJsonRecordArray(options.referenceJson, '--reference-json') ?? data.references,
    visionDocRef: normalizeNonEmpty(options.visionDoc) ? missionRef('docman.document', normalizeNonEmpty(options.visionDoc) as string) : data.visionDocRef,
    activeImplementationPlanRef: normalizeNonEmpty(options.activePlan)
      ? missionRef('projectman.sprint', normalizeNonEmpty(options.activePlan) as string)
      : data.activeImplementationPlanRef,
    bodyMarkdown: normalizeNonEmpty(options.body) ?? normalizeNonEmpty(data.bodyMarkdown),
  })
}

function buildMissionPatch(options: MissionUpdateOptions): Record<string, unknown> {
  const seed = parseJsonObject(options.input, '--input') ?? {}
  const patch = isRecord(seed.patch) ? { ...seed.patch } : { ...seed }
  return compactPayload({
    ...patch,
    status: normalizeNonEmpty(options.status) ?? normalizeNonEmpty(patch.status),
    objective: normalizeNonEmpty(options.objective) ?? normalizeNonEmpty(patch.objective),
    activeImplementationPlanRef: normalizeNonEmpty(options.activePlan)
      ? missionRef('projectman.sprint', normalizeNonEmpty(options.activePlan) as string)
      : patch.activeImplementationPlanRef,
  })
}

function summarizeText(value: unknown, maxLength = 180): string | undefined {
  const normalized = normalizeNonEmpty(value)
  if (!normalized) return undefined
  const compact = normalized.replace(/\s+/g, ' ').trim()
  return compact.length <= maxLength ? compact : `${compact.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`
}

function summarizeRecord(value: unknown): Record<string, unknown> | undefined {
  if (!isRecord(value)) return undefined
  return compactPayload({
    id: normalizeNonEmpty(value.id) ?? normalizeNonEmpty(value.localId),
    title: normalizeNonEmpty(value.title) ?? normalizeNonEmpty(value.name),
    status: normalizeNonEmpty(value.status),
    kind: normalizeNonEmpty(value.kind) ?? normalizeNonEmpty(value.entityType),
    summary: summarizeText(value.summary ?? value.content ?? value.description),
    ref: normalizeNonEmpty(value.ref) ?? normalizeNonEmpty(value.uri),
  })
}

function summarizeRecords(value: unknown, limit: number): Record<string, unknown>[] {
  return toRecordArray(value).slice(0, limit).map(summarizeRecord).filter((entry): entry is Record<string, unknown> => Boolean(entry))
}

function summarizeCheckpoint(value: unknown): Record<string, unknown> | undefined {
  if (!isRecord(value)) return undefined
  return compactPayload({
    id: normalizeNonEmpty(value.id),
    kind: normalizeNonEmpty(value.kind),
    checkpointAs: normalizeNonEmpty(value.checkpointAs),
    current: typeof value.current === 'boolean' ? value.current : undefined,
    superseded: typeof value.superseded === 'boolean' ? value.superseded : undefined,
    supersedes: normalizeNonEmpty(value.supersedes),
    summary: summarizeText(value.summary, 220),
    position: summarizeText(value.position, 160),
    doneWork: toStringArray(value.doneWork).slice(0, 5),
    nextSteps: toStringArray(value.nextSteps).slice(0, 5),
    sourceRefs: Array.isArray(value.sourceRefs) ? value.sourceRefs.slice(0, 5) : undefined,
    anchors: value.anchors,
    createdAt: normalizeNonEmpty(value.createdAt),
    updatedAt: normalizeNonEmpty(value.updatedAt),
  })
}

function summarizeCheckpointRecords(value: unknown, limit: number): Record<string, unknown>[] {
  return toRecordArray(value).slice(0, limit).map(summarizeCheckpoint).filter((entry): entry is Record<string, unknown> => Boolean(entry))
}

function summarizeCheckpoints(value: unknown, limit: number): Record<string, unknown> | undefined {
  if (!isRecord(value)) return undefined
  const current = summarizeCheckpoint(value.current)
  const recent = summarizeCheckpointRecords(value.recent, Math.min(limit, 5))
  const total = typeof value.total === 'number' ? value.total : undefined
  if (!current && recent.length === 0 && total === undefined) return undefined
  return compactPayload({ current, recent, total })
}

export function buildMissionResumeInput(options: MissionResumeOptions): Record<string, unknown> {
  const id = requireMissionId(options.id)
  return compactPayload({
    id,
    options: compactPayload({
      depth: normalizeNonEmpty(options.depth) ?? 'light',
      limit: parsePositiveInteger(options.limit, '--limit') ?? 8,
    }),
  })
}

export function summarizeMissionResumePack(
  result: unknown,
  options: MissionResumeOptions,
  playbookNudges?: ActivePlaybookNudgePack,
  sessionGuidance?: SessionGuidancePack,
): unknown {
  const pack = unwrapResultData<Record<string, unknown>>(result)
  if (!isRecord(pack)) return result
  const limit = parsePositiveInteger(options.limit, '--limit') ?? 8
  const mission = isRecord(pack.mission) ? pack.mission : {}
  const activePlan = isRecord(pack.activePlan) ? pack.activePlan : {}
  const chat = isRecord(pack.chat) ? pack.chat : {}
  const refs = Array.isArray(mission.refs) ? mission.refs.slice(0, limit) : []

  return compactPayload({
    schemaVersion: pack.schemaVersion,
    generatedAt: normalizeNonEmpty(pack.generatedAt),
    mission: compactPayload({
      id: normalizeNonEmpty(mission.id),
      slug: normalizeNonEmpty(mission.slug),
      objective: summarizeText(mission.objective, 240),
      status: normalizeNonEmpty(mission.status),
      policy: isRecord(mission.policy) ? mission.policy : undefined,
      refs,
      refCount: Array.isArray(mission.refs) ? mission.refs.length : undefined,
    }),
    activePlan: compactPayload({
      sprintId: normalizeNonEmpty(activePlan.sprintId),
      ref: activePlan.ref,
      currentSlice: activePlan.currentSlice,
      nextSlice: activePlan.nextSlice,
      progress: activePlan.progress,
    }),
    memory: summarizeRecords(pack.memory, limit),
    checkpoints: summarizeCheckpoints(pack.checkpoints, limit),
    reviews: summarizeRecords(pack.reviews, limit),
    issues: summarizeRecords(pack.issues, limit),
    chat: compactPayload({
      unread: typeof chat.unread === 'number' ? chat.unread : 0,
      lastN: summarizeRecords(chat.lastN, Math.min(limit, 5)),
    }),
    playbookNudges,
    sessionGuidance,
    summary: {
      mode: 'mission-resume-summary',
      readStrategy: 'mission-deterministic-compact',
      limit,
      fullRecordHint: 'Use `aops-cli mission resume --id <mission-id> --full --json` for the full hosted resume skeleton.',
    },
  })
}

async function loadMissionResumePlaybookNudges(
  options: MissionResumeOptions,
  missionId: string,
): Promise<ActivePlaybookNudgePack | undefined> {
  try {
    const loaded = await loadAopsRepoConfigReadOnly(process.cwd())
    const activeProject = loaded.config?.projects?.find(
      (project) => project.name === loaded.config?.activeProjectName
    )
    const projectSlug = normalizeNonEmpty((options as Record<string, unknown>).projectSlug)
      ?? normalizeNonEmpty(activeProject?.slug)
      ?? normalizeNonEmpty(activeProject?.name)
    return await buildReadOnlyActivePlaybookNudgePackFromContext({
      repoRoot: loaded.rootDir,
      localRoot: activeProject?.localRoot,
      projectSlug,
    }, {
      missionId,
      limit: parsePositiveInteger(options.limit, '--limit') ?? 8,
    })
  } catch {
    return undefined
  }
}

function sessionGuidanceDisciplineFromPolicy(policy: unknown): SessionGuidanceDisciplineInput | undefined {
  if (!isRecord(policy)) return undefined
  const discipline = isRecord(policy.discipline) ? policy.discipline : {}
  const guardrails = toRecordArray(policy.guardrails).map((guardrail) => ({
    id: normalizeNonEmpty(guardrail.id),
    title: normalizeNonEmpty(guardrail.title),
    description: normalizeNonEmpty(guardrail.description),
    phase: normalizeNonEmpty(guardrail.phase),
    evidence: toStringArray(guardrail.evidence),
    enforcementLevel: normalizeNonEmpty(guardrail.enforcementLevel),
  }))
  return {
    selected: normalizeNonEmpty(discipline.id),
    recommended: normalizeNonEmpty(discipline.recommended),
    explicit: normalizeNonEmpty(discipline.selectedBy) === 'operator',
    profile: {
      id: normalizeNonEmpty(discipline.id),
      version: normalizeNonEmpty(discipline.version),
    },
    guardrails,
  }
}

async function loadMissionResumeSessionGuidance(
  options: MissionResumeOptions,
  missionId: string,
  rawResult: unknown,
  playbookNudges?: ActivePlaybookNudgePack,
): Promise<SessionGuidancePack | undefined> {
  try {
    const loaded = await loadAopsRepoConfigReadOnly(process.cwd())
    const activeProject = loaded.config?.projects?.find(
      (project) => project.name === loaded.config?.activeProjectName
    )
    const projectSlug = normalizeNonEmpty((options as Record<string, unknown>).projectSlug)
      ?? normalizeNonEmpty(activeProject?.slug)
      ?? normalizeNonEmpty(activeProject?.name)
    const pack = unwrapResultData<Record<string, unknown>>(rawResult)
    const mission = isRecord(pack?.mission) ? pack.mission : {}
    const activePlan = isRecord(pack?.activePlan) ? pack.activePlan : {}
    return await buildSessionGuidancePack({
      repoRoot: loaded.rootDir,
      localRoot: activeProject?.localRoot,
      projectSlug,
    }, {
      surface: 'mission-resume',
      task: normalizeNonEmpty(mission.objective),
      missionId,
      planId: normalizeNonEmpty(activePlan.sprintId),
      playbookNudges,
      discipline: sessionGuidanceDisciplineFromPolicy(mission.policy),
    })
  } catch {
    return undefined
  }
}

export async function loadMissionResumePack(options: MissionResumeOptions = {}): Promise<LoadedMissionResumePack | null> {
  const input = buildMissionResumeInput(options)
  const missionId = normalizeNonEmpty(input.id) ?? requireMissionId(options.id)
  const apiState = await requireApiState(options)
  if (!apiState) return null
  const context = await resolveAgentGatewayContext(options)
  const payload = await invokeHostedToolWithApiState(apiState, {
    ...options,
    scopeId: context.scopeId,
    projectId: context.projectId,
    projectName: context.projectName,
    toolId: 'agentspace.mission.resume',
    input,
  })
  const rawResult = unwrapHostedToolResult(payload)
  const playbookNudges = await loadMissionResumePlaybookNudges(options, missionId)
  const sessionGuidance = options.full === true
    ? undefined
    : await loadMissionResumeSessionGuidance(options, missionId, rawResult, playbookNudges)
  return {
    command: 'mission.resume',
    toolId: 'agentspace.mission.resume',
    input,
    resolvedContext: buildResolvedContextRecord(context),
    result: options.full === true
      ? rawResult
      : summarizeMissionResumePack(rawResult, options, playbookNudges, sessionGuidance),
  }
}

async function invokeMissionTool(
  options: MissionBaseOptions & GuardedWriteOptions,
  params: {
    command: string
    toolId: string
    input: Record<string, unknown>
    preview?: boolean
    apply?: boolean
    successText: string
    transform?: (result: unknown) => unknown
  },
): Promise<void> {
  const apiState = await requireApiState(options)
  if (!apiState) return
  const context = await resolveAgentGatewayContext(options)
  const payload = await invokeHostedToolWithApiState(apiState, {
    ...options,
    scopeId: context.scopeId,
    projectId: context.projectId,
    projectName: context.projectName,
    toolId: params.toolId,
    input: params.input,
    preview: params.preview ?? options.preview,
    apply: params.apply ?? options.apply,
    idempotencyKey: options.idempotencyKey,
  })
  const rawResult = unwrapHostedToolResult(payload)
  const result = params.transform ? params.transform(rawResult) : rawResult

  if (options.json) {
    console.log(JSON.stringify(buildHostedSugarEnvelope({
      command: params.command,
      toolId: params.toolId,
      resolvedContext: buildResolvedContextRecord(context),
      input: params.input,
      result,
    }), null, 2))
    return
  }

  logSuccess(params.successText)
  console.log(JSON.stringify(result, null, 2))
}

export async function runMissionCreate(options: MissionCreateOptions = {}): Promise<void> {
  try {
    ensureGuardedWrite(options, 'This command mutates hosted mission state.')
    const apiState = await requireApiState(options)
    if (!apiState) return
    const context = await resolveAgentGatewayContext(options)
    const data = buildMissionCreateData(options, context)
    const payload = await invokeHostedToolWithApiState(apiState, {
      ...options,
      scopeId: context.scopeId,
      projectId: context.projectId,
      projectName: context.projectName,
      toolId: 'agentspace.mission.create',
      input: { data },
      preview: options.preview,
      apply: options.apply,
      idempotencyKey: options.idempotencyKey,
    })
    const result = unwrapHostedToolResult(payload)
    if (options.json) {
      console.log(JSON.stringify(buildHostedSugarEnvelope({
        command: 'mission.create',
        toolId: 'agentspace.mission.create',
        resolvedContext: buildResolvedContextRecord(context),
        input: { data },
        result,
      }), null, 2))
      return
    }
    logSuccess('Mission created.')
    console.log(JSON.stringify(result, null, 2))
  } catch (error) {
    logError(`Failed to execute mission create: ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 1
  }
}

export async function runMissionList(options: MissionListOptions = {}): Promise<void> {
  try {
    const filter = compactPayload({
      scopeId: normalizeNonEmpty(options.scopeId),
      scopeResolution: normalizeNonEmpty(options.scopeResolution),
      status: normalizeNonEmpty(options.status),
      slug: normalizeNonEmpty(options.slug),
    })
    await invokeMissionTool(options, {
      command: 'mission.list',
      toolId: 'agentspace.mission.list',
      input: compactPayload({ filter, options: compactPayload({ limit: parsePositiveInteger(options.limit, '--limit') }) }),
      successText: 'Missions listed.',
      transform: (result) => {
        if (!options.summary) return result
        const rows = toRecordArray(unwrapResultData(result)).slice(0, parsePositiveInteger(options.limit, '--limit') ?? 20)
        return {
          data: rows.map((row) => compactPayload({
            id: normalizeNonEmpty(row.id),
            slug: normalizeNonEmpty(row.slug),
            objective: summarizeText(row.objective, 160),
            status: normalizeNonEmpty(row.status),
            activePlan: row.activeImplementationPlanRef,
          })),
          summary: { mode: 'mission-list-summary', shown: rows.length },
        }
      },
    })
  } catch (error) {
    logError(`Failed to execute mission list: ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 1
  }
}

export async function runMissionGet(options: MissionGetOptions = {}): Promise<void> {
  try {
    const id = requireMissionId(options.id)
    await invokeMissionTool(options, {
      command: 'mission.get',
      toolId: 'agentspace.mission.get',
      input: { id },
      successText: 'Mission loaded.',
    })
  } catch (error) {
    logError(`Failed to execute mission get: ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 1
  }
}

export async function runMissionUpdate(options: MissionUpdateOptions = {}): Promise<void> {
  try {
    ensureGuardedWrite(options, 'This command mutates hosted mission state.')
    const id = requireMissionId(options.id)
    const patch = buildMissionPatch(options)
    if (Object.keys(patch).length === 0) throw new Error('Provide at least one patch field.')
    await invokeMissionTool(options, {
      command: 'mission.update',
      toolId: 'agentspace.mission.update',
      input: { id, patch },
      successText: 'Mission updated.',
    })
  } catch (error) {
    logError(`Failed to execute mission update: ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 1
  }
}

export async function runMissionResume(options: MissionResumeOptions = {}): Promise<void> {
  try {
    const loaded = await loadMissionResumePack(options)
    if (!loaded) return
    if (options.json) {
      console.log(JSON.stringify(buildHostedSugarEnvelope({
        command: loaded.command,
        toolId: loaded.toolId,
        resolvedContext: loaded.resolvedContext,
        input: loaded.input,
        result: loaded.result,
      }), null, 2))
      return
    }
    logSuccess('Mission resume pack built.')
    console.log(JSON.stringify(loaded.result, null, 2))
  } catch (error) {
    logError(`Failed to execute mission resume: ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 1
  }
}

function addMissionContextOptions(cmd: Command): Command {
  applyCommonOptions(cmd, { withProject: true })
  cmd.option('--scope-id <id>', 'Canonical owner scope override')
  cmd.option('--scope-resolution <mode>', 'Scope resolution for hosted reads: explicit | cascade')
  cmd.option('--tenant-id <id>', 'Tenant id header (x-tenant-id)')
  cmd.option('--locale <locale>', 'Locale header (x-locale)')
  cmd.option('--fallback-locale <locale>', 'Fallback locale header (x-fallback-locale)')
  return cmd
}

export function makeMissionCommand(): Command {
  const cmd = new Command('mission')
    .description('Agentspace mission commands and token-efficient mission resume packs')

  addMissionContextOptions(cmd.command('create')
    .description('Create a hosted Agentspace mission')
    .option('--input <json-or-@file>', 'Mission data JSON object; may be wrapped as { data }')
    .option('--slug <slug>', 'Mission slug')
    .option('--status <status>', 'Mission status: draft | active | completed | archived')
    .option('--objective <text>', 'Mission objective')
    .option('--task-definition <text>', 'Task definition')
    .option('--success-criterion <text>', 'Repeatable success criterion', collectRepeatedOption, [])
    .option('--constraint <text>', 'Repeatable constraint', collectRepeatedOption, [])
    .option('--policy-json <json-or-@file>', 'Mission policy JSON object')
    .option('--roles-json <json-or-@file>', 'Mission roles JSON object')
    .option('--reference-json <json-or-@file>', 'Repeatable mission ref JSON object', collectRepeatedOption, [])
    .option('--vision-doc <id>', 'Docman document id to store as visionDocRef')
    .option('--active-plan <sprint-id>', 'Projectman sprint/implementation-plan id to store as activeImplementationPlanRef')
    .option('--body <markdown>', 'Mission body markdown')
    .option('--preview', 'Validate without mutating hosted state')
    .option('--apply', 'Apply hosted mission mutation')
    .option('--idempotency-key <key>', 'Optional guarded-write idempotency key'),
  ).action(async (options: MissionCreateOptions) => runMissionCreate(options))

  addMissionContextOptions(cmd.command('list')
    .description('List hosted Agentspace missions')
    .option('--status <status>', 'Filter by mission status')
    .option('--slug <slug>', 'Filter by slug')
    .option('--limit <n>', 'Limit returned missions')
    .option('--summary', 'Print compact mission records'),
  ).action(async (options: MissionListOptions) => runMissionList(options))

  addMissionContextOptions(cmd.command('get')
    .description('Get a hosted Agentspace mission by id')
    .requiredOption('--id <id>', 'Mission id'),
  ).action(async (options: MissionGetOptions) => runMissionGet(options))

  addMissionContextOptions(cmd.command('update')
    .description('Patch a hosted Agentspace mission')
    .requiredOption('--id <id>', 'Mission id')
    .option('--input <json-or-@file>', 'Mission patch JSON object; may be wrapped as { patch }')
    .option('--status <status>', 'Mission status')
    .option('--objective <text>', 'Mission objective')
    .option('--active-plan <sprint-id>', 'Projectman sprint/implementation-plan id')
    .option('--preview', 'Validate without mutating hosted state')
    .option('--apply', 'Apply hosted mission mutation')
    .option('--idempotency-key <key>', 'Optional guarded-write idempotency key'),
  ).action(async (options: MissionUpdateOptions) => runMissionUpdate(options))

  addMissionContextOptions(cmd.command('resume')
    .description('Build a deterministic, token-efficient mission resume pack')
    .requiredOption('--id <id>', 'Mission id')
    .option('--depth <depth>', 'Resume depth: light | standard', 'light')
    .option('--limit <n>', 'Maximum refs/rows to include in compact sections', '8')
    .option('--full', 'Return the full hosted mission resume skeleton instead of the compact summary')
    .option('--summary', 'Kept for parity; compact summary is the default'),
  ).action(async (options: MissionResumeOptions) => runMissionResume(options))

  cmd.addHelpText('after', `
Notes:
  Mission is Agentspace-owned durable intent and policy. Projectman remains execution/review truth.
  mission.resume defaults to a compact, token-efficient schemaVersion 1 pack; use --full only when the raw hosted skeleton is needed.
  mission handoff is intentionally deferred in this slice; use Projectman handoff or mem summary for handoff records.
  activeImplementationPlanRef is a Projectman sprint-backed implementation-plan ref; the plan id is the sprint id.
`)

  return cmd
}
