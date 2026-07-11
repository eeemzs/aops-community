import { randomUUID } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'

import { compactPayload, normalizeNonEmpty } from './command.js'
import { parseFrontmatterDocument, renderFrontmatterDocument } from './memory-workspace.js'
import { resolveRepoFirstWorkspaceRoot, type RepoFirstStorageContext } from './repo-first-storage.js'
import { writeFileWithRetry } from './transient-fs.js'

export type ExperienceType =
  | 'technique'
  | 'problem-solution'
  | 'tool'
  | 'script'
  | 'pattern'
  | 'anti-pattern'
  | 'idea'

export type ExperienceItem = {
  localId: string
  remoteId?: string
  projectId?: string
  scopeId?: string
  type: ExperienceType
  title: string
  problem?: string
  solution?: string
  areas: string[]
  stack: string[]
  commands: string[]
  files: string[]
  sourceRefs: unknown[]
  tags: string[]
  confidence?: string
  reusability?: string
  createdAt: string
  updatedAt: string
  syncState: 'local' | 'synced' | 'dirty' | 'deleted' | 'conflict'
  storage: 'local-cache'
  content: string
  raw?: Record<string, unknown>
}

export type ExperienceWorkspacePaths = {
  rootDir: string
  itemsDir: string
  viewsDir: string
}

export type ExperienceWorkspaceFile = {
  relativePath: string
  content: string
}

const EXPERIENCE_TYPES: ExperienceType[] = [
  'technique',
  'problem-solution',
  'tool',
  'script',
  'pattern',
  'anti-pattern',
  'idea',
]

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

function normalizeExperienceType(value: unknown): ExperienceType {
  const normalized = normalizeNonEmpty(value)?.toLowerCase()
  if (EXPERIENCE_TYPES.includes(normalized as ExperienceType)) return normalized as ExperienceType
  return 'technique'
}

function normalizeSyncState(value: unknown): ExperienceItem['syncState'] {
  const normalized = normalizeNonEmpty(value)
  if (normalized === 'synced' || normalized === 'dirty' || normalized === 'deleted' || normalized === 'conflict') return normalized
  return 'local'
}

function summarizeContent(content: string, maxLength = 140): string {
  const compact = content.replace(/\s+/g, ' ').trim()
  if (!compact) return 'No narrative.'
  if (compact.length <= maxLength) return compact
  return `${compact.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`
}

function sortExperienceItems(items: ExperienceItem[]): ExperienceItem[] {
  return [...items].sort((left, right) =>
    (right.updatedAt ?? right.createdAt).localeCompare(left.updatedAt ?? left.createdAt),
  )
}

function buildItemLinkLine(item: ExperienceItem, itemBasePath = '../items'): string {
  const fileName = buildExperienceFilename(item)
  const meta = [
    item.type,
    item.areas.length > 0 ? `area=${item.areas.join(', ')}` : undefined,
    item.stack.length > 0 ? `stack=${item.stack.join(', ')}` : undefined,
    item.updatedAt,
  ].filter(Boolean)
  return `- [${item.title}](${itemBasePath}/${fileName}) — ${meta.join(' — ')}\n  ${summarizeContent(item.content)}`
}

function buildCollectionMarkdown(title: string, intro: string, items: ExperienceItem[], itemBasePath = '../items'): string {
  const lines = [`# ${title}`, '', `> ${intro}`, '']
  if (items.length === 0) {
    lines.push('- No experience items in this view.')
    return `${lines.join('\n')}\n`
  }
  for (const item of sortExperienceItems(items)) {
    lines.push(buildItemLinkLine(item, itemBasePath))
  }
  return `${lines.join('\n')}\n`
}

function buildRootIndexMarkdown(items: ExperienceItem[]): string {
  const sorted = sortExperienceItems(items)
  const lines = [
    '# Local Experience Cache',
    '',
    '> AI agent experience notes: techniques, tools, scripts, problem/solution records, and reusable ideas. `items/*.md` is a read-only local cache (the hosted server is the source of truth) refreshed by `sync pull`.',
    '',
    '## Quick Views',
    `- [Recent](views/recent.md) — ${Math.min(10, sorted.length)} item(s)`,
    '- [By Type](views/by-type/technique.md) / [problem-solution](views/by-type/problem-solution.md) / [tool](views/by-type/tool.md) / [script](views/by-type/script.md)',
    '- [By Area](views/by-area/index.md)',
    '',
    '## Recent Experience',
  ]
  if (sorted.length === 0) {
    lines.push('- No experience items captured yet.')
  } else {
    for (const item of sorted.slice(0, 10)) {
      const fileName = buildExperienceFilename(item)
      lines.push(`- [${item.title}](items/${fileName}) — ${item.type} — ${item.updatedAt}`)
    }
  }
  return `${lines.join('\n')}\n`
}

