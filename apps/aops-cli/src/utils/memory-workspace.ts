import { randomUUID } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'

import { compactPayload, normalizeNonEmpty } from './command.js'
import { resolveRepoFirstWorkspaceRoot, type RepoFirstStorageContext } from './repo-first-storage.js'
import { writeFileWithRetry } from './transient-fs.js'

const MEMORY_WORKSPACE_LOCK_RETRY_MS = 75
const MEMORY_WORKSPACE_LOCK_TIMEOUT_MS = 15_000
const MEMORY_WORKSPACE_LOCK_STALE_MS = 30_000

export type MemoryWorkspaceEntry = {
  id?: string
  memoryId?: string
  kind?: string
  durability?: string
  subjectType?: string
  subjectId?: string
  subjectTitle?: string
  projectId?: string
  importance?: number
  createdAt?: string
  updatedAt?: string
  nextAction?: string
  validationState?: string
  sourceRefs?: unknown[]
  nextReadRefs?: unknown[]
  purpose: string[]
  areas: string[]
  status: string[]
  tags: string[]
  storage?: string
  content: string
  raw?: Record<string, unknown>
}

export type MemoryWorkspaceResumePack = {
  resumeSummary?: string
  readStrategy?: string
  relatedMemory: Record<string, unknown>[]
  bootstrapGuidance: string[]
}

export type MemoryWorkspacePaths = {
  rootDir: string
  localDir: string
  localItemsDir: string
}

export type MemoryWorkspaceFile = {
  relativePath: string
  content: string
  itemId?: string
}

type MemoryWorkspaceOwnerKey = 'project' | 'ktask' | 'sprint' | 'phase' | 'utask' | 'issue' | 'feedback'

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function toStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((entry) => normalizeNonEmpty(entry)).filter((entry): entry is string => Boolean(entry))
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

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'item'
}

function computeTimestampForFile(isoValue?: string): string {
  const date = isoValue ? new Date(isoValue) : new Date()
  if (Number.isNaN(date.getTime())) return 'unknown-time'
  const year = String(date.getUTCFullYear())
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(date.getUTCDate()).padStart(2, '0')
  const hour = String(date.getUTCHours()).padStart(2, '0')
  const minute = String(date.getUTCMinutes()).padStart(2, '0')
  const second = String(date.getUTCSeconds()).padStart(2, '0')
  return `${year}${month}${day}-${hour}${minute}${second}`
}

function encodeFrontmatterValue(value: unknown): string {
  return JSON.stringify(value)
}

export function renderFrontmatterDocument(frontmatter: Record<string, unknown>, body: string): string {
  const lines = ['---']
  Object.entries(frontmatter).forEach(([key, value]) => {
    if (value === undefined) return
    lines.push(`${key}: ${encodeFrontmatterValue(value)}`)
  })
  lines.push('---', '')
  return `${lines.join('\n')}${body.trim() ? `${body.trim()}\n` : ''}`
}

export function parseFrontmatterDocument(content: string): { frontmatter: Record<string, unknown>; body: string } {
  const normalized = content.replace(/\r\n/g, '\n')
  if (!normalized.startsWith('---\n')) {
    return { frontmatter: {}, body: normalized.trim() }
  }

  const endIndex = normalized.indexOf('\n---\n', 4)
  if (endIndex < 0) {
    return { frontmatter: {}, body: normalized.trim() }
  }

  const rawFrontmatter = normalized.slice(4, endIndex)
  const body = normalized.slice(endIndex + 5)
  const frontmatter: Record<string, unknown> = {}
  for (const line of rawFrontmatter.split('\n')) {
    const separator = line.indexOf(':')
    if (separator < 0) continue
    const key = line.slice(0, separator).trim()
    const rawValue = line.slice(separator + 1).trim()
    if (!key) continue
    if (!rawValue) {
      frontmatter[key] = ''
      continue
    }
    try {
      frontmatter[key] = JSON.parse(rawValue)
    } catch {
      frontmatter[key] = rawValue
    }
  }

  return { frontmatter, body: body.trim() }
}

