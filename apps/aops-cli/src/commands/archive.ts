import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'

import { logError, logSuccess } from '@aopslab/xf-cli-ui'
import { Command } from 'commander'

import {
  invokeHostedToolWithApiState,
  requireApiState,
  unwrapHostedToolResult,
  type AgentGatewayContextOptions,
} from '../utils/agent-gateway.js'
import { applyCommonOptions, compactPayload, normalizeNonEmpty } from '../utils/command.js'
import {
  resolveOwnerScopeIdFromProjectRecord,
  resolveProjectBindingContext,
  type ResolvedProjectBindingContext,
} from '../utils/project-context.js'
import { writeFileWithRetry } from '../utils/transient-fs.js'
import type { CliApiClientState } from '../utils/api.js'

type ArchiveOptions = AgentGatewayContextOptions & {
  apply?: boolean
  confirm?: boolean
  preview?: boolean
  projectSlug?: string
  outputRoot?: string
  timestamp?: string
  manifest?: string
  json?: boolean
}

type ArchiveTarget = {
  apiState: CliApiClientState
  resolvedContext: ResolvedProjectBindingContext
  gatewayOptions: AgentGatewayContextOptions
  project: Record<string, unknown>
}

type ArchiveEntitySet = Record<string, Record<string, unknown>[]>

type ArchiveEntityFile = {
  key: string
  entityType: string
  file: string
  count: number
  checksum: string
  records: Array<Record<string, unknown>>
}

type ArchiveDeleteAction = {
  key: string
  entityType: string
  toolId: string
  id: string
  input: Record<string, unknown>
  sourceFile: string
}

const ARCHIVE_ENTITY_TYPE = 'aops.archive.pm-graph'
const ARCHIVE_KIND = 'projectman.pm-graph'
const DEFAULT_PENDING_DOMAINS = [
  'agentspace.memory',
  'agentspace.discussions',
  'agentspace.chat',
  'hosted.prompts-skills-resources-artifacts',
]

const ARCHIVE_ENTITY_DEFS: Array<{ key: string; entityType: string; file: string }> = [
  { key: 'boards', entityType: 'projectman.board', file: 'entities/boards.json' },
  { key: 'boardColumns', entityType: 'projectman.board-column', file: 'entities/board-columns.json' },
  { key: 'tasks', entityType: 'projectman.kanban-task', file: 'entities/kanban-tasks.json' },
  { key: 'sprints', entityType: 'projectman.sprint', file: 'entities/sprints.json' },
  { key: 'utasks', entityType: 'projectman.microtask', file: 'entities/microtasks.json' },
  { key: 'issues', entityType: 'projectman.issue', file: 'entities/issues.json' },
  { key: 'feedback', entityType: 'projectman.feedback', file: 'entities/feedback.json' },
  { key: 'reviewRequests', entityType: 'projectman.review-request', file: 'entities/review-requests.json' },
]

const DELETE_ORDER: Array<{ key: string; toolId: string }> = [
  { key: 'reviewRequests', toolId: 'projectman.review-request.delete' },
  { key: 'feedback', toolId: 'projectman.feedback.delete' },
  { key: 'issues', toolId: 'projectman.issue.delete' },
  { key: 'utasks', toolId: 'projectman.sprint.delete-microtask' },
  { key: 'sprints', toolId: 'projectman.sprint.delete' },
  { key: 'tasks', toolId: 'projectman.kanban-task.delete' },
  { key: 'boardColumns', toolId: 'projectman.kanban-board-column.delete' },
  { key: 'columns', toolId: 'projectman.kanban-column.delete' },
  { key: 'boards', toolId: 'projectman.kanban-board.delete' },
]

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

function extractResultData(value: unknown): unknown {
  if (!isRecord(value)) return value
  if (Object.prototype.hasOwnProperty.call(value, 'data')) return value.data
  if (Object.prototype.hasOwnProperty.call(value, 'response')) return extractResultData(value.response)
  if (Object.prototype.hasOwnProperty.call(value, 'result')) return extractResultData(value.result)
  return value
}

function numberField(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue)
  if (!isRecord(value)) return value
  return Object.keys(value)
    .sort()
    .reduce<Record<string, unknown>>((acc, key) => {
      acc[key] = sortValue(value[key])
      return acc
    }, {})
}

