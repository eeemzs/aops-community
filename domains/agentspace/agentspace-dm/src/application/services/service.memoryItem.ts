import { Effect } from 'effect'
import { pipe } from 'effect/Function'
import { validateInput, XfErrorFactory, effectErrorInfo } from '@aopslab/xf-core'
import { XfLogger } from '@aopslab/xf-logger'
import type { IRepositoryPortExperienceItem, IRepositoryPortMemoryItem, IRepositoryPortScope } from '../ports/repository-ports/index.js'
import type {
  IMemoryItemServicePort,
  MemoryItemListFilter,
  MemoryPromoteFromExperienceOptions,
  MemoryResumePack,
  MemoryResumePackItem,
  MemoryResumePackOptions,
  MemoryResumePackRef,
  MemorySearchRetrievalRequest,
  MemorySynopsis,
  MemorySynopsisOptions,
} from '../ports/inbound/index.js'
import { MemoryItemServiceError } from '../errors/MemoryItemServiceError.js'
import { IbmExperienceItem, IbmMemoryItem, IbmMemoryItemInsert, memoryItemZodSchemaInsert } from '../../domain/models/index.js'
import type { MemoryItemDurability, MemoryItemKind } from '../../domain/types.js'
import { validateBmInputWithSchema } from './service.zod-validation.js'
import { DbQueryOptions, mapDbError } from '@aopslab/xf-db'
import { listRecordsByScopeResolution } from './service.scope-resolution.js'

export interface MemoryItemServiceDependencies {}

export interface MemoryItemServiceOptions {
  memoryItemRepository: IRepositoryPortMemoryItem
  // Read-only sibling repository injected so the service can derive a memory item
  // server-side from an existing experience item (experience -> memory/playbook
  // promotion). Mirrors how DiscussionService takes multiple repositories via its
  // options + the kit provider wiring; the promote method only READS through it.
  experienceItemRepository?: IRepositoryPortExperienceItem
  scopeRepository?: IRepositoryPortScope
  serviceDependencies?: Partial<MemoryItemServiceDependencies>
  logger?: XfLogger
  locale?: string
}

const DEFAULT_SEARCH_CANDIDATE_LIMIT = 48
const MAX_SEARCH_CANDIDATE_LIMIT = 200
const DEFAULT_RECENCY_WINDOW_DAYS = 30
const DEFAULT_RESUME_PACK_LIMIT = 8
const MAX_RESUME_PACK_LIMIT = 24

function normalizeNonEmpty(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeTextToken(value: unknown): string {
  return normalizeNonEmpty(value).toLowerCase()
}

function tokenizeLoose(value: unknown): string[] {
  return normalizeNonEmpty(value)
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .map((entry) => entry.trim())
    .filter((entry) => entry.length >= 3)
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

function toArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : []
}

const PROMOTED_FROM_EXPERIENCE_SOURCE_TYPE = 'agentspace.experience-item'

function compactRecord<T extends Record<string, unknown>>(record: T): T {
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(record)) {
    if (value === undefined) continue
    result[key] = value
  }
  return result as T
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function parseDateValue(value: unknown): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value
  if (typeof value !== 'string') return null
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function readExpiresAt(item: IbmMemoryItem): Date | null {
  const meta = isPlainObject(item.meta) ? item.meta : {}
  return parseDateValue(meta.expiresAt)
}

function isExpiredMemoryItem(item: IbmMemoryItem, now = Date.now()): boolean {
  const expiresAt = readExpiresAt(item)
  return Boolean(expiresAt && expiresAt.getTime() <= now)
}

function clampCandidateLimit(value: unknown): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_SEARCH_CANDIDATE_LIMIT
  return Math.min(Math.max(Math.trunc(parsed), 1), MAX_SEARCH_CANDIDATE_LIMIT)
}

function resolveFetchLimit(
  retrieval: MemorySearchRetrievalRequest | undefined,
  options: DbQueryOptions<IbmMemoryItem> | undefined
): number {
  if (retrieval?.candidateLimit) {
    return clampCandidateLimit(retrieval.candidateLimit)
  }
  const requestedLimit = Number(options?.limit)
  if (Number.isFinite(requestedLimit) && requestedLimit > 0) {
    return clampCandidateLimit(Math.max(requestedLimit * 4, DEFAULT_SEARCH_CANDIDATE_LIMIT))
  }
  return DEFAULT_SEARCH_CANDIDATE_LIMIT
}

function readQueryOptionNumber(
  options: DbQueryOptions<IbmMemoryItem> | undefined,
  key: 'limit' | 'offset'
): number | undefined {
  const record = options as Record<string, unknown> | undefined
  const parsed = Number(record?.[key])
  return Number.isFinite(parsed) ? parsed : undefined
}

function normalizeRetrievalRequest(retrieval?: MemorySearchRetrievalRequest): MemorySearchRetrievalRequest | undefined {
  if (!retrieval) return undefined

  const subject = retrieval.subject ? {
    type: normalizeNonEmpty(retrieval.subject.type) || undefined,
    id: normalizeNonEmpty(retrieval.subject.id) || undefined,
    label: normalizeNonEmpty(retrieval.subject.label) || undefined,
  } : undefined

  const normalized: MemorySearchRetrievalRequest = {
    query: normalizeNonEmpty(retrieval.query) || undefined,
    goal: normalizeNonEmpty(retrieval.goal) || undefined,
    runtimeProfile: normalizeNonEmpty(retrieval.runtimeProfile) || undefined,
    workflowId: normalizeNonEmpty(retrieval.workflowId) || undefined,
    stepId: normalizeNonEmpty(retrieval.stepId) || undefined,
    subject,
    tags: uniqueStrings(toArray(retrieval.tags)),
    sourceTypes: uniqueStrings(toArray(retrieval.sourceTypes)),
    sourceIds: uniqueStrings(toArray(retrieval.sourceIds)),
    candidateLimit: retrieval.candidateLimit,
  }

  const hasValue = Boolean(
    normalized.query ||
      normalized.goal ||
      normalized.runtimeProfile ||
      normalized.workflowId ||
      normalized.stepId ||
      normalized.subject?.type ||
      normalized.subject?.id ||
      normalized.subject?.label ||
      normalized.tags?.length ||
      normalized.sourceTypes?.length ||
      normalized.sourceIds?.length
  )

  return hasValue ? normalized : undefined
}

function collectMetaTokens(value: unknown, depth = 0): string[] {
  if (depth > 3 || value === null || value === undefined) return []
  if (typeof value === 'string') return tokenizeLoose(value)
  if (typeof value === 'number' || typeof value === 'boolean') return tokenizeLoose(String(value))
  if (Array.isArray(value)) return value.flatMap((entry) => collectMetaTokens(entry, depth + 1))
  if (!isPlainObject(value)) return []
  return Object.entries(value).flatMap(([key, entry]) => [
    ...tokenizeLoose(key),
    ...collectMetaTokens(entry, depth + 1),
  ])
}

