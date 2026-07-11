import { randomUUID } from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'

import { compactPayload, normalizeNonEmpty } from './command.js'
import { parseFrontmatterDocument, renderFrontmatterDocument } from './memory-workspace.js'
import { resolveRepoFirstWorkspaceRoot, type RepoFirstStorageContext } from './repo-first-storage.js'

export type DiscussionTurnKind =
  | 'statement'
  | 'question'
  | 'answer'
  | 'objection'
  | 'concession'
  | 'proposal'
  | 'final-stance'

export type DiscussionTopicStatus = 'active' | 'concluding' | 'concluded' | 'abandoned'
export type DiscussionTurnOrder = 'alternating' | 'free'
export type DiscussionOutputKind = 'final-stance' | 'consensus' | 'disagreement' | 'open-questions' | 'decision' | 'agent-summary'

export type DiscussionTopicRules = {
  turnOrder: DiscussionTurnOrder
  maxTurns?: number
  minTurnsBeforeConclude?: number
  requireQuestionAnswer: boolean
}

export type DiscussionTopicLineage = {
  kind: 'follow-up' | 'fork' | 'version'
  parentTopicId?: string
  parentTopicPath?: string
  referencedOutputs: string[]
  referencedTurnRefs: string[]
  referencedMemoryRefs: string[]
}

export type DiscussionTopic = {
  localId: string
  slug: string
  projectId?: string
  scopeId?: string
  sessionLocalId?: string
  sessionPath?: string
  title: string
  objective?: string
  question?: string
  participants: string[]
  initiatorAgentId?: string
  status: DiscussionTopicStatus
  subjectType?: string
  subjectId?: string
  tags: string[]
  abandonedAt?: string
  abandonedReason?: string
  lineage?: DiscussionTopicLineage
  createdAt: string
  updatedAt: string
  storage: 'local-cache'
  rules: DiscussionTopicRules
  raw?: Record<string, unknown>
}

export type DiscussionTurn = {
  topicLocalId: string
  turnId: string
  seq: number
  agentId: string
  kind: DiscussionTurnKind
  replyToTurnId?: string
  addressedTo?: string
  createdAt: string
  storage: 'local-cache'
  content: string
  raw?: Record<string, unknown>
}

export type DiscussionOutput = {
  topicLocalId: string
  outputKind: DiscussionOutputKind
  agentId?: string
  ownerAgentId?: string
  createdAt: string
  updatedAt: string
  storage: 'local-cache'
  content: string
  raw?: Record<string, unknown>
}

export type DiscussionWorkspacePaths = {
  rootDir: string
  topicsDir: string
}

export type DiscussionTopicRecord = {
  dirName: string
  dirPath: string
  topicFilePath: string
  topic: DiscussionTopic
  turns: Array<{ fileName: string; filePath: string; turn: DiscussionTurn }>
  outputs: Array<{ fileName: string; filePath: string; output: DiscussionOutput }>
}

const DISCUSSION_TURN_KINDS: DiscussionTurnKind[] = [
  'statement',
  'question',
  'answer',
  'objection',
  'concession',
  'proposal',
  'final-stance',
]

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

export function normalizeDiscussionSlug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'item'
}

function slugify(value: string): string {
  return normalizeDiscussionSlug(value)
}