export function resolveExperienceWorkspacePaths(context: RepoFirstStorageContext): ExperienceWorkspacePaths {
  const rootDir = path.join(resolveRepoFirstWorkspaceRoot(context), 'agentspace', 'experience')
  return {
    rootDir,
    itemsDir: path.join(rootDir, 'items'),
    viewsDir: path.join(rootDir, 'views'),
  }
}

export function buildExperienceFilename(item: Pick<ExperienceItem, 'createdAt' | 'updatedAt' | 'type' | 'title' | 'localId'>): string {
  const timestamp = computeTimestampForFile(item.createdAt ?? item.updatedAt)
  const type = slugify(item.type)
  const title = slugify(item.title)
  return `${timestamp}-${type}-${title}-${item.localId.slice(0, 8)}.md`
}

export function normalizeExperienceItem(frontmatter: Record<string, unknown>, body: string): ExperienceItem {
  const localId = normalizeNonEmpty(frontmatter.localId) ?? randomUUID()
  return {
    localId,
    remoteId: normalizeNonEmpty(frontmatter.remoteId),
    projectId: normalizeNonEmpty(frontmatter.projectId),
    scopeId: normalizeNonEmpty(frontmatter.scopeId),
    type: normalizeExperienceType(frontmatter.type),
    title: normalizeNonEmpty(frontmatter.title) ?? 'Untitled experience',
    problem: normalizeNonEmpty(frontmatter.problem),
    solution: normalizeNonEmpty(frontmatter.solution),
    areas: uniqueStrings(toStringArray(frontmatter.areas).concat(toStringArray(frontmatter.area))),
    stack: uniqueStrings(toStringArray(frontmatter.stack)),
    commands: uniqueStrings(toStringArray(frontmatter.commands)),
    files: uniqueStrings(toStringArray(frontmatter.files)),
    sourceRefs: Array.isArray(frontmatter.sourceRefs) ? frontmatter.sourceRefs : [],
    tags: uniqueStrings(toStringArray(frontmatter.tags)),
    confidence: normalizeNonEmpty(frontmatter.confidence),
    reusability: normalizeNonEmpty(frontmatter.reusability),
    createdAt: normalizeNonEmpty(frontmatter.createdAt) ?? new Date().toISOString(),
    updatedAt: normalizeNonEmpty(frontmatter.updatedAt) ?? normalizeNonEmpty(frontmatter.createdAt) ?? new Date().toISOString(),
    syncState: normalizeSyncState(frontmatter.syncState),
    storage: 'local-cache',
    content: body.trim(),
    raw: frontmatter,
  }
}

export function buildExperienceFrontmatter(item: ExperienceItem): Record<string, unknown> {
  return compactPayload({
    ...(item.raw ?? {}),
    schemaVersion: 2,
    entityType: 'agentspace.experience-item',
    localId: item.localId,
    remoteId: item.remoteId,
    projectId: item.projectId,
    scopeId: item.scopeId,
    type: item.type,
    title: item.title,
    problem: item.problem,
    solution: item.solution,
    areas: item.areas.length > 0 ? item.areas : undefined,
    stack: item.stack.length > 0 ? item.stack : undefined,
    commands: item.commands.length > 0 ? item.commands : undefined,
    files: item.files.length > 0 ? item.files : undefined,
    sourceRefs: item.sourceRefs.length > 0 ? item.sourceRefs : undefined,
    tags: item.tags.length > 0 ? item.tags : undefined,
    confidence: item.confidence,
    reusability: item.reusability,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    syncState: item.syncState,
    storage: item.storage,
  })
}

export function buildExperienceItemDocument(item: ExperienceItem): string {
  return renderFrontmatterDocument(buildExperienceFrontmatter(item), item.content)
}

export function createExperienceItem(params: {
  type: ExperienceType
  title: string
  content: string
  projectId?: string
  scopeId?: string
  problem?: string
  solution?: string
  areas?: string[]
  stack?: string[]
  commands?: string[]
  files?: string[]
  sourceRefs?: unknown[]
  tags?: string[]
  confidence?: string
  reusability?: string
  raw?: Record<string, unknown>
}): ExperienceItem {
  const now = new Date().toISOString()
  return {
    localId: randomUUID(),
    projectId: params.projectId,
    scopeId: params.scopeId,
    type: params.type,
    title: params.title,
    problem: params.problem,
    solution: params.solution,
    areas: uniqueStrings(params.areas ?? []),
    stack: uniqueStrings(params.stack ?? []),
    commands: uniqueStrings(params.commands ?? []),
    files: uniqueStrings(params.files ?? []),
    sourceRefs: params.sourceRefs ?? [],
    tags: uniqueStrings(params.tags ?? []),
    confidence: params.confidence,
    reusability: params.reusability,
    createdAt: now,
    updatedAt: now,
    syncState: 'local',
    storage: 'local-cache',
    content: params.content,
    raw: params.raw,
  }
}

