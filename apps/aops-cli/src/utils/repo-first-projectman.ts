import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'

import { compactPayload, normalizeNonEmpty } from './command.js'
import {
  parseFrontmatterDocument,
  renderFrontmatterDocument,
} from './memory-workspace.js'
import type { ResolvedProjectBindingContext } from './project-context.js'
import { resolveRepoFirstWorkspaceRelativeRoot, resolveRepoFirstWorkspaceRoot, type RepoFirstStorageContext } from './repo-first-storage.js'
import { writeFileWithRetry } from './transient-fs.js'

type RepoRecord = {
  filePath: string
  frontmatter: Record<string, unknown>
  body: string
}

type RepoFirstContext = Pick<ResolvedProjectBindingContext, 'repoRoot' | 'projectId' | 'scopeId' | 'projectName' | 'localRoot'>

const SYNC_STATES = new Set(['local', 'synced', 'dirty', 'deleted', 'conflict'])

function hashContent(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function isAopsArchivePath(filePath: string): boolean {
  const parts = filePath.split(path.sep)
  const aopsIndex = parts.lastIndexOf('.aops')
  return aopsIndex >= 0 && parts[aopsIndex + 1] === 'archive'
}

function comparableRecordHash(record: RepoRecord): string {
  const frontmatter = { ...record.frontmatter }
  delete frontmatter.baseHash
  return hashContent(renderFrontmatterDocument(frontmatter, record.body))
}

function isProjectmanTombstoneRecord(record: RepoRecord): boolean {
  return record.filePath.includes(`${path.sep}tombstones${path.sep}`)
}

function effectiveSyncState(record: RepoRecord): string {
  const syncState = ensureSyncState(record.frontmatter.syncState)
  if (syncState === 'synced' && isProjectmanTombstoneRecord(record)) return 'synced'
  const baseHash = normalizeNonEmpty(record.frontmatter.baseHash)
  if (syncState === 'synced' && baseHash && comparableRecordHash(record) !== baseHash) return 'dirty'
  return syncState
}

function ensureSyncState(value: unknown): string {
  const normalized = normalizeNonEmpty(value)
  return normalized && SYNC_STATES.has(normalized) ? normalized : 'local'
}

export function resolveRepoFirstProjectmanPaths(context: RepoFirstStorageContext): Record<string, string> {
  const root = path.join(resolveRepoFirstWorkspaceRoot(context), 'projectman')
  return {
    root,
    boards: path.join(root, 'boards'),
    tasks: path.join(root, 'kanban-tasks'),
    sprints: path.join(root, 'sprints'),
    utasks: path.join(root, 'utasks'),
    issues: path.join(root, 'issues'),
    feedback: path.join(root, 'feedback'),
    reviewRequests: path.join(root, 'review-requests'),
    tombstones: path.join(root, 'tombstones'),
    views: path.join(root, 'views'),
  }
}

export function resolveRepoFirstAgentspacePaths(context: RepoFirstStorageContext): Record<string, string> {
  const root = path.join(resolveRepoFirstWorkspaceRoot(context), 'agentspace')
  const discussions = path.join(root, 'discussions')
  const memory = path.join(root, 'memory')
  const experience = path.join(root, 'experience')
  return {
    root,
    discussions,
    discussionTopics: path.join(discussions, 'topics'),
    experience,
    experienceItems: path.join(experience, 'items'),
    experienceViews: path.join(experience, 'views'),
    memory,
    memoryItems: path.join(memory, 'items'),
    memoryViews: path.join(memory, 'views'),
    synopsis: path.join(root, 'synopsis.md'),
  }
}

function entityDir(context: RepoFirstStorageContext, entityType: string): string {
  const paths = resolveRepoFirstProjectmanPaths(context)
  switch (entityType) {
    case 'projectman.board':
      return paths.boards
    case 'projectman.kanban-task':
      return paths.tasks
    case 'projectman.sprint':
      return paths.sprints
    case 'projectman.issue':
      return paths.issues
    case 'projectman.feedback':
      return paths.feedback
    case 'projectman.review-request':
      return paths.reviewRequests
    default:
      throw new Error(`Unsupported Projectman entity type "${entityType}".`)
  }
}

async function readMarkdownRecords(rootDir: string, params: { recursive?: boolean } = {}): Promise<RepoRecord[]> {
  try {
    const entries = await fs.readdir(rootDir, { withFileTypes: true })
    const records: RepoRecord[] = []
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const filePath = path.join(rootDir, entry.name)
      if (isAopsArchivePath(filePath)) continue
      if (entry.isDirectory() && params.recursive === true) {
        records.push(...await readMarkdownRecords(filePath, params))
        continue
      }
      if (!entry.isFile() || !entry.name.endsWith('.md')) continue
      const raw = await fs.readFile(filePath, 'utf8')
      const parsed = parseFrontmatterDocument(raw)
      records.push({ filePath, frontmatter: parsed.frontmatter, body: parsed.body })
    }
    return records
  } catch {
    return []
  }
}

