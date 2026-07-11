import { Buffer } from 'node:buffer'
import fs from 'node:fs/promises'
import path from 'node:path'
import { Command } from 'commander'

import { compactPayload } from '../utils/command.js'
import { readAopsRepoConfig } from '../utils/repo-config.js'
import { resolveProjectBindingContext, type ProjectBindingContextOptions } from '../utils/project-context.js'
import {
  invokeHostedToolWithApiState,
  requireApiState,
  unwrapHostedToolResult,
  type AgentGatewayContextOptions,
} from '../utils/agent-gateway.js'
import type { CliApiClientState } from '../utils/api.js'
import {
  resolveRepoFirstAgentspacePaths,
  resolveRepoFirstProjectmanPaths,
} from '../utils/repo-first-projectman.js'
import { resolveRepoFirstWorkspaceRelativeRoot } from '../utils/repo-first-storage.js'
import { resolveHostedWorkspacePaths } from '../utils/hosted-workspace.js'
import { readLocalMemoryEntryFiles, type MemoryWorkspaceEntry } from '../utils/memory-workspace.js'
import { readSessionStateNudges, type SessionStateNudge } from '../utils/session-state.js'
import {
  normalizeDiscussionOutputRecord,
  normalizeDiscussionTopicRecord,
  normalizeDiscussionTurnRecord,
  readDiscussionTopicRecords,
  type DiscussionTopicRecord,
} from '../utils/discussion-workspace.js'
import { readExperienceItemFiles, type ExperienceItem } from '../utils/experience-workspace.js'
import {
  ViewSelectorError,
  candidateFromRecord,
  effectiveLocalState,
  formatDate,
  idAliases,
  isRecord,
  matchesEqualCi,
  normalizeMaxBytes,
  normalizeViewOptions,
  readMarkdownRecords,
  recordArray,
  recordId,
  recordLabel,
  recordSlug,
  renderFooter,
  renderKeyValues,
  renderMarkdownTable,
  repoRelative,
  resolveRecordSelector,
  sameIdOrPrefix,
  shortId,
  slugify,
  stringValue,
  summarizeText,
  type SelectorCandidate,
  type ViewOptions,
  type ViewRecord,
} from '../utils/repo-first-view.js'

type ViewCliOptions = ProjectBindingContextOptions & AgentGatewayContextOptions & ViewOptions & {
  depth?: string
  project?: boolean
  board?: string
  task?: string
  sprint?: string
  durability?: string
  kind?: string
  subject?: string
  id?: string
  status?: string
  severity?: string
  agent?: string
  type?: string
  area?: string
  hostedProject?: string
}

type MemoryFilterOptions = {
  durability?: string
  kind?: string
  subject?: string
  id?: string
}

type PmListFilterOptions = {
  status?: string
  severity?: string
  board?: string
  sprint?: string
  task?: string
}

type DiscussionFilterOptions = {
  status?: string
  agent?: string
}

type ExperienceFilterOptions = {
  type?: string
  area?: string
}

const MEMORY_SUBJECT_ALIASES: Record<string, string[]> = {
  project: ['agentspace.project', 'projectman.plan', 'project'],
  board: ['projectman.board'],
  sprint: ['projectman.sprint'],
  task: ['projectman.kanban-task'],
  ktask: ['projectman.kanban-task'],
  utask: ['projectman.utask'],
  issue: ['projectman.issue'],
  feedback: ['projectman.feedback'],
  review: ['projectman.review-request'],
  'review-request': ['projectman.review-request'],
}

function resolveMemorySubjectAliases(value: string): string[] {
  const normalized = value.toLowerCase()
  return MEMORY_SUBJECT_ALIASES[normalized] ?? [normalized]
}

function findBoardByReference(boards: ViewRecord[], reference: string): ViewRecord | undefined {
  const needle = reference.toLowerCase()
  return boards.find((board) => {
    if (matchesEqualCi(board.frontmatter.slug, reference)) return true
    if (matchesEqualCi(board.frontmatter.name, reference)) return true
    return idAliases(board).some((alias) => alias.toLowerCase() === needle || (needle.length >= 8 && alias.toLowerCase().startsWith(needle)))
  })
}

function findRecordByReference(records: ViewRecord[], reference: string): ViewRecord | undefined {
  const needle = reference.toLowerCase()
  return records.find((record) => {
    if (matchesEqualCi(record.frontmatter.slug, reference)) return true
    if (matchesEqualCi(record.frontmatter.name, reference)) return true
    if (matchesEqualCi(record.frontmatter.title, reference)) return true
    return idAliases(record).some((alias) => alias.toLowerCase() === needle || (needle.length >= 8 && alias.toLowerCase().startsWith(needle)))
  })
}

function recordMatchesBoard(workspace: ViewWorkspace, record: ViewRecord, boardRef: string): boolean {
  const board = findBoardByReference(workspace.boards, boardRef)
  if (!board) return false
  const aliases = idAliases(board)
  if (aliases.some((alias) => sameIdOrPrefix(record.frontmatter.boardLocalId, [alias]) || sameIdOrPrefix(record.frontmatter.boardId, [alias]))) {
    return true
  }
  if (record.frontmatter.entityType === 'projectman.sprint' || record.frontmatter.entityType === 'projectman.issue' || record.frontmatter.entityType === 'projectman.feedback' || record.frontmatter.entityType === 'projectman.review-request') {
    const taskAliases = [record.frontmatter.kanbanTaskLocalId, record.frontmatter.kanbanTaskId, record.frontmatter.taskId]
    return workspace.tasks.some((task) => {
      const taskIdMatchesRecord = taskAliases.some((value) => sameIdOrPrefix(value, idAliases(task)))
      if (!taskIdMatchesRecord) return false
      return aliases.some((alias) => sameIdOrPrefix(task.frontmatter.boardLocalId, [alias]) || sameIdOrPrefix(task.frontmatter.boardId, [alias]))
    })
  }
  return false
}

function recordMatchesSprint(record: ViewRecord, sprintRef: string, sprints: ViewRecord[]): boolean {
  const sprint = findRecordByReference(sprints, sprintRef)
  if (!sprint) return false
  const aliases = idAliases(sprint)
  return [record.frontmatter.sprintLocalId, record.frontmatter.sprintId].some((value) => sameIdOrPrefix(value, aliases))
}

function recordMatchesTask(record: ViewRecord, taskRef: string, tasks: ViewRecord[]): boolean {
  const task = findRecordByReference(tasks, taskRef)
  if (!task) return false
  const aliases = idAliases(task)
  return [record.frontmatter.kanbanTaskLocalId, record.frontmatter.kanbanTaskId, record.frontmatter.taskId].some((value) => sameIdOrPrefix(value, aliases))
}

function applyPmFilters(
  records: ViewRecord[],
  workspace: ViewWorkspace,
  filter: PmListFilterOptions,
  options: { taskColumnResolver?: (record: ViewRecord) => string } = {},
): ViewRecord[] {
  let filtered = records
  if (filter.status) {
    filtered = filtered.filter((record) => {
      if (matchesEqualCi(record.frontmatter.status, filter.status!)) return true
      const resolved = options.taskColumnResolver?.(record)
      if (resolved && matchesEqualCi(resolved, filter.status!)) return true
      return matchesEqualCi(record.frontmatter.columnSlug, filter.status!)
        || matchesEqualCi(record.frontmatter.boardColumnId, filter.status!)
    })
  }
  if (filter.severity) {
    filtered = filtered.filter((record) => matchesEqualCi(record.frontmatter.severity, filter.severity!))
  }
  if (filter.board) {
    filtered = filtered.filter((record) => recordMatchesBoard(workspace, record, filter.board!))
  }
  if (filter.sprint) {
    filtered = filtered.filter((record) => recordMatchesSprint(record, filter.sprint!, workspace.sprints))
  }
  if (filter.task) {
    filtered = filtered.filter((record) => recordMatchesTask(record, filter.task!, workspace.tasks))
  }
  return filtered
}

function pmFilterFrom(options: ViewCliOptions): PmListFilterOptions {
  return {
    status: stringValue(options.status),
    severity: stringValue(options.severity),
    board: stringValue(options.board),
    sprint: stringValue(options.sprint),
    task: stringValue(options.task),
  }
}

function filterTitle(base: string, filter: Record<string, string | undefined>): string {
  const parts = Object.entries(filter)
    .filter(([, value]) => Boolean(value))
    .map(([label, value]) => `${label}=${value}`)
  return parts.length > 0 ? `${base} (${parts.join(', ')})` : base
}

type ResolvedViewOptions = ReturnType<typeof normalizeViewOptions>

type ViewContext = Awaited<ReturnType<typeof resolveProjectBindingContext>>

type MemoryFile = {
  fileName: string
  filePath: string
  entry: MemoryWorkspaceEntry
}

type ExperienceFile = {
  fileName: string
  filePath: string
  item: ExperienceItem
}

type ViewWorkspace = {
  boards: ViewRecord[]
  tasks: ViewRecord[]
  sprints: ViewRecord[]
  issues: ViewRecord[]
  feedback: ViewRecord[]
  reviewRequests: ViewRecord[]
  utasks: ViewRecord[]
  memory: MemoryFile[]
  discussions: DiscussionTopicRecord[]
  experience: ExperienceFile[]
  skills: ViewRecord[]
  prompts: ViewRecord[]
  docs: ViewRecord[]
  docPages: ViewRecord[]
  sessionStateNudges: SessionStateNudge[]
}

type ViewBuildResult = {
  surface?: string
  result: Record<string, unknown>
  markdown: string
  footer: {
    source: string
    localState?: string
    updatedAt?: unknown
    lastPushedAt?: unknown
    lastPulledAt?: unknown
  }
}

const VIEW_SURFACE = 'local-cache-view'
const HOSTED_VIEW_SURFACE = 'hosted-view'
const DOCMAN_MIRROR_COMMENT = /^<!--\s*READ-ONLY MIRROR:[\s\S]*?-->\s*/i
const RELEASE_NOTES_LINE = /\n_Release Notes:_ [^\n]*\n/gi

function parseIntegerOption(value: string | number | undefined, fallback: number): number {
  const parsed = typeof value === 'number' ? value : Number.parseInt(String(value ?? ''), 10)
  return Number.isFinite(parsed) ? parsed : fallback
}

function addViewOptions<T extends Command>(cmd: T): T {
  return cmd
    .option('--json', 'Output stable JSON envelope')
    .option('--style <style>', 'Markdown style: agent, compact, wide', 'agent')
    .option('--link-mode <mode>', 'Link mode: none, relative, absolute', 'none')
    .option('--max-items <n>', 'Maximum rows/items returned or rendered in each section', (value) => parseIntegerOption(value, 25), 25)
    .option('--max-bytes <n>', 'Maximum markdown bytes; hard-capped at 32768', (value) => parseIntegerOption(value, 32768), 32768)
    .option('--include-archived', 'Include board and sprint records with archivedAt set')
    .option('--api-base-url <url>', 'API base URL for hosted view commands')
    .option('--access-token <token>', 'API access token for hosted view commands')
    .option('--refresh-token <token>', 'API refresh token for hosted view commands')
    .option('--timeout-ms <ms>', 'Request timeout for hosted view commands', (value) => parseIntegerOption(value, 0))
    .option('--tenant-id <id>', 'Hosted tenant id header')
    .option('--locale <locale>', 'Hosted locale header')
    .option('--fallback-locale <locale>', 'Hosted fallback locale header')
    .option('--scope-id <id>', 'Hosted scope id override')
    .option('--scope-resolution <mode>', 'Hosted scope resolution: explicit or cascade')
    .option('--project-id <id>', 'Project id used to resolve repo-local context')
    .option('--project-name <name>', 'Project name used to resolve repo-local context')
    .option('--project-slug <slug>', 'Project slug used to resolve repo-local context')
}

function commandOptions(cmd: Command): ViewCliOptions {
  return cmd.optsWithGlobals() as ViewCliOptions
}