export function normalizeHostedMemoryProjection(record: Record<string, unknown>, projectId?: string): MemoryWorkspaceEntry {
  const meta = isRecord(record.meta) ? record.meta : {}
  const subjectType = normalizeNonEmpty(meta.subjectType) ?? normalizeNonEmpty(record.sourceType)
  const subjectId = normalizeNonEmpty(meta.subjectId) ?? normalizeNonEmpty(record.sourceId)
  const subjectTitle = normalizeNonEmpty(meta.subjectTitle)
  const areas = uniqueStrings([...toStringArray(meta.areas), normalizeNonEmpty(meta.area)])
  const statuses = uniqueStrings([...toStringArray(meta.status), normalizeNonEmpty(meta.status)])
  return {
    id: normalizeNonEmpty(record.id),
    memoryId: normalizeNonEmpty(record.id),
    kind: normalizeNonEmpty(record.kind),
    durability: normalizeNonEmpty(record.durability),
    subjectType,
    subjectId,
    subjectTitle,
    projectId: normalizeNonEmpty(meta.projectId) ?? projectId,
    importance: typeof record.importance === 'number' ? record.importance : undefined,
    createdAt: normalizeNonEmpty(record.createdAt),
    updatedAt: normalizeNonEmpty(record.updatedAt),
    nextAction: normalizeNonEmpty(meta.nextAction),
    validationState: normalizeNonEmpty(meta.validationState),
    sourceRefs: Array.isArray(meta.sourceRefs) ? meta.sourceRefs : undefined,
    nextReadRefs: Array.isArray(meta.nextReadRefs) ? meta.nextReadRefs : undefined,
    purpose: toStringArray(meta.purpose),
    areas,
    status: statuses,
    tags: toStringArray(record.tags),
    storage: 'hosted',
    content: normalizeNonEmpty(record.content) ?? '',
    raw: record,
  }
}

export function normalizeLocalMemoryEntry(
  frontmatter: Record<string, unknown>,
  body: string,
): MemoryWorkspaceEntry {
  return {
    id: normalizeNonEmpty(frontmatter.memoryId) ?? normalizeNonEmpty(frontmatter.localId),
    memoryId: normalizeNonEmpty(frontmatter.memoryId) ?? normalizeNonEmpty(frontmatter.localId),
    kind: normalizeNonEmpty(frontmatter.kind),
    durability: normalizeNonEmpty(frontmatter.durability),
    subjectType: normalizeNonEmpty(frontmatter.subjectType),
    subjectId: normalizeNonEmpty(frontmatter.subjectId),
    subjectTitle: normalizeNonEmpty(frontmatter.subjectTitle),
    projectId: normalizeNonEmpty(frontmatter.projectId),
    importance: typeof frontmatter.importance === 'number' ? frontmatter.importance : undefined,
    createdAt: normalizeNonEmpty(frontmatter.createdAt),
    updatedAt: normalizeNonEmpty(frontmatter.updatedAt),
    nextAction: normalizeNonEmpty(frontmatter.nextAction),
    validationState: normalizeNonEmpty(frontmatter.validationState),
    sourceRefs: Array.isArray(frontmatter.sourceRefs) ? frontmatter.sourceRefs : undefined,
    nextReadRefs: Array.isArray(frontmatter.nextReadRefs) ? frontmatter.nextReadRefs : undefined,
    purpose: toStringArray(frontmatter.purpose),
    areas: toStringArray(frontmatter.areas),
    status: toStringArray(frontmatter.status),
    tags: toStringArray(frontmatter.tags),
    storage: normalizeNonEmpty(frontmatter.storage) ?? 'local-cache',
    content: body.trim(),
    raw: frontmatter,
  }
}

