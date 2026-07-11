import path from 'node:path'

import { compactPayload, normalizeNonEmpty } from './command.js'
import { readExperienceItems, resolveExperienceWorkspacePaths, type ExperienceItem } from './experience-workspace.js'
import type { ActivePlaybookNudgePack, PlaybookBrief, PlaybookSuggestedAction } from './playbook-workspace.js'

export type SessionGuidanceSurface = 'start' | 'start-reminder' | 'mission-resume'

export type SessionGuidanceGuardrailInput = {
  id?: string
  title?: string
  description?: string
  phase?: string
  evidence?: string[]
  enforcementLevel?: string
}

export type SessionGuidanceDisciplineInput = {
  selected?: string
  recommended?: string
  explicit?: boolean
  profile?: {
    id?: string
    version?: string
    title?: string
  }
  guardrails?: SessionGuidanceGuardrailInput[]
}

export type SessionGuidanceExperienceBrief = {
  id: string
  title: string
  type: string
  areas: string[]
  stack: string[]
  tags: string[]
  confidence?: string
  score: number
  scoreReasons: string[]
  updatedAt: string
  contentPreview?: string
}

export type SessionGuidancePack = {
  schemaVersion: 1
  mode: 'session-guidance-pack'
  surface: SessionGuidanceSurface
  readOnly: true
  defaultWrite: false
  hints: Record<string, unknown>
  layers: {
    runtime: {
      id: 'L1-runtime-session-rules'
      items: Array<Record<string, unknown>>
    }
    discipline?: {
      id: 'L2-working-discipline-guardrails'
      selected?: string
      recommended?: string
      explicit?: boolean
      profile?: Record<string, unknown>
      guardrails: Array<Record<string, unknown>>
    }
    playbooks: {
      id: 'L3-accepted-playbook-briefs'
      readOnly: true
      defaultWrite: false
      count: number
      projectCount: number
      sessionCount: number
      data: PlaybookBrief[]
      suggestedActions: PlaybookSuggestedAction[]
      note: string
    }
    experience: {
      id: 'L3-ranked-experience-briefs'
      mode: 'repo-first-experience-briefs'
      readOnly: true
      defaultWrite: false
      filters: Record<string, unknown>
      count: number
      data: SessionGuidanceExperienceBrief[]
      note: string
    }
  }
  suggestedActions: Array<Record<string, unknown>>
  constraints: string[]
}

export type BuildSessionGuidanceOptions = {
  surface: SessionGuidanceSurface
  task?: string
  missionId?: string
  planId?: string
  area?: string
  limit?: string | number
  discipline?: SessionGuidanceDisciplineInput
  playbookNudges?: ActivePlaybookNudgePack
}

type GuidanceContext = {
  repoRoot: string
  localRoot?: string
  projectSlug?: string
}

const DEFAULT_EXPERIENCE_LIMIT = 3
const MAX_EXPERIENCE_LIMIT = 5

function parseLimit(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.min(Math.trunc(value), MAX_EXPERIENCE_LIMIT)
  }
  const normalized = normalizeNonEmpty(value)
  if (!normalized) return DEFAULT_EXPERIENCE_LIMIT
  const parsed = Number.parseInt(normalized, 10)
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_EXPERIENCE_LIMIT
  return Math.min(Math.trunc(parsed), MAX_EXPERIENCE_LIMIT)
}

function summarizeContent(content: string | undefined, maxLength = 180): string | undefined {
  const compact = normalizeNonEmpty(content)?.replace(/\s+/g, ' ')
  if (!compact) return undefined
  if (compact.length <= maxLength) return compact
  return `${compact.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`
}

function tokenize(value: string | undefined): string[] {
  const normalized = normalizeNonEmpty(value)?.toLowerCase()
  if (!normalized) return []
  return [...new Set(normalized.split(/[^a-z0-9]+/).filter((token) => token.length >= 3))]
}

function sourceRefsContain(item: ExperienceItem, expected: string | undefined): boolean {
  if (!expected) return false
  return item.sourceRefs.some((ref) => {
    if (!ref || typeof ref !== 'object' || Array.isArray(ref)) return false
    const record = ref as Record<string, unknown>
    const refId = normalizeNonEmpty(record.refId) ?? normalizeNonEmpty(record.id)
    return refId === expected
  })
}

