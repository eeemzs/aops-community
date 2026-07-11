import { createHash } from 'node:crypto'
import { existsSync, type Dirent } from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'
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
  preferProjectNameBinding,
  resolveOwnerScopeIdFromBinding,
  resolveOwnerScopeIdFromProjectRecord,
  resolveProjectBindingContext,
} from '../utils/project-context.js'
import {
  loadAopsRepoConfig,
  writeAopsRepoConfig,
  type AopsProjectAuthoringMode,
  type AopsRepoConfig,
  type AopsRepoProjectConfig,
} from '../utils/repo-config.js'
import {
  buildHostedSugarEnvelope,
  buildOperatorCookbook,
  ensureDestructiveWrite,
  ensureGuardedWrite,
} from '../utils/hosted-sugar.js'
import { GUIDE_PATHS } from '../utils/guide-paths.js'
import { renderTable } from '../utils/table.js'
import type { CliApiClientState } from '../utils/api.js'

type ProjectContextOptions = AgentGatewayContextOptions & {
  projectName?: string
  projectId?: string
  scopeId?: string
  scopeResolution?: 'explicit' | 'cascade'
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

type ProjectListOptions = ProjectContextOptions & {
  name?: string
  slug?: string
  status?: string
  visibility?: string
  projectType?: string
  limit?: string | number
}

type ProjectGetOptions = ProjectContextOptions & {
  id?: string
}

type ProjectCreateOptions = ProjectContextOptions &
  JsonSeedOptions &
  GuardedWriteOptions & {
    name?: string
    description?: string
    slug?: string
    status?: string
    visibility?: string
    projectType?: string
  }

type ProjectUpdateOptions = ProjectContextOptions &
  JsonSeedOptions &
  GuardedWriteOptions & {
    id?: string
    name?: string
    description?: string
    slug?: string
    status?: string
    visibility?: string
    projectType?: string
  }

type ProjectDeleteOptions = ProjectContextOptions &
  GuardedWriteOptions & {
    id?: string
  }

type ProjectLinkOptions = ProjectContextOptions &
  GuardedWriteOptions & {
    slug?: string
    mode?: string
    localRoot?: string
    ownerRepo?: string
    parentProjectSlug?: string
  }

type ProjectLinksListOptions = ProjectContextOptions

type ProjectMigrateLocalRootOptions = ProjectContextOptions &
  GuardedWriteOptions & {
    projectSlug?: string
    localRoot?: string
    dryRun?: boolean
    timestamp?: string
  }

type ResolvedProjectContext = Awaited<ReturnType<typeof resolveProjectBindingContext>> & {
  scopeId?: string
}

type LocalRootMigrationFile = {
  rootKey: 'projectman' | 'agentspace'
  relativePath: string
  sourcePath: string
  targetPath: string
  kind: 'file' | 'symlink'
  category: string
  size: number
  sha256: string
}

type LocalRootMigrationPlan = {
  projectSlug: string
  localRoot: string
  repoRoot: string
  configPath: string
  sourceRoots: Record<'projectman' | 'agentspace', string>
  targetRoot: string
  archiveRoot: string
  files: LocalRootMigrationFile[]
  counts: {
    totalFiles: number
    totalBytes: number
    byRoot: Record<string, { before: number; plannedAfter: number }>
    byCategory: Record<string, { before: number; plannedAfter: number }>
  }
  checksum: {
    aggregateSha256: string
  }
  conflicts: Array<{ code: string; path: string; message: string }>
  warnings: string[]
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

function parseJsonSeed(input: unknown, label = '--input'): Record<string, unknown> {
  const normalized = normalizeNonEmpty(input)
  if (!normalized) return {}
  const parsed = parseJsonInput(normalized, label)
  if (!isRecord(parsed)) throw new Error(`${label} must be a JSON object or @file.json object.`)
  return parsed
}

function resolveStringField(explicit: unknown, seed: Record<string, unknown>, key: string): string | undefined {
  return normalizeNonEmpty(explicit) ?? normalizeNonEmpty(seed[key])
}

function toInteger(value: unknown, label: string): number {
  if (typeof value === 'number' && Number.isInteger(value)) return value
  const normalized = normalizeNonEmpty(value)
  if (!normalized) throw new Error(`${label} must be an integer.`)
  const parsed = Number.parseInt(normalized, 10)
  if (!Number.isInteger(parsed)) throw new Error(`${label} must be an integer.`)
  return parsed
}

function buildGatewayOptions(
  options: AgentGatewayContextOptions,
  resolvedContext: ResolvedProjectContext,
): AgentGatewayContextOptions {
  return {
    apiBaseUrl: options.apiBaseUrl,
    accessToken: options.accessToken,
    refreshToken: options.refreshToken,
    timeoutMs: options.timeoutMs,
    tenantId: options.tenantId,
    locale: options.locale,
    fallbackLocale: options.fallbackLocale,
    scopeId: options.scopeId,
    projectId: options.projectId,
    projectName: options.projectName,
    scopeResolution: options.scopeResolution,
    ...preferProjectNameBinding(resolvedContext),
  }
}

async function hydrateProjectContext(
  apiState: CliApiClientState,
  options: AgentGatewayContextOptions,
  resolvedContext: ResolvedProjectContext,
): Promise<ResolvedProjectContext> {
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

async function resolveProjectContext(
  options: ProjectContextOptions,
  apiState: CliApiClientState,
): Promise<ResolvedProjectContext> {
  const resolved = await resolveProjectBindingContext(options, {
    requireProject: false,
  })
  const scopeId = normalizeNonEmpty(options.scopeId) ?? resolveOwnerScopeIdFromBinding(resolved)
  return hydrateProjectContext(apiState, options, {
    ...resolved,
    scopeId,
  })
}

function buildResolvedContextRecord(context: ResolvedProjectContext): Record<string, unknown> {
  return compactPayload({
    repoRoot: context.repoRoot,
    configPath: context.configPath,
    configFound: context.configFound,
    scopeId: context.scopeId,
    projectId: context.projectId,
    projectName: context.projectName,
  })
}

function collectProjectArtifacts(result: unknown): Record<string, string> | undefined {
  const root = unwrapResultData<Record<string, unknown>>(result) ?? (isRecord(result) ? result : {})
  const artifacts: Record<string, string> = {}
  const projectId = normalizeNonEmpty(root.projectId) ?? normalizeNonEmpty(root.id)
  const scopeId = normalizeNonEmpty(root.scopeId)
  if (projectId) artifacts.projectId = projectId
  if (scopeId) artifacts.scopeId = scopeId
  return Object.keys(artifacts).length > 0 ? artifacts : undefined
}

function ensureProjectId(id: unknown, label = '--id'): string {
  const resolved = normalizeNonEmpty(id)
  if (!resolved) throw new Error(`Provide ${label}.`)
  return resolved
}

function normalizeAuthoringMode(value: unknown): AopsProjectAuthoringMode {
  if (value === 'local' || value === 'hosted-only') return value
  throw new Error('Provide --mode local or --mode hosted-only.')
}

function isArchivedProject(project: Record<string, unknown>): boolean {
  const status = normalizeNonEmpty(project.status)?.toLowerCase()
  return status === 'archived' || status === 'deleted' || status === 'removed'
}

function projectSlugMatches(project: Record<string, unknown>, slug: string): boolean {
  return normalizeNonEmpty(project.slug)?.toLowerCase() === slug.toLowerCase()
}

function projectIdFromRecord(project: Record<string, unknown>): string {
  return ensureProjectId(normalizeNonEmpty(project.id) ?? normalizeNonEmpty(project.projectId), 'hosted project id')
}

async function resolveHostedProjectForLink(
  apiState: CliApiClientState,
  options: ProjectLinkOptions,
  resolvedContext: ResolvedProjectContext,
  slug: string,
): Promise<Record<string, unknown>> {
  const explicitProjectId = normalizeNonEmpty(options.projectId)
  if (explicitProjectId) {
    const payload = await invokeHostedToolWithApiState(apiState, {
      ...buildGatewayOptions(options, resolvedContext),
      toolId: 'agentspace.project.get-by-id',
      input: { id: explicitProjectId },
    })
    const project = unwrapResultData<Record<string, unknown>>(unwrapHostedToolResult(payload))
    if (!isRecord(project)) throw new Error(`Hosted project "${explicitProjectId}" was not found.`)
    const hostedSlug = normalizeNonEmpty(project.slug)
    if (hostedSlug && hostedSlug.toLowerCase() !== slug.toLowerCase()) {
      throw new Error(`Hosted project "${explicitProjectId}" has slug "${hostedSlug}", not "${slug}".`)
    }
    return project
  }

  const payload = await invokeHostedToolWithApiState(apiState, {
    ...buildGatewayOptions(options, resolvedContext),
    toolId: 'agentspace.project.list-projects',
    input: {
      filter: { slug },
      options: { limit: 10 },
    },
  })
  const matches = unwrapListItems(unwrapHostedToolResult(payload)).filter((project) => projectSlugMatches(project, slug))
  if (matches.length === 0) {
    throw new Error(`Hosted project slug "${slug}" was not found. Create the hosted project first or pass --project-id for an exact project.`)
  }
  if (matches.length > 1) {
    const ids = matches.map((project) => projectIdFromRecord(project)).join(', ')
    throw new Error(`Hosted project slug "${slug}" is ambiguous: ${ids}. Pass --project-id.`)
  }
  return matches[0]
}

function ensureLinkableProject(project: Record<string, unknown>, slug: string): void {
  if (isArchivedProject(project)) {
    throw new Error(`Hosted project slug "${slug}" is archived/deleted and cannot be linked for authoring.`)
  }
}

function upsertProjectLink(
  config: AopsRepoConfig,
  params: {
    slug: string
    project: Record<string, unknown>
    mode: AopsProjectAuthoringMode
    localRoot?: string
    ownerRepo?: string
    parentProjectSlug?: string
  },
): AopsRepoConfig {
  const projectId = projectIdFromRecord(params.project)
  const name = normalizeNonEmpty(params.project.name) ?? params.slug
  const hostedSlug = normalizeNonEmpty(params.project.slug) ?? params.slug
  const nextProject: AopsRepoProjectConfig = {
    name,
    projectId,
    slug: hostedSlug,
    authoringMode: params.mode,
    ...(params.mode === 'local' && params.localRoot ? { localRoot: params.localRoot } : {}),
    ...(params.ownerRepo ? { ownerRepo: params.ownerRepo } : {}),
    ...(params.parentProjectSlug ? { parentProjectSlug: params.parentProjectSlug } : {}),
  }

  const projects = [...config.projects]
  const existingIndex = projects.findIndex((project) => {
    const existingSlug = normalizeNonEmpty(project.slug)?.toLowerCase()
    return project.projectId === projectId || existingSlug === hostedSlug.toLowerCase() || existingSlug === params.slug.toLowerCase()
  })
  if (existingIndex >= 0) {
    projects[existingIndex] = {
      ...projects[existingIndex],
      ...nextProject,
    }
  } else {
    projects.push(nextProject)
  }

  return {
    ...config,
    projects,
  }
}

function slashPath(value: string): string {
  return value.split(path.sep).join('/')
}

function repoRelative(repoRoot: string, filePath: string): string {
  return slashPath(path.relative(repoRoot, filePath))
}

function normalizeMigrationLocalRoot(value: unknown): string {
  const localRoot = normalizeNonEmpty(value)
  if (!localRoot) throw new Error('Provide --local-root <path>.')
  if (path.isAbsolute(localRoot)) throw new Error('--local-root must be repo-relative.')
  const normalized = slashPath(path.normalize(localRoot))
  if (normalized === '.' || normalized.startsWith('../') || normalized === '..') {
    throw new Error('--local-root must stay inside the repo.')
  }
  if (!normalized.startsWith('.aops/projects/')) {
    throw new Error('--local-root must be under .aops/projects/<slug>.')
  }
  return normalized
}

function resolveMigrationProject(config: AopsRepoConfig, projectSlug: string): AopsRepoProjectConfig {
  const matches = config.projects.filter((project) => normalizeNonEmpty(project.slug)?.toLowerCase() === projectSlug.toLowerCase())
  if (matches.length === 0) {
    throw new Error(`Project slug "${projectSlug}" was not found in repo config.`)
  }
  if (matches.length > 1) {
    throw new Error(`Project slug "${projectSlug}" is ambiguous in repo config.`)
  }
  return matches[0] as AopsRepoProjectConfig
}

function withMigratedProjectLocalRoot(config: AopsRepoConfig, projectSlug: string, localRoot: string): AopsRepoConfig {
  return {
    ...config,
    projects: config.projects.map((project) => {
      if (normalizeNonEmpty(project.slug)?.toLowerCase() !== projectSlug.toLowerCase()) return project
      return {
        ...project,
        authoringMode: 'local',
        localRoot,
      }
    }),
  }
}

function classifyMigrationFile(rootKey: 'projectman' | 'agentspace', relativePath: string): string {
  const parts = relativePath.split('/').filter(Boolean)
  if (rootKey === 'projectman') {
    const first = parts[0] ?? 'root'
    if (first === 'kanban-tasks') return 'projectman.kanban-tasks'
    if (first === 'review-requests') return 'projectman.review-requests'
    if (first === 'tombstones') return `projectman.tombstones.${parts[1] ?? 'root'}`
    if (first === 'utasks') return 'projectman.utasks'
    if (first === 'boards') return 'projectman.boards'
    if (first === 'sprints') return 'projectman.sprints'
    if (first === 'issues') return 'projectman.issues'
    if (first === 'feedback') return 'projectman.feedback'
    if (first === 'views') return 'projectman.views'
    return 'projectman.root-files'
  }

  const first = parts[0] ?? 'root'
  const second = parts[1] ?? 'root'
  if (first === 'memory') {
    if (['items', 'by-durability', 'by-flow', 'by-owner', 'subjects'].includes(second)) return `agentspace.memory.${second}`
    return 'agentspace.memory.root-files'
  }
  if (first === 'experience') {
    if (second === 'items' || second === 'views') return `agentspace.experience.${second}`
    return 'agentspace.experience.root-files'
  }
  if (first === 'discussions') {
    if (second === 'topics') return 'agentspace.discussions.topics'
    return 'agentspace.discussions.root-files'
  }
  if (first === 'collabs') {
    if (second === 'sessions') return 'agentspace.collabs.sessions'
    return 'agentspace.collabs.root-files'
  }
  return 'agentspace.root-files'
}

async function collectMigrationFiles(params: {
  repoRoot: string
  sourceRoot: string
  targetRoot: string
  rootKey: 'projectman' | 'agentspace'
}): Promise<LocalRootMigrationFile[]> {
  async function walk(dir: string): Promise<LocalRootMigrationFile[]> {
    let entries: Dirent<string>[]
    try {
      entries = await fs.readdir(dir, { withFileTypes: true })
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      if (code === 'ENOENT') return []
      throw error
    }

    const files: LocalRootMigrationFile[] = []
    for (const entry of entries) {
      const filePath = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        files.push(...await walk(filePath))
        continue
      }
      if (!entry.isFile() && !entry.isSymbolicLink()) continue
      const content = entry.isSymbolicLink()
        ? Buffer.from(await fs.readlink(filePath), 'utf8')
        : await fs.readFile(filePath)
      const kind = entry.isSymbolicLink() ? 'symlink' : 'file'
      const relativePath = slashPath(path.relative(params.sourceRoot, filePath))
      files.push({
        rootKey: params.rootKey,
        relativePath,
        sourcePath: filePath,
        targetPath: path.join(params.targetRoot, params.rootKey, relativePath),
        kind,
        category: classifyMigrationFile(params.rootKey, relativePath),
        size: content.byteLength,
        sha256: createHash('sha256').update(content).digest('hex'),
      })
    }
    return files
  }

  return (await walk(params.sourceRoot)).sort((left, right) =>
    `${left.rootKey}/${left.relativePath}`.localeCompare(`${right.rootKey}/${right.relativePath}`),
  )
}

async function directoryHasFiles(dir: string): Promise<boolean> {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true })
    for (const entry of entries) {
      const filePath = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        if (await directoryHasFiles(filePath)) return true
      } else if (entry.isFile() || entry.isSymbolicLink()) {
        return true
      }
    }
    return false
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code === 'ENOENT') return false
    throw error
  }
}