export async function readExperienceItemFiles(
  itemsDir: string,
): Promise<Array<{ fileName: string; filePath: string; item: ExperienceItem }>> {
  try {
    const files = await fs.readdir(itemsDir)
    const entries: Array<{ fileName: string; filePath: string; item: ExperienceItem }> = []
    for (const fileName of files.filter((entry) => entry.endsWith('.md')).sort()) {
      const filePath = path.join(itemsDir, fileName)
      const raw = await fs.readFile(filePath, 'utf8')
      const parsed = parseFrontmatterDocument(raw)
      entries.push({ fileName, filePath, item: normalizeExperienceItem(parsed.frontmatter, parsed.body) })
    }
    return entries.sort((left, right) =>
      (right.item.updatedAt ?? right.item.createdAt).localeCompare(left.item.updatedAt ?? left.item.createdAt),
    )
  } catch {
    return []
  }
}

export async function readExperienceItems(itemsDir: string): Promise<ExperienceItem[]> {
  const files = await readExperienceItemFiles(itemsDir)
  return files.map((file) => file.item)
}

export async function writeExperienceItemFile(itemsDir: string, item: ExperienceItem): Promise<{ fileName: string; filePath: string }> {
  await fs.mkdir(itemsDir, { recursive: true })
  const fileName = buildExperienceFilename(item)
  const filePath = path.join(itemsDir, fileName)
  await writeFileWithRetry(filePath, buildExperienceItemDocument(item), 'utf8')
  return { fileName, filePath }
}

export async function overwriteExperienceItemFile(filePath: string, item: ExperienceItem): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await writeFileWithRetry(filePath, buildExperienceItemDocument(item), 'utf8')
}

export async function removeExperienceItemFile(itemsDir: string, localId: string): Promise<void> {
  const files = await readExperienceItemFiles(itemsDir)
  const match = files.find((file) => file.item.localId === localId)
  if (match) await fs.rm(match.filePath, { force: true })
}

export function buildExperienceWorkspaceFiles(items: ExperienceItem[]): ExperienceWorkspaceFile[] {
  const sorted = sortExperienceItems(items)
  const files: ExperienceWorkspaceFile[] = [
    { relativePath: 'index.md', content: buildRootIndexMarkdown(sorted) },
    {
      relativePath: path.join('views', 'index.md').split(path.sep).join('/'),
      content: buildCollectionMarkdown('Experience Views', 'All cached experience records (hosted server is the source of truth).', sorted),
    },
    {
      relativePath: path.join('views', 'recent.md').split(path.sep).join('/'),
      content: buildCollectionMarkdown('Recent Experience', 'Most recently updated experience records.', sorted.slice(0, 20)),
    },
  ]

  for (const type of EXPERIENCE_TYPES) {
    files.push({
      relativePath: path.join('views', 'by-type', `${type}.md`).split(path.sep).join('/'),
      content: buildCollectionMarkdown(
        `Experience Type: ${type}`,
        `Grouped by experience type = ${type}.`,
        sorted.filter((item) => item.type === type),
        '../../items',
      ),
    })
  }

  const areas = uniqueStrings(sorted.flatMap((item) => item.areas))
  files.push({
    relativePath: path.join('views', 'by-area', 'index.md').split(path.sep).join('/'),
    content: buildCollectionMarkdown(
      'Experience Areas',
      'All experience records with area tags.',
      sorted.filter((item) => item.areas.length > 0),
      '../../items',
    ),
  })
  for (const area of areas) {
    files.push({
      relativePath: path.join('views', 'by-area', `${slugify(area)}.md`).split(path.sep).join('/'),
      content: buildCollectionMarkdown(
        `Experience Area: ${area}`,
        `Grouped by area = ${area}.`,
        sorted.filter((item) => item.areas.includes(area)),
        '../../items',
      ),
    })
  }

  return files
}

export async function rebuildExperienceWorkspace(context: RepoFirstStorageContext, items: ExperienceItem[]): Promise<void> {
  const paths = resolveExperienceWorkspacePaths(context)
  await fs.mkdir(paths.itemsDir, { recursive: true })
  await fs.rm(paths.viewsDir, { recursive: true, force: true })
  for (const file of buildExperienceWorkspaceFiles(items)) {
    const filePath = path.join(paths.rootDir, file.relativePath)
    await fs.mkdir(path.dirname(filePath), { recursive: true })
    await writeFileWithRetry(filePath, file.content, 'utf8')
  }
}

export function normalizeExperienceRecord(item: ExperienceItem): Record<string, unknown> {
  return compactPayload({
    id: item.localId,
    localId: item.localId,
    remoteId: item.remoteId,
    projectId: item.projectId,
    scopeId: item.scopeId,
    type: item.type,
    title: item.title,
    problem: item.problem,
    solution: item.solution,
    areas: item.areas,
    stack: item.stack,
    commands: item.commands,
    files: item.files,
    sourceRefs: item.sourceRefs,
    tags: item.tags,
    confidence: item.confidence,
    reusability: item.reusability,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    syncState: item.syncState,
    storage: item.storage,
    content: item.content,
  })
}
