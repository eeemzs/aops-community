import { createHash, randomUUID } from 'node:crypto'
import { existsSync, type Dirent } from 'node:fs'
import fs from 'node:fs/promises'
import http, { type IncomingMessage, type ServerResponse } from 'node:http'
import path from 'node:path'

import { logError, logSuccess, logWarn } from '@aopslab/xf-cli-ui'
import { Command } from 'commander'

import {
  invokeHostedToolWithApiState,
  requireApiState,
  unwrapHostedToolResult,
  type AgentGatewayContextOptions,
} from '../utils/agent-gateway.js'
import { applyCommonOptions, compactPayload, normalizeNonEmpty } from '../utils/command.js'
import { buildOperatorCookbook } from '../utils/hosted-sugar.js'
import {
  parseFrontmatterDocument,
  readLocalMemoryEntries,
  rebuildLocalMemoryWorkspace,
  renderFrontmatterDocument,
  resolveMemoryWorkspacePaths,
} from '../utils/memory-workspace.js'
import {
  readExperienceItems,
  rebuildExperienceWorkspace,
} from '../utils/experience-workspace.js'
import {
  resolveOwnerScopeIdFromProjectRecord,
  resolveProjectBindingContext,
  type ResolvedProjectBindingContext,
} from '../utils/project-context.js'
import {
  collectRepoFirstSyncRecords,
  rebuildProjectmanViews,
  resolveRepoFirstAgentspacePaths,
  resolveRepoFirstProjectmanPaths,
} from '../utils/repo-first-projectman.js'
import {
  loadAopsRepoConfig,
  loadAopsRepoConfigReadOnly,
  readAopsRepoConfigReadOnly,
  type AopsRepoConfig,
  type AopsRepoProjectConfig,
} from '../utils/repo-config.js'
import {
  hostedProjectKey,
  rebuildHostedWorkspace,
  syncHostedMirrorKind,
  type HostedMirrorItem,
  type HostedMirrorProject,
} from '../utils/hosted-workspace.js'
import { GUIDE_PATHS } from '../utils/guide-paths.js'
import { writeFileWithRetry } from '../utils/transient-fs.js'

type SyncOptions = AgentGatewayContextOptions & {
  apply?: boolean
  json?: boolean
  fromServer?: boolean
  allProjects?: boolean
  path?: string
  prefer?: string
  projectSlug?: string
  hostedProjectId?: string[]
  hostedProjectName?: string[]
  hostedProjectSlug?: string[]
  board?: string[]
  task?: string[]
  sprint?: string[]
  issue?: string[]
  feedback?: string[]
  reviewRequest?: string[]
  record?: string[]
}

type SyncSidecarOptions = SyncOptions & {
  host?: string
  port?: string | number
  allowOrigin?: string[]
  token?: string
}

type SidecarRuntimeContext = {
  repoRoot: string
  projectSlug?: string
  projectId?: string
  scopeId?: string
}

type SyncSourceRecord = {
  filePath: string
  frontmatter: Record<string, unknown>
  body: string
}


type RepoFirstSyncContext = Pick<ResolvedProjectBindingContext, 'repoRoot' | 'localRoot'>

type ApiState = NonNullable<Awaited<ReturnType<typeof requireApiState>>>

type AllProjectsRunResult = {
  projectSlug?: string
  projectName?: string
  projectId?: string
  localRoot?: string
  ok: boolean
  skipped?: boolean
  reason?: string
  data?: Record<string, unknown>
  error?: string
}

function projectReportBase(project: AopsRepoProjectConfig): Omit<AllProjectsRunResult, 'ok'> {
  return compactPayload({
    projectSlug: normalizeNonEmpty(project.slug),
    projectName: normalizeNonEmpty(project.name),
    projectId: normalizeNonEmpty(project.projectId) ?? normalizeNonEmpty(project.scopeId),
    localRoot: normalizeNonEmpty(project.localRoot),
  }) as Omit<AllProjectsRunResult, 'ok'>
}

function assertNoExplicitProjectSelectorForAllProjects(options: SyncOptions): void {
  if (
    normalizeNonEmpty(options.projectSlug) ||
    normalizeNonEmpty(options.projectName) ||
    normalizeNonEmpty(options.projectId) ||
    normalizeNonEmpty(options.scopeId)
  ) {
    throw new Error('sync --all-projects cannot be combined with --project-id, --project-name, --project-slug, or --scope-id.')
  }
}

function syncOptionsForProject(options: SyncOptions, project: AopsRepoProjectConfig): SyncOptions {
  const next: SyncOptions = {
    ...options,
    allProjects: false,
    projectId: undefined,
    projectName: undefined,
    projectSlug: undefined,
    scopeId: undefined,
  }
  const projectSlug = normalizeNonEmpty(project.slug)
  const projectName = normalizeNonEmpty(project.name)
  const projectId = normalizeNonEmpty(project.projectId) ?? normalizeNonEmpty(project.scopeId)
  if (projectSlug) next.projectSlug = projectSlug
  else if (projectName) next.projectName = projectName
  else if (projectId) next.projectId = projectId
  return next
}

async function resolveAllProjectsTargets(options: SyncOptions): Promise<{
  repoRoot: string
  configPath: string
  runnable: AopsRepoProjectConfig[]
  skipped: AllProjectsRunResult[]
}> {
  assertNoExplicitProjectSelectorForAllProjects(options)
  const { rootDir, configPath, config } = await loadAopsRepoConfig(process.cwd())
  if (!config) {
    throw new Error(`sync --all-projects requires repo config at ${configPath}. Run \`aops-cli init\` first.`)
  }

  // Server-first: every configured project is iterated uniformly (no authoring-mode
  // partitioning). The only skip left is a file-root safety guard — in a multi-project
  // repo a project without a localRoot would write into the shared `.aops/**` root and
  // collide with its siblings, so it cannot be safely partitioned.
  const runnable: AopsRepoProjectConfig[] = []
  const skipped: AllProjectsRunResult[] = []

  for (const project of config.projects) {
    if (config.projects.length > 1 && !normalizeNonEmpty(project.localRoot)) {
      skipped.push({
        ...projectReportBase(project),
        ok: true,
        skipped: true,
        reason: 'project has no localRoot, so it cannot be safely partitioned in --all-projects mode.',
      })
      continue
    }
    runnable.push(project)
  }

  if (runnable.length === 0) {
    throw new Error(`sync --all-projects found no runnable projects in ${configPath}.`)
  }

  return { repoRoot: rootDir, configPath, runnable, skipped }
}

