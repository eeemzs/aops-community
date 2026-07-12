function normalizeNonEmpty(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function toRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
}

function toStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((entry) => normalizeNonEmpty(entry)).filter((entry): entry is string => Boolean(entry))
  }
  const normalized = normalizeNonEmpty(value)
  return normalized ? [normalized] : []
}

function tagValue(tags: string[], prefix: string): string | undefined {
  const normalizedPrefix = prefix.toLowerCase()
  const match = tags.find((tag) => tag.toLowerCase().startsWith(normalizedPrefix))
  if (!match) return undefined
  return normalizeNonEmpty(match.slice(prefix.length))
}

function hasPlaybookTag(tags: string[]): boolean {
  return tags.some((tag) => {
    const normalized = tag.toLowerCase()
    return normalized === 'playbook' || normalized.startsWith('playbook-') || normalized.startsWith('playbook:')
  })
}

function contentTitle(content: unknown): string | undefined {
  const text = normalizeNonEmpty(content)
  if (!text) return undefined
  const first = text.split(/\r?\n/).map((line) => line.trim()).find(Boolean)
  return first?.replace(/^#+\s*/, '').slice(0, 120)
}

export type PlaybookProjectionFilter = {
  id?: string
  scope?: string
  area?: string | string[]
  reviewState?: string
  tag?: string | string[]
}

export function isPlaybookMemoryItem(row: Record<string, unknown>): boolean {
  const kind = normalizeNonEmpty(row.kind)?.toLowerCase()
  if (kind !== 'rule' && kind !== 'constraint') return false

  const meta = toRecord(row.meta)
  const playbook = toRecord(meta.playbook)
  if (Object.keys(playbook).length > 0) return true

  return hasPlaybookTag(toStringArray(row.tags))
}

export function toPlaybookProjection(row: Record<string, unknown>): Record<string, unknown> | null {
  if (!isPlaybookMemoryItem(row)) return null

  const meta = toRecord(row.meta)
  const playbook = toRecord(meta.playbook)
  const tags = toStringArray(row.tags)
  const memoryId = normalizeNonEmpty(row.id)
  const playbookId =
    normalizeNonEmpty(playbook.id) ??
    normalizeNonEmpty(playbook.playbookId) ??
    memoryId
  const scope = normalizeNonEmpty(playbook.scope) ?? tagValue(tags, 'playbook-scope:')
  const area = normalizeNonEmpty(playbook.area) ?? tagValue(tags, 'playbook-area:')

  return {
    id: playbookId,
    playbookId,
    title:
      normalizeNonEmpty(playbook.title) ??
      normalizeNonEmpty(row.subjectTitle) ??
      contentTitle(row.content) ??
      playbookId,
    memoryItemId: memoryId,
    sourceMemoryItemId: memoryId,
    kind: normalizeNonEmpty(row.kind),
    durability: normalizeNonEmpty(row.durability),
    scope,
    area,
    appliesWhen: normalizeNonEmpty(playbook.appliesWhen),
    steps: toStringArray(playbook.steps),
    evidence: playbook.evidence,
    enforcement: normalizeNonEmpty(playbook.enforcement),
    confidence: normalizeNonEmpty(playbook.confidence),
    reviewState: normalizeNonEmpty(playbook.reviewState),
    supersedes: normalizeNonEmpty(playbook.supersedes),
    promotedFromExperienceId: normalizeNonEmpty(playbook.promotedFromExperienceId),
    sessionContext: playbook.sessionContext,
    sourceType: normalizeNonEmpty(row.sourceType),
    sourceId: normalizeNonEmpty(row.sourceId),
    content: normalizeNonEmpty(row.content),
    tags,
    createdAt: normalizeNonEmpty(row.createdAt),
    updatedAt: normalizeNonEmpty(row.updatedAt),
    meta: playbook,
    projection: {
      kind: 'agentspace.playbook.memory-projection.v1',
      authority: 'agentspace.memory-item',
      sourceMemoryItemId: memoryId,
    },
  }
}

export function filterPlaybookProjections(
  projections: Record<string, unknown>[],
  filter: PlaybookProjectionFilter = {},
): Record<string, unknown>[] {
  const id = normalizeNonEmpty(filter.id)?.toLowerCase()
  const scope = normalizeNonEmpty(filter.scope)?.toLowerCase()
  const areas = toStringArray(filter.area).map((entry) => entry.toLowerCase())
  const reviewState = normalizeNonEmpty(filter.reviewState)?.toLowerCase()
  const tags = toStringArray(filter.tag).map((entry) => entry.toLowerCase())

  return projections.filter((projection) => {
    if (id) {
      const candidates = [
        projection.id,
        projection.playbookId,
        projection.memoryItemId,
        projection.sourceMemoryItemId,
        projection.title,
      ].map((entry) => normalizeNonEmpty(entry)?.toLowerCase()).filter(Boolean)
      if (!candidates.some((candidate) => candidate === id || candidate?.startsWith(id))) return false
    }
    if (scope && normalizeNonEmpty(projection.scope)?.toLowerCase() !== scope) return false
    if (areas.length > 0 && !areas.includes(normalizeNonEmpty(projection.area)?.toLowerCase() ?? '')) return false
    if (reviewState && normalizeNonEmpty(projection.reviewState)?.toLowerCase() !== reviewState) return false
    if (tags.length > 0) {
      const itemTags = toStringArray(projection.tags).map((entry) => entry.toLowerCase())
      if (!tags.every((tag) => itemTags.includes(tag))) return false
    }
    return true
  })
}

export function toPlaybookProjections(
  rows: Record<string, unknown>[],
  filter: PlaybookProjectionFilter = {},
): Record<string, unknown>[] {
  return filterPlaybookProjections(
    rows.map(toPlaybookProjection).filter((entry): entry is Record<string, unknown> => Boolean(entry)),
    filter,
  )
}