function canonicalJson(value: unknown): string {
  return `${JSON.stringify(sortValue(value), null, 2)}\n`
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function recordId(record: Record<string, unknown>): string {
  return (
    normalizeNonEmpty(record.id) ??
    normalizeNonEmpty(record.remoteId) ??
    normalizeNonEmpty(record.localId) ??
    normalizeNonEmpty(record.slug) ??
    normalizeNonEmpty(record.name) ??
    normalizeNonEmpty(record.title) ??
    ''
  )
}

function sortRecords(records: Record<string, unknown>[]): Record<string, unknown>[] {
  return [...records].sort((left, right) => recordId(left).localeCompare(recordId(right)))
}

function safeTimestamp(value?: string): string {
  const raw = normalizeNonEmpty(value) ?? new Date().toISOString()
  return raw.replace(/[^0-9A-Za-z_-]+/g, '-').replace(/^-+|-+$/g, '') || 'archive'
}

function resolveRepoRelativePath(repoRoot: string, maybePath: string): string {
  return path.isAbsolute(maybePath) ? maybePath : path.resolve(repoRoot, maybePath)
}

function archiveRoot(repoRoot: string, outputRoot?: string): string {
  return resolveRepoRelativePath(repoRoot, normalizeNonEmpty(outputRoot) ?? path.join('.aops', 'archive'))
}

function buildGatewayOptions(options: AgentGatewayContextOptions, context: ResolvedProjectBindingContext): AgentGatewayContextOptions {
  return {
    ...options,
    scopeId: context.scopeId,
    projectId: context.projectId,
    projectName: context.projectName,
  }
}

function isDeletedProject(project: Record<string, unknown>): boolean {
  const status = normalizeNonEmpty(project.status)?.toLowerCase()
  return status === 'deleted' || status === 'removed'
}

async function resolveArchiveTarget(options: ArchiveOptions, fallback?: { projectSlug?: string; projectId?: string }): Promise<ArchiveTarget | null> {
  const resolvedContext = await resolveProjectBindingContext({
    ...options,
    projectSlug: normalizeNonEmpty(options.projectSlug) ?? normalizeNonEmpty(fallback?.projectSlug),
    projectId: normalizeNonEmpty(options.projectId) ?? normalizeNonEmpty(fallback?.projectId),
  }, { requireProject: true })
  const apiState = await requireApiState(options)
  if (!apiState) return null

  const projectId = normalizeNonEmpty(resolvedContext.projectId)
  if (!projectId) throw new Error('Archive target projectId could not be resolved.')
  const projectPayload = await invokeHostedToolWithApiState(apiState, {
    ...buildGatewayOptions(options, resolvedContext),
    toolId: 'agentspace.project.get-by-id',
    input: { id: projectId },
  })
  const project = extractResultData(unwrapHostedToolResult(projectPayload))
  if (!isRecord(project)) {
    throw new Error(`Archive target project "${resolvedContext.projectSlug ?? projectId}" was not found.`)
  }
  if (isDeletedProject(project)) {
    throw new Error(`Archive target project "${resolvedContext.projectSlug ?? projectId}" is deleted/removed; refusing to archive.`)
  }

  const hydratedContext: ResolvedProjectBindingContext = {
    ...resolvedContext,
    scopeId: resolveOwnerScopeIdFromProjectRecord(project, resolvedContext.scopeId),
    projectName: normalizeNonEmpty(project.name) ?? resolvedContext.projectName,
    projectSlug: normalizeNonEmpty(project.slug) ?? resolvedContext.projectSlug,
  }

  return {
    apiState,
    resolvedContext: hydratedContext,
    gatewayOptions: buildGatewayOptions(options, hydratedContext),
    project,
  }
}

async function invokeRead(
  target: ArchiveTarget,
  toolId: string,
  input: Record<string, unknown>,
): Promise<unknown> {
  const payload = await invokeHostedToolWithApiState(target.apiState, {
    ...target.gatewayOptions,
    toolId,
    input,
    preview: false,
    apply: false,
    confirm: false,
  })
  return extractResultData(unwrapHostedToolResult(payload))
}

async function listRead(target: ArchiveTarget, toolId: string, input: Record<string, unknown>): Promise<Record<string, unknown>[]> {
  return toRecordArray(await invokeRead(target, toolId, input))
}

async function readBoardColumns(target: ArchiveTarget, board: Record<string, unknown>): Promise<Record<string, unknown>[]> {
  const boardId = normalizeNonEmpty(board.id) ?? normalizeNonEmpty(board.remoteId)
  if (!boardId) return []
  const rows = await listRead(target, 'projectman.kanban-board-column.list', { board: boardId })
  const sorted = [...rows].sort((left, right) => (numberField(left.position) ?? 0) - (numberField(right.position) ?? 0))
  const result: Record<string, unknown>[] = []
  for (const row of sorted) {
    const boardColumnId = normalizeNonEmpty(row.id) ?? normalizeNonEmpty(row.boardColumnId)
    const columnId = normalizeNonEmpty(row.columnId) ?? normalizeNonEmpty(row.column)
    let column: Record<string, unknown> = {}
    if (columnId) {
      try {
        const columnPayload = await invokeRead(target, 'projectman.kanban-column.get', { id: columnId })
        column = isRecord(columnPayload) ? columnPayload : {}
      } catch {
        column = {}
      }
    }
    result.push(compactPayload({
      ...row,
      boardId,
      board: boardId,
      boardColumnId,
      columnId,
      column,
      archiveParentRefs: compactPayload({ boardId, columnId }),
    }))
  }
  return result
}

function flattenSprintMicrotasks(sprints: Record<string, unknown>[]): Record<string, unknown>[] {
  const microtasks: Record<string, unknown>[] = []
  for (const sprint of sprints) {
    const sprintId = normalizeNonEmpty(sprint.id) ?? normalizeNonEmpty(sprint.remoteId)
    const sprintName = normalizeNonEmpty(sprint.name)
    const phases = toRecordArray(sprint.phases)
    for (const phase of phases) {
      const phaseId = normalizeNonEmpty(phase.id)
      const phaseName = normalizeNonEmpty(phase.name)
      for (const microtask of toRecordArray(phase.microtasks)) {
        microtasks.push(compactPayload({
          ...microtask,
          sprintId,
          sprintName,
          phaseId,
          phaseName,
          archiveParentRefs: compactPayload({ sprintId, phaseId }),
        }))
      }
    }
    for (const microtask of toRecordArray(sprint.microtasks)) {
      microtasks.push(compactPayload({
        ...microtask,
        sprintId,
        sprintName,
        archiveParentRefs: compactPayload({ sprintId }),
      }))
    }
  }
  return sortRecords(microtasks)
}

async function readPmGraph(target: ArchiveTarget): Promise<ArchiveEntitySet> {
  const scopeId = normalizeNonEmpty(target.resolvedContext.scopeId) ?? normalizeNonEmpty(target.resolvedContext.projectId)
  const projectId = normalizeNonEmpty(target.resolvedContext.projectId)
  if (!scopeId || !projectId) throw new Error('Archive target scopeId/projectId could not be resolved.')
  const ownerInput = compactPayload({ scopeId, project: projectId })
  const scopeInput = compactPayload({ scopeId })

  const [boards, tasks, sprints, issues, feedback, reviewRequests] = await Promise.all([
    listRead(target, 'projectman.kanban-board.list', ownerInput),
    listRead(target, 'projectman.kanban-task.list', ownerInput),
    listRead(target, 'projectman.sprint.list', ownerInput),
    listRead(target, 'projectman.issue.list', scopeInput),
    listRead(target, 'projectman.feedback.list', scopeInput),
    listRead(target, 'projectman.review-request.list', scopeInput),
  ])

  const boardColumns: Record<string, unknown>[] = []
  for (const board of boards) {
    boardColumns.push(...await readBoardColumns(target, board))
  }

  return {
    boards: sortRecords(boards),
    boardColumns: sortRecords(boardColumns),
    tasks: sortRecords(tasks),
    sprints: sortRecords(sprints),
    utasks: flattenSprintMicrotasks(sprints),
    issues: sortRecords(issues),
    feedback: sortRecords(feedback),
    reviewRequests: sortRecords(reviewRequests),
  }
}

function buildEntityFiles(entitySet: ArchiveEntitySet): ArchiveEntityFile[] {
  return ARCHIVE_ENTITY_DEFS.map((definition) => {
    const records = sortRecords(entitySet[definition.key] ?? [])
    const checksum = sha256(canonicalJson(records))
    return {
      ...definition,
      count: records.length,
      checksum,
      records: records.map((record) => compactPayload({
        remoteId: recordId(record),
        baseHash: sha256(canonicalJson(record)),
        parentRefs: isRecord(record.archiveParentRefs) ? record.archiveParentRefs : undefined,
      })),
    }
  })
}

function buildCounts(entityFiles: ArchiveEntityFile[]): Record<string, number> {
  return entityFiles.reduce<Record<string, number>>((acc, file) => {
    acc[file.key] = file.count
    return acc
  }, {})
}

function buildBundleChecksum(entityFiles: ArchiveEntityFile[]): string {
  return sha256(canonicalJson(entityFiles.map((file) => ({
    key: file.key,
    entityType: file.entityType,
    count: file.count,
    checksum: file.checksum,
  }))))
}

function buildManifest(params: {
  target: ArchiveTarget
  entityFiles: ArchiveEntityFile[]
  archiveDir: string
  createdAt: string
}): Record<string, unknown> {
  const projectId = normalizeNonEmpty(params.target.resolvedContext.projectId)
  const scopeId = normalizeNonEmpty(params.target.resolvedContext.scopeId) ?? projectId
  const projectSlug = normalizeNonEmpty(params.target.resolvedContext.projectSlug) ?? normalizeNonEmpty(params.target.project.slug)
  const entityFiles = params.entityFiles.map(({ records: _records, ...file }) => file)
  const bundleChecksum = buildBundleChecksum(params.entityFiles)
  return {
    schemaVersion: 2,
    entityType: ARCHIVE_ENTITY_TYPE,
    archiveKind: ARCHIVE_KIND,
    archiveVersion: 1,
    partial: true,
    decommissionSafe: false,
    pendingDomains: DEFAULT_PENDING_DOMAINS,
    createdAt: params.createdAt,
    project: compactPayload({
      id: projectId,
      projectId,
      scopeId,
      slug: projectSlug,
      name: normalizeNonEmpty(params.target.resolvedContext.projectName) ?? normalizeNonEmpty(params.target.project.name),
      status: normalizeNonEmpty(params.target.project.status),
    }),
    source: compactPayload({
      command: 'archive.create',
      archiveDir: path.relative(params.target.resolvedContext.repoRoot, params.archiveDir).split(path.sep).join('/'),
      apiBaseUrl: normalizeNonEmpty(String((params.target.apiState as { baseUrl?: unknown }).baseUrl ?? '')),
    }),
    counts: buildCounts(params.entityFiles),
    files: entityFiles,
    checksums: {
      bundle: bundleChecksum,
      entities: entityFiles.reduce<Record<string, string>>((acc, file) => {
        acc[file.key] = file.checksum
        return acc
      }, {}),
    },
    verification: {
      status: 'pending',
    },
  }
}

async function writeArchiveBundle(params: {
  archiveDir: string
  manifest: Record<string, unknown>
  entitySet: ArchiveEntitySet
}): Promise<string[]> {
  const written: string[] = []
  for (const definition of ARCHIVE_ENTITY_DEFS) {
    const filePath = path.join(params.archiveDir, definition.file)
    await fs.mkdir(path.dirname(filePath), { recursive: true })
    await writeFileWithRetry(filePath, canonicalJson(sortRecords(params.entitySet[definition.key] ?? [])), 'utf8')
    written.push(filePath)
  }
  const manifestPath = path.join(params.archiveDir, 'manifest.json')
  await writeFileWithRetry(manifestPath, canonicalJson(params.manifest), 'utf8')
  written.push(manifestPath)
  return written
}

function emit(options: Pick<ArchiveOptions, 'json'>, envelope: Record<string, unknown>, message: string): void {
  if (options.json) {
    console.log(JSON.stringify(envelope, null, 2))
    return
  }
  logSuccess(message)
  console.log(JSON.stringify(envelope.result ?? envelope, null, 2))
}

function assertArchiveManifest(manifest: Record<string, unknown>): void {
  if (normalizeNonEmpty(manifest.entityType) !== ARCHIVE_ENTITY_TYPE) {
    throw new Error(`Manifest is not an AOPS PM archive bundle: expected entityType ${ARCHIVE_ENTITY_TYPE}.`)
  }
  if (normalizeNonEmpty(manifest.archiveKind) !== ARCHIVE_KIND) {
    throw new Error(`Unsupported archiveKind "${normalizeNonEmpty(manifest.archiveKind) ?? '(missing)'}".`)
  }
}

async function readArchiveManifest(manifestPath: string): Promise<Record<string, unknown>> {
  const raw = await fs.readFile(manifestPath, 'utf8')
  const manifest = JSON.parse(raw)
  if (!isRecord(manifest)) throw new Error('Archive manifest root must be an object.')
  assertArchiveManifest(manifest)
  return manifest
}

async function verifyLocalBundleFiles(manifestPath: string, manifest: Record<string, unknown>): Promise<ArchiveEntityFile[]> {
  const manifestDir = path.dirname(manifestPath)
  const files = toRecordArray(manifest.files)
  if (files.length === 0) throw new Error('Archive manifest has no entity files.')
  const verified: ArchiveEntityFile[] = []
  for (const file of files) {
    const key = normalizeNonEmpty(file.key)
    const entityType = normalizeNonEmpty(file.entityType)
    const relativeFile = normalizeNonEmpty(file.file)
    const expectedChecksum = normalizeNonEmpty(file.checksum)
    if (!key || !entityType || !relativeFile || !expectedChecksum) {
      throw new Error('Archive manifest contains an incomplete file entry.')
    }
    const filePath = path.join(manifestDir, relativeFile)
    const raw = await fs.readFile(filePath, 'utf8')
    const actualChecksum = sha256(raw)
    if (actualChecksum !== expectedChecksum) {
      throw new Error(`Archive entity file checksum mismatch for ${relativeFile}.`)
    }
    const parsed = JSON.parse(raw)
    const records = toRecordArray(parsed)
    verified.push({
      key,
      entityType,
      file: relativeFile,
      count: records.length,
      checksum: actualChecksum,
      records: records.map((record) => compactPayload({
        ...record,
        remoteId: recordId(record),
        baseHash: sha256(canonicalJson(record)),
        parentRefs: isRecord(record.archiveParentRefs) ? record.archiveParentRefs : undefined,
      })),
    })
  }
  return verified
}

function projectFromManifest(manifest: Record<string, unknown>): { projectSlug?: string; projectId?: string } {
  const project = isRecord(manifest.project) ? manifest.project : {}
  return {
    projectSlug: normalizeNonEmpty(project.slug),
    projectId: normalizeNonEmpty(project.projectId) ?? normalizeNonEmpty(project.id),
  }
}

function assertVerificationMatches(localFiles: ArchiveEntityFile[], remoteFiles: ArchiveEntityFile[]): void {
  const localByKey = new Map(localFiles.map((file) => [file.key, file]))
  for (const remoteFile of remoteFiles) {
    const localFile = localByKey.get(remoteFile.key)
    if (!localFile) throw new Error(`Archive verification missing local file for ${remoteFile.key}.`)
    if (localFile.count !== remoteFile.count) {
      throw new Error(`Archive verification count mismatch for ${remoteFile.key}: local=${localFile.count}, hosted=${remoteFile.count}.`)
    }
    if (localFile.checksum !== remoteFile.checksum) {
      throw new Error(`Archive verification checksum mismatch for ${remoteFile.key}.`)
    }
  }
}

function assertManifestVerified(manifest: Record<string, unknown>): void {
  const verification = isRecord(manifest.verification) ? manifest.verification : {}
  if (normalizeNonEmpty(verification.status) !== 'passed') {
    throw new Error('Archive manifest verification must be passed before delete. Run archive verify --manifest <path> --apply first.')
  }
}

function actionKey(action: Pick<ArchiveDeleteAction, 'toolId' | 'id' | 'input'>): string {
  const sprintId = normalizeNonEmpty(action.input.id)
  const microTask = normalizeNonEmpty(action.input.microTask)
  if (action.toolId === 'projectman.sprint.delete-microtask' && sprintId && microTask) {
    return `${action.toolId}:${sprintId}:${microTask}`
  }
  return `${action.toolId}:${action.id}`
}

function archivedDeletionActions(manifest: Record<string, unknown>): Map<string, Record<string, unknown>> {
  const deletion = isRecord(manifest.deletion) ? manifest.deletion : {}
  const actions = toRecordArray(deletion.actions)
  const entries: Array<[string, Record<string, unknown>]> = []
  for (const action of actions) {
    const key = normalizeNonEmpty(action.key)
    if (key) entries.push([key, action])
  }
  return new Map(entries)
}

function mergeDeletionActions(
  plannedActions: ArchiveDeleteAction[],
  previous: Map<string, Record<string, unknown>>,
  overrides: Map<string, Record<string, unknown>> = new Map(),
): Record<string, unknown>[] {
  return plannedActions.map((action, index) => {
    const key = actionKey(action)
    const previousAction = previous.get(key) ?? {}
    const override = overrides.get(key) ?? {}
    return compactPayload({
      key,
      position: index,
      entityType: action.entityType,
      toolId: action.toolId,
      id: action.id,
      input: action.input,
      sourceFile: action.sourceFile,
      status: normalizeNonEmpty(override.status) ?? normalizeNonEmpty(previousAction.status) ?? 'pending',
      deletedAt: normalizeNonEmpty(override.deletedAt) ?? normalizeNonEmpty(previousAction.deletedAt),
      missingAt: normalizeNonEmpty(override.missingAt) ?? normalizeNonEmpty(previousAction.missingAt),
      error: normalizeNonEmpty(override.error) ?? normalizeNonEmpty(previousAction.error),
    })
  })
}

function readDeletionStatus(manifest: Record<string, unknown>, action: ArchiveDeleteAction): string | undefined {
  const previous = archivedDeletionActions(manifest).get(actionKey(action))
  return normalizeNonEmpty(previous?.status)
}

function buildDeletePlanFromFiles(localFiles: ArchiveEntityFile[]): ArchiveDeleteAction[] {
  const filesByKey = new Map(localFiles.map((file) => [file.key, file]))
  const actions: ArchiveDeleteAction[] = []
  const seenColumns = new Set<string>()

  for (const order of DELETE_ORDER) {
    if (order.key === 'columns') {
      const boardColumns = filesByKey.get('boardColumns')
      for (const record of boardColumns?.records ?? []) {
        const parentRefs = isRecord(record.parentRefs) ? record.parentRefs : {}
        const columnId = normalizeNonEmpty(record.columnId)
          ?? normalizeNonEmpty(record.column)
          ?? normalizeNonEmpty(parentRefs.columnId)
        if (!columnId || seenColumns.has(columnId)) continue
        seenColumns.add(columnId)
        actions.push({
          key: 'columns',
          entityType: 'projectman.kanban-column',
          toolId: order.toolId,
          id: columnId,
          input: { id: columnId },
          sourceFile: 'entities/board-columns.json',
        })
      }
      continue
    }

    const file = filesByKey.get(order.key)
    if (!file) continue
    for (const record of file.records) {
      const id = normalizeNonEmpty(record.remoteId)
      if (!id) {
        throw new Error(`Archive ${file.file} contains a record without remoteId; refusing to build delete plan.`)
      }
      if (order.toolId === 'projectman.sprint.delete-microtask') {
        const parentRefs = isRecord(record.parentRefs) ? record.parentRefs : {}
        const sprintId = normalizeNonEmpty(parentRefs.sprintId) ?? normalizeNonEmpty(record.sprintId)
        if (!sprintId) {
          throw new Error(`Archive ${file.file} microtask ${id} is missing sprintId parent reference.`)
        }
        actions.push({
          key: file.key,
          entityType: file.entityType,
          toolId: order.toolId,
          id,
          input: { id: sprintId, microTask: id },
          sourceFile: file.file,
        })
        continue
      }
      actions.push({
        key: file.key,
        entityType: file.entityType,
        toolId: order.toolId,
        id,
        input: { id },
        sourceFile: file.file,
      })
    }
  }

  return actions
}

function isMissingDeleteError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return /(^|[^0-9])404([^0-9]|$)|not[_ -]?found|record not found|missing/i.test(message)
}