function summarizeMigrationFiles(files: LocalRootMigrationFile[]): LocalRootMigrationPlan['counts'] {
  const byRoot: Record<string, { before: number; plannedAfter: number }> = {
    projectman: { before: 0, plannedAfter: 0 },
    agentspace: { before: 0, plannedAfter: 0 },
  }
  const byCategory: Record<string, { before: number; plannedAfter: number }> = {}
  let totalBytes = 0

  for (const file of files) {
    totalBytes += file.size
    byRoot[file.rootKey] = byRoot[file.rootKey] ?? { before: 0, plannedAfter: 0 }
    byRoot[file.rootKey]!.before += 1
    byRoot[file.rootKey]!.plannedAfter += 1
    byCategory[file.category] = byCategory[file.category] ?? { before: 0, plannedAfter: 0 }
    byCategory[file.category]!.before += 1
    byCategory[file.category]!.plannedAfter += 1
  }

  return {
    totalFiles: files.length,
    totalBytes,
    byRoot,
    byCategory: Object.fromEntries(Object.entries(byCategory).sort(([left], [right]) => left.localeCompare(right))),
  }
}

function aggregateMigrationChecksum(files: LocalRootMigrationFile[]): string {
  const hash = createHash('sha256')
  for (const file of files) {
    hash.update(file.rootKey)
    hash.update('\0')
    hash.update(file.relativePath)
    hash.update('\0')
    hash.update(file.sha256)
    hash.update('\0')
    hash.update(String(file.size))
    hash.update('\0')
  }
  return hash.digest('hex')
}

