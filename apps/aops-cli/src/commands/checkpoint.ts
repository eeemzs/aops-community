import { readFileSync } from 'node:fs'
import { Command } from 'commander'
import { logSuccess } from '@aopslab/xf-cli-ui'

import { compactPayload, normalizeNonEmpty } from '../utils/command.js'
import {
  resolveOwnerScopeIdFromBinding,
  resolveProjectBindingContext,
  type ProjectBindingContextOptions,
  type ResolvedProjectBindingContext,
} from '../utils/project-context.js'
import {
  createNewLocalMemoryEntry,
  readLocalMemoryEntries,
  rebuildLocalMemoryWorkspace,
  resolveMemoryWorkspacePaths,
  writeLocalMemoryEntryFile,
  type MemoryWorkspaceEntry,
} from '../utils/memory-workspace.js'

const REPO_FIRST_CHECKPOINT_TOOL_ID = 'repo-first.checkpoint'
const CHECKPOINT_SCHEMA_VERSION = 1
const MISSION_SUBJECT_TYPE = 'agentspace.mission'
const PROJECT_SUBJECT_TYPE = 'projectman.plan'

type GuardedWriteOptions = {
  preview?: boolean
  apply?: boolean
  confirm?: boolean
  idempotencyKey?: string
}

type CheckpointContextOptions = ProjectBindingContextOptions & {
  scopeId?: string
  projectSlug?: string
  fileBased?: boolean
  hosted?: boolean
}

export type CheckpointCreateOptions = CheckpointContextOptions & GuardedWriteOptions & {
  summary?: string
  position?: string
  doneWork?: string[]
  nextStep?: string[]
  content?: string
  sourceRef?: string[]
  nextReadRef?: string[]
  missionId?: string
  missionSlug?: string
  sessionId?: string
  agent?: string
  subjectType?: string
  subjectId?: string
  subjectTitle?: string
  taskId?: string
  kanbanTaskId?: string
  sprintId?: string
  phaseId?: string
  utaskId?: string
  microtaskId?: string
  issueId?: string
  feedbackId?: string
  tag?: string[]
  importance?: number
  nextAction?: string
  validationState?: string
  supersede?: string
  json?: boolean
}

export type CheckpointListOptions = CheckpointContextOptions & {
  missionId?: string
  subjectType?: string
  subjectId?: string
  current?: boolean
  timeline?: boolean
  includeLegacy?: boolean
  limit?: number
  json?: boolean
}

export type CheckpointGetOptions = CheckpointContextOptions & {
  id?: string
  current?: boolean
  missionId?: string
  subjectType?: string
  subjectId?: string
  full?: boolean
  includeLegacy?: boolean
  json?: boolean
}

type CheckpointSubject = {
  subjectType?: string
  subjectId?: string
  subjectTitle?: string
}

type CheckpointState = {
  supersededIds: Set<string>
  currentIds: Set<string>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.map((entry) => normalizeNonEmpty(entry)).filter((entry): entry is string => Boolean(entry))
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

function collectRepeatedOption(value: string, previous: string[] = []): string[] {
  return [...previous, value]
}

function expandAtFileContent(value: unknown): string | undefined {
  const normalized = normalizeNonEmpty(value)
  if (!normalized) return undefined
  if (!normalized.startsWith('@')) return normalized
  const filePath = normalized.slice(1)
  if (!filePath) throw new Error('Content file pointer cannot be empty.')
  return readFileSync(filePath, 'utf8')
}

function parseRefValue(value: string, flagName: string): unknown {
  const expanded = expandAtFileContent(value)
  const normalized = normalizeNonEmpty(expanded)
  if (!normalized) return undefined
  if (!normalized.startsWith('{') && !normalized.startsWith('[')) return normalized
  try {
    return JSON.parse(normalized)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`${flagName} must be a string, JSON object/array, or @file.json with valid JSON: ${message}`)
  }
}

function parseRefValues(values: unknown, flagName: string): unknown[] {
  return toStringArray(values)
    .map((value) => parseRefValue(value, flagName))
    .flatMap((value) => (Array.isArray(value) ? value : [value]))
    .filter((value) => value !== undefined)
}