export function buildMemoryFrontmatter(entry: MemoryWorkspaceEntry): Record<string, unknown> {
  const raw = entry.raw ?? {}
  return compactPayload({
    ...raw,
    schemaVersion: 2,
    entityType: 'agentspace.memory-item',
    localId: entry.memoryId ?? entry.id,
    memoryId: entry.memoryId ?? entry.id,
    remoteId: normalizeNonEmpty(raw.remoteId),
    kind: entry.kind,
    durability: entry.durability,
    subjectType: entry.subjectType,
    subjectId: entry.subjectId,
    subjectTitle: entry.subjectTitle,
    projectId: entry.projectId,
    scopeId: normalizeNonEmpty(raw.scopeId),
    importance: entry.importance,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
    nextAction: entry.nextAction,
    validationState: entry.validationState,
    sourceRefs: entry.sourceRefs,
    nextReadRefs: entry.nextReadRefs,
    purpose: entry.purpose.length > 0 ? entry.purpose : undefined,
    areas: entry.areas.length > 0 ? entry.areas : undefined,
    status: entry.status.length > 0 ? entry.status : undefined,
    tags: entry.tags.length > 0 ? entry.tags : undefined,
    syncState: normalizeNonEmpty(entry.raw?.syncState) ?? 'local',
    remoteUpdatedAt: normalizeNonEmpty(raw.remoteUpdatedAt),
    lastPulledAt: normalizeNonEmpty(raw.lastPulledAt),
    lastPushedAt: normalizeNonEmpty(raw.lastPushedAt),
    baseHash: normalizeNonEmpty(raw.baseHash),
    storage: entry.storage ?? 'local-cache',
  })
}

export function buildMemoryItemDocument(entry: MemoryWorkspaceEntry): string {
  return renderFrontmatterDocument(buildMemoryFrontmatter(entry), entry.content)
}

export function buildMemoryFilename(entry: MemoryWorkspaceEntry): string {
  const timestamp = computeTimestampForFile(entry.createdAt ?? entry.updatedAt)
  const kind = slugify(entry.kind ?? 'memory')
  const subject = slugify((entry.subjectType ?? 'subject').replace(/\./g, '-'))
  const shortId = (entry.memoryId ?? entry.id ?? randomUUID()).slice(0, 8)
  return `${timestamp}-${kind}-${subject}-${shortId}.md`
}

function summarizeContent(content: string, maxLength = 120): string {
  const compact = content.replace(/\s+/g, ' ').trim()
  if (compact.length <= maxLength) return compact || 'No content.'
  return `${compact.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`
}

function buildItemLinkLine(rootRelativePath: string, entry: MemoryWorkspaceEntry): string {
  const subjectLabel = entry.subjectTitle
    ? `${entry.subjectType ?? 'subject'} (${entry.subjectTitle})`
    : (entry.subjectType ?? 'subject')
  const parts = [
    entry.kind ?? 'memory',
    entry.durability ?? 'durable',
    subjectLabel,
    entry.updatedAt ?? entry.createdAt ?? 'unknown',
  ]
  if (entry.importance !== undefined) parts.push(`importance=${entry.importance}`)
  return `- [${entry.kind ?? 'memory'} / ${subjectLabel}](${rootRelativePath}) — ${parts.join(' — ')}\n  ${summarizeContent(entry.content)}`
}

function buildCollectionMarkdown(title: string, intro: string, items: Array<{ linkPath: string; entry: MemoryWorkspaceEntry }>): string {
  const lines = [`# ${title}`, '', `> ${intro}`, '']
  if (items.length === 0) {
    lines.push('- No projected memory items in this view.')
    return `${lines.join('\n')}\n`
  }
  items.forEach(({ linkPath, entry }) => {
    lines.push(buildItemLinkLine(linkPath, entry))
  })
  return `${lines.join('\n')}\n`
}

function buildSubjectViewFileName(subjectType?: string, subjectId?: string): string {
  return `${slugify((subjectType ?? 'subject').replace(/\./g, '-'))}-${slugify(subjectId ?? 'unknown')}.md`
}

function classifyOwner(subjectType?: string): MemoryWorkspaceOwnerKey | undefined {
  switch ((subjectType ?? '').toLowerCase()) {
    case 'projectman.plan':
      return 'project'
    case 'projectman.kanban-task':
      return 'ktask'
    case 'projectman.sprint':
      return 'sprint'
    case 'projectman.phase':
      return 'phase'
    case 'projectman.microtask':
      return 'utask'
    case 'projectman.issue':
      return 'issue'
    case 'projectman.feedback':
      return 'feedback'
    default:
      return undefined
  }
}