async function buildLocalRootMigrationPlan(params: {
  repoRoot: string
  configPath: string
  projectSlug: string
  localRoot: string
  timestamp?: string
}): Promise<LocalRootMigrationPlan> {
  const targetRoot = path.join(params.repoRoot, params.localRoot)
  const sourceRoots = {
    projectman: path.join(params.repoRoot, '.aops', 'projectman'),
    agentspace: path.join(params.repoRoot, '.aops', 'agentspace'),
  }
  const files = [
    ...await collectMigrationFiles({
      repoRoot: params.repoRoot,
      sourceRoot: sourceRoots.projectman,
      targetRoot,
      rootKey: 'projectman',
    }),
    ...await collectMigrationFiles({
      repoRoot: params.repoRoot,
      sourceRoot: sourceRoots.agentspace,
      targetRoot,
      rootKey: 'agentspace',
    }),
  ].sort((left, right) => `${left.rootKey}/${left.relativePath}`.localeCompare(`${right.rootKey}/${right.relativePath}`))
  const counts = summarizeMigrationFiles(files)
  const timestamp = params.timestamp ?? new Date().toISOString().replace(/[:.]/g, '-')
  const conflicts: LocalRootMigrationPlan['conflicts'] = []
  if (await directoryHasFiles(targetRoot)) {
    conflicts.push({
      code: 'target_not_empty',
      path: repoRelative(params.repoRoot, targetRoot),
      message: 'Target localRoot already contains files; apply refuses unless a future resume/rollback flow matches a manifest.',
    })
  }

  return {
    projectSlug: params.projectSlug,
    localRoot: params.localRoot,
    repoRoot: params.repoRoot,
    configPath: params.configPath,
    sourceRoots: {
      projectman: repoRelative(params.repoRoot, sourceRoots.projectman),
      agentspace: repoRelative(params.repoRoot, sourceRoots.agentspace),
    },
    targetRoot: repoRelative(params.repoRoot, targetRoot),
    archiveRoot: `.aops/archive/localroot-migrations/${timestamp}`,
    files,
    counts,
    checksum: {
      aggregateSha256: aggregateMigrationChecksum(files),
    },
    conflicts,
    warnings: files.length === 0 ? ['No files found under flat .aops/projectman or .aops/agentspace source roots.'] : [],
  }
}