function memoryEntryId(entry: MemoryWorkspaceEntry): string | undefined {
  return normalizeNonEmpty(entry.memoryId) ?? normalizeNonEmpty(entry.id)
}

function checkpointAs(entry: MemoryWorkspaceEntry): string | undefined {
  const rawValue = normalizeNonEmpty(entry.raw?.checkpointAs)
  if (rawValue) return rawValue
  return (entry.kind ?? '').toLowerCase() === 'checkpoint' ? 'session' : undefined
}

function entryTags(entry: MemoryWorkspaceEntry): Set<string> {
  return new Set(toStringArray(entry.tags).map((value) => value.toLowerCase()))
}

function isCheckpointEntry(entry: MemoryWorkspaceEntry, includeLegacy = true): boolean {
  const kind = (entry.kind ?? '').toLowerCase()
  const asValue = checkpointAs(entry)
  if (asValue === 'milestone') return false
  if (kind === 'checkpoint') return true
  return includeLegacy && entryTags(entry).has('memory:checkpoint')
}

function sameSubject(entry: MemoryWorkspaceEntry, subject: CheckpointSubject): boolean {
  const subjectType = normalizeNonEmpty(subject.subjectType)
  const subjectId = normalizeNonEmpty(subject.subjectId)
  if (subjectType && normalizeNonEmpty(entry.subjectType) !== subjectType) return false
  if (subjectId && normalizeNonEmpty(entry.subjectId) !== subjectId) return false
  return true
}

function subjectKey(entry: Pick<MemoryWorkspaceEntry, 'subjectType' | 'subjectId'>): string {
  return `${normalizeNonEmpty(entry.subjectType) ?? 'subject'}::${normalizeNonEmpty(entry.subjectId) ?? 'unknown'}`
}

function buildSupersededIdSet(entries: MemoryWorkspaceEntry[]): Set<string> {
  const superseded = new Set<string>()
  for (const entry of entries) {
    const supersedes = normalizeNonEmpty(entry.raw?.supersedes)
    if (supersedes) superseded.add(supersedes)
  }
  return superseded
}

function buildCheckpointState(entries: MemoryWorkspaceEntry[], includeLegacy = true): CheckpointState {
  const checkpoints = entries.filter((entry) => isCheckpointEntry(entry, includeLegacy))
  const supersededIds = buildSupersededIdSet(checkpoints)
  const currentIds = new Set<string>()
  const seenSubjects = new Set<string>()
  for (const entry of checkpoints) {
    const id = memoryEntryId(entry)
    if (!id || supersededIds.has(id)) continue
    const key = subjectKey(entry)
    if (seenSubjects.has(key)) continue
    seenSubjects.add(key)
    currentIds.add(id)
  }
  return { supersededIds, currentIds }
}

function resolveCheckpointSubject(
  options: Pick<CheckpointCreateOptions, 'missionId' | 'missionSlug' | 'subjectType' | 'subjectId' | 'subjectTitle'>,
  context: ResolvedProjectBindingContext,
): Required<CheckpointSubject> {
  const missionId = normalizeNonEmpty(options.missionId)
  if (missionId) {
    return {
      subjectType: MISSION_SUBJECT_TYPE,
      subjectId: missionId,
      subjectTitle: normalizeNonEmpty(options.missionSlug) ?? `mission:${missionId}`,
    }
  }

  const subjectId = normalizeNonEmpty(options.subjectId) ?? resolveOwnerScopeIdFromBinding(context) ?? normalizeNonEmpty(context.projectId)
  if (!subjectId) {
    throw new Error('Checkpoint subject could not be resolved. Provide --mission-id, --subject-id, --project-id, or repo config.')
  }
  return {
    subjectType: normalizeNonEmpty(options.subjectType) ?? PROJECT_SUBJECT_TYPE,
    subjectId,
    subjectTitle: normalizeNonEmpty(options.subjectTitle) ?? normalizeNonEmpty(context.projectName) ?? `project:${subjectId}`,
  }
}