function classifyFlow(entry: MemoryWorkspaceEntry): string | undefined {
  const kind = (entry.kind ?? '').toLowerCase()
  if (kind === 'checkpoint') return 'checkpoint'
  if (kind === 'constraint') return 'blocker'
  if (kind === 'resume') return 'resume'
  if (['kickoff', 'closeout', 'decision', 'rule', 'note'].includes(kind)) return kind
  return undefined
}

function sortEntries(items: MemoryWorkspaceEntry[]): MemoryWorkspaceEntry[] {
  return [...items].sort((left, right) =>
    (right.updatedAt ?? right.createdAt ?? '').localeCompare(left.updatedAt ?? left.createdAt ?? ''),
  )
}

function buildWorkspaceIndexMarkdown(params: {
  title: string
  intro: string
  items: MemoryWorkspaceEntry[]
  resumePack?: MemoryWorkspaceResumePack
}): string {
  const lines = [`# ${params.title}`, '', `> ${params.intro}`, '']
  if (params.resumePack) {
    lines.push('## Resume Summary', params.resumePack.resumeSummary?.trim() || 'No project resume summary available.', '')
    lines.push('## Sticky Guidance')
    if (params.resumePack.bootstrapGuidance.length === 0) {
      lines.push('- No sticky guidance available.')
    } else {
      params.resumePack.bootstrapGuidance.forEach((entry) => lines.push(`- ${entry}`))
    }
    lines.push('')
  }

  lines.push('## Quick Views')
  lines.push(`- [Sticky Memory](sticky.md) — ${params.items.filter((entry) => entry.durability === 'sticky').length} item(s)`)
  lines.push(`- [Recent Memory](recent.md) — ${Math.min(10, params.items.length)} item(s)`)
  lines.push('- [By Durability](by-durability/short.md) / [durable](by-durability/durable.md) / [sticky](by-durability/sticky.md)')
  lines.push('- [By Flow](by-flow/handoff.md) / [kickoff](by-flow/kickoff.md) / [closeout](by-flow/closeout.md)')
  lines.push('- [By Owner](by-owner/project.md) / [sprint](by-owner/sprint.md) / [ktask](by-owner/ktask.md)')
  lines.push('', '## Projected Memory Items')
  if (params.items.length === 0) {
    lines.push('- No memory items available.')
  } else {
    sortEntries(params.items).forEach((entry) => {
      lines.push(buildItemLinkLine(path.join('items', buildMemoryFilename(entry)).split(path.sep).join('/'), entry))
    })
  }

  return `${lines.join('\n')}\n`
}

export function resolveMemoryWorkspacePaths(context: RepoFirstStorageContext): MemoryWorkspacePaths {
  const rootDir = path.join(resolveRepoFirstWorkspaceRoot(context), 'agentspace', 'memory')
  return {
    rootDir,
    localDir: rootDir,
    localItemsDir: path.join(rootDir, 'items'),
  }
}