function publicMigrationSummary(plan: LocalRootMigrationPlan, params: { mode: 'dry-run' | 'apply'; applied?: Record<string, unknown> }): Record<string, unknown> {
  return {
    mode: params.mode,
    projectSlug: plan.projectSlug,
    localRoot: plan.localRoot,
    sourceRoots: plan.sourceRoots,
    targetRoot: plan.targetRoot,
    archiveRoot: plan.archiveRoot,
    totals: {
      sourceFileCount: plan.counts.totalFiles,
      plannedTargetFileCount: plan.counts.totalFiles,
      totalBytes: plan.counts.totalBytes,
    },
    counts: plan.counts,
    checksum: plan.checksum,
    conflicts: plan.conflicts,
    warnings: plan.warnings,
    guards: [
      'dry-run is non-mutating',
      'apply requires --apply --confirm',
      'apply refuses non-empty target localRoot',
      'config localRoot is written only after target copy verification',
      'flat source roots move to migration archive after config switch',
    ],
    ...(params.applied ? { applied: params.applied } : {}),
  }
}

async function copyMigrationRoot(source: string, destination: string): Promise<void> {
  if (!existsSync(source)) return
  await fs.mkdir(path.dirname(destination), { recursive: true })
  await fs.cp(source, destination, { recursive: true, force: false, errorOnExist: true, verbatimSymlinks: true })
}

async function verifyCopiedMigrationPlan(plan: LocalRootMigrationPlan, rootDir: string): Promise<void> {
  for (const expected of plan.files) {
    const filePath = path.join(rootDir, expected.rootKey, expected.relativePath)
    const content = expected.kind === 'symlink'
      ? Buffer.from(await fs.readlink(filePath), 'utf8')
      : await fs.readFile(filePath)
    const sha256 = createHash('sha256').update(content).digest('hex')
    if (sha256 !== expected.sha256 || content.byteLength !== expected.size) {
      throw new Error(`Copied file verification failed for ${expected.rootKey}/${expected.relativePath}.`)
    }
  }
}