async function invokeDelete(target: ArchiveTarget, action: ArchiveDeleteAction): Promise<void> {
  await invokeHostedToolWithApiState(target.apiState, {
    ...target.gatewayOptions,
    toolId: action.toolId,
    input: action.input,
    preview: false,
    apply: true,
    confirm: true,
  })
}

function buildDeletionManifest(
  manifest: Record<string, unknown>,
  plannedActions: ArchiveDeleteAction[],
  params: {
    status: string
    startedAt?: string
    completedAt?: string
    failedAt?: string
    lastError?: string
    overrides?: Map<string, Record<string, unknown>>
  },
): Record<string, unknown> {
  const previousDeletion = isRecord(manifest.deletion) ? manifest.deletion : {}
  const previousActions = archivedDeletionActions(manifest)
  const actions = mergeDeletionActions(plannedActions, previousActions, params.overrides)
  const completed = actions.filter((action) => ['deleted', 'missing'].includes(String(action.status))).length
  return {
    ...manifest,
    deletion: compactPayload({
      status: params.status,
      mode: 'hosted-pm-delete',
      startedAt: params.startedAt ?? normalizeNonEmpty(previousDeletion.startedAt),
      completedAt: params.completedAt,
      failedAt: params.failedAt,
      lastError: params.lastError,
      total: plannedActions.length,
      completed,
      pending: plannedActions.length - completed,
      order: DELETE_ORDER.map((entry) => entry.key),
      actions,
    }),
  }
}

