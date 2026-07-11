import fs from 'node:fs/promises'
import { Command } from 'commander'
import { logError, logSuccess } from '@aopslab/xf-cli-ui'

import { applyCommonOptions, compactPayload, normalizeNonEmpty } from '../utils/command.js'
import {
  invokeHostedToolWithApiState,
  requireApiState,
  resolveAgentGatewayContext,
  unwrapHostedToolResult,
  type AgentGatewayContextOptions,
} from '../utils/agent-gateway.js'
import {
  buildHostedSugarEnvelope,
  ensureGuardedWrite,
  missingScopeIdMessage,
} from '../utils/hosted-sugar.js'

// -----------------------------------------------------------------------------
// Server-first discuss command.
//
// Every subcommand is HOSTED/SERVER-FIRST: create / write / read all go through
// the hosted agentspace discussion ops via the agent gateway. The local
// .aops/agentspace/discussions tree is NOT written or read by any discuss
// subcommand. The hosted discussion-topic.status / .get ops are the source of
// truth; the CLI maps server data into the legacy presentation shape
// (lifecycleState / nextTurn / openQuestions) for UX only.
//
// Server-first-unsupported / PM-issue candidates surfaced by this slice
// (see makeDiscussCommand help + run-time warnings):
//   - maxTurns: the hosted discussion-topic rules jsonb is `.strict()` and only
//     accepts { turnOrder, minTurnsBeforeConclude, requireQuestionAnswer }. There
//     is no server-enforced max-turn cap. `--max-turns` therefore FAILS with an
//     explicit server-first-unsupported error rather than pretending to enforce
//     a cap the server ignores.
//   - objective: the hosted topic has no `objective` column (only `question`).
//     `--objective` is folded faithfully into the topic `question` text; it is
//     never written to an invented column.
//   - turn `--to <named-agent>`: the hosted turn `addressedTo` enum is
//     ['agent','operator'] — it cannot address a specific named participant.
//     Only `--to operator` maps (operator block). `--to <participant>` FAILS
//     with a server-first-unsupported error; reply correlation is by --reply-to
//     (seq) instead.
//   - turn `--reply-to`: hosted reply correlation is by integer turn seq
//     (replyToSeq), not a turn id. `--reply-to <seq>` now takes a turn seq.
// -----------------------------------------------------------------------------

type DiscussionContextOptions = AgentGatewayContextOptions & {
  scopeId?: string
  scopeResolution?: 'explicit' | 'cascade'
  json?: boolean
}

type GuardedWriteOptions = {
  apply?: boolean
  preview?: boolean
  idempotencyKey?: string
}

type DiscussionStartOptions = DiscussionContextOptions & GuardedWriteOptions & {
  title?: string
  slug?: string
  objective?: string
  question?: string
  agent?: string[]
  turnOrder?: string
  maxTurns?: number
  minTurnsBeforeConclude?: number
  requireQuestionAnswer?: boolean
  subjectType?: string
  subjectId?: string
  tag?: string[]
}

type DiscussionFollowUpOptions = DiscussionContextOptions & GuardedWriteOptions & {
  from?: string
  title?: string
  slug?: string
  objective?: string
  question?: string
  agent?: string[]
  turnOrder?: string
  minTurnsBeforeConclude?: number
  requireQuestionAnswer?: boolean
  maxTurns?: number
  inheritTags?: boolean
  inheritSubject?: boolean
  referenceOutput?: string[]
  referenceTurn?: string[]
  referenceMemory?: string[]
  tag?: string[]
}

type DiscussionForkOptions = DiscussionFollowUpOptions

type DiscussionLineageOptions = DiscussionContextOptions & {
  root?: string
  includeAbandoned?: boolean
}

type DiscussionListOptions = DiscussionContextOptions & {
  status?: string
  scope?: string
  agent?: string[]
  subjectType?: string
  subjectId?: string
  limit?: number
  includeAbandoned?: boolean
}

type DiscussionGetOptions = DiscussionContextOptions & {
  id?: string
}

type DiscussionTurnOptions = DiscussionContextOptions & GuardedWriteOptions & {
  topic?: string
  agent?: string
  kind?: string
  text?: string
  fromFile?: string
  replyTo?: string
  to?: string
  expectNext?: string
}

type DiscussionStatusOptions = DiscussionGetOptions & {
  promptForNext?: boolean
}

type DiscussionDigestOptions = DiscussionStatusOptions

type DiscussionWaitOptions = DiscussionGetOptions & {
  for?: string
  timeoutSec?: number
  intervalSec?: number
}

type DiscussionLoopPromptOptions = DiscussionGetOptions & {
  for?: string
  timeoutSec?: number
  intervalSec?: number
}

type DiscussionConcludeOptions = DiscussionContextOptions & GuardedWriteOptions & {
  topic?: string
  updatedBy?: string
}

type DiscussionAbandonOptions = DiscussionContextOptions & GuardedWriteOptions & {
  topic?: string
  reason?: string
}

type ResolvedDiscussionContext = Awaited<ReturnType<typeof resolveAgentGatewayContext>>

type DiscussionTurnKind =
  | 'statement'
  | 'question'
  | 'answer'
  | 'objection'
  | 'concession'
  | 'proposal'
  | 'final-stance'

type DiscussionTopicStatus = 'active' | 'concluding' | 'concluded' | 'abandoned'

type DerivedLifecycleState =
  | 'active'
  | 'awaiting-final-stances'
  | 'ready-to-conclude'
  | 'concluding'
  | 'blocked-by-operator'
  | 'concluded'
  | 'abandoned'

const DISCUSSION_OPERATOR_TARGET = 'operator'
const DISCUSSION_WAIT_OPERATOR_BLOCK_EXIT_CODE = 20
const DISCUSSION_WAIT_DONE_EXIT_CODE = 21
const DISCUSSION_WAIT_TIMEOUT_EXIT_CODE = 22

const TURN_KINDS: DiscussionTurnKind[] = [
  'statement',
  'question',
  'answer',
  'objection',
  'concession',
  'proposal',
  'final-stance',
]

function collectRepeatedOption(value: string, previous: string[] = []): string[] {
  const normalized = normalizeNonEmpty(value)
  return normalized ? [...previous, normalized] : previous
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function toStringArray(values: unknown): string[] {
  return Array.isArray(values)
    ? values.map((entry) => normalizeNonEmpty(entry)).filter((entry): entry is string => Boolean(entry))
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

function parseInteger(value: string): number {
  return Number.parseInt(value, 10)
}

function parseNonNegativeNumber(value: string): number {
  const parsed = Number.parseFloat(value)
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error('Expected a non-negative number.')
  }
  return parsed
}

function parsePositiveNumber(value: string): number {
  const parsed = Number.parseFloat(value)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error('Expected a positive number.')
  }
  return parsed
}

function normalizeTurnKind(value: unknown): DiscussionTurnKind {
  const normalized = normalizeNonEmpty(value)?.toLowerCase()
  if (TURN_KINDS.includes(normalized as DiscussionTurnKind)) return normalized as DiscussionTurnKind
  throw new Error(`Unsupported turn kind. Use one of: ${TURN_KINDS.join(', ')}.`)
}

function normalizeTurnOrderMode(value: unknown): 'alternating' | 'free' {
  const normalized = normalizeNonEmpty(value)?.toLowerCase() ?? 'alternating'
  if (normalized === 'alternating' || normalized === 'free') return normalized
  throw new Error('Unsupported turn order. Use alternating|free.')
}

function normalizeListStatus(value: unknown): DiscussionTopicStatus | undefined {
  const normalized = normalizeNonEmpty(value)?.toLowerCase()
  if (!normalized) return undefined
  if (normalized === 'active' || normalized === 'concluding' || normalized === 'concluded' || normalized === 'abandoned') return normalized
  throw new Error('Unsupported status filter. Use active|concluding|concluded|abandoned.')
}

function normalizeDiscussionScopeFilter(value: unknown): 'standalone' | undefined {
  const normalized = normalizeNonEmpty(value)?.toLowerCase()
  if (!normalized) return undefined
  if (normalized === 'standalone') return normalized
  throw new Error('Unsupported scope filter. Use standalone.')
}

function normalizeSlug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'item'
}

function normalizeParticipants(values: unknown): string[] {
  const participants = uniqueStrings(toStringArray(values))
  if (participants.length < 2) {
    throw new Error('Provide at least two unique --agent values.')
  }
  return participants
}

/**
 * The hosted rules jsonb is `.strict()` and only accepts
 * { turnOrder, minTurnsBeforeConclude, requireQuestionAnswer }. maxTurns is NOT
 * server-enforced; fail loudly instead of silently dropping it (PM-issue
 * candidate: hosted discussion topics have no max-turn cap).
 */
function assertMaxTurnsUnsupported(maxTurns: unknown): void {
  if (maxTurns === undefined || maxTurns === null) return
  if (typeof maxTurns === 'number' && !Number.isFinite(maxTurns)) return
  throw new Error(
    'server-first-unsupported: --max-turns has no hosted-enforced equivalent. The hosted discussion-topic rules schema only supports turnOrder/minTurnsBeforeConclude/requireQuestionAnswer; there is no server-enforced max-turn cap. Remove --max-turns. (PM-issue candidate: add a server-enforced maxTurns guard before re-exposing this flag.)',
  )
}