function collectRetrievalTokens(retrieval?: MemorySearchRetrievalRequest): string[] {
  if (!retrieval) return []
  return uniqueStrings([
    ...tokenizeLoose(retrieval.query),
    ...tokenizeLoose(retrieval.goal),
    ...tokenizeLoose(retrieval.runtimeProfile),
    ...tokenizeLoose(retrieval.subject?.type?.replace(/^projectman\./, '')),
    ...tokenizeLoose(retrieval.subject?.label),
    ...toArray(retrieval.tags).flatMap((entry) => tokenizeLoose(entry)),
    ...toArray(retrieval.sourceTypes).flatMap((entry) => tokenizeLoose(String(entry).replace(/^projectman\./, ''))),
  ])
}

function collectMemoryTokens(item: IbmMemoryItem): string[] {
  return uniqueStrings([
    ...tokenizeLoose(item.kind),
    ...tokenizeLoose(item.content),
    ...toArray(item.tags).flatMap((entry) => tokenizeLoose(entry)),
    ...tokenizeLoose(item.sourceType?.replace(/^projectman\./, '')),
    ...tokenizeLoose(item.sourceId),
    ...collectMetaTokens(item.meta),
  ])
}

function scoreLexical(itemTokens: string[], retrievalTokens: string[]): { score: number; matches: string[] } {
  if (retrievalTokens.length === 0 || itemTokens.length === 0) {
    return { score: 0, matches: [] }
  }

  const itemTokenSet = new Set(itemTokens)
  const matches: string[] = []
  let score = 0

  for (const token of retrievalTokens) {
    if (itemTokenSet.has(token)) {
      score += 8
      matches.push(token)
      continue
    }
    if (itemTokens.some((entry) => entry.includes(token) || token.includes(entry))) {
      score += 3
      matches.push(token)
    }
  }

  return { score, matches: uniqueStrings(matches) }
}

function scoreSemantic(item: IbmMemoryItem, retrieval: MemorySearchRetrievalRequest | undefined): number {
  if (!retrieval) return 0

  const tagSet = new Set(toArray(item.tags).map((entry) => normalizeTextToken(entry)))
  const sourceType = normalizeTextToken(item.sourceType)
  const kind = normalizeTextToken(item.kind)
  let score = 0

  for (const tag of toArray(retrieval.tags)) {
    const normalizedTag = normalizeTextToken(tag)
    if (normalizedTag && tagSet.has(normalizedTag)) score += 6
  }

  for (const sourceTypeCandidate of toArray(retrieval.sourceTypes)) {
    const normalizedSourceType = normalizeTextToken(sourceTypeCandidate)
    if (!normalizedSourceType) continue
    if (sourceType === normalizedSourceType) {
      score += 12
      continue
    }
    if (sourceType.includes(normalizedSourceType) || normalizedSourceType.includes(sourceType)) {
      score += 6
    }
  }

  const subjectType = normalizeTextToken(retrieval.subject?.type)
  if (subjectType) {
    if (sourceType === subjectType) score += 14
    else if (sourceType.includes(subjectType) || subjectType.includes(sourceType)) score += 8
  }

  const runtimeProfileTokens = tokenizeLoose(retrieval.runtimeProfile)
  if (runtimeProfileTokens.some((token) => kind.includes(token) || tagSet.has(token))) {
    score += 6
  }

  return score
}

function scoreLinkage(item: IbmMemoryItem, retrieval: MemorySearchRetrievalRequest | undefined): number {
  if (!retrieval) return 0

  const sourceId = normalizeNonEmpty(item.sourceId)
  const sourceType = normalizeNonEmpty(item.sourceType)
  const sourceIds = uniqueStrings([
    retrieval.subject?.id,
    retrieval.workflowId,
    retrieval.stepId,
    ...toArray(retrieval.sourceIds),
  ])
  const sourceTypes = uniqueStrings([
    retrieval.subject?.type,
    ...toArray(retrieval.sourceTypes),
  ])

  let score = 0

  if (sourceId) {
    for (const candidate of sourceIds) {
      if (candidate === sourceId) score += 18
    }
  }

  if (sourceType) {
    for (const candidate of sourceTypes) {
      if (candidate === sourceType) score += 12
    }
  }

  return score
}

function scoreRecency(item: IbmMemoryItem): number {
  const timestamp = parseDateValue(item.updatedAt) ?? parseDateValue(item.createdAt)
  if (!timestamp) return 0
  const ageInMs = Date.now() - timestamp.getTime()
  const ageInDays = Math.max(ageInMs / (1000 * 60 * 60 * 24), 0)
  const normalized = Math.max(0, 1 - (ageInDays / DEFAULT_RECENCY_WINDOW_DAYS))
  return normalized * 6
}

function scoreImportance(item: IbmMemoryItem): number {
  const importance = Number(item.importance)
  if (!Number.isFinite(importance) || importance <= 0) return 0
  return Math.min(Math.max(importance, 0), 100) / 10
}

function rankMemoryItems(
  entries: IbmMemoryItem[],
  retrieval: MemorySearchRetrievalRequest | undefined,
  options?: DbQueryOptions<IbmMemoryItem>
): IbmMemoryItem[] {
  const retrievalTokens = collectRetrievalTokens(retrieval)
  const requestedOffset = readQueryOptionNumber(options, 'offset')
  const requestedLimit = readQueryOptionNumber(options, 'limit')
  const offset = typeof requestedOffset === 'number' && requestedOffset > 0
    ? Math.trunc(requestedOffset)
    : 0
  const limit = typeof requestedLimit === 'number' && requestedLimit > 0
    ? Math.trunc(requestedLimit)
    : undefined

  const ranked = entries
    .map((entry, index) => {
      const itemTokens = collectMemoryTokens(entry)
      const lexical = scoreLexical(itemTokens, retrievalTokens)
      const semantic = scoreSemantic(entry, retrieval)
      const linkage = scoreLinkage(entry, retrieval)
      const recency = scoreRecency(entry)
      const importance = scoreImportance(entry)
      const expired = isExpiredMemoryItem(entry)
      const score = lexical.score + semantic + linkage + recency + importance

      return {
        entry,
        index,
        score,
        lexicalMatches: lexical.matches.length,
        linkage,
        importance,
        expired,
      }
    })
    .sort((left, right) => {
      if (left.expired !== right.expired) return left.expired ? 1 : -1
      if (right.score !== left.score) return right.score - left.score
      if (right.linkage !== left.linkage) return right.linkage - left.linkage
      if (right.lexicalMatches !== left.lexicalMatches) return right.lexicalMatches - left.lexicalMatches
      if (right.importance !== left.importance) return right.importance - left.importance
      return left.index - right.index
    })
    .map((item) => item.entry)

  const sliced = limit === undefined ? ranked.slice(offset) : ranked.slice(offset, offset + limit)
  return sliced
}

function readMetaRecord(item: IbmMemoryItem): Record<string, unknown> {
  return isPlainObject(item.meta) ? item.meta : {}
}

function clampResumePackLimit(value: unknown): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_RESUME_PACK_LIMIT
  return Math.min(Math.max(Math.trunc(parsed), 1), MAX_RESUME_PACK_LIMIT)
}