function printJson(payload: unknown): void {
  console.log(JSON.stringify(payload, null, 2))
}

function finalizeMarkdown(body: string, footer: ViewBuildResult['footer'], maxBytes: number): { markdown: string; truncated: boolean } {
  const limit = normalizeMaxBytes(maxBytes)
  const normalFooter = `${renderFooter({ ...footer, truncated: false })}\n`
  const normal = `${body.trimEnd()}${normalFooter}`
  if (Buffer.byteLength(normal, 'utf8') <= limit) return { markdown: normal, truncated: false }

  const truncationNote = `\n\nTruncated: output exceeded ${limit} bytes. Use --max-items or a narrower selector.\n`
  const truncatedFooter = `${renderFooter({ ...footer, truncated: true })}\n`
  const budget = Math.max(0, limit - Buffer.byteLength(truncationNote, 'utf8') - Buffer.byteLength(truncatedFooter, 'utf8'))
  let sliced = body.trimEnd()
  while (Buffer.byteLength(sliced, 'utf8') > budget && sliced.length > 0) {
    sliced = sliced.slice(0, Math.max(0, Math.floor(sliced.length * 0.9)))
  }
  return {
    markdown: `${sliced.trimEnd()}${truncationNote}${truncatedFooter}`,
    truncated: true,
  }
}

function selectorTable(candidates: SelectorCandidate[]): string {
  return renderMarkdownTable(
    ['UID', 'Label', 'Slug', 'Type', 'Path'],
    candidates.map((candidate) => [
      shortId(candidate.id),
      candidate.label,
      candidate.slug ?? '-',
      candidate.type ?? '-',
      candidate.path ?? '-',
    ]),
  )
}

async function emitView(
  command: string,
  options: ViewCliOptions,
  builder: (context: ViewContext, viewOptions: ResolvedViewOptions) => Promise<ViewBuildResult>,
): Promise<void> {
  const viewOptions = normalizeViewOptions(options)
  let context: ViewContext | undefined
  try {
    context = await resolveViewContext(options)
    const built = await builder(context, viewOptions)
    const finalized = finalizeMarkdown(built.markdown, built.footer, viewOptions.maxBytes)
    const surface = built.surface ?? VIEW_SURFACE
    const envelope = {
      ok: true,
      command,
      surface,
      resolvedContext: context,
      result: built.result,
      diagnostics: {
        style: viewOptions.style,
        linkMode: viewOptions.linkMode,
        maxItems: viewOptions.maxItems,
        maxBytes: viewOptions.maxBytes,
        truncated: finalized.truncated,
      },
    }
    if (viewOptions.json) {
      printJson(envelope)
    } else {
      process.stdout.write(finalized.markdown)
    }
  } catch (error) {
    process.exitCode = 1
    if (error instanceof ViewSelectorError) {
      const payload = {
        ok: false,
        command,
        surface: VIEW_SURFACE,
        resolvedContext: context,
        error: {
          code: error.code,
          message: error.message,
          selector: error.selector,
          candidates: error.candidates,
        },
      }
      if (viewOptions.json) {
        printJson(payload)
      } else {
        process.stdout.write(`# ${error.code === 'ambiguous' ? 'Ambiguous Selector' : 'Selector Not Found'}\n\n${error.message}\n\n${selectorTable(error.candidates)}\n`)
      }
      return
    }
    if (viewOptions.json) {
      printJson({
        ok: false,
        command,
        surface: VIEW_SURFACE,
        resolvedContext: context,
        error: {
          message: error instanceof Error ? error.message : String(error),
        },
      })
    } else {
      process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    }
  }
}

async function emitHostedView(
  command: string,
  options: ViewCliOptions,
  builder: (
    apiState: CliApiClientState,
    context: ViewContext,
    viewOptions: ResolvedViewOptions,
    cliOptions: ViewCliOptions,
  ) => Promise<ViewBuildResult>,
): Promise<void> {
  const viewOptions = normalizeViewOptions(options)
  let context: ViewContext | undefined
  try {
    context = await resolveViewContext(options)
    const apiState = await requireApiState(options)
    if (!apiState) return
    const built = await builder(apiState, context, viewOptions, options)
    const finalized = finalizeMarkdown(built.markdown, built.footer, viewOptions.maxBytes)
    const envelope = {
      ok: true,
      command,
      surface: built.surface ?? HOSTED_VIEW_SURFACE,
      resolvedContext: context,
      result: built.result,
      diagnostics: {
        style: viewOptions.style,
        linkMode: viewOptions.linkMode,
        maxItems: viewOptions.maxItems,
        maxBytes: viewOptions.maxBytes,
        truncated: finalized.truncated,
      },
    }
    if (viewOptions.json) {
      printJson(envelope)
    } else {
      process.stdout.write(finalized.markdown)
    }
  } catch (error) {
    process.exitCode = 1
    if (viewOptions.json) {
      printJson({
        ok: false,
        command,
        surface: HOSTED_VIEW_SURFACE,
        resolvedContext: context,
        error: {
          message: error instanceof Error ? error.message : String(error),
        },
      })
    } else {
      process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    }
  }
}

async function resolveViewContext(options: ViewCliOptions): Promise<ViewContext> {
  const resolved = await resolveProjectBindingContext(options, { requireProject: false })
  if (resolved.configFound) return resolved

  const repoRoot = await findAncestorRepoRoot(process.cwd())
  if (!repoRoot || repoRoot === resolved.repoRoot) return resolved

  const config = await readAopsRepoConfig(repoRoot)
  const selected = config?.projects.find((project) => stringValue(options.projectId) && project.projectId === stringValue(options.projectId))
    ?? config?.projects.find((project) => stringValue(options.projectSlug) && project.slug === stringValue(options.projectSlug))
    ?? config?.projects.find((project) => stringValue(options.projectName) && project.name === stringValue(options.projectName))
    ?? config?.projects.find((project) => config.activeProjectName && project.name === config.activeProjectName)
    ?? config?.projects[0]

  return {
    repoRoot,
    configPath: path.join(repoRoot, '.aops', 'aops.config.json'),
    scopeId: selected?.scopeId ?? selected?.projectId ?? stringValue(options.projectId),
    projectId: selected?.projectId ?? stringValue(options.projectId),
    projectName: selected?.name ?? stringValue(options.projectName),
    projectSlug: selected?.slug ?? stringValue(options.projectSlug),
    localRoot: selected?.localRoot,
    ownerRepo: selected?.ownerRepo,
    parentProjectSlug: selected?.parentProjectSlug,
    configFound: Boolean(config),
  }
}

async function findAncestorRepoRoot(startDir: string): Promise<string | undefined> {
  let current = path.resolve(startDir)
  while (true) {
    try {
      await fs.access(path.join(current, '.aops', 'aops.config.json'))
      return current
    } catch {
      const parent = path.dirname(current)
      if (parent === current) return undefined
      current = parent
    }
  }
}

function filterEntity(records: ViewRecord[], entityType: string): ViewRecord[] {
  return records.filter((record) => stringValue(record.frontmatter.entityType) === entityType)
}

async function loadWorkspace(context: ViewContext): Promise<ViewWorkspace> {
  const pmPaths = resolveRepoFirstProjectmanPaths(context)
  const agentPaths = resolveRepoFirstAgentspacePaths(context)
  const hostedPaths = resolveHostedWorkspacePaths(context.repoRoot)
  const docRoot = path.join(context.repoRoot, '.aops', 'docman')

  const [
    boardsRaw,
    tasksRaw,
    sprintsRaw,
    issuesRaw,
    feedbackRaw,
    reviewRequestsRaw,
    utasksRaw,
    memory,
    discussions,
    experience,
    skills,
    prompts,
    docsRaw,
    sessionStateNudges,
  ] = await Promise.all([
    readMarkdownRecords(pmPaths.boards, { repoRoot: context.repoRoot }),
    readMarkdownRecords(pmPaths.tasks, { repoRoot: context.repoRoot }),
    readMarkdownRecords(pmPaths.sprints, { repoRoot: context.repoRoot }),
    readMarkdownRecords(pmPaths.issues, { repoRoot: context.repoRoot }),
    readMarkdownRecords(pmPaths.feedback, { repoRoot: context.repoRoot }),
    readMarkdownRecords(pmPaths.reviewRequests, { repoRoot: context.repoRoot }),
    readMarkdownRecords(pmPaths.utasks, { repoRoot: context.repoRoot, recursive: true }),
    readLocalMemoryEntryFiles(agentPaths.memoryItems),
    readDiscussionTopicRecords(agentPaths.discussionTopics),
    readExperienceItemFiles(agentPaths.experienceItems),
    readMarkdownRecords(hostedPaths.skillsRoot, { repoRoot: context.repoRoot }),
    readMarkdownRecords(hostedPaths.promptsRoot, { repoRoot: context.repoRoot }),
    readMarkdownRecords(docRoot, { repoRoot: context.repoRoot, recursive: true, includeIndex: true }),
    readSessionStateNudges({ repoRoot: context.repoRoot, localRoot: context.localRoot }),
  ])

  const docs = filterEntity(docsRaw, 'docman.document-mirror')
  return {
    boards: filterEntity(boardsRaw, 'projectman.board'),
    tasks: filterEntity(tasksRaw, 'projectman.kanban-task'),
    sprints: filterEntity(sprintsRaw, 'projectman.sprint'),
    issues: filterEntity(issuesRaw, 'projectman.issue'),
    feedback: filterEntity(feedbackRaw, 'projectman.feedback'),
    reviewRequests: filterEntity(reviewRequestsRaw, 'projectman.review-request'),
    utasks: filterEntity(utasksRaw, 'projectman.utask'),
    memory,
    discussions,
    experience,
    skills,
    prompts,
    docs,
    docPages: buildDocPageRecords(context.repoRoot, docs),
    sessionStateNudges,
  }
}

function materializeRecord(record: ViewRecord): Record<string, unknown> {
  const archivedAt = stringValue(record.frontmatter.archivedAt)
  return {
    ...record.frontmatter,
    id: recordId(record),
    label: recordLabel(record),
    slug: recordSlug(record),
    archivedAt,
    archived: Boolean(archivedAt),
    localState: effectiveLocalState(record),
    relativePath: record.relativePath,
    body: record.body,
  }
}

function isArchiveMarked(record: ViewRecord): boolean {
  return Boolean(stringValue(record.frontmatter.archivedAt))
}

function visibleArchiveRecords(records: ViewRecord[], options: ResolvedViewOptions): ViewRecord[] {
  return options.includeArchived ? records : records.filter((record) => !isArchiveMarked(record))
}

function archiveResultMeta(allRecords: ViewRecord[], visibleRecords: ViewRecord[], options: ResolvedViewOptions): Record<string, unknown> {
  const archivedCount = allRecords.filter(isArchiveMarked).length
  return {
    shown: visibleRecords.length,
    activeCount: allRecords.length - archivedCount,
    archivedCount,
    includeArchived: options.includeArchived,
  }
}

function recordUpdatedAt(record: ViewRecord): unknown {
  return record.frontmatter.updatedAt ?? record.frontmatter.pulledAt ?? record.frontmatter.createdAt
}

function latestRecord(records: ViewRecord[]): ViewRecord | undefined {
  return [...records].sort((left, right) => String(recordUpdatedAt(right) ?? '').localeCompare(String(recordUpdatedAt(left) ?? '')))[0]
}

function latestMemory(memory: MemoryFile[]): MemoryFile | undefined {
  return [...memory].sort((left, right) =>
    String(right.entry.updatedAt ?? right.entry.createdAt ?? '').localeCompare(String(left.entry.updatedAt ?? left.entry.createdAt ?? '')),
  )[0]
}