export function buildMemoryWorkspaceFiles(params: {
  items: MemoryWorkspaceEntry[]
  resumePack?: MemoryWorkspaceResumePack
}): MemoryWorkspaceFile[] {
  const sourceItems = sortEntries(params.items)
  const files: MemoryWorkspaceFile[] = []
  const itemRelativePaths = new Map<string, string>()

  for (const entry of sourceItems) {
    const itemFileName = buildMemoryFilename(entry)
    itemRelativePaths.set(entry.memoryId ?? entry.id ?? itemFileName, path.join('items', itemFileName).split(path.sep).join('/'))
    files.push({
      relativePath: path.join('items', itemFileName).split(path.sep).join('/'),
      content: buildMemoryItemDocument(entry),
      itemId: entry.memoryId ?? entry.id,
    })
  }

  const toLinks = (items: MemoryWorkspaceEntry[]) =>
    sortEntries(items).map((entry) => ({
      linkPath: itemRelativePaths.get(entry.memoryId ?? entry.id ?? '') ?? path.join('items', buildMemoryFilename(entry)).split(path.sep).join('/'),
      entry,
    }))

  files.push({
    relativePath: 'index.md',
    content: buildWorkspaceIndexMarkdown({
      title: 'Local Memory Cache',
      intro: 'Read-only local memory cache (the hosted server is the source of truth). `items/*.md` is a cache mirror refreshed by `sync pull`; edits here are not pushed back.',
      items: sourceItems,
      resumePack: params.resumePack,
    }),
  })

  files.push({
    relativePath: 'sticky.md',
    content: buildCollectionMarkdown(
      'Sticky Memory',
      'Local cache of sticky memory for project bootstrap (hosted server is the source of truth).',
      toLinks(sourceItems.filter((entry) => entry.durability === 'sticky')),
    ),
  })

  files.push({
    relativePath: 'recent.md',
    content: buildCollectionMarkdown(
      'Recent Memory',
      'Most recently updated cached memory items (hosted server is the source of truth).',
      toLinks(sourceItems.slice(0, 10)),
    ),
  })

  const durabilityBuckets: Array<'short' | 'durable' | 'sticky'> = ['short', 'durable', 'sticky']
  for (const bucket of durabilityBuckets) {
    files.push({
      relativePath: path.join('by-durability', `${bucket}.md`).split(path.sep).join('/'),
      content: buildCollectionMarkdown(
        `Durability: ${bucket}`,
        `Grouped by durability = ${bucket}.`,
        toLinks(sourceItems.filter((entry) => (entry.durability ?? '').toLowerCase() === bucket)),
      ),
    })
  }

  const flowBuckets = [
    { key: 'kickoff', title: 'Flow: kickoff', predicate: (entry: MemoryWorkspaceEntry) => classifyFlow(entry) === 'kickoff' },
    { key: 'handoff', title: 'Flow: handoff', predicate: (entry: MemoryWorkspaceEntry) => classifyFlow(entry) === 'resume' },
    { key: 'closeout', title: 'Flow: closeout', predicate: (entry: MemoryWorkspaceEntry) => classifyFlow(entry) === 'closeout' },
    { key: 'decision', title: 'Flow: decision', predicate: (entry: MemoryWorkspaceEntry) => classifyFlow(entry) === 'decision' },
    { key: 'blocker', title: 'Flow: blocker', predicate: (entry: MemoryWorkspaceEntry) => classifyFlow(entry) === 'blocker' },
    { key: 'checkpoint', title: 'Flow: checkpoint', predicate: (entry: MemoryWorkspaceEntry) => classifyFlow(entry) === 'checkpoint' },
    { key: 'rule', title: 'Flow: rule', predicate: (entry: MemoryWorkspaceEntry) => classifyFlow(entry) === 'rule' },
    { key: 'note', title: 'Flow: note', predicate: (entry: MemoryWorkspaceEntry) => classifyFlow(entry) === 'note' },
    { key: 'resume', title: 'Flow: resume', predicate: (entry: MemoryWorkspaceEntry) => classifyFlow(entry) === 'resume' },
  ]
  for (const bucket of flowBuckets) {
    files.push({
      relativePath: path.join('by-flow', `${bucket.key}.md`).split(path.sep).join('/'),
      content: buildCollectionMarkdown(bucket.title, `Grouped by flow bucket = ${bucket.key}.`, toLinks(sourceItems.filter(bucket.predicate))),
    })
  }

  const owners: MemoryWorkspaceOwnerKey[] = ['project', 'ktask', 'sprint', 'phase', 'utask', 'issue', 'feedback']
  for (const owner of owners) {
    files.push({
      relativePath: path.join('by-owner', `${owner}.md`).split(path.sep).join('/'),
      content: buildCollectionMarkdown(
        `Owner: ${owner}`,
        `Grouped by owner bucket = ${owner}.`,
        toLinks(sourceItems.filter((entry) => classifyOwner(entry.subjectType) === owner)),
      ),
    })
  }

  const subjectGroups = new Map<string, MemoryWorkspaceEntry[]>()
  for (const entry of sourceItems) {
    const key = `${entry.subjectType ?? 'subject'}::${entry.subjectId ?? 'unknown'}`
    const bucket = subjectGroups.get(key) ?? []
    bucket.push(entry)
    subjectGroups.set(key, bucket)
  }
  for (const [key, items] of subjectGroups.entries()) {
    const [subjectType, subjectId] = key.split('::')
    const subjectTitle = items.find((entry) => entry.subjectTitle)?.subjectTitle
    files.push({
      relativePath: path.join('subjects', buildSubjectViewFileName(subjectType, subjectId)).split(path.sep).join('/'),
      content: buildCollectionMarkdown(
        `Subject Memory: ${subjectType}${subjectTitle ? ` / ${subjectTitle}` : ` / ${subjectId}`}`,
        'Grouped memory for a single subject.',
        toLinks(items),
      ),
    })
  }

  return files
}