function normalizeResumePackOptions(options?: MemoryResumePackOptions): Required<MemoryResumePackOptions> {
  return {
    depth: options?.depth === 'deep' ? 'deep' : 'light',
    limit: clampResumePackLimit(options?.limit),
  }
}

function normalizeRefRecord(value: unknown): MemoryResumePackRef | null {
  if (typeof value === 'string') {
    const normalized = normalizeNonEmpty(value)
    return normalized ? { ref: normalized } : null
  }
  if (!isPlainObject(value)) return null
  const pageNumberRaw = value.pageNumber
  const pageNumber =
    typeof pageNumberRaw === 'number'
      ? Math.trunc(pageNumberRaw)
      : typeof pageNumberRaw === 'string' && pageNumberRaw.trim()
        ? Number.parseInt(pageNumberRaw, 10)
        : undefined
  const normalized: MemoryResumePackRef = {
    kind: normalizeNonEmpty(value.kind) || undefined,
    uri: normalizeNonEmpty(value.uri) || undefined,
    resourceId: normalizeNonEmpty(value.resourceId) || undefined,
    ref: normalizeNonEmpty(value.ref) || normalizeNonEmpty(value.id) || undefined,
    documentVersionId: normalizeNonEmpty(value.documentVersionId) || undefined,
    sectionId: normalizeNonEmpty(value.sectionId) || undefined,
    pageVersionId: normalizeNonEmpty(value.pageVersionId) || undefined,
    pageNumber: Number.isInteger(pageNumber) ? pageNumber : undefined,
    target: normalizeNonEmpty(value.target) || undefined,
    locale: normalizeNonEmpty(value.locale) || undefined,
    fallbackLocale: normalizeNonEmpty(value.fallbackLocale) || undefined,
  }
  return normalized.kind ||
    normalized.uri ||
    normalized.resourceId ||
    normalized.ref ||
    normalized.documentVersionId ||
    normalized.sectionId ||
    normalized.pageVersionId ||
    normalized.pageNumber !== undefined
    ? normalized
    : null
}

function collectItemRefs(item: IbmMemoryItem): MemoryResumePackRef[] {
  const meta = readMetaRecord(item)
  const nextReadRefs = toArray(meta.nextReadRefs).map((entry) => normalizeRefRecord(entry)).filter(Boolean) as MemoryResumePackRef[]
  const sourceRefs = toArray(meta.sourceRefs).map((entry) => normalizeRefRecord(entry)).filter(Boolean) as MemoryResumePackRef[]
  return [...nextReadRefs, ...sourceRefs]
}

function uniqueRefs(refs: MemoryResumePackRef[]): MemoryResumePackRef[] {
  const seen = new Set<string>()
  const result: MemoryResumePackRef[] = []
  for (const ref of refs) {
    const key = [
      normalizeTextToken(ref.kind),
      normalizeTextToken(ref.uri),
      normalizeTextToken(ref.resourceId),
      normalizeTextToken(ref.ref),
      normalizeTextToken(ref.documentVersionId),
      normalizeTextToken(ref.sectionId),
      normalizeTextToken(ref.pageVersionId),
      ref.pageNumber === undefined ? '' : String(ref.pageNumber),
      normalizeTextToken(ref.target),
      normalizeTextToken(ref.locale),
      normalizeTextToken(ref.fallbackLocale),
    ].join('|')
    if (!key || seen.has(key)) continue
    seen.add(key)
    result.push(ref)
  }
  return result
}

function collectNextActions(items: IbmMemoryItem[]): string[] {
  return uniqueStrings(items.flatMap((item) => {
    const meta = readMetaRecord(item)
    return [
      normalizeNonEmpty(meta.nextAction),
      ...toArray(meta.nextSteps).map((entry) => normalizeNonEmpty(entry)),
    ]
  }))
}

function hasTag(item: IbmMemoryItem, expectedTag: string): boolean {
  const normalizedExpected = normalizeTextToken(expectedTag)
  if (!normalizedExpected) return false
  return toArray(item.tags).some((entry) => normalizeTextToken(entry) === normalizedExpected)
}

function isDecisionTraceMemory(item: IbmMemoryItem): boolean {
  const kind = normalizeTextToken(item.kind)
  if (kind === 'decision') return true
  if (kind !== 'note' || !hasTag(item, 'phase:decision')) return false
  const meta = readMetaRecord(item)
  return !Array.isArray(meta.openItems)
}

function isWorkingMemoryItem(item: IbmMemoryItem): boolean {
  if (readDurability(item) === 'short') return true
  const kind = normalizeTextToken(item.kind)
  return kind === 'kickoff' || kind === 'resume' || kind === 'closeout' || kind === 'decision' || kind === 'constraint'
}

function buildSynopsisDecisions(items: IbmMemoryItem[], limit: number): string[] {
  return uniqueStrings(
    items
      .filter((item) => readDurability(item) === 'durable' && isDecisionTraceMemory(item))
      .map((item) => normalizeNonEmpty(item.content))
      .filter((entry): entry is string => Boolean(entry)),
  ).slice(0, limit)
}

function toResumePackItem(item: IbmMemoryItem): MemoryResumePackItem {
  return {
    id: normalizeNonEmpty(item.id),
    kind: normalizeNonEmpty(item.kind),
    durability: normalizeNonEmpty((item as Record<string, unknown>).durability),
    content: normalizeNonEmpty(item.content),
    importance: typeof item.importance === 'number' ? item.importance : undefined,
    sourceType: normalizeNonEmpty(item.sourceType),
    sourceId: normalizeNonEmpty(item.sourceId),
    tags: toArray(item.tags).map((entry) => String(entry)).filter(Boolean),
    meta: item.meta,
  }
}

function readMetaSubjectType(item: IbmMemoryItem): string {
  return normalizeTextToken(readMetaRecord(item).subjectType)
}

function readMetaSubjectId(item: IbmMemoryItem): string {
  return normalizeNonEmpty(readMetaRecord(item).subjectId) ?? ''
}

function readDurability(item: IbmMemoryItem): string {
  return normalizeTextToken((item as Record<string, unknown>).durability)
}

function readStickyScope(item: IbmMemoryItem): string {
  return normalizeTextToken(readMetaRecord(item).stickyScope)
}

function readSupersedesId(item: IbmMemoryItem): string {
  return normalizeNonEmpty(readMetaRecord(item).supersedes)
}

function isExactSubjectMatch(item: IbmMemoryItem, retrieval?: MemorySearchRetrievalRequest): boolean {
  const subjectType = normalizeTextToken(retrieval?.subject?.type)
  const subjectId = normalizeNonEmpty(retrieval?.subject?.id) ?? ''
  if (!subjectType || !subjectId) return false
  return (
    (normalizeTextToken(item.sourceType) === subjectType && normalizeNonEmpty(item.sourceId) === subjectId) ||
    (readMetaSubjectType(item) === subjectType && readMetaSubjectId(item) === subjectId)
  )
}