function commonFooter(source: string, records: ViewRecord[] = []): ViewBuildResult['footer'] {
  const latest = latestRecord(records)
  return {
    source,
    localState: records.length > 0 ? mixedState(records) : '-',
    updatedAt: latest ? recordUpdatedAt(latest) : undefined,
    lastPushedAt: latest?.frontmatter.lastPushedAt,
    lastPulledAt: latest?.frontmatter.lastPulledAt ?? latest?.frontmatter.pulledAt,
  }
}

function repoFirstSource(context: ViewContext, ...parts: string[]): string {
  return [resolveRepoFirstWorkspaceRelativeRoot(context), ...parts].join('/')
}

function mixedState(records: ViewRecord[]): string {
  const states = Array.from(new Set(records.map(effectiveLocalState))).sort()
  return states.length === 0 ? '-' : states.join(',')
}

function limitRows<T>(items: T[], options: ResolvedViewOptions): T[] {
  return items.slice(0, options.maxItems)
}

function linkFor(context: ViewContext, record: ViewRecord, options: ResolvedViewOptions): string {
  if (options.linkMode === 'absolute') return record.filePath
  if (options.linkMode === 'relative') return record.relativePath
  return '-'
}

function microtaskUid(
  microtask: Record<string, unknown>,
  phase: Record<string, unknown>,
  phaseIndex: number,
  microIndex: number,
): string {
  const explicitId = stringValue(microtask.id) ?? stringValue(microtask.localId)
  if (explicitId) return shortId(explicitId)
  const phasePos = typeof phase.position === 'number' ? phase.position : phaseIndex
  const microPos = typeof microtask.position === 'number' ? microtask.position : microIndex
  return `P${phasePos}M${microPos}`
}

function boardColumns(board: ViewRecord): Record<string, unknown>[] {
  const columns = recordArray(board.frontmatter.columns)
  if (columns.length > 0) return columns
  return ['Backlog', 'Todo', 'Doing', 'Done'].map((name, index) => ({
    id: `${recordSlug(board) ?? 'board'}-${slugify(name)}`,
    name,
    slug: slugify(name),
    position: index,
  }))
}

function tasksForBoard(workspace: ViewWorkspace, board: ViewRecord): ViewRecord[] {
  const aliases = idAliases(board)
  return workspace.tasks.filter((task) =>
    sameIdOrPrefix(task.frontmatter.boardLocalId, aliases) || sameIdOrPrefix(task.frontmatter.boardId, aliases),
  )
}

function sprintsForTask(workspace: ViewWorkspace, task: ViewRecord): ViewRecord[] {
  const aliases = idAliases(task)
  return workspace.sprints.filter((sprint) =>
    sameIdOrPrefix(sprint.frontmatter.kanbanTaskLocalId, aliases) || sameIdOrPrefix(sprint.frontmatter.kanbanTaskId, aliases),
  )
}

function issuesForSubject(workspace: ViewWorkspace, subject: ViewRecord): ViewRecord[] {
  const aliases = idAliases(subject)
  return workspace.issues.filter((issue) =>
    sameIdOrPrefix(issue.frontmatter.kanbanTaskLocalId, aliases)
    || sameIdOrPrefix(issue.frontmatter.kanbanTaskId, aliases)
    || sameIdOrPrefix(issue.frontmatter.taskId, aliases)
    || sameIdOrPrefix(issue.frontmatter.sprintLocalId, aliases)
    || sameIdOrPrefix(issue.frontmatter.sprintId, aliases),
  )
}

function feedbackForSubject(workspace: ViewWorkspace, subject: ViewRecord): ViewRecord[] {
  const aliases = idAliases(subject)
  return workspace.feedback.filter((feedback) =>
    sameIdOrPrefix(feedback.frontmatter.kanbanTaskLocalId, aliases)
    || sameIdOrPrefix(feedback.frontmatter.kanbanTaskId, aliases)
    || sameIdOrPrefix(feedback.frontmatter.taskId, aliases)
    || sameIdOrPrefix(feedback.frontmatter.sprintLocalId, aliases)
    || sameIdOrPrefix(feedback.frontmatter.sprintId, aliases),
  )
}

function reviewRequestsForSubject(workspace: ViewWorkspace, subject: ViewRecord): ViewRecord[] {
  const aliases = idAliases(subject)
  return workspace.reviewRequests.filter((reviewRequest) =>
    sameIdOrPrefix(reviewRequest.frontmatter.kanbanTaskLocalId, aliases)
    || sameIdOrPrefix(reviewRequest.frontmatter.kanbanTaskId, aliases)
    || sameIdOrPrefix(reviewRequest.frontmatter.taskId, aliases)
    || sameIdOrPrefix(reviewRequest.frontmatter.sprintLocalId, aliases)
    || sameIdOrPrefix(reviewRequest.frontmatter.sprintId, aliases)
    || sameIdOrPrefix(reviewRequest.frontmatter.parentReviewRequestLocalId, aliases)
    || sameIdOrPrefix(reviewRequest.frontmatter.parentReviewRequestId, aliases)
    || sameIdOrPrefix(reviewRequest.frontmatter.rootReviewRequestLocalId, aliases)
    || sameIdOrPrefix(reviewRequest.frontmatter.rootReviewRequestId, aliases),
  )
}

function memoryForSubject(workspace: ViewWorkspace, subjectType: string, subject: ViewRecord): MemoryFile[] {
  const aliases = idAliases(subject)
  return workspace.memory.filter(({ entry }) => {
    const tags = entry.tags ?? []
    return (
      entry.subjectType === subjectType && Boolean(entry.subjectId && aliases.includes(entry.subjectId))
    ) || aliases.some((id) => tags.some((tag) => tag.endsWith(`:${id}`) || tag === id))
  })
}

function discussionsForSubject(workspace: ViewWorkspace, subjectType: string, subject: ViewRecord): DiscussionTopicRecord[] {
  const aliases = idAliases(subject)
  return workspace.discussions.filter((record) =>
    record.topic.subjectType === subjectType && Boolean(record.topic.subjectId && aliases.includes(record.topic.subjectId)),
  )
}

function resolveTaskColumnName(task: ViewRecord, boards: ViewRecord[]): string {
  const board = boards.find((candidate) =>
    sameIdOrPrefix(task.frontmatter.boardLocalId, idAliases(candidate)) || sameIdOrPrefix(task.frontmatter.boardId, idAliases(candidate)),
  )
  if (board) {
    const columnId = stringValue(task.frontmatter.boardColumnId)
    const columnSlug = stringValue(task.frontmatter.columnSlug)
    const match = boardColumns(board).find((column) =>
      stringValue(column.id) === columnId
      || stringValue(column.slug) === columnSlug
      || stringValue(column.slug) === columnId,
    )
    if (match) return stringValue(match.name) ?? stringValue(match.slug) ?? '-'
  }
  const fallback = stringValue(task.frontmatter.columnSlug) ?? stringValue(task.frontmatter.boardColumnId)
  if (!fallback) return '-'
  const boardSlugFromTask = stringValue(task.frontmatter.boardSlug)
  if (boardSlugFromTask && fallback.startsWith(`${boardSlugFromTask}-`)) {
    return capitalize(fallback.slice(boardSlugFromTask.length + 1))
  }
  const lastSegment = fallback.includes('-') ? fallback.slice(fallback.lastIndexOf('-') + 1) : fallback
  return capitalize(lastSegment)
}

function capitalize(value: string): string {
  if (!value) return value
  return value.charAt(0).toUpperCase() + value.slice(1)
}

function projectmanTable(
  context: ViewContext,
  records: ViewRecord[],
  options: ResolvedViewOptions,
  kind: string,
  statusResolver?: (record: ViewRecord) => string,
): string {
  const wide = options.style === 'wide'
  const headers = wide
    ? ['UID', 'Title', 'Slug', 'Status', 'State', 'Updated', 'Path']
    : ['UID', 'Title', 'Status', 'State', 'Updated']
  const rows = limitRows(records, options).map((record) => {
    const status = statusResolver?.(record)
      ?? stringValue(record.frontmatter.status)
      ?? stringValue(record.frontmatter.columnSlug)
      ?? stringValue(record.frontmatter.boardColumnId)
      ?? '-'
    const common = [
      shortId(recordId(record)),
      recordLabel(record),
      status,
      effectiveLocalState(record),
      formatDate(recordUpdatedAt(record)),
    ]
    return wide
      ? [common[0], common[1], recordSlug(record) ?? '-', common[2], common[3], common[4], linkFor(context, record, options)]
      : common
  })
  return [`## ${kind}`, '', renderMarkdownTable(headers, rows)].join('\n')
}

function memoryTable(memory: MemoryFile[], options: ResolvedViewOptions): string {
  return renderMarkdownTable(
    ['UID', 'Kind', 'Subject', 'Durability', 'Updated', 'Summary'],
    limitRows(memory, options).map(({ entry }) => [
      shortId(entry.memoryId ?? entry.id),
      entry.kind ?? '-',
      entry.subjectTitle ?? entry.subjectType ?? '-',
      entry.durability ?? '-',
      formatDate(entry.updatedAt ?? entry.createdAt),
      summarizeText(entry.content, options.style === 'wide' ? 160 : 90),
    ]),
  )
}

function discussionTable(records: DiscussionTopicRecord[], options: ResolvedViewOptions): string {
  return renderMarkdownTable(
    ['UID', 'Title', 'Status', 'Turns', 'Outputs', 'Subject', 'Updated'],
    limitRows(records, options).map((record) => [
      shortId(record.topic.localId),
      record.topic.title,
      record.topic.status,
      record.turns.length,
      record.outputs.length,
      record.topic.subjectType ? `${record.topic.subjectType}:${shortId(record.topic.subjectId)}` : '-',
      formatDate(record.topic.updatedAt),
    ]),
  )
}

