import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'

import { normalizeNonEmpty } from './command.js'
import { parseFrontmatterDocument, renderFrontmatterDocument } from './memory-workspace.js'

export type ViewStyle = 'agent' | 'compact' | 'wide'
export type ViewLinkMode = 'none' | 'relative' | 'absolute'

export type ViewOptions = {
  json?: boolean
  style?: ViewStyle
  linkMode?: ViewLinkMode
  maxItems?: string | number
  maxBytes?: string | number
  includeArchived?: boolean
}

export type ViewRecord = {
  filePath: string
  relativePath: string
  frontmatter: Record<string, unknown>
  body: string
}

export type SelectorCandidate = {
  id?: string
  label: string
  slug?: string
  type?: string
  path?: string
}

export class ViewSelectorError extends Error {
  readonly code: 'missing' | 'ambiguous'
  readonly selector: string
  readonly candidates: SelectorCandidate[]

  constructor(code: 'missing' | 'ambiguous', selector: string, candidates: SelectorCandidate[]) {
    super(
      code === 'ambiguous'
        ? `Selector "${selector}" is ambiguous.`
        : `Selector "${selector}" was not found.`,
    )
    this.name = 'ViewSelectorError'
    this.code = code
    this.selector = selector
    this.candidates = candidates
  }
}

const SYNC_STATES = new Set(['local', 'synced', 'dirty', 'deleted', 'conflict'])
const DEFAULT_MAX_ITEMS = 25
const DEFAULT_MAX_BYTES = 32768
const MAX_BYTES_HARD_CAP = 32768

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

export function stringValue(value: unknown): string | undefined {
  return normalizeNonEmpty(value)
}

export function numberValue(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

export function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.map((entry) => normalizeNonEmpty(entry)).filter((entry): entry is string => Boolean(entry))
    : []
}

export function recordArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isRecord) : []
}

export function normalizeViewStyle(value: unknown): ViewStyle {
  const normalized = normalizeNonEmpty(value)
  if (normalized === 'compact' || normalized === 'wide') return normalized
  return 'agent'
}

export function normalizeViewLinkMode(value: unknown): ViewLinkMode {
  const normalized = normalizeNonEmpty(value)
  if (normalized === 'relative' || normalized === 'absolute') return normalized
  return 'none'
}

export function normalizeMaxItems(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number.parseInt(String(value ?? ''), 10)
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_MAX_ITEMS
  return Math.max(1, Math.min(500, Math.floor(parsed)))
}

export function normalizeMaxBytes(value: unknown): number {
  const parsed = typeof value === 'number' ? value : Number.parseInt(String(value ?? ''), 10)
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_MAX_BYTES
  return Math.max(512, Math.min(MAX_BYTES_HARD_CAP, Math.floor(parsed)))
}

export function normalizeViewOptions(options: ViewOptions = {}): Required<Pick<ViewOptions, 'style' | 'linkMode'>> & {
  json: boolean
  maxItems: number
  maxBytes: number
  includeArchived: boolean
} {
  return {
    json: options.json === true,
    style: normalizeViewStyle(options.style),
    linkMode: normalizeViewLinkMode(options.linkMode),
    maxItems: normalizeMaxItems(options.maxItems),
    maxBytes: normalizeMaxBytes(options.maxBytes),
    includeArchived: options.includeArchived === true,
  }
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9ğüşöçıİĞÜŞÖÇ]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 96) || 'item'
}

export function repoRelative(repoRoot: string, filePath: string): string {
  return path.relative(repoRoot, filePath).split(path.sep).join('/')
}

export async function readMarkdownRecords(
  rootDir: string,
  params: { repoRoot?: string; recursive?: boolean; includeIndex?: boolean } = {},
): Promise<ViewRecord[]> {
  try {
    const entries = await fs.readdir(rootDir, { withFileTypes: true })
    const records: ViewRecord[] = []
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
      const filePath = path.join(rootDir, entry.name)
      if (entry.isDirectory() && params.recursive === true) {
        records.push(...await readMarkdownRecords(filePath, params))
        continue
      }
      if (!entry.isFile() || !entry.name.endsWith('.md')) continue
      if (entry.name === 'index.md' && params.includeIndex !== true) continue
      const parsed = parseFrontmatterDocument(await fs.readFile(filePath, 'utf8'))
      records.push({
        filePath,
        relativePath: params.repoRoot ? repoRelative(params.repoRoot, filePath) : filePath,
        frontmatter: parsed.frontmatter,
        body: parsed.body.trim(),
      })
    }
    return records
  } catch {
    return []
  }
}

