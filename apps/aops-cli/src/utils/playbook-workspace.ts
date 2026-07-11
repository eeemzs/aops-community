import { compactPayload, normalizeNonEmpty } from './command.js'
import {
  readLocalMemoryEntries,
  resolveMemoryWorkspacePaths,
  type MemoryWorkspaceEntry,
} from './memory-workspace.js'

export type PlaybookScope = 'session' | 'project'
export type PlaybookReviewState = 'proposed' | 'accepted' | 'superseded' | 'archived'
export type PlaybookEnforcement = 'advisory' | 'soft-preflight' | 'strict-opt-in'

export type PlaybookSessionContext = {
  sessionId?: string
  missionId?: string
  chatv3Seq?: string
  pmRefs?: string[]
  discussRefs?: string[]
}

export type PlaybookMetaInput = {
  id?: string
  title: string
  scope?: string
  area?: string
  appliesWhen?: string
  steps?: string[]
  evidence?: Record<string, unknown>
  enforcement?: string
  confidence?: string
  reviewState?: string
  supersedes?: string
  promotedFromExperienceId?: string
  sessionContext?: PlaybookSessionContext
}

export type PlaybookRecord = {
  id?: string
  playbookId?: string
  title?: string
  memoryItemId?: string
  kind?: string
  durability?: string
  scope?: string
  area?: string
  appliesWhen?: string
  steps?: string[]
  enforcement?: string
  confidence?: string
  reviewState?: string
  supersedes?: string
  promotedFromExperienceId?: string
  sessionContext?: unknown
  sourceType?: string
  sourceId?: string
  sourceRefs?: unknown[]
  content?: string
  tags: string[]
  updatedAt?: string
  createdAt?: string
}

export type PlaybookBrief = {
  id?: string
  title?: string
  scope?: string
  area?: string
  kind?: string
  durability?: string
  reviewState?: string
  enforcement?: string
  appliesWhen?: string
  steps: string[]
  contentPreview?: string
  tags: string[]
  memoryItemId?: string
  promotedFromExperienceId?: string
  sourceType?: string
  sourceId?: string
  updatedAt?: string
}

export type ProjectPlaybookSet = {
  mode: 'repo-first-playbook-set'
  readOnly: true
  scope: 'project'
  filters: {
    scope: 'project'
    durability: string[]
    reviewState: string[]
    limit: number
  }
  count: number
  data: PlaybookBrief[]
  suggestedActions: PlaybookSuggestedAction[]
  note: string
}

export type PlaybookSuggestedAction = {
  kind: string
  mode: 'read-only' | 'nudge-first'
  applyRequired: boolean
  command: string
  note: string
  policyPath?: string
}

export type ActiveSessionPlaybookSet = {
  mode: 'repo-first-playbook-set'
  readOnly: true
  scope: 'session'
  filters: {
    scope: 'session'
    durability: string[]
    reviewState: string[]
    missionId?: string
    limit: number
  }
  count: number
  data: PlaybookBrief[]
  suggestedActions: PlaybookSuggestedAction[]
  note: string
}

export type ActivePlaybookNudgePack = {
  mode: 'active-playbook-nudge-pack'
  readOnly: true
  defaultWrite: false
  missionId?: string
  project: ProjectPlaybookSet
  session: ActiveSessionPlaybookSet
  count: number
  suggestedActions: PlaybookSuggestedAction[]
  closeoutCapture: {
    mode: 'nudge-first'
    defaultWrite: false
    triggerSignals: string[]
    suggestedActions: PlaybookSuggestedAction[]
    note: string
  }
  examples: Array<{
    kind: 'hexagen-as-playbook'
    title: string
    flow: string[]
    commands: string[]
    note: string
  }>
  note: string
}

function toStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((entry) => normalizeNonEmpty(entry)).filter((entry): entry is string => Boolean(entry))
  }
  const normalized = normalizeNonEmpty(value)
  return normalized ? [normalized] : []
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function toRecordArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isRecord) : []
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

function tagValue(tags: string[], prefix: string): string | undefined {
  const normalizedPrefix = prefix.toLowerCase()
  const match = tags.find((tag) => tag.toLowerCase().startsWith(normalizedPrefix))
  return match ? normalizeNonEmpty(match.slice(prefix.length)) : undefined
}