function sessionStateNudgeTable(nudges: SessionStateNudge[], options: ResolvedViewOptions): string {
  return renderMarkdownTable(
    ['Kind', 'Message', 'Age', 'Action', 'Source'],
    limitRows(nudges, options).map((nudge) => [
      nudge.kind,
      nudge.message,
      nudge.ageMinutes === undefined ? '-' : `${nudge.ageMinutes}m`,
      nudge.action,
      nudge.sourcePath,
    ]),
  )
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

function displayValue(value: unknown, fallback = '-'): string {
  const normalized = stringValue(value)
  if (normalized) return normalized
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return fallback
}

function firstField(record: Record<string, unknown>, fields: string[]): string | undefined {
  for (const field of fields) {
    const value = displayValue(record[field], '')
    if (value) return value
  }
  return undefined
}

function tagList(value: unknown): string {
  if (!Array.isArray(value)) return '-'
  const tags = value.map((entry) => displayValue(entry, '')).filter(Boolean)
  return tags.length > 0 ? tags.join(', ') : '-'
}

function normalizeHostedScopeResolution(value: unknown): 'explicit' | 'cascade' | undefined {
  return value === 'explicit' || value === 'cascade' ? value : undefined
}

type HostedProjectContext = {
  scopeId?: string
  projectId?: string
  projectName?: string
  scopeResolution?: 'explicit' | 'cascade'
}

type HostedProjectInventory = {
  project: Record<string, unknown>
  docs: Record<string, unknown>[]
  skills: Record<string, unknown>[]
  prompts: Record<string, unknown>[]
  resources: Record<string, unknown>[]
}

function hostedProjectId(project: Record<string, unknown>): string | undefined {
  return firstField(project, ['id', 'projectId'])
}

function hostedProjectScopeId(project: Record<string, unknown>): string | undefined {
  return firstField(project, ['scopeId', 'id', 'projectId'])
}

function hostedProjectName(project: Record<string, unknown>): string {
  return firstField(project, ['name', 'slug', 'id', 'projectId']) ?? '-'
}

function hostedProjectSlug(project: Record<string, unknown>): string {
  return firstField(project, ['slug']) ?? '-'
}

function hostedRecordId(record: Record<string, unknown>, fields: string[] = ['id']): string | undefined {
  return firstField(record, fields)
}

function hostedRecordLabel(record: Record<string, unknown>, fields: string[] = ['name', 'title', 'slug', 'id']): string {
  return firstField(record, fields) ?? '-'
}

function hostedRecordUpdatedAt(record: Record<string, unknown>): unknown {
  return record.updatedAt ?? record.pulledAt ?? record.createdAt
}

function latestHostedUpdatedAt(records: Record<string, unknown>[]): unknown {
  let latest = ''
  for (const record of records) {
    const value = stringValue(hostedRecordUpdatedAt(record))
    if (value && value > latest) latest = value
  }
  return latest || undefined
}

function hostedViewFooter(source: string, records: Record<string, unknown>[]): ViewBuildResult['footer'] {
  return {
    source,
    localState: 'hosted-read-only',
    updatedAt: latestHostedUpdatedAt(records),
  }
}

function hostedLimitRows(records: Record<string, unknown>[], options: ResolvedViewOptions): Record<string, unknown>[] {
  return records.slice(0, options.maxItems)
}

function hostedGatewayOptions(
  options: ViewCliOptions,
  context: ViewContext,
  overrides: HostedProjectContext = {},
): AgentGatewayContextOptions {
  const hasScopedOverride = Boolean(overrides.scopeId || overrides.projectId)
  return {
    apiBaseUrl: options.apiBaseUrl,
    accessToken: options.accessToken,
    refreshToken: options.refreshToken,
    timeoutMs: options.timeoutMs,
    tenantId: options.tenantId,
    locale: options.locale,
    fallbackLocale: options.fallbackLocale,
    scopeId: overrides.scopeId ?? options.scopeId,
    scopeResolution: overrides.scopeResolution ?? normalizeHostedScopeResolution(options.scopeResolution),
    projectId: overrides.projectId ?? options.projectId ?? context.projectId,
    projectName: overrides.projectName ?? (hasScopedOverride ? undefined : options.projectName ?? context.projectName),
  }
}

async function invokeHostedList(
  apiState: CliApiClientState,
  options: ViewCliOptions,
  context: ViewContext,
  toolId: string,
  input: Record<string, unknown>,
  overrides: HostedProjectContext = {},
): Promise<Record<string, unknown>[]> {
  const payload = await invokeHostedToolWithApiState(apiState, {
    ...hostedGatewayOptions(options, context, overrides),
    toolId,
    input,
    disableDurableActivityLog: true,
  })
  return unwrapListItems(unwrapHostedToolResult(payload))
}

async function listHostedProjects(
  apiState: CliApiClientState,
  options: ViewCliOptions,
  context: ViewContext,
  viewOptions: ResolvedViewOptions,
): Promise<Record<string, unknown>[]> {
  return invokeHostedList(
    apiState,
    options,
    context,
    'agentspace.project.list-projects',
    {
      filter: {},
      options: compactPayload({ limit: viewOptions.maxItems }),
    },
  )
}

function hostedProjectContext(project: Record<string, unknown>, options: ViewCliOptions): HostedProjectContext {
  return {
    scopeId: hostedProjectScopeId(project),
    projectId: hostedProjectId(project),
    scopeResolution: normalizeHostedScopeResolution(options.scopeResolution) ?? 'explicit',
  }
}

function hostedScopedInput(
  project: Record<string, unknown>,
  options: ViewCliOptions,
  viewOptions: ResolvedViewOptions,
  params: { promptLimitInFilter?: boolean } = {},
): Record<string, unknown> {
  const projectContext = hostedProjectContext(project, options)
  const filter = compactPayload({
    scopeId: projectContext.scopeId,
    scopeResolution: projectContext.scopeResolution,
    limit: params.promptLimitInFilter ? viewOptions.maxItems : undefined,
  })
  return compactPayload({
    filter,
    options: params.promptLimitInFilter ? undefined : compactPayload({ limit: viewOptions.maxItems }),
  })
}

async function listHostedInventoryForProject(
  apiState: CliApiClientState,
  options: ViewCliOptions,
  context: ViewContext,
  viewOptions: ResolvedViewOptions,
  project: Record<string, unknown>,
): Promise<HostedProjectInventory> {
  const projectContext = hostedProjectContext(project, options)
  const [docs, skills, prompts, resources] = await Promise.all([
    invokeHostedList(apiState, options, context, 'docman.document.list', hostedScopedInput(project, options, viewOptions), projectContext),
    invokeHostedList(apiState, options, context, 'agentspace.skill.list-skills', hostedScopedInput(project, options, viewOptions), projectContext),
    invokeHostedList(apiState, options, context, 'agentspace.prompt.list-prompts', hostedScopedInput(project, options, viewOptions, { promptLimitInFilter: true }), projectContext),
    invokeHostedList(apiState, options, context, 'agentspace.resource.list-resources', hostedScopedInput(project, options, viewOptions), projectContext),
  ])
  return { project, docs, skills, prompts, resources }
}

function matchesHostedProject(project: Record<string, unknown>, selector: string): boolean {
  const needle = selector.toLowerCase()
  const aliases = [
    hostedProjectId(project),
    hostedProjectScopeId(project),
    firstField(project, ['projectId']),
    firstField(project, ['slug']),
    firstField(project, ['name']),
  ].filter((entry): entry is string => Boolean(entry))

  return aliases.some((alias) => {
    const normalized = alias.toLowerCase()
    return normalized === needle || (needle.length >= 8 && normalized.startsWith(needle))
  })
}

function hostedProjectTable(records: Record<string, unknown>[], options: ResolvedViewOptions): string {
  return renderMarkdownTable(
    ['UID', 'Name', 'Slug', 'Status', 'Visibility', 'Type', 'Scope', 'Updated'],
    hostedLimitRows(records, options).map((project) => [
      shortId(hostedProjectId(project) ?? hostedProjectScopeId(project)),
      hostedProjectName(project),
      hostedProjectSlug(project),
      displayValue(project.status),
      displayValue(project.visibility),
      displayValue(project.projectType),
      shortId(hostedProjectScopeId(project)),
      formatDate(hostedRecordUpdatedAt(project)),
    ]),
  )
}

function hostedInventoryProjectTable(inventories: HostedProjectInventory[], options: ResolvedViewOptions): string {
  return renderMarkdownTable(
    ['UID', 'Name', 'Slug', 'Status', 'Docs', 'Skills', 'Prompts', 'Resources'],
    hostedLimitRows(inventories.map((inventory) => inventory.project), options).map((project) => {
      const inventory = inventories.find((entry) => entry.project === project)!
      return [
        shortId(hostedProjectId(project) ?? hostedProjectScopeId(project)),
        hostedProjectName(project),
        hostedProjectSlug(project),
        displayValue(project.status),
        inventory.docs.length,
        inventory.skills.length,
        inventory.prompts.length,
        inventory.resources.length,
      ]
    }),
  )
}

function hostedDocsTable(records: Record<string, unknown>[], options: ResolvedViewOptions): string {
  return renderMarkdownTable(
    ['UID', 'Title', 'Slug', 'Group', 'Status', 'Version', 'Updated'],
    hostedLimitRows(records, options).map((doc) => [
      shortId(hostedRecordId(doc, ['documentVersionId', 'currentVersionId', 'documentId', 'id'])),
      hostedRecordLabel(doc, ['title', 'name', 'slug', 'id']),
      displayValue(doc.slug),
      displayValue(doc.groupUid ?? doc.groupId),
      displayValue(doc.status),
      displayValue(doc.documentVersion ?? doc.version ?? doc.currentVersionId),
      formatDate(hostedRecordUpdatedAt(doc)),
    ]),
  )
}

function hostedSkillsTable(records: Record<string, unknown>[], options: ResolvedViewOptions): string {
  return renderMarkdownTable(
    ['UID', 'Name', 'Status', 'Version', 'Tags', 'Updated'],
    hostedLimitRows(records, options).map((skill) => [
      shortId(hostedRecordId(skill, ['id', 'skillId'])),
      hostedRecordLabel(skill, ['name', 'title', 'slug', 'id']),
      displayValue(skill.status),
      shortId(skill.currentVersionId ?? skill.skillVersionId),
      tagList(skill.tags),
      formatDate(hostedRecordUpdatedAt(skill)),
    ]),
  )
}

function hostedPromptsTable(records: Record<string, unknown>[], options: ResolvedViewOptions): string {
  return renderMarkdownTable(
    ['UID', 'Name', 'Status', 'Version', 'Tags', 'Updated'],
    hostedLimitRows(records, options).map((prompt) => [
      shortId(hostedRecordId(prompt, ['id', 'promptId'])),
      hostedRecordLabel(prompt, ['name', 'title', 'slug', 'id']),
      displayValue(prompt.status),
      shortId(prompt.currentVersionId ?? prompt.promptVersionId),
      tagList(prompt.tags),
      formatDate(hostedRecordUpdatedAt(prompt)),
    ]),
  )
}

function hostedResourcesTable(records: Record<string, unknown>[], options: ResolvedViewOptions): string {
  return renderMarkdownTable(
    ['UID', 'Name', 'Type', 'Ref', 'URI', 'Updated'],
    hostedLimitRows(records, options).map((resource) => [
      shortId(hostedRecordId(resource, ['id', 'resourceId'])),
      hostedRecordLabel(resource, ['name', 'title', 'uri', 'id']),
      displayValue(resource.resourceType ?? resource.type),
      displayValue(resource.refType && resource.refId ? `${displayValue(resource.refType)}:${displayValue(resource.refId)}` : resource.refType ?? resource.refId),
      summarizeText(resource.uri, 80),
      formatDate(hostedRecordUpdatedAt(resource)),
    ]),
  )
}

function hostedTable(records: ViewRecord[], options: ResolvedViewOptions): string {
  return renderMarkdownTable(
    ['UID', 'Name', 'Source', 'Version', 'Path'],
    limitRows(records, options).map((record) => [
      shortId(record.frontmatter.remoteId ?? recordId(record)),
      recordLabel(record),
      stringValue(record.frontmatter.sourceProjectSlug) ?? stringValue(record.frontmatter.sourceProjectName) ?? '-',
      shortId(record.frontmatter.currentVersionId),
      options.linkMode === 'none' ? '-' : record.relativePath,
    ]),
  )
}

function docTable(records: ViewRecord[], options: ResolvedViewOptions): string {
  return renderMarkdownTable(
    ['UID', 'Title', 'Group', 'Version', 'Pulled', 'Path'],
    limitRows(records, options).map((record) => [
      shortId(record.frontmatter.documentVersionId ?? record.frontmatter.documentId),
      recordLabel(record),
      stringValue(record.frontmatter.groupUid) ?? '-',
      record.frontmatter.documentVersion ?? '-',
      formatDate(record.frontmatter.pulledAt),
      options.linkMode === 'none' ? '-' : record.relativePath,
    ]),
  )
}

function buildDocPageRecords(repoRoot: string, docs: ViewRecord[]): ViewRecord[] {
  const pages: ViewRecord[] = []
  for (const doc of docs) {
    const body = stripDocMirrorBody(doc.body)
    const headings = [...body.matchAll(/^(#{1,4})\s+(.+)$/gm)]
    const slugCounts = new Map<string, number>()
    headings.forEach((match, index) => {
      const fullMatch = match[0]
      const marker = match[1] ?? '#'
      const rawTitle = (match[2] ?? '').replace(/\s+#*$/, '').trim()
      const start = match.index ?? 0
      const next = headings.slice(index + 1).find((candidate) => (candidate[1] ?? '#').length <= marker.length)
      const end = next?.index ?? body.length
      const baseSlug = slugify(rawTitle)
      const occurrence = slugCounts.get(baseSlug) ?? 0
      slugCounts.set(baseSlug, occurrence + 1)
      const slug = occurrence === 0 ? baseSlug : `${baseSlug}-${occurrence + 1}`
      const docKey = stringValue(doc.frontmatter.documentVersionId)
        ?? stringValue(doc.frontmatter.documentId)
        ?? doc.relativePath
      const filePath = `${doc.filePath}#${slug}`
      pages.push({
        filePath,
        relativePath: `${repoRelative(repoRoot, doc.filePath)}#${slug}`,
        frontmatter: {
          entityType: 'docman.page-slice',
          localId: `${docKey}#${slug}`,
          id: `${docKey}#${slug}`,
          slug,
          title: rawTitle,
          headingLevel: marker.length,
          documentId: doc.frontmatter.documentId,
          documentVersionId: doc.frontmatter.documentVersionId,
          documentTitle: recordLabel(doc),
          groupUid: doc.frontmatter.groupUid,
          pulledAt: doc.frontmatter.pulledAt,
          sourcePath: doc.relativePath,
        },
        body: body.slice(start, end).trim() || fullMatch,
      })
    })
  }
  return pages
}

function stripDocMirrorBody(body: string): string {
  return body.replace(DOCMAN_MIRROR_COMMENT, '').replace(RELEASE_NOTES_LINE, '\n').trim()
}

function projectCounts(workspace: ViewWorkspace, options?: ResolvedViewOptions): Record<string, number> {
  const boards = options ? visibleArchiveRecords(workspace.boards, options) : workspace.boards
  const sprints = options ? visibleArchiveRecords(workspace.sprints, options) : workspace.sprints
  return {
    boards: boards.length,
    tasks: workspace.tasks.length,
    sprints: sprints.length,
    archivedBoards: workspace.boards.filter(isArchiveMarked).length,
    archivedSprints: workspace.sprints.filter(isArchiveMarked).length,
    issues: workspace.issues.length,
    feedback: workspace.feedback.length,
    reviewRequests: workspace.reviewRequests.length,
    memory: workspace.memory.length,
    discussions: workspace.discussions.length,
    experience: workspace.experience.length,
    skills: workspace.skills.length,
    prompts: workspace.prompts.length,
    docs: workspace.docs.length,
  }
}

async function buildProjectsView(context: ViewContext, options: ResolvedViewOptions): Promise<ViewBuildResult> {
  const [config, workspace] = await Promise.all([readAopsRepoConfig(context.repoRoot), loadWorkspace(context)])
  const projects = config?.projects ?? []
  const rows = projects.map((project) => [
    shortId(project.projectId ?? project.scopeId),
    project.name,
    project.slug ?? '-',
    project.projectId ?? '-',
    project.scopeId ?? project.projectId ?? '-',
    context.projectName === project.name ? 'yes' : 'no',
  ])
  return {
    result: { projects, counts: projectCounts(workspace, options) },
    markdown: [
      '# AOPS Projects',
      '',
      renderMarkdownTable(['UID', 'Name', 'Slug', 'Project ID', 'Scope ID', 'Active'], rows),
      '',
      '## Current Repo Counts',
      '',
      renderMarkdownTable(['Surface', 'Count'], Object.entries(projectCounts(workspace, options))),
    ].join('\n'),
    footer: commonFooter('.aops/aops.config.json'),
  }
}

async function buildHostedProjectsView(
  apiState: CliApiClientState,
  context: ViewContext,
  options: ResolvedViewOptions,
  cliOptions: ViewCliOptions,
): Promise<ViewBuildResult> {
  const projects = await listHostedProjects(apiState, cliOptions, context, options)
  return {
    surface: HOSTED_VIEW_SURFACE,
    result: {
      count: projects.length,
      data: projects,
    },
    markdown: [
      '# Hosted Projects',
      '',
      hostedProjectTable(projects, options),
    ].join('\n'),
    footer: hostedViewFooter('hosted:agentspace.project.list-projects', projects),
  }
}

async function buildHostedInventoryView(
  apiState: CliApiClientState,
  context: ViewContext,
  options: ResolvedViewOptions,
  cliOptions: ViewCliOptions,
): Promise<ViewBuildResult> {
  const allProjects = await listHostedProjects(apiState, cliOptions, context, options)
  const selector = stringValue(cliOptions.hostedProject)
  const projects = selector ? allProjects.filter((project) => matchesHostedProject(project, selector)) : allProjects
  if (selector && projects.length === 0) {
    throw new Error(`Hosted project not found: ${selector}`)
  }
  if (selector && projects.length > 1) {
    const matches = projects.map((project) => `${hostedProjectName(project)} (${hostedProjectId(project) ?? hostedProjectScopeId(project)})`).join(', ')
    throw new Error(`Hosted project selector is ambiguous: ${selector}. Matches: ${matches}`)
  }

  const inventories = await Promise.all(
    projects.map((project) => listHostedInventoryForProject(apiState, cliOptions, context, options, project)),
  )
  const relatedRecords = inventories.flatMap((inventory) => [
    inventory.project,
    ...inventory.docs,
    ...inventory.skills,
    ...inventory.prompts,
    ...inventory.resources,
  ])
  const lines = [
    '# Hosted Project Inventory',
    '',
    '## Projects',
    '',
    hostedInventoryProjectTable(inventories, options),
  ]

  for (const inventory of inventories) {
    const project = inventory.project
    lines.push(
      '',
      `## ${hostedProjectName(project)} [UID ${shortId(hostedProjectId(project) ?? hostedProjectScopeId(project))}]`,
      '',
      renderKeyValues([
        ['projectId', hostedProjectId(project) ?? '-'],
        ['scopeId', hostedProjectScopeId(project) ?? '-'],
        ['slug', hostedProjectSlug(project)],
        ['status', displayValue(project.status)],
        ['scopeResolution', normalizeHostedScopeResolution(cliOptions.scopeResolution) ?? 'explicit'],
      ]),
      '',
      '### Documents',
      '',
      hostedDocsTable(inventory.docs, options),
      '',
      '### Skills',
      '',
      hostedSkillsTable(inventory.skills, options),
      '',
      '### Prompts',
      '',
      hostedPromptsTable(inventory.prompts, options),
      '',
      '### Resources',
      '',
      hostedResourcesTable(inventory.resources, options),
    )
  }

  return {
    surface: HOSTED_VIEW_SURFACE,
    result: {
      count: inventories.length,
      projects: inventories.map((inventory) => ({
        project: inventory.project,
        counts: {
          docs: inventory.docs.length,
          skills: inventory.skills.length,
          prompts: inventory.prompts.length,
          resources: inventory.resources.length,
        },
      })),
      data: inventories,
    },
    markdown: lines.join('\n'),
    footer: hostedViewFooter('hosted:agentspace+docman', relatedRecords),
  }
}

async function buildProjectView(context: ViewContext, options: ResolvedViewOptions, selector?: string): Promise<ViewBuildResult> {
  const [config, workspace] = await Promise.all([readAopsRepoConfig(context.repoRoot), loadWorkspace(context)])
  const projects = config?.projects ?? []
  const chosen = selector
    ? projects.find((project) => [project.projectId, project.scopeId, project.name, project.slug].some((value) => stringValue(value)?.toLowerCase() === selector.toLowerCase()))
    : projects.find((project) => project.projectId === context.projectId || project.name === context.projectName) ?? projects[0]
  if (!chosen) throw new ViewSelectorError('missing', selector ?? '(current project)', [])
  return {
    result: { project: chosen, counts: projectCounts(workspace, options) },
    markdown: [
      `# Project: ${chosen.name}`,
      '',
      renderKeyValues([
        ['projectId', chosen.projectId],
        ['scopeId', chosen.scopeId ?? chosen.projectId],
        ['slug', chosen.slug ?? '-'],
        ['repoRoot', context.repoRoot],
      ]),
      '',
      '## Counts',
      '',
      renderMarkdownTable(['Surface', 'Count'], Object.entries(projectCounts(workspace, options))),
    ].join('\n'),
    footer: commonFooter('.aops/aops.config.json'),
  }
}

async function buildDashboardView(context: ViewContext, options: ResolvedViewOptions): Promise<ViewBuildResult> {
  const workspace = await loadWorkspace(context)
  const recentMemory = workspace.memory.slice(0, Math.min(5, options.maxItems))
  const recentDiscussions = workspace.discussions.slice(0, Math.min(5, options.maxItems))
  return {
    result: {
      counts: projectCounts(workspace, options),
      boards: visibleArchiveRecords(workspace.boards, options).map(materializeRecord),
      openIssues: workspace.issues.filter((issue) => stringValue(issue.frontmatter.status) !== 'resolved').map(materializeRecord),
      pendingReviewRequests: workspace.reviewRequests.filter((reviewRequest) => !['accepted', 'closed', 'cancelled'].includes(stringValue(reviewRequest.frontmatter.status) ?? '')).map(materializeRecord),
      sessionStateNudges: workspace.sessionStateNudges,
    },
    markdown: [
      '# AOPS Repo-First Dashboard',
      '',
      renderMarkdownTable(['Surface', 'Count'], Object.entries(projectCounts(workspace, options))),
      '',
      projectmanTable(context, visibleArchiveRecords(workspace.boards, options), { ...options, maxItems: Math.min(10, options.maxItems) }, 'Boards'),
      '',
      projectmanTable(context, workspace.tasks, { ...options, maxItems: Math.min(10, options.maxItems) }, 'Recent Tasks', (record) => resolveTaskColumnName(record, workspace.boards)),
      '',
      '## Open Issues',
      '',
      projectmanTable(context, workspace.issues.filter((issue) => stringValue(issue.frontmatter.status) !== 'resolved'), options, 'Issues'),
      '',
      '## Pending Review Requests',
      '',
      projectmanTable(context, workspace.reviewRequests.filter((reviewRequest) => !['accepted', 'closed', 'cancelled'].includes(stringValue(reviewRequest.frontmatter.status) ?? '')), options, 'Review Requests'),
      ...(workspace.sessionStateNudges.length > 0
        ? [
            '',
            '## Session State Nudges',
            '',
            sessionStateNudgeTable(workspace.sessionStateNudges, options),
          ]
        : []),
      '',
      '## Recent Memory',
      '',
      memoryTable(recentMemory, options),
      '',
      '## Recent Discussions',
      '',
      discussionTable(recentDiscussions, options),
    ].join('\n'),
    footer: commonFooter('.aops', [
      ...workspace.boards,
      ...workspace.tasks,
      ...workspace.sprints,
      ...workspace.issues,
      ...workspace.feedback,
      ...workspace.reviewRequests,
      ...workspace.docs,
    ]),
  }
}

function listView(
  context: ViewContext,
  options: ResolvedViewOptions,
  title: string,
  source: string,
  records: ViewRecord[],
  kind: string,
  statusResolver?: (record: ViewRecord) => string,
  meta: Record<string, unknown> = {},
): ViewBuildResult {
  return {
    result: {
      count: records.length,
      ...meta,
      data: records.map(materializeRecord),
    },
    markdown: [`# ${title}`, '', projectmanTable(context, records, options, kind, statusResolver)].join('\n'),
    footer: commonFooter(source, records),
  }
}

async function buildBoardView(context: ViewContext, options: ResolvedViewOptions, selector: string): Promise<ViewBuildResult> {
  const workspace = await loadWorkspace(context)
  const board = resolveRecordSelector(workspace.boards, selector)
  const tasks = tasksForBoard(workspace, board)
  const sprints = visibleArchiveRecords(tasks.flatMap((task) => sprintsForTask(workspace, task)), options)
  const aliases = idAliases(board)
  return {
    result: {
      board: materializeRecord(board),
      columns: boardColumns(board),
      tasks: tasks.map(materializeRecord),
      sprints: sprints.map(materializeRecord),
    },
    markdown: [
      `# Board: ${recordLabel(board)}`,
      '',
      renderKeyValues([
        ['uid', recordId(board)],
        ['slug', recordSlug(board) ?? '-'],
        ['description', summarizeText(board.frontmatter.description, options.style === 'wide' ? 240 : 140)],
        ['tasks', tasks.length],
        ['sprints', sprints.length],
      ]),
      '',
      '## Columns',
      '',
      renderMarkdownTable(['UID', 'Name', 'Slug', 'Position'], boardColumns(board).map((column) => [
        column.id ?? '-',
        column.name ?? '-',
        column.slug ?? '-',
        column.position ?? '-',
      ])),
      '',
      projectmanTable(context, tasks, options, 'Tasks', (record) => resolveTaskColumnName(record, workspace.boards)),
      '',
      projectmanTable(context, sprints, options, 'Sprints'),
      '',
      `Aliases: ${aliases.join(', ') || '-'}`,
    ].join('\n'),
    footer: commonFooter(board.relativePath, [board, ...tasks, ...sprints]),
  }
}

async function buildTaskView(context: ViewContext, options: ResolvedViewOptions, selector: string): Promise<ViewBuildResult> {
  const workspace = await loadWorkspace(context)
  const task = resolveRecordSelector(workspace.tasks, selector)
  const board = workspace.boards.find((candidate) =>
    sameIdOrPrefix(task.frontmatter.boardLocalId, idAliases(candidate)) || sameIdOrPrefix(task.frontmatter.boardId, idAliases(candidate)),
  )
  const sprints = visibleArchiveRecords(sprintsForTask(workspace, task), options)
  const issues = issuesForSubject(workspace, task)
  const feedback = feedbackForSubject(workspace, task)
  const reviewRequests = reviewRequestsForSubject(workspace, task)
  const memory = memoryForSubject(workspace, 'projectman.kanban-task', task)
  const discussions = discussionsForSubject(workspace, 'projectman.kanban-task', task)
  return {
    result: {
      task: materializeRecord(task),
      board: board ? materializeRecord(board) : null,
      sprints: sprints.map(materializeRecord),
      issues: issues.map(materializeRecord),
      feedback: feedback.map(materializeRecord),
      reviewRequests: reviewRequests.map(materializeRecord),
      memory: memory.map(({ entry }) => entry),
      discussions: discussions.map(normalizeDiscussionTopicRecord),
    },
    markdown: [
      `# Task: ${recordLabel(task)}`,
      '',
      renderKeyValues([
        ['uid', recordId(task)],
        ['board', board ? `${recordLabel(board)} [UID ${shortId(recordId(board))}]` : '-'],
        ['column', stringValue(task.frontmatter.columnSlug) ?? stringValue(task.frontmatter.boardColumnId) ?? '-'],
        ['progress', task.frontmatter.progress ?? '-'],
        ['description', summarizeText(task.frontmatter.description, options.style === 'wide' ? 300 : 160)],
      ]),
      '',
      projectmanTable(context, sprints, options, 'Sprints'),
      '',
      projectmanTable(context, issues, options, 'Issues'),
      '',
      projectmanTable(context, feedback, options, 'Feedback'),
      '',
      projectmanTable(context, reviewRequests, options, 'Review Requests'),
      '',
      '## Related Memory',
      '',
      memoryTable(memory, options),
      '',
      '## Related Discussions',
      '',
      discussionTable(discussions, options),
    ].join('\n'),
    footer: commonFooter(task.relativePath, [task, ...sprints, ...issues, ...feedback, ...reviewRequests]),
  }
}

async function buildSprintView(context: ViewContext, options: ResolvedViewOptions, selector: string): Promise<ViewBuildResult> {
  const workspace = await loadWorkspace(context)
  const sprint = resolveRecordSelector(workspace.sprints, selector)
  const task = workspace.tasks.find((candidate) =>
    sameIdOrPrefix(sprint.frontmatter.kanbanTaskLocalId, idAliases(candidate)) || sameIdOrPrefix(sprint.frontmatter.kanbanTaskId, idAliases(candidate)),
  )
  const issues = issuesForSubject(workspace, sprint)
  const feedback = feedbackForSubject(workspace, sprint)
  const reviewRequests = reviewRequestsForSubject(workspace, sprint)
  const memory = memoryForSubject(workspace, 'projectman.sprint', sprint)
  const discussions = discussionsForSubject(workspace, 'projectman.sprint', sprint)
  const phases = recordArray(sprint.frontmatter.phases)
  const microtaskRows = phases.flatMap((phase, phaseIndex) =>
    recordArray(phase.microtasks).map((microtask, microIndex) => [
      microtaskUid(microtask, phase, phaseIndex, microIndex),
      phase.name ?? '-',
      microtask.title ?? '-',
      microtask.status ?? '-',
      summarizeText(microtask.notes, 90),
    ]),
  )
  return {
    result: {
      sprint: materializeRecord(sprint),
      task: task ? materializeRecord(task) : null,
      phases,
      issues: issues.map(materializeRecord),
      feedback: feedback.map(materializeRecord),
      reviewRequests: reviewRequests.map(materializeRecord),
      memory: memory.map(({ entry }) => entry),
      discussions: discussions.map(normalizeDiscussionTopicRecord),
    },
    markdown: [
      `# Sprint: ${recordLabel(sprint)}`,
      '',
      renderKeyValues([
        ['uid', recordId(sprint)],
        ['status', stringValue(sprint.frontmatter.status) ?? '-'],
        ['task', task ? `${recordLabel(task)} [UID ${shortId(recordId(task))}]` : '-'],
        ['goal', summarizeText(sprint.frontmatter.goal, options.style === 'wide' ? 300 : 180)],
      ]),
      '',
      '## Microtasks',
      '',
      renderMarkdownTable(['UID', 'Phase', 'Title', 'Status', 'Notes'], limitRows(microtaskRows, options)),
      '',
      projectmanTable(context, issues, options, 'Issues'),
      '',
      projectmanTable(context, feedback, options, 'Feedback'),
      '',
      projectmanTable(context, reviewRequests, options, 'Review Requests'),
      '',
      '## Related Memory',
      '',
      memoryTable(memory, options),
      '',
      '## Related Discussions',
      '',
      discussionTable(discussions, options),
    ].join('\n'),
    footer: commonFooter(sprint.relativePath, [sprint, ...issues, ...feedback, ...reviewRequests]),
  }
}

async function buildMemoryView(
  context: ViewContext,
  options: ResolvedViewOptions,
  params: { resumeOnly?: boolean; filter?: MemoryFilterOptions } = {},
): Promise<ViewBuildResult> {
  const workspace = await loadWorkspace(context)
  let entries = params.resumeOnly
    ? workspace.memory.filter(({ entry }) => ['resume', 'kickoff', 'closeout'].includes(entry.kind ?? ''))
    : workspace.memory

  const filter = params.filter ?? {}
  if (filter.durability) {
    entries = entries.filter(({ entry }) => matchesEqualCi(entry.durability, filter.durability!))
  }
  if (filter.kind) {
    entries = entries.filter(({ entry }) => matchesEqualCi(entry.kind, filter.kind!))
  }
  if (filter.subject) {
    const aliases = resolveMemorySubjectAliases(filter.subject)
    entries = entries.filter(({ entry }) => entry.subjectType
      ? aliases.some((alias) => entry.subjectType?.toLowerCase() === alias.toLowerCase())
      : false,
    )
  }
  if (filter.id) {
    const needle = filter.id.toLowerCase()
    entries = entries.filter(({ entry }) => {
      const sid = entry.subjectId?.toLowerCase()
      if (!sid) return false
      if (sid === needle) return true
      return needle.length >= 8 && sid.startsWith(needle)
    })
  }

  const latest = latestMemory(entries)
  const titleSuffix = [
    filter.durability ? `durability=${filter.durability}` : null,
    filter.kind ? `kind=${filter.kind}` : null,
    filter.subject ? `subject=${filter.subject}` : null,
    filter.id ? `id=${filter.id}` : null,
  ].filter(Boolean).join(', ')
  const heading = params.resumeOnly ? 'AOPS Resume Memory' : 'AOPS Memory'
  return {
    result: {
      count: entries.length,
      filter,
      data: entries.map(({ entry, filePath }) => ({ ...entry, relativePath: repoRelative(context.repoRoot, filePath) })),
    },
    markdown: [
      `# ${heading}${titleSuffix ? ` (${titleSuffix})` : ''}`,
      '',
      memoryTable(entries, options),
    ].join('\n'),
    footer: {
      source: repoFirstSource(context, 'agentspace', 'memory', 'items'),
      localState: '-',
      updatedAt: latest?.entry.updatedAt ?? latest?.entry.createdAt,
    },
  }
}

async function buildDiscussionsView(
  context: ViewContext,
  options: ResolvedViewOptions,
  filter: DiscussionFilterOptions = {},
): Promise<ViewBuildResult> {
  const workspace = await loadWorkspace(context)
  let records = workspace.discussions
  if (filter.status) {
    records = records.filter((record) => matchesEqualCi(record.topic.status, filter.status!))
  }
  if (filter.agent) {
    const needle = filter.agent.toLowerCase()
    records = records.filter((record) => record.topic.participants.some((participant) => participant.toLowerCase() === needle))
  }
  const visibleRecords = limitRows(records, options)
  return {
    result: {
      count: records.length,
      shown: visibleRecords.length,
      hasMore: visibleRecords.length < records.length,
      filter,
      data: visibleRecords.map(normalizeDiscussionTopicRecord),
    },
    markdown: [`# ${filterTitle('AOPS Discussions', filter as Record<string, string | undefined>)}`, '', discussionTable(records, options)].join('\n'),
    footer: {
      source: repoFirstSource(context, 'agentspace', 'discussions', 'topics'),
      localState: '-',
      updatedAt: records[0]?.topic.updatedAt,
    },
  }
}

async function buildDiscussionView(context: ViewContext, options: ResolvedViewOptions, selector: string): Promise<ViewBuildResult> {
  const workspace = await loadWorkspace(context)
  const fakeRecords = workspace.discussions.map((record) => discussionRecordAsViewRecord(context.repoRoot, record))
  const selected = resolveRecordSelector(fakeRecords, selector)
  const record = workspace.discussions.find((candidate) => candidate.dirName === selected.relativePath || candidate.topic.localId === selected.frontmatter.localId)
  if (!record) throw new ViewSelectorError('missing', selector, fakeRecords.map(candidateFromRecord))
  return {
    result: {
      topic: normalizeDiscussionTopicRecord(record),
      turns: record.turns.map(({ turn }) => normalizeDiscussionTurnRecord(turn)),
      outputs: record.outputs.map(({ output }) => normalizeDiscussionOutputRecord(output)),
    },
    markdown: [
      `# Discussion: ${record.topic.title}`,
      '',
      renderKeyValues([
        ['uid', record.topic.localId],
        ['status', record.topic.status],
        ['participants', record.topic.participants.join(', ')],
        ['subject', record.topic.subjectType ? `${record.topic.subjectType}:${record.topic.subjectId ?? '-'}` : '-'],
        ['question', summarizeText(record.topic.question, 220)],
      ]),
      '',
      '## Turns',
      '',
      renderMarkdownTable(
        options.style === 'wide'
          ? ['Seq', 'Agent', 'Kind', 'To', 'Created', 'Summary']
          : ['Seq', 'Agent', 'Kind', 'Created', 'Summary'],
        limitRows(record.turns, options).map(({ turn }) => {
          const base = [turn.seq, turn.agentId, turn.kind, formatDate(turn.createdAt), summarizeText(turn.content, options.style === 'wide' ? 180 : 100)]
          return options.style === 'wide'
            ? [base[0], base[1], base[2], turn.addressedTo ?? '-', base[3], base[4]]
            : base
        }),
      ),
      '',
      '## Outputs',
      '',
      renderMarkdownTable(['Kind', 'Agent', 'Updated', 'Summary'], limitRows(record.outputs, options).map(({ output }) => [
        output.outputKind,
        output.agentId ?? '-',
        formatDate(output.updatedAt),
        summarizeText(output.content, options.style === 'wide' ? 180 : 100),
      ])),
    ].join('\n'),
    footer: {
      source: repoFirstSource(context, 'agentspace', 'discussions', 'topics', record.dirName),
      localState: '-',
      updatedAt: record.topic.updatedAt,
    },
  }
}

function discussionRecordAsViewRecord(repoRoot: string, record: DiscussionTopicRecord): ViewRecord {
  return {
    filePath: record.topicFilePath,
    relativePath: record.dirName,
    frontmatter: {
      entityType: 'agentspace.discussion-topic',
      localId: record.topic.localId,
      id: record.topic.localId,
      slug: record.dirName,
      title: record.topic.title,
      updatedAt: record.topic.updatedAt,
    },
    body: record.topic.question ?? '',
  }
}

async function buildExperienceView(
  context: ViewContext,
  options: ResolvedViewOptions,
  filter: ExperienceFilterOptions = {},
): Promise<ViewBuildResult> {
  const workspace = await loadWorkspace(context)
  let entries = workspace.experience
  if (filter.type) {
    entries = entries.filter(({ item }) => matchesEqualCi(item.type, filter.type!))
  }
  if (filter.area) {
    const needle = filter.area.toLowerCase()
    entries = entries.filter(({ item }) => item.areas.some((area) => area.toLowerCase() === needle))
  }
  return {
    result: {
      count: entries.length,
      filter,
      data: entries.map(({ item, filePath }) => ({ ...item, relativePath: repoRelative(context.repoRoot, filePath) })),
    },
    markdown: [
      `# ${filterTitle('AOPS Experience', filter as Record<string, string | undefined>)}`,
      '',
      renderMarkdownTable(['UID', 'Type', 'Title', 'Areas', 'Updated', 'Summary'], limitRows(entries, options).map(({ item }) => [
        shortId(item.localId),
        item.type,
        item.title,
        item.areas.join(', ') || '-',
        formatDate(item.updatedAt),
        summarizeText(item.content, 100),
      ])),
    ].join('\n'),
    footer: {
      source: repoFirstSource(context, 'agentspace', 'experience', 'items'),
      localState: '-',
      updatedAt: entries[0]?.item.updatedAt,
    },
  }
}

function hostedView(title: string, source: string, records: ViewRecord[], options: ResolvedViewOptions): ViewBuildResult {
  return {
    result: {
      count: records.length,
      data: records.map(materializeRecord),
    },
    markdown: [`# ${title}`, '', hostedTable(records, options)].join('\n'),
    footer: commonFooter(source, records),
  }
}

async function buildDocView(context: ViewContext, options: ResolvedViewOptions, selector: string): Promise<ViewBuildResult> {
  const workspace = await loadWorkspace(context)
  const doc = resolveRecordSelector(workspace.docs, selector)
  const pages = workspace.docPages.filter((page) => page.frontmatter.sourcePath === doc.relativePath)
  return {
    result: {
      document: materializeRecord(doc),
      pages: pages.map(materializeRecord),
    },
    markdown: [
      `# Doc: ${recordLabel(doc)}`,
      '',
      renderKeyValues([
        ['documentId', doc.frontmatter.documentId],
        ['documentVersionId', doc.frontmatter.documentVersionId],
        ['groupUid', doc.frontmatter.groupUid],
        ['version', doc.frontmatter.documentVersion],
        ['path', doc.relativePath],
      ]),
      '',
      '## Page Slices',
      '',
      renderMarkdownTable(['UID', 'Title', 'Slug'], limitRows(pages, options).map((page) => [
        shortId(page.frontmatter.localId),
        page.frontmatter.title ?? '-',
        page.frontmatter.slug ?? '-',
      ])),
      '',
      '## Preview',
      '',
      stripDocMirrorBody(doc.body).split('\n').slice(0, options.style === 'wide' ? 80 : 32).join('\n'),
    ].join('\n'),
    footer: commonFooter(doc.relativePath, [doc]),
  }
}

function resolveDocPage(workspace: ViewWorkspace, selector: string): ViewRecord {
  const split = selector.split('#')
  if (split.length >= 2) {
    const doc = resolveRecordSelector(workspace.docs, split[0] ?? '')
    const pageSelector = split.slice(1).join('#')
    const pages = workspace.docPages.filter((page) => page.frontmatter.sourcePath === doc.relativePath)
    return resolveDocPageSelector(pages, pageSelector)
  }
  return resolveDocPageSelector(workspace.docPages, selector)
}

function resolveDocPageSelector(pages: ViewRecord[], selector: string): ViewRecord {
  try {
    return resolveRecordSelector(pages, selector)
  } catch (error) {
    if (!(error instanceof ViewSelectorError) || error.code !== 'missing') throw error
    const normalized = slugify(selector)
    const suffixMatches = pages.filter((page) => {
      const slug = stringValue(page.frontmatter.slug)
      const title = slugify(stringValue(page.frontmatter.title) ?? '')
      return slug === normalized
        || title === normalized
        || Boolean(slug?.endsWith(`-${normalized}`))
        || title.endsWith(`-${normalized}`)
    })
    if (suffixMatches.length === 1) return suffixMatches[0]!
    if (suffixMatches.length > 1) {
      throw new ViewSelectorError('ambiguous', selector, suffixMatches.map(candidateFromRecord))
    }
    throw error
  }
}

async function buildDocPageView(context: ViewContext, options: ResolvedViewOptions, selector: string): Promise<ViewBuildResult> {
  const workspace = await loadWorkspace(context)
  const page = resolveDocPage(workspace, selector)
  return {
    result: {
      page: materializeRecord(page),
    },
    markdown: [
      `# Doc Page: ${recordLabel(page)}`,
      '',
      renderKeyValues([
        ['uid', page.frontmatter.localId],
        ['document', page.frontmatter.documentTitle],
        ['documentVersionId', page.frontmatter.documentVersionId],
        ['sourcePath', page.frontmatter.sourcePath],
      ]),
      '',
      page.body,
    ].join('\n'),
    footer: commonFooter(String(page.frontmatter.sourcePath ?? page.relativePath), [page]),
  }
}

async function buildDigestView(context: ViewContext, options: ResolvedViewOptions, digestOptions: ViewCliOptions): Promise<ViewBuildResult> {
  const depth = digestOptions.depth === 'deep' ? 'deep' : 'shallow'
  const maxItems = depth === 'deep' ? options.maxItems : Math.min(options.maxItems, 8)
  const digestViewOptions = { ...options, maxItems }
  if (digestOptions.project) return buildDashboardView(context, digestViewOptions)
  if (digestOptions.board) return buildBoardView(context, digestViewOptions, digestOptions.board)
  if (digestOptions.task) return buildTaskView(context, digestViewOptions, digestOptions.task)
  if (digestOptions.sprint) return buildSprintView(context, digestViewOptions, digestOptions.sprint)
  return buildDashboardView(context, digestViewOptions)
}

export async function runViewProjects(options: ViewCliOptions = {}): Promise<void> {
  await emitView('view.projects', options, buildProjectsView)
}

export async function runViewHostedProjects(options: ViewCliOptions = {}): Promise<void> {
  await emitHostedView('view.hosted-projects', options, buildHostedProjectsView)
}

export async function runViewHostedInventory(options: ViewCliOptions = {}): Promise<void> {
  await emitHostedView('view.hosted-inventory', options, buildHostedInventoryView)
}

export async function runViewProject(selector: string | undefined, options: ViewCliOptions = {}): Promise<void> {
  await emitView('view.project', options, (context, viewOptions) => buildProjectView(context, viewOptions, selector))
}

export async function runViewDashboard(options: ViewCliOptions = {}): Promise<void> {
  await emitView('view.dashboard', options, buildDashboardView)
}

export async function runViewBoards(options: ViewCliOptions = {}): Promise<void> {
  await emitView('view.boards', options, async (context, viewOptions) => {
    const workspace = await loadWorkspace(context)
    const records = visibleArchiveRecords(workspace.boards, viewOptions)
    return listView(
      context,
      viewOptions,
      'Projectman Boards',
      repoFirstSource(context, 'projectman', 'boards'),
      records,
      'Boards',
      undefined,
      archiveResultMeta(workspace.boards, records, viewOptions),
    )
  })
}

export async function runViewBoard(selector: string, options: ViewCliOptions = {}): Promise<void> {
  await emitView('view.board', options, (context, viewOptions) => buildBoardView(context, viewOptions, selector))
}

export async function runViewTasks(options: ViewCliOptions = {}): Promise<void> {
  await emitView('view.tasks', options, async (context, viewOptions) => {
    const workspace = await loadWorkspace(context)
    const filter = pmFilterFrom(options)
    const taskColumnResolver = (record: ViewRecord) => resolveTaskColumnName(record, workspace.boards)
    const filtered = applyPmFilters(workspace.tasks, workspace, filter, { taskColumnResolver })
    return listView(
      context,
      viewOptions,
      filterTitle('Projectman Tasks', filter),
      repoFirstSource(context, 'projectman', 'kanban-tasks'),
      filtered,
      'Tasks',
      taskColumnResolver,
    )
  })
}

export async function runViewTask(selector: string, options: ViewCliOptions = {}): Promise<void> {
  await emitView('view.task', options, (context, viewOptions) => buildTaskView(context, viewOptions, selector))
}

export async function runViewSprints(options: ViewCliOptions = {}): Promise<void> {
  await emitView('view.sprints', options, async (context, viewOptions) => {
    const workspace = await loadWorkspace(context)
    const filter = pmFilterFrom(options)
    const allFiltered = applyPmFilters(workspace.sprints, workspace, filter)
    const filtered = visibleArchiveRecords(allFiltered, viewOptions)
    return listView(
      context,
      viewOptions,
      filterTitle('Projectman Sprints', filter),
      repoFirstSource(context, 'projectman', 'sprints'),
      filtered,
      'Sprints',
      undefined,
      archiveResultMeta(allFiltered, filtered, viewOptions),
    )
  })
}

export async function runViewSprint(selector: string, options: ViewCliOptions = {}): Promise<void> {
  await emitView('view.sprint', options, (context, viewOptions) => buildSprintView(context, viewOptions, selector))
}

export async function runViewIssues(options: ViewCliOptions = {}): Promise<void> {
  await emitView('view.issues', options, async (context, viewOptions) => {
    const workspace = await loadWorkspace(context)
    const filter = pmFilterFrom(options)
    const filtered = applyPmFilters(workspace.issues, workspace, filter)
    return listView(context, viewOptions, filterTitle('Projectman Issues', filter), repoFirstSource(context, 'projectman', 'issues'), filtered, 'Issues')
  })
}

export async function runViewFeedback(options: ViewCliOptions = {}): Promise<void> {
  await emitView('view.feedback', options, async (context, viewOptions) => {
    const workspace = await loadWorkspace(context)
    const filter = pmFilterFrom(options)
    const filtered = applyPmFilters(workspace.feedback, workspace, filter)
    return listView(context, viewOptions, filterTitle('Projectman Feedback', filter), repoFirstSource(context, 'projectman', 'feedback'), filtered, 'Feedback')
  })
}

export async function runViewReviewRequests(options: ViewCliOptions = {}): Promise<void> {
  await emitView('view.review-requests', options, async (context, viewOptions) => {
    const workspace = await loadWorkspace(context)
    const filter = pmFilterFrom(options)
    const filtered = applyPmFilters(workspace.reviewRequests, workspace, filter)
    return listView(context, viewOptions, filterTitle('Projectman Review Requests', filter), repoFirstSource(context, 'projectman', 'review-requests'), filtered, 'Review Requests')
  })
}

function memoryFilterFrom(options: ViewCliOptions): MemoryFilterOptions {
  return {
    durability: stringValue(options.durability),
    kind: stringValue(options.kind),
    subject: stringValue(options.subject),
    id: stringValue(options.id),
  }
}

export async function runViewMemory(options: ViewCliOptions = {}): Promise<void> {
  await emitView('view.memory', options, (context, viewOptions) =>
    buildMemoryView(context, viewOptions, { resumeOnly: false, filter: memoryFilterFrom(options) }),
  )
}

export async function runViewResume(options: ViewCliOptions = {}): Promise<void> {
  await emitView('view.resume', options, (context, viewOptions) =>
    buildMemoryView(context, viewOptions, { resumeOnly: true, filter: memoryFilterFrom(options) }),
  )
}

export async function runViewDiscussions(options: ViewCliOptions = {}): Promise<void> {
  await emitView('view.discussions', options, (context, viewOptions) =>
    buildDiscussionsView(context, viewOptions, {
      status: stringValue(options.status),
      agent: stringValue(options.agent),
    }),
  )
}

export async function runViewDiscussion(selector: string, options: ViewCliOptions = {}): Promise<void> {
  await emitView('view.discussion', options, (context, viewOptions) => buildDiscussionView(context, viewOptions, selector))
}

export async function runViewExperience(options: ViewCliOptions = {}): Promise<void> {
  await emitView('view.experience', options, (context, viewOptions) =>
    buildExperienceView(context, viewOptions, {
      type: stringValue(options.type),
      area: stringValue(options.area),
    }),
  )
}

export async function runViewSkills(options: ViewCliOptions = {}): Promise<void> {
  await emitView('view.skills', options, async (context, viewOptions) => {
    const workspace = await loadWorkspace(context)
    return hostedView('Hosted Skills Mirror', '.aops/hosted/skills', workspace.skills, viewOptions)
  })
}

export async function runViewPrompts(options: ViewCliOptions = {}): Promise<void> {
  await emitView('view.prompts', options, async (context, viewOptions) => {
    const workspace = await loadWorkspace(context)
    return hostedView('Hosted Prompts Mirror', '.aops/hosted/prompts', workspace.prompts, viewOptions)
  })
}

export async function runViewDocs(options: ViewCliOptions = {}): Promise<void> {
  await emitView('view.docs', options, async (context, viewOptions) => {
    const workspace = await loadWorkspace(context)
    return {
      result: {
        count: workspace.docs.length,
        data: workspace.docs.map(materializeRecord),
      },
      markdown: ['# Docman Mirror Documents', '', docTable(workspace.docs, viewOptions)].join('\n'),
      footer: commonFooter('.aops/docman', workspace.docs),
    }
  })
}

export async function runViewDoc(selector: string, options: ViewCliOptions = {}): Promise<void> {
  await emitView('view.doc', options, (context, viewOptions) => buildDocView(context, viewOptions, selector))
}

export async function runViewDocPage(selector: string, options: ViewCliOptions = {}): Promise<void> {
  await emitView('view.doc-page', options, (context, viewOptions) => buildDocPageView(context, viewOptions, selector))
}

export async function runViewDigest(options: ViewCliOptions = {}): Promise<void> {
  await emitView('view.digest', options, (context, viewOptions) => buildDigestView(context, viewOptions, options))
}

function addNoArg(parent: Command, name: string, description: string, runner: (options: ViewCliOptions) => Promise<void>): Command {
  const command = addViewOptions(parent.command(name).description(description))
  command.action(async () => {
    await runner(commandOptions(command))
  })
  return command
}

function addOneArg(parent: Command, name: string, description: string, runner: (selector: string, options: ViewCliOptions) => Promise<void>): Command {
  const command = addViewOptions(parent.command(`${name} <selector>`).description(description))
  command.action(async (selector: string) => {
    await runner(selector, commandOptions(command))
  })
  return command
}

export function makeViewCommand(): Command {
  const cmd = addViewOptions(new Command('view').description('Read-only AOPS markdown/JSON presentation views'))

  addNoArg(cmd, 'projects', 'List repo-bound projects and local counts', runViewProjects)
  addNoArg(cmd, 'hosted-projects', 'List hosted Agentspace projects', runViewHostedProjects)
  const hostedInventory = addViewOptions(cmd.command('hosted-inventory').description('Show hosted project inventory grouped by docs, skills, prompts, and resources'))
    .option('--hosted-project <selector>', 'Filter by hosted project id, slug, name, or 8+ char prefix')
  hostedInventory.action(async () => {
    await runViewHostedInventory(commandOptions(hostedInventory))
  })
  const project = addViewOptions(cmd.command('project [selector]').description('Show current or selected repo-bound project'))
  project.action(async (selector?: string) => {
    await runViewProject(selector, commandOptions(project))
  })
  addNoArg(cmd, 'dashboard', 'Show repo-first dashboard across local AOPS workspaces', runViewDashboard).addHelpText(
    'after',
    `
Examples:
  aops-cli view dashboard --style agent --max-items 15
  aops-cli view digest --project --depth shallow

Notes:
  Use dashboard for a first scan across boards, tasks, memory, issues, and recent discussions.
  Use view digest for handoff/resume context; digest is scoped and usually cheaper than a full dashboard.
  Dashboard is read-only and reads local .aops/** files only.
`,
  )

  addNoArg(cmd, 'boards', 'List Projectman boards from .aops/projectman', runViewBoards)
  addOneArg(cmd, 'board', 'Show a Projectman board with tasks and sprints', runViewBoard)

  const tasksCmd = addViewOptions(cmd.command('tasks').description('List Projectman kanban tasks'))
    .option('--board <selector>', 'Filter by board slug, name, id, or 8+ char prefix')
    .option('--status <value>', 'Filter by column name/slug (e.g. Done, todo, ops-doing)')
  tasksCmd.action(async () => {
    await runViewTasks(commandOptions(tasksCmd))
  })
  addOneArg(cmd, 'task', 'Show a Projectman kanban task with relations', runViewTask).addHelpText(
    'after',
    `
Examples:
  aops-cli view task <selector>
  aops-cli view digest --task <selector> --depth shallow

Notes:
  Selector accepts full UUID, 8+ char prefix, slug, or exact title; ambiguous selectors list candidates.
  This command inspects task relations only. Use aops-cli pm ktask ... for planning mutations.
`,
  )

  const sprintsCmd = addViewOptions(cmd.command('sprints').description('List Projectman sprints'))
    .option('--board <selector>', 'Filter by board')
    .option('--status <value>', 'Filter by sprint status (todo, doing, completed, ...)')
  sprintsCmd.action(async () => {
    await runViewSprints(commandOptions(sprintsCmd))
  })
  addOneArg(cmd, 'sprint', 'Show a Projectman sprint with plan and relations', runViewSprint).addHelpText(
    'after',
    `
Examples:
  aops-cli view sprint <selector> --max-items 20
  aops-cli view digest --sprint <selector> --depth shallow

Notes:
  Selector accepts full UUID, 8+ char prefix, slug, or exact title; ambiguous selectors list candidates.
  This command inspects sprint plan, microtasks, issues, feedback, review requests, and memory without mutating PM state.
  Use aops-cli pm utask update ... for granular progress; pm sprint set-status bulk-rewrites nested microtask status.
`,
  )

  const issuesCmd = addViewOptions(cmd.command('issues').description('List Projectman issues'))
    .option('--status <value>', 'Filter by issue status (open, resolved, ...)')
    .option('--severity <value>', 'Filter by severity (low, medium, high, critical)')
    .option('--board <selector>', 'Filter by board')
    .option('--sprint <selector>', 'Filter by sprint')
    .option('--task <selector>', 'Filter by kanban task')
  issuesCmd.action(async () => {
    await runViewIssues(commandOptions(issuesCmd))
  })

  const feedbackCmd = addViewOptions(cmd.command('feedback').description('List Projectman feedback'))
    .option('--status <value>', 'Filter by feedback status')
    .option('--board <selector>', 'Filter by board')
    .option('--sprint <selector>', 'Filter by sprint')
    .option('--task <selector>', 'Filter by kanban task')
  feedbackCmd.action(async () => {
    await runViewFeedback(commandOptions(feedbackCmd))
  })

  const reviewRequestsCmd = addViewOptions(cmd.command('review-requests').alias('review-request').description('List Projectman review requests'))
    .option('--status <value>', 'Filter by review request status')
    .option('--board <selector>', 'Filter by board')
    .option('--sprint <selector>', 'Filter by sprint')
    .option('--task <selector>', 'Filter by kanban task')
  reviewRequestsCmd.action(async () => {
    await runViewReviewRequests(commandOptions(reviewRequestsCmd))
  })

  const memory = addViewOptions(cmd.command('memory').description('List local Agentspace memory items'))
    .option('--durability <value>', 'Filter by durability: short, durable, sticky')
    .option('--kind <value>', 'Filter by kind: kickoff, resume, closeout, decision, blocker, note, rule, summary')
    .option('--subject <value>', 'Filter by subject: project, board, sprint, task, ktask, utask, issue, feedback, review-request')
    .option('--id <value>', 'Filter by subject id (full UUID or 8+ char prefix)')
  memory.action(async () => {
    await runViewMemory(commandOptions(memory))
  })
  const resume = addViewOptions(cmd.command('resume').description('Show local resume/kickoff/closeout memory items'))
    .option('--durability <value>', 'Filter by durability')
    .option('--kind <value>', 'Filter by kind')
    .option('--subject <value>', 'Filter by subject category')
    .option('--id <value>', 'Filter by subject id')
  resume.action(async () => {
    await runViewResume(commandOptions(resume))
  })
  const discussionsCmd = addViewOptions(cmd.command('discussions').description('List local discussion topics'))
    .option('--status <value>', 'Filter by topic status (active, concluding, concluded, abandoned)')
    .option('--agent <value>', 'Filter by participant agent id')
  discussionsCmd.action(async () => {
    await runViewDiscussions(commandOptions(discussionsCmd))
  })
  addOneArg(cmd, 'discussion', 'Show a discussion topic with turns and outputs', runViewDiscussion)

  const experienceCmd = addViewOptions(cmd.command('experience').description('List local Agentspace experience items'))
    .option('--type <value>', 'Filter by experience type (technique, problem-solution, tool, script, idea, ...)')
    .option('--area <value>', 'Filter by area tag')
  experienceCmd.action(async () => {
    await runViewExperience(commandOptions(experienceCmd))
  })
  addNoArg(cmd, 'skills', 'List read-only hosted skill mirrors', runViewSkills)
  addNoArg(cmd, 'prompts', 'List read-only hosted prompt mirrors', runViewPrompts)
  addNoArg(cmd, 'docs', 'List read-only Docman document mirrors', runViewDocs)
  addOneArg(cmd, 'doc', 'Show a Docman mirror document', runViewDoc)
  addOneArg(cmd, 'doc-page', 'Show a heading slice from Docman mirror markdown', runViewDocPage)

  const digest = addViewOptions(cmd.command('digest').description('Compose a bounded repo-first context pack'))
    .option('--project', 'Build project dashboard digest')
    .option('--board <selector>', 'Build board digest')
    .option('--task <selector>', 'Build task digest')
    .option('--sprint <selector>', 'Build sprint digest')
    .option('--depth <depth>', 'Digest depth: shallow or deep', 'shallow')
  digest.action(async () => {
    await runViewDigest(commandOptions(digest))
  })
  digest.addHelpText(
    'after',
    `
Examples:
  aops-cli view digest --sprint <selector> --depth shallow
  aops-cli view digest --task <selector> --depth deep --max-bytes 32768
  aops-cli view digest --board <board-slug> --depth shallow

Notes:
  Prefer one scope flag: --sprint, --task, --board, or --project.
  Shallow is the default handoff/resume pack; deep is for fuller local context and still respects --max-bytes.
  Digest is read-only and does not sync, mutate, refresh mirrors, or write cache files.
`,
  )

  cmd.addHelpText(
    'after',
    `
Examples:
  aops-cli view dashboard --style agent
  aops-cli view hosted-projects --style compact
  aops-cli view hosted-inventory --hosted-project aops --style compact
  aops-cli view sprint <selector> --max-items 20
  aops-cli view digest --task <selector> --depth deep --max-bytes 32768

Notes:
  local-cache view commands use local .aops/** files only.
  hosted view commands call read-only hosted list APIs and do not sync, mutate, or write cache files.
`,
  )

  return cmd
}