function hashContent(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

function comparableRecordHash(record: ViewRecord): string {
  const frontmatter = { ...record.frontmatter }
  delete frontmatter.baseHash
  return hashContent(renderFrontmatterDocument(frontmatter, record.body))
}

export function effectiveLocalState(record: ViewRecord): string {
  const syncState = normalizeNonEmpty(record.frontmatter.syncState)
  const normalized = syncState && SYNC_STATES.has(syncState) ? syncState : 'local'
  const baseHash = normalizeNonEmpty(record.frontmatter.baseHash)
  if (normalized === 'synced' && baseHash && comparableRecordHash(record) !== baseHash) return 'dirty'
  return normalized
}

export function recordId(record: Pick<ViewRecord, 'frontmatter'>): string | undefined {
  return stringValue(record.frontmatter.localId)
    ?? stringValue(record.frontmatter.id)
    ?? stringValue(record.frontmatter.remoteId)
    ?? stringValue(record.frontmatter.memoryId)
    ?? stringValue(record.frontmatter.documentVersionId)
    ?? stringValue(record.frontmatter.documentId)
}

export function recordLabel(record: Pick<ViewRecord, 'frontmatter' | 'relativePath'>): string {
  return stringValue(record.frontmatter.name)
    ?? stringValue(record.frontmatter.title)
    ?? stringValue(record.frontmatter.slug)
    ?? recordId(record)
    ?? record.relativePath
}

export function recordSlug(record: Pick<ViewRecord, 'frontmatter'>): string | undefined {
  return stringValue(record.frontmatter.slug)
    ?? stringValue(record.frontmatter.documentSlug)
    ?? stringValue(record.frontmatter.groupUid)
}

export function idAliases(value: Record<string, unknown> | ViewRecord | undefined): string[] {
  if (!value) return []
  const maybeRecord = value as Partial<ViewRecord>
  const frontmatter: Record<string, unknown> = isRecord(maybeRecord.frontmatter)
    ? maybeRecord.frontmatter
    : value as Record<string, unknown>
  return [
    frontmatter.localId,
    frontmatter.id,
    frontmatter.remoteId,
    frontmatter.memoryId,
    frontmatter.documentId,
    frontmatter.documentVersionId,
    frontmatter.topicLocalId,
    frontmatter.sessionLocalId,
  ].map((entry) => normalizeNonEmpty(entry)).filter((entry): entry is string => Boolean(entry))
}

export function sameId(left: unknown, aliases: string[]): boolean {
  const normalized = normalizeNonEmpty(left)
  return Boolean(normalized && aliases.includes(normalized))
}

export function matchesEqualCi(value: unknown, needle: string): boolean {
  const normalized = normalizeNonEmpty(value)
  return Boolean(normalized && normalized.toLowerCase() === needle.toLowerCase())
}

export function matchesAnyEqualCi(values: unknown[], needle: string): boolean {
  return values.some((value) => matchesEqualCi(value, needle))
}

export function sameIdOrPrefix(left: unknown, aliases: string[]): boolean {
  const normalized = normalizeNonEmpty(left)
  if (!normalized) return false
  if (aliases.includes(normalized)) return true
  if (normalized.length < 8) return false
  return aliases.some((alias) => alias.startsWith(normalized))
}

export function candidateFromRecord(record: ViewRecord): SelectorCandidate {
  return {
    id: recordId(record),
    label: recordLabel(record),
    slug: recordSlug(record),
    type: stringValue(record.frontmatter.entityType),
    path: record.relativePath,
  }
}

function selectorFields(record: ViewRecord): Array<{ value: string; kind: 'id' | 'slug' | 'label' | 'path' }> {
  const values: Array<{ value: string; kind: 'id' | 'slug' | 'label' | 'path' }> = []
  for (const value of idAliases(record)) values.push({ value, kind: 'id' })
  for (const value of [recordSlug(record), stringValue(record.frontmatter.name), stringValue(record.frontmatter.title)]) {
    if (value) values.push({ value, kind: value === recordSlug(record) ? 'slug' : 'label' })
  }
  values.push({ value: record.relativePath, kind: 'path' })
  values.push({ value: path.basename(record.relativePath, '.md'), kind: 'slug' })
  return values
}

export function resolveRecordSelector(records: ViewRecord[], selector: string): ViewRecord {
  const normalized = selector.trim().toLowerCase()
  if (!normalized) {
    throw new ViewSelectorError('missing', selector, records.slice(0, 10).map(candidateFromRecord))
  }

  const matches = records.filter((record) => selectorFields(record).some(({ value, kind }) => {
    const candidate = value.toLowerCase()
    if (candidate === normalized) return true
    return kind === 'id' && normalized.length >= 8 && candidate.startsWith(normalized)
  }))

  if (matches.length === 1) return matches[0]!
  if (matches.length > 1) {
    throw new ViewSelectorError('ambiguous', selector, matches.slice(0, 25).map(candidateFromRecord))
  }
  throw new ViewSelectorError('missing', selector, records.slice(0, 25).map(candidateFromRecord))
}

function escapeCell(value: unknown): string {
  return String(value ?? '')
    .replace(/\r?\n/g, ' ')
    .replace(/\|/g, '\\|')
    .trim()
}

export function renderMarkdownTable(
  headers: string[],
  rows: unknown[][],
  options: { emptyText?: string } = {},
): string {
  const safeHeaders = headers.map(escapeCell)
  const safeRows = rows.map((row) => row.map(escapeCell))
  const lines = [
    `| ${safeHeaders.join(' | ')} |`,
    `| ${safeHeaders.map(() => '---').join(' | ')} |`,
  ]
  for (const row of safeRows) {
    const padded = safeHeaders.map((_, index) => row[index] ?? '')
    lines.push(`| ${padded.join(' | ')} |`)
  }
  if (rows.length === 0) {
    const emptyText = escapeCell(options.emptyText ?? 'No matching records.')
    const cells = safeHeaders.map((_, index) => (index === 0 ? `_${emptyText}_` : ''))
    lines.push(`| ${cells.join(' | ')} |`)
  }
  return lines.join('\n')
}

export function shortId(value: unknown): string {
  const normalized = normalizeNonEmpty(value)
  return normalized ? normalized.slice(0, 8) : '-'
}

export function formatDate(value: unknown): string {
  const normalized = normalizeNonEmpty(value)
  if (!normalized) return '-'
  const date = new Date(normalized)
  if (Number.isNaN(date.getTime())) return normalized
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z')
}

export function summarizeText(value: unknown, maxLength = 120): string {
  const compact = String(value ?? '').replace(/\s+/g, ' ').trim()
  if (!compact) return '-'
  if (compact.length <= maxLength) return compact
  return `${compact.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`
}

export function renderKeyValues(values: Array<[string, unknown]>): string {
  return values
    .filter(([, value]) => value !== undefined && value !== null && String(value).trim() !== '')
    .map(([label, value]) => `- ${label}: ${String(value)}`)
    .join('\n')
}

export function applyMaxBytes(markdown: string, maxBytes: number): { markdown: string; truncated: boolean } {
  const limit = normalizeMaxBytes(maxBytes)
  const bytes = Buffer.byteLength(markdown, 'utf8')
  if (bytes <= limit) return { markdown, truncated: false }
  const footer = `\n\n---\n\nTruncated: output exceeded ${limit} bytes. Use --max-items or a narrower selector.\n`
  const target = Math.max(0, limit - Buffer.byteLength(footer, 'utf8'))
  let sliced = markdown
  while (Buffer.byteLength(sliced, 'utf8') > target && sliced.length > 0) {
    sliced = sliced.slice(0, Math.floor(sliced.length * 0.9))
  }
  return { markdown: `${sliced.trimEnd()}${footer}`, truncated: true }
}

export function renderFooter(params: {
  source: string
  localState?: string
  updatedAt?: unknown
  lastPushedAt?: unknown
  lastPulledAt?: unknown
  truncated?: boolean
}): string {
  return [
    '',
    '---',
    '',
    renderKeyValues([
      ['source', params.source],
      ['local-state', params.localState ?? '-'],
      ['updatedAt', formatDate(params.updatedAt)],
      ['lastPushedAt', formatDate(params.lastPushedAt)],
      ['lastPulledAt', formatDate(params.lastPulledAt)],
      ['truncated', params.truncated === true ? 'true' : 'false'],
    ]),
  ].join('\n')
}