function numberField(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function booleanField(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined
}

function normalizeTopicStatus(value: unknown): DiscussionTopicStatus {
  const normalized = normalizeNonEmpty(value)
  if (normalized === 'concluding' || normalized === 'concluded' || normalized === 'abandoned') return normalized
  return 'active'
}

function normalizeTurnOrder(value: unknown): DiscussionTurnOrder {
  return normalizeNonEmpty(value) === 'free' ? 'free' : 'alternating'
}

function normalizeTurnKind(value: unknown): DiscussionTurnKind {
  const normalized = normalizeNonEmpty(value)?.toLowerCase()
  if (DISCUSSION_TURN_KINDS.includes(normalized as DiscussionTurnKind)) return normalized as DiscussionTurnKind
  return 'statement'
}

function normalizeRules(frontmatter: Record<string, unknown>): DiscussionTopicRules {
  const rawRules = isRecord(frontmatter.rules) ? frontmatter.rules : {}
  return {
    turnOrder: normalizeTurnOrder(rawRules.turnOrder ?? frontmatter.turnOrder),
    maxTurns: numberField(rawRules.maxTurns ?? frontmatter.maxTurns),
    minTurnsBeforeConclude: numberField(rawRules.minTurnsBeforeConclude ?? frontmatter.minTurnsBeforeConclude),
    requireQuestionAnswer: booleanField(rawRules.requireQuestionAnswer ?? frontmatter.requireQuestionAnswer) === true,
  }
}

function normalizeLineage(value: unknown): DiscussionTopicLineage | undefined {
  if (!isRecord(value)) return undefined
  const kind = normalizeNonEmpty(value.kind)
  if (kind !== 'follow-up' && kind !== 'fork' && kind !== 'version') return undefined
  return {
    kind,
    parentTopicId: normalizeNonEmpty(value.parentTopicId),
    parentTopicPath: normalizeNonEmpty(value.parentTopicPath),
    referencedOutputs: uniqueStrings(toStringArray(value.referencedOutputs)),
    referencedTurnRefs: uniqueStrings(toStringArray(value.referencedTurnRefs)),
    referencedMemoryRefs: uniqueStrings(toStringArray(value.referencedMemoryRefs)),
  }
}

function normalizeOutputKind(value: unknown, fallbackFileName?: string): DiscussionOutputKind {
  const normalized = normalizeNonEmpty(value)
  if (
    normalized === 'final-stance' ||
    normalized === 'consensus' ||
    normalized === 'disagreement' ||
    normalized === 'open-questions' ||
    normalized === 'decision' ||
    normalized === 'agent-summary'
  ) {
    return normalized
  }
  const fromFile = normalizeNonEmpty(fallbackFileName)?.replace(/\.md$/i, '')
  if (fromFile === 'consensus' || fromFile === 'disagreement' || fromFile === 'open-questions') return fromFile
  if (fromFile?.endsWith('-final-stance')) return 'final-stance'
  return 'decision'
}

export function resolveDiscussionWorkspacePaths(context: RepoFirstStorageContext): DiscussionWorkspacePaths {
  const rootDir = path.join(resolveRepoFirstWorkspaceRoot(context), 'agentspace', 'discussions')
  return {
    rootDir,
    topicsDir: path.join(rootDir, 'topics'),
  }
}

export function buildDiscussionTopicDirName(topic: Pick<DiscussionTopic, 'title' | 'localId'> & { slug?: string }): string {
  return `${slugify(topic.slug ?? topic.title)}-${topic.localId.slice(0, 8)}`
}

export function buildDiscussionTurnFileName(turn: Pick<DiscussionTurn, 'seq' | 'agentId' | 'kind'>): string {
  return `${String(turn.seq).padStart(4, '0')}-${slugify(turn.agentId)}-${slugify(turn.kind)}.md`
}

export function buildDiscussionOutputFileName(output: Pick<DiscussionOutput, 'outputKind' | 'agentId'>): string {
  if (output.outputKind === 'final-stance') {
    return `${slugify(output.agentId ?? 'agent')}-final-stance.md`
  }
  return `${output.outputKind}.md`
}

export function normalizeDiscussionTopic(frontmatter: Record<string, unknown>, body: string): DiscussionTopic {
  const localId = normalizeNonEmpty(frontmatter.localId) ?? randomUUID()
  const title = normalizeNonEmpty(frontmatter.title) ?? 'Untitled discussion'
  const participants = uniqueStrings(toStringArray(frontmatter.participants))
  return {
    localId,
    slug: normalizeDiscussionSlug(normalizeNonEmpty(frontmatter.slug) ?? title),
    projectId: normalizeNonEmpty(frontmatter.projectId),
    scopeId: normalizeNonEmpty(frontmatter.scopeId),
    sessionLocalId: normalizeNonEmpty(frontmatter.sessionLocalId),
    sessionPath: normalizeNonEmpty(frontmatter.sessionPath),
    title,
    objective: normalizeNonEmpty(frontmatter.objective),
    question: normalizeNonEmpty(frontmatter.question),
    participants,
    initiatorAgentId: normalizeNonEmpty(frontmatter.initiatorAgentId) ?? participants[0],
    status: normalizeTopicStatus(frontmatter.status),
    subjectType: normalizeNonEmpty(frontmatter.subjectType),
    subjectId: normalizeNonEmpty(frontmatter.subjectId),
    tags: uniqueStrings(toStringArray(frontmatter.tags)),
    abandonedAt: normalizeNonEmpty(frontmatter.abandonedAt),
    abandonedReason: normalizeNonEmpty(frontmatter.abandonedReason),
    lineage: normalizeLineage(frontmatter.lineage),
    createdAt: normalizeNonEmpty(frontmatter.createdAt) ?? new Date().toISOString(),
    updatedAt: normalizeNonEmpty(frontmatter.updatedAt) ?? normalizeNonEmpty(frontmatter.createdAt) ?? new Date().toISOString(),
    storage: 'local-cache',
    rules: normalizeRules(frontmatter),
    raw: compactPayload({
      ...frontmatter,
      notes: normalizeNonEmpty(body),
    }),
  }
}

export function normalizeDiscussionTurn(frontmatter: Record<string, unknown>, body: string): DiscussionTurn {
  return {
    topicLocalId: normalizeNonEmpty(frontmatter.topicLocalId) ?? '',
    turnId: normalizeNonEmpty(frontmatter.turnId) ?? randomUUID(),
    seq: numberField(frontmatter.seq) ?? 0,
    agentId: normalizeNonEmpty(frontmatter.agentId) ?? 'agent',
    kind: normalizeTurnKind(frontmatter.kind),
    replyToTurnId: normalizeNonEmpty(frontmatter.replyToTurnId),
    addressedTo: normalizeNonEmpty(frontmatter.addressedTo),
    createdAt: normalizeNonEmpty(frontmatter.createdAt) ?? new Date().toISOString(),
    storage: 'local-cache',
    content: body.trim(),
    raw: frontmatter,
  }
}

export function normalizeDiscussionOutput(
  frontmatter: Record<string, unknown>,
  body: string,
  fallbackFileName?: string,
): DiscussionOutput {
  return {
    topicLocalId: normalizeNonEmpty(frontmatter.topicLocalId) ?? '',
    outputKind: normalizeOutputKind(frontmatter.outputKind, fallbackFileName),
    agentId: normalizeNonEmpty(frontmatter.agentId),
    ownerAgentId: normalizeNonEmpty(frontmatter.ownerAgentId),
    createdAt: normalizeNonEmpty(frontmatter.createdAt) ?? new Date().toISOString(),
    updatedAt: normalizeNonEmpty(frontmatter.updatedAt) ?? normalizeNonEmpty(frontmatter.createdAt) ?? new Date().toISOString(),
    storage: 'local-cache',
    content: body.trim(),
    raw: frontmatter,
  }
}

export function buildDiscussionTopicFrontmatter(topic: DiscussionTopic): Record<string, unknown> {
  return compactPayload({
    schemaVersion: 2,
    entityType: 'agentspace.discussion-topic',
    localId: topic.localId,
    slug: topic.slug,
    projectId: topic.projectId,
    scopeId: topic.scopeId,
    sessionLocalId: topic.sessionLocalId,
    sessionPath: topic.sessionPath,
    title: topic.title,
    objective: topic.objective,
    question: topic.question,
    participants: topic.participants,
    initiatorAgentId: topic.initiatorAgentId,
    status: topic.status,
    subjectType: topic.subjectType,
    subjectId: topic.subjectId,
    tags: topic.tags.length > 0 ? topic.tags : undefined,
    abandonedAt: topic.abandonedAt,
    abandonedReason: topic.abandonedReason,
    lineage: topic.lineage,
    rules: compactPayload({
      turnOrder: topic.rules.turnOrder,
      maxTurns: topic.rules.maxTurns,
      minTurnsBeforeConclude: topic.rules.minTurnsBeforeConclude,
      requireQuestionAnswer: topic.rules.requireQuestionAnswer,
    }),
    createdAt: topic.createdAt,
    updatedAt: topic.updatedAt,
    storage: topic.storage,
  })
}

export function buildDiscussionTurnFrontmatter(turn: DiscussionTurn): Record<string, unknown> {
  return compactPayload({
    schemaVersion: 2,
    entityType: 'agentspace.discussion-turn',
    topicLocalId: turn.topicLocalId,
    turnId: turn.turnId,
    seq: turn.seq,
    agentId: turn.agentId,
    kind: turn.kind,
    replyToTurnId: turn.replyToTurnId,
    addressedTo: turn.addressedTo,
    createdAt: turn.createdAt,
    storage: turn.storage,
  })
}

export function buildDiscussionOutputFrontmatter(output: DiscussionOutput): Record<string, unknown> {
  return compactPayload({
    schemaVersion: 2,
    entityType: 'agentspace.discussion-output',
    topicLocalId: output.topicLocalId,
    outputKind: output.outputKind,
    agentId: output.agentId,
    ownerAgentId: output.ownerAgentId,
    createdAt: output.createdAt,
    updatedAt: output.updatedAt,
    storage: output.storage,
  })
}

export function buildDiscussionTopicDocument(topic: DiscussionTopic): string {
  const body = normalizeNonEmpty(topic.raw?.notes) ?? ''
  return renderFrontmatterDocument(buildDiscussionTopicFrontmatter(topic), body)
}

export function buildDiscussionTurnDocument(turn: DiscussionTurn): string {
  return renderFrontmatterDocument(buildDiscussionTurnFrontmatter(turn), turn.content)
}

export function buildDiscussionOutputDocument(output: DiscussionOutput): string {
  return renderFrontmatterDocument(buildDiscussionOutputFrontmatter(output), output.content)
}

export function createDiscussionTopic(params: {
  title: string
  slug?: string
  objective?: string
  question?: string
  participants: string[]
  initiatorAgentId?: string
  projectId?: string
  scopeId?: string
  sessionLocalId?: string
  sessionPath?: string
  subjectType?: string
  subjectId?: string
  tags?: string[]
  rules?: Partial<DiscussionTopicRules>
  lineage?: DiscussionTopicLineage
}): DiscussionTopic {
  const now = new Date().toISOString()
  const participants = uniqueStrings(params.participants)
  return {
    localId: randomUUID(),
    slug: normalizeDiscussionSlug(params.slug ?? params.title),
    projectId: params.projectId,
    scopeId: params.scopeId,
    sessionLocalId: params.sessionLocalId,
    sessionPath: params.sessionPath,
    title: params.title,
    objective: params.objective,
    question: params.question,
    participants,
    initiatorAgentId: normalizeNonEmpty(params.initiatorAgentId) ?? participants[0],
    status: 'active',
    subjectType: params.subjectType,
    subjectId: params.subjectId,
    tags: uniqueStrings(params.tags ?? []),
    lineage: params.lineage,
    createdAt: now,
    updatedAt: now,
    storage: 'local-cache',
    rules: {
      turnOrder: params.rules?.turnOrder ?? 'alternating',
      maxTurns: params.rules?.maxTurns,
      minTurnsBeforeConclude: params.rules?.minTurnsBeforeConclude,
      requireQuestionAnswer: params.rules?.requireQuestionAnswer === true,
    },
  }
}

export function createDiscussionTurn(params: {
  topicLocalId: string
  seq: number
  agentId: string
  kind: DiscussionTurnKind
  content: string
  replyToTurnId?: string
  addressedTo?: string
}): DiscussionTurn {
  return {
    topicLocalId: params.topicLocalId,
    turnId: randomUUID(),
    seq: params.seq,
    agentId: params.agentId,
    kind: params.kind,
    content: params.content,
    replyToTurnId: params.replyToTurnId,
    addressedTo: params.addressedTo,
    createdAt: new Date().toISOString(),
    storage: 'local-cache',
  }
}

export function createDiscussionOutput(params: {
  topicLocalId: string
  outputKind: DiscussionOutputKind
  content: string
  agentId?: string
  ownerAgentId?: string
}): DiscussionOutput {
  const now = new Date().toISOString()
  return {
    topicLocalId: params.topicLocalId,
    outputKind: params.outputKind,
    agentId: params.agentId,
    ownerAgentId: params.ownerAgentId,
    createdAt: now,
    updatedAt: now,
    storage: 'local-cache',
    content: params.content,
  }
}

async function readDiscussionTurnFiles(
  turnsDir: string,
): Promise<Array<{ fileName: string; filePath: string; turn: DiscussionTurn }>> {
  try {
    const files = await fs.readdir(turnsDir)
    const entries: Array<{ fileName: string; filePath: string; turn: DiscussionTurn }> = []
    for (const fileName of files.filter((entry) => entry.endsWith('.md')).sort()) {
      const filePath = path.join(turnsDir, fileName)
      const raw = await fs.readFile(filePath, 'utf8')
      const parsed = parseFrontmatterDocument(raw)
      entries.push({ fileName, filePath, turn: normalizeDiscussionTurn(parsed.frontmatter, parsed.body) })
    }
    return entries.sort((left, right) => left.turn.seq - right.turn.seq || left.fileName.localeCompare(right.fileName))
  } catch {
    return []
  }
}

async function readDiscussionOutputFiles(
  outputsDir: string,
): Promise<Array<{ fileName: string; filePath: string; output: DiscussionOutput }>> {
  try {
    const files = await fs.readdir(outputsDir)
    const entries: Array<{ fileName: string; filePath: string; output: DiscussionOutput }> = []
    for (const fileName of files.filter((entry) => entry.endsWith('.md')).sort()) {
      const filePath = path.join(outputsDir, fileName)
      const raw = await fs.readFile(filePath, 'utf8')
      const parsed = parseFrontmatterDocument(raw)
      entries.push({
        fileName,
        filePath,
        output: normalizeDiscussionOutput(parsed.frontmatter, parsed.body, fileName),
      })
    }
    return entries.sort((left, right) => left.fileName.localeCompare(right.fileName))
  } catch {
    return []
  }
}

export async function readDiscussionTopicRecords(topicsDir: string): Promise<DiscussionTopicRecord[]> {
  try {
    const entries = await fs.readdir(topicsDir, { withFileTypes: true })
    const records: DiscussionTopicRecord[] = []
    for (const entry of entries.filter((candidate) => candidate.isDirectory()).sort((left, right) => left.name.localeCompare(right.name))) {
      const dirPath = path.join(topicsDir, entry.name)
      const topicFilePath = path.join(dirPath, 'topic.md')
      try {
        const raw = await fs.readFile(topicFilePath, 'utf8')
        const parsed = parseFrontmatterDocument(raw)
        records.push({
          dirName: entry.name,
          dirPath,
          topicFilePath,
          topic: normalizeDiscussionTopic(parsed.frontmatter, parsed.body),
          turns: await readDiscussionTurnFiles(path.join(dirPath, 'turns')),
          outputs: await readDiscussionOutputFiles(path.join(dirPath, 'outputs')),
        })
      } catch {
        continue
      }
    }
    return records.sort((left, right) => right.topic.updatedAt.localeCompare(left.topic.updatedAt))
  } catch {
    return []
  }
}

export function normalizeDiscussionTopicRecord(record: DiscussionTopicRecord): Record<string, unknown> {
  return compactPayload({
    id: record.topic.localId,
    localId: record.topic.localId,
    slug: record.topic.slug,
    topicSlug: record.topic.slug,
    title: record.topic.title,
    objective: record.topic.objective,
    question: record.topic.question,
    participants: record.topic.participants,
    initiatorAgentId: record.topic.initiatorAgentId,
    status: record.topic.status,
    subjectType: record.topic.subjectType,
    subjectId: record.topic.subjectId,
    tags: record.topic.tags,
    abandonedAt: record.topic.abandonedAt,
    abandonedReason: record.topic.abandonedReason,
    lineage: record.topic.lineage,
    projectId: record.topic.projectId,
    scopeId: record.topic.scopeId,
    scope: record.topic.sessionLocalId ? 'session-bound' : 'standalone',
    sessionLocalId: record.topic.sessionLocalId,
    sessionPath: record.topic.sessionPath,
    createdAt: record.topic.createdAt,
    updatedAt: record.topic.updatedAt,
    storage: record.topic.storage,
    rules: record.topic.rules,
    topicPath: record.dirName,
    turnCount: record.turns.length,
    outputCount: record.outputs.length,
  })
}

export function normalizeDiscussionTurnRecord(turn: DiscussionTurn): Record<string, unknown> {
  return compactPayload({
    turnId: turn.turnId,
    seq: turn.seq,
    agentId: turn.agentId,
    kind: turn.kind,
    replyToTurnId: turn.replyToTurnId,
    addressedTo: turn.addressedTo,
    createdAt: turn.createdAt,
    storage: turn.storage,
    content: turn.content,
  })
}

export function normalizeDiscussionOutputRecord(output: DiscussionOutput): Record<string, unknown> {
  return compactPayload({
    outputKind: output.outputKind,
    agentId: output.agentId,
    ownerAgentId: output.ownerAgentId,
    createdAt: output.createdAt,
    updatedAt: output.updatedAt,
    storage: output.storage,
    content: output.content,
  })
}

export function discussionTopicMatchesSelector(record: DiscussionTopicRecord, selector: string): boolean {
  return selectDiscussionTopicRecordsBySelector([record], selector).length > 0
}

export type DiscussionTopicSelectorMatchKind = 'localId' | 'slug' | 'dirName' | 'shortId'

export type DiscussionTopicSelectorResult = {
  records: DiscussionTopicRecord[]
  matchedBy?: DiscussionTopicSelectorMatchKind
  cliDeprecationWarnings: string[]
}

function formatCandidateTitle(title: string): string {
  const trimmed = title.length > 80 ? `${title.slice(0, 77)}...` : title
  return JSON.stringify(trimmed)
}

export function formatDiscussionTopicSelectorCandidate(record: DiscussionTopicRecord): string {
  const shortId = record.topic.localId.slice(0, 8)
  return `${record.topic.slug} [shortId=${shortId}, status=${record.topic.status}, title=${formatCandidateTitle(record.topic.title)}, path=${record.dirName}]`
}

export function formatDiscussionTopicSelectorCandidates(records: DiscussionTopicRecord[], limit = 5): string {
  const visible = records.slice(0, limit).map(formatDiscussionTopicSelectorCandidate)
  const suffix = records.length > limit ? `; ... +${records.length - limit} more` : ''
  return `${visible.join('; ')}${suffix}`
}

export function buildDiscussionTopicNotFoundMessage(selector: string): string {
  return `Repo-first discussion topic was not found for selector "${selector}". Discover current slugs with: aops-cli discuss list --limit 20 --json.`
}

export function buildDiscussionTopicAmbiguousSelectorMessage(selector: string, records: DiscussionTopicRecord[]): string {
  return `Discussion selector "${selector}" is ambiguous across ${records.length} candidates. Candidates: ${formatDiscussionTopicSelectorCandidates(records)}. Retry with the intended full localId or --short-id <8char>. Use --prefer-active only when exactly one active topic should win. Inspect with: aops-cli discuss list --status active --limit 20 --json.`
}

function discussionSelectorWarning(matchedBy?: DiscussionTopicSelectorMatchKind): string | undefined {
  if (matchedBy === 'dirName') return 'legacy folder-name selector matched; prefer topic slug'
  if (matchedBy === 'shortId') return 'legacy short-id selector matched; prefer topic slug'
  return undefined
}

export function selectDiscussionTopicRecordsBySelectorDetailed(
  records: DiscussionTopicRecord[],
  selector: string,
  options: { explicitShortId?: boolean } = {},
): DiscussionTopicSelectorResult {
  const normalized = selector.trim().toLowerCase()
  if (!normalized) return { records: [], cliDeprecationWarnings: [] }
  const ranks: Array<{ matchedBy: DiscussionTopicSelectorMatchKind; records: DiscussionTopicRecord[] }> = options.explicitShortId
    ? [
        {
          matchedBy: 'shortId',
          records: records.filter((record) => record.topic.localId.slice(0, 8).toLowerCase() === normalized),
        },
      ]
    : [
        {
          matchedBy: 'localId',
          records: records.filter((record) => record.topic.localId.toLowerCase() === normalized),
        },
        {
          matchedBy: 'slug',
          records: records.filter((record) => record.topic.slug.toLowerCase() === normalized),
        },
        {
          matchedBy: 'dirName',
          records: records.filter((record) => record.dirName.toLowerCase() === normalized),
        },
        {
          matchedBy: 'shortId',
          records: records.filter((record) => record.topic.localId.slice(0, 8).toLowerCase() === normalized),
        },
      ]
  const match = ranks.find((entry) => entry.records.length > 0)
  const warning = options.explicitShortId ? undefined : discussionSelectorWarning(match?.matchedBy)
  return {
    records: match?.records ?? [],
    matchedBy: match?.matchedBy,
    cliDeprecationWarnings: warning ? [warning] : [],
  }
}

export function selectDiscussionTopicRecordsBySelector(
  records: DiscussionTopicRecord[],
  selector: string,
): DiscussionTopicRecord[] {
  return selectDiscussionTopicRecordsBySelectorDetailed(records, selector).records
}

export async function writeDiscussionTopicFile(
  topicsDir: string,
  topic: DiscussionTopic,
): Promise<{ dirName: string; dirPath: string; topicFilePath: string }> {
  const dirName = buildDiscussionTopicDirName(topic)
  const dirPath = path.join(topicsDir, dirName)
  await fs.mkdir(dirPath, { recursive: true })
  const topicFilePath = path.join(dirPath, 'topic.md')
  await fs.writeFile(topicFilePath, buildDiscussionTopicDocument(topic), 'utf8')
  return { dirName, dirPath, topicFilePath }
}

export async function overwriteDiscussionTopicFile(topicFilePath: string, topic: DiscussionTopic): Promise<void> {
  await fs.mkdir(path.dirname(topicFilePath), { recursive: true })
  await fs.writeFile(topicFilePath, buildDiscussionTopicDocument(topic), 'utf8')
}

export async function writeDiscussionTurnFile(
  turnsDir: string,
  turn: DiscussionTurn,
): Promise<{ fileName: string; filePath: string }> {
  await fs.mkdir(turnsDir, { recursive: true })
  const fileName = buildDiscussionTurnFileName(turn)
  const filePath = path.join(turnsDir, fileName)
  try {
    await fs.writeFile(filePath, buildDiscussionTurnDocument(turn), { encoding: 'utf8', flag: 'wx' })
  } catch (error) {
    const code = (error as NodeJS.ErrnoException | undefined)?.code
    if (code === 'EEXIST') {
      throw new Error(`Turn sequence collision for ${fileName}. Re-read the topic state and retry the turn.`)
    }
    throw error
  }
  return { fileName, filePath }
}

export async function writeDiscussionOutputFile(
  outputsDir: string,
  output: DiscussionOutput,
  options: { overwrite?: boolean } = {},
): Promise<{ fileName: string; filePath: string; created: boolean }> {
  await fs.mkdir(outputsDir, { recursive: true })
  const fileName = buildDiscussionOutputFileName(output)
  const filePath = path.join(outputsDir, fileName)
  if (options.overwrite !== true) {
    try {
      await fs.access(filePath)
      return { fileName, filePath, created: false }
    } catch {
      // File does not exist yet.
    }
  }
  await fs.writeFile(filePath, buildDiscussionOutputDocument(output), 'utf8')
  return { fileName, filePath, created: true }
}