async function applyLocalRootMigration(params: {
  config: AopsRepoConfig
  configPath: string
  plan: LocalRootMigrationPlan
}): Promise<Record<string, unknown>> {
  if (params.plan.conflicts.length > 0) {
    throw new Error(`Migration target has conflicts: ${params.plan.conflicts.map((conflict) => conflict.code).join(', ')}`)
  }

  const repoRoot = params.plan.repoRoot
  const archiveRoot = path.join(repoRoot, params.plan.archiveRoot)
  const tempTargetRoot = path.join(repoRoot, '.aops', 'projects', `.tmp-${params.plan.projectSlug}-migrate-${path.basename(params.plan.archiveRoot)}`)
  const targetRoot = path.join(repoRoot, params.plan.localRoot)
  const sourceProjectman = path.join(repoRoot, '.aops', 'projectman')
  const sourceAgentspace = path.join(repoRoot, '.aops', 'agentspace')

  await fs.mkdir(archiveRoot, { recursive: true })
  await fs.writeFile(path.join(archiveRoot, 'original-aops.config.json'), await fs.readFile(params.configPath, 'utf8'), 'utf8')
  await fs.writeFile(path.join(archiveRoot, 'manifest.json'), `${JSON.stringify({
    ...publicMigrationSummary(params.plan, { mode: 'dry-run' }),
    files: params.plan.files.map((file) => ({
      rootKey: file.rootKey,
      relativePath: file.relativePath,
      kind: file.kind,
      category: file.category,
      size: file.size,
      sha256: file.sha256,
    })),
  }, null, 2)}\n`, 'utf8')

  await fs.rm(tempTargetRoot, { recursive: true, force: true })
  await copyMigrationRoot(sourceProjectman, path.join(tempTargetRoot, 'projectman'))
  await copyMigrationRoot(sourceAgentspace, path.join(tempTargetRoot, 'agentspace'))
  await verifyCopiedMigrationPlan(params.plan, tempTargetRoot)
  await fs.mkdir(path.dirname(targetRoot), { recursive: true })
  await fs.rename(tempTargetRoot, targetRoot)

  await writeAopsRepoConfig(params.configPath, withMigratedProjectLocalRoot(params.config, params.plan.projectSlug, params.plan.localRoot))

  const archivedFlatRoot = path.join(archiveRoot, 'flat-roots')
  await fs.mkdir(archivedFlatRoot, { recursive: true })
  if (existsSync(sourceProjectman)) await fs.rename(sourceProjectman, path.join(archivedFlatRoot, 'projectman'))
  if (existsSync(sourceAgentspace)) await fs.rename(sourceAgentspace, path.join(archivedFlatRoot, 'agentspace'))

  return {
    targetRoot: params.plan.targetRoot,
    archiveRoot: params.plan.archiveRoot,
    configPath: repoRelative(repoRoot, params.configPath),
    movedFlatRootsTo: repoRelative(repoRoot, archivedFlatRoot),
  }
}

async function invokeProjectTool(
  apiState: CliApiClientState,
  options: ProjectContextOptions & GuardedWriteOptions,
  resolvedContext: ResolvedProjectContext,
  params: {
    command: string
    toolId: string
    input: Record<string, unknown>
    successText: string
  },
): Promise<void> {
  ensureGuardedWrite(options, 'This command mutates hosted project state.')
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
    console.log(JSON.stringify(buildHostedSugarEnvelope({
      command: params.command,
      toolId: params.toolId,
      resolvedContext: buildResolvedContextRecord(resolvedContext),
      input: params.input,
      artifacts: collectProjectArtifacts(result),
      result,
    }), null, 2))
    return
  }

  logSuccess(params.successText)
  console.log(JSON.stringify(result, null, 2))
}

function printProjectTable(result: unknown): void {
  const rows = unwrapListItems(result)
  console.log(renderTable({
    columns: [
      { header: 'Name', maxWidth: 28 },
      { header: 'Slug', maxWidth: 28 },
      { header: 'Status', maxWidth: 12 },
      { header: 'Visibility', maxWidth: 12 },
      { header: 'ID', maxWidth: 36 },
    ],
    rows: rows.map((row): Array<string | number | boolean | null | undefined> => [
      normalizeNonEmpty(row.name) ?? String(row.name ?? '-'),
      normalizeNonEmpty(row.slug) ?? String(row.slug ?? '-'),
      normalizeNonEmpty(row.status) ?? String(row.status ?? '-'),
      normalizeNonEmpty(row.visibility) ?? String(row.visibility ?? '-'),
      normalizeNonEmpty(row.id) ?? String(row.id ?? '-'),
    ]),
    emptyText: '(no projects found)',
  }))
}