export async function writeMemoryWorkspaceFiles(baseDir: string, files: MemoryWorkspaceFile[]): Promise<void> {
  await withMemoryWorkspaceViewLock(baseDir, async () => {
    await fs.rm(path.join(baseDir, 'by-durability'), { recursive: true, force: true })
    await fs.rm(path.join(baseDir, 'by-flow'), { recursive: true, force: true })
    await fs.rm(path.join(baseDir, 'by-owner'), { recursive: true, force: true })
    await fs.rm(path.join(baseDir, 'subjects'), { recursive: true, force: true })
    const expectedPaths = new Set<string>()
    for (const file of files) {
      const filePath = path.join(baseDir, file.relativePath)
      expectedPaths.add(filePath)
      await fs.mkdir(path.dirname(filePath), { recursive: true })
      await writeFileWithRetry(filePath, file.content, 'utf8')
    }

    for (const child of ['by-durability', 'by-flow', 'by-owner', 'subjects']) {
      await fs.mkdir(path.join(baseDir, child), { recursive: true })
    }

    const staleRoots = ['index.md', 'sticky.md', 'recent.md']
    for (const fileName of staleRoots) {
      if (expectedPaths.has(path.join(baseDir, fileName))) continue
      await fs.rm(path.join(baseDir, fileName), { force: true })
    }
  })
}

async function acquireMemoryWorkspaceViewLock(baseDir: string): Promise<() => Promise<void>> {
  await fs.mkdir(baseDir, { recursive: true })
  const lockDir = path.join(baseDir, '.views.lock')
  const startedAt = Date.now()

  for (;;) {
    try {
      await fs.mkdir(lockDir)
      await writeFileWithRetry(
        path.join(lockDir, 'owner.json'),
        `${JSON.stringify({ pid: process.pid, createdAt: new Date().toISOString() })}\n`,
        'utf8',
      )
      return async () => {
        await fs.rm(lockDir, { recursive: true, force: true })
      }
    } catch (error) {
      const code = typeof error === 'object' && error !== null && 'code' in error ? normalizeNonEmpty((error as { code?: unknown }).code) : undefined
      if (code !== 'EEXIST') throw error

      const stats = await fs.stat(lockDir).catch(() => null)
      if (stats && Date.now() - stats.mtimeMs > MEMORY_WORKSPACE_LOCK_STALE_MS) {
        await fs.rm(lockDir, { recursive: true, force: true }).catch(() => undefined)
        continue
      }

      if (Date.now() - startedAt > MEMORY_WORKSPACE_LOCK_TIMEOUT_MS) {
        throw new Error('Timed out waiting for memory workspace view lock.')
      }
      await delay(MEMORY_WORKSPACE_LOCK_RETRY_MS)
    }
  }
}

async function withMemoryWorkspaceViewLock<T>(baseDir: string, fn: () => Promise<T>): Promise<T> {
  const release = await acquireMemoryWorkspaceViewLock(baseDir)
  try {
    return await fn()
  } finally {
    await release()
  }
}

export async function readLocalMemoryEntries(itemsDir: string): Promise<MemoryWorkspaceEntry[]> {
  const files = await readLocalMemoryEntryFiles(itemsDir)
  return sortEntries(files.map((entry) => entry.entry))
}