function scoreExperience(item: ExperienceItem, options: BuildSessionGuidanceOptions): { score: number; reasons: string[] } {
  const reasons: string[] = []
  let score = 0
  const area = normalizeNonEmpty(options.area)?.toLowerCase()
  const taskTokens = tokenize(options.task)
  const haystackParts = [
    item.title,
    item.problem,
    item.solution,
    item.content,
    ...item.areas,
    ...item.stack,
    ...item.tags,
    ...item.commands,
    ...item.files,
  ].map((entry) => normalizeNonEmpty(entry)?.toLowerCase()).filter((entry): entry is string => Boolean(entry))
  const haystack = haystackParts.join(' ')

  if (area && item.areas.some((entry) => entry.toLowerCase() === area)) {
    score += 30
    reasons.push(`area:${area}`)
  }

  if (sourceRefsContain(item, options.missionId)) {
    score += 25
    reasons.push('mission-ref')
  }

  if (sourceRefsContain(item, options.planId)) {
    score += 20
    reasons.push('plan-ref')
  }

  for (const token of taskTokens) {
    if (haystack.includes(token)) {
      score += 4
      reasons.push(`task:${token}`)
    }
  }

  if (item.confidence?.toLowerCase() === 'high') {
    score += 3
    reasons.push('confidence:high')
  }

  if (item.reusability?.toLowerCase() === 'high') {
    score += 2
    reasons.push('reusability:high')
  }

  return { score, reasons }
}

function toExperienceBrief(item: ExperienceItem, score: number, reasons: string[]): SessionGuidanceExperienceBrief {
  return {
    id: item.localId,
    title: item.title,
    type: item.type,
    areas: item.areas,
    stack: item.stack,
    tags: item.tags,
    confidence: item.confidence,
    score,
    scoreReasons: reasons,
    updatedAt: item.updatedAt,
    contentPreview: summarizeContent(item.content),
  }
}

async function buildExperienceBriefs(context: GuidanceContext, options: BuildSessionGuidanceOptions): Promise<SessionGuidanceExperienceBrief[]> {
  const paths = resolveExperienceWorkspacePaths({ repoRoot: context.repoRoot, localRoot: context.localRoot })
  const limit = parseLimit(options.limit)
  const items = await readExperienceItems(paths.itemsDir)
  return items
    .map((item) => {
      const scored = scoreExperience(item, options)
      return { item, ...scored }
    })
    .filter((entry) => entry.score > 0 || normalizeNonEmpty(options.area) === undefined)
    .sort((left, right) => {
      if (right.score !== left.score) return right.score - left.score
      const updated = right.item.updatedAt.localeCompare(left.item.updatedAt)
      if (updated !== 0) return updated
      return left.item.localId.localeCompare(right.item.localId)
    })
    .slice(0, limit)
    .map((entry) => toExperienceBrief(entry.item, entry.score, entry.reasons))
}

function flattenPlaybookBriefs(playbookNudges: ActivePlaybookNudgePack | undefined): PlaybookBrief[] {
  if (!playbookNudges) return []
  const data = [...playbookNudges.project.data, ...playbookNudges.session.data]
  return data.slice(0, MAX_EXPERIENCE_LIMIT)
}

function readOnlyPlaybookActions(playbookNudges: ActivePlaybookNudgePack | undefined): PlaybookSuggestedAction[] {
  return (playbookNudges?.suggestedActions ?? []).filter((action) => action.applyRequired === false)
}

function runtimeLayer(context: GuidanceContext, options: BuildSessionGuidanceOptions): SessionGuidancePack['layers']['runtime'] {
  return {
    id: 'L1-runtime-session-rules',
    items: [
      {
        id: 'agents-md',
        title: 'Project AGENTS.md and local operator instructions',
        source: path.relative(context.repoRoot, path.join(context.repoRoot, 'AGENTS.md')).split(path.sep).join('/'),
        required: true,
        note: 'Read project runtime rules before acting; they define owner boundaries, PM discipline, and repo-local constraints.',
      },
      {
        id: 'chatv3-room-rules',
        title: 'ChatV3 channel and room guidance',
        source: 'chatv3.guidanceMarkdown',
        required: options.surface === 'start-reminder',
        note: 'When a hosted room is active, read room rules and latest messages; chat is coordination, PM/discuss/memory remain truth ledgers.',
      },
      {
        id: 'operator-current-instruction',
        title: 'Current operator instruction',
        source: 'current prompt or latest chat directive',
        required: true,
        note: 'Newest operator instruction wins when it conflicts with older session context.',
      },
    ],
  }
}