function resolveReadSubject(options: Pick<CheckpointListOptions, 'missionId' | 'subjectType' | 'subjectId'>): CheckpointSubject | undefined {
  const missionId = normalizeNonEmpty(options.missionId)
  if (missionId) return { subjectType: MISSION_SUBJECT_TYPE, subjectId: missionId }
  const subjectType = normalizeNonEmpty(options.subjectType)
  const subjectId = normalizeNonEmpty(options.subjectId)
  if (!subjectType && !subjectId) return undefined
  return { subjectType, subjectId }
}

function resolveCurrentReadSubject(
  options: Pick<CheckpointGetOptions, 'missionId' | 'subjectType' | 'subjectId'>,
  context: ResolvedProjectBindingContext,
): CheckpointSubject {
  const explicit = resolveReadSubject(options)
  if (explicit) return explicit
  return resolveCheckpointSubject({}, context)
}

function buildLinkedIds(options: CheckpointCreateOptions): Record<string, string | undefined> {
  return compactPayload({
    kanbanTaskId: normalizeNonEmpty(options.kanbanTaskId) ?? normalizeNonEmpty(options.taskId),
    sprintId: normalizeNonEmpty(options.sprintId),
    phaseId: normalizeNonEmpty(options.phaseId),
    microtaskId: normalizeNonEmpty(options.microtaskId) ?? normalizeNonEmpty(options.utaskId),
    issueId: normalizeNonEmpty(options.issueId),
    feedbackId: normalizeNonEmpty(options.feedbackId),
  }) as Record<string, string | undefined>
}

function buildCheckpointContent(options: CheckpointCreateOptions): string {
  const summary = normalizeNonEmpty(options.summary)
  if (!summary) throw new Error('Provide --summary for checkpoint create.')

  const position = normalizeNonEmpty(options.position)
  const doneWork = toStringArray(options.doneWork)
  const nextSteps = toStringArray(options.nextStep)
  const notes = normalizeNonEmpty(expandAtFileContent(options.content))
  const lines = ['# Checkpoint', '', '## Summary', summary, '']
  if (position) lines.push('## Position', position, '')
  if (doneWork.length > 0) {
    lines.push('## Done Work')
    doneWork.forEach((item) => lines.push(`- ${item}`))
    lines.push('')
  }
  if (nextSteps.length > 0) {
    lines.push('## Next Steps')
    nextSteps.forEach((item) => lines.push(`- ${item}`))
    lines.push('')
  }
  if (notes) lines.push('## Notes', notes, '')
  return `${lines.join('\n').trim()}\n`
}

function resolvePreviousCheckpointId(entries: MemoryWorkspaceEntry[], subject: CheckpointSubject, explicitSupersede?: string): string | undefined {
  const explicit = normalizeNonEmpty(explicitSupersede)
  if (explicit) return explicit
  const state = buildCheckpointState(entries, true)
  const previous = entries.find((entry) => {
    const id = memoryEntryId(entry)
    return Boolean(id && state.currentIds.has(id) && sameSubject(entry, subject))
  })
  return previous ? memoryEntryId(previous) : undefined
}