/**
 * objective has no hosted column (the hosted topic only has `question`). Fold it
 * into question faithfully rather than inventing a column or dropping it.
 */
function foldObjectiveIntoQuestion(objective?: string, question?: string): string {
  const obj = normalizeNonEmpty(objective)
  const q = normalizeNonEmpty(question)
  if (obj && q) return `Objective: ${obj}\n\nQuestion: ${q}`
  if (q) return q
  if (obj) return obj
  throw new Error('Provide --question (or --objective). The hosted discussion topic requires a question.')
}

function buildRules(options: {
  turnOrder?: string
  participants: string[]
  minTurnsBeforeConclude?: number
  requireQuestionAnswer?: boolean
}): Record<string, unknown> | undefined {
  const mode = normalizeTurnOrderMode(options.turnOrder)
  // 'alternating' => ordered participants array as turnOrder; 'free' => omit.
  const rules = compactPayload({
    turnOrder: mode === 'alternating' ? options.participants : undefined,
    minTurnsBeforeConclude: Number.isInteger(options.minTurnsBeforeConclude) ? options.minTurnsBeforeConclude : undefined,
    requireQuestionAnswer: options.requireQuestionAnswer === true ? true : undefined,
  })
  return Object.keys(rules).length > 0 ? rules : undefined
}

function requireScopeId(context: ResolvedDiscussionContext): string {
  const scopeId = normalizeNonEmpty(context.scopeId)
  if (!scopeId) throw new Error(missingScopeIdMessage('Discussion'))
  return scopeId
}

function buildResolvedContextRecord(context: ResolvedDiscussionContext): Record<string, unknown> {
  return compactPayload({
    tenantId: context.tenantId,
    scopeId: context.scopeId,
    projectId: context.projectId,
    projectName: context.projectName,
    scopeResolution: context.scopeResolution,
  })
}

/**
 * The hosted gateway success body is { ok, tool, data: { ok, data: <payload> } }
 * (no top-level `response` key on success). Peel nested { ok, data } envelopes
 * until we reach the actual record/list payload.
 */
function unwrapDiscussionData(payload: Record<string, unknown>): unknown {
  let current: unknown = unwrapHostedToolResult(payload)
  let guard = 0
  while (
    isRecord(current) &&
    Object.prototype.hasOwnProperty.call(current, 'data') &&
    Object.prototype.hasOwnProperty.call(current, 'ok') &&
    guard < 6
  ) {
    current = current.data
    guard += 1
  }
  // One more unwrap if the remaining shape is a bare { data } envelope.
  if (isRecord(current) && Object.prototype.hasOwnProperty.call(current, 'data') && Object.keys(current).length === 1) {
    return current.data
  }
  return current
}

function unwrapDiscussionRecord(payload: Record<string, unknown>): Record<string, unknown> {
  const data = unwrapDiscussionData(payload)
  if (!isRecord(data)) {
    throw new Error('Hosted discussion op returned an unexpected (non-record) payload.')
  }
  return data
}

function unwrapDiscussionList(payload: Record<string, unknown>): Record<string, unknown>[] {
  const data = unwrapDiscussionData(payload)
  if (Array.isArray(data)) return data.filter(isRecord)
  if (isRecord(data)) {
    for (const candidate of [data.items, data.data, data.results, data.rows]) {
      if (Array.isArray(candidate)) return candidate.filter(isRecord)
    }
  }
  return []
}

type HostedTopicDetail = {
  topic: Record<string, unknown>
  turns: Record<string, unknown>[]
  outputs: Record<string, unknown>[]
}

function unwrapTopicDetail(payload: Record<string, unknown>): HostedTopicDetail {
  const data = unwrapDiscussionData(payload)
  if (!isRecord(data)) {
    throw new Error('Hosted discussion-topic.get returned an unexpected payload.')
  }
  const topic = isRecord(data.topic) ? data.topic : data
  const turns = Array.isArray(data.turns) ? data.turns.filter(isRecord) : []
  const outputs = Array.isArray(data.outputs) ? data.outputs.filter(isRecord) : []
  return { topic, turns, outputs }
}

type HostedStatus = {
  topicId?: string
  status?: string
  blockedOn?: string | null
  nextSpeaker?: string | null
  canConclude?: boolean
  openQuestions: Array<{ seq?: number; agentId?: string; text?: string }>
  reason?: string
}

function unwrapStatus(payload: Record<string, unknown>): HostedStatus {
  const data = unwrapDiscussionRecord(payload)
  const openQuestions = Array.isArray(data.openQuestions)
    ? data.openQuestions.filter(isRecord).map((entry) => ({
        seq: typeof entry.seq === 'number' ? entry.seq : undefined,
        agentId: normalizeNonEmpty(entry.agentId),
        text: typeof entry.text === 'string' ? entry.text : undefined,
      }))
    : []
  return {
    topicId: normalizeNonEmpty(data.topicId),
    status: normalizeNonEmpty(data.status),
    blockedOn: typeof data.blockedOn === 'string' ? data.blockedOn : null,
    nextSpeaker: typeof data.nextSpeaker === 'string' ? data.nextSpeaker : null,
    canConclude: data.canConclude === true,
    openQuestions,
    reason: normalizeNonEmpty(data.reason),
  }
}

async function resolveDiscussionContext(options: DiscussionContextOptions): Promise<ResolvedDiscussionContext> {
  return resolveAgentGatewayContext(options)
}

async function invokeDiscussionTool(
  options: DiscussionContextOptions & GuardedWriteOptions,
  context: ResolvedDiscussionContext,
  params: {
    toolId: string
    input: Record<string, unknown>
    apply?: boolean
    preview?: boolean
  },
): Promise<Record<string, unknown>> {
  const apiState = await requireApiState(options)
  if (!apiState) {
    throw new Error('API host is not reachable or authentication is missing.')
  }
  return invokeHostedToolWithApiState(apiState, {
    ...options,
    scopeId: context.scopeId,
    projectId: context.projectId,
    projectName: context.projectName,
    scopeResolution: context.scopeResolution,
    toolId: params.toolId,
    input: params.input,
    preview: params.preview,
    apply: params.apply,
    idempotencyKey: options.idempotencyKey,
  })
}

function emitEnvelope(params: {
  options: { json?: boolean }
  command: string
  toolId?: string
  resolvedContext: ResolvedDiscussionContext
  input: Record<string, unknown>
  result: unknown
  successMessage: string
}): void {
  const envelope = buildHostedSugarEnvelope({
    command: params.command,
    toolId: params.toolId,
    resolvedContext: buildResolvedContextRecord(params.resolvedContext),
    input: params.input,
    result: params.result,
  })
  if (params.options.json) {
    console.log(JSON.stringify(envelope, null, 2))
    return
  }
  logSuccess(params.successMessage)
  console.log(JSON.stringify(params.result, null, 2))
}

async function readTextInput(params: { text?: unknown; fromFile?: unknown }, label: string): Promise<string> {
  const inline = normalizeNonEmpty(params.text)
  if (inline) return inline

  const fromFile = normalizeNonEmpty(params.fromFile)
  if (!fromFile) {
    throw new Error(`Provide --text or --from-file <path|-> for ${label}.`)
  }

  if (fromFile === '-') {
    const chunks: Buffer[] = []
    for await (const chunk of process.stdin) {
      chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
    }
    const content = Buffer.concat(chunks).toString('utf8').trim()
    if (!content) throw new Error(`Standard input was empty for ${label}.`)
    return content
  }

  const content = (await fs.readFile(fromFile, 'utf8')).trim()
  if (!content) throw new Error(`File "${fromFile}" is empty for ${label}.`)
  return content
}

function requireTopicSelector(value: unknown, flag: string): string {
  const selector = normalizeNonEmpty(value)
  if (!selector) throw new Error(`Provide ${flag} <topic-id|slug>.`)
  return selector
}

/**
 * Resolve a CLI topic selector (hosted topic id OR slug) into a hosted topic id.
 * Hosted ops (get/status/conclude/abandon/turn) require the canonical topic id;
 * the legacy CLI also accepts a slug, so we resolve slug -> id via the hosted
 * list op (never via local files).
 */
async function resolveTopicId(
  options: DiscussionContextOptions,
  context: ResolvedDiscussionContext,
  selector: string,
): Promise<string> {
  const scopeId = requireScopeId(context)
  // A hosted topic id is a UUID; if it looks like one, accept it directly.
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(selector)) {
    return selector
  }
  const payload = await invokeDiscussionTool(options, context, {
    toolId: 'agentspace.discussion-topic.list',
    input: compactPayload({ filter: compactPayload({ scopeId, slug: selector }) }),
  })
  const rows = unwrapDiscussionList(payload)
  const matches = rows.filter((row) => normalizeNonEmpty(row.slug)?.toLowerCase() === selector.toLowerCase())
  const candidates = matches.length > 0 ? matches : rows
  if (candidates.length === 0) {
    throw new Error(
      `Hosted discussion topic was not found for selector "${selector}". Discover current topics with: aops-cli discuss list --limit 20 --json.`,
    )
  }
  if (candidates.length > 1) {
    const list = candidates
      .slice(0, 5)
      .map((row) => `${normalizeNonEmpty(row.slug) ?? '?'} [id=${normalizeNonEmpty(row.id) ?? '?'}, status=${normalizeNonEmpty(row.status) ?? '?'}]`)
      .join('; ')
    throw new Error(`Discussion selector "${selector}" is ambiguous across ${candidates.length} candidates: ${list}. Retry with the full hosted topic id.`)
  }
  const id = normalizeNonEmpty(candidates[0].id)
  if (!id) throw new Error(`Resolved hosted topic for "${selector}" has no id.`)
  return id
}