function isLineageMatch(item: IbmMemoryItem, retrieval?: MemorySearchRetrievalRequest): boolean {
  const sourceType = normalizeTextToken(item.sourceType)
  const sourceId = normalizeNonEmpty(item.sourceId) ?? ''
  const meta = readMetaRecord(item)
  const candidates = new Set(uniqueStrings([
    retrieval?.subject?.id,
    retrieval?.workflowId,
    retrieval?.stepId,
    ...toArray(retrieval?.sourceIds),
  ]))
  const typeCandidates = new Set(
    uniqueStrings([
      retrieval?.subject?.type,
      ...toArray(retrieval?.sourceTypes),
    ]).map((entry) => normalizeTextToken(entry))
  )

  return Boolean(
    (sourceId && candidates.has(sourceId)) ||
    (readMetaSubjectId(item) && candidates.has(readMetaSubjectId(item))) ||
    (normalizeNonEmpty(meta.sprintId) && candidates.has(normalizeNonEmpty(meta.sprintId))) ||
    (normalizeNonEmpty(meta.phaseId) && candidates.has(normalizeNonEmpty(meta.phaseId))) ||
    (normalizeNonEmpty(meta.microtaskId) && candidates.has(normalizeNonEmpty(meta.microtaskId))) ||
    (normalizeNonEmpty(meta.kanbanTaskId) && candidates.has(normalizeNonEmpty(meta.kanbanTaskId))) ||
    (sourceType && typeCandidates.has(sourceType)) ||
    (readMetaSubjectType(item) && typeCandidates.has(readMetaSubjectType(item)))
  )
}

function normalizeContentSignature(value: unknown): string {
  return normalizeNonEmpty(value).toLowerCase().replace(/\s+/g, ' ').trim()
}

function readItemTimestamp(item: IbmMemoryItem): number {
  const timestamp = parseDateValue(item.updatedAt) ?? parseDateValue(item.createdAt)
  return timestamp?.getTime() ?? 0
}

function readProjectTag(item: IbmMemoryItem): string {
  const tags = toArray(item.tags).map((entry) => normalizeNonEmpty(entry))
  const projectTag = tags.find((entry) => entry.startsWith('project:'))
  return projectTag ? projectTag.slice('project:'.length) : ''
}

function readProjectId(item: IbmMemoryItem): string {
  const meta = readMetaRecord(item)
  return (
    normalizeNonEmpty(meta.projectId) ||
    readProjectTag(item) ||
    (normalizeTextToken(item.sourceType) === 'projectman.plan' ? normalizeNonEmpty(item.sourceId) : '') ||
    (readMetaSubjectType(item) === 'projectman.plan' ? readMetaSubjectId(item) : '')
  )
}

function isProjectRuleMatch(item: IbmMemoryItem, projectId: string): boolean {
  return Boolean(
    item.kind === 'rule' &&
    projectId &&
    readProjectId(item) === projectId
  )
}

function isProjectGenericMatch(item: IbmMemoryItem, projectId: string): boolean {
  if (!projectId) return false
  if (item.kind === 'rule') return false
  return readProjectId(item) === projectId
}

function isStickyProjectGuidance(item: IbmMemoryItem, projectId: string, retrieval?: MemorySearchRetrievalRequest): boolean {
  if (readDurability(item) !== 'sticky') return false
  if (readStickyScope(item) && readStickyScope(item) !== 'project') return false
  if (!projectId) return false
  if (readProjectId(item) !== projectId) return false

  const requestedBoardTags = toArray(retrieval?.tags)
    .map((entry) => normalizeTextToken(entry))
    .filter((entry) => entry?.startsWith('board:'))
  if (requestedBoardTags.length > 0) {
    const itemTags = new Set(toArray(item.tags).map((entry) => normalizeTextToken(entry)))
    const hasBoardBootstrap = itemTags.has(normalizeTextToken('board-bootstrap'))
    if (hasBoardBootstrap) {
      return requestedBoardTags.some((tag) => itemTags.has(tag))
    }
  }

  return true
}

function isStickySubjectGuidance(item: IbmMemoryItem, retrieval?: MemorySearchRetrievalRequest): boolean {
  if (readDurability(item) !== 'sticky') return false
  if (readStickyScope(item) !== 'subject') return false
  return isExactSubjectMatch(item, retrieval) || isLineageMatch(item, retrieval)
}

function filterSupersededItems(entries: IbmMemoryItem[]): IbmMemoryItem[] {
  const supersededIds = new Set(entries.map((entry) => readSupersedesId(entry)).filter(Boolean))
  return entries.filter((entry) => !supersededIds.has(normalizeNonEmpty(entry.id)))
}

function dedupeMemoryItems(entries: IbmMemoryItem[]): IbmMemoryItem[] {
  const bestByKey = new Map<string, IbmMemoryItem>()
  for (const entry of entries) {
    const key = [
      normalizeTextToken(entry.kind),
      readMetaSubjectType(entry) || normalizeTextToken(entry.sourceType),
      readMetaSubjectId(entry) || normalizeNonEmpty(entry.sourceId),
      normalizeContentSignature(entry.content),
    ].join('|')

    const current = bestByKey.get(key)
    if (!current) {
      bestByKey.set(key, entry)
      continue
    }

    if (readItemTimestamp(entry) > readItemTimestamp(current)) {
      bestByKey.set(key, entry)
    }
  }

  const bestSet = new Set(Array.from(bestByKey.values()))
  return entries.filter((entry) => bestSet.has(entry))
}

function takeGroup(entries: IbmMemoryItem[], limit: number): IbmMemoryItem[] {
  return limit <= 0 ? [] : entries.slice(0, limit)
}

