import fs from 'node:fs/promises'
import path from 'node:path'

export type SessionStateNudgeKind = 'checkpoint-delayed' | 'summary-missing'

export type SessionStateNudge = {
  kind: SessionStateNudgeKind
  severity: 'warning'
  message: string
  action: string
  sourcePath: string
  label?: string
  taskId?: string
  sprintId?: string
  lastBriefAt?: string
  lastCheckpointAt?: string
  lastSummaryAt?: string
  ageMinutes?: number
}

export type SessionStateReadOptions = {
  repoRoot: string
  localRoot?: string
  now?: Date
  checkpointDelayMinutes?: number
  summaryDelayMinutes?: number
}

type SessionStateRecord = Record<string, unknown>

const DEFAULT_CHECKPOINT_DELAY_MINUTES = 30
const DEFAULT_SUMMARY_DELAY_MINUTES = 120

function stringValue(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function booleanValue(value: unknown): boolean {
  return value === true || value === 'true' || value === 'yes' || value === 'due'
}

function parseTimestamp(value: unknown): number | undefined {
  const raw = stringValue(value)
  if (!raw) return undefined
  const parsed = Date.parse(raw)
  return Number.isFinite(parsed) ? parsed : undefined
}

function isoTimestamp(value: unknown): string | undefined {
  const parsed = parseTimestamp(value)
  return parsed === undefined ? undefined : new Date(parsed).toISOString()
}

function minutesSince(value: number | undefined, nowMs: number): number | undefined {
  if (value === undefined) return undefined
  return Math.max(0, Math.floor((nowMs - value) / 60000))
}

function checkpointNudgeAction(record: SessionStateRecord): string {
  const parts = [
    'aops-cli checkpoint create',
    '--summary "<checkpoint summary>"',
  ]
  const taskId = stringValue(record.taskId)
  const sprintId = stringValue(record.sprintId)
  if (taskId) parts.push(`--task-id ${taskId}`)
  if (sprintId) parts.push(`--sprint-id ${sprintId}`)
  parts.push('--apply --json')
  return parts.join(' ')
}

function repoRelative(repoRoot: string, filePath: string): string {
  return path.relative(repoRoot, filePath).split(path.sep).join('/')
}

function sessionStateDirs(repoRoot: string, localRoot?: string): string[] {
  const dirs = [path.join(repoRoot, '.aops', 'agentspace', 'session-state')]
  if (localRoot) {
    const localDir = path.join(repoRoot, localRoot, 'agentspace', 'session-state')
    if (!dirs.includes(localDir)) dirs.push(localDir)
  }
  return dirs
}

async function readJsonFiles(dir: string): Promise<Array<{ filePath: string; record: SessionStateRecord }>> {
  let entries: string[]
  try {
    entries = await fs.readdir(dir)
  } catch {
    return []
  }

  const records: Array<{ filePath: string; record: SessionStateRecord }> = []
  for (const entry of entries.sort()) {
    if (!entry.endsWith('.json')) continue
    const filePath = path.join(dir, entry)
    try {
      const parsed = JSON.parse(await fs.readFile(filePath, 'utf8'))
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        records.push({ filePath, record: parsed as SessionStateRecord })
      }
    } catch {
      // Ignore malformed transient state files; they should not block read-only views.
    }
  }
  return records
}

function recordNudges(
  repoRoot: string,
  filePath: string,
  record: SessionStateRecord,
  options: Required<Pick<SessionStateReadOptions, 'checkpointDelayMinutes' | 'summaryDelayMinutes'>> & { now: Date },
): SessionStateNudge[] {
  const nowMs = options.now.getTime()
  const lastBriefAtMs = parseTimestamp(record.lastBriefAt)
  const lastCheckpointAtMs = parseTimestamp(record.lastCheckpointAt)
  const lastSummaryAtMs = parseTimestamp(record.lastSummaryAt)
  const checkpointDueAtMs = parseTimestamp(record.checkpointDueAt)
  const summaryDueAtMs = parseTimestamp(record.summaryDueAt)
  const sourcePath = repoRelative(repoRoot, filePath)
  const common = {
    severity: 'warning' as const,
    sourcePath,
    label: stringValue(record.label) ?? stringValue(record.title) ?? stringValue(record.id),
    taskId: stringValue(record.taskId),
    sprintId: stringValue(record.sprintId),
    lastBriefAt: isoTimestamp(record.lastBriefAt),
    lastCheckpointAt: isoTimestamp(record.lastCheckpointAt),
    lastSummaryAt: isoTimestamp(record.lastSummaryAt),
  }

  const nudges: SessionStateNudge[] = []
  const checkpointRequired = booleanValue(record.checkpointRequired) || booleanValue(record.needsCheckpoint)
  const checkpointOverdue = checkpointDueAtMs !== undefined && checkpointDueAtMs <= nowMs
  const checkpointAfterBrief =
    lastBriefAtMs !== undefined
    && (lastCheckpointAtMs === undefined || lastCheckpointAtMs < lastBriefAtMs)
    && nowMs - lastBriefAtMs >= options.checkpointDelayMinutes * 60000
  if (checkpointRequired || checkpointOverdue || checkpointAfterBrief) {
    const ageSource = checkpointDueAtMs ?? lastBriefAtMs
    nudges.push({
      ...common,
      kind: 'checkpoint-delayed',
      message: 'checkpoint gecikti',
      action: checkpointNudgeAction(record),
      ageMinutes: minutesSince(ageSource, nowMs),
    })
  }

  const summaryRequired = booleanValue(record.summaryRequired) || booleanValue(record.needsSummary)
  const summaryOverdue = summaryDueAtMs !== undefined && summaryDueAtMs <= nowMs
  const summaryAfterCheckpoint =
    lastCheckpointAtMs !== undefined
    && (lastSummaryAtMs === undefined || lastSummaryAtMs < lastCheckpointAtMs)
    && nowMs - lastCheckpointAtMs >= options.summaryDelayMinutes * 60000
  if (summaryRequired || summaryOverdue || summaryAfterCheckpoint) {
    const ageSource = summaryDueAtMs ?? lastCheckpointAtMs
    nudges.push({
      ...common,
      kind: 'summary-missing',
      message: 'summary yazilmadi',
      action: 'aops-cli mem summary --apply --json',
      ageMinutes: minutesSince(ageSource, nowMs),
    })
  }

  return nudges
}

export async function readSessionStateNudges(options: SessionStateReadOptions): Promise<SessionStateNudge[]> {
  const now = options.now ?? new Date()
  const checkpointDelayMinutes = options.checkpointDelayMinutes ?? DEFAULT_CHECKPOINT_DELAY_MINUTES
  const summaryDelayMinutes = options.summaryDelayMinutes ?? DEFAULT_SUMMARY_DELAY_MINUTES
  const files = (await Promise.all(
    sessionStateDirs(options.repoRoot, options.localRoot).map((dir) => readJsonFiles(dir)),
  )).flat()

  return files.flatMap(({ filePath, record }) =>
    recordNudges(options.repoRoot, filePath, record, { now, checkpointDelayMinutes, summaryDelayMinutes }),
  )
}