async function fetchTopicDetail(
  options: DiscussionContextOptions,
  context: ResolvedDiscussionContext,
  topicId: string,
): Promise<HostedTopicDetail> {
  const payload = await invokeDiscussionTool(options, context, {
    toolId: 'agentspace.discussion-topic.get',
    input: { id: topicId },
  })
  return unwrapTopicDetail(payload)
}

async function fetchStatus(
  options: DiscussionContextOptions,
  context: ResolvedDiscussionContext,
  topicId: string,
): Promise<HostedStatus> {
  const payload = await invokeDiscussionTool(options, context, {
    toolId: 'agentspace.discussion-topic.status',
    input: { topicId },
  })
  return unwrapStatus(payload)
}

// -----------------------------------------------------------------------------
// Presentation mapping (server status/get -> legacy presentation shape).
// This is a PURE presentation mapper fed by server truth. It does NOT compute
// lifecycle from local files (the old client-side buildDerivedState is removed).
// -----------------------------------------------------------------------------

function topicParticipants(topic: Record<string, unknown>): string[] {
  return uniqueStrings(toStringArray(topic.participants))
}

function turnsFinalStanceAgents(turns: Record<string, unknown>[]): string[] {
  return uniqueStrings(
    turns
      .filter((turn) => normalizeNonEmpty(turn.kind)?.toLowerCase() === 'final-stance')
      .map((turn) => normalizeNonEmpty(turn.agentId)),
  )
}

function deriveLifecycleState(params: {
  status: HostedStatus
  topic: Record<string, unknown>
  turns: Record<string, unknown>[]
}): DerivedLifecycleState {
  const serverStatus = (normalizeNonEmpty(params.status.status) ?? normalizeNonEmpty(params.topic.status)) as
    | DiscussionTopicStatus
    | undefined
  if (serverStatus === 'abandoned') return 'abandoned'
  if (params.status.blockedOn === 'operator') return 'blocked-by-operator'
  if (serverStatus === 'concluded') return 'concluded'
  if (serverStatus === 'concluding') return 'concluding'
  if (params.status.canConclude === true) return 'ready-to-conclude'
  const participants = topicParticipants(params.topic)
  const stanced = turnsFinalStanceAgents(params.turns)
  if (stanced.length === 0) return 'active'
  if (participants.length > 0 && stanced.length >= participants.length) return 'ready-to-conclude'
  return 'awaiting-final-stances'
}

function buildNextTurn(params: {
  status: HostedStatus
  topic: Record<string, unknown>
  lifecycleState: DerivedLifecycleState
}): {
  allowedAgents: string[]
  suggestedAgentId?: string
  expectedKind?: DiscussionTurnKind
  reason: string
} | null {
  const { status, lifecycleState } = params
  if (
    lifecycleState === 'blocked-by-operator' ||
    lifecycleState === 'ready-to-conclude' ||
    lifecycleState === 'concluding' ||
    lifecycleState === 'concluded' ||
    lifecycleState === 'abandoned'
  ) {
    return null
  }
  // Open question awaiting an answer (requireQuestionAnswer is server-enforced).
  if (status.openQuestions.length > 0) {
    const participants = topicParticipants(params.topic)
    const allowed = status.nextSpeaker ? [status.nextSpeaker] : participants
    return {
      allowedAgents: allowed,
      suggestedAgentId: status.nextSpeaker ?? allowed[0],
      expectedKind: 'answer',
      reason: `Open question(s) pending: seq ${status.openQuestions.map((q) => q.seq).filter((s) => s !== undefined).join(', ')}.`,
    }
  }
  const next = normalizeNonEmpty(status.nextSpeaker)
  if (next) {
    return {
      allowedAgents: [next],
      suggestedAgentId: next,
      reason: 'Hosted status nominates the next speaker (turn-order enforced server-side).',
    }
  }
  const participants = topicParticipants(params.topic)
  return {
    allowedAgents: participants,
    suggestedAgentId: participants[0],
    reason: 'Free turn order allows any participant.',
  }
}

function buildOperatorBlocks(status: HostedStatus): Array<{ seq?: number; requestedBy?: string; question?: string }> {
  if (status.blockedOn !== 'operator') return []
  return status.openQuestions.map((question) => ({
    seq: question.seq,
    requestedBy: question.agentId,
    question: question.text,
  }))
}

function buildStatusPresentation(detail: HostedTopicDetail, status: HostedStatus): Record<string, unknown> {
  const lifecycleState = deriveLifecycleState({ status, topic: detail.topic, turns: detail.turns })
  const nextTurn = buildNextTurn({ status, topic: detail.topic, lifecycleState })
  const participants = topicParticipants(detail.topic)
  const stanced = turnsFinalStanceAgents(detail.turns)
  const missingTurnFinalStances = participants.filter((agentId) => !stanced.some((s) => s.toLowerCase() === agentId.toLowerCase()))
  const operatorBlocks = buildOperatorBlocks(status)
  return compactPayload({
    topic: detail.topic,
    lifecycleState,
    serverStatus: status.status,
    canConclude: status.canConclude === true,
    blockedOn: status.blockedOn ?? undefined,
    nextSpeaker: status.nextSpeaker ?? undefined,
    nextTurn,
    openQuestions: status.openQuestions,
    turnFinalStances: stanced,
    missingTurnFinalStances,
    operatorBlocks,
    hasOpenQuestionsBlocking: status.openQuestions.length > 0,
    reason: status.reason,
  })
}

function buildPromptForNext(detail: HostedTopicDetail, status: HostedStatus): string | undefined {
  const targetAgent = normalizeNonEmpty(status.nextSpeaker) ?? topicParticipants(detail.topic)[0]
  if (!targetAgent) return undefined
  const orderedTurns = [...detail.turns].sort((left, right) => Number(left.seq ?? 0) - Number(right.seq ?? 0))
  const latestTurns = orderedTurns.slice(-5)
  const rules = isRecord(detail.topic.rules) ? detail.topic.rules : {}
  const lines = [
    `You are ${targetAgent}.`,
    `Topic: ${normalizeNonEmpty(detail.topic.title) ?? ''}`,
    `Status: ${normalizeNonEmpty(detail.topic.status) ?? status.status ?? ''}`,
    `Participants: ${topicParticipants(detail.topic).join(', ')}`,
    normalizeNonEmpty(detail.topic.question) ? `Question: ${normalizeNonEmpty(detail.topic.question)}` : undefined,
    '',
    'Rules:',
    `- turnOrder: ${Array.isArray(rules.turnOrder) && rules.turnOrder.length > 0 ? (rules.turnOrder as string[]).join(' -> ') : 'free'}`,
    `- requireQuestionAnswer: ${rules.requireQuestionAnswer === true ? 'true' : 'false'}`,
    rules.minTurnsBeforeConclude !== undefined ? `- minTurnsBeforeConclude: ${rules.minTurnsBeforeConclude}` : undefined,
    '',
    'Open questions:',
  ].filter((line): line is string => Boolean(line) || line === '')

  if (status.openQuestions.length === 0) {
    lines.push('- none')
  } else {
    for (const question of status.openQuestions) {
      lines.push(`- [seq ${question.seq}] ${question.agentId ?? 'agent'}: ${question.text ?? ''}`)
    }
  }

  lines.push('', 'Recent turns:')
  if (latestTurns.length === 0) {
    lines.push('- none')
  } else {
    for (const turn of latestTurns) {
      lines.push(`- #${turn.seq} ${normalizeNonEmpty(turn.agentId) ?? 'agent'} ${normalizeNonEmpty(turn.kind) ?? ''}: ${typeof turn.text === 'string' ? turn.text : ''}`)
    }
  }

  lines.push('', 'Write exactly one next turn that follows the current hosted discussion rules.')
  return `${lines.join('\n')}\n`
}

// -----------------------------------------------------------------------------
// Subcommand implementations
// -----------------------------------------------------------------------------