function hasPlaybookTag(tags: string[]): boolean {
  return tags.some((tag) => {
    const normalized = tag.toLowerCase()
    return normalized === 'playbook' || normalized.startsWith('playbook-') || normalized.startsWith('playbook:')
  })
}

function contentTitle(content: string | undefined): string | undefined {
  const first = normalizeNonEmpty(content)?.split(/\r?\n/).map((line) => line.trim()).find(Boolean)
  return first?.replace(/^#+\s*/, '').slice(0, 120)
}

function summarizeContent(content: string | undefined, maxLength = 240): string | undefined {
  const compact = normalizeNonEmpty(content)?.replace(/\s+/g, ' ')
  if (!compact) return undefined
  if (compact.length <= maxLength) return compact
  return `${compact.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`
}

export function normalizePlaybookScope(value: unknown): PlaybookScope {
  const normalized = normalizeNonEmpty(value)?.toLowerCase()
  return normalized === 'session' ? 'session' : 'project'
}

export function normalizePlaybookReviewState(value: unknown): PlaybookReviewState {
  const normalized = normalizeNonEmpty(value)?.toLowerCase()
  if (normalized === 'accepted' || normalized === 'superseded' || normalized === 'archived') return normalized
  return 'proposed'
}

export function normalizePlaybookEnforcement(value: unknown): PlaybookEnforcement {
  const normalized = normalizeNonEmpty(value)?.toLowerCase()
  if (normalized === 'soft-preflight' || normalized === 'strict-opt-in') return normalized
  return 'advisory'
}

export function buildPlaybookTags(params: {
  scope?: string
  area?: string
  source?: string
  extraTags?: string[]
}): string[] {
  const scope = normalizePlaybookScope(params.scope)
  const area = normalizeNonEmpty(params.area)
  const source = normalizeNonEmpty(params.source)
  return uniqueStrings([
    'playbook',
    `playbook-scope:${scope}`,
    area ? `playbook-area:${area}` : undefined,
    source ? `playbook-source:${source}` : undefined,
    ...(params.extraTags ?? []),
  ])
}

export function buildPlaybookMeta(input: PlaybookMetaInput): Record<string, unknown> {
  const scope = normalizePlaybookScope(input.scope)
  return compactPayload({
    id: normalizeNonEmpty(input.id),
    title: normalizeNonEmpty(input.title) ?? 'Untitled playbook',
    scope,
    area: normalizeNonEmpty(input.area),
    appliesWhen: normalizeNonEmpty(input.appliesWhen),
    steps: uniqueStrings(input.steps ?? []),
    evidence: input.evidence,
    enforcement: normalizePlaybookEnforcement(input.enforcement),
    confidence: normalizeNonEmpty(input.confidence),
    reviewState: normalizePlaybookReviewState(input.reviewState),
    supersedes: normalizeNonEmpty(input.supersedes),
    promotedFromExperienceId: normalizeNonEmpty(input.promotedFromExperienceId),
    sessionContext: input.sessionContext && Object.keys(compactPayload(input.sessionContext as Record<string, unknown>)).length > 0
      ? compactPayload(input.sessionContext as Record<string, unknown>)
      : undefined,
  })
}

export function isPlaybookMemoryEntry(entry: MemoryWorkspaceEntry): boolean {
  const kind = normalizeNonEmpty(entry.kind)?.toLowerCase()
  if (kind !== 'rule' && kind !== 'constraint') return false
  const meta = isRecord(entry.raw?.meta) ? entry.raw.meta : {}
  const playbook = isRecord(meta.playbook) ? meta.playbook : {}
  return Object.keys(playbook).length > 0 || hasPlaybookTag(entry.tags)
}

export function memoryEntryToPlaybookRecord(entry: MemoryWorkspaceEntry): PlaybookRecord | null {
  if (!isPlaybookMemoryEntry(entry)) return null
  const meta = isRecord(entry.raw?.meta) ? entry.raw.meta : {}
  const playbook = isRecord(meta.playbook) ? meta.playbook : {}
  const sourceType = normalizeNonEmpty(entry.raw?.sourceType)
  const sourceId = normalizeNonEmpty(entry.raw?.sourceId)
  const id = normalizeNonEmpty(playbook.id) ?? entry.memoryId ?? entry.id
  const scope = normalizeNonEmpty(playbook.scope) ?? tagValue(entry.tags, 'playbook-scope:')
  const area = normalizeNonEmpty(playbook.area) ?? tagValue(entry.tags, 'playbook-area:')
  return {
    id,
    playbookId: id,
    title: normalizeNonEmpty(playbook.title) ?? entry.subjectTitle ?? contentTitle(entry.content) ?? id,
    memoryItemId: entry.memoryId ?? entry.id,
    kind: entry.kind,
    durability: entry.durability,
    scope,
    area,
    appliesWhen: normalizeNonEmpty(playbook.appliesWhen),
    steps: toStringArray(playbook.steps),
    enforcement: normalizeNonEmpty(playbook.enforcement),
    confidence: normalizeNonEmpty(playbook.confidence),
    reviewState: normalizeNonEmpty(playbook.reviewState),
    supersedes: normalizeNonEmpty(playbook.supersedes),
    promotedFromExperienceId: normalizeNonEmpty(playbook.promotedFromExperienceId),
    sessionContext: playbook.sessionContext,
    sourceType,
    sourceId,
    sourceRefs: entry.sourceRefs,
    content: entry.content,
    tags: entry.tags,
    updatedAt: entry.updatedAt,
    createdAt: entry.createdAt,
  }
}

export function toPlaybookBrief(record: PlaybookRecord): PlaybookBrief {
  return {
    id: record.id ?? record.playbookId,
    title: record.title,
    scope: record.scope,
    area: record.area,
    kind: record.kind,
    durability: record.durability,
    reviewState: record.reviewState,
    enforcement: record.enforcement,
    appliesWhen: record.appliesWhen,
    steps: record.steps ?? [],
    contentPreview: summarizeContent(record.content),
    tags: record.tags,
    memoryItemId: record.memoryItemId,
    promotedFromExperienceId: record.promotedFromExperienceId,
    sourceType: record.sourceType,
    sourceId: record.sourceId,
    updatedAt: record.updatedAt ?? record.createdAt,
  }
}

export function renderPlaybookMarkdown(record: PlaybookRecord): string {
  const brief = toPlaybookBrief(record)
  const lines = [`# ${brief.title ?? brief.id ?? 'Playbook'}`, '']
  const facts = compactPayload({
    id: brief.id,
    memoryItemId: brief.memoryItemId,
    scope: brief.scope,
    area: brief.area,
    kind: brief.kind,
    durability: brief.durability,
    reviewState: brief.reviewState,
    enforcement: brief.enforcement,
    appliesWhen: brief.appliesWhen,
    promotedFromExperienceId: brief.promotedFromExperienceId,
    updatedAt: brief.updatedAt,
  })
  lines.push('## Facts')
  Object.entries(facts).forEach(([key, value]) => lines.push(`- ${key}: ${String(value)}`))
  lines.push('')
  lines.push('## Steps')
  if (brief.steps.length === 0) {
    lines.push('- No structured steps recorded.')
  } else {
    brief.steps.forEach((step) => lines.push(`- ${step}`))
  }
  lines.push('')
  lines.push('## Content')
  lines.push(normalizeNonEmpty(record.content) ?? brief.contentPreview ?? 'No content recorded.')
  if (brief.tags.length > 0) {
    lines.push('', '## Tags', brief.tags.map((tag) => `- ${tag}`).join('\n'))
  }
  return `${lines.join('\n')}\n`
}

export function filterPlaybookRecords(records: PlaybookRecord[], filter: {
  id?: string
  scope?: string
  area?: string[]
  durability?: string[]
  reviewState?: string
  tag?: string[]
  limit?: number
} = {}): PlaybookRecord[] {
  const id = normalizeNonEmpty(filter.id)?.toLowerCase()
  const scope = normalizeNonEmpty(filter.scope)?.toLowerCase()
  const areas = toStringArray(filter.area).map((entry) => entry.toLowerCase())
  const durability = toStringArray(filter.durability).map((entry) => entry.toLowerCase())
  const reviewState = normalizeNonEmpty(filter.reviewState)?.toLowerCase()
  const tags = toStringArray(filter.tag).map((entry) => entry.toLowerCase())
  const filtered = records.filter((record) => {
    if (id) {
      const candidates = [record.id, record.playbookId, record.memoryItemId, record.title]
        .map((entry) => normalizeNonEmpty(entry)?.toLowerCase())
        .filter(Boolean)
      if (!candidates.some((candidate) => candidate === id || candidate?.startsWith(id))) return false
    }
    if (scope && normalizeNonEmpty(record.scope)?.toLowerCase() !== scope) return false
    if (areas.length > 0 && !areas.includes(normalizeNonEmpty(record.area)?.toLowerCase() ?? '')) return false
    if (durability.length > 0 && !durability.includes(normalizeNonEmpty(record.durability)?.toLowerCase() ?? '')) return false
    if (reviewState && normalizeNonEmpty(record.reviewState)?.toLowerCase() !== reviewState) return false
    if (tags.length > 0) {
      const itemTags = record.tags.map((tag) => tag.toLowerCase())
      if (!tags.every((tag) => itemTags.includes(tag))) return false
    }
    return true
  })
  return Number.isFinite(filter.limit) && filter.limit && filter.limit > 0
    ? filtered.slice(0, Math.trunc(filter.limit))
    : filtered
}

function getSessionContextMissionId(record: PlaybookRecord): string | undefined {
  return isRecord(record.sessionContext) ? normalizeNonEmpty(record.sessionContext.missionId) : undefined
}

function sourceRefsIncludeMission(record: PlaybookRecord, missionId: string): boolean {
  return toRecordArray(record.sourceRefs).some((ref) => {
    const refType = normalizeNonEmpty(ref.refType)?.toLowerCase()
    const refId = normalizeNonEmpty(ref.refId) ?? normalizeNonEmpty(ref.id)
    return refId === missionId && (refType === undefined || refType === 'agentspace.mission' || refType === 'mission')
  })
}

function isActiveSessionPlaybook(record: PlaybookRecord, missionId?: string): boolean {
  if (normalizeNonEmpty(record.scope)?.toLowerCase() !== 'session') return false
  if (!missionId) return true
  return getSessionContextMissionId(record) === missionId || sourceRefsIncludeMission(record, missionId)
}

function buildSessionPlaybookSet(records: PlaybookRecord[], options: {
  projectSlug?: string
  missionId?: string
  reviewState?: string[]
  durability?: string[]
  limit?: number
} = {}): ActiveSessionPlaybookSet {
  const missionId = normalizeNonEmpty(options.missionId)
  const reviewState = toStringArray(options.reviewState).length > 0
    ? toStringArray(options.reviewState).map((entry) => entry.toLowerCase())
    : ['accepted']
  const durability = toStringArray(options.durability).length > 0
    ? toStringArray(options.durability).map((entry) => entry.toLowerCase())
    : ['short', 'durable', 'sticky']
  const limit = Number.isFinite(options.limit) && options.limit && options.limit > 0
    ? Math.trunc(options.limit)
    : 8
  const filtered = records.filter((record) => {
    if (!isActiveSessionPlaybook(record, missionId)) return false
    if (!durability.includes(normalizeNonEmpty(record.durability)?.toLowerCase() ?? '')) return false
    if (!reviewState.includes(normalizeNonEmpty(record.reviewState)?.toLowerCase() ?? '')) return false
    return true
  }).slice(0, limit)
  const command = [
    'aops-cli playbook list',
    options.projectSlug ? `--project-slug ${options.projectSlug}` : undefined,
    '--scope session',
    ...reviewState.map((state) => `--review-state ${state}`),
    '--json',
  ].filter(Boolean).join(' ')
  return {
    mode: 'repo-first-playbook-set',
    readOnly: true,
    scope: 'session',
    filters: {
      scope: 'session',
      durability,
      reviewState,
      ...(missionId ? { missionId } : {}),
      limit,
    },
    count: filtered.length,
    data: filtered.map(toPlaybookBrief),
    suggestedActions: [
      {
        kind: 'inspect-session-playbooks',
        mode: 'read-only',
        applyRequired: false,
        command,
        policyPath: 'mission.policy.playbook.sessionSet',
        note: missionId
          ? 'Review accepted session-scope playbooks attached to this mission before resuming work.'
          : 'Review accepted session-scope playbooks before resuming active work.',
      },
    ],
    note: 'Session playbooks are read-only active-mission guidance; start/resume surfaces never promote them silently.',
  }
}

export function buildProjectPlaybookSet(records: PlaybookRecord[], options: {
  projectSlug?: string
  reviewState?: string[]
  durability?: string[]
  limit?: number
} = {}): ProjectPlaybookSet {
  const reviewState = toStringArray(options.reviewState).length > 0
    ? toStringArray(options.reviewState).map((entry) => entry.toLowerCase())
    : ['accepted']
  const durability = toStringArray(options.durability).length > 0
    ? toStringArray(options.durability).map((entry) => entry.toLowerCase())
    : ['sticky', 'durable']
  const limit = Number.isFinite(options.limit) && options.limit && options.limit > 0
    ? Math.trunc(options.limit)
    : 8
  const filtered = records.filter((record) => {
    if (normalizeNonEmpty(record.scope)?.toLowerCase() !== 'project') return false
    if (!durability.includes(normalizeNonEmpty(record.durability)?.toLowerCase() ?? '')) return false
    if (!reviewState.includes(normalizeNonEmpty(record.reviewState)?.toLowerCase() ?? '')) return false
    return true
  }).slice(0, limit)
  const command = [
    'aops-cli playbook project-set',
    options.projectSlug ? `--project-slug ${options.projectSlug}` : undefined,
    '--scope project',
    ...reviewState.map((state) => `--review-state ${state}`),
    '--json',
  ].filter(Boolean).join(' ')
  return {
    mode: 'repo-first-playbook-set',
    readOnly: true,
    scope: 'project',
    filters: {
      scope: 'project',
      durability,
      reviewState,
      limit,
    },
    count: filtered.length,
    data: filtered.map(toPlaybookBrief),
    suggestedActions: [
      {
        kind: 'inspect-project-playbooks',
        mode: 'read-only',
        applyRequired: false,
        command,
        policyPath: 'mission.policy.playbook.projectSet',
        note: 'Review accepted project-scope playbooks before starting or resuming work.',
      },
    ],
    note: 'Project playbooks are read-only start/resume guidance projected from sticky or durable memory rules/constraints.',
  }
}

export function buildActivePlaybookNudgePack(records: PlaybookRecord[], options: {
  projectSlug?: string
  missionId?: string
  reviewState?: string[]
  projectDurability?: string[]
  sessionDurability?: string[]
  limit?: number
} = {}): ActivePlaybookNudgePack {
  const missionId = normalizeNonEmpty(options.missionId)
  const project = buildProjectPlaybookSet(records, {
    projectSlug: options.projectSlug,
    reviewState: options.reviewState,
    durability: options.projectDurability,
    limit: options.limit,
  })
  const session = buildSessionPlaybookSet(records, {
    projectSlug: options.projectSlug,
    missionId,
    reviewState: options.reviewState,
    durability: options.sessionDurability,
    limit: options.limit,
  })
  const closeoutCaptureActions: PlaybookSuggestedAction[] = [
    {
      kind: 'capture-closeout-experience',
      mode: 'nudge-first',
      applyRequired: true,
      command: [
        'aops-cli experience capture',
        '--type pattern',
        '--title "Hexagen backend playbook candidate"',
        '--area hexagen',
        '--tag playbook-candidate',
        missionId ? `--mission-id ${missionId}` : undefined,
        '--content "<reviewed closeout pattern, evidence, and applicability>"',
        '--apply --json',
      ].filter(Boolean).join(' '),
      policyPath: 'mission.policy.playbook.closeoutCapture.capture',
      note: 'At closeout, capture only reviewed operator/reviewer signal as experience; this is an explicit write.',
    },
    {
      kind: 'promote-closeout-playbook',
      mode: 'nudge-first',
      applyRequired: true,
      command: [
        'aops-cli playbook promote',
        '--id <experience-id>',
        options.projectSlug ? `--project-slug ${options.projectSlug}` : undefined,
        '--scope project',
        '--area hexagen',
        '--review-state accepted',
        '--applies-when "A future hexagen backend slice needs the same generated-domain pattern"',
        '--apply --json',
      ].filter(Boolean).join(' '),
      policyPath: 'mission.policy.playbook.closeoutCapture.promote',
      note: 'Promote a reviewed experience into an accepted playbook only after operator/reviewer signal.',
    },
    {
      kind: 'write-closeout-summary',
      mode: 'nudge-first',
      applyRequired: true,
      command: 'aops-cli mem summary --closeout --durability durable --confirm --content "<outcome, validation, review evidence, next action>" --apply --json',
      policyPath: 'mission.policy.closeout.handoff',
      note: 'Durable closeout memory remains explicit and confirmed; it is evidence for later playbook promotion, not an automatic promotion.',
    },
  ]
  const hexagenCommands = [
    'aops-cli experience capture --type pattern --title "Hexagen backend slice pattern" --area hexagen --command "<validated generation/build/test commands>" --source-ref "<PM/RR refs>" --apply --json',
    'aops-cli playbook promote --id <experience-id> --scope project --area hexagen --review-state accepted --step "<repeatable hexagen step>" --apply --json',
    options.projectSlug
      ? `aops-cli playbook project-set --project-slug ${options.projectSlug} --scope project --review-state accepted --json`
      : 'aops-cli playbook project-set --scope project --review-state accepted --json',
  ]
  return {
    mode: 'active-playbook-nudge-pack',
    readOnly: true,
    defaultWrite: false,
    ...(missionId ? { missionId } : {}),
    project,
    session,
    count: project.count + session.count,
    suggestedActions: [
      ...project.suggestedActions,
      ...session.suggestedActions,
      ...closeoutCaptureActions,
    ],
    closeoutCapture: {
      mode: 'nudge-first',
      defaultWrite: false,
      triggerSignals: ['operator-closeout', 'reviewer-approved-pattern', 'validated-repeatable-hexagen-flow'],
      suggestedActions: closeoutCaptureActions,
      note: 'Closeout capture/promote is surfaced as opt-in commands only; no start/resume path writes experience, memory, or playbooks.',
    },
    examples: [
      {
        kind: 'hexagen-as-playbook',
        title: 'Hexagen backend slice as accepted project playbook',
        flow: [
          'Complete a hexagen backend slice and gather validation/review evidence.',
          'At closeout, capture the repeatable pattern as an experience item with PM/RR/source refs.',
          'Promote the reviewed experience into an accepted project-scope playbook.',
          'On the next start/resume, read the accepted project playbook through playbook project-set before implementing.',
        ],
        commands: hexagenCommands,
        note: 'Example only; every write command is explicit and guarded with --apply.',
      },
    ],
    note: 'Active playbooks are guidance and nudges. Start/resume reads them and suggests explicit commands; it never writes or promotes playbooks silently.',
  }
}

export async function readLocalPlaybookRecordsFromContext(context: {
  repoRoot: string
  localRoot?: string
}): Promise<PlaybookRecord[]> {
  const paths = resolveMemoryWorkspacePaths(context)
  const entries = await readLocalMemoryEntries(paths.localItemsDir)
  return entries
    .map(memoryEntryToPlaybookRecord)
    .filter((entry): entry is NonNullable<ReturnType<typeof memoryEntryToPlaybookRecord>> => Boolean(entry))
}

export async function buildReadOnlyProjectPlaybookSetFromContext(context: {
  repoRoot: string
  localRoot?: string
  projectSlug?: string
}): Promise<ProjectPlaybookSet> {
  const records = await readLocalPlaybookRecordsFromContext(context)
  return buildProjectPlaybookSet(records, { projectSlug: context.projectSlug })
}

export async function buildReadOnlyActivePlaybookNudgePackFromContext(context: {
  repoRoot: string
  localRoot?: string
  projectSlug?: string
}, options: {
  missionId?: string
  limit?: number
} = {}): Promise<ActivePlaybookNudgePack> {
  const records = await readLocalPlaybookRecordsFromContext(context)
  return buildActivePlaybookNudgePack(records, {
    projectSlug: context.projectSlug,
    missionId: options.missionId,
    limit: options.limit,
  })
}