async function runForAllProjects(
  options: SyncOptions,
  command: 'sync.status' | 'sync.diff' | 'sync.pull' | 'sync.bootstrap',
  execute: (
    projectOptions: SyncOptions,
    context: ResolvedProjectBindingContext,
    apiState: ApiState | null,
  ) => Promise<Record<string, unknown>>,
  params: { requireApi?: boolean } = {},
): Promise<void> {
  try {
    const targets = await resolveAllProjectsTargets(options)
    const apiState = params.requireApi === true ? await requireApiState(options) : null
    if (params.requireApi === true && !apiState) return

    const projects: AllProjectsRunResult[] = [...targets.skipped]
    for (const project of targets.runnable) {
      const projectOptions = syncOptionsForProject(options, project)
      try {
        const context = await resolveProjectBindingContext(projectOptions, { requireProject: true })
        const data = await execute(projectOptions, context, apiState)
        const projectFailedCount = typeof data.failedCount === 'number' ? data.failedCount : 0
        projects.push({
          ...projectReportBase(project),
          projectSlug: normalizeNonEmpty(context.projectSlug) ?? normalizeNonEmpty(project.slug),
          projectName: normalizeNonEmpty(context.projectName) ?? normalizeNonEmpty(project.name),
          projectId: normalizeNonEmpty(context.projectId) ?? normalizeNonEmpty(project.projectId) ?? normalizeNonEmpty(project.scopeId),
          localRoot: normalizeNonEmpty(context.localRoot) ?? normalizeNonEmpty(project.localRoot),
          ok: projectFailedCount === 0,
          error: projectFailedCount > 0 ? `${command} reported ${projectFailedCount} file-level error(s).` : undefined,
          data,
        })
      } catch (error) {
        projects.push({
          ...projectReportBase(project),
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }

    const failedCount = projects.filter((project) => !project.ok).length
    const skippedCount = projects.filter((project) => project.skipped).length
    const statePath = await writeState(targets.repoRoot, {
      lastAllProjectsSync: {
        command,
        failedCount,
        skippedCount,
        projectCount: targets.runnable.length,
        projects,
      },
    })
    emit(options, {
      command,
      surface: 'hosted-cache-sync',
      resolvedContext: {
        repoRoot: targets.repoRoot,
        configPath: targets.configPath,
        configFound: true,
        mode: 'all-projects',
      },
      result: {
        ok: failedCount === 0,
        data: {
          projectCount: targets.runnable.length,
          failedCount,
          skippedCount,
          statePath,
          projects,
        },
      },
    }, failedCount === 0 ? `${command} --all-projects completed.` : `${command} --all-projects completed with project-level errors.`)
    if (failedCount > 0) process.exitCode = 1
  } catch (error) {
    logError(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function toRecordArray(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) return value.filter(isRecord)
  if (!isRecord(value)) return []
  for (const candidate of [value.data, value.items, value.rows, value.results]) {
    if (Array.isArray(candidate)) return candidate.filter(isRecord)
  }
  return []
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'item'
}

function hashContent(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function toStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((entry) => normalizeNonEmpty(entry)).filter((entry): entry is string => Boolean(entry))
    : []
}


function numberField(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}











function collectRepeatedOption(value: string, previous: string[] = []): string[] {
  const normalized = normalizeNonEmpty(value)
  return normalized ? [...previous, normalized] : previous
}

function relativePath(repoRoot: string, filePath: string): string {
  return path.relative(repoRoot, filePath).split(path.sep).join('/')
}

function isAopsArchivePath(filePath: string): boolean {
  const parts = filePath.split(path.sep)
  const aopsIndex = parts.lastIndexOf('.aops')
  return aopsIndex >= 0 && parts[aopsIndex + 1] === 'archive'
}

async function readMarkdownRecords(rootDir: string, params: { recursive?: boolean } = {}): Promise<SyncSourceRecord[]> {
  try {
    const entries = await fs.readdir(rootDir, { withFileTypes: true })
    const records: SyncSourceRecord[] = []
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      const filePath = path.join(rootDir, entry.name)
      if (isAopsArchivePath(filePath)) continue
      if (entry.isDirectory() && params.recursive === true) {
        records.push(...await readMarkdownRecords(filePath, params))
        continue
      }
      if (!entry.isFile() || !entry.name.endsWith('.md')) continue
      const parsed = parseFrontmatterDocument(await fs.readFile(filePath, 'utf8'))
      records.push({ filePath, frontmatter: parsed.frontmatter, body: parsed.body })
    }
    return records
  } catch {
    return []
  }
}

async function readRepoFirstSourceRecords(context: RepoFirstSyncContext): Promise<SyncSourceRecord[]> {
  const pm = resolveRepoFirstProjectmanPaths(context)
  const ag = resolveRepoFirstAgentspacePaths(context)
  return [
    ...await readMarkdownRecords(pm.boards),
    ...await readMarkdownRecords(pm.tasks),
    ...await readMarkdownRecords(pm.sprints),
    ...await readMarkdownRecords(pm.utasks, { recursive: true }),
    ...await readMarkdownRecords(pm.issues),
    ...await readMarkdownRecords(pm.feedback),
    ...await readMarkdownRecords(pm.reviewRequests),
    ...await readMarkdownRecords(pm.tombstones, { recursive: true }),
    ...await readMarkdownRecords(ag.experienceItems),
    ...await readMarkdownRecords(ag.memoryItems),
  ]
}

async function findRecordByRemoteId(rootDir: string, remoteId: string, params: { recursive?: boolean } = {}): Promise<SyncSourceRecord | null> {
  const records = await readMarkdownRecords(rootDir, params)
  return records.find((record) => normalizeNonEmpty(record.frontmatter.remoteId) === remoteId) ?? null
}

async function findRecordByLocalId(rootDir: string, localId: string, params: { recursive?: boolean } = {}): Promise<SyncSourceRecord | null> {
  const records = await readMarkdownRecords(rootDir, params)
  return records.find((record) => {
    const id = normalizeNonEmpty(record.frontmatter.localId) ?? normalizeNonEmpty(record.frontmatter.id)
    return id === localId
  }) ?? null
}

function extractResultData(value: unknown): Record<string, unknown> | null {
  if (!isRecord(value)) return null
  if (isRecord(value.data)) return value.data
  if (isRecord(value.response)) return extractResultData(value.response)
  if (isRecord(value.result)) return extractResultData(value.result)
  return value
}







type SyncSelection = {
  active: boolean
  records: SyncSourceRecord[]
  selectedPaths: Set<string>
  filters: Record<string, string[]>
}

function optionValues(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((entry) => normalizeNonEmpty(entry)).filter((entry): entry is string => Boolean(entry))
    : []
}

function buildSyncSelectionFilters(options: SyncOptions): Record<string, string[]> {
  return compactPayload({
    board: optionValues(options.board),
    task: optionValues(options.task),
    sprint: optionValues(options.sprint),
    issue: optionValues(options.issue),
    feedback: optionValues(options.feedback),
    reviewRequest: optionValues(options.reviewRequest),
    record: optionValues(options.record),
  }) as Record<string, string[]>
}

function recordKeySet(repoRoot: string, record: SyncSourceRecord): Set<string> {
  const fm = record.frontmatter
  return new Set([
    relativePath(repoRoot, record.filePath),
    record.filePath,
    normalizeNonEmpty(fm.localId),
    normalizeNonEmpty(fm.id),
    normalizeNonEmpty(fm.remoteId),
    normalizeNonEmpty(fm.slug),
    normalizeNonEmpty(fm.name),
    normalizeNonEmpty(fm.title),
    normalizeNonEmpty(fm.taskCode),
  ].filter((value): value is string => Boolean(value)).map((value) => value.toLowerCase()))
}

function recordMatchesAny(repoRoot: string, record: SyncSourceRecord, values: string[]): boolean {
  if (values.length === 0) return false
  const keys = recordKeySet(repoRoot, record)
  return values.some((value) => keys.has(value.toLowerCase()))
}




function addRelatedIds(target: Set<string>, values: unknown[]): void {
  for (const value of values) {
    const normalized = normalizeNonEmpty(value)
    if (normalized) target.add(normalized)
  }
}

function referencesAny(record: SyncSourceRecord, values: Set<string>, keys: string[]): boolean {
  if (values.size === 0) return false
  return keys.some((key) => {
    const value = normalizeNonEmpty(record.frontmatter[key])
    return Boolean(value && values.has(value))
  })
}

function addRecordIdentity(ids: Set<string>, record: SyncSourceRecord): void {
  addRelatedIds(ids, [
    record.frontmatter.localId,
    record.frontmatter.id,
    record.frontmatter.remoteId,
    record.frontmatter.slug,
    record.frontmatter.name,
    record.frontmatter.title,
  ])
}

function buildSyncSelection(repoRoot: string, records: SyncSourceRecord[], options: SyncOptions): SyncSelection {
  const filters = buildSyncSelectionFilters(options)
  const active = Object.values(filters).some((values) => values.length > 0)
  if (!active) {
    return {
      active: false,
      records,
      selectedPaths: new Set(records.map((record) => relativePath(repoRoot, record.filePath))),
      filters,
    }
  }

  const selected = new Set<SyncSourceRecord>()
  const boardIds = new Set<string>()
  const taskIds = new Set<string>()
  const sprintIds = new Set<string>()
  const utaskIds = new Set<string>()
  const reviewRequestIds = new Set<string>()

  const include = (record: SyncSourceRecord): void => {
    selected.add(record)
    const entityType = normalizeNonEmpty(record.frontmatter.entityType)
    if (entityType === 'projectman.board') addRecordIdentity(boardIds, record)
    if (entityType === 'projectman.kanban-task') addRecordIdentity(taskIds, record)
    if (entityType === 'projectman.sprint') addRecordIdentity(sprintIds, record)
    if (entityType === 'projectman.utask') addRecordIdentity(utaskIds, record)
    if (entityType === 'projectman.review-request') addRecordIdentity(reviewRequestIds, record)
  }

  for (const record of records) {
    const entityType = normalizeNonEmpty(record.frontmatter.entityType)
    if (recordMatchesAny(repoRoot, record, filters.record ?? [])) include(record)
    if (entityType === 'projectman.board' && recordMatchesAny(repoRoot, record, filters.board ?? [])) include(record)
    if (entityType === 'projectman.kanban-task' && recordMatchesAny(repoRoot, record, filters.task ?? [])) include(record)
    if (entityType === 'projectman.sprint' && recordMatchesAny(repoRoot, record, filters.sprint ?? [])) include(record)
    if (entityType === 'projectman.issue' && recordMatchesAny(repoRoot, record, filters.issue ?? [])) include(record)
    if (entityType === 'projectman.feedback' && recordMatchesAny(repoRoot, record, filters.feedback ?? [])) include(record)
    if (entityType === 'projectman.review-request' && recordMatchesAny(repoRoot, record, filters.reviewRequest ?? [])) include(record)
  }

  let changed = true
  while (changed) {
    changed = false
    for (const record of records) {
      if (selected.has(record)) continue
      const entityType = normalizeNonEmpty(record.frontmatter.entityType)
      let shouldInclude = false

      if (entityType === 'projectman.board') {
        shouldInclude = referencesAny(record, boardIds, ['localId', 'id', 'remoteId', 'slug', 'name'])
      } else if (entityType === 'projectman.kanban-task') {
        shouldInclude =
          referencesAny(record, boardIds, ['boardLocalId', 'boardId', 'boardRemoteId', 'boardSlug']) ||
          referencesAny(record, taskIds, ['localId', 'id', 'remoteId', 'slug', 'title'])
      } else if (entityType === 'projectman.sprint') {
        shouldInclude =
          referencesAny(record, taskIds, ['kanbanTaskLocalId', 'kanbanTaskId', 'kanbanTaskRemoteId']) ||
          referencesAny(record, sprintIds, ['localId', 'id', 'remoteId', 'slug', 'name'])
      } else if (entityType === 'projectman.utask') {
        shouldInclude =
          referencesAny(record, sprintIds, ['sprintLocalId', 'sprintId', 'sprintRemoteId', 'sprintSlug']) ||
          referencesAny(record, utaskIds, ['localId', 'id', 'remoteId', 'slug', 'title'])
      } else if (entityType === 'projectman.issue' || entityType === 'projectman.feedback') {
        shouldInclude =
          referencesAny(record, taskIds, ['kanbanTaskLocalId', 'kanbanTaskId', 'kanbanTaskRemoteId']) ||
          referencesAny(record, sprintIds, ['sprintLocalId', 'sprintId', 'sprintRemoteId']) ||
          referencesAny(record, utaskIds, ['utaskLocalId', 'utaskId', 'microTaskId', 'microTaskRemoteId']) ||
          referencesAny(record, reviewRequestIds, ['reviewRequestLocalId', 'reviewRequestId', 'reviewRequestRemoteId'])
      } else if (entityType === 'projectman.review-request') {
        shouldInclude =
          referencesAny(record, taskIds, ['kanbanTaskLocalId', 'kanbanTaskId', 'kanbanTaskRemoteId']) ||
          referencesAny(record, sprintIds, ['sprintLocalId', 'sprintId', 'sprintRemoteId']) ||
          referencesAny(record, utaskIds, ['utaskLocalId', 'utaskId', 'microTaskId', 'microTaskRemoteId']) ||
          referencesAny(record, reviewRequestIds, ['parentReviewRequestLocalId', 'parentReviewRequestId', 'rootReviewRequestLocalId', 'rootReviewRequestId'])
      } else if (entityType === 'agentspace.memory-item' || entityType === 'agentspace.experience-item') {
        shouldInclude =
          referencesAny(record, boardIds, ['boardId', 'boardLocalId', 'sourceId', 'subjectId']) ||
          referencesAny(record, taskIds, ['kanbanTaskId', 'kanbanTaskLocalId', 'sourceId', 'subjectId']) ||
          referencesAny(record, sprintIds, ['sprintId', 'sprintLocalId', 'sourceId', 'subjectId']) ||
          referencesAny(record, utaskIds, ['utaskId', 'utaskLocalId', 'microTaskId', 'sourceId', 'subjectId'])
      } else if (entityType === 'agentspace.discussion-topic') {
        shouldInclude =
          referencesAny(record, boardIds, ['subjectId']) ||
          referencesAny(record, taskIds, ['subjectId']) ||
          referencesAny(record, sprintIds, ['subjectId']) ||
          referencesAny(record, utaskIds, ['subjectId'])
      }

      if (shouldInclude) {
        include(record)
        changed = true
      }
    }
  }

  if (selected.size === 0) {
    const renderedFilters = Object.entries(filters).map(([key, values]) => `${key}=${values.join(',')}`).join(' ')
    throw new Error(`sync selection matched no records (${renderedFilters}).`)
  }

  const selectedRecords = records.filter((record) => selected.has(record))
  return {
    active: true,
    records: selectedRecords,
    selectedPaths: new Set(selectedRecords.map((record) => relativePath(repoRoot, record.filePath))),
    filters,
  }
}

function titleFromSlug(value: string): string {
  return value
    .split(/[-_\s]+/g)
    .filter(Boolean)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(' ') || value
}









function normalizeBoardColumnEntries(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) return []
  return value.map((entry, index) => {
    const source: Record<string, unknown> = isRecord(entry) ? entry : { name: entry }
    const name = normalizeNonEmpty(source.name) ?? normalizeNonEmpty(source.title)
    const slug = normalizeNonEmpty(source.slug) ?? (name ? slugify(name) : undefined)
    const localId =
      normalizeNonEmpty(source.localId)
      ?? normalizeNonEmpty(source.id)
      ?? slug
      ?? (name ? slugify(name) : `column-${index + 1}`)
    const remoteColumnId =
      normalizeNonEmpty(source.remoteColumnId)
      ?? normalizeNonEmpty(source.columnRemoteId)
      ?? normalizeNonEmpty(source.columnId)
    const remoteBoardColumnId =
      normalizeNonEmpty(source.remoteBoardColumnId)
      ?? normalizeNonEmpty(source.boardColumnRemoteId)
      ?? normalizeNonEmpty(source.boardColumnId)
    return compactPayload({
      localId,
      id: normalizeNonEmpty(source.id) ?? localId,
      name: name ?? (slug ? titleFromSlug(slug) : `Column ${index + 1}`),
      slug,
      position: numberField(source.position) ?? index,
      description: normalizeNonEmpty(source.description),
      wipLimit: numberField(source.wipLimit),
      remoteColumnId,
      columnId: remoteColumnId,
      remoteBoardColumnId,
      boardColumnId: remoteBoardColumnId,
    })
  })
}

function boardColumnsHash(value: unknown): string | undefined {
  if (!Array.isArray(value)) return undefined
  const columns = normalizeBoardColumnEntries(value).map((entry, index) => compactPayload({
    localId: normalizeNonEmpty(entry.localId),
    name: normalizeNonEmpty(entry.name),
    slug: normalizeNonEmpty(entry.slug),
    position: numberField(entry.position) ?? index,
    description: normalizeNonEmpty(entry.description),
    wipLimit: numberField(entry.wipLimit),
  }))
  return hashContent(JSON.stringify(columns))
}










function recordBaselineHash(record: SyncSourceRecord): string {
  const frontmatter = { ...record.frontmatter }
  delete frontmatter.baseHash
  return hashContent(renderFrontmatterDocument(frontmatter, record.body))
}

function withBaseHash(frontmatter: Record<string, unknown>, body: string): Record<string, unknown> {
  const next = compactPayload({
    ...frontmatter,
    baseHash: undefined,
  })
  return {
    ...next,
    baseHash: hashContent(renderFrontmatterDocument(next, body)),
  }
}

function hasManualLocalEdit(record: SyncSourceRecord): boolean {
  const baseHash = normalizeNonEmpty(record.frontmatter.baseHash)
  return normalizeSyncState(record) === 'synced' && Boolean(baseHash) && recordBaselineHash(record) !== baseHash
}

async function markManualLocalEditDirty(record: SyncSourceRecord): Promise<void> {
  const frontmatter = {
    ...record.frontmatter,
    syncState: 'dirty',
    updatedAt: new Date().toISOString(),
  }
  await writeFileWithRetry(record.filePath, renderFrontmatterDocument(frontmatter, record.body), 'utf8')
}

async function protectPullTargetIfLocalChanged(record: SyncSourceRecord): Promise<boolean> {
  const syncState = normalizeSyncState(record)
  if (['local', 'dirty', 'deleted', 'conflict'].includes(syncState)) return true
  if (!hasManualLocalEdit(record)) return false
  await markManualLocalEditDirty(record)
  return true
}



function normalizeSyncState(record: SyncSourceRecord): string {
  return normalizeNonEmpty(record.frontmatter.syncState) ?? 'local'
}












function getReadToolForEntity(entityType?: string): string | undefined {
  switch (entityType) {
    case 'projectman.board':
      return 'projectman.kanban-board.get'
    case 'projectman.kanban-task':
      return 'projectman.kanban-task.get'
    case 'projectman.sprint':
      return 'projectman.sprint.get'
    case 'projectman.issue':
      return 'projectman.issue.get'
    case 'projectman.feedback':
      return 'projectman.feedback.get'
    case 'projectman.review-request':
      return 'projectman.review-request.get'
    case 'agentspace.discussion-topic':
      return 'agentspace.memory-item.get-by-id'
    case 'agentspace.experience-item':
      return 'agentspace.experience-item.get-by-id'
    case 'agentspace.memory-item':
      return 'agentspace.memory-item.get-by-id'
    default:
      return undefined
  }
}

function emit(options: SyncOptions, envelope: Record<string, unknown>, fallback: string): void {
  if (options.json) {
    console.log(JSON.stringify(envelope, null, 2))
    return
  }
  logSuccess(fallback)
  console.log(JSON.stringify(envelope.result ?? envelope, null, 2))
}

async function writeState(repoRoot: string, payload: Record<string, unknown>): Promise<string> {
  const statePath = path.join(repoRoot, '.aops', 'sync', 'state.json')
  await fs.mkdir(path.dirname(statePath), { recursive: true })
  const previous = await readState(repoRoot)
  await writeFileWithRetry(statePath, `${JSON.stringify({
    ...previous,
    schemaVersion: 2,
    updatedAt: new Date().toISOString(),
    ...payload,
  }, null, 2)}\n`, 'utf8')
  return statePath
}

async function readState(repoRoot: string): Promise<Record<string, unknown>> {
  const statePath = path.join(repoRoot, '.aops', 'sync', 'state.json')
  try {
    const parsed = JSON.parse(await fs.readFile(statePath, 'utf8'))
    return isRecord(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

async function ensureGitignore(repoRoot: string): Promise<void> {
  const gitignorePath = path.join(repoRoot, '.gitignore')
  const entry = '.aops/sync/state.json'
  let content = ''
  try {
    content = await fs.readFile(gitignorePath, 'utf8')
  } catch {
    content = ''
  }
  if (content.split(/\r?\n/).includes(entry)) return
  const next = `${content.trimEnd()}${content.trimEnd() ? '\n' : ''}${entry}\n`
  await writeFileWithRetry(gitignorePath, next, 'utf8')
}

function commonFrontmatter(params: {
  entityType: string
  projectId?: string
  scopeId?: string
  localId: string
  remoteId?: string
  syncState?: string
  remoteUpdatedAt?: string
}): Record<string, unknown> {
  const now = new Date().toISOString()
  return compactPayload({
    schemaVersion: 2,
    entityType: params.entityType,
    localId: params.localId,
    id: params.localId,
    remoteId: params.remoteId,
    projectId: params.projectId,
    scopeId: params.scopeId,
    createdAt: now,
    updatedAt: now,
    syncState: params.syncState ?? 'synced',
    remoteUpdatedAt: params.remoteUpdatedAt,
    lastPulledAt: now,
    baseHash: params.remoteId ? undefined : hashContent(params.localId),
    storage: 'local-cache',
  })
}

async function writeProjectmanSeedFile(params: {
  repoRoot: string
  dir: string
  entityType: string
  remote: Record<string, unknown>
  projectId?: string
  scopeId?: string
  titleKey: 'name' | 'title'
  force?: boolean
}): Promise<string> {
  const remoteId = normalizeNonEmpty(params.remote.id)
  const existing = remoteId ? await findRecordByRemoteId(params.dir, remoteId) : null
  if (!params.force && existing && await protectPullTargetIfLocalChanged(existing)) {
    return relativePath(params.repoRoot, existing.filePath)
  }
  const localId = normalizeNonEmpty(existing?.frontmatter.localId) ?? randomUUID()
  const title = normalizeNonEmpty(params.remote[params.titleKey]) ?? normalizeNonEmpty(params.remote.name) ?? normalizeNonEmpty(params.remote.title) ?? localId
  const filePath = existing?.filePath ?? path.join(params.dir, `${slugify(title)}-${localId.slice(0, 8)}.md`)
  const body = `# ${title}\n`
  const frontmatter = withBaseHash({
    ...commonFrontmatter({
      entityType: params.entityType,
      projectId: params.projectId,
      scopeId: params.scopeId,
      localId,
      remoteId,
      remoteUpdatedAt: normalizeNonEmpty(params.remote.updatedAt),
    }),
    ...params.remote,
    id: localId,
    localId,
    remoteId,
    syncState: 'synced',
    storage: 'local-cache',
  }, body)
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await writeFileWithRetry(filePath, renderFrontmatterDocument(frontmatter, body), 'utf8')
  return path.relative(params.repoRoot, filePath).split(path.sep).join('/')
}

function sprintSlugFromRecord(frontmatter: Record<string, unknown>): string {
  const sprintId =
    normalizeNonEmpty(frontmatter.localId)
    ?? normalizeNonEmpty(frontmatter.id)
    ?? normalizeNonEmpty(frontmatter.remoteId)
    ?? 'unassigned'
  return slugify(normalizeNonEmpty(frontmatter.slug) ?? normalizeNonEmpty(frontmatter.name) ?? sprintId)
}

function microtaskLocalId(microtask: Record<string, unknown>, fallback: string): string {
  return normalizeNonEmpty(microtask.localId) ?? fallback
}

function chooseStableLocalId(params: {
  existingLocalId?: string
  candidateLocalId?: string
  remoteId?: string
  fallback: string
}): string {
  const existingLocalId = normalizeNonEmpty(params.existingLocalId)
  const candidateLocalId = normalizeNonEmpty(params.candidateLocalId)
  const remoteId = normalizeNonEmpty(params.remoteId)
  if (candidateLocalId && candidateLocalId !== remoteId && existingLocalId === remoteId) return candidateLocalId
  return existingLocalId ?? candidateLocalId ?? params.fallback
}





async function writeUtaskSeedFile(params: {
  repoRoot: string
  localRoot?: string
  sprint: Record<string, unknown>
  phase: Record<string, unknown>
  microtask: Record<string, unknown>
  projectId?: string
  scopeId?: string
  force?: boolean
  idsAreRemote?: boolean
}): Promise<string> {
  const paths = resolveRepoFirstProjectmanPaths(params)
  const microtaskId = normalizeNonEmpty(params.microtask.id)
  const microtaskLocalIdValue = normalizeNonEmpty(params.microtask.localId)
  const remoteId = normalizeNonEmpty(params.microtask.remoteId)
    ?? (params.idsAreRemote === true && microtaskId && microtaskId !== microtaskLocalIdValue ? microtaskId : undefined)
  const existing =
    (remoteId ? await findRecordByRemoteId(paths.utasks, remoteId, { recursive: true }) : null)
    ?? (normalizeNonEmpty(params.microtask.localId)
      ? await findRecordByLocalId(paths.utasks, normalizeNonEmpty(params.microtask.localId) as string, { recursive: true })
      : null)
  if (!params.force && existing && await protectPullTargetIfLocalChanged(existing)) {
    return relativePath(params.repoRoot, existing.filePath)
  }
  const fallbackId = `${slugify(normalizeNonEmpty(params.microtask.title) ?? 'utask')}-${randomUUID().slice(0, 8)}`
  const candidateLocalId = microtaskLocalId(params.microtask, fallbackId)
  const localId = chooseStableLocalId({
    existingLocalId: normalizeNonEmpty(existing?.frontmatter.localId),
    candidateLocalId,
    remoteId,
    fallback: fallbackId,
  })
  const title = normalizeNonEmpty(params.microtask.title) ?? localId
  const sprintLocalId = normalizeNonEmpty(params.sprint.localId) ?? normalizeNonEmpty(params.sprint.id) ?? normalizeNonEmpty(params.sprint.remoteId)
  const sprintRemoteId = normalizeNonEmpty(params.sprint.remoteId)
  const sprintSlug = sprintSlugFromRecord(params.sprint)
  const body = `# ${title}\n`
  const frontmatter = withBaseHash({
    ...commonFrontmatter({
      entityType: 'projectman.utask',
      projectId: params.projectId,
      scopeId: params.scopeId,
      localId,
      remoteId,
      remoteUpdatedAt: normalizeNonEmpty(params.microtask.updatedAt),
    }),
    ...params.microtask,
    id: localId,
    localId,
    remoteId,
    sprintLocalId,
    sprintRemoteId,
    sprintId: sprintLocalId,
    sprintSlug,
    phaseId: normalizeNonEmpty(params.phase.localId) ?? normalizeNonEmpty(params.phase.id),
    phaseRemoteId: normalizeNonEmpty(params.phase.remoteId) ?? normalizeNonEmpty(params.phase.id),
    phaseName: normalizeNonEmpty(params.phase.name),
    title,
    status: normalizeNonEmpty(params.microtask.status) ?? 'todo',
    position: numberField(params.microtask.position),
    notes: normalizeNonEmpty(params.microtask.notes),
    syncState: 'synced',
    storage: 'local-cache',
  }, body)
  const filePath = existing?.filePath ?? path.join(paths.utasks, sprintSlug, `${slugify(title)}-${localId.slice(0, 8)}.md`)
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await writeFileWithRetry(filePath, renderFrontmatterDocument(frontmatter, body), 'utf8')
  return relativePath(params.repoRoot, filePath)
}

async function writeUtaskSeedFilesFromSprint(params: {
  repoRoot: string
  localRoot?: string
  sprint: Record<string, unknown>
  projectId?: string
  scopeId?: string
  force?: boolean
  idsAreRemote?: boolean
}): Promise<string[]> {
  const files: string[] = []
  for (const phase of toRecordArray(params.sprint.phases)) {
    for (const microtask of toRecordArray(phase.microtasks)) {
      files.push(await writeUtaskSeedFile({
        repoRoot: params.repoRoot,
        localRoot: params.localRoot,
        sprint: params.sprint,
        phase,
        microtask,
        projectId: params.projectId,
        scopeId: params.scopeId,
        force: params.force,
        idsAreRemote: params.idsAreRemote,
      }))
    }
  }
  return files
}

function projectmanSeedConfig(context: RepoFirstSyncContext, entityType?: string): { dir: string; titleKey: 'name' | 'title' } | null {
  const paths = resolveRepoFirstProjectmanPaths(context)
  switch (entityType) {
    case 'projectman.board':
      return { dir: paths.boards, titleKey: 'name' }
    case 'projectman.kanban-task':
      return { dir: paths.tasks, titleKey: 'title' }
    case 'projectman.sprint':
      return { dir: paths.sprints, titleKey: 'name' }
    case 'projectman.issue':
      return { dir: paths.issues, titleKey: 'title' }
    case 'projectman.feedback':
      return { dir: paths.feedback, titleKey: 'title' }
    case 'projectman.review-request':
      return { dir: paths.reviewRequests, titleKey: 'title' }
    default:
      return null
  }
}

async function writeMemorySeedFile(params: {
  repoRoot: string
  dir: string
  remote: Record<string, unknown>
  projectId?: string
  scopeId?: string
  force?: boolean
}): Promise<string> {
  const remoteId = normalizeNonEmpty(params.remote.id)
  const existing = remoteId ? await findRecordByRemoteId(params.dir, remoteId) : null
  if (!params.force && existing && await protectPullTargetIfLocalChanged(existing)) {
    return relativePath(params.repoRoot, existing.filePath)
  }
  const id = normalizeNonEmpty(existing?.frontmatter.localId) ?? randomUUID()
  const meta = isRecord(params.remote.meta) ? params.remote.meta : {}
  const body = normalizeNonEmpty(params.remote.content) ?? ''
  const memory = withBaseHash({
    ...meta,
    schemaVersion: 2,
    entityType: 'agentspace.memory-item',
    id,
    localId: id,
    remoteId,
    syncState: 'synced',
    storage: 'local-cache',
    memoryId: id,
    kind: normalizeNonEmpty(params.remote.kind),
    durability: normalizeNonEmpty(params.remote.durability),
    subjectType: normalizeNonEmpty(params.remote.sourceType) ?? normalizeNonEmpty(meta.subjectType),
    subjectId: normalizeNonEmpty(params.remote.sourceId) ?? normalizeNonEmpty(meta.subjectId),
    subjectTitle: normalizeNonEmpty(meta.subjectTitle),
    projectId: params.projectId,
    scopeId: params.scopeId,
    tags: Array.isArray(params.remote.tags) ? params.remote.tags : undefined,
    createdAt: normalizeNonEmpty(params.remote.createdAt),
    updatedAt: normalizeNonEmpty(params.remote.updatedAt),
  }, body)
  const filePath = existing?.filePath ?? path.join(params.dir, `${slugify(normalizeNonEmpty(params.remote.kind) ?? 'memory')}-${id.slice(0, 8)}.md`)
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await writeFileWithRetry(filePath, renderFrontmatterDocument(memory, body), 'utf8')
  return path.relative(params.repoRoot, filePath).split(path.sep).join('/')
}

async function writeExperienceSeedFile(params: {
  repoRoot: string
  dir: string
  remote: Record<string, unknown>
  projectId?: string
  scopeId?: string
  force?: boolean
}): Promise<string> {
  const remoteId = normalizeNonEmpty(params.remote.id)
  const existing = remoteId ? await findRecordByRemoteId(params.dir, remoteId) : null
  if (!params.force && existing && await protectPullTargetIfLocalChanged(existing)) {
    return relativePath(params.repoRoot, existing.filePath)
  }
  const id = normalizeNonEmpty(existing?.frontmatter.localId) ?? randomUUID()
  const body = normalizeNonEmpty(params.remote.content) ?? ''
  const frontmatter = withBaseHash({
    ...commonFrontmatter({
      entityType: 'agentspace.experience-item',
      projectId: params.projectId,
      scopeId: params.scopeId,
      localId: id,
      remoteId,
      remoteUpdatedAt: normalizeNonEmpty(params.remote.updatedAt),
    }),
    type: normalizeNonEmpty(params.remote.type),
    title: normalizeNonEmpty(params.remote.title),
    problem: normalizeNonEmpty(params.remote.problem),
    solution: normalizeNonEmpty(params.remote.solution),
    areas: Array.isArray(params.remote.areas) ? params.remote.areas : undefined,
    stack: Array.isArray(params.remote.stack) ? params.remote.stack : undefined,
    commands: Array.isArray(params.remote.commands) ? params.remote.commands : undefined,
    files: Array.isArray(params.remote.files) ? params.remote.files : undefined,
    sourceRefs: Array.isArray(params.remote.sourceRefs) ? params.remote.sourceRefs : undefined,
    tags: Array.isArray(params.remote.tags) ? params.remote.tags : undefined,
    confidence: normalizeNonEmpty(params.remote.confidence),
    reusability: normalizeNonEmpty(params.remote.reusability),
    meta: isRecord(params.remote.meta) ? params.remote.meta : undefined,
    id,
    localId: id,
    remoteId,
    syncState: 'synced',
    storage: 'local-cache',
    createdAt: normalizeNonEmpty(params.remote.createdAt),
    updatedAt: normalizeNonEmpty(params.remote.updatedAt),
  }, body)
  const filePath = existing?.filePath ?? path.join(
    params.dir,
    `${slugify(normalizeNonEmpty(params.remote.type) ?? 'experience')}-${slugify(normalizeNonEmpty(params.remote.title) ?? id)}-${id.slice(0, 8)}.md`,
  )
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await writeFileWithRetry(filePath, renderFrontmatterDocument(frontmatter, body), 'utf8')
  return path.relative(params.repoRoot, filePath).split(path.sep).join('/')
}

async function invokeRead(apiState: NonNullable<Awaited<ReturnType<typeof requireApiState>>>, options: SyncOptions, toolId: string, input: Record<string, unknown>): Promise<unknown> {
  const payload = await invokeHostedToolWithApiState(apiState, {
    ...options,
    toolId,
    input,
    disableDurableActivityLog: true,
  })
  return unwrapHostedToolResult(payload)
}

function buildHostedMirrorFallbackBody(kind: 'skill' | 'prompt', name: string): string {
  const label = kind === 'skill' ? 'skill' : 'prompt'
  return [
    `# ${name}`,
    '',
    `No current hosted ${label} version is published.`,
  ].join('\n')
}

function buildHostedSkillMirrorItem(project: HostedMirrorProject, skill: Record<string, unknown>, currentVersion: Record<string, unknown> | null): HostedMirrorItem {
  const remoteId = normalizeNonEmpty(skill.id)
  if (!remoteId) throw new Error('Hosted skill mirror item is missing id.')
  const name = normalizeNonEmpty(skill.name) ?? remoteId
  const body = normalizeNonEmpty(currentVersion?.content) ?? buildHostedMirrorFallbackBody('skill', name)
  return {
    kind: 'skill',
    remoteId,
    name,
    body,
    frontmatter: compactPayload({
      schemaVersion: 2,
      entityType: 'agentspace.hosted-skill-current',
      storage: 'hosted-pull',
      readOnly: true,
      remoteId,
      currentVersionId: normalizeNonEmpty(skill.currentVersionId),
      currentVersion: normalizeNonEmpty(currentVersion?.version),
      currentVersionStatus: normalizeNonEmpty(currentVersion?.status),
      name,
      description: normalizeNonEmpty(skill.description),
      shortDescription: normalizeNonEmpty(skill.shortDescription),
      tags: toStringArray(skill.tags),
      entryFile: normalizeNonEmpty(currentVersion?.entryFile),
      skillStandard: normalizeNonEmpty(currentVersion?.skillStandard),
      refType: normalizeNonEmpty(currentVersion?.refType),
      refId: normalizeNonEmpty(currentVersion?.refId),
      meta: isRecord(currentVersion?.meta) ? currentVersion?.meta : undefined,
      sourceProjectId: normalizeNonEmpty(project.projectId),
      sourceProjectName: normalizeNonEmpty(project.projectName),
      sourceProjectSlug: normalizeNonEmpty(project.projectSlug),
      sourceScopeId: normalizeNonEmpty(project.scopeId),
      pulledAt: new Date().toISOString(),
      shellUpdatedAt: normalizeNonEmpty(skill.updatedAt),
      versionUpdatedAt: normalizeNonEmpty(currentVersion?.updatedAt),
    }),
  }
}

function buildHostedPromptMirrorItem(project: HostedMirrorProject, prompt: Record<string, unknown>, currentVersion: Record<string, unknown> | null): HostedMirrorItem {
  const remoteId = normalizeNonEmpty(prompt.id)
  if (!remoteId) throw new Error('Hosted prompt mirror item is missing id.')
  const name = normalizeNonEmpty(prompt.name) ?? remoteId
  const body = normalizeNonEmpty(currentVersion?.content) ?? buildHostedMirrorFallbackBody('prompt', name)
  return {
    kind: 'prompt',
    remoteId,
    name,
    body,
    frontmatter: compactPayload({
      schemaVersion: 2,
      entityType: 'agentspace.hosted-prompt-current',
      storage: 'hosted-pull',
      readOnly: true,
      remoteId,
      currentVersionId: normalizeNonEmpty(prompt.currentVersionId),
      currentVersion: normalizeNonEmpty(currentVersion?.version),
      currentVersionStatus: normalizeNonEmpty(currentVersion?.status),
      name,
      description: normalizeNonEmpty(prompt.description),
      status: normalizeNonEmpty(prompt.status),
      tags: toStringArray(prompt.tags),
      variables: currentVersion?.variables,
      meta: isRecord(currentVersion?.meta) ? currentVersion?.meta : undefined,
      refType: normalizeNonEmpty(currentVersion?.refType),
      refId: normalizeNonEmpty(currentVersion?.refId),
      sourceProjectId: normalizeNonEmpty(project.projectId),
      sourceProjectName: normalizeNonEmpty(project.projectName),
      sourceProjectSlug: normalizeNonEmpty(project.projectSlug),
      sourceScopeId: normalizeNonEmpty(project.scopeId),
      pulledAt: new Date().toISOString(),
      shellUpdatedAt: normalizeNonEmpty(prompt.updatedAt),
      versionUpdatedAt: normalizeNonEmpty(currentVersion?.updatedAt),
    }),
  }
}

async function resolveHostedProjectById(
  apiState: NonNullable<Awaited<ReturnType<typeof requireApiState>>>,
  options: SyncOptions,
  id: string,
): Promise<HostedMirrorProject> {
  try {
    const data = extractResultData(await invokeRead(apiState, options, 'agentspace.project.get-by-id', { id }))
    if (!isRecord(data)) {
      return {
        projectId: id,
        scopeId: id,
      }
    }
    return compactPayload({
      projectId: normalizeNonEmpty(data.id) ?? id,
      projectName: normalizeNonEmpty(data.name),
      projectSlug: normalizeNonEmpty(data.slug),
      scopeId: resolveOwnerScopeIdFromProjectRecord(data, id),
    })
  } catch {
    return {
      projectId: id,
      scopeId: id,
    }
  }
}

async function resolveHostedProjectByFilter(
  apiState: NonNullable<Awaited<ReturnType<typeof requireApiState>>>,
  options: SyncOptions,
  filter: Record<string, unknown>,
  label: string,
): Promise<HostedMirrorProject> {
  let rows = toRecordArray(await invokeRead(apiState, options, 'agentspace.project.list-projects', {
    filter,
    options: { limit: 20 },
  }))
  let usedUnfilteredSlugFallback = false
  if (rows.length === 0 && filter.slug) {
    rows = toRecordArray(await invokeRead(apiState, options, 'agentspace.project.list-projects', {
      filter: {},
      options: { limit: 500 },
    }))
    usedUnfilteredSlugFallback = true
  }
  if (rows.length === 0) {
    throw new Error(`Hosted project mirror target not found for ${label}.`)
  }
  const exactRows = rows.filter((row) => {
    if (filter.slug) return matchesHostedProjectSlugSelector(row, normalizeNonEmpty(filter.slug))
    if (filter.name) return normalizeNonEmpty(row.name)?.toLowerCase() === normalizeNonEmpty(filter.name)?.toLowerCase()
    return true
  })
  if (usedUnfilteredSlugFallback && exactRows.length === 0) {
    throw new Error(`Hosted project mirror target not found for ${label}.`)
  }
  const matches = exactRows.length > 0 ? exactRows : rows
  if (matches.length > 1) {
    const ids = matches
      .map((row) => `${normalizeNonEmpty(row.name) ?? normalizeNonEmpty(row.slug) ?? normalizeNonEmpty(row.id) ?? 'unknown'} (${normalizeNonEmpty(row.id) ?? '-'})`)
      .join(', ')
    throw new Error(`Hosted project mirror target is ambiguous for ${label}: ${ids}.`)
  }
  return resolveHostedProjectById(apiState, options, normalizeNonEmpty(matches[0]?.id) ?? label)
}

function matchesHostedProjectSlugSelector(row: Record<string, unknown>, selector?: string): boolean {
  const desiredSlug = selector ? slugify(selector) : undefined
  if (!desiredSlug) return false
  const name = normalizeNonEmpty(row.name)
  const aliases = [
    normalizeNonEmpty(row.slug),
    normalizeNonEmpty(row.projectSlug),
    name ? slugify(name) : undefined,
  ]
  return aliases.some((alias) => alias ? slugify(alias) === desiredSlug : false)
}

async function resolveHostedMirrorTargets(
  apiState: NonNullable<Awaited<ReturnType<typeof requireApiState>>>,
  options: SyncOptions,
  context: Awaited<ReturnType<typeof resolveProjectBindingContext>>,
): Promise<HostedMirrorProject[]> {
  const targets: HostedMirrorProject[] = []
  if (normalizeNonEmpty(context.projectId)) {
    targets.push(await resolveHostedProjectById(apiState, options, normalizeNonEmpty(context.projectId) as string))
  } else {
    targets.push(compactPayload({
      projectId: normalizeNonEmpty(context.projectId),
      projectName: normalizeNonEmpty(context.projectName),
      projectSlug: normalizeNonEmpty(context.projectSlug),
      scopeId: normalizeNonEmpty(context.scopeId),
    }))
  }
  for (const projectId of options.hostedProjectId ?? []) {
    targets.push(await resolveHostedProjectById(apiState, options, projectId))
  }
  for (const projectName of options.hostedProjectName ?? []) {
    targets.push(await resolveHostedProjectByFilter(apiState, options, { name: projectName }, `name "${projectName}"`))
  }
  for (const projectSlug of options.hostedProjectSlug ?? []) {
    targets.push(await resolveHostedProjectByFilter(apiState, options, { slug: projectSlug }, `slug "${projectSlug}"`))
  }

  const deduped = new Map<string, HostedMirrorProject>()
  for (const target of targets) {
    const key = normalizeNonEmpty(target.projectId)
      ?? normalizeNonEmpty(target.scopeId)
      ?? normalizeNonEmpty(target.projectSlug)
      ?? normalizeNonEmpty(target.projectName)
    if (key) deduped.set(key, target)
  }
  return [...deduped.values()]
}

async function buildHostedMirrorItemsForProject(
  apiState: NonNullable<Awaited<ReturnType<typeof requireApiState>>>,
  options: SyncOptions,
  project: HostedMirrorProject,
): Promise<{ skillItems: HostedMirrorItem[]; promptItems: HostedMirrorItem[] }> {
  const scopeId = normalizeNonEmpty(project.scopeId) ?? normalizeNonEmpty(project.projectId)
  if (!scopeId) return { skillItems: [], promptItems: [] }

  const [skills, prompts] = await Promise.all([
    toRecordArray(await invokeRead(apiState, options, 'agentspace.skill.list-skills', {
      filter: compactPayload({ scopeId, scopeResolution: 'cascade' }),
      options: { limit: 500 },
    })),
    toRecordArray(await invokeRead(apiState, options, 'agentspace.prompt.list-prompts', {
      filter: compactPayload({ scopeId, scopeResolution: 'cascade', limit: 500 }),
    })),
  ])

  const skillItems = await Promise.all(skills.map(async (skill) => {
    const currentVersionId = normalizeNonEmpty(skill.currentVersionId)
    const currentVersion = currentVersionId
      ? extractResultData(await invokeRead(apiState, options, 'agentspace.skill-version.get-skill-version', { id: currentVersionId }))
      : null
    return buildHostedSkillMirrorItem(project, skill, isRecord(currentVersion) ? currentVersion : null)
  }))

  const promptItems = await Promise.all(prompts.map(async (prompt) => {
    const currentVersionId = normalizeNonEmpty(prompt.currentVersionId)
    const currentVersion = currentVersionId
      ? extractResultData(await invokeRead(apiState, options, 'agentspace.prompt-version.get-prompt-version', { id: currentVersionId }))
      : null
    return buildHostedPromptMirrorItem(project, prompt, isRecord(currentVersion) ? currentVersion : null)
  }))

  return { skillItems, promptItems }
}

async function readRemoteBoardColumns(
  apiState: NonNullable<Awaited<ReturnType<typeof requireApiState>>>,
  options: SyncOptions,
  boardRemoteId: string,
): Promise<Array<Record<string, unknown>>> {
  const boardColumnRows = toRecordArray(await invokeRead(apiState, options, 'projectman.kanban-board-column.list', { board: boardRemoteId }))
  const rows: Array<Record<string, unknown>> = []
  for (const row of boardColumnRows.sort((left, right) => (numberField(left.position) ?? 0) - (numberField(right.position) ?? 0))) {
    const boardColumnId = normalizeNonEmpty(row.id) ?? normalizeNonEmpty(row.boardColumnId)
    const columnId = normalizeNonEmpty(row.columnId) ?? normalizeNonEmpty(row.column)
    let column: Record<string, unknown> = {}
    if (columnId) {
      try {
        column = extractResultData(await invokeRead(apiState, options, 'projectman.kanban-column.get', { id: columnId })) ?? {}
      } catch {
        column = {}
      }
    }
    const name = normalizeNonEmpty(column.name) ?? normalizeNonEmpty(row.name) ?? normalizeNonEmpty(row.columnName) ?? columnId ?? boardColumnId
    const slug = normalizeNonEmpty(column.slug) ?? normalizeNonEmpty(row.slug) ?? normalizeNonEmpty(row.columnSlug) ?? (name ? slugify(name) : undefined)
    rows.push(compactPayload({
      localId: boardColumnId ?? columnId ?? slug,
      id: boardColumnId ?? columnId ?? slug,
      name,
      slug,
      position: numberField(row.position) ?? rows.length,
      description: normalizeNonEmpty(column.description),
      wipLimit: numberField(column.wipLimit),
      remoteColumnId: columnId,
      columnId,
      remoteBoardColumnId: boardColumnId,
      boardColumnId,
    }))
  }
  return rows
}








async function collectSyncStatusData(
  context: ResolvedProjectBindingContext,
  options: SyncOptions,
): Promise<Record<string, unknown>> {
  const sourceRecords = await readRepoFirstSourceRecords(context)
  const selection = buildSyncSelection(context.repoRoot, sourceRecords, options)
  const records = await collectRepoFirstSyncRecords(context)
  const selectedRecords = selection.active
    ? records.filter((record) => selection.selectedPaths.has(normalizeNonEmpty(record.path) ?? ''))
    : records
  const byState = selectedRecords.reduce<Record<string, number>>((acc, record) => {
    const key = normalizeNonEmpty(record.syncState) ?? 'unknown'
    acc[key] = (acc[key] ?? 0) + 1
    return acc
  }, {})
  await ensureGitignore(context.repoRoot)
  const state = await readState(context.repoRoot)
  const lastPush = isRecord(state.lastPush) ? state.lastPush : undefined
  const statePath = await writeState(context.repoRoot, { lastStatus: { byState, recordCount: selectedRecords.length, selection: selection.active ? selection.filters : undefined } })
  return { recordCount: selectedRecords.length, totalRecordCount: records.length, byState, records: selectedRecords, selection: selection.active ? selection.filters : undefined, lastPush, statePath }
}

async function runSyncStatus(options: SyncOptions): Promise<void> {
  try {
    if (options.allProjects === true) {
      await runForAllProjects(options, 'sync.status', async (projectOptions, context) => collectSyncStatusData(context, projectOptions))
      return
    }
    const context = await resolveProjectBindingContext(options, { requireProject: true })
    const data = await collectSyncStatusData(context, options)
    emit(options, {
      command: 'sync.status',
      surface: 'hosted-cache-sync',
      resolvedContext: context,
      result: { ok: true, data },
    }, 'Local cache sync status loaded.')
  } catch (error) {
    logError(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}

async function collectSyncDiffData(
  context: ResolvedProjectBindingContext,
  options: SyncOptions,
): Promise<Record<string, unknown>> {
  const sourceRecords = await readRepoFirstSourceRecords(context)
  const selection = buildSyncSelection(context.repoRoot, sourceRecords, options)
  const records = await collectRepoFirstSyncRecords(context)
  const selectedRecords = selection.active
    ? records.filter((record) => selection.selectedPaths.has(normalizeNonEmpty(record.path) ?? ''))
    : records
  const changed = selectedRecords.filter((record) => ['local', 'dirty', 'deleted', 'conflict'].includes(String(record.syncState)))
  return { changedCount: changed.length, totalRecordCount: records.length, selectedRecordCount: selectedRecords.length, selection: selection.active ? selection.filters : undefined, changed }
}

async function runSyncDiff(options: SyncOptions): Promise<void> {
  try {
    if (options.allProjects === true) {
      await runForAllProjects(options, 'sync.diff', async (projectOptions, context) => collectSyncDiffData(context, projectOptions))
      return
    }
    const context = await resolveProjectBindingContext(options, { requireProject: true })
    const data = await collectSyncDiffData(context, options)
    emit(options, {
      command: 'sync.diff',
      surface: 'hosted-cache-sync',
      resolvedContext: context,
      result: { ok: true, data },
    }, 'Local cache sync diff loaded.')
  } catch (error) {
    logError(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}

async function collectSyncPullData(
  options: SyncOptions,
  command: 'sync.pull' | 'sync.bootstrap',
  context: ResolvedProjectBindingContext,
  apiState: ApiState,
): Promise<Record<string, unknown>> {
    const projectId = normalizeNonEmpty(context.projectId)
    const scopeId = normalizeNonEmpty(context.scopeId) ?? projectId
    const pmPaths = resolveRepoFirstProjectmanPaths(context)
    const agPaths = resolveRepoFirstAgentspacePaths(context)
    const filesWritten: string[] = []

    const [boards, tasks, sprints, issues, feedback, reviewRequests, experiences, memories] = await Promise.all([
      invokeRead(apiState, options, 'projectman.kanban-board.list', compactPayload({ scopeId, project: projectId })),
      invokeRead(apiState, options, 'projectman.kanban-task.list', compactPayload({ scopeId, project: projectId })),
      invokeRead(apiState, options, 'projectman.sprint.list', compactPayload({ scopeId, project: projectId })),
      invokeRead(apiState, options, 'projectman.issue.list', compactPayload({ scopeId })),
      invokeRead(apiState, options, 'projectman.feedback.list', compactPayload({ scopeId })),
      invokeRead(apiState, options, 'projectman.review-request.list', compactPayload({ scopeId })),
      invokeRead(apiState, options, 'agentspace.experience-item.list-experience-items', {
        filter: compactPayload({ scopeId, scopeResolution: 'cascade' }),
        options: { limit: 500 },
      }),
      invokeRead(apiState, options, 'agentspace.memory-item.list-memory-items', {
        filter: compactPayload({ scopeId, scopeResolution: 'cascade', projectId }),
        options: { limit: 500 },
      }),
    ])

    for (const row of toRecordArray(boards)) {
      const remoteId = normalizeNonEmpty(row.id)
      let remote = row
      if (remoteId) {
        const columns = await readRemoteBoardColumns(apiState, options, remoteId)
        if (columns.length > 0) {
          remote = {
            ...row,
            columns,
            lastSyncedColumnsHash: boardColumnsHash(columns),
          }
        }
      }
      filesWritten.push(await writeProjectmanSeedFile({ repoRoot: context.repoRoot, dir: pmPaths.boards, entityType: 'projectman.board', remote, projectId, scopeId, titleKey: 'name' }))
    }
    for (const row of toRecordArray(tasks)) {
      filesWritten.push(await writeProjectmanSeedFile({ repoRoot: context.repoRoot, dir: pmPaths.tasks, entityType: 'projectman.kanban-task', remote: row, projectId, scopeId, titleKey: 'title' }))
    }
    for (const row of toRecordArray(sprints)) {
      const sprintPath = await writeProjectmanSeedFile({ repoRoot: context.repoRoot, dir: pmPaths.sprints, entityType: 'projectman.sprint', remote: row, projectId, scopeId, titleKey: 'name' })
      filesWritten.push(sprintPath)
      const sprintRecord = parseFrontmatterDocument(await fs.readFile(path.join(context.repoRoot, sprintPath), 'utf8'))
      if (normalizeSyncState({ filePath: sprintPath, frontmatter: sprintRecord.frontmatter, body: sprintRecord.body }) === 'synced') {
        filesWritten.push(...await writeUtaskSeedFilesFromSprint({
          repoRoot: context.repoRoot,
          localRoot: context.localRoot,
          sprint: sprintRecord.frontmatter,
          projectId,
          scopeId,
          idsAreRemote: true,
        }))
      }
    }
    for (const row of toRecordArray(issues)) {
      filesWritten.push(await writeProjectmanSeedFile({ repoRoot: context.repoRoot, dir: pmPaths.issues, entityType: 'projectman.issue', remote: row, projectId, scopeId, titleKey: 'title' }))
    }
    for (const row of toRecordArray(feedback)) {
      filesWritten.push(await writeProjectmanSeedFile({ repoRoot: context.repoRoot, dir: pmPaths.feedback, entityType: 'projectman.feedback', remote: row, projectId, scopeId, titleKey: 'title' }))
    }
    for (const row of toRecordArray(reviewRequests)) {
      filesWritten.push(await writeProjectmanSeedFile({ repoRoot: context.repoRoot, dir: pmPaths.reviewRequests, entityType: 'projectman.review-request', remote: row, projectId, scopeId, titleKey: 'title' }))
    }
    for (const row of toRecordArray(experiences)) {
      filesWritten.push(await writeExperienceSeedFile({ repoRoot: context.repoRoot, dir: agPaths.experienceItems, remote: row, projectId, scopeId }))
    }
    for (const row of toRecordArray(memories)) {
      filesWritten.push(await writeMemorySeedFile({ repoRoot: context.repoRoot, dir: agPaths.memoryItems, remote: row, projectId, scopeId }))
    }

    const hostedMirrorTargets = await resolveHostedMirrorTargets(apiState, options, context)
    const touchedHostedProjectKeys = hostedMirrorTargets.map((target) => hostedProjectKey(target))
    const hostedSkillItems: HostedMirrorItem[] = []
    const hostedPromptItems: HostedMirrorItem[] = []
    for (const target of hostedMirrorTargets) {
      const mirrorItems = await buildHostedMirrorItemsForProject(apiState, options, target)
      hostedSkillItems.push(...mirrorItems.skillItems)
      hostedPromptItems.push(...mirrorItems.promptItems)
    }
    filesWritten.push(...await syncHostedMirrorKind(context.repoRoot, 'skill', hostedSkillItems, { touchedProjectKeys: touchedHostedProjectKeys }))
    filesWritten.push(...await syncHostedMirrorKind(context.repoRoot, 'prompt', hostedPromptItems, { touchedProjectKeys: touchedHostedProjectKeys }))

    await rebuildProjectmanViews(context)
    const experienceItems = await readExperienceItems(agPaths.experienceItems)
    await rebuildExperienceWorkspace(context, experienceItems)
    const memoryItems = await readLocalMemoryEntries(agPaths.memoryItems)
    await rebuildLocalMemoryWorkspace({
      ...context,
      items: memoryItems,
    })
    filesWritten.push(...await rebuildHostedWorkspace(context.repoRoot))

    await ensureGitignore(context.repoRoot)
    const statePath = await writeState(context.repoRoot, { lastPull: { command, filesWritten } })
    return { filesWritten, statePath }
}

async function runSyncPullOrBootstrap(options: SyncOptions, command: 'sync.pull' | 'sync.bootstrap'): Promise<void> {
  try {
    if (command === 'sync.bootstrap' && options.fromServer !== true) {
      throw new Error('sync bootstrap requires --from-server.')
    }
    if (options.apply !== true) throw new Error(`${command} writes local cache source files. Retry with --apply.`)
    if (options.allProjects === true) {
      await runForAllProjects(options, command, async (projectOptions, context, apiState) => {
        if (!apiState) throw new Error(`${command} requires hosted API state.`)
        return collectSyncPullData(projectOptions, command, context, apiState)
      }, { requireApi: true })
      return
    }
    const context = await resolveProjectBindingContext(options, { requireProject: true })
    const apiState = await requireApiState(options)
    if (!apiState) return
    const data = await collectSyncPullData(options, command, context, apiState)
    emit(options, {
      command,
      surface: 'hosted-cache-sync',
      resolvedContext: context,
      result: { ok: true, data },
    }, `${command} completed.`)
  } catch (error) {
    logError(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}



const SIDECAR_CONTRACT_VERSION = 'aops-cockpit-sidecar-v1'
const DEFAULT_SIDECAR_HOST = '127.0.0.1'
const DEFAULT_SIDECAR_PORT = 18459
const DEFAULT_SIDECAR_ORIGINS = new Set([
  'http://localhost:5940',
  'http://127.0.0.1:5940',
  'http://localhost:5941',
  'http://127.0.0.1:5941',
  'http://localhost:5174',
  'http://127.0.0.1:5174',
])

async function findAopsRepoRootUpward(startDir = process.cwd()): Promise<string | null> {
  let current = path.resolve(startDir)
  while (true) {
    if (existsSync(path.join(current, '.aops', 'aops.config.json')) && await readAopsRepoConfigReadOnly(current)) {
      return current
    }
    const parent = path.dirname(current)
    if (parent === current) return null
    current = parent
  }
}

const SIDECAR_REPO_DISCOVERY_SKIP_DIRS = new Set([
  '.git',
  '.next',
  '.turbo',
  'coverage',
  'dist',
  'node_modules',
])

function normalizedEquals(left: unknown, right: unknown): boolean {
  const l = normalizeNonEmpty(left)?.toLowerCase()
  const r = normalizeNonEmpty(right)?.toLowerCase()
  return Boolean(l && r && l === r)
}

function scoreSidecarRepoCandidate(
  candidateRoot: string,
  config: AopsRepoConfig,
  options: SyncSidecarOptions,
): number {
  const projectSlug = normalizeNonEmpty(options.projectSlug)
  const projectName = normalizeNonEmpty(options.projectName)
  const projectId = normalizeNonEmpty(options.projectId)
  const scopeId = normalizeNonEmpty(options.scopeId)
  const hasExplicitSelector = Boolean(projectSlug || projectName || projectId || scopeId)
  const repoName = normalizeNonEmpty(config.repo?.name)
  const baseName = path.basename(candidateRoot)
  let score = 0

  if (projectSlug && (normalizedEquals(repoName, projectSlug) || normalizedEquals(baseName, projectSlug))) score += 60
  if (projectName && (normalizedEquals(repoName, projectName) || normalizedEquals(baseName, projectName))) score += 40

  for (const project of config.projects) {
    let projectScore = 0
    if (projectSlug && normalizedEquals(project.slug, projectSlug)) projectScore += 50
    if (projectName && normalizedEquals(project.name, projectName)) projectScore += 50
    if (projectId && (project.projectId === projectId || project.scopeId === projectId)) projectScore += 50
    if (scopeId && (project.scopeId === scopeId || project.projectId === scopeId)) projectScore += 50
    if (!hasExplicitSelector && normalizedEquals(project.name, config.activeProjectName)) projectScore += 12
    if (normalizeNonEmpty(project.localRoot)) projectScore += 4
    score = Math.max(score, projectScore)
  }

  if (!hasExplicitSelector && config.projects.length === 1) score += 10
  return score
}

function sidecarSelectorLabel(options: SyncSidecarOptions): string {
  return normalizeNonEmpty(options.projectSlug)
    ? `project slug "${options.projectSlug}"`
    : normalizeNonEmpty(options.projectName)
      ? `project name "${options.projectName}"`
      : normalizeNonEmpty(options.projectId)
        ? `project id "${options.projectId}"`
        : normalizeNonEmpty(options.scopeId)
          ? `scope id "${options.scopeId}"`
          : 'the active project selector'
}

async function findNearbyAopsRepoRoots(startDir: string, maxDepth = 2): Promise<string[]> {
  const roots: string[] = []

  async function visit(dir: string, depth: number): Promise<void> {
    if (existsSync(path.join(dir, '.aops', 'aops.config.json'))) {
      roots.push(dir)
      return
    }
    if (depth <= 0) return

    let entries: Dirent[]
    try {
      entries = await fs.readdir(dir, { withFileTypes: true })
    } catch {
      return
    }

    for (const entry of entries) {
      if (!entry.isDirectory() || SIDECAR_REPO_DISCOVERY_SKIP_DIRS.has(entry.name)) continue
      await visit(path.join(dir, entry.name), depth - 1)
    }
  }

  await visit(path.resolve(startDir), maxDepth)
  return roots
}

async function findAopsRepoRootNear(startDir: string, options: SyncSidecarOptions): Promise<string | null> {
  const upward = await findAopsRepoRootUpward(startDir)
  if (upward) return upward

  const candidates = await findNearbyAopsRepoRoots(startDir)
  if (candidates.length === 0) return null

  const scored: Array<{ root: string; score: number }> = []
  for (const candidate of candidates) {
    const config = await readAopsRepoConfigReadOnly(candidate)
    if (!config) continue
    const score = scoreSidecarRepoCandidate(candidate, config, options)
    if (score > 0) scored.push({ root: candidate, score })
  }

  scored.sort((left, right) => right.score - left.score || left.root.length - right.root.length)
  const best = scored[0]
  if (best) {
    const ties = scored.filter((candidate) => candidate.score === best.score)
    if (ties.length > 1) {
      throw new Error(
        `Sidecar ${sidecarSelectorLabel(options)} matched multiple nearby AOPS repos: ${ties.map((entry) => entry.root).join(', ')}. Start the sidecar from the intended repo root or pass --project-id/--scope-id explicitly.`,
      )
    }
    return best.root
  }
  return candidates.length === 1 ? candidates[0] : null
}

export async function resolveSidecarRuntimeContext(options: SyncSidecarOptions): Promise<SidecarRuntimeContext> {
  const discoveredRoot = await findAopsRepoRootNear(process.cwd(), options)
  if (discoveredRoot && path.resolve(discoveredRoot) !== path.resolve(process.cwd())) {
    process.chdir(discoveredRoot)
  }
  const repo = await loadAopsRepoConfigReadOnly(discoveredRoot ?? process.cwd()).catch(() => null)
  const projects = repo?.config?.projects ?? []
  const selectedProject = normalizeNonEmpty(options.projectSlug)
    ? projects.find((project) => normalizeNonEmpty(project.slug) === normalizeNonEmpty(options.projectSlug))
    : projects.length === 1
      ? projects[0]
      : undefined
  return compactPayload({
    repoRoot: repo?.rootDir ?? discoveredRoot ?? process.cwd(),
    projectSlug: normalizeNonEmpty(options.projectSlug) ?? normalizeNonEmpty(selectedProject?.slug),
    projectId: normalizeNonEmpty(options.projectId) ?? normalizeNonEmpty(selectedProject?.projectId) ?? normalizeNonEmpty(selectedProject?.scopeId),
    scopeId: normalizeNonEmpty(options.scopeId) ?? normalizeNonEmpty(selectedProject?.scopeId) ?? normalizeNonEmpty(selectedProject?.projectId),
  }) as SidecarRuntimeContext
}

function parsePort(value: unknown): number {
  const port = typeof value === 'number' ? value : Number.parseInt(String(value ?? DEFAULT_SIDECAR_PORT), 10)
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid sidecar port "${String(value)}".`)
  }
  return port
}

function parseSidecarOrigins(options: SyncSidecarOptions): Set<string> {
  const origins = new Set(DEFAULT_SIDECAR_ORIGINS)
  for (const origin of toStringArray(options.allowOrigin)) {
    if (origin === '*') {
      origins.add(origin)
      continue
    }
    try {
      origins.add(new URL(origin).origin)
    } catch {
      throw new Error(`Invalid --allow-origin value "${origin}".`)
    }
  }
  return origins
}

function resolveCorsOrigin(origin: string | undefined, allowed: Set<string>): string | null {
  if (!origin) return null
  if (allowed.has('*')) return origin
  try {
    const normalized = new URL(origin).origin
    return allowed.has(normalized) ? normalized : null
  } catch {
    return null
  }
}

function writeSidecarJson(
  res: ServerResponse,
  status: number,
  payload: Record<string, unknown>,
  corsOrigin: string | null,
): void {
  const headers: Record<string, string> = {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  }
  if (corsOrigin) {
    headers['access-control-allow-origin'] = corsOrigin
    headers.vary = 'Origin'
  }
  res.writeHead(status, headers)
  res.end(`${JSON.stringify(payload, null, 2)}\n`)
}

function writeSidecarOptions(res: ServerResponse, corsOrigin: string | null): void {
  const headers: Record<string, string> = {
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': 'authorization,content-type,x-aops-sidecar-token',
    'access-control-max-age': '600',
  }
  if (corsOrigin) {
    headers['access-control-allow-origin'] = corsOrigin
    headers.vary = 'Origin'
  }
  res.writeHead(corsOrigin ? 204 : 403, headers)
  res.end()
}

function sidecarAuthOk(req: IncomingMessage, token: string | undefined): boolean {
  const expected = normalizeNonEmpty(token) ?? normalizeNonEmpty(process.env.AOPS_COCKPIT_SIDECAR_TOKEN)
  if (!expected) return true
  const authorization = normalizeNonEmpty(req.headers.authorization)
  if (authorization === `Bearer ${expected}`) return true
  return normalizeNonEmpty(req.headers['x-aops-sidecar-token']) === expected
}

function sidecarPath(url: URL): string {
  return url.pathname.replace(/^\/api\/aops-cockpit-sidecar/, '') || '/'
}

function boolFromBody(value: unknown, fallback = false): boolean {
  if (typeof value === 'boolean') return value
  if (typeof value === 'string') return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase())
  return fallback
}

function queryList(url: URL, key: string): string[] {
  return url.searchParams.getAll(key).map((value) => value.trim()).filter(Boolean)
}

function buildSidecarSyncOptions(
  base: SyncSidecarOptions,
  url: URL,
  body: Record<string, unknown> = {},
): SyncOptions {
  const projectSlug = normalizeNonEmpty(body.projectSlug)
    ?? normalizeNonEmpty(body.project)
    ?? normalizeNonEmpty(url.searchParams.get('projectSlug'))
    ?? normalizeNonEmpty(url.searchParams.get('project'))
    ?? normalizeNonEmpty(base.projectSlug)
  const projectId = normalizeNonEmpty(body.projectId)
    ?? normalizeNonEmpty(url.searchParams.get('projectId'))
    ?? normalizeNonEmpty(base.projectId)
  const scopeId = normalizeNonEmpty(body.scopeId)
    ?? normalizeNonEmpty(url.searchParams.get('scopeId'))
    ?? normalizeNonEmpty(base.scopeId)
  return {
    ...base,
    json: true,
    allProjects: boolFromBody(body.allProjects, boolFromBody(url.searchParams.get('allProjects'))),
    projectSlug,
    projectId: projectSlug ? undefined : projectId,
    scopeId: projectSlug ? undefined : scopeId,
    board: [...queryList(url, 'board'), ...toStringArray(body.board)],
    task: [...queryList(url, 'task'), ...toStringArray(body.task)],
    sprint: [...queryList(url, 'sprint'), ...toStringArray(body.sprint)],
    issue: [...queryList(url, 'issue'), ...toStringArray(body.issue)],
    feedback: [...queryList(url, 'feedback'), ...toStringArray(body.feedback)],
    reviewRequest: [...queryList(url, 'reviewRequest'), ...queryList(url, 'review-request'), ...toStringArray(body.reviewRequest)],
    record: [...queryList(url, 'record'), ...toStringArray(body.record)],
  }
}

function sidecarHealthPayload(
  options: SyncSidecarOptions,
  port: number,
  host: string,
  runtime: SidecarRuntimeContext,
): Record<string, unknown> {
  return {
    contractVersion: SIDECAR_CONTRACT_VERSION,
    surface: 'aops-cockpit-local-sidecar',
    status: 'ready',
    host,
    port,
    repoRoot: runtime.repoRoot,
    projectSlug: runtime.projectSlug ?? normalizeNonEmpty(options.projectSlug),
    projectId: runtime.projectId ?? normalizeNonEmpty(options.projectId),
    scopeId: runtime.scopeId ?? normalizeNonEmpty(options.scopeId),
    capabilities: {
      syncStatus: true,
      syncDiff: true,
      readOnly: true,
      localRepoRequired: true,
      runsOnClientMachine: true,
    },
    endpoints: {
      health: '/api/aops-cockpit-sidecar/health',
      syncStatus: '/api/aops-cockpit-sidecar/sync/status',
      syncDiff: '/api/aops-cockpit-sidecar/sync/diff',
    },
  }
}

async function handleSidecarRequest(
  req: IncomingMessage,
  res: ServerResponse,
  options: SyncSidecarOptions,
  params: { host: string; port: number; origins: Set<string>; runtime: SidecarRuntimeContext },
): Promise<void> {
  const corsOrigin = resolveCorsOrigin(req.headers.origin, params.origins)
  if (req.method === 'OPTIONS') {
    writeSidecarOptions(res, corsOrigin)
    return
  }
  if (req.headers.origin && !corsOrigin) {
    writeSidecarJson(res, 403, { ok: false, error: { code: 'origin_not_allowed' } }, null)
    return
  }
  if (!sidecarAuthOk(req, options.token)) {
    writeSidecarJson(res, 401, { ok: false, error: { code: 'sidecar_auth_required' } }, corsOrigin)
    return
  }

  const url = new URL(req.url ?? '/', `http://${params.host}:${params.port}`)
    const route = sidecarPath(url)
  try {
    if (req.method === 'GET' && (route === '/' || route === '/health')) {
      writeSidecarJson(res, 200, { ok: true, data: sidecarHealthPayload(options, params.port, params.host, params.runtime) }, corsOrigin)
      return
    }
    if (req.method === 'GET' && route === '/sync/status') {
      const syncOptions = buildSidecarSyncOptions(options, url)
      const context = await resolveProjectBindingContext(syncOptions, { requireProject: true })
      const data = await collectSyncStatusData(context, syncOptions)
      writeSidecarJson(res, 200, {
        ok: true,
        command: 'sync.sidecar.status',
        surface: 'aops-cockpit-local-sidecar',
        resolvedContext: context,
        data,
      }, corsOrigin)
      return
    }
    if (req.method === 'GET' && route === '/sync/diff') {
      const syncOptions = buildSidecarSyncOptions(options, url)
      const context = await resolveProjectBindingContext(syncOptions, { requireProject: true })
      const data = await collectSyncDiffData(context, syncOptions)
      writeSidecarJson(res, 200, {
        ok: true,
        command: 'sync.sidecar.diff',
        surface: 'aops-cockpit-local-sidecar',
        resolvedContext: context,
        data,
      }, corsOrigin)
      return
    }
    if (req.method === 'POST' && route === '/sync/push') {
      writeSidecarJson(res, 410, {
        ok: false,
        error: {
          code: 'sync_push_removed',
          message: 'sync push removed: the server is the source of truth. The sidecar exposes read-only status/diff only.',
        },
      }, corsOrigin)
      return
    }
    writeSidecarJson(res, 404, { ok: false, error: { code: 'not_found' } }, corsOrigin)
  } catch (error) {
    writeSidecarJson(res, 500, {
      ok: false,
      error: {
        code: 'sidecar_request_failed',
        message: error instanceof Error ? error.message : String(error),
      },
    }, corsOrigin)
  }
}

async function runSyncSidecar(options: SyncSidecarOptions): Promise<void> {
  try {
    const runtime = await resolveSidecarRuntimeContext(options)
    const host = normalizeNonEmpty(options.host) ?? DEFAULT_SIDECAR_HOST
    const port = parsePort(options.port)
    const origins = parseSidecarOrigins(options)
    if (!normalizeNonEmpty(options.token) && !normalizeNonEmpty(process.env.AOPS_COCKPIT_SIDECAR_TOKEN)) {
      const hasRemoteOrigin = [...origins].some((origin) => {
        if (origin === '*') return true
        try {
          const hostname = new URL(origin).hostname
          return hostname !== 'localhost' && hostname !== '127.0.0.1' && hostname !== '[::1]' && hostname !== '::1'
        } catch {
          return true
        }
      })
      if (hasRemoteOrigin) {
        logWarn('Remote --allow-origin is configured without --token / AOPS_COCKPIT_SIDECAR_TOKEN. Prefer a bearer token for remote cockpit origins.')
      }
    }

    const server = http.createServer((req, res) => {
      void handleSidecarRequest(req, res, options, { host, port, origins, runtime })
    })
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen(port, host, () => resolve())
    })

    const ready = {
      command: 'sync.sidecar',
      surface: 'aops-cockpit-local-sidecar',
      result: {
        ok: true,
        data: sidecarHealthPayload(options, port, host, runtime),
      },
    }
    if (options.json) console.log(JSON.stringify(ready, null, 2))
    else logSuccess(`AOPS cockpit local sidecar listening at http://${host}:${port}`)
  } catch (error) {
    logError(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}

async function runSyncResolve(options: SyncOptions): Promise<void> {
  try {
    const filePathInput = normalizeNonEmpty(options.path)
    const prefer = normalizeNonEmpty(options.prefer)
    if (!filePathInput) throw new Error('sync resolve requires --path.')
    if (prefer === 'local') throw new Error('sync resolve --prefer local was removed with sync push: the server is the source of truth. Use --prefer remote to adopt the hosted/cache version (the read-only local cache is never pushed back).')
    if (prefer !== 'remote') throw new Error('sync resolve requires --prefer remote (the only supported resolution is adopting the hosted/cache version).')
    const context = await resolveProjectBindingContext(options, { requireProject: true })
    const filePath = path.isAbsolute(filePathInput) ? filePathInput : path.join(context.repoRoot, filePathInput)
    const raw = await fs.readFile(filePath, 'utf8')
    const parsed = parseFrontmatterDocument(raw)
    if (prefer === 'remote') {
      const remoteId = normalizeNonEmpty(parsed.frontmatter.remoteId)
      const entityType = normalizeNonEmpty(parsed.frontmatter.entityType)
      if (!remoteId) throw new Error('Remote conflict adoption requires remoteId in the source file.')
      const readToolId = getReadToolForEntity(entityType)
      if (!readToolId) throw new Error(`Remote conflict adoption is not supported for entity type "${entityType ?? 'unknown'}".`)
      const apiState = await requireApiState(options)
      if (!apiState) return
      const projectId = normalizeNonEmpty(context.projectId)
      const scopeId = normalizeNonEmpty(context.scopeId) ?? projectId
      const remotePayload = await invokeRead(apiState, options, readToolId, { id: remoteId })
      const remoteData = extractResultData(remotePayload) ?? remotePayload
      if (!isRecord(remoteData)) throw new Error('Remote read did not return a record payload.')
      const remote = { ...remoteData, id: normalizeNonEmpty(remoteData.id) ?? remoteId }
      let resolvedPath: string
      const pmConfig = projectmanSeedConfig(context, entityType)
      if (pmConfig) {
        resolvedPath = await writeProjectmanSeedFile({
          repoRoot: context.repoRoot,
          dir: pmConfig.dir,
          entityType: entityType ?? 'projectman.entity',
          remote,
          projectId,
          scopeId,
          titleKey: pmConfig.titleKey,
          force: true,
        })
      } else if (entityType === 'agentspace.experience-item') {
        const agPaths = resolveRepoFirstAgentspacePaths(context)
        resolvedPath = await writeExperienceSeedFile({
          repoRoot: context.repoRoot,
          dir: agPaths.experienceItems,
          remote,
          projectId,
          scopeId,
          force: true,
        })
      } else if (entityType === 'agentspace.memory-item') {
        const agPaths = resolveRepoFirstAgentspacePaths(context)
        resolvedPath = await writeMemorySeedFile({
          repoRoot: context.repoRoot,
          dir: agPaths.memoryItems,
          remote,
          projectId,
          scopeId,
          force: true,
        })
      } else {
        throw new Error(`Remote conflict adoption is not supported for entity type "${entityType ?? 'unknown'}".`)
      }
      emit(options, {
        command: 'sync.resolve',
        surface: 'hosted-cache-sync',
        resolvedContext: context,
        result: { ok: true, data: { path: resolvedPath, prefer, syncState: 'synced', remoteId } },
      }, 'Local cache conflict resolved from remote.')
      return
    }
  } catch (error) {
    logError(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}

async function runSyncRebuildViews(options: SyncOptions): Promise<void> {
  try {
    const context = await resolveProjectBindingContext(options, { requireProject: true })
    await rebuildProjectmanViews(context)
    const experiencePaths = resolveRepoFirstAgentspacePaths(context)
    const experienceItems = await readExperienceItems(experiencePaths.experienceItems)
    await rebuildExperienceWorkspace(context, experienceItems)
    const memoryPaths = resolveMemoryWorkspacePaths(context)
    const memoryItems = await readLocalMemoryEntries(memoryPaths.localItemsDir)
    await rebuildLocalMemoryWorkspace({
      ...context,
      items: memoryItems,
    })
    await rebuildHostedWorkspace(context.repoRoot)
    emit(options, {
      command: 'sync.rebuild-views',
      surface: 'hosted-cache-sync',
      resolvedContext: context,
      result: {
        ok: true,
        data: {
          views: [
            '.aops/projectman/views/index.md',
            '.aops/agentspace/experience/index.md',
            '.aops/agentspace/memory/index.md',
            '.aops/hosted/index.md',
          ],
        },
      },
    }, 'Local cache views rebuilt.')
  } catch (error) {
    logError(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}

function applySyncOptions<T extends Command>(cmd: T): T {
  applyCommonOptions(cmd, { withProject: false })
  cmd.option('--project-id <id>', 'Project id used to resolve owner context')
  cmd.option('--project-name <name>', 'Project name override for repo-aware context resolution')
  cmd.option('--project-slug <slug>', 'Project slug override for repo-aware context resolution')
  cmd.option('--scope-id <id>', 'Canonical owner scope override')
  cmd.option('--tenant-id <id>', 'Tenant id header for hosted sync calls')
  cmd.option('--locale <locale>', 'Locale header for hosted sync calls')
  cmd.option('--fallback-locale <locale>', 'Fallback locale header for hosted sync calls')
  return cmd
}

function applySyncSelectionOptions<T extends Command>(cmd: T): T {
  cmd.option('--board <value>', 'Limit sync scope to a board and its related task/sprint/issue/feedback/review-request records', collectRepeatedOption, [])
  cmd.option('--task <value>', 'Limit sync scope to a kanban task and its related sprint/issue/feedback/review-request records', collectRepeatedOption, [])
  cmd.option('--sprint <value>', 'Limit sync scope to a sprint and its related microtasks/signals', collectRepeatedOption, [])
  cmd.option('--issue <value>', 'Limit sync scope to a Projectman issue', collectRepeatedOption, [])
  cmd.option('--feedback <value>', 'Limit sync scope to a Projectman feedback item', collectRepeatedOption, [])
  cmd.option('--review-request <value>', 'Limit sync scope to a Projectman review request', collectRepeatedOption, [])
  cmd.option('--record <value>', 'Limit sync scope to an exact local path, local id, remote id, slug, name, or title', collectRepeatedOption, [])
  return cmd
}

function applyAllProjectsOption<T extends Command>(cmd: T): T {
  cmd.option('--all-projects', 'Run the sync command once per repo-config project and report project-level results without fail-fast')
  return cmd
}

export function makeSyncCommand(): Command {
  const cmd = new Command('sync').description('Server-first sync commands: refresh the read-only local cache of Projectman/Agentspace state plus hosted prompt/skill mirrors')

  applySyncSelectionOptions(applyAllProjectsOption(applySyncOptions(cmd.command('status')
    .description('Show local cache sync state')
    .action(async (options: SyncOptions) => runSyncStatus(options)))))

  applySyncSelectionOptions(applyAllProjectsOption(applySyncOptions(cmd.command('diff')
    .description('Show local records that are not synced')
    .action(async (options: SyncOptions) => runSyncDiff(options)))))

  applyAllProjectsOption(applySyncOptions(cmd.command('pull')
    .description('Pull hosted Projectman/Agentspace state into the read-only local cache and refresh read-only prompt/skill mirrors')
    .option('--apply', 'Write pulled records into the local cache workspace')
    .option('--hosted-project-id <id>', 'Also mirror hosted read-only prompts/skills for another project id', collectRepeatedOption, [])
    .option('--hosted-project-name <name>', 'Also mirror hosted read-only prompts/skills for another project name', collectRepeatedOption, [])
    .option('--hosted-project-slug <slug>', 'Also mirror hosted read-only prompts/skills for another project slug', collectRepeatedOption, [])
    .action(async (options: SyncOptions) => runSyncPullOrBootstrap(options, 'sync.pull'))))

  applyAllProjectsOption(applySyncOptions(cmd.command('bootstrap')
    .description('Seed the read-only local cache from hosted server state and refresh read-only prompt/skill mirrors')
    .option('--from-server', 'Bootstrap from hosted AOPS server state')
    .option('--apply', 'Write bootstrapped records into the local cache workspace')
    .option('--hosted-project-id <id>', 'Also mirror hosted read-only prompts/skills for another project id', collectRepeatedOption, [])
    .option('--hosted-project-name <name>', 'Also mirror hosted read-only prompts/skills for another project name', collectRepeatedOption, [])
    .option('--hosted-project-slug <slug>', 'Also mirror hosted read-only prompts/skills for another project slug', collectRepeatedOption, [])
    .action(async (options: SyncOptions) => runSyncPullOrBootstrap(options, 'sync.bootstrap'))))

  applySyncSelectionOptions(applySyncOptions(cmd.command('sidecar')
    .description('Run a localhost-bound cockpit sidecar that exposes read-only local cache status/diff on the client machine')
    .option('--host <host>', 'Bind host for the sidecar HTTP server', DEFAULT_SIDECAR_HOST)
    .option('--port <port>', 'Bind port for the sidecar HTTP server', String(DEFAULT_SIDECAR_PORT))
    .option('--allow-origin <origin>', 'Allowed cockpit browser origin; repeat for remote cockpit origins', collectRepeatedOption, [])
    .option('--token <token>', 'Optional bearer token required by cockpit sidecar requests')
    .action(async (options: SyncSidecarOptions) => runSyncSidecar(options))))

  applySyncOptions(cmd.command('resolve')
    .description('Resolve a local cache conflict by adopting the hosted/cache version (--prefer remote)')
    .requiredOption('--path <path>', 'Repo-relative or absolute source markdown path')
    .requiredOption('--prefer <mode>', 'Conflict resolution: remote (adopt the hosted/cache version; only supported mode since sync push was removed)')
    .action(async (options: SyncOptions) => runSyncResolve(options)))

  applySyncOptions(cmd.command('rebuild-views')
    .description('Rebuild derived local cache markdown views and hosted read-only indexes')
    .action(async (options: SyncOptions) => runSyncRebuildViews(options)))

  cmd.addHelpText('after', buildOperatorCookbook({
    examples: [
      'aops-cli sync status --json',
      'aops-cli sync diff --json',
      'aops-cli sync status --all-projects --json',
      'aops-cli sync status --board engineering --json',
      'aops-cli sync diff --board engineering --json',
      'aops-cli sync bootstrap --from-server --apply --json',
      'aops-cli sync pull --apply --json',
      'aops-cli sync pull --all-projects --apply --json',
      'aops-cli sync pull --apply --hosted-project-slug aops --json',
      'aops-cli sync resolve --path .aops/projectman/sprints/demo.md --prefer remote --json',
    ],
    guide: GUIDE_PATHS.operator,
    notes: [
      'Server-first: hosted server state is the single source of truth. `.aops/**` source files are a read-only local cache refreshed by `sync pull`/`sync bootstrap`; there is no `sync push` (write to hosted state with the hosted CLI/domain ops).',
      'Hosted reusable prompts/skills stay single-source on the server; sync pull/bootstrap only mirror them into `.aops/hosted/**` as read-only local context.',
      'Hosted Docman documents and guide mirrors use `aops-cli doc mirror pull --out-dir ./.aops/docman`; `sync pull` does not refresh `.aops/docman/**`.',
      '`sync status` and `sync diff` accept repeatable selective scope flags: --board, --task, --sprint, --issue, --feedback, --review-request, and --record.',
      'Board/task/sprint selection expands to related Projectman records and linked Agentspace memory/experience context. `--record` matches local path, localId, remoteId, slug, name, or title.',
      '`--all-projects` runs status/diff/pull/bootstrap once per repo-config project (server-first; no authoring-mode split), skips only projects without a localRoot in a multi-project repo, and reports project-level errors without fail-fast.',
      '`sync pull` and `sync bootstrap` are project-level merge/mirror commands; use --hosted-project-* there only to refresh hosted prompt/skill mirrors.',
      'Hosted writes are the source of truth, so the local cache never replays back. If a cache file drifts, re-run `sync pull` to refresh it from the server; `sync resolve --prefer remote` re-adopts a single record from hosted state.',
      'Browser/cockpit surfaces must never assume the remote aops-server machine has the repo. Use `aops-cli sync sidecar --allow-origin <cockpit-origin>` on the client machine to expose a localhost-only read-only status/diff bridge.',
      '`localId` is UUIDv4. `remoteId` is filled after hosted sync/bootstrap.',
      '.aops/sync/state.json is local machine sync state and is ignored by git.',
    ],
  }))

  return cmd
}