function curateRelatedMemory(
  entries: IbmMemoryItem[],
  normalizedRetrieval: MemorySearchRetrievalRequest | undefined,
  projectId: string,
  limit: number,
  depth: 'light' | 'deep',
): {
  bootstrapGuidance: IbmMemoryItem[]
  relatedMemory: IbmMemoryItem[]
  exactMatches: IbmMemoryItem[]
  lineageMatches: IbmMemoryItem[]
  ruleMatches: IbmMemoryItem[]
  projectMatches: IbmMemoryItem[]
  fallbackMatches: IbmMemoryItem[]
} {
  const deduped = filterSupersededItems(dedupeMemoryItems(entries))
  const stickyProjectMatches = deduped.filter((item) => isStickyProjectGuidance(item, projectId, normalizedRetrieval))
  const stickySubjectMatches = depth === 'deep'
    ? deduped.filter((item) => !stickyProjectMatches.includes(item) && isStickySubjectGuidance(item, normalizedRetrieval))
    : []
  const bootstrapGuidance = [...stickyProjectMatches, ...stickySubjectMatches]
    .sort((left, right) => {
      const leftExpired = isExpiredMemoryItem(left)
      const rightExpired = isExpiredMemoryItem(right)
      if (leftExpired !== rightExpired) return leftExpired ? 1 : -1
      const rankDelta = Number(readMetaRecord(right).stickyRank ?? 0) - Number(readMetaRecord(left).stickyRank ?? 0)
      if (rankDelta !== 0) return rankDelta
      return readItemTimestamp(right) - readItemTimestamp(left)
    })
    .slice(0, 3)

  const activeEntries = deduped.filter((item) => !bootstrapGuidance.includes(item))
  const exactMatches = activeEntries.filter((item) => isExactSubjectMatch(item, normalizedRetrieval))
  const lineageMatches = activeEntries.filter((item) => !exactMatches.includes(item) && isLineageMatch(item, normalizedRetrieval))
  const ruleMatches = activeEntries.filter((item) => !exactMatches.includes(item) && !lineageMatches.includes(item) && isProjectRuleMatch(item, projectId))
  const projectMatches = activeEntries.filter((item) =>
    !exactMatches.includes(item) &&
    !lineageMatches.includes(item) &&
    !ruleMatches.includes(item) &&
    isProjectGenericMatch(item, projectId),
  )
  const fallbackMatches = activeEntries.filter((item) =>
    !exactMatches.includes(item) &&
    !lineageMatches.includes(item) &&
    !ruleMatches.includes(item) &&
    !projectMatches.includes(item),
  )

  const hasExactContext = exactMatches.length > 0
  const hasSpecificContext = hasExactContext || lineageMatches.length > 0
  const selectedExact = takeGroup(exactMatches, limit)
  const selectedLineage = takeGroup(lineageMatches, Math.max(limit - selectedExact.length, 0))
  const remainingAfterSpecific = Math.max(limit - selectedExact.length - selectedLineage.length, 0)

  const ruleLimit = (() => {
    if (remainingAfterSpecific <= 0) return 0
    if (depth === 'deep') {
      return hasExactContext ? 1 : hasSpecificContext ? 2 : remainingAfterSpecific
    }
    if (hasExactContext) return 0
    return hasSpecificContext ? 1 : remainingAfterSpecific
  })()

  const selectedRules = takeGroup(ruleMatches, Math.min(ruleLimit, remainingAfterSpecific))
  const remainingAfterRules = Math.max(limit - selectedExact.length - selectedLineage.length - selectedRules.length, 0)

  const projectLimit = (() => {
    if (remainingAfterRules <= 0) return 0
    if (hasExactContext) return depth === 'deep' ? 1 : 0
    if (hasSpecificContext) return depth === 'deep' ? 1 : 0
    return remainingAfterRules
  })()

  const selectedProject = takeGroup(projectMatches, Math.min(projectLimit, remainingAfterRules))
  const remainingAfterProject = Math.max(
    limit - selectedExact.length - selectedLineage.length - selectedRules.length - selectedProject.length,
    0,
  )
  const selectedFallback = hasSpecificContext ? [] : takeGroup(fallbackMatches, Math.min(1, remainingAfterProject))
  const curated = [
    ...selectedExact,
    ...selectedLineage,
    ...selectedRules,
    ...selectedProject,
    ...selectedFallback,
  ]

  return {
    bootstrapGuidance,
    relatedMemory: uniqueStrings(curated.map((item) => item.id)).map((id) => curated.find((item) => item.id === id)!).slice(0, limit),
    exactMatches,
    lineageMatches,
    ruleMatches,
    projectMatches,
    fallbackMatches,
  }
}

function buildBootstrapGuidance(items: IbmMemoryItem[]): string[] {
  return uniqueStrings(
    items.map((item) => normalizeNonEmpty(item.content)).filter((entry): entry is string => Boolean(entry)),
  ).slice(0, 3)
}

function buildSynopsisSummary(
  knowledgeItems: IbmMemoryItem[],
  workingItems: IbmMemoryItem[],
  nextActions: string[],
  retrieval?: MemorySearchRetrievalRequest
): string | undefined {
  const topContents = uniqueStrings([
    ...knowledgeItems
      .filter((item) => normalizeTextToken(item.kind) === 'note')
      .map((item) => normalizeNonEmpty(item.content)),
    ...workingItems
      .filter((item) => normalizeTextToken(item.kind) !== 'decision')
      .map((item) => normalizeNonEmpty(item.content)),
  ])
    .filter((entry): entry is string => Boolean(entry))
    .slice(0, 3)

  if (topContents.length > 0) return topContents.join('\n\n')
  if (nextActions.length > 0) return nextActions.join('\n')
  return normalizeNonEmpty(retrieval?.goal) || normalizeNonEmpty(retrieval?.query)
}

function inferCurrentFocus(items: IbmMemoryItem[], nextActions: string[], retrieval?: MemorySearchRetrievalRequest): string | undefined {
  const firstAction = nextActions[0]
  if (firstAction) return firstAction

  const primary = items.find((item) => normalizeTextToken(item.kind) !== 'decision') ?? items[0]
  if (primary) {
    const meta = readMetaRecord(primary)
    return (
      normalizeNonEmpty(meta.subjectTitle) ||
      normalizeNonEmpty(retrieval?.subject?.label) ||
      normalizeNonEmpty(primary.content)
    )
  }

  return normalizeNonEmpty(retrieval?.goal) || normalizeNonEmpty(retrieval?.query)
}

function inferConfidence(params: {
  exactMatches: IbmMemoryItem[]
  lineageMatches: IbmMemoryItem[]
  ruleMatches: IbmMemoryItem[]
  projectMatches: IbmMemoryItem[]
  total: number
  relatedTotal: number
}): number {
  let base = 10
  if (params.exactMatches.length > 0) base = 92
  else if (params.lineageMatches.length > 0) base = 78
  else if (params.ruleMatches.length > 0) base = 62
  else if (params.projectMatches.length > 0) base = 48
  else if (params.total > 0) base = 28

  const noiseRatio =
    params.total > 0
      ? Math.max(params.total - params.relatedTotal, 0) / params.total
      : 0

  const penaltyScale = params.exactMatches.length > 0 ? 6 : 14
  const penalty = Math.round(noiseRatio * penaltyScale)
  return Math.max(5, Math.min(98, base - penalty))
}

function inferReadStrategy(confidence: number, refs: MemoryResumePackRef[], gaps: string[], depth: 'light' | 'deep'): 'none' | 'recommended' | 'expand' {
  if (depth === 'deep') return refs.length > 0 || gaps.length > 0 ? 'expand' : 'recommended'
  if (confidence >= 75 && refs.length === 0 && gaps.length === 0) return 'none'
  if (confidence >= 45) return refs.length > 0 ? 'recommended' : 'none'
  return refs.length > 0 || gaps.length > 0 ? 'expand' : 'recommended'
}

function composeSynopsis(params: {
  relatedMemory: IbmMemoryItem[]
  knowledgeMemory: IbmMemoryItem[]
  workingMemory: IbmMemoryItem[]
  bootstrapMemory: IbmMemoryItem[]
  decisions: string[]
  blockers: string[]
  nextActions: string[]
  retrieval?: MemorySearchRetrievalRequest
}): MemorySynopsis {
  const bootstrapGuidance = buildBootstrapGuidance(params.bootstrapMemory)
  return {
    summary: buildSynopsisSummary(params.knowledgeMemory, params.workingMemory, params.nextActions, params.retrieval),
    decisions: params.decisions,
    openItems: uniqueStrings([...params.blockers, ...params.nextActions]),
    bootstrapGuidance,
    currentFocus: inferCurrentFocus(params.workingMemory, params.nextActions, params.retrieval),
    sourceMemoryIds: uniqueStrings([
      ...params.bootstrapMemory.map((item) => normalizeNonEmpty(item.id)),
      ...params.relatedMemory.map((item) => normalizeNonEmpty(item.id)),
    ]),
    generatedAt: new Date().toISOString(),
  }
}