export async function readLocalMemoryEntryFiles(
  itemsDir: string,
): Promise<Array<{ fileName: string; filePath: string; entry: MemoryWorkspaceEntry }>> {
  try {
    const files = await fs.readdir(itemsDir)
    const entries: Array<{ fileName: string; filePath: string; entry: MemoryWorkspaceEntry }> = []
    for (const fileName of files.filter((entry) => entry.endsWith('.md')).sort()) {
      const filePath = path.join(itemsDir, fileName)
      const raw = await fs.readFile(filePath, 'utf8')
      const parsed = parseFrontmatterDocument(raw)
      const entry = normalizeLocalMemoryEntry(parsed.frontmatter, parsed.body)
      entries.push({ fileName, filePath, entry })
    }
    return entries.sort((left, right) =>
      (right.entry.updatedAt ?? right.entry.createdAt ?? '').localeCompare(left.entry.updatedAt ?? left.entry.createdAt ?? ''),
    )
  } catch {
    return []
  }
}

export async function writeLocalMemoryEntryFile(itemsDir: string, entry: MemoryWorkspaceEntry): Promise<{ fileName: string; filePath: string }> {
  await fs.mkdir(itemsDir, { recursive: true })
  const fileName = buildMemoryFilename(entry)
  const filePath = path.join(itemsDir, fileName)
  await writeFileWithRetry(filePath, buildMemoryItemDocument(entry), 'utf8')
  return { fileName, filePath }
}

export async function overwriteLocalMemoryEntryFile(filePath: string, entry: MemoryWorkspaceEntry): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await writeFileWithRetry(filePath, buildMemoryItemDocument(entry), 'utf8')
}

export async function removeLocalMemoryEntryFile(itemsDir: string, memoryId: string): Promise<void> {
  try {
    const files = await fs.readdir(itemsDir)
    for (const fileName of files.filter((entry) => entry.endsWith('.md'))) {
      const raw = await fs.readFile(path.join(itemsDir, fileName), 'utf8')
      const parsed = parseFrontmatterDocument(raw)
      if (normalizeNonEmpty(parsed.frontmatter.memoryId) === memoryId) {
        await fs.rm(path.join(itemsDir, fileName), { force: true })
        return
      }
    }
  } catch {
    return
  }
}

export async function rebuildLocalMemoryWorkspace(params: {
  repoRoot: string
  localRoot?: string
  items: MemoryWorkspaceEntry[]
  resumePack?: MemoryWorkspaceResumePack
}): Promise<void> {
  const paths = resolveMemoryWorkspacePaths(params)
  await fs.mkdir(paths.localItemsDir, { recursive: true })
  const viewFiles = buildMemoryWorkspaceFiles({
    items: params.items,
    resumePack: params.resumePack,
  }).filter((file) => !file.relativePath.startsWith('items/'))
  await writeMemoryWorkspaceFiles(paths.localDir, viewFiles)
  await fs.mkdir(paths.rootDir, { recursive: true })
}

export function createNewLocalMemoryEntry(params: {
  kind: string
  durability: string
  content: string
  subjectType?: string
  subjectId?: string
  subjectTitle?: string
  projectId?: string
  importance?: number
  nextAction?: string
  validationState?: string
  sourceRefs?: unknown[]
  nextReadRefs?: unknown[]
  purpose?: string[]
  areas?: string[]
  status?: string[]
  tags?: string[]
  raw?: Record<string, unknown>
}): MemoryWorkspaceEntry {
  const now = new Date().toISOString()
  const id = randomUUID()
  return {
    id,
    memoryId: id,
    kind: params.kind,
    durability: params.durability,
    subjectType: params.subjectType,
    subjectId: params.subjectId,
    subjectTitle: params.subjectTitle,
    projectId: params.projectId,
    importance: params.importance,
    createdAt: now,
    updatedAt: now,
    nextAction: params.nextAction,
    validationState: params.validationState,
    sourceRefs: params.sourceRefs,
    nextReadRefs: params.nextReadRefs,
    purpose: uniqueStrings(params.purpose ?? []),
    areas: uniqueStrings(params.areas ?? []),
    status: uniqueStrings(params.status ?? []),
    tags: uniqueStrings(params.tags ?? []),
    storage: 'local-cache',
    content: params.content,
    raw: params.raw,
  }
}