function buildCheckpointEntry(params: {
  options: CheckpointCreateOptions
  context: ResolvedProjectBindingContext
  subject: Required<CheckpointSubject>
  previousCheckpointId?: string
}): MemoryWorkspaceEntry {
  const { options, context, subject, previousCheckpointId } = params
  const linked = buildLinkedIds(options)
  const sourceRefs = parseRefValues(options.sourceRef, '--source-ref')
  const nextReadRefs = parseRefValues(options.nextReadRef, '--next-read-ref')
  const doneWork = toStringArray(options.doneWork)
  const nextSteps = toStringArray(options.nextStep)
  const timestamp = new Date().toISOString()
  const anchors = compactPayload({
    missionId: normalizeNonEmpty(options.missionId),
    missionSlug: normalizeNonEmpty(options.missionSlug),
    sessionId: normalizeNonEmpty(options.sessionId),
    projectId: normalizeNonEmpty(context.projectId),
    projectSlug: normalizeNonEmpty(context.projectSlug),
    agent: normalizeNonEmpty(options.agent),
    timestamp,
  })

  return createNewLocalMemoryEntry({
    kind: 'checkpoint',
    durability: 'short',
    content: buildCheckpointContent(options),
    subjectType: subject.subjectType,
    subjectId: subject.subjectId,
    subjectTitle: subject.subjectTitle,
    projectId: normalizeNonEmpty(context.projectId),
    importance: options.importance,
    nextAction: normalizeNonEmpty(options.nextAction) ?? nextSteps[0],
    validationState: normalizeNonEmpty(options.validationState),
    sourceRefs,
    nextReadRefs,
    purpose: ['checkpoint', 'session'],
    areas: [],
    status: ['active'],
    tags: uniqueStrings([
      'memory:checkpoint',
      'checkpoint:session',
      context.projectId ? `project:${context.projectId}` : undefined,
      options.missionId ? `mission:${options.missionId}` : undefined,
      linked.kanbanTaskId ? `kanban-task:${linked.kanbanTaskId}` : undefined,
      linked.sprintId ? `sprint:${linked.sprintId}` : undefined,
      linked.phaseId ? `phase:${linked.phaseId}` : undefined,
      linked.microtaskId ? `microtask:${linked.microtaskId}` : undefined,
      linked.issueId ? `issue:${linked.issueId}` : undefined,
      linked.feedbackId ? `feedback:${linked.feedbackId}` : undefined,
      ...toStringArray(options.tag),
    ]),
    raw: compactPayload({
      checkpointAs: 'session',
      supersedes: previousCheckpointId,
      checkpoint: compactPayload({
        schemaVersion: CHECKPOINT_SCHEMA_VERSION,
        summary: normalizeNonEmpty(options.summary),
        position: normalizeNonEmpty(options.position),
        doneWork,
        nextSteps,
        sourceRefs,
        anchors,
      }),
    }),
  })
}