function disciplineLayer(input: SessionGuidanceDisciplineInput | undefined): SessionGuidancePack['layers']['discipline'] {
  if (!input) return undefined
  return {
    id: 'L2-working-discipline-guardrails',
    selected: normalizeNonEmpty(input.selected),
    recommended: normalizeNonEmpty(input.recommended),
    explicit: input.explicit,
    profile: input.profile
      ? compactPayload({
          id: normalizeNonEmpty(input.profile.id),
          version: normalizeNonEmpty(input.profile.version),
          title: normalizeNonEmpty(input.profile.title),
        })
      : undefined,
    guardrails: (input.guardrails ?? []).map((guardrail) => compactPayload({
      id: normalizeNonEmpty(guardrail.id),
      title: normalizeNonEmpty(guardrail.title),
      phase: normalizeNonEmpty(guardrail.phase),
      enforcementLevel: normalizeNonEmpty(guardrail.enforcementLevel),
    })),
  }
}

function buildSuggestedActions(params: {
  context: GuidanceContext
  options: BuildSessionGuidanceOptions
  playbookNudges?: ActivePlaybookNudgePack
}): Array<Record<string, unknown>> {
  const projectSlug = normalizeNonEmpty(params.context.projectSlug)
  const area = normalizeNonEmpty(params.options.area)
  const task = normalizeNonEmpty(params.options.task)
  return [
    {
      kind: 'read-runtime-rules',
      mode: 'read-only',
      applyRequired: false,
      command: 'Read AGENTS.md in the active repo before implementation.',
    },
    ...readOnlyPlaybookActions(params.playbookNudges).map((action) => ({
      ...action,
      mode: 'read-only',
      applyRequired: false,
    })),
    {
      kind: 'inspect-experience',
      mode: 'read-only',
      applyRequired: false,
      command: [
        'aops-cli view experience',
        projectSlug ? `--project-slug ${projectSlug}` : undefined,
        area ? `--area ${area}` : undefined,
        '--json',
      ].filter(Boolean).join(' '),
      note: task
        ? 'Use ranked experience briefs first, then inspect the full view only if the task still needs more context.'
        : 'Inspect repo-first experience only when the reminder pack is not enough.',
    },
  ]
}

export async function buildSessionGuidancePack(
  context: GuidanceContext,
  options: BuildSessionGuidanceOptions,
): Promise<SessionGuidancePack> {
  const missionId = normalizeNonEmpty(options.missionId)
  const planId = normalizeNonEmpty(options.planId)
  const area = normalizeNonEmpty(options.area)
  const task = normalizeNonEmpty(options.task)
  const experience = await buildExperienceBriefs(context, options)
  const playbookData = flattenPlaybookBriefs(options.playbookNudges)
  const suggestedActions = buildSuggestedActions({ context, options, playbookNudges: options.playbookNudges })

  return {
    schemaVersion: 1,
    mode: 'session-guidance-pack',
    surface: options.surface,
    readOnly: true,
    defaultWrite: false,
    hints: compactPayload({
      task,
      missionId,
      planId,
      area,
      experienceLimit: parseLimit(options.limit),
    }),
    layers: compactPayload({
      runtime: runtimeLayer(context, options),
      discipline: disciplineLayer(options.discipline),
      playbooks: {
        id: 'L3-accepted-playbook-briefs',
        readOnly: true,
        defaultWrite: false,
        count: playbookData.length,
        projectCount: options.playbookNudges?.project.count ?? 0,
        sessionCount: options.playbookNudges?.session.count ?? 0,
        data: playbookData,
        suggestedActions: readOnlyPlaybookActions(options.playbookNudges),
        note: 'Accepted playbooks are guidance only; start/reminder/resume never promote, capture, or mutate playbooks.',
      },
      experience: {
        id: 'L3-ranked-experience-briefs',
        mode: 'repo-first-experience-briefs',
        readOnly: true,
        defaultWrite: false,
        filters: compactPayload({
          area,
          task,
          missionId,
          planId,
          limit: parseLimit(options.limit),
          maxLimit: MAX_EXPERIENCE_LIMIT,
        }),
        count: experience.length,
        data: experience,
        note: 'Experience briefs are deterministic repo-first reads ranked by area, source refs, task token matches, confidence, recency, then id.',
      },
    }) as SessionGuidancePack['layers'],
    suggestedActions,
    constraints: [
      'read-only',
      'defaultWrite=false',
      'no checkpoint, PM, chat, experience, memory, or playbook mutation',
      'bounded experience briefs: default 3, max 5',
      'start --reminder does not require board, room, roles, or full kickoff prompt rendering',
    ],
  }
}