function normalizeMemoryItemQueryFilter(filter: MemoryItemListFilter): MemoryItemListFilter {
  const normalized = { ...(filter as Record<string, unknown>) }
  delete normalized.projectId
  return normalized as MemoryItemListFilter
}

export class MemoryItemService implements IMemoryItemServicePort {
  private readonly memoryItemRepository: IRepositoryPortMemoryItem
  private readonly experienceItemRepository?: IRepositoryPortExperienceItem
  private readonly scopeRepository?: IRepositoryPortScope
  private readonly logger?: XfLogger

  constructor(options: MemoryItemServiceOptions) {
    this.memoryItemRepository = options.memoryItemRepository
    this.experienceItemRepository = options.experienceItemRepository
    this.scopeRepository = options.scopeRepository
    this.logger = options.logger?.child({ module: this.constructor.name })
  }

  getById(id: string, options?: DbQueryOptions<IbmMemoryItem>): Effect.Effect<IbmMemoryItem | null, MemoryItemServiceError> {
    const stage = 'MemoryItemService::getById'
    return pipe(
      validateInput(id, 'id', { stage }),
      Effect.flatMap((id) => this.memoryItemRepository.findById(id, options).pipe(
        Effect.mapError(mapDbError({ stage, operation: 'findById', factory: XfErrorFactory.notFound }))
      )),
      Effect.tapError((e) => Effect.sync(() => {
        const info = effectErrorInfo(e)
        this.logger?.error({ error: info.unwrapped, stage }, 'Error in getById')
      }))
    )
  }

  create(data: IbmMemoryItemInsert): Effect.Effect<IbmMemoryItem, MemoryItemServiceError> {
    const stage = 'MemoryItemService::create'
    return pipe(
      validateInput(data, 'data', { stage }),
      Effect.flatMap((data) =>
        validateBmInputWithSchema({
          input: data,
          schema: memoryItemZodSchemaInsert,
          stage,
          operation: 'MemoryItemService::create.memoryItemZodSchemaInsert',
          field: 'data',
        })
      ),
      Effect.flatMap((data) => this.memoryItemRepository.create(data).pipe(
        Effect.mapError(mapDbError({ stage, operation: 'create', factory: XfErrorFactory.createFailed }))
      ))
    )
  }

  addMemoryItem(data: IbmMemoryItemInsert): Effect.Effect<IbmMemoryItem, MemoryItemServiceError> {
    const stage = 'MemoryItemService::addMemoryItem'
    return pipe(
      validateInput(data, 'data', { stage }),
      Effect.flatMap((data) =>
        validateBmInputWithSchema({
          input: data,
          schema: memoryItemZodSchemaInsert,
          stage,
          operation: 'MemoryItemService::addMemoryItem.memoryItemZodSchemaInsert',
          field: 'data',
        })
      ),
      Effect.flatMap((payload) => this.create(payload)),
      Effect.tapError((e) => Effect.sync(() => {
        const info = effectErrorInfo(e)
        this.logger?.error({ error: info.unwrapped, stage }, 'Error in addMemoryItem')
      }))
    )
  }

  /**
   * Server-side experience -> memory/playbook promotion.
   *
   * Reads an existing experience item by id (READ-ONLY, through the injected
   * experienceItemRepository) and derives a memory item from it. Two flavors:
   *   - asPlaybook=false (durable-memory): a DURABLE memory item carrying the
   *     experience title/problem/solution/content. The kind is a faithful durable
   *     kind (default `note`; `decision` also accepted) with durability `durable`.
   *   - asPlaybook=true (playbook): a memory item with kind `rule` (default) or
   *     `constraint`, tagged + meta.playbook so playbook.list projects it.
   * Both flavors set sourceType/sourceId + meta.promotedFromExperienceId linking
   * the source experience. Returns the created memory item.
   */
  promoteFromExperience(
    experienceId: string,
    asPlaybook?: boolean,
    overrides?: MemoryPromoteFromExperienceOptions,
  ): Effect.Effect<IbmMemoryItem, MemoryItemServiceError> {
    const stage = 'MemoryItemService::promoteFromExperience'
    return pipe(
      validateInput(experienceId, 'experienceId', { stage }),
      Effect.flatMap((id) => {
        const repository = this.experienceItemRepository
        if (!repository) {
          return Effect.fail(
            XfErrorFactory.inputRequired({ field: 'experienceItemRepository', stage }),
          ) as Effect.Effect<IbmMemoryItem, MemoryItemServiceError>
        }
        return repository.findById(id).pipe(
          Effect.mapError(mapDbError({ stage, operation: 'experienceItemRepository.findById', factory: XfErrorFactory.notFound })),
          Effect.flatMap((experience) =>
            experience
              ? Effect.succeed(experience as IbmExperienceItem)
              : Effect.fail(XfErrorFactory.notFound({ stage, identifier: id })),
          ),
          Effect.flatMap((experience) =>
            this.create(this.buildPromotedMemoryInsert(experience, id, asPlaybook === true, overrides)),
          ),
        )
      }),
      Effect.tapError((e) => Effect.sync(() => {
        const info = effectErrorInfo(e)
        this.logger?.error({ error: info.unwrapped, stage }, 'Error in promoteFromExperience')
      })),
    )
  }