export async function runProjectList(options: ProjectListOptions = {}): Promise<void> {
  try {
    const apiState = await requireApiState(options)
    if (!apiState) return
    const resolvedContext = await resolveProjectContext(options, apiState)
    const input = {
      filter: compactPayload({
        name: normalizeNonEmpty(options.name),
        slug: normalizeNonEmpty(options.slug),
        status: normalizeNonEmpty(options.status),
        visibility: normalizeNonEmpty(options.visibility),
        projectType: normalizeNonEmpty(options.projectType),
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
      toolId: 'agentspace.project.list-projects',
      input,
    })
    const result = unwrapHostedToolResult(payload)

    if (options.json) {
      console.log(JSON.stringify(buildHostedSugarEnvelope({
        command: 'project.list',
        toolId: 'agentspace.project.list-projects',
        resolvedContext: buildResolvedContextRecord(resolvedContext),
        input,
        result,
      }), null, 2))
      return
    }

    logSuccess('Project list loaded.')
    printProjectTable(result)
  } catch (error) {
    logError(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}

export async function runProjectGet(options: ProjectGetOptions = {}): Promise<void> {
  try {
    const apiState = await requireApiState(options)
    if (!apiState) return
    const resolvedContext = await resolveProjectContext(options, apiState)
    const input = { id: ensureProjectId(options.id) }
    const payload = await invokeHostedToolWithApiState(apiState, {
      ...buildGatewayOptions(options, resolvedContext),
      tenantId: options.tenantId,
      locale: options.locale,
      fallbackLocale: options.fallbackLocale,
      timeoutMs: options.timeoutMs,
      apiBaseUrl: options.apiBaseUrl,
      accessToken: options.accessToken,
      refreshToken: options.refreshToken,
      toolId: 'agentspace.project.get-project',
      input,
    })
    const result = unwrapHostedToolResult(payload)

    if (options.json) {
      console.log(JSON.stringify(buildHostedSugarEnvelope({
        command: 'project.get',
        toolId: 'agentspace.project.get-project',
        resolvedContext: buildResolvedContextRecord(resolvedContext),
        input,
        artifacts: collectProjectArtifacts(result),
        result,
      }), null, 2))
      return
    }

    logSuccess('Project loaded.')
    console.log(JSON.stringify(result, null, 2))
  } catch (error) {
    logError(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}

export async function runProjectCreate(options: ProjectCreateOptions = {}): Promise<void> {
  try {
    const apiState = await requireApiState(options)
    if (!apiState) return
    const resolvedContext = await resolveProjectContext(options, apiState)
    const seed = parseJsonSeed(options.input)
    const name = resolveStringField(options.name, seed, 'name')
    if (!name) throw new Error('Project create requires --name or input.name.')
    const input = {
      data: compactPayload({
        name,
        description: resolveStringField(options.description, seed, 'description'),
        slug: resolveStringField(options.slug, seed, 'slug'),
        status: resolveStringField(options.status, seed, 'status'),
        visibility: resolveStringField(options.visibility, seed, 'visibility'),
        projectType: resolveStringField(options.projectType, seed, 'projectType'),
      }),
    }

    await invokeProjectTool(apiState, options, resolvedContext, {
      command: 'project.create',
      toolId: 'agentspace.project.create',
      input,
      successText: 'Project created.',
    })
  } catch (error) {
    logError(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}

export async function runProjectUpdate(options: ProjectUpdateOptions = {}): Promise<void> {
  try {
    const apiState = await requireApiState(options)
    if (!apiState) return
    const resolvedContext = await resolveProjectContext(options, apiState)
    const seed = parseJsonSeed(options.input)
    const id = ensureProjectId(resolveStringField(options.id, seed, 'id'))
    const patch = compactPayload({
      name: resolveStringField(options.name, seed, 'name'),
      description: resolveStringField(options.description, seed, 'description'),
      slug: resolveStringField(options.slug, seed, 'slug'),
      status: resolveStringField(options.status, seed, 'status'),
      visibility: resolveStringField(options.visibility, seed, 'visibility'),
      projectType: resolveStringField(options.projectType, seed, 'projectType'),
    })
    if (Object.keys(patch).length === 0) {
      throw new Error('Provide at least one project field to update.')
    }
    const input = { id, patch }

    await invokeProjectTool(apiState, options, resolvedContext, {
      command: 'project.update',
      toolId: 'agentspace.project.update-project',
      input,
      successText: 'Project updated.',
    })
  } catch (error) {
    logError(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}

export async function runProjectDelete(options: ProjectDeleteOptions = {}): Promise<void> {
  try {
    ensureDestructiveWrite(options, 'This command deletes hosted projects.')
    const apiState = await requireApiState(options)
    if (!apiState) return
    const resolvedContext = await resolveProjectContext(options, apiState)
    const input = { id: ensureProjectId(options.id) }

    await invokeProjectTool(apiState, options, resolvedContext, {
      command: 'project.delete',
      toolId: 'agentspace.project.remove-project',
      input,
      successText: 'Project deleted.',
    })
  } catch (error) {
    logError(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}

export async function runProjectLink(options: ProjectLinkOptions = {}): Promise<void> {
  try {
    ensureGuardedWrite(options, 'This command mutates repo project link config.')
    const slug = normalizeNonEmpty(options.slug)
    if (!slug) throw new Error('Provide --slug <slug>.')
    const mode = normalizeAuthoringMode(options.mode)
    const localRoot = normalizeNonEmpty(options.localRoot)
    if (mode === 'local' && !localRoot) {
      throw new Error('Local project links require --local-root <path>.')
    }

    const loaded = await loadAopsRepoConfig(process.cwd())
    if (!loaded.config) {
      throw new Error(`Repo config was not found at ${loaded.configPath}. Run \`aops-cli init\` first.`)
    }

    const apiState = await requireApiState(options)
    if (!apiState) return
    const resolvedContext = await resolveProjectContext(options, apiState)
    const project = await resolveHostedProjectForLink(apiState, options, resolvedContext, slug)
    ensureLinkableProject(project, slug)

    const nextConfig = upsertProjectLink(loaded.config, {
      slug,
      project,
      mode,
      localRoot,
      ownerRepo: normalizeNonEmpty(options.ownerRepo),
      parentProjectSlug: normalizeNonEmpty(options.parentProjectSlug),
    })

    const result = {
      preview: options.preview === true,
      configPath: loaded.configPath,
      link: nextConfig.projects.find((entry) => normalizeNonEmpty(entry.slug)?.toLowerCase() === slug.toLowerCase()),
    }
    if (options.preview !== true) {
      await writeAopsRepoConfig(loaded.configPath, nextConfig)
    }

    if (options.json) {
      console.log(JSON.stringify(buildHostedSugarEnvelope({
        command: 'project.link',
        surface: 'repo-config',
        resolvedContext: buildResolvedContextRecord(resolvedContext),
        input: compactPayload({
          slug,
          mode,
          projectId: normalizeNonEmpty(options.projectId),
          localRoot,
          ownerRepo: normalizeNonEmpty(options.ownerRepo),
          parentProjectSlug: normalizeNonEmpty(options.parentProjectSlug),
        }),
        artifacts: { projectId: projectIdFromRecord(project) },
        result,
      }), null, 2))
      return
    }

    logSuccess(options.preview === true ? 'Project link preview ready.' : 'Project link saved.')
    console.log(JSON.stringify(result, null, 2))
  } catch (error) {
    logError(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}

export async function runProjectLinksList(options: ProjectLinksListOptions = {}): Promise<void> {
  try {
    const loaded = await loadAopsRepoConfig(process.cwd())
    if (!loaded.config) {
      throw new Error(`Repo config was not found at ${loaded.configPath}. Run \`aops-cli init\` first.`)
    }

    const links = loaded.config.projects.map((project) => compactPayload({
      name: project.name,
      slug: project.slug,
      projectId: project.projectId,
      authoringMode: project.authoringMode ?? 'local',
      localRoot: project.localRoot,
      ownerRepo: project.ownerRepo,
      parentProjectSlug: project.parentProjectSlug,
    }))

    const result = { configPath: loaded.configPath, data: links }
    if (options.json) {
      console.log(JSON.stringify(buildHostedSugarEnvelope({
        command: 'project.links.list',
        surface: 'repo-config',
        resolvedContext: {
          repoRoot: loaded.rootDir,
          configPath: loaded.configPath,
          configFound: true,
        },
        input: {},
        result,
      }), null, 2))
      return
    }

    console.log(renderTable({
      columns: [
        { header: 'Slug', maxWidth: 28 },
        { header: 'Mode', maxWidth: 14 },
        { header: 'Project ID', maxWidth: 36 },
        { header: 'Local Root', maxWidth: 32 },
      ],
      rows: links.map((link): Array<string | number | boolean | null | undefined> => [
        String(link.slug ?? '-'),
        String(link.authoringMode ?? 'local'),
        String(link.projectId ?? '-'),
        String(link.localRoot ?? '-'),
      ]),
      emptyText: '(no project links found)',
    }))
  } catch (error) {
    logError(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}

export async function runProjectMigrateLocalRoot(options: ProjectMigrateLocalRootOptions = {}): Promise<void> {
  try {
    const projectSlug = normalizeNonEmpty(options.projectSlug)
    if (!projectSlug) throw new Error('Provide --project-slug <slug>.')
    const localRoot = normalizeMigrationLocalRoot(options.localRoot)
    if (options.dryRun === true && options.apply === true) {
      throw new Error('Use either --dry-run or --apply, not both.')
    }

    const loaded = await loadAopsRepoConfig(process.cwd())
    if (!loaded.config) {
      throw new Error(`Repo config was not found at ${loaded.configPath}. Run \`aops-cli init\` first.`)
    }
    const project = resolveMigrationProject(loaded.config, projectSlug)
    const currentLocalRoot = normalizeNonEmpty(project.localRoot)
    if (currentLocalRoot && currentLocalRoot !== localRoot) {
      throw new Error(`Project "${projectSlug}" already has localRoot "${currentLocalRoot}".`)
    }

    const plan = await buildLocalRootMigrationPlan({
      repoRoot: loaded.rootDir,
      configPath: loaded.configPath,
      projectSlug,
      localRoot,
      timestamp: normalizeNonEmpty(options.timestamp),
    })

    const mode = options.apply === true ? 'apply' : 'dry-run'
    if (mode === 'apply') {
      if (options.confirm !== true) {
        throw new Error('project migrate-local-root is destructive. Retry with --apply --confirm after reviewing dry-run output.')
      }
      const applied = await applyLocalRootMigration({
        config: loaded.config,
        configPath: loaded.configPath,
        plan,
      })
      const result = publicMigrationSummary(plan, { mode, applied })
      if (options.json) {
        console.log(JSON.stringify(buildHostedSugarEnvelope({
          command: 'project.migrate-local-root',
          surface: 'repo-config-localroot-migration',
          resolvedContext: {
            repoRoot: loaded.rootDir,
            configPath: loaded.configPath,
            configFound: true,
            projectSlug,
          },
          input: { projectSlug, localRoot, apply: true, confirm: true },
          result,
        }), null, 2))
        return
      }
      logSuccess('Local root migration applied.')
      console.log(JSON.stringify(result, null, 2))
      return
    }

    const result = publicMigrationSummary(plan, { mode })
    if (options.json) {
      console.log(JSON.stringify(buildHostedSugarEnvelope({
        command: 'project.migrate-local-root',
        surface: 'repo-config-localroot-migration',
        resolvedContext: {
          repoRoot: loaded.rootDir,
          configPath: loaded.configPath,
          configFound: true,
          projectSlug,
        },
        input: { projectSlug, localRoot, dryRun: true },
        result,
      }), null, 2))
      return
    }

    logSuccess('Local root migration dry-run ready.')
    console.log(JSON.stringify(result, null, 2))
  } catch (error) {
    logError(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  }
}

function applyProjectContextOptions(
  cmd: Command,
  params: {
    withScopeResolution?: boolean
  } = {},
): Command {
  applyCommonOptions(cmd)
  cmd.option('--project-id <id>', 'Project id used to resolve repo-bound project context')
  cmd.option('--project-name <name>', 'Project name used to resolve repo-bound project context')
  cmd.option('--scope-id <id>', 'Explicit scope id override')
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

export function makeProjectCommand(): Command {
  const cmd = new Command('project').description('Agentspace project sugar commands over the hosted AOPS gateway')

  applyProjectContextOptions(
    cmd.command('list')
      .description('List hosted projects')
      .option('--name <text>', 'Project name filter')
      .option('--slug <text>', 'Project slug filter')
      .option('--status <status>', 'Project status filter')
      .option('--visibility <visibility>', 'Project visibility filter')
      .option('--project-type <type>', 'Project type filter')
      .option('--limit <n>', 'Optional item limit'),
  ).action(async (options: ProjectListOptions) => {
    await runProjectList(options)
  })

  applyProjectContextOptions(
    cmd.command('get')
      .description('Get a project by id')
      .requiredOption('--id <id>', 'Project id'),
  ).action(async (options: ProjectGetOptions) => {
    await runProjectGet(options)
  })

  applyWriteGuards(applyJsonSeedOption(applyProjectContextOptions(
    cmd.command('create')
      .description('Create a project')
      .requiredOption('--name <text>', 'Project name')
      .option('--description <text>', 'Project description')
      .option('--slug <text>', 'Project slug')
      .option('--status <status>', 'Project status')
      .option('--visibility <visibility>', 'Project visibility')
      .option('--project-type <type>', 'Project type'),
  ))).action(async (options: ProjectCreateOptions) => {
    await runProjectCreate(options)
  })

  applyWriteGuards(applyJsonSeedOption(applyProjectContextOptions(
    cmd.command('update')
      .description('Update a project')
      .requiredOption('--id <id>', 'Project id')
      .option('--name <text>', 'Project name')
      .option('--description <text>', 'Project description')
      .option('--slug <text>', 'Project slug')
      .option('--status <status>', 'Project status')
      .option('--visibility <visibility>', 'Project visibility')
      .option('--project-type <type>', 'Project type'),
  ))).action(async (options: ProjectUpdateOptions) => {
    await runProjectUpdate(options)
  })

  applyWriteGuards(applyProjectContextOptions(
    cmd.command('delete')
      .description('Delete a project')
      .requiredOption('--id <id>', 'Project id'),
  ), { destructive: true }).action(async (options: ProjectDeleteOptions) => {
    await runProjectDelete(options)
  })

  applyWriteGuards(applyProjectContextOptions(
    cmd.command('link')
      .description('Link a hosted project slug into the repo project registry')
      .requiredOption('--slug <slug>', 'Hosted project slug')
      .requiredOption('--mode <mode>', 'Authoring mode: local or hosted-only')
      .option('--local-root <path>', 'Local repo-first root for --mode local')
      .option('--owner-repo <name>', 'Optional owner repo metadata')
      .option('--parent-project-slug <slug>', 'Optional parent project slug metadata'),
  )).action(async (options: ProjectLinkOptions) => {
    await runProjectLink(options)
  })

  applyProjectContextOptions(
    cmd.command('migrate-local-root')
      .description('Plan or apply flat .aops projectman/agentspace migration into .aops/projects/<slug>')
      .requiredOption('--project-slug <slug>', 'Repo project slug to migrate')
      .requiredOption('--local-root <path>', 'Target local root, normally .aops/projects/<slug>')
      .option('--dry-run', 'Build the migration summary without mutating files')
      .option('--apply', 'Apply the migration after dry-run review')
      .option('--confirm', 'Required with --apply because flat roots are moved to an archive')
      .option('--timestamp <value>', 'Optional deterministic archive timestamp for tests/replay'),
  ).action(async (options: ProjectMigrateLocalRootOptions) => {
    await runProjectMigrateLocalRoot(options)
  })

  const links = cmd.command('links').description('List repo project registry links')
  applyProjectContextOptions(
    links.command('list')
      .description('List project links from .aops/aops.config.json'),
  ).action(async (options: ProjectLinksListOptions) => {
    await runProjectLinksList(options)
  })

  cmd.addHelpText(
    'after',
    buildOperatorCookbook({
      examples: [
        'aops-cli project list --json',
        'aops-cli project get --id <project-id> --json',
        'aops-cli project create --name "Demo Project" --apply --json',
        'aops-cli project update --id <project-id> --project-type app --apply --json',
        'aops-cli project link --slug aops-cockpit --mode hosted-only --apply --json',
        'aops-cli project migrate-local-root --project-slug aops --local-root .aops/projects/aops --dry-run --json',
        'aops-cli project links list --json',
      ],
      guide: GUIDE_PATHS.agentspace,
      notes: [
        'Project list/get are read-only. Create/update/delete follow the standard hosted write guards.',
        'project link mutates only the repo project registry after verifying the hosted project exists and is not archived/deleted.',
        'project migrate-local-root is repo-local; run --dry-run first and require --apply --confirm for the real move.',
      ],
    }),
  )

  return cmd
}