function pendingDomainsFromManifest(manifest: Record<string, unknown>): string[] {
  const pendingDomains = manifest.pendingDomains
  return Array.isArray(pendingDomains)
    ? pendingDomains.map((entry) => normalizeNonEmpty(entry)).filter((entry): entry is string => Boolean(entry))
    : []
}

function decommissionSafeFromManifest(manifest: Record<string, unknown>): boolean {
  return manifest.decommissionSafe === true
}

export async function runArchiveCreate(options: ArchiveOptions): Promise<void> {
  try {
    if (options.apply !== true) throw new Error('archive create writes a local bundle. Retry with --apply.')
    const target = await resolveArchiveTarget(options)
    if (!target) return
    const projectSlug = normalizeNonEmpty(target.resolvedContext.projectSlug) ?? normalizeNonEmpty(target.project.slug) ?? normalizeNonEmpty(target.resolvedContext.projectId) ?? 'project'
    const archiveDir = path.join(archiveRoot(target.resolvedContext.repoRoot, options.outputRoot), projectSlug, safeTimestamp(options.timestamp))
    const createdAt = new Date().toISOString()
    const entitySet = await readPmGraph(target)
    const entityFiles = buildEntityFiles(entitySet)
    const manifest = buildManifest({ target, entityFiles, archiveDir, createdAt })
    const filesWritten = (await writeArchiveBundle({ archiveDir, manifest, entitySet }))
      .map((filePath) => path.relative(target.resolvedContext.repoRoot, filePath).split(path.sep).join('/'))

    emit(options, {
      command: 'archive.create',
      surface: 'aops-archive-v1',
      resolvedContext: target.resolvedContext,
      result: {
        ok: true,
        data: {
          archiveDir: path.relative(target.resolvedContext.repoRoot, archiveDir).split(path.sep).join('/'),
          manifestPath: path.relative(target.resolvedContext.repoRoot, path.join(archiveDir, 'manifest.json')).split(path.sep).join('/'),
          counts: manifest.counts,
          checksums: manifest.checksums,
          pendingDomains: DEFAULT_PENDING_DOMAINS,
          decommissionSafe: false,
          filesWritten,
        },
      },
    }, 'Archive bundle created.')
  } catch (error) {
    logError(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}

export async function runArchiveVerify(options: ArchiveOptions): Promise<void> {
  try {
    const manifestInput = normalizeNonEmpty(options.manifest)
    if (!manifestInput) throw new Error('Missing required --manifest.')
    const repoRoot = (await resolveProjectBindingContext(options, { requireProject: false })).repoRoot
    const manifestPath = resolveRepoRelativePath(repoRoot, manifestInput)
    const manifest = await readArchiveManifest(manifestPath)
    const manifestProject = projectFromManifest(manifest)
    if (options.projectSlug && manifestProject.projectSlug && options.projectSlug !== manifestProject.projectSlug) {
      throw new Error(`--project-slug ${options.projectSlug} does not match manifest project slug ${manifestProject.projectSlug}.`)
    }
    const target = await resolveArchiveTarget(options, manifestProject)
    if (!target) return

    const localFiles = await verifyLocalBundleFiles(manifestPath, manifest)
    const remoteEntitySet = await readPmGraph(target)
    const remoteFiles = buildEntityFiles(remoteEntitySet)
    assertVerificationMatches(localFiles, remoteFiles)
    const remoteBundleChecksum = buildBundleChecksum(remoteFiles)
    const manifestChecksums = isRecord(manifest.checksums) ? manifest.checksums : {}
    const localBundleChecksum = normalizeNonEmpty(manifestChecksums.bundle)
    if (localBundleChecksum && localBundleChecksum !== remoteBundleChecksum) {
      throw new Error('Archive verification bundle checksum mismatch.')
    }

    const verification = {
      status: 'passed',
      verifiedAt: new Date().toISOString(),
      mode: 'hosted-refetch',
      counts: buildCounts(remoteFiles),
      checksum: remoteBundleChecksum,
    }
    const nextManifest = {
      ...manifest,
      verification,
      verifiedAt: verification.verifiedAt,
    }
    if (options.apply === true) {
      await writeFileWithRetry(manifestPath, canonicalJson(nextManifest), 'utf8')
    }

    emit(options, {
      command: 'archive.verify',
      surface: 'aops-archive-v1',
      resolvedContext: target.resolvedContext,
      result: {
        ok: true,
        data: {
          manifestPath: path.relative(target.resolvedContext.repoRoot, manifestPath).split(path.sep).join('/'),
          verification,
          wroteManifest: options.apply === true,
        },
      },
    }, options.apply === true ? 'Archive bundle verified.' : 'Archive bundle verification passed; rerun with --apply to persist verification.')
  } catch (error) {
    logError(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}

export async function runArchiveDelete(options: ArchiveOptions): Promise<void> {
  try {
    const manifestInput = normalizeNonEmpty(options.manifest)
    if (!manifestInput) throw new Error('Missing required --manifest.')
    const repoRoot = (await resolveProjectBindingContext(options, { requireProject: false })).repoRoot
    const manifestPath = resolveRepoRelativePath(repoRoot, manifestInput)
    const manifest = await readArchiveManifest(manifestPath)
    assertManifestVerified(manifest)
    const target = await resolveArchiveTarget(options, projectFromManifest(manifest))
    if (!target) return

    const localFiles = await verifyLocalBundleFiles(manifestPath, manifest)
    const plannedActions = buildDeletePlanFromFiles(localFiles)
    const previousActions = archivedDeletionActions(manifest)
    const runnableActions = plannedActions.filter((action) => {
      const status = readDeletionStatus(manifest, action)
      return status !== 'deleted' && status !== 'missing'
    })

    if (options.apply !== true) {
      emit(options, {
        command: 'archive.delete',
        surface: 'aops-archive-v1',
        resolvedContext: target.resolvedContext,
        result: {
          ok: true,
          data: {
            mode: 'preview',
            manifestPath: path.relative(target.resolvedContext.repoRoot, manifestPath).split(path.sep).join('/'),
            actionCount: plannedActions.length,
            runnableActionCount: runnableActions.length,
            order: DELETE_ORDER.map((entry) => entry.key),
            actions: mergeDeletionActions(plannedActions, previousActions),
            requires: ['--apply', '--confirm'],
          },
        },
      }, 'Archive delete preview ready.')
      return
    }
    if (options.confirm !== true) throw new Error('archive delete is destructive. Retry with --apply --confirm or omit --apply for preview.')

    const startedAt = new Date().toISOString()
    let currentManifest = buildDeletionManifest(manifest, plannedActions, {
      status: 'in_progress',
      startedAt,
    })
    await writeFileWithRetry(manifestPath, canonicalJson(currentManifest), 'utf8')

    const overrides = new Map<string, Record<string, unknown>>()
    for (const action of plannedActions) {
      const existingStatus = readDeletionStatus(currentManifest, action)
      if (existingStatus === 'deleted' || existingStatus === 'missing') continue
      const key = actionKey(action)
      try {
        await invokeDelete(target, action)
        overrides.set(key, { status: 'deleted', deletedAt: new Date().toISOString() })
      } catch (error) {
        if (isMissingDeleteError(error)) {
          overrides.set(key, { status: 'missing', missingAt: new Date().toISOString() })
        } else {
          const message = error instanceof Error ? error.message : String(error)
          overrides.set(key, { status: 'failed', error: message })
          currentManifest = buildDeletionManifest(currentManifest, plannedActions, {
            status: 'failed',
            startedAt,
            failedAt: new Date().toISOString(),
            lastError: message,
            overrides,
          })
          await writeFileWithRetry(manifestPath, canonicalJson(currentManifest), 'utf8')
          throw new Error(`Archive delete failed at ${action.toolId} ${action.id}; manifest recorded failure and delete stopped. ${message}`)
        }
      }
      currentManifest = buildDeletionManifest(currentManifest, plannedActions, {
        status: 'in_progress',
        startedAt,
        overrides,
      })
      await writeFileWithRetry(manifestPath, canonicalJson(currentManifest), 'utf8')
    }

    const completedAt = new Date().toISOString()
    currentManifest = buildDeletionManifest(currentManifest, plannedActions, {
      status: 'completed',
      startedAt,
      completedAt,
      overrides,
    })
    await writeFileWithRetry(manifestPath, canonicalJson(currentManifest), 'utf8')

    emit(options, {
      command: 'archive.delete',
      surface: 'aops-archive-v1',
      resolvedContext: target.resolvedContext,
      result: {
        ok: true,
        data: {
          mode: 'apply',
          manifestPath: path.relative(target.resolvedContext.repoRoot, manifestPath).split(path.sep).join('/'),
          actionCount: plannedActions.length,
          executedActionCount: runnableActions.length,
          deletion: currentManifest.deletion,
        },
      },
    }, 'Archive PM graph delete completed.')
  } catch (error) {
    logError(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}

export async function runArchiveDecommissionCheck(options: ArchiveOptions): Promise<void> {
  try {
    const manifestInput = normalizeNonEmpty(options.manifest)
    if (!manifestInput) throw new Error('Missing required --manifest.')
    const repoRoot = (await resolveProjectBindingContext(options, { requireProject: false })).repoRoot
    const manifestPath = resolveRepoRelativePath(repoRoot, manifestInput)
    const manifest = await readArchiveManifest(manifestPath)
    const pendingDomains = pendingDomainsFromManifest(manifest)
    const decommissionSafe = decommissionSafeFromManifest(manifest)
    const blocked = pendingDomains.length > 0 || decommissionSafe !== true
    const data = {
      manifestPath: path.relative(repoRoot, manifestPath).split(path.sep).join('/'),
      status: blocked ? 'blocked' : 'allowed',
      decommissionSafe,
      pendingDomains,
      message: blocked
        ? `Full project/scope decommission is blocked because pendingDomains is non-empty or decommissionSafe is not true: ${pendingDomains.join(', ') || '(none)'}`
        : 'Full project/scope decommission is allowed by this archive manifest.',
    }

    emit(options, {
      command: 'archive.decommission-check',
      surface: 'aops-archive-v1',
      result: {
        ok: !blocked,
        data,
      },
    }, blocked ? 'Archive decommission check blocked.' : 'Archive decommission check passed.')
    if (blocked) process.exitCode = 1
  } catch (error) {
    logError(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}

export function makeArchiveCommand(): Command {
  const cmd = new Command('archive')
    .description('AOPS archive bundle commands for hosted Projectman graph cleanup preparation')

  applyCommonOptions(cmd.command('create')
    .description('Download a hosted PM graph into .aops/archive/<slug>/<timestamp>')
    .requiredOption('--project-slug <slug>', 'Project slug from the repo project registry')
    .option('--output-root <path>', 'Archive root directory', '.aops/archive')
    .option('--timestamp <value>', 'Archive timestamp/path segment override')
    .option('--apply', 'Write the local archive bundle')
    .action(async (options: ArchiveOptions) => runArchiveCreate(options)), { withProject: true })

  applyCommonOptions(cmd.command('verify')
    .description('Verify an archive bundle by re-fetching hosted PM graph data and comparing counts/checksums')
    .requiredOption('--manifest <path>', 'Path to archive manifest.json')
    .option('--project-slug <slug>', 'Optional project slug assertion')
    .option('--apply', 'Persist verification:passed into the manifest')
    .action(async (options: ArchiveOptions) => runArchiveVerify(options)), { withProject: true })

  applyCommonOptions(cmd.command('delete')
    .description('Preview or apply destructive hosted PM graph deletion from a verified archive manifest')
    .requiredOption('--manifest <path>', 'Path to archive manifest.json')
    .option('--preview', 'Preview delete plan without mutating hosted state')
    .option('--apply', 'Execute destructive hosted deletes')
    .option('--confirm', 'Required with --apply for destructive deletes')
    .action(async (options: ArchiveOptions) => runArchiveDelete(options)), { withProject: true })

  applyCommonOptions(cmd.command('decommission-check')
    .description('Check whether an archive manifest permits full project/scope decommission')
    .requiredOption('--manifest <path>', 'Path to archive manifest.json')
    .action(async (options: ArchiveOptions) => runArchiveDecommissionCheck(options)), { withProject: true })

  cmd.addHelpText('after', `
Examples:
  aops-cli archive create --project-slug aops --apply --json
  aops-cli archive verify --manifest .aops/archive/aops/<ts>/manifest.json --apply --json
  aops-cli archive delete --manifest .aops/archive/aops/<ts>/manifest.json --json
  aops-cli archive delete --manifest .aops/archive/aops/<ts>/manifest.json --apply --confirm --json
  aops-cli archive decommission-check --manifest .aops/archive/aops/<ts>/manifest.json --json

Notes:
  create/verify never delete hosted records.
  delete is destructive only with --apply --confirm; without --apply it is a preview.
  delete requires manifest verification:passed and records per-action deletion state for resumability.
  Archive bundles live under .aops/archive/** and are not repo-first sync sources.
`)

  return cmd
}