function summarizeContent(content: string): string | undefined {
  return normalizeNonEmpty(content.replace(/^# .+$/m, '').split('\n').map((line) => line.trim()).find(Boolean))
}

function normalizeCheckpointRecord(
  entry: MemoryWorkspaceEntry,
  state: CheckpointState,
  options: { full?: boolean } = {},
): Record<string, unknown> {
  const id = memoryEntryId(entry)
  const rawCheckpoint = isRecord(entry.raw?.checkpoint) ? entry.raw.checkpoint : {}
  const asValue = checkpointAs(entry)
  return compactPayload({
    id,
    kind: entry.kind,
    checkpointAs: asValue,
    current: id ? state.currentIds.has(id) : false,
    superseded: id ? state.supersededIds.has(id) : false,
    supersedes: normalizeNonEmpty(entry.raw?.supersedes),
    legacy: (entry.kind ?? '').toLowerCase() !== 'checkpoint',
    summary: normalizeNonEmpty(rawCheckpoint.summary) ?? summarizeContent(entry.content),
    position: normalizeNonEmpty(rawCheckpoint.position),
    doneWork: Array.isArray(rawCheckpoint.doneWork) ? rawCheckpoint.doneWork : undefined,
    nextSteps: Array.isArray(rawCheckpoint.nextSteps) ? rawCheckpoint.nextSteps : undefined,
    subject: compactPayload({
      type: entry.subjectType,
      id: entry.subjectId,
      title: entry.subjectTitle,
    }),
    anchors: isRecord(rawCheckpoint.anchors) ? compactPayload(rawCheckpoint.anchors) : undefined,
    tags: entry.tags,
    sourceRefs: entry.sourceRefs,
    nextReadRefs: entry.nextReadRefs,
    nextAction: entry.nextAction,
    validationState: entry.validationState,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
    storage: entry.storage ?? 'local-cache',
    content: options.full === true ? entry.content : undefined,
  })
}

function buildResolvedContextRecord(context: ResolvedProjectBindingContext): Record<string, unknown> {
  return compactPayload({
    repoRoot: context.repoRoot,
    configPath: context.configPath,
    configFound: context.configFound,
    projectId: context.projectId,
    scopeId: context.scopeId,
    projectName: context.projectName,
    projectSlug: context.projectSlug,
    localRoot: context.localRoot,
  })
}

function buildEnvelope(params: {
  command: string
  context: ResolvedProjectBindingContext
  input: Record<string, unknown>
  result: Record<string, unknown>
}): Record<string, unknown> {
  return compactPayload({
    command: params.command,
    toolId: REPO_FIRST_CHECKPOINT_TOOL_ID,
    resolvedContext: buildResolvedContextRecord(params.context),
    input: params.input,
    result: params.result,
  })
}

async function resolveCheckpointContext(options: CheckpointContextOptions, params: { requireScope?: boolean } = {}): Promise<ResolvedProjectBindingContext> {
  if (options.hosted === true) {
    throw new Error('Hosted checkpoint facade waits for S2 Agentspace schema support. Use repo-first checkpoint commands for S1.')
  }
  const resolved = await resolveProjectBindingContext(options, {
    requireProject: params.requireScope === true,
  })
  const scopeId = normalizeNonEmpty(options.scopeId) ?? resolveOwnerScopeIdFromBinding(resolved)
  if (params.requireScope === true && !scopeId && !normalizeNonEmpty(resolved.projectId)) {
    throw new Error('Checkpoint context could not be resolved. Provide --project-id/--project-name/--project-slug or repo config.')
  }
  return { ...resolved, scopeId }
}

async function loadCheckpointEntries(context: ResolvedProjectBindingContext): Promise<MemoryWorkspaceEntry[]> {
  const paths = resolveMemoryWorkspacePaths(context)
  const entries = await readLocalMemoryEntries(paths.localItemsDir)
  await rebuildLocalMemoryWorkspace({
    ...context,
    items: entries,
  })
  return entries
}

function filterCheckpointEntries(
  entries: MemoryWorkspaceEntry[],
  options: {
    subject?: CheckpointSubject
    current?: boolean
    includeLegacy?: boolean
    limit?: number
  },
): { entries: MemoryWorkspaceEntry[]; state: CheckpointState } {
  const includeLegacy = options.includeLegacy !== false
  const all = entries.filter((entry) => isCheckpointEntry(entry, includeLegacy))
  const state = buildCheckpointState(all, includeLegacy)
  const filtered = all
    .filter((entry) => !options.subject || sameSubject(entry, options.subject))
    .filter((entry) => {
      if (options.current !== true) return true
      const id = memoryEntryId(entry)
      return Boolean(id && state.currentIds.has(id))
    })
    .slice(0, options.limit)
  return { entries: filtered, state }
}

export async function runCheckpointCreate(options: CheckpointCreateOptions = {}): Promise<void> {
  const context = await resolveCheckpointContext(options, { requireScope: true })
  const subject = resolveCheckpointSubject(options, context)
  const paths = resolveMemoryWorkspacePaths(context)
  const existingEntries = await readLocalMemoryEntries(paths.localItemsDir)
  const previousCheckpointId = resolvePreviousCheckpointId(existingEntries, subject, options.supersede)
  const entry = buildCheckpointEntry({ options, context, subject, previousCheckpointId })

  if (options.preview === true) {
    const result = { preview: true, wouldWrite: normalizeCheckpointRecord(entry, buildCheckpointState([...existingEntries, entry]), { full: true }) }
    if (options.json) {
      console.log(JSON.stringify(buildEnvelope({
        command: 'checkpoint.create',
        context,
        input: compactPayload({ repoFirst: true, preview: true }),
        result,
      }), null, 2))
      return
    }
    logSuccess('Repo-first checkpoint preview completed.')
    console.log(JSON.stringify(result, null, 2))
    return
  }

  if (options.apply !== true) {
    throw new Error('Retry with --apply because checkpoint create writes repo-first memory.')
  }

  await writeLocalMemoryEntryFile(paths.localItemsDir, entry)
  const nextEntries = await readLocalMemoryEntries(paths.localItemsDir)
  await rebuildLocalMemoryWorkspace({
    ...context,
    items: nextEntries,
  })
  const result = { data: normalizeCheckpointRecord(entry, buildCheckpointState(nextEntries), { full: true }) }
  if (options.json) {
    console.log(JSON.stringify(buildEnvelope({
      command: 'checkpoint.create',
      context,
      input: compactPayload({ repoFirst: true, subject }),
      result,
    }), null, 2))
    return
  }
  logSuccess('Repo-first checkpoint written.')
  console.log(JSON.stringify(result, null, 2))
}

export async function runCheckpointList(options: CheckpointListOptions = {}): Promise<void> {
  const context = await resolveCheckpointContext(options, { requireScope: true })
  const entries = await loadCheckpointEntries(context)
  const subject = resolveReadSubject(options)
  const { entries: filtered, state } = filterCheckpointEntries(entries, {
    subject,
    current: options.current === true && options.timeline !== true,
    includeLegacy: options.includeLegacy,
    limit: options.limit,
  })
  const result = {
    mode: options.current === true && options.timeline !== true ? 'current' : 'timeline',
    data: filtered.map((entry) => normalizeCheckpointRecord(entry, state)),
  }
  if (options.json) {
    console.log(JSON.stringify(buildEnvelope({
      command: 'checkpoint.list',
      context,
      input: compactPayload({ repoFirst: true, subject, current: options.current, timeline: options.timeline }),
      result,
    }), null, 2))
    return
  }
  logSuccess('Repo-first checkpoints loaded.')
  console.log(JSON.stringify(result, null, 2))
}

export async function runCheckpointGet(options: CheckpointGetOptions = {}): Promise<void> {
  const context = await resolveCheckpointContext(options, { requireScope: true })
  const entries = await loadCheckpointEntries(context)
  const includeLegacy = options.includeLegacy !== false
  const state = buildCheckpointState(entries.filter((entry) => isCheckpointEntry(entry, includeLegacy)), includeLegacy)
  const id = normalizeNonEmpty(options.id)
  let currentSubject: CheckpointSubject | undefined
  let entry: MemoryWorkspaceEntry | undefined
  if (id) {
    entry = entries.find((candidate) => memoryEntryId(candidate) === id && isCheckpointEntry(candidate, includeLegacy))
  } else {
    const subject = resolveCurrentReadSubject(options, context)
    currentSubject = subject
    entry = entries.find((candidate) => {
      const candidateId = memoryEntryId(candidate)
      return Boolean(candidateId && state.currentIds.has(candidateId) && sameSubject(candidate, subject))
    })
  }
  if (!entry) throw new Error(id ? 'Repo-first checkpoint was not found.' : 'No current repo-first checkpoint was found for the requested subject.')
  const result = { data: normalizeCheckpointRecord(entry, state, { full: options.full === true }) }
  if (options.json) {
    console.log(JSON.stringify(buildEnvelope({
      command: 'checkpoint.get',
      context,
      input: compactPayload({ repoFirst: true, id, subject: currentSubject, current: !id }),
      result,
    }), null, 2))
    return
  }
  logSuccess('Repo-first checkpoint loaded.')
  console.log(JSON.stringify(result, null, 2))
}

function applyCheckpointContextOptions<T extends Command>(cmd: T): T {
  cmd.option('--project-id <id>', 'Project id')
  cmd.option('--project-name <name>', 'Project name')
  cmd.option('--project-slug <slug>', 'Project slug')
  cmd.option('--scope-id <id>', 'Legacy/internal scope id alias')
  cmd.option('--file-based', 'Use repo-first file backend (default)')
  cmd.option('--hosted', 'Use hosted checkpoint backend (not available until S2 schema support)')
  cmd.option('--json', 'Output JSON only')
  return cmd
}

function applyCheckpointWriteOptions<T extends Command>(cmd: T): T {
  cmd.option('--preview', 'Return a validated preflight summary without writing')
  cmd.option('--apply', 'Explicitly allow guarded write operations')
  cmd.option('--confirm', 'Reserved for destructive operations; not needed for create')
  cmd.option('--idempotency-key <key>', 'Optional guarded-write idempotency key')
  return cmd
}

export function makeCheckpointCommand(): Command {
  const cmd = new Command('checkpoint')
    .description('Server-first session checkpoint facade over hosted Agentspace memory')

  applyCheckpointContextOptions(
    applyCheckpointWriteOptions(
      cmd.command('create')
        .description('Write a structured short session checkpoint')
        .requiredOption('--summary <text>', 'One-sentence carry-forward summary')
        .option('--position <text>', 'Current position or where to resume')
        .option('--done-work <text>', 'Repeatable completed work item', collectRepeatedOption, [])
        .option('--next-step <text>', 'Repeatable next step', collectRepeatedOption, [])
        .option('--content <textOrFile>', 'Optional notes text, or @file to read notes from disk')
        .option('--source-ref <value>', 'Repeatable source ref (string, JSON object/array, or @file.json)', collectRepeatedOption, [])
        .option('--next-read-ref <value>', 'Repeatable next read ref (string, JSON object/array, or @file.json)', collectRepeatedOption, [])
        .option('--mission-id <id>', 'Mission id anchor; uses agentspace.mission subject')
        .option('--mission-slug <slug>', 'Mission slug/title hint')
        .option('--session-id <id>', 'Session id anchor')
        .option('--agent <id>', 'Agent/session actor label')
        .option('--subject-type <type>', 'Explicit subject type for non-mission checkpoint')
        .option('--subject-id <id>', 'Explicit subject id for non-mission checkpoint')
        .option('--subject-title <text>', 'Explicit subject title for non-mission checkpoint')
        .option('--task-id <id>', 'Linked kanban task id')
        .option('--kanban-task-id <id>', 'Linked kanban task id')
        .option('--sprint-id <id>', 'Linked sprint id')
        .option('--phase-id <id>', 'Linked phase id')
        .option('--utask-id <id>', 'Linked utask id')
        .option('--microtask-id <id>', 'Linked microtask id')
        .option('--issue-id <id>', 'Linked issue id')
        .option('--feedback-id <id>', 'Linked feedback id')
        .option('--tag <value>', 'Repeatable tag', collectRepeatedOption, [])
        .option('--importance <value>', 'Importance score (0-100)', (value) => Number.parseInt(String(value), 10))
        .option('--next-action <text>', 'Recommended next action')
        .option('--validation-state <text>', 'Validation state summary')
        .option('--supersede <memoryId>', 'Explicitly supersede an older checkpoint id'),
    ).action(async (options: CheckpointCreateOptions) => {
      await runCheckpointCreate(options)
    }),
  )

  applyCheckpointContextOptions(
    cmd.command('list')
      .description('List checkpoint timeline, including superseded records')
      .option('--mission-id <id>', 'Filter to mission checkpoint subject')
      .option('--subject-type <type>', 'Filter by subject type')
      .option('--subject-id <id>', 'Filter by subject id')
      .option('--current', 'Show only current non-superseded checkpoint per subject')
      .option('--timeline', 'Show timeline view including superseded checkpoints (default)')
      .option('--no-include-legacy', 'Exclude legacy mem checkpoint records')
      .option('--limit <count>', 'Result limit', (value) => Number.parseInt(String(value), 10))
      .action(async (options: CheckpointListOptions) => {
        await runCheckpointList(options)
      }),
  )

  applyCheckpointContextOptions(
    cmd.command('get')
      .description('Get a checkpoint by id, or the current checkpoint for a subject')
      .option('--id <id>', 'Checkpoint id')
      .option('--current', 'Get current checkpoint for the requested subject (default when --id is omitted)')
      .option('--mission-id <id>', 'Mission id subject for current lookup')
      .option('--subject-type <type>', 'Subject type for current lookup')
      .option('--subject-id <id>', 'Subject id for current lookup')
      .option('--full', 'Include checkpoint content body')
      .option('--no-include-legacy', 'Exclude legacy mem checkpoint records')
      .action(async (options: CheckpointGetOptions) => {
        await runCheckpointGet(options)
      }),
  )

  cmd.addHelpText('after', `
Notes:
  ` + '`checkpoint` writes real repo-first kind=checkpoint records with checkpointAs=session.\n' +
    '  Legacy `mem checkpoint --as status|decision|blocker` records remain readable in list/get outputs.\n' +
    '  Hosted checkpoint writes wait for S2 Agentspace schema support; S1 is repo-first only.\n')

  return cmd
}