export async function runDiscussStart(options: DiscussionStartOptions = {}): Promise<void> {
  try {
    ensureGuardedWrite(options, 'This command creates a hosted discussion topic.')
    assertMaxTurnsUnsupported(options.maxTurns)
    const title = normalizeNonEmpty(options.title)
    if (!title) throw new Error('Provide --title.')
    const context = await resolveDiscussionContext(options)
    const scopeId = requireScopeId(context)
    const participants = normalizeParticipants(options.agent)
    const slug = normalizeSlug(normalizeNonEmpty(options.slug) ?? title)
    const question = foldObjectiveIntoQuestion(options.objective, options.question)
    const data = compactPayload({
      scopeId,
      slug,
      title,
      question,
      participants,
      initiatorAgentId: participants[0],
      subjectType: normalizeNonEmpty(options.subjectType),
      subjectId: normalizeNonEmpty(options.subjectId),
      tags: uniqueStrings(toStringArray(options.tag)),
      rules: buildRules({
        turnOrder: options.turnOrder,
        participants,
        minTurnsBeforeConclude: options.minTurnsBeforeConclude,
        requireQuestionAnswer: options.requireQuestionAnswer,
      }),
    })
    const payload = await invokeDiscussionTool(options, context, {
      toolId: 'agentspace.discussion-topic.create',
      input: { data },
      apply: options.apply,
      preview: options.preview,
    })
    const result = compactPayload({ topic: unwrapDiscussionRecord(payload) })
    emitEnvelope({
      options,
      command: 'discuss.start',
      toolId: 'agentspace.discussion-topic.create',
      resolvedContext: context,
      input: { data },
      result,
      successMessage: 'Hosted discussion topic started.',
    })
  } catch (error) {
    logError(`Failed to execute discuss start: ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 1
  }
}

async function runDiscussChildTopic(
  options: DiscussionFollowUpOptions,
  params: {
    lineageKind: 'follow-up' | 'fork'
    command: string
    successMessage: string
  },
): Promise<void> {
  try {
    ensureGuardedWrite(options, 'This command creates a hosted discussion topic.')
    assertMaxTurnsUnsupported(options.maxTurns)
    const title = normalizeNonEmpty(options.title)
    if (!title) throw new Error('Provide --title.')
    const context = await resolveDiscussionContext(options)
    const scopeId = requireScopeId(context)
    const parentSelector = requireTopicSelector(options.from, '--from')
    const parentId = await resolveTopicId(options, context, parentSelector)
    const parent = await fetchTopicDetail(options, context, parentId)
    const parentParticipants = topicParticipants(parent.topic)
    const participants = toStringArray(options.agent).length > 0
      ? normalizeParticipants(options.agent)
      : parentParticipants
    if (participants.length < 2) {
      throw new Error('Provide at least two unique --agent values (parent topic did not supply enough participants).')
    }
    const slug = normalizeSlug(normalizeNonEmpty(options.slug) ?? title)
    const question = foldObjectiveIntoQuestion(options.objective, options.question)
    const parentRules = isRecord(parent.topic.rules) ? parent.topic.rules : {}
    const rules = buildRules({
      turnOrder: options.turnOrder ?? (Array.isArray(parentRules.turnOrder) && parentRules.turnOrder.length > 0 ? 'alternating' : 'free'),
      participants,
      minTurnsBeforeConclude: options.minTurnsBeforeConclude
        ?? (typeof parentRules.minTurnsBeforeConclude === 'number' ? parentRules.minTurnsBeforeConclude : undefined),
      requireQuestionAnswer: options.requireQuestionAnswer === true
        ? true
        : parentRules.requireQuestionAnswer === true,
    })
    const tags = uniqueStrings([
      ...(options.inheritTags === true ? toStringArray(parent.topic.tags) : []),
      ...toStringArray(options.tag),
      params.lineageKind,
    ])
    const data = compactPayload({
      scopeId,
      slug,
      title,
      question,
      participants,
      initiatorAgentId: participants[0],
      subjectType: options.inheritSubject === true ? normalizeNonEmpty(parent.topic.subjectType) : undefined,
      subjectId: options.inheritSubject === true ? normalizeNonEmpty(parent.topic.subjectId) : undefined,
      tags,
      rules,
      parentTopicId: parentId,
      lineageKind: params.lineageKind,
      referencedOutputs: uniqueStrings(toStringArray(options.referenceOutput)),
      referencedTurnRefs: uniqueStrings(toStringArray(options.referenceTurn)),
      referencedMemoryRefs: uniqueStrings(toStringArray(options.referenceMemory)),
    })
    const payload = await invokeDiscussionTool(options, context, {
      toolId: 'agentspace.discussion-topic.create',
      input: { data },
      apply: options.apply,
      preview: options.preview,
    })
    const result = compactPayload({
      topic: unwrapDiscussionRecord(payload),
      parent: parent.topic,
      lineage: compactPayload({ kind: params.lineageKind, parentTopicId: parentId }),
    })
    emitEnvelope({
      options,
      command: params.command,
      toolId: 'agentspace.discussion-topic.create',
      resolvedContext: context,
      input: { data },
      result,
      successMessage: params.successMessage,
    })
  } catch (error) {
    logError(`Failed to execute ${params.command}: ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 1
  }
}

export async function runDiscussFollowUp(options: DiscussionFollowUpOptions = {}): Promise<void> {
  await runDiscussChildTopic(options, {
    lineageKind: 'follow-up',
    command: 'discuss.follow-up',
    successMessage: 'Hosted discussion follow-up topic started.',
  })
}

export async function runDiscussFork(options: DiscussionForkOptions = {}): Promise<void> {
  await runDiscussChildTopic(options, {
    lineageKind: 'fork',
    command: 'discuss.fork',
    successMessage: 'Hosted discussion fork topic started.',
  })
}

export async function runDiscussList(options: DiscussionListOptions = {}): Promise<void> {
  try {
    const context = await resolveDiscussionContext(options)
    const scopeId = requireScopeId(context)
    const status = normalizeListStatus(options.status)
    normalizeDiscussionScopeFilter(options.scope)
    const limit = Number.isFinite(options.limit) ? Math.max(0, Math.trunc(options.limit ?? 0)) : undefined
    const filter = compactPayload({
      scopeId,
      status,
      subjectType: normalizeNonEmpty(options.subjectType),
      subjectId: normalizeNonEmpty(options.subjectId),
    })
    const input = compactPayload({
      filter,
      options: compactPayload({ limit: typeof limit === 'number' && limit > 0 ? limit : undefined }),
    })
    const payload = await invokeDiscussionTool(options, context, {
      toolId: 'agentspace.discussion-topic.list',
      input,
    })
    let rows = unwrapDiscussionList(payload)
    const includeAbandoned = options.includeAbandoned === true || status === 'abandoned'
    if (!includeAbandoned) {
      rows = rows.filter((row) => normalizeNonEmpty(row.status)?.toLowerCase() !== 'abandoned')
    }
    const agents = uniqueStrings(toStringArray(options.agent)).map((entry) => entry.toLowerCase())
    if (agents.length > 0) {
      rows = rows.filter((row) => {
        const participants = topicParticipants(row).map((entry) => entry.toLowerCase())
        return agents.every((agent) => participants.includes(agent))
      })
    }
    if (typeof limit === 'number' && limit > 0) rows = rows.slice(0, limit)
    const result = { data: rows }
    emitEnvelope({
      options,
      command: 'discuss.list',
      toolId: 'agentspace.discussion-topic.list',
      resolvedContext: context,
      input,
      result,
      successMessage: 'Hosted discussion topics loaded.',
    })
  } catch (error) {
    logError(`Failed to execute discuss list: ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 1
  }
}

export async function runDiscussGet(options: DiscussionGetOptions = {}): Promise<void> {
  try {
    const context = await resolveDiscussionContext(options)
    const selector = requireTopicSelector(options.id, '--id')
    const topicId = await resolveTopicId(options, context, selector)
    const detail = await fetchTopicDetail(options, context, topicId)
    const result = compactPayload({
      topic: detail.topic,
      turns: detail.turns,
      outputs: detail.outputs,
    })
    emitEnvelope({
      options,
      command: 'discuss.get',
      toolId: 'agentspace.discussion-topic.get',
      resolvedContext: context,
      input: { id: topicId },
      result,
      successMessage: 'Hosted discussion topic loaded.',
    })
  } catch (error) {
    logError(`Failed to execute discuss get: ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 1
  }
}

export async function runDiscussLineage(options: DiscussionLineageOptions = {}): Promise<void> {
  try {
    const context = await resolveDiscussionContext(options)
    const scopeId = requireScopeId(context)
    const rootSelector = requireTopicSelector(options.root, '--root')
    const rootId = await resolveTopicId(options, context, rootSelector)
    const rootDetail = await fetchTopicDetail(options, context, rootId)
    const includeAbandoned = options.includeAbandoned === true

    // Build the child tree from hosted list calls (filtered by parentTopicId),
    // never from local files.
    const seen = new Set<string>([rootId.toLowerCase()])

    const fetchChildren = async (parentId: string): Promise<Record<string, unknown>[]> => {
      const payload = await invokeDiscussionTool(options, context, {
        toolId: 'agentspace.discussion-topic.list',
        input: compactPayload({ filter: compactPayload({ scopeId, parentTopicId: parentId }) }),
      })
      let rows = unwrapDiscussionList(payload)
      if (!includeAbandoned) {
        rows = rows.filter((row) => normalizeNonEmpty(row.status)?.toLowerCase() !== 'abandoned')
      }
      return rows.filter((row) => normalizeNonEmpty(row.parentTopicId)?.toLowerCase() === parentId.toLowerCase())
    }

    type LineageNode = { topic: Record<string, unknown>; depth: number; children: LineageNode[] }
    const buildNode = async (topic: Record<string, unknown>, depth: number): Promise<LineageNode> => {
      const id = normalizeNonEmpty(topic.id)
      const children: LineageNode[] = []
      if (id) {
        const childRows = await fetchChildren(id)
        for (const child of childRows) {
          const childId = normalizeNonEmpty(child.id)
          if (!childId || seen.has(childId.toLowerCase())) continue
          seen.add(childId.toLowerCase())
          children.push(await buildNode(child, depth + 1))
        }
      }
      return { topic, depth, children }
    }

    const tree = await buildNode(rootDetail.topic, 0)
    const flatten = (node: LineageNode): Array<Record<string, unknown>> => [
      compactPayload({ topic: node.topic, depth: node.depth, childCount: node.children.length }),
      ...node.children.flatMap(flatten),
    ]
    const result = compactPayload({
      root: rootDetail.topic,
      includeAbandoned,
      tree,
      flat: flatten(tree),
    })
    emitEnvelope({
      options,
      command: 'discuss.lineage',
      toolId: 'agentspace.discussion-topic.list',
      resolvedContext: context,
      input: compactPayload({ root: rootId, includeAbandoned }),
      result,
      successMessage: 'Hosted discussion lineage loaded.',
    })
  } catch (error) {
    logError(`Failed to execute discuss lineage: ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 1
  }
}

function resolveAddressedTo(to: string | undefined): string | undefined {
  const target = normalizeNonEmpty(to)
  if (!target) return undefined
  if (target.toLowerCase() === DISCUSSION_OPERATOR_TARGET) return DISCUSSION_OPERATOR_TARGET
  throw new Error(
    `server-first-unsupported: --to "${target}" cannot address a specific named participant. The hosted turn addressedTo enum is ['agent','operator']; only --to operator maps (operator block). Use --reply-to <seq> to correlate an answer to a specific question instead. (PM-issue candidate: hosted turns cannot target a named participant.)`,
  )
}

function parseSeq(value: unknown, flag: string): number | undefined {
  const normalized = normalizeNonEmpty(value)
  if (!normalized) return undefined
  const parsed = Number.parseInt(normalized, 10)
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${flag} must be a positive integer turn seq (hosted reply correlation is by seq, not turn id).`)
  }
  return parsed
}

export async function runDiscussTurn(options: DiscussionTurnOptions = {}): Promise<void> {
  try {
    ensureGuardedWrite(options, 'This command appends a turn to a hosted discussion topic.')
    // Pure input validation first (no network), so server-first-unsupported and
    // shape errors surface before any scope/host resolution.
    const selector = requireTopicSelector(options.topic, '--topic')
    const agentId = normalizeNonEmpty(options.agent)
    if (!agentId) throw new Error('Provide --agent.')
    const kind = normalizeTurnKind(options.kind ?? 'statement')
    const addressedTo = resolveAddressedTo(options.to)
    const replyToSeq = parseSeq(options.replyTo, '--reply-to')
    // --expect-next is a same-agent assertion only; the assigned-seq + turn-order
    // race guard is delegated to the server.
    const expectNext = normalizeNonEmpty(options.expectNext)
    if (expectNext && expectNext.toLowerCase() !== agentId.toLowerCase()) {
      throw new Error(`--expect-next must match --agent. Expected ${expectNext}, got ${agentId}.`)
    }
    const text = await readTextInput({ text: options.text, fromFile: options.fromFile }, 'discussion turn')
    const context = await resolveDiscussionContext(options)
    const scopeId = requireScopeId(context)
    const topicId = await resolveTopicId(options, context, selector)
    const data = compactPayload({
      scopeId,
      topicId,
      agentId,
      kind,
      text,
      addressedTo,
      replyToSeq,
      idempotencyKey: normalizeNonEmpty(options.idempotencyKey),
    })
    const payload = await invokeDiscussionTool(options, context, {
      toolId: 'agentspace.discussion-turn.add',
      input: { data },
      apply: options.apply,
      preview: options.preview,
    })
    const turn = unwrapDiscussionRecord(payload)
    // Re-read hosted status/detail so callers get server-truth presentation.
    let statusPresentation: Record<string, unknown> | undefined
    if (options.apply === true) {
      try {
        const detail = await fetchTopicDetail(options, context, topicId)
        const status = await fetchStatus(options, context, topicId)
        statusPresentation = buildStatusPresentation(detail, status)
      } catch {
        statusPresentation = undefined
      }
    }
    const result = compactPayload({ turn, status: statusPresentation })
    emitEnvelope({
      options,
      command: 'discuss.turn',
      toolId: 'agentspace.discussion-turn.add',
      resolvedContext: context,
      input: { data },
      result,
      successMessage: 'Hosted discussion turn written.',
    })
  } catch (error) {
    logError(`Failed to execute discuss turn: ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 1
  }
}

export async function runDiscussStatus(options: DiscussionStatusOptions = {}): Promise<void> {
  try {
    const context = await resolveDiscussionContext(options)
    const selector = requireTopicSelector(options.id, '--id')
    const topicId = await resolveTopicId(options, context, selector)
    const detail = await fetchTopicDetail(options, context, topicId)
    const status = await fetchStatus(options, context, topicId)
    const presentation = buildStatusPresentation(detail, status)
    const result = compactPayload({
      ...presentation,
      promptForNext: options.promptForNext === true ? buildPromptForNext(detail, status) : undefined,
    })
    emitEnvelope({
      options,
      command: 'discuss.status',
      toolId: 'agentspace.discussion-topic.status',
      resolvedContext: context,
      input: compactPayload({ id: topicId, promptForNext: options.promptForNext === true }),
      result,
      successMessage: 'Hosted discussion status loaded.',
    })
  } catch (error) {
    logError(`Failed to execute discuss status: ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 1
  }
}

export async function runDiscussDigest(options: DiscussionDigestOptions = {}): Promise<void> {
  try {
    const context = await resolveDiscussionContext(options)
    const selector = requireTopicSelector(options.id, '--id')
    const topicId = await resolveTopicId(options, context, selector)
    const detail = await fetchTopicDetail(options, context, topicId)
    const status = await fetchStatus(options, context, topicId)
    const presentation = buildStatusPresentation(detail, status)
    const result = compactPayload({
      topic: detail.topic,
      rules: isRecord(detail.topic.rules) ? detail.topic.rules : undefined,
      status: presentation,
      turns: detail.turns,
      outputs: detail.outputs,
      promptForNext: options.promptForNext === true ? buildPromptForNext(detail, status) : undefined,
    })
    emitEnvelope({
      options,
      command: 'discuss.digest',
      toolId: 'agentspace.discussion-topic.get',
      resolvedContext: context,
      input: compactPayload({ id: topicId, promptForNext: options.promptForNext === true }),
      result,
      successMessage: 'Hosted discussion digest generated.',
    })
  } catch (error) {
    logError(`Failed to execute discuss digest: ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 1
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function classifyWaitState(presentation: Record<string, unknown>, status: HostedStatus, agentId: string): {
  exitCode: number
  outcome: 'turn-ready' | 'operator-blocked' | 'done'
  reason: string
} | null {
  const lifecycleState = normalizeNonEmpty(presentation.lifecycleState)
  if (status.blockedOn === 'operator' || lifecycleState === 'blocked-by-operator') {
    return {
      exitCode: DISCUSSION_WAIT_OPERATOR_BLOCK_EXIT_CODE,
      outcome: 'operator-blocked',
      reason: 'Discussion is blocked by an operator-addressed open question.',
    }
  }
  if (
    lifecycleState === 'ready-to-conclude' ||
    lifecycleState === 'concluding' ||
    lifecycleState === 'concluded' ||
    lifecycleState === 'abandoned'
  ) {
    return {
      exitCode: DISCUSSION_WAIT_DONE_EXIT_CODE,
      outcome: 'done',
      reason: `Discussion lifecycleState is ${lifecycleState}.`,
    }
  }
  const nextTurn = isRecord(presentation.nextTurn) ? presentation.nextTurn : null
  const allowed = nextTurn ? toStringArray(nextTurn.allowedAgents).map((entry) => entry.toLowerCase()) : []
  if (allowed.includes(agentId.toLowerCase())) {
    return {
      exitCode: 0,
      outcome: 'turn-ready',
      reason: `${agentId} is allowed to write the next turn.`,
    }
  }
  return null
}

export async function runDiscussWait(options: DiscussionWaitOptions = {}): Promise<void> {
  try {
    const agentId = normalizeNonEmpty(options.for)
    if (!agentId) throw new Error('Provide --for <agent-id>.')
    const timeoutSec = typeof options.timeoutSec === 'number' && Number.isFinite(options.timeoutSec)
      ? Math.max(0, options.timeoutSec)
      : 300
    const intervalSec = typeof options.intervalSec === 'number' && Number.isFinite(options.intervalSec) && options.intervalSec > 0
      ? options.intervalSec
      : 5
    const context = await resolveDiscussionContext(options)
    const selector = requireTopicSelector(options.id, '--id')
    const topicId = await resolveTopicId(options, context, selector)
    const deadline = Date.now() + timeoutSec * 1000

    while (true) {
      const detail = await fetchTopicDetail(options, context, topicId)
      const status = await fetchStatus(options, context, topicId)
      const presentation = buildStatusPresentation(detail, status)
      const classified = classifyWaitState(presentation, status, agentId)
      if (classified) {
        const result = compactPayload({
          wait: { agentId, outcome: classified.outcome, exitCode: classified.exitCode, reason: classified.reason },
          status: presentation,
        })
        if (classified.exitCode !== 0) process.exitCode = classified.exitCode
        emitEnvelope({
          options,
          command: 'discuss.wait',
          toolId: 'agentspace.discussion-topic.status',
          resolvedContext: context,
          input: compactPayload({ id: topicId, for: agentId, timeoutSec, intervalSec }),
          result,
          successMessage: 'Hosted discussion wait completed.',
        })
        return
      }

      if (Date.now() >= deadline) {
        const result = compactPayload({
          wait: {
            agentId,
            outcome: 'timeout',
            exitCode: DISCUSSION_WAIT_TIMEOUT_EXIT_CODE,
            reason: `${agentId} did not become the next allowed discussion agent before timeout.`,
          },
          status: presentation,
        })
        process.exitCode = DISCUSSION_WAIT_TIMEOUT_EXIT_CODE
        emitEnvelope({
          options,
          command: 'discuss.wait',
          toolId: 'agentspace.discussion-topic.status',
          resolvedContext: context,
          input: compactPayload({ id: topicId, for: agentId, timeoutSec, intervalSec }),
          result,
          successMessage: 'Hosted discussion wait timed out.',
        })
        return
      }

      await sleep(Math.min(intervalSec * 1000, Math.max(0, deadline - Date.now())))
    }
  } catch (error) {
    logError(`Failed to execute discuss wait: ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 1
  }
}

function buildPersistentLoopPrompt(params: {
  topicSelector: string
  agentId: string
  timeoutSec: number
  intervalSec: number
}): string {
  const waitCommand = `aops-cli discuss wait --id ${params.topicSelector} --for ${params.agentId} --timeout-sec ${params.timeoutSec} --interval-sec ${params.intervalSec} --json`
  const statusCommand = `aops-cli discuss status --id ${params.topicSelector} --prompt-for-next --json`
  const turnCommand = `aops-cli discuss turn --topic ${params.topicSelector} --agent ${params.agentId} --expect-next ${params.agentId} --kind statement --text "<turn metni>" --apply --json`

  return [
    `Bu topic'te ${params.agentId} agent olarak kalici loopta calis.`,
    '',
    `Topic: ${params.topicSelector}`,
    `Agent: ${params.agentId}`,
    '',
    'Dongu:',
    '1. Surekli su komutla sirani bekle:',
    `   ${waitCommand}`,
    '',
    '2. Exit 0 olursa:',
    `   ${statusCommand}`,
    '   ciktisindaki promptForNext, lifecycleState ve recent turns uzerinden tam bir sonraki turn metnini uret.',
    '   Sonra:',
    `   ${turnCommand}`,
    '',
    '3. Eger status.lifecycleState `awaiting-final-stances` ise ve missingTurnFinalStances icinde bu agent varsa `--kind final-stance` kullan.',
    '',
    "4. Exit 20 ise operator sorusu/blok var: dur ve operator'e bildir.",
    "5. Exit 21 ise terminal/conclude/abandon boundary: dur ve operator'e bildir.",
    "6. Exit 22 ise timeout: durumu bildir, ama operator aksini soylemedikce loop'u birakma ve tekrar wait'e don.",
    '',
    'Onemli:',
    '- Her seferinde sadece bir turn yaz.',
    "- Turn yazdiktan sonra cikma; tekrar wait'e don.",
    '- Operator sorusu, terminal state veya acik blocker yoksa loopta kal.',
    '',
  ].join('\n')
}

export async function runDiscussLoopPrompt(options: DiscussionLoopPromptOptions = {}): Promise<void> {
  try {
    const agentId = normalizeNonEmpty(options.for)
    if (!agentId) throw new Error('Provide --for <agent-id>.')
    const timeoutSec = typeof options.timeoutSec === 'number' && Number.isFinite(options.timeoutSec)
      ? Math.max(0, options.timeoutSec)
      : 540
    const intervalSec = typeof options.intervalSec === 'number' && Number.isFinite(options.intervalSec) && options.intervalSec > 0
      ? options.intervalSec
      : 5
    const context = await resolveDiscussionContext(options)
    const selector = requireTopicSelector(options.id, '--id')
    const topicId = await resolveTopicId(options, context, selector)
    const detail = await fetchTopicDetail(options, context, topicId)
    if (!topicParticipants(detail.topic).some((participant) => participant.toLowerCase() === agentId.toLowerCase())) {
      throw new Error(`Agent "${agentId}" is not a participant in this discussion.`)
    }
    const topicSelector = normalizeNonEmpty(detail.topic.slug) ?? topicId
    const prompt = buildPersistentLoopPrompt({ topicSelector, agentId, timeoutSec, intervalSec })
    const result = compactPayload({
      topic: detail.topic,
      agentId,
      timeoutSec,
      intervalSec,
      waitCommand: `aops-cli discuss wait --id ${topicSelector} --for ${agentId} --timeout-sec ${timeoutSec} --interval-sec ${intervalSec} --json`,
      statusCommand: `aops-cli discuss status --id ${topicSelector} --prompt-for-next --json`,
      turnCommandTemplate: `aops-cli discuss turn --topic ${topicSelector} --agent ${agentId} --expect-next ${agentId} --kind <statement|final-stance> --text "<turn metni>" --apply --json`,
      prompt,
    })
    if (options.json) {
      console.log(JSON.stringify(buildHostedSugarEnvelope({
        command: 'discuss.loop-prompt',
        toolId: 'agentspace.discussion-topic.get',
        resolvedContext: buildResolvedContextRecord(context),
        input: compactPayload({ id: topicId, for: agentId, timeoutSec, intervalSec }),
        result,
      }), null, 2))
      return
    }
    console.log(prompt)
  } catch (error) {
    logError(`Failed to execute discuss loop-prompt: ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 1
  }
}

export async function runDiscussConclude(options: DiscussionConcludeOptions = {}): Promise<void> {
  try {
    ensureGuardedWrite(options, 'This command concludes a hosted discussion topic.')
    const context = await resolveDiscussionContext(options)
    const selector = requireTopicSelector(options.topic, '--topic')
    const topicId = await resolveTopicId(options, context, selector)
    const input = compactPayload({ topicId, updatedBy: normalizeNonEmpty(options.updatedBy) })
    const payload = await invokeDiscussionTool(options, context, {
      toolId: 'agentspace.discussion-topic.conclude',
      input,
      apply: options.apply,
      preview: options.preview,
    })
    const result = compactPayload({ topic: unwrapDiscussionRecord(payload) })
    emitEnvelope({
      options,
      command: 'discuss.conclude',
      toolId: 'agentspace.discussion-topic.conclude',
      resolvedContext: context,
      input,
      result,
      successMessage: 'Hosted discussion topic concluded.',
    })
  } catch (error) {
    logError(`Failed to execute discuss conclude: ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 1
  }
}

export async function runDiscussAbandon(options: DiscussionAbandonOptions = {}): Promise<void> {
  try {
    ensureGuardedWrite(options, 'This command abandons a hosted discussion topic.')
    const reason = normalizeNonEmpty(options.reason)
    if (!reason) throw new Error('Provide --reason <text>.')
    const context = await resolveDiscussionContext(options)
    const selector = requireTopicSelector(options.topic, '--topic')
    const topicId = await resolveTopicId(options, context, selector)
    const input = compactPayload({ topicId, reason })
    const payload = await invokeDiscussionTool(options, context, {
      toolId: 'agentspace.discussion-topic.abandon',
      input,
      apply: options.apply,
      preview: options.preview,
    })
    const result = compactPayload({ topic: unwrapDiscussionRecord(payload) })
    emitEnvelope({
      options,
      command: 'discuss.abandon',
      toolId: 'agentspace.discussion-topic.abandon',
      resolvedContext: context,
      input,
      result,
      successMessage: 'Hosted discussion topic abandoned.',
    })
  } catch (error) {
    logError(`Failed to execute discuss abandon: ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 1
  }
}

// -----------------------------------------------------------------------------
// Output (discussion-output.set): conclude-flow output authoring.
// -----------------------------------------------------------------------------

type DiscussionOutputOptions = DiscussionContextOptions & GuardedWriteOptions & {
  topic?: string
  outputKind?: string
  owner?: string
  text?: string
  fromFile?: string
}

export async function runDiscussOutput(options: DiscussionOutputOptions = {}): Promise<void> {
  try {
    ensureGuardedWrite(options, 'This command sets a hosted discussion output.')
    const context = await resolveDiscussionContext(options)
    const scopeId = requireScopeId(context)
    const selector = requireTopicSelector(options.topic, '--topic')
    const topicId = await resolveTopicId(options, context, selector)
    const outputKind = normalizeNonEmpty(options.outputKind)
    if (!outputKind) throw new Error('Provide --output-kind <kind> (e.g. consensus|disagreement|open-questions|final-stance|decision|agent-summary).')
    const ownerAgentId = normalizeNonEmpty(options.owner)
    if (!ownerAgentId) throw new Error('Provide --owner <agent-id> (must be a topic participant; server-enforced).')
    const content = await readTextInput({ text: options.text, fromFile: options.fromFile }, 'discussion output')
    const data = compactPayload({ scopeId, topicId, outputKind, ownerAgentId, content })
    const payload = await invokeDiscussionTool(options, context, {
      toolId: 'agentspace.discussion-output.set',
      input: { data },
      apply: options.apply,
      preview: options.preview,
    })
    const result = compactPayload({ output: unwrapDiscussionRecord(payload) })
    emitEnvelope({
      options,
      command: 'discuss.output',
      toolId: 'agentspace.discussion-output.set',
      resolvedContext: context,
      input: { data },
      result,
      successMessage: 'Hosted discussion output set.',
    })
  } catch (error) {
    logError(`Failed to execute discuss output: ${error instanceof Error ? error.message : String(error)}`)
    process.exitCode = 1
  }
}

// -----------------------------------------------------------------------------
// Command wiring
// -----------------------------------------------------------------------------

function addDiscussionContextOptions(cmd: Command): Command {
  applyCommonOptions(cmd, { withAuth: true, withProject: true, withYes: true, withJson: true })
  cmd.option('--scope-id <id>', 'Canonical owner scope override')
  cmd.option('--scope-resolution <mode>', 'Scope resolution for hosted reads: explicit | cascade')
  cmd.option('--tenant-id <id>', 'Tenant id header (x-tenant-id)')
  cmd.option('--locale <locale>', 'Locale header (x-locale)')
  cmd.option('--fallback-locale <locale>', 'Fallback locale header (x-fallback-locale)')
  return cmd
}

export function makeDiscussCommand(): Command {
  const cmd = new Command('discuss')
    .description('Manage hosted (server-first) Agentspace discussion topics')

  addDiscussionContextOptions(cmd)
  cmd.addHelpText(
    'after',
    `
Server-first discussion (no local files):
  Source of truth is the hosted Agentspace discussion ops. The CLI never writes
  or reads .aops/agentspace/discussions; create/write/read all go through the
  hosted gateway. discussion-topic.status/.get are authoritative; the CLI maps
  server data into lifecycleState/nextTurn/openQuestions for UX only.

Server-first-unsupported (explicit failures, not silent fallbacks):
  - --max-turns: hosted rules have no server-enforced max-turn cap; this flag
    fails. (PM-issue candidate.)
  - --objective: hosted topic has no objective column; it is folded into the
    topic question text.
  - turn --to <named-agent>: hosted addressedTo is ['agent','operator']; only
    --to operator maps. Use --reply-to <seq> to correlate an answer.
  - turn --reply-to: hosted reply correlation is by integer turn seq.
`,
  )

  const start = cmd.command('start')
    .description('Create a hosted discussion topic')
    .requiredOption('--title <title>', 'Topic title')
    .option('--slug <slug>', 'Operator-facing stable topic slug')
    .option('--objective <text>', 'Topic objective (folded into the hosted question; no hosted objective column)')
    .option('--question <text>', 'Opening question (required unless --objective supplies it)')
    .option('--agent <id>', 'Participant agent id; repeatable, minimum two', collectRepeatedOption, [])
    .option('--turn-order <mode>', 'Turn order: alternating|free (default: alternating)')
    .option('--max-turns <n>', 'UNSUPPORTED server-first (fails): no hosted max-turn cap', parseInteger)
    .option('--min-turns-before-conclude <n>', 'Guard conclude until this many turns exist', parseInteger)
    .option('--require-question-answer', 'Block non-answer turns while an open question remains (server-enforced)')
    .option('--subject-type <type>', 'Optional linked subject type')
    .option('--subject-id <id>', 'Optional linked subject id')
    .option('--tag <tag>', 'General tag; repeatable', collectRepeatedOption, [])
    .option('--preview', 'Validate without mutating hosted state')
    .option('--apply', 'Create the topic')
    .option('--idempotency-key <key>', 'Optional guarded-write idempotency key')
    .action((commandOptions) => runDiscussStart({ ...cmd.opts(), ...commandOptions }))
  addDiscussionContextOptions(start)
  start.addHelpText(
    'after',
    `
Examples:
  aops-cli discuss start --title "Sync conflict policy" --agent codex --agent gemini --question "pull dirty local state'i overwrite etmeli mi?" --apply --json
  aops-cli discuss start --title "Plan review" --agent codex --agent claude --turn-order free --apply --json

Notes:
  - minimum iki unique participant gerekir
  - default turn order alternating'dir (turnOrder = ordered participants)
  - --require-question-answer ve turn-order server tarafindan enforce edilir
`,
  )

  const followUp = cmd.command('follow-up')
    .description('Create a hosted child topic referencing an existing discussion (parent not mutated)')
    .option('--from <topic>', 'Parent hosted topic id or slug')
    .requiredOption('--title <title>', 'Child topic title')
    .option('--slug <slug>', 'Child topic slug')
    .option('--objective <text>', 'Child objective (folded into question)')
    .option('--question <text>', 'Child opening question')
    .option('--agent <id>', 'Participant agent id; repeatable, defaults to parent participants', collectRepeatedOption, [])
    .option('--turn-order <mode>', 'Turn order: alternating|free (defaults from parent)')
    .option('--min-turns-before-conclude <n>', 'Guard conclude until this many turns exist', parseInteger)
    .option('--require-question-answer', 'Block non-answer turns while an open question remains')
    .option('--max-turns <n>', 'UNSUPPORTED server-first (fails)', parseInteger)
    .option('--inherit-tags', 'Copy parent tags before adding child tags')
    .option('--inherit-subject', 'Copy parent subjectType and subjectId')
    .option('--reference-output <ref>', 'Parent output ref to record in lineage; repeatable', collectRepeatedOption, [])
    .option('--reference-turn <ref>', 'Parent turn ref to record in lineage; repeatable', collectRepeatedOption, [])
    .option('--reference-memory <ref>', 'Memory ref to record in lineage; repeatable', collectRepeatedOption, [])
    .option('--tag <tag>', 'General tag; repeatable', collectRepeatedOption, [])
    .option('--preview', 'Validate without mutating hosted state')
    .option('--apply', 'Create the child topic')
    .option('--idempotency-key <key>', 'Optional guarded-write idempotency key')
    .action((commandOptions) => runDiscussFollowUp({ ...cmd.opts(), ...commandOptions }))
  addDiscussionContextOptions(followUp)
  followUp.addHelpText(
    'after',
    `
Examples:
  aops-cli discuss follow-up --from <parent-id> --title "Next question" --question "Yeni karar ne olmali?" --inherit-tags --inherit-subject --reference-output consensus --apply --json

Notes:
  - parent topic mutate edilmez
  - child topic lineageKind=follow-up ve parentTopicId tasir
`,
  )

  const fork = cmd.command('fork')
    .description('Create a hosted fork topic branching from an existing discussion (parent not mutated)')
    .option('--from <topic>', 'Parent hosted topic id or slug')
    .requiredOption('--title <title>', 'Fork topic title')
    .option('--slug <slug>', 'Fork topic slug')
    .option('--objective <text>', 'Fork objective (folded into question)')
    .option('--question <text>', 'Fork opening question')
    .option('--agent <id>', 'Participant agent id; repeatable, defaults to parent participants', collectRepeatedOption, [])
    .option('--turn-order <mode>', 'Turn order: alternating|free (defaults from parent)')
    .option('--min-turns-before-conclude <n>', 'Guard conclude until this many turns exist', parseInteger)
    .option('--require-question-answer', 'Block non-answer turns while an open question remains')
    .option('--max-turns <n>', 'UNSUPPORTED server-first (fails)', parseInteger)
    .option('--inherit-tags', 'Copy parent tags before adding fork tags')
    .option('--inherit-subject', 'Copy parent subjectType and subjectId')
    .option('--reference-output <ref>', 'Parent output ref to record in lineage; repeatable', collectRepeatedOption, [])
    .option('--reference-turn <ref>', 'Parent turn ref to record in lineage; repeatable', collectRepeatedOption, [])
    .option('--reference-memory <ref>', 'Memory ref to record in lineage; repeatable', collectRepeatedOption, [])
    .option('--tag <tag>', 'General tag; repeatable', collectRepeatedOption, [])
    .option('--preview', 'Validate without mutating hosted state')
    .option('--apply', 'Create the fork topic')
    .option('--idempotency-key <key>', 'Optional guarded-write idempotency key')
    .action((commandOptions) => runDiscussFork({ ...cmd.opts(), ...commandOptions }))
  addDiscussionContextOptions(fork)
  fork.addHelpText(
    'after',
    `
Examples:
  aops-cli discuss fork --from <parent-id> --title "Alternative approach" --question "Baska yol ne olurdu?" --inherit-tags --apply --json

Notes:
  - parent topic mutate edilmez
  - child topic lineageKind=fork ve parentTopicId tasir
`,
  )

  const lineage = cmd.command('lineage')
    .description('Show the child-topic lineage tree for one discussion root (built from hosted list calls)')
    .option('--root <topic>', 'Root hosted topic id or slug')
    .option('--include-abandoned', 'Include abandoned child topics in the lineage tree')
    .action((commandOptions) => runDiscussLineage({ ...cmd.opts(), ...commandOptions }))
  addDiscussionContextOptions(lineage)
  lineage.addHelpText(
    'after',
    `
Examples:
  aops-cli discuss lineage --root <topic> --json
  aops-cli discuss lineage --root <topic> --include-abandoned --json
`,
  )

  const list = cmd.command('list')
    .description('List hosted discussion topics')
    .option('--status <status>', 'Status filter: active|concluding|concluded|abandoned')
    .option('--scope <scope>', 'Scope filter: standalone (accepted for compatibility)')
    .option('--agent <id>', 'Require participant agent; repeatable', collectRepeatedOption, [])
    .option('--subject-type <type>', 'Filter by linked subject type')
    .option('--subject-id <id>', 'Filter by linked subject id')
    .option('--limit <n>', 'Result limit', parseInteger)
    .option('--include-abandoned', 'Include abandoned topics in list output')
    .action((commandOptions) => runDiscussList({ ...cmd.opts(), ...commandOptions }))
  addDiscussionContextOptions(list)
  list.addHelpText(
    'after',
    `
Examples:
  aops-cli discuss list --status active --json
  aops-cli discuss list --agent codex --subject-type projectman.sprint --json
  aops-cli discuss list --include-abandoned --json

Notes:
  - abandoned topic'ler default list sonucunda gizlenir
`,
  )

  const get = cmd.command('get')
    .description('Get a hosted discussion topic with its turns and outputs')
    .option('--id <id>', 'Hosted topic id or slug')
    .action((commandOptions) => runDiscussGet({ ...cmd.opts(), ...commandOptions }))
  addDiscussionContextOptions(get)
  get.addHelpText(
    'after',
    `
Examples:
  aops-cli discuss get --id <topic> --json
`,
  )

  const turn = cmd.command('turn')
    .description('Append one turn to a hosted discussion topic (turn-order enforced server-side)')
    .option('--topic <id>', 'Hosted topic id or slug')
    .requiredOption('--agent <id>', 'Participant agent id')
    .requiredOption('--kind <kind>', `Turn kind: ${TURN_KINDS.join('|')}`)
    .option('--text <text>', 'Inline turn content')
    .option('--from-file <path>', 'Read turn content from a file path or `-` for stdin')
    .option('--reply-to <seq>', 'Reply correlation by integer turn seq (hosted replyToSeq)')
    .option('--to <operator>', 'Address the operator (only "operator" is supported; creates an operator block)')
    .option('--expect-next <agent-id>', 'Same-agent assertion; turn-order/seq race is enforced server-side')
    .option('--preview', 'Validate without mutating hosted state')
    .option('--apply', 'Write the turn')
    .option('--idempotency-key <key>', 'Optional guarded-write idempotency key (server idempotent re-add)')
    .action((commandOptions) => runDiscussTurn({ ...cmd.opts(), ...commandOptions }))
  addDiscussionContextOptions(turn)
  turn.addHelpText(
    'after',
    `
Examples:
  aops-cli discuss turn --topic <topic> --agent codex --kind question --text "Bu default guvenli mi?" --to operator --apply --json
  aops-cli discuss turn --topic <topic> --agent gemini --kind answer --from-file ./answer.md --reply-to 3 --apply --json
  aops-cli discuss turn --topic <topic> --agent codex --expect-next codex --kind statement --text "Siradaki turn." --apply --json

Notes:
  - turns append-onlydir
  - alternating order + operator-block + reply correlation server tarafindan enforce edilir
  - --to operator acik operator sorusu yaratir; --to <named-agent> server-first-unsupported
  - --reply-to artik turn id degil, turn seq (integer) alir
`,
  )

  const output = cmd.command('output')
    .description('Set a hosted discussion output (conclude-flow output authoring)')
    .option('--topic <id>', 'Hosted topic id or slug')
    .requiredOption('--output-kind <kind>', 'Output kind: consensus|disagreement|open-questions|final-stance|decision|agent-summary')
    .requiredOption('--owner <agent-id>', 'Owner agent id (must be a topic participant; server-enforced)')
    .option('--text <text>', 'Inline output content (must not contain _TBD_)')
    .option('--from-file <path>', 'Read output content from a file path or `-` for stdin')
    .option('--preview', 'Validate without mutating hosted state')
    .option('--apply', 'Write the output')
    .option('--idempotency-key <key>', 'Optional guarded-write idempotency key')
    .action((commandOptions) => runDiscussOutput({ ...cmd.opts(), ...commandOptions }))
  addDiscussionContextOptions(output)
  output.addHelpText(
    'after',
    `
Examples:
  aops-cli discuss output --topic <topic> --output-kind consensus --owner claude --text "Agreed: ..." --apply --json

Notes:
  - content _TBD_ marker icermez (server reddeder)
  - owner topic participant olmalidir (server-enforced)
`,
  )

  const status = cmd.command('status')
    .description('Read hosted discussion state mapped to lifecycleState/nextTurn/openQuestions')
    .option('--id <id>', 'Hosted topic id or slug')
    .option('--prompt-for-next', 'Include a deterministic prompt template for the suggested next participant')
    .action((commandOptions) => runDiscussStatus({ ...cmd.opts(), ...commandOptions }))
  addDiscussionContextOptions(status)
  status.addHelpText(
    'after',
    `
Examples:
  aops-cli discuss status --id <topic> --json
  aops-cli discuss status --id <topic> --prompt-for-next --json

Notes:
  - lifecycleState/nextTurn/openQuestions hosted status+get'ten turetilir (server truth)
`,
  )

  const wait = cmd.command('wait')
    .description('Poll hosted status until an agent may write, an operator block appears, or the topic is ready/done')
    .option('--id <id>', 'Hosted topic id or slug')
    .requiredOption('--for <agent-id>', 'Agent id waiting for its next allowed turn')
    .option('--timeout-sec <sec>', 'Maximum seconds to wait', parseNonNegativeNumber, 300)
    .option('--interval-sec <sec>', 'Polling interval seconds', parsePositiveNumber, 5)
    .action((commandOptions) => runDiscussWait({ ...cmd.opts(), ...commandOptions }))
  addDiscussionContextOptions(wait)
  wait.addHelpText(
    'after',
    `
Examples:
  aops-cli discuss wait --id <topic> --for codex --timeout-sec 540 --interval-sec 5 --json

Exit codes:
  0   requested agent is allowed to write the next turn
  20  discussion is blocked by an operator-addressed open question
  21  discussion is ready to conclude, concluding, concluded, or abandoned
  22  timeout
`,
  )

  const loopPrompt = cmd.command('loop-prompt')
    .description('Print a persistent agent loop prompt for hosted discussion automation')
    .option('--id <id>', 'Hosted topic id or slug')
    .requiredOption('--for <agent-id>', 'Agent id that should keep waiting and writing turns')
    .option('--timeout-sec <sec>', 'Maximum seconds per wait cycle', parseNonNegativeNumber, 540)
    .option('--interval-sec <sec>', 'Polling interval seconds', parsePositiveNumber, 5)
    .action((commandOptions) => runDiscussLoopPrompt({ ...cmd.opts(), ...commandOptions }))
  addDiscussionContextOptions(loopPrompt)
  loopPrompt.addHelpText(
    'after',
    `
Examples:
  aops-cli discuss loop-prompt --id <topic> --for claude
  aops-cli discuss loop-prompt --id <topic> --for claude --timeout-sec 540 --interval-sec 5 --json
`,
  )

  const digest = cmd.command('digest')
    .description('Build a non-interpretive hosted discussion context pack')
    .option('--id <id>', 'Hosted topic id or slug')
    .option('--prompt-for-next', 'Include a deterministic prompt template for the suggested next participant')
    .action((commandOptions) => runDiscussDigest({ ...cmd.opts(), ...commandOptions }))
  addDiscussionContextOptions(digest)
  digest.addHelpText(
    'after',
    `
Examples:
  aops-cli discuss digest --id <topic> --json
  aops-cli discuss digest --id <topic> --prompt-for-next --json
`,
  )

  const conclude = cmd.command('conclude')
    .description('Conclude a hosted discussion topic (server enforces min-turns + final-stance readiness)')
    .option('--topic <id>', 'Hosted topic id or slug')
    .option('--updated-by <agent-id>', 'Optional updatedBy actor')
    .option('--preview', 'Validate without mutating hosted state')
    .option('--apply', 'Conclude the topic')
    .option('--idempotency-key <key>', 'Optional guarded-write idempotency key')
    .action((commandOptions) => runDiscussConclude({ ...cmd.opts(), ...commandOptions }))
  addDiscussionContextOptions(conclude)
  conclude.addHelpText(
    'after',
    `
Examples:
  aops-cli discuss conclude --topic <topic> --apply --json

Notes:
  - server min-turns ve her participant icin final-stance turn'u hazir degilse conclude bloklanir
  - output authoring icin: aops-cli discuss output ...
`,
  )

  const abandon = cmd.command('abandon')
    .description('Mark a hosted discussion topic as abandoned')
    .option('--topic <id>', 'Hosted topic id or slug')
    .requiredOption('--reason <text>', 'Reason recorded in topic metadata')
    .option('--preview', 'Validate without mutating hosted state')
    .option('--apply', 'Abandon the topic')
    .option('--idempotency-key <key>', 'Optional guarded-write idempotency key')
    .action((commandOptions) => runDiscussAbandon({ ...cmd.opts(), ...commandOptions }))
  addDiscussionContextOptions(abandon)
  abandon.addHelpText(
    'after',
    `
Examples:
  aops-cli discuss abandon --topic <topic> --reason "Smoke test topic; wrong participant." --apply --json

Notes:
  - sadece active topic abandon edilebilir (server-enforced)
`,
  )

  return cmd
}