  private buildPromotedMemoryInsert(
    experience: IbmExperienceItem,
    experienceId: string,
    asPlaybook: boolean,
    overrides?: MemoryPromoteFromExperienceOptions,
  ): IbmMemoryItemInsert {
    const title = normalizeNonEmpty(experience.title)
    const problem = normalizeNonEmpty(experience.problem)
    const solution = normalizeNonEmpty(experience.solution)
    const overrideContent = normalizeNonEmpty(overrides?.content)
    const experienceContent = normalizeNonEmpty(experience.content)
    const composedContent = uniqueStrings([
      title,
      problem ? `Problem: ${problem}` : undefined,
      solution ? `Solution: ${solution}` : undefined,
    ]).join('\n')
    const content = overrideContent || experienceContent || composedContent || (title ?? '')

    const extraTags = uniqueStrings(toArray(overrides?.tags))
    const experienceTags = uniqueStrings(toArray(experience.tags))
    const sourceRefs = toArray(experience.sourceRefs)
    const sessionContext = isPlainObject((experience.meta as Record<string, unknown> | undefined)?.experience)
      ? ((experience.meta as Record<string, unknown>).experience as Record<string, unknown>).sessionContext
      : undefined

    if (asPlaybook) {
      const kind: MemoryItemKind = overrides?.kind === 'constraint' ? 'constraint' : 'rule'
      const durability: MemoryItemDurability = overrides?.durability === 'sticky' ? 'sticky' : 'durable'
      const scope = normalizeNonEmpty(overrides?.playbookScope) === 'session' ? 'session' : 'project'
      const area = normalizeNonEmpty(overrides?.playbookArea)
      const playbookId = normalizeNonEmpty(overrides?.playbookId) ?? experienceId
      const steps = uniqueStrings([
        ...toArray(overrides?.steps),
        ...toArray(experience.commands),
      ])
      const tags = uniqueStrings([
        'playbook',
        `playbook-scope:${scope}`,
        area ? `playbook-area:${area}` : undefined,
        'playbook-source:experience',
        ...experienceTags,
        ...extraTags,
      ])
      const playbookMeta = compactRecord({
        id: playbookId,
        title: title ?? playbookId,
        scope,
        area,
        appliesWhen: normalizeNonEmpty(overrides?.appliesWhen),
        steps: steps.length > 0 ? steps : undefined,
        enforcement: normalizeNonEmpty(overrides?.enforcement),
        reviewState: normalizeNonEmpty(overrides?.reviewState),
        supersedes: normalizeNonEmpty(overrides?.supersedes),
        promotedFromExperienceId: experienceId,
        sessionContext,
      })
      return compactRecord({
        scopeId: experience.scopeId,
        kind,
        durability,
        content,
        tags: tags.length > 0 ? tags : undefined,
        sourceType: PROMOTED_FROM_EXPERIENCE_SOURCE_TYPE,
        sourceId: experienceId,
        meta: compactRecord({
          promotedFromExperienceId: experienceId,
          sourceRefs: sourceRefs.length > 0 ? sourceRefs : undefined,
          playbook: playbookMeta,
        }),
      }) as IbmMemoryItemInsert
    }

    // durable-memory flavor: faithful durable kind (note | decision), durability durable.
    const kind: MemoryItemKind = overrides?.kind === 'decision' ? 'decision' : 'note'
    const durability: MemoryItemDurability = overrides?.durability === 'sticky' ? 'sticky' : 'durable'
    const tags = uniqueStrings([...experienceTags, ...extraTags])
    return compactRecord({
      scopeId: experience.scopeId,
      kind,
      durability,
      content,
      tags: tags.length > 0 ? tags : undefined,
      sourceType: PROMOTED_FROM_EXPERIENCE_SOURCE_TYPE,
      sourceId: experienceId,
      meta: compactRecord({
        promotedFromExperienceId: experienceId,
        experience: compactRecord({
          title,
          problem,
          solution,
          type: normalizeNonEmpty(experience.type),
        }),
        sourceRefs: sourceRefs.length > 0 ? sourceRefs : undefined,
        sessionContext,
      }),
    }) as IbmMemoryItemInsert
  }

  updateMemoryItem(id: string, patch: Partial<IbmMemoryItem>): Effect.Effect<IbmMemoryItem, MemoryItemServiceError> {
    const stage = 'MemoryItemService::updateMemoryItem'
    if (!patch || Object.keys(patch).length === 0) {
      return Effect.fail(XfErrorFactory.inputRequired({ field: 'patch', stage }))
    }
    return pipe(
      validateInput(id, 'id', { stage }),
      Effect.flatMap((entityId) =>
        validateBmInputWithSchema({
          input: patch,
          schema: memoryItemZodSchemaInsert.partial().strict(),
          stage,
          operation: 'MemoryItemService::updateMemoryItem.memoryItemZodSchemaInsert.patch',
          field: 'patch',
        }).pipe(
          Effect.map(() => entityId)
        )
      ),
      Effect.flatMap((itemId) =>
        this.memoryItemRepository.patchById(itemId, patch).pipe(
          Effect.mapError(mapDbError({ stage, operation: 'patchById', factory: XfErrorFactory.upsertFailed }))
        )
      ),
      Effect.tapError((e) => Effect.sync(() => {
        const info = effectErrorInfo(e)
        this.logger?.error({ error: info.unwrapped, stage }, 'Error in updateMemoryItem')
      }))
    )
  }

  setMemoryImportance(id: string, importance: number | null): Effect.Effect<IbmMemoryItem, MemoryItemServiceError> {
    const stage = 'MemoryItemService::setMemoryImportance'
    return pipe(
      validateInput(id, 'id', { stage }),
      Effect.flatMap(() => this.updateMemoryItem(id, { importance: importance === null ? (null as any) : importance }))
    )
  }

  listMemoryItems(
    filter: MemoryItemListFilter = {},
    options?: DbQueryOptions<IbmMemoryItem>
  ): Effect.Effect<IbmMemoryItem[], MemoryItemServiceError> {
    const stage = 'MemoryItemService::listMemoryItems'
    return pipe(
      validateInput(filter, 'filter', { stage }),
      Effect.flatMap((value) => listRecordsByScopeResolution(this.memoryItemRepository as any, this.scopeRepository, normalizeMemoryItemQueryFilter(value), options, {
        stage,
        defaultResolution: 'cascade',
      }).pipe(
        Effect.mapError(mapDbError({ stage, operation: 'find', factory: XfErrorFactory.notFound }))
      )),
      Effect.tapError((e) => Effect.sync(() => {
        const info = effectErrorInfo(e)
        this.logger?.error({ error: info.unwrapped, stage }, 'Error in listMemoryItems')
      }))
    )
  }

  searchMemoryItems(
    filter: MemoryItemListFilter = {},
    retrieval?: MemorySearchRetrievalRequest,
    options?: DbQueryOptions<IbmMemoryItem>
  ): Effect.Effect<IbmMemoryItem[], MemoryItemServiceError> {
    const stage = 'MemoryItemService::searchMemoryItems'
    const normalizedRetrieval = normalizeRetrievalRequest(retrieval)
    return pipe(
      validateInput(filter, 'filter', { stage }),
      Effect.flatMap((validatedFilter) =>
        listRecordsByScopeResolution(this.memoryItemRepository as any, this.scopeRepository, normalizeMemoryItemQueryFilter(validatedFilter), {
          ...options,
          offset: undefined,
          limit: resolveFetchLimit(normalizedRetrieval, options),
        }, {
          stage,
          defaultResolution: 'cascade',
        }).pipe(
          Effect.mapError(mapDbError({ stage, operation: 'find', factory: XfErrorFactory.notFound }))
        )
      ),
      Effect.map((rows) => rankMemoryItems(rows, normalizedRetrieval, options)),
      Effect.tapError((e) => Effect.sync(() => {
        const info = effectErrorInfo(e)
        this.logger?.error({ error: info.unwrapped, stage }, 'Error in searchMemoryItems')
      }))
    )
  }