async function readEntityRecords(context: RepoFirstContext, entityType: string): Promise<RepoRecord[]> {
  if (entityType === 'projectman.utask') {
    return readMarkdownRecords(resolveRepoFirstProjectmanPaths(context).utasks, { recursive: true })
  }
  return readMarkdownRecords(entityDir(context, entityType))
}

function materializeRecord(record: RepoRecord): Record<string, unknown> {
  const archivedAt = normalizeNonEmpty(record.frontmatter.archivedAt)
  return compactPayload({
    ...record.frontmatter,
    id: normalizeNonEmpty(record.frontmatter.localId) ?? normalizeNonEmpty(record.frontmatter.id),
    archivedAt,
    archived: Boolean(archivedAt),
    body: record.body,
  })
}

async function listEntities(context: RepoFirstContext, entityType: string): Promise<Record<string, unknown>[]> {
  return (await readEntityRecords(context, entityType)).map(materializeRecord)
}

export async function rebuildProjectmanViews(context: RepoFirstContext): Promise<void> {
  const paths = resolveRepoFirstProjectmanPaths(context)
  const [boards, tasks, sprints, issues, feedback, reviewRequests] = await Promise.all([
    listEntities(context, 'projectman.board'),
    listEntities(context, 'projectman.kanban-task'),
    listEntities(context, 'projectman.sprint'),
    listEntities(context, 'projectman.issue'),
    listEntities(context, 'projectman.feedback'),
    listEntities(context, 'projectman.review-request'),
  ])
  const sourceRoot = `${resolveRepoFirstWorkspaceRelativeRoot(context)}/projectman/**`
  const lines = [
    '# Projectman Workspace (read-only local cache)',
    '',
    `> Read-only local cache of hosted Projectman records, mirrored under \`${sourceRoot}\`. The server is the source of truth.`,
    '',
    `- Boards: ${boards.length}`,
    `- Kanban Tasks: ${tasks.length}`,
    `- Sprints: ${sprints.length}`,
    `- Issues: ${issues.length}`,
    `- Feedback: ${feedback.length}`,
    `- Review requests: ${reviewRequests.length}`,
    '',
    '## Boards',
    ...boards.map((board) => `- ${normalizeNonEmpty(board.name) ?? normalizeNonEmpty(board.slug) ?? normalizeNonEmpty(board.id)}`),
    '',
    '## Active Tasks',
    ...tasks.map((task) => `- ${normalizeNonEmpty(task.title) ?? normalizeNonEmpty(task.id)} — ${normalizeNonEmpty(task.columnSlug) ?? 'unknown'}`),
  ]
  await fs.mkdir(paths.views, { recursive: true })
  await writeFileWithRetry(path.join(paths.views, 'index.md'), `${lines.join('\n')}\n`, 'utf8')
}

export async function collectRepoFirstSyncRecords(context: RepoFirstStorageContext): Promise<Array<Record<string, unknown>>> {
  const repoRoot = typeof context === 'string' ? context : context.repoRoot
  const projectman = resolveRepoFirstProjectmanPaths(context)
  const agentspace = resolveRepoFirstAgentspacePaths(context)
  const records = [
    ...await readMarkdownRecords(projectman.boards),
    ...await readMarkdownRecords(projectman.tasks),
    ...await readMarkdownRecords(projectman.sprints),
    ...await readMarkdownRecords(projectman.utasks, { recursive: true }),
    ...await readMarkdownRecords(projectman.issues),
    ...await readMarkdownRecords(projectman.feedback),
    ...await readMarkdownRecords(projectman.reviewRequests),
    ...await readMarkdownRecords(projectman.tombstones, { recursive: true }),
    ...await readMarkdownRecords(agentspace.experienceItems),
    ...await readMarkdownRecords(agentspace.memoryItems),
  ]
  return records.map((record) => {
    const declaredSyncState = ensureSyncState(record.frontmatter.syncState)
    const currentSyncState = effectiveSyncState(record)
    return compactPayload({
      path: path.relative(repoRoot, record.filePath).split(path.sep).join('/'),
      entityType: normalizeNonEmpty(record.frontmatter.entityType),
      localId: normalizeNonEmpty(record.frontmatter.localId),
      remoteId: normalizeNonEmpty(record.frontmatter.remoteId),
      syncState: currentSyncState,
      declaredSyncState: declaredSyncState !== currentSyncState ? declaredSyncState : undefined,
      hash: hashContent(renderFrontmatterDocument(record.frontmatter, record.body)),
    })
  })
}