  buildResumePack(
    filter: MemoryItemListFilter,
    retrieval?: MemorySearchRetrievalRequest,
    options?: MemoryResumePackOptions
  ): Effect.Effect<MemoryResumePack, MemoryItemServiceError> {
    const stage = 'MemoryItemService::buildResumePack'
    const normalizedRetrieval = normalizeRetrievalRequest(retrieval)
    const normalizedOptions = normalizeResumePackOptions(options)
    const scopeId = normalizeNonEmpty(filter?.scopeId)
    if (!scopeId) {
      return Effect.fail(XfErrorFactory.inputRequired({ field: 'filter.scopeId', stage }))
    }

    const filterRecord = filter as Record<string, unknown>
    const projectId = normalizeNonEmpty(filterRecord.projectId)
    const searchFilter = normalizeMemoryItemQueryFilter(filter)
    const listOptions: DbQueryOptions<IbmMemoryItem> = {
      limit: Math.max(
        normalizedOptions.limit * (normalizedOptions.depth === 'deep' ? 3 : 2),
        clampCandidateLimit(normalizedRetrieval?.candidateLimit),
      ),
    }

    return pipe(
      this.searchMemoryItems(searchFilter, normalizedRetrieval, listOptions),
      Effect.flatMap((rows) => {
        const limitedRows = rows.slice(0, listOptions.limit as number)
        const curated = curateRelatedMemory(
          limitedRows,
          normalizedRetrieval,
          projectId,
          normalizedOptions.limit,
          normalizedOptions.depth,
        )
        const relatedMemory = curated.relatedMemory
        const workingMemory = relatedMemory.filter((item) => isWorkingMemoryItem(item))
        const knowledgeMemory = relatedMemory.filter((item) => !workingMemory.includes(item))
        const openDecisions = workingMemory
          .filter((item) => item.kind === 'decision')
          .map((item) => normalizeNonEmpty(item.content))
          .filter((entry): entry is string => Boolean(entry))
          .slice(0, normalizedOptions.limit)
        const decisions = buildSynopsisDecisions(knowledgeMemory, normalizedOptions.limit)
        const blockers = workingMemory
          .filter((item) => item.kind === 'constraint')
          .map((item) => normalizeNonEmpty(item.content))
          .filter((entry): entry is string => Boolean(entry))
          .slice(0, normalizedOptions.limit)
        const nextActions = collectNextActions(workingMemory).slice(0, normalizedOptions.limit)
        const recommendedRefs = uniqueRefs(
          [...curated.bootstrapGuidance, ...relatedMemory].flatMap((item) => collectItemRefs(item))
        ).slice(0, normalizedOptions.depth === 'deep' ? normalizedOptions.limit * 2 : normalizedOptions.limit)
        const confidence = inferConfidence({
          exactMatches: curated.exactMatches,
          lineageMatches: curated.lineageMatches,
          ruleMatches: curated.ruleMatches,
          projectMatches: curated.projectMatches,
          total: limitedRows.length,
          relatedTotal: relatedMemory.length,
        })
        const gaps = uniqueStrings([
          curated.exactMatches.length === 0 && normalizeNonEmpty(normalizedRetrieval?.subject?.id) ? 'exact-subject-memory-missing' : undefined,
          relatedMemory.length === 0 ? 'no-related-memory' : undefined,
          nextActions.length === 0 ? 'next-action-missing' : undefined,
          recommendedRefs.length === 0 ? 'recommended-refs-missing' : undefined,
        ])
        const readStrategy = inferReadStrategy(confidence, recommendedRefs, gaps, normalizedOptions.depth)
        const synopsis = composeSynopsis({
          relatedMemory,
          knowledgeMemory,
          workingMemory,
          bootstrapMemory: curated.bootstrapGuidance,
          decisions,
          blockers,
          nextActions,
          retrieval: normalizedRetrieval,
        })

        return Effect.succeed({
          subject: normalizedRetrieval?.subject,
          synopsis,
          bootstrapGuidance: synopsis.bootstrapGuidance,
          resumeSummary: synopsis.summary,
          currentFocus: synopsis.currentFocus,
          openDecisions,
          openBlockers: blockers,
          nextActions,
          recommendedRefs,
          relatedMemory: relatedMemory.map((item) => toResumePackItem(item)),
          confidence,
          gaps,
          readStrategy,
        } satisfies MemoryResumePack)
      }),
      Effect.tapError((e) => Effect.sync(() => {
        const info = effectErrorInfo(e)
        this.logger?.error({ error: info.unwrapped, stage }, 'Error in buildResumePack')
      }))
    )
  }

  buildSynopsis(
    filter: MemoryItemListFilter,
    retrieval?: MemorySearchRetrievalRequest,
    options?: MemorySynopsisOptions
  ): Effect.Effect<MemorySynopsis, MemoryItemServiceError> {
    const stage = 'MemoryItemService::buildSynopsis'
    const normalizedRetrieval = normalizeRetrievalRequest(retrieval)
    const scopeId = normalizeNonEmpty(filter?.scopeId)
    if (!scopeId) {
      return Effect.fail(XfErrorFactory.inputRequired({ field: 'filter.scopeId', stage }))
    }

    const filterRecord = filter as Record<string, unknown>
    const projectId = normalizeNonEmpty(filterRecord.projectId)
    const limit = clampResumePackLimit(options?.limit)
    const searchFilter = normalizeMemoryItemQueryFilter(filter)
    const listOptions: DbQueryOptions<IbmMemoryItem> = {
      limit: Math.max(limit * 3, clampCandidateLimit(normalizedRetrieval?.candidateLimit)),
    }

    return pipe(
      this.searchMemoryItems(searchFilter, normalizedRetrieval, listOptions),
      Effect.map((rows) => rows.slice(0, listOptions.limit as number)),
      Effect.map((rows) => curateRelatedMemory(rows, normalizedRetrieval, projectId, limit, 'deep')),
      Effect.map((curated) => {
        const relatedMemory = curated.relatedMemory
        const workingMemory = relatedMemory.filter((item) => isWorkingMemoryItem(item))
        const knowledgeMemory = relatedMemory.filter((item) => !workingMemory.includes(item))
        const decisions = buildSynopsisDecisions(knowledgeMemory, limit)
        const blockers = workingMemory
          .filter((item) => item.kind === 'constraint')
          .map((item) => normalizeNonEmpty(item.content))
          .filter((entry): entry is string => Boolean(entry))
          .slice(0, limit)
        const nextActions = collectNextActions(workingMemory).slice(0, limit)

        return composeSynopsis({
          relatedMemory,
          knowledgeMemory,
          workingMemory,
          bootstrapMemory: curated.bootstrapGuidance,
          decisions,
          blockers,
          nextActions,
          retrieval: normalizedRetrieval,
        })
      }),
      Effect.tapError((e) => Effect.sync(() => {
        const info = effectErrorInfo(e)
        this.logger?.error({ error: info.unwrapped, stage }, 'Error in buildSynopsis')
      }))
    )
  }

  removeMemoryItem(id: string): Effect.Effect<void, MemoryItemServiceError> {
    const stage = 'MemoryItemService::removeMemoryItem'
    return pipe(
      validateInput(id, 'id', { stage }),
      Effect.flatMap((itemId) =>
        this.memoryItemRepository.deleteById(itemId).pipe(
          Effect.mapError(mapDbError({ stage, operation: 'deleteById', factory: XfErrorFactory.upsertFailed }))
        )
      ),
      Effect.map(() => undefined)
    )
  }
}
