import fs from 'node:fs/promises'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { Command } from 'commander'
import { logInfo, logSuccess, logWarn } from '@aopslab/xf-cli-ui'

import { promptInput, promptSelect } from '../utils/prompts.js'
import { loadAopsRepoConfigReadOnly } from '../utils/repo-config.js'
import { resolveRepoFirstProjectmanPaths } from '../utils/repo-first-projectman.js'
import { readSessionStateNudges, type SessionStateNudge } from '../utils/session-state.js'
import {
  buildReadOnlyActivePlaybookNudgePackFromContext,
  type ActivePlaybookNudgePack,
  type ProjectPlaybookSet,
} from '../utils/playbook-workspace.js'
import { buildSessionGuidancePack, type SessionGuidancePack } from '../utils/session-guidance.js'
import { buildReadOnlyRepoFirstMemoryBriefFromContext } from './memory.js'
import { applyCommonOptions, compactPayload } from '../utils/command.js'
import { loadMissionResumePack, type LoadedMissionResumePack, type MissionResumeOptions } from './mission.js'
import {
  START_DISCIPLINES,
  START_DISCIPLINE_PROFILES,
  START_DISCIPLINE_SIGNAL_MAPPING,
  startGuardrailGroupsForDiscipline,
  startGuardrailsForDiscipline,
  type StartDiscipline,
  type StartDisciplineProfile,
  type StartGuardrailDefinition,
} from './start-disciplines.js'

export const START_PROMPT_MIRROR_PATH = '.aops/hosted/prompts/aops-collaborative-startup.md'

export const START_MODES = ['solo', 'solo+async-review', 'chat-room'] as const
export type StartMode = (typeof START_MODES)[number]

export const START_METHODS = START_DISCIPLINES
export type StartMethod = StartDiscipline

const MULTI_AGENT_MODES = new Set<string>(['chat-room'])

// Modes that were retired and now hard-fail with a migration hint instead of
// silently degrading. `full-collab` (repo-first collab session) was folded into
// `chat-room`: hosted chat = coordination, PM = review truth, discuss = consensus.
const REMOVED_MODES: Record<string, string> = {
  'full-collab':
    'full-collab modu kaldırıldı. Çok-agent canlı akış için --mode chat-room kullanın ' +
    '(hosted chat = koordinasyon/wake, PM review-request = review hakikati, discuss = konsensus).',
}

function assertSupportedMode(mode: string | undefined): void {
  if (mode === undefined) return
  const removed = REMOVED_MODES[mode]
  if (removed) throw new Error(removed)
  if (!START_MODES.includes(mode as StartMode)) {
    throw new Error(`Unsupported --mode "${mode}". Use one of: ${START_MODES.join(' | ')}.`)
  }
}

function assertSupportedDiscipline(value: string | undefined, flag = '--discipline'): void {
  if (value === undefined) return
  if (!START_DISCIPLINES.includes(value as StartDiscipline)) {
    throw new Error(`Unsupported ${flag} "${value}". Use one of: ${START_DISCIPLINES.join(' | ')}.`)
  }
}

function assertCompatibleDisciplineAliases(answers: Pick<StartAnswers, 'discipline' | 'method'>): void {
  const discipline = normalize(answers.discipline)
  const method = normalize(answers.method)
  assertSupportedDiscipline(discipline, '--discipline')
  assertSupportedDiscipline(method, '--method')
  if (discipline && method && discipline !== method) {
    throw new Error(`Conflicting --discipline "${discipline}" and --method "${method}". --method is a compatibility alias for --discipline.`)
  }
}

export type StartAnswers = {
  mode?: string
  task?: string
  projectSlug?: string
  board?: string
  roomSlug?: string
  roomTitle?: string
  roles?: string
  mission?: string
  resume?: string
  objective?: string
  discipline?: string
  method?: string
  workSize?: string
  agentCount?: string
  decisionUncertainty?: string
  operatorInterface?: string
  plan?: string
  checkpointStart?: string | boolean
  checkpointAutoBetweenPhases?: string | boolean
}

export type StartQuestion = {
  key: keyof StartAnswers
  flag: string
  question: string
  required: boolean
  askOperator: boolean
  default?: string
  suggestions?: string[]
}

export type StartBoardRef = {
  slug: string
  name?: string
}

export type StartComposeOptions = StartAnswers & {
  root?: string
  out?: string
  interactive?: boolean
  memoryBrief?: boolean
  area?: string
  limit?: string | number
  missionResumeDepth?: string
  missionResumeLimit?: string | number
  missionResumeFull?: boolean
} & Pick<
  MissionResumeOptions,
  'apiBaseUrl' | 'accessToken' | 'refreshToken' | 'timeoutMs' | 'tenantId' | 'locale' | 'fallbackLocale' | 'scopeId' | 'scopeResolution' | 'projectId' | 'projectName'
>

export type StartComposeResult = {
  action: 'start'
  status: 'ready' | 'needs-input'
  rootDir: string
  mirrorPath: string
  projectSlug?: string
  boards: StartBoardRef[]
  answers: StartAnswers
  questions: StartQuestion[]
  missing: StartQuestion[]
  warnings: string[]
  memoryBrief?: Record<string, unknown>
  mission?: StartMissionPack
  sessionGuidance?: SessionGuidancePack
  sessionStateNudges: SessionStateNudge[]
  prompt?: string
  promptRef?: StartPromptRef
  outFile?: string
}

export type StartPromptRef = {
  bytes: number
  sha256: string
  path?: string
  inline: boolean
}

export type StartReminderResult = {
  action: 'start.reminder'
  status: 'ready'
  rootDir: string
  projectSlug?: string
  answers: StartAnswers
  readOnly: true
  defaultWrite: false
  sessionGuidance: SessionGuidancePack
  suggestedActions: Array<Record<string, unknown>>
  warnings: string[]
}

export type StartMissionPack = {
  state: 'define' | 'resume' | 'implicit'
  mission?: Record<string, unknown>
  resumePack?: unknown
  discipline: {
    selected: StartDiscipline
    recommended: StartDiscipline
    explicit: boolean
    selectedBy: 'operator' | 'signals'
    reasons: string[]
    signals: Record<string, unknown>
    profile: StartDisciplineProfile
  }
  method: {
    selected: StartMethod
    recommended: StartMethod
    explicit: boolean
    aliasOf: 'discipline'
    reasons: string[]
  }
  guardrails: StartGuardrailDefinition[]
  guardrailGroups: {
    execution: StartGuardrailDefinition[]
    closeout: StartGuardrailDefinition[]
  }
  recipe: Record<string, unknown>
  policy: Record<string, unknown>
  policyJson: string
  startPack: Record<string, unknown>
  playbookSet?: ProjectPlaybookSet
  playbookNudges?: ActivePlaybookNudgePack
  sessionGuidance?: SessionGuidancePack
}

function normalize(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function booleanFlag(value: unknown): boolean {
  if (value === true) return true
  const normalized = normalize(value)?.toLowerCase()
  return normalized === 'true' || normalized === 'yes' || normalized === '1'
}

function parsePositiveInteger(value: unknown): number | undefined {
  const normalized = normalize(value)
  if (!normalized) return undefined
  const parsed = Number.parseInt(normalized, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined
}

function normalizeStartDiscipline(value: unknown): StartDiscipline | undefined {
  const normalized = normalize(value)
  if (!normalized) return undefined
  assertSupportedDiscipline(normalized)
  return normalized as StartDiscipline
}

function resolveExplicitDiscipline(answers: Pick<StartAnswers, 'discipline' | 'method'>): {
  discipline?: StartDiscipline
  source?: 'discipline' | 'method'
} {
  assertCompatibleDisciplineAliases(answers)
  const discipline = normalizeStartDiscipline(answers.discipline)
  if (discipline) return { discipline, source: 'discipline' }
  const method = normalizeStartDiscipline(answers.method)
  if (method) return { discipline: method, source: 'method' }
  return {}
}

function normalizeWorkSize(value: unknown): 'small' | 'medium' | 'large' | undefined {
  const normalized = normalize(value)?.toLowerCase()
  if (normalized === 'small' || normalized === 'medium' || normalized === 'large') return normalized
  return undefined
}

function normalizeDecisionUncertainty(value: unknown): 'low' | 'medium' | 'high' | undefined {
  const normalized = normalize(value)?.toLowerCase()
  if (normalized === 'low' || normalized === 'medium' || normalized === 'high') return normalized
  return undefined
}

function normalizeOperatorInterface(value: unknown): 'direct' | 'delegated' | undefined {
  const normalized = normalize(value)?.toLowerCase()
  if (normalized === 'direct' || normalized === 'delegated') return normalized
  return undefined
}

const START_METHOD_RECIPES: Record<StartMethod, Record<string, unknown>> = {
  'solo-pm-loop': {
    title: 'Solo PM loop',
    steps: [
      'Open or reuse a Projectman kanban task and sprint-backed implementation plan.',
      'Implement in small microtasks.',
      'Validate, request review when risk warrants it, then write a short PM handoff.',
    ],
    defaultSurfaces: ['projectman.implementation-plan', 'projectman.review-request'],
  },
  'build-review-chat': {
    title: 'Build + review over chat',
    steps: [
      'Keep chat as coordination and wake surface only.',
      'Store execution truth in Projectman implementation-plan and review-request records.',
      'Post review refs into the room, wait for review, then commit explicitly.',
    ],
    defaultSurfaces: ['chatv3.room', 'projectman.implementation-plan', 'projectman.review-request'],
  },
  'design-first-consensus': {
    title: 'Design-first consensus',
    steps: [
      'Run a discuss topic before implementation when material design uncertainty is high.',
      'Carry the consensus ref into the implementation plan.',
      'Implement only after final stances and review scope are clear.',
    ],
    defaultSurfaces: ['agentspace.discuss', 'projectman.implementation-plan', 'projectman.review-request'],
  },
  'coordinator-loop': {
    title: 'Coordinator loop',
    steps: [
      'The coordinator researches independently, authors mission/ktask/plan records, and assigns work with canonical refs.',
      'Implementers execute slices, open a review request per slice, and route questions to the coordinator instead of the operator.',
      'The coordinator reviews with code/runtime verification, then instructs the pathspec commit and the next assignment.',
    ],
    defaultSurfaces: ['agentspace.mission', 'chatv3.room', 'projectman.implementation-plan', 'projectman.review-request'],
  },
}

function serializeStartGuardrail(guardrail: StartGuardrailDefinition): Record<string, unknown> {
  return {
    id: guardrail.id,
    title: guardrail.title,
    description: guardrail.description,
    phase: guardrail.phase,
    evidence: guardrail.evidence,
    enforcementLevel: guardrail.enforcementLevel,
  }
}

function quoteCommandArg(value: string): string {
  return JSON.stringify(value)
}

function buildCheckpointCreateCommand(params: {
  summary: string
  position?: string
  missionId?: string
  sprintId?: string
  phaseId?: string
}): string {
  const parts = [
    'aops-cli checkpoint create',
    '--summary',
    quoteCommandArg(params.summary),
  ]
  if (params.position) parts.push('--position', quoteCommandArg(params.position))
  if (params.missionId) parts.push('--mission-id', params.missionId)
  if (params.sprintId) parts.push('--sprint-id', params.sprintId)
  if (params.phaseId) parts.push('--phase-id', params.phaseId)
  parts.push('--apply', '--json')
  return parts.join(' ')
}

function buildScopedSyncCommand(params: {
  action: 'status' | 'diff'
  projectSlug?: string
}): string {
  const parts = ['aops-cli', 'sync', params.action]
  if (params.projectSlug) parts.push('--project-slug', params.projectSlug)
  parts.push('--json')
  return parts.join(' ')
}

function collectStartSignals(answers: StartAnswers): Record<string, unknown> {
  return compactPayload({
    mode: normalize(answers.mode),
    workSize: normalizeWorkSize(answers.workSize),
    agentCount: parsePositiveInteger(answers.agentCount),
    decisionUncertainty: normalizeDecisionUncertainty(answers.decisionUncertainty),
    operatorInterface: normalizeOperatorInterface(answers.operatorInterface),
  })
}

function recommendStartDiscipline(answers: StartAnswers): { discipline: StartDiscipline; reasons: string[]; signals: Record<string, unknown> } {
  const reasons: string[] = []
  const signals = collectStartSignals(answers)
  const decisionUncertainty = normalizeDecisionUncertainty(answers.decisionUncertainty)
  const workSize = normalizeWorkSize(answers.workSize)
  const agentCount = parsePositiveInteger(answers.agentCount)
  const mode = normalize(answers.mode)
  const operatorInterface = normalizeOperatorInterface(answers.operatorInterface)

  if (decisionUncertainty === 'high') {
    reasons.push('decision uncertainty is high')
    return { discipline: 'design-first-consensus', reasons, signals }
  }

  if (operatorInterface === 'delegated') {
    reasons.push('operator delegates the session to a coordinator agent')
    return { discipline: 'coordinator-loop', reasons, signals }
  }

  if (mode === 'chat-room' || (agentCount !== undefined && agentCount > 1)) {
    if (mode === 'chat-room') reasons.push('chat-room mode selected')
    if (agentCount !== undefined && agentCount > 1) reasons.push(`agent count is ${agentCount}`)
    return { discipline: 'build-review-chat', reasons, signals }
  }

  if (workSize === 'large' && decisionUncertainty === 'medium') {
    reasons.push('large work with medium decision uncertainty')
    return { discipline: 'design-first-consensus', reasons, signals }
  }

  reasons.push('single-agent or low-uncertainty execution')
  return { discipline: 'solo-pm-loop', reasons, signals }
}

function buildMissionPolicySeed(params: {
  selected: StartDiscipline
  recommended: StartDiscipline
  explicit: boolean
  explicitSource?: 'discipline' | 'method'
  reasons: string[]
  signals: Record<string, unknown>
  mode: string
}): Record<string, unknown> {
  const profile = START_DISCIPLINE_PROFILES[params.selected]
  const guardrails = startGuardrailsForDiscipline(params.selected)
  const guardrailGroups = startGuardrailGroupsForDiscipline(params.selected)
  return compactPayload({
    discipline: {
      id: params.selected,
      version: profile.version,
      enforcement: 'advisory',
      selectedBy: params.explicit ? 'operator' : 'signals',
      selectedVia: params.explicitSource ? `--${params.explicitSource}` : 'signal-mapping',
      recommended: params.recommended,
      signals: params.signals,
      rationale: params.reasons,
    },
    guardrails: guardrails.map(serializeStartGuardrail),
    guardrailGroups: {
      execution: guardrailGroups.execution.map(serializeStartGuardrail),
      closeout: guardrailGroups.closeout.map(serializeStartGuardrail),
    },
    closeout: {
      required: true,
      trigger: 'explicit',
      guardrailIds: profile.closeoutGuardrailIds,
      check: {
        command: 'aops-cli mission check --closeout --id <mission-id> --json',
        mode: 'read-only',
        statusStates: ['present', 'missing', 'deferred-with-owner', 'not-applicable', 'waived-by-operator'],
        note: 'Later closeout validator; reports evidence for closeout guardrails and does not mutate PM, memory, git, boards, or chat rooms.',
      },
      handoff: {
        command: 'aops-cli mission handoff --id <mission-id> [--complete] --apply --json',
        mode: 'later-apply-helper',
        note: 'Conservative mission-level helper only; board and room closeout remain operator-approved lifecycle actions.',
      },
    },
    review: profile.review,
    issue: profile.issue,
    memory: profile.memory,
    plan: profile.plan,
    vocabBridge: {
      mode: {
        value: params.mode,
        meaning: 'transport/session shape',
      },
      discipline: {
        value: params.selected,
        meaning: 'policy preset plus guardrails, review, issue, memory, and plan rhythm',
      },
      method: {
        value: params.selected,
        aliasOf: 'discipline',
        compatibility: 'kept for existing start consumers during the transition',
      },
    },
    signalMapping: START_DISCIPLINE_SIGNAL_MAPPING,
  })
}

function buildStartMissionPack(answers: StartAnswers, params: {
  projectSlug?: string
  resumePack?: LoadedMissionResumePack
  playbookSet?: ProjectPlaybookSet
  playbookNudges?: ActivePlaybookNudgePack
}): StartMissionPack {
  const recommended = recommendStartDiscipline(answers)
  const explicit = resolveExplicitDiscipline(answers)
  const selected = explicit.discipline ?? recommended.discipline
  const resumeRef = normalize(answers.resume)
  const missionRef = resumeRef ?? normalize(answers.mission)
  const objective = normalize(answers.objective) ?? normalize(answers.task)
  const planId = normalize(answers.plan)
  const mode = normalize(answers.mode) ?? 'solo'
  const board = normalize(answers.board)
  const projectSlug = normalize(answers.projectSlug) ?? params.projectSlug
  const roomSlug = normalize(answers.roomSlug)
  const checkpointStart = booleanFlag(answers.checkpointStart)
  const checkpointAutoBetweenPhases = booleanFlag(answers.checkpointAutoBetweenPhases)
  const checkpointMissionId = missionRef ?? '<mission-id>'
  const checkpointStartCommand = buildCheckpointCreateCommand({
    summary: objective ? `Mission start: ${objective}` : 'Mission start checkpoint',
    position: planId ? `Starting implementation plan ${planId}` : 'Mission start',
    missionId: checkpointMissionId,
    sprintId: planId,
  })
  const checkpointPhaseTransitionCommand = buildCheckpointCreateCommand({
    summary: '<phase transition checkpoint summary>',
    position: '<from phase> -> <to phase>',
    missionId: checkpointMissionId,
    sprintId: planId ?? '<sprint-id>',
    phaseId: '<phase-id>',
  })
  const checkpointSuggestedActions = [
    checkpointStart
      ? {
          kind: 'mission-start-checkpoint',
          policyPath: 'mission.policy.checkpoint.start',
          mode: 'nudge-first',
          applyRequired: true,
          command: checkpointStartCommand,
        }
      : undefined,
    checkpointAutoBetweenPhases
      ? {
          kind: 'phase-transition-checkpoint',
          policyPath: 'mission.policy.checkpoint.autoBetweenPhases',
          mode: 'nudge-first',
          applyRequired: true,
          command: checkpointPhaseTransitionCommand,
        }
      : undefined,
  ].filter((action) => action !== undefined)
  const syncStatusCommand = buildScopedSyncCommand({ action: 'status', projectSlug })
  const syncDiffCommand = buildScopedSyncCommand({ action: 'diff', projectSlug })
  const syncSuggestedActions = [
    {
      kind: 'cache-sync-status',
      policyPath: 'mission.policy.sync.startStatus',
      mode: 'read-only',
      applyRequired: false,
      command: syncStatusCommand,
      note: 'Run at session start to inspect the read-only local cache vs the hosted server.',
    },
    {
      kind: 'cache-sync-diff',
      policyPath: 'mission.policy.sync.startDiff',
      mode: 'read-only',
      applyRequired: false,
      command: syncDiffCommand,
      note: 'Run at session start to inspect cache-vs-hosted drift; the hosted server is the source of truth.',
    },
  ]
  const playbookSet = params.playbookSet
  const playbookNudges = params.playbookNudges
  const playbookSuggestedActions = playbookNudges?.suggestedActions ?? playbookSet?.suggestedActions ?? []
  const deferredBindings = [
    planId
      ? {
          surface: 'projectman.implementation-plan',
          status: 'deferred',
          applyRequired: true,
          command: `aops-cli plan update --id ${planId} --reference <ref> --apply --json`,
        }
      : {
          surface: 'projectman.implementation-plan',
          status: 'deferred',
          applyRequired: true,
          command: 'aops-cli plan create --task <task-id> --name "<name>" --goal "<goal>" --apply --json',
    },
    selected === 'build-review-chat' || mode === 'chat-room'
      ? {
          surface: 'projectman.review-request',
          status: 'deferred',
          applyRequired: true,
          command: 'aops-cli pm review-request create --review-scope sprint:<plan-id> --target-agent <reviewer> --apply --json',
        }
      : undefined,
    selected === 'design-first-consensus'
      ? {
          surface: 'agentspace.discuss',
          status: 'deferred',
          applyRequired: true,
          command: 'aops-cli discuss start --title "<decision>" --question "<question>" --apply --json',
      }
      : undefined,
    ...checkpointSuggestedActions.map((action) => ({
      surface: 'agentspace.memory-item.checkpoint',
      status: 'suggested',
      applyRequired: true,
      policyPath: action.policyPath,
      command: action.command,
    })),
  ].filter((binding) => binding !== undefined)

  const state: StartMissionPack['state'] = missionRef ? 'resume' : objective ? 'define' : 'implicit'
  const mission = compactPayload({
    ref: missionRef,
    objective,
    projectSlug,
  })
  const selectionReasons = explicit.discipline
    ? [`explicit ${explicit.source === 'method' ? 'method alias' : 'discipline'} flag supplied`, ...recommended.reasons]
    : recommended.reasons
  const policyBase = buildMissionPolicySeed({
    selected,
    recommended: recommended.discipline,
    explicit: explicit.discipline !== undefined,
    explicitSource: explicit.source,
    reasons: selectionReasons,
    signals: recommended.signals,
    mode,
  })
  const policy = compactPayload({
    ...policyBase,
    orchestration: {
      mode: 'read-only-pack',
      sideEffects: 'none',
      activeBindings: 'deferred',
      note: 'start recommends PM/chat/discuss surfaces but does not create or bind records; run deferred commands with --apply to mutate truth surfaces.',
    },
    checkpoint: {
      start: checkpointStart,
      autoBetweenPhases: checkpointAutoBetweenPhases,
      mode: 'nudge-first',
      defaultWrite: false,
      writeRequires: 'explicit aops-cli checkpoint create --apply --json',
      suggestedActions: checkpointSuggestedActions,
      note: 'start composes checkpoint policy and suggested actions only; it never writes checkpoint memory by itself.',
    },
    sync: {
      mode: 'read-only-cache',
      startStatus: true,
      startDiff: true,
      defaultWrite: false,
      readOnly: true,
      readOnlyAtStart: ['status', 'diff'],
      sourceOfTruth: 'hosted-server',
      note: 'Server-first: the hosted aops-server is the source of truth and .aops/** is a read-only local cache. start composes read-only status/diff actions only; there is no push-back from the cache.',
      suggestedActions: syncSuggestedActions,
    },
    playbook: {
      owner: 'agentspace.memory-item',
      surface: 'agentspace.playbook',
      mode: 'nudge-first-read-only',
      defaultWrite: false,
      scopes: ['project', 'session'],
      durability: {
        project: ['sticky', 'durable'],
        session: ['short', 'durable', 'sticky'],
      },
      reviewState: ['accepted'],
      count: playbookSet?.count ?? 0,
      activeCount: playbookNudges?.count ?? playbookSet?.count ?? 0,
      projectCount: playbookNudges?.project.count ?? playbookSet?.count ?? 0,
      sessionCount: playbookNudges?.session.count ?? 0,
      suggestedActions: playbookSuggestedActions,
      closeoutCapture: playbookNudges?.closeoutCapture,
      examples: playbookNudges?.examples,
      note: 'start reads active accepted project/session playbooks as nudge-first guidance only; capture and promotion remain explicit playbook/experience commands with --apply.',
    },
    planning: {
      owner: 'projectman',
      surface: 'projectman.implementation-plan.*',
      sprintBacked: true,
      planId: planId ?? null,
      note: 'implementation-plan id is the underlying sprint id',
    },
    chat:
      selected === 'build-review-chat' || mode === 'chat-room'
        ? {
            owner: 'chatv3',
            roomSlug: roomSlug ?? null,
            note: 'coordination and wake only; PM remains execution/review truth',
          }
        : undefined,
    discuss:
      selected === 'design-first-consensus'
        ? {
            owner: 'agentspace.discuss',
            note: 'record final stances before implementation when design uncertainty is material',
          }
        : undefined,
  })
  const policyJson = JSON.stringify(policy)
  const guardrails = startGuardrailsForDiscipline(selected)
  const guardrailGroups = startGuardrailGroupsForDiscipline(selected)
  const profile = START_DISCIPLINE_PROFILES[selected]

  return {
    state,
    ...(Object.keys(mission).length > 0 ? { mission } : {}),
    ...(params.resumePack ? { resumePack: params.resumePack.result } : {}),
    discipline: {
      selected,
      recommended: recommended.discipline,
      explicit: explicit.discipline !== undefined,
      selectedBy: explicit.discipline ? 'operator' : 'signals',
      reasons: selectionReasons,
      signals: recommended.signals,
      profile,
    },
    method: {
      selected,
      recommended: recommended.discipline,
      explicit: explicit.discipline !== undefined,
      aliasOf: 'discipline',
      reasons: selectionReasons,
    },
    guardrails,
    guardrailGroups,
    recipe: START_METHOD_RECIPES[selected],
    policy,
    policyJson,
    ...(playbookSet ? { playbookSet } : {}),
    ...(playbookNudges ? { playbookNudges } : {}),
    startPack: compactPayload({
      mode,
      discipline: selected,
      method: selected,
      methodAliasOf: 'discipline',
      board,
      task: normalize(answers.task),
      objective,
      planId,
      policySeed: {
        target: 'mission.policy',
        flag: '--policy-json',
        json: policy,
        jsonString: policyJson,
        commandHint: missionRef
          ? 'aops-cli mission update --id <mission-id> --policy-json \'<result.mission.policyJson>\' --apply --json'
          : 'aops-cli mission create --objective "<objective>" --policy-json \'<result.mission.policyJson>\' --apply --json',
      },
      orchestration: {
        mode: 'read-only-pack',
        sideEffects: 'none',
        activeBindings: 'deferred',
        note: 'start recommends PM/chat/discuss surfaces but does not create or bind records; run deferred commands with --apply to mutate truth surfaces.',
      },
      checkpoint: {
        policyPath: 'mission.policy.checkpoint',
        start: checkpointStart,
        autoBetweenPhases: checkpointAutoBetweenPhases,
        mode: 'nudge-first',
        defaultWrite: false,
        suggestedActions: checkpointSuggestedActions,
        note: 'checkpoint hooks are opt-in nudges; execute the suggested aops-cli checkpoint create command with --apply to write memory.',
      },
      sync: {
        policyPath: 'mission.policy.sync',
        mode: 'read-only-cache',
        startStatus: true,
        startDiff: true,
        readOnly: true,
        sourceOfTruth: 'hosted-server',
        suggestedActions: syncSuggestedActions,
        note: 'Server-first: run read-only status/diff at session start. .aops/** is a read-only local cache refreshed from the hosted server; there is no push-back.',
      },
      playbookSet,
      playbookNudges,
      planning: {
        owner: 'projectman',
        surface: 'projectman.implementation-plan.*',
        sprintBacked: true,
        planId: planId ?? null,
        note: 'implementation-plan id is the underlying sprint id',
      },
      chat:
        selected === 'build-review-chat' || mode === 'chat-room'
          ? {
              owner: 'chatv3',
              roomSlug: roomSlug ?? null,
              note: 'coordination and wake only; PM remains execution/review truth',
            }
          : undefined,
      discuss:
        selected === 'design-first-consensus'
          ? {
              owner: 'agentspace.discuss',
              note: 'record final stances before implementation when design uncertainty is material',
            }
          : undefined,
      closeout: {
        required: true,
        trigger: 'explicit',
        guardrailIds: profile.closeoutGuardrailIds,
        checkCommandHint: 'aops-cli mission check --closeout --id <mission-id> --json',
        handoffCommandHint: 'aops-cli mission handoff --id <mission-id> [--complete] --apply --json',
        note: 'closeout is the before-leaving phase; deferred-with-owner is valid for unresolved PM truth, and board/room closeout stays operator-only',
      },
      deferredBindings,
      nextCommands: [
        missionRef
          ? 'aops-cli mission update --id <mission-id> --policy-json \'<result.mission.policyJson>\' --apply --json'
          : 'aops-cli mission create --objective "<objective>" --policy-json \'<result.mission.policyJson>\' --apply --json',
        planId
          ? `aops-cli plan get --id ${planId} --json`
          : 'aops-cli plan create --task <task-id> --name "<name>" --goal "<goal>" --apply --json',
        selected === 'build-review-chat'
          ? 'aops-cli pm review-request create --review-scope sprint:<plan-id> --target-agent <reviewer> --apply --json'
          : undefined,
        selected === 'design-first-consensus'
          ? 'aops-cli discuss start --title "<decision>" --question "<question>" --apply --json'
          : undefined,
        syncStatusCommand,
        syncDiffCommand,
        ...playbookSuggestedActions.map((action) => action.command),
        ...checkpointSuggestedActions.map((action) => action.command),
      ].filter(Boolean),
    }),
  }
}

function buildPromptRef(prompt: string, params: { path?: string; inline: boolean }): StartPromptRef {
  return {
    bytes: Buffer.byteLength(prompt, 'utf8'),
    sha256: createHash('sha256').update(prompt).digest('hex'),
    ...(params.path ? { path: params.path } : {}),
    inline: params.inline,
  }
}

function compactStartGuardrail(guardrail: StartGuardrailDefinition): Record<string, unknown> {
  return compactPayload({
    id: guardrail.id,
    title: guardrail.title,
    phase: guardrail.phase,
    enforcementLevel: guardrail.enforcementLevel,
  })
}

function compactStartGuardrailGroups(groups: StartMissionPack['guardrailGroups']): Record<string, unknown> {
  return compactPayload({
    execution: groups.execution.map(compactStartGuardrail),
    closeout: groups.closeout.map(compactStartGuardrail),
  })
}

function compactStartProfile(profile: StartDisciplineProfile): Record<string, unknown> {
  return compactPayload({
    id: profile.id,
    version: profile.version,
    title: profile.title,
  })
}

function compactPolicySeed(seed: unknown): Record<string, unknown> | undefined {
  const record = objectValue(seed)
  if (!record) return undefined
  return compactPayload({
    target: record.target,
    flag: record.flag,
    commandHint: record.commandHint,
    jsonRef: 'result.mission.policyJson',
  })
}

function compactStartPack(startPack: Record<string, unknown>): Record<string, unknown> {
  const checkpoint = objectValue(startPack.checkpoint)
  const sync = objectValue(startPack.sync)
  const closeout = objectValue(startPack.closeout)
  return compactPayload({
    mode: startPack.mode,
    discipline: startPack.discipline,
    method: startPack.method,
    methodAliasOf: startPack.methodAliasOf,
    board: startPack.board,
    task: startPack.task,
    objective: startPack.objective,
    planId: startPack.planId,
    policySeed: compactPolicySeed(startPack.policySeed),
    orchestration: startPack.orchestration,
    checkpoint: checkpoint
      ? compactPayload({
          policyPath: checkpoint.policyPath,
          start: checkpoint.start,
          autoBetweenPhases: checkpoint.autoBetweenPhases,
          mode: checkpoint.mode,
          defaultWrite: checkpoint.defaultWrite,
          suggestedActions: checkpoint.suggestedActions,
        })
      : undefined,
    sync: sync
      ? compactPayload({
          policyPath: sync.policyPath,
          mode: sync.mode,
          startStatus: sync.startStatus,
          startDiff: sync.startDiff,
          readOnly: sync.readOnly,
          sourceOfTruth: sync.sourceOfTruth,
          suggestedActions: sync.suggestedActions,
        })
      : undefined,
    planning: startPack.planning,
    chat: startPack.chat,
    discuss: startPack.discuss,
    closeout: closeout
      ? compactPayload({
          required: closeout.required,
          trigger: closeout.trigger,
          guardrailIds: closeout.guardrailIds,
          checkCommandHint: closeout.checkCommandHint,
          handoffCommandHint: closeout.handoffCommandHint,
        })
      : undefined,
    deferredBindings: startPack.deferredBindings,
    nextCommands: startPack.nextCommands,
    guidanceRef: 'result.sessionGuidance',
    playbookRef: 'result.sessionGuidance.layers.playbooks',
  })
}

function compactResumePack(resumePack: unknown): unknown {
  const record = objectValue(resumePack)
  if (!record) return resumePack
  const rest = { ...record }
  delete rest.playbookNudges
  return compactPayload({
    ...rest,
    playbookRef: 'result.sessionGuidance.layers.playbooks',
  })
}

function compactStartMissionPack(
  mission: StartMissionPack,
  params: { includeSessionGuidance: boolean },
): Record<string, unknown> {
  return compactPayload({
    state: mission.state,
    mission: mission.mission,
    resumePack: compactResumePack(mission.resumePack),
    discipline: compactPayload({
      selected: mission.discipline.selected,
      recommended: mission.discipline.recommended,
      explicit: mission.discipline.explicit,
      selectedBy: mission.discipline.selectedBy,
      reasons: mission.discipline.reasons,
      signals: mission.discipline.signals,
      profile: compactStartProfile(mission.discipline.profile),
    }),
    method: compactPayload({
      selected: mission.method.selected,
      recommended: mission.method.recommended,
      explicit: mission.method.explicit,
      aliasOf: mission.method.aliasOf,
      reasons: mission.method.reasons,
    }),
    guardrailGroups: compactStartGuardrailGroups(mission.guardrailGroups),
    recipe: mission.recipe,
    policyJson: mission.policyJson,
    policyRef: 'mission.policyJson',
    startPack: compactStartPack(mission.startPack),
    sessionGuidance: params.includeSessionGuidance ? mission.sessionGuidance : undefined,
    sessionGuidanceRef: params.includeSessionGuidance ? undefined : 'result.sessionGuidance',
  })
}

function appendMissionPackToPrompt(prompt: string, mission: StartMissionPack): string {
  const compactMission = compactStartMissionPack(mission, { includeSessionGuidance: true })
  return `${prompt.trimEnd()}

## Mission Orchestration Pack (read-only)

Use this compact pack to choose the working discipline and PM/chat/discuss surfaces. \`discipline\` is the canonical policy preset; \`method\` is kept beside it as a compatibility alias. \`start\` is read-only in this v1 path: it does not create plans, bind chat rooms, open discuss topics, promote playbooks, or run sync by itself. Read \`sessionGuidance\` first for layered rules L1-L3: runtime rules, working-discipline guardrails, accepted playbooks, and ranked experience briefs. Read \`startPack.sync\`: run the read-only sync status/diff commands at session start to compare the local cache against the hosted server. Server-first: the hosted aops-server is the source of truth and \`.aops/**\` is a read-only local cache; there is no push-back from the cache. \`policyJson\` is the single mission-policy seed; \`startPack.policySeed.jsonRef\` points back to it instead of duplicating it. Treat \`deferredBindings\` as the apply-required follow-up list, and write Projectman records for durable task state.

\`\`\`json
${JSON.stringify(compactMission, null, 2)}
\`\`\`
`
}

function isMultiAgentMode(mode: string | undefined): boolean {
  return mode !== undefined && MULTI_AGENT_MODES.has(mode)
}

export async function listLocalBoards(rootDir: string, localRoot?: string): Promise<StartBoardRef[]> {
  const boardsDir = resolveRepoFirstProjectmanPaths({ repoRoot: rootDir, localRoot }).boards
  let entries: string[]
  try {
    entries = await fs.readdir(boardsDir)
  } catch {
    return []
  }

  const boards: StartBoardRef[] = []
  for (const entry of entries) {
    if (!entry.endsWith('.md')) continue
    try {
      const raw = await fs.readFile(path.join(boardsDir, entry), 'utf-8')
      const head = raw.slice(0, 2000)
      const slug = head.match(/^slug:\s*"?([^"\n]+)"?\s*$/m)?.[1]?.trim()
      if (!slug) continue
      const name = head.match(/^name:\s*"?([^"\n]+)"?\s*$/m)?.[1]?.trim()
      boards.push({ slug, name })
    } catch {
      // Unreadable board files are skipped; the operator can still type a slug manually.
    }
  }
  return boards.sort((a, b) => a.slug.localeCompare(b.slug))
}

export function buildStartQuestions(answers: StartAnswers, boards: StartBoardRef[]): StartQuestion[] {
  const questions: StartQuestion[] = [
    {
      key: 'mode',
      flag: '--mode',
      question: `Session mode? (${START_MODES.join(' | ')})`,
      required: true,
      askOperator: false,
      default: 'solo',
      suggestions: [...START_MODES],
    },
    {
      key: 'board',
      flag: '--board',
      question: 'PM board slug (existing) or new:<title>?',
      required: true,
      askOperator: false,
      suggestions: boards.map((board) => board.slug),
    },
    {
      key: 'task',
      flag: '--task',
      question: 'Initial task definition? (optional; empty = set up and wait for task definitions)',
      required: false,
      askOperator: false,
    },
  ]

  if (isMultiAgentMode(answers.mode)) {
    const board = normalize(answers.board)
    const roomSlugDefault = board && !board.startsWith('new:') ? `${board}-room` : undefined
    questions.push(
      {
        key: 'roomSlug',
        flag: '--room-slug',
        question: 'Hosted chat room slug?',
        required: true,
        askOperator: false,
        default: roomSlugDefault,
      },
      {
        key: 'roomTitle',
        flag: '--room-title',
        question: 'Hosted chat room title?',
        required: true,
        askOperator: false,
        default: normalize(answers.roomSlug) ?? roomSlugDefault,
      },
      {
        key: 'roles',
        flag: '--roles',
        question: 'Participants and roles? (operator-only — e.g. "claude=implementer, codex=reviewer, mzs=operator")',
        required: true,
        askOperator: true,
      }
    )
  }

  return questions
}

export function stripHostedFrontmatter(content: string): string {
  if (!content.startsWith('---')) return content
  const close = content.indexOf('\n---', 3)
  if (close === -1) return content
  const afterClose = content.indexOf('\n', close + 1 + 3)
  return afterClose === -1 ? '' : content.slice(afterClose + 1).replace(/^\s+/, '')
}

function readEnvelopeResult(envelope: Record<string, unknown> | undefined): unknown {
  return envelope && typeof envelope === 'object' && !Array.isArray(envelope) ? envelope.result : undefined
}

function objectValue(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined
}

function memoryBriefResultFromEnvelope(envelope: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  const result = objectValue(readEnvelopeResult(envelope))
  if (!result) return undefined
  const input = objectValue(envelope?.input)
  if ((envelope?.readOnly === true || input?.readOnly === true) && result.readOnly === undefined) return { ...result, readOnly: true }
  return result
}

function appendMemoryBriefToPrompt(prompt: string, memoryBrief: Record<string, unknown> | undefined): string {
  if (!memoryBrief) return prompt
  return `${prompt.trimEnd()}

## Repo-First Memory Brief (read-only)

This pack was generated without writing memory. Use it as startup context; write follow-up context with \`aops-cli checkpoint create --summary "<summary>" --apply --json\` after meaningful progress.

\`\`\`json
${JSON.stringify(memoryBrief, null, 2)}
\`\`\`
`
}

export function composeStartPrompt(body: string, answers: StartAnswers, fallbackProjectSlug?: string, memoryBrief?: Record<string, unknown>): {
  prompt: string
  warnings: string[]
} {
  const replacements: Record<string, string> = {
    MODE: normalize(answers.mode) ?? 'solo',
    TASK: normalize(answers.task) ?? '(empty — set up and wait for task definitions)',
    PROJECT_SLUG: normalize(answers.projectSlug) ?? fallbackProjectSlug ?? 'current repo project',
    BOARD_SLUG: normalize(answers.board) ?? '-',
    ROOM_SLUG: normalize(answers.roomSlug) ?? '-',
    ROOM_TITLE: normalize(answers.roomTitle) ?? '-',
    AGENTS_AND_ROLES: normalize(answers.roles) ?? '- (solo)',
  }

  let prompt = body
  for (const [key, value] of Object.entries(replacements)) {
    prompt = prompt.split(`{{${key}}}`).join(value)
  }

  const warnings: string[] = []
  const leftover = prompt.match(/\{\{[A-Z_]+\}\}/g)
  if (leftover) {
    warnings.push(`Unresolved placeholders left in the composed prompt: ${[...new Set(leftover)].join(', ')}`)
  }
  return { prompt: appendMemoryBriefToPrompt(prompt, memoryBrief), warnings }
}

async function readStarterMirror(rootDir: string): Promise<{ mirrorPath: string; body: string }> {
  const mirrorPath = path.join(rootDir, ...START_PROMPT_MIRROR_PATH.split('/'))
  let raw: string
  try {
    raw = await fs.readFile(mirrorPath, 'utf-8')
  } catch {
    throw new Error(
      `Starter prompt mirror not found at ${START_PROMPT_MIRROR_PATH}. ` +
        'Refresh hosted mirrors first: aops-cli sync pull --apply --hosted-project-slug aops --json'
    )
  }
  return { mirrorPath, body: stripHostedFrontmatter(raw) }
}

function collectAnswers(options: StartComposeOptions): StartAnswers {
  return {
    mode: normalize(options.mode),
    task: normalize(options.task),
    projectSlug: normalize(options.projectSlug),
    board: normalize(options.board),
    roomSlug: normalize(options.roomSlug),
    roomTitle: normalize(options.roomTitle),
    roles: normalize(options.roles),
    mission: normalize(options.mission),
    resume: normalize(options.resume),
    objective: normalize(options.objective),
    discipline: normalize(options.discipline),
    method: normalize(options.method),
    workSize: normalize(options.workSize),
    agentCount: normalize(options.agentCount),
    decisionUncertainty: normalize(options.decisionUncertainty),
    operatorInterface: normalize(options.operatorInterface),
    plan: normalize(options.plan),
    checkpointStart: options.checkpointStart,
    checkpointAutoBetweenPhases: options.checkpointAutoBetweenPhases,
  }
}

async function loadStartMissionResumePack(
  options: StartComposeOptions,
  answers: StartAnswers,
  activeProject: { scopeId?: string; projectId?: string; name?: string } | undefined,
): Promise<LoadedMissionResumePack | undefined> {
  const missionId = normalize(answers.resume)
  if (!missionId) return undefined
  const loaded = await loadMissionResumePack({
    apiBaseUrl: options.apiBaseUrl,
    accessToken: options.accessToken,
    refreshToken: options.refreshToken,
    timeoutMs: options.timeoutMs,
    tenantId: options.tenantId,
    locale: options.locale,
    fallbackLocale: options.fallbackLocale,
    scopeId: normalize(options.scopeId) ?? normalize(activeProject?.scopeId) ?? normalize(activeProject?.projectId),
    scopeResolution: options.scopeResolution,
    projectId: normalize(options.projectId) ?? normalize(activeProject?.projectId),
    projectName: normalize(options.projectName),
    id: missionId,
    depth: normalize(options.missionResumeDepth) ?? 'light',
    limit: options.missionResumeLimit ?? 8,
    full: options.missionResumeFull,
  })
  if (!loaded) throw new Error('Mission resume pack could not be loaded. Check host availability/auth and retry.')
  return loaded
}

function missingQuestions(answers: StartAnswers, questions: StartQuestion[]): StartQuestion[] {
  return questions.filter((question) => question.required && normalize(answers[question.key]) === undefined)
}

async function promptForAnswersInteractively(answers: StartAnswers, boards: StartBoardRef[]): Promise<void> {
  if (normalize(answers.mode) === undefined) {
    answers.mode = await promptSelect({
      message: 'Session mode?',
      choices: START_MODES.map((mode) => ({ name: mode, value: mode })),
      default: 'solo',
    })
  }

  if (normalize(answers.board) === undefined) {
    if (boards.length > 0) {
      const OTHER = '__other__'
      const picked = await promptSelect({
        message: 'PM board?',
        choices: [
          ...boards.map((board) => ({ name: board.name ? `${board.slug} (${board.name})` : board.slug, value: board.slug })),
          { name: 'other (type a slug or new:<Title>)', value: OTHER },
        ],
      })
      answers.board =
        picked === OTHER
          ? await promptInput({
              message: 'Board slug or new:<Title>:',
              validate: (v) => (v.trim().length > 0 ? true : 'Board is required'),
            })
          : picked
    } else {
      answers.board = await promptInput({
        message: 'Board slug or new:<Title>:',
        validate: (v) => (v.trim().length > 0 ? true : 'Board is required'),
      })
    }
  }

  if (normalize(answers.task) === undefined) {
    answers.task = await promptInput({
      message: 'Initial task (optional, empty = set up and wait):',
      default: '',
    })
  }

  if (isMultiAgentMode(normalize(answers.mode))) {
    const board = normalize(answers.board)
    const roomSlugDefault = board && !board.startsWith('new:') ? `${board}-room` : undefined
    if (normalize(answers.roomSlug) === undefined) {
      answers.roomSlug = await promptInput({
        message: 'Chat room slug:',
        default: roomSlugDefault,
        validate: (v) => (v.trim().length > 0 ? true : 'Room slug is required in multi-agent modes'),
      })
    }
    if (normalize(answers.roomTitle) === undefined) {
      answers.roomTitle = await promptInput({
        message: 'Chat room title:',
        default: normalize(answers.roomSlug),
        validate: (v) => (v.trim().length > 0 ? true : 'Room title is required in multi-agent modes'),
      })
    }
    if (normalize(answers.roles) === undefined) {
      answers.roles = await promptInput({
        message: 'Participants and roles (e.g. "claude=implementer, codex=reviewer, mzs=operator"):',
        validate: (v) => (v.trim().length > 0 ? true : 'Roles are operator-assigned and required in multi-agent modes'),
      })
    }
  }
}

export async function composeStart(options: StartComposeOptions = {}): Promise<StartComposeResult> {
  assertSupportedMode(normalize(options.mode))
  assertCompatibleDisciplineAliases({
    discipline: normalize(options.discipline),
    method: normalize(options.method),
  })
  const startDir = options.root ? path.resolve(process.cwd(), options.root) : process.cwd()
  const loaded = await loadAopsRepoConfigReadOnly(startDir)
  const rootDir = loaded.rootDir

  const activeProject = loaded.config?.projects?.find(
    (project) => project.name === loaded.config?.activeProjectName
  )
  const projectSlug = normalize(activeProject?.slug) ?? normalize(activeProject?.name)
  const { mirrorPath, body } = await readStarterMirror(rootDir)
  const boards = await listLocalBoards(rootDir, activeProject?.localRoot)
  const sessionStateNudges = await readSessionStateNudges({ repoRoot: rootDir, localRoot: activeProject?.localRoot })

  const answers = collectAnswers(options)

  const interactiveAllowed =
    options.interactive !== false && process.stdin.isTTY === true && process.stdout.isTTY === true
  if (interactiveAllowed && missingQuestions(answers, buildStartQuestions(answers, boards)).length > 0) {
    await promptForAnswersInteractively(answers, boards)
  }

  const questions = buildStartQuestions(answers, boards)
  const missing = missingQuestions(answers, questions)

  const base = {
    action: 'start' as const,
    rootDir,
    mirrorPath,
    projectSlug,
    boards,
    answers,
    questions,
    sessionStateNudges,
  }

  if (missing.length > 0) {
    return { ...base, status: 'needs-input', missing, warnings: [] }
  }

  const memoryBriefEnvelope = options.memoryBrief === false
    ? undefined
    : await buildReadOnlyRepoFirstMemoryBriefFromContext({
        repoRoot: rootDir,
        configPath: loaded.configPath,
        configFound: Boolean(loaded.config),
        scopeId: activeProject?.scopeId ?? activeProject?.projectId,
        projectId: activeProject?.projectId,
        projectName: activeProject?.name,
        projectSlug,
        localRoot: activeProject?.localRoot,
        ownerRepo: activeProject?.ownerRepo,
        parentProjectSlug: activeProject?.parentProjectSlug,
      }, {
        subject: 'project',
        query: normalize(answers.task) ?? 'startup context',
        limit: 4,
        depth: 'light',
  })
  const memoryBrief = memoryBriefResultFromEnvelope(memoryBriefEnvelope)
  const activePlaybookMissionId = normalize(answers.resume) ?? normalize(answers.mission)
  const playbookNudges = await buildReadOnlyActivePlaybookNudgePackFromContext({
    repoRoot: rootDir,
    localRoot: activeProject?.localRoot,
    projectSlug,
  }, {
    missionId: activePlaybookMissionId,
  })
  const playbookSet = playbookNudges.project
  const missionResumePack = await loadStartMissionResumePack(options, answers, activeProject)
  const missionBase = buildStartMissionPack(answers, { projectSlug, resumePack: missionResumePack, playbookSet, playbookNudges })
  const sessionGuidance = await buildSessionGuidancePack({
    repoRoot: rootDir,
    localRoot: activeProject?.localRoot,
    projectSlug,
  }, {
    surface: 'start',
    task: normalize(answers.task) ?? normalize(answers.objective),
    missionId: normalize(answers.resume) ?? normalize(answers.mission),
    planId: normalize(answers.plan),
    area: normalize(options.area),
    limit: options.limit,
    playbookNudges,
    discipline: {
      selected: missionBase.discipline.selected,
      recommended: missionBase.discipline.recommended,
      explicit: missionBase.discipline.explicit,
      profile: missionBase.discipline.profile,
      guardrails: missionBase.guardrails,
    },
  })
  const mission: StartMissionPack = {
    ...missionBase,
    sessionGuidance,
    startPack: compactPayload({
      ...missionBase.startPack,
      sessionGuidance,
    }),
  }
  const composed = composeStartPrompt(body, answers, projectSlug, memoryBrief)
  const prompt = appendMissionPackToPrompt(composed.prompt, mission)
  const warnings = composed.warnings

  let outFile: string | undefined
  if (normalize(options.out)) {
    outFile = path.resolve(process.cwd(), options.out as string)
    await fs.mkdir(path.dirname(outFile), { recursive: true })
    await fs.writeFile(outFile, prompt, 'utf-8')
  }
  const promptRef = buildPromptRef(prompt, { path: outFile, inline: true })

  return { ...base, status: 'ready', missing: [], warnings, memoryBrief, mission, sessionGuidance, prompt, promptRef, outFile }
}

export async function composeStartReminder(options: StartComposeOptions = {}): Promise<StartReminderResult> {
  assertSupportedMode(normalize(options.mode))
  assertCompatibleDisciplineAliases({
    discipline: normalize(options.discipline),
    method: normalize(options.method),
  })
  const startDir = options.root ? path.resolve(process.cwd(), options.root) : process.cwd()
  const loaded = await loadAopsRepoConfigReadOnly(startDir)
  const rootDir = loaded.rootDir
  const activeProject = loaded.config?.projects?.find(
    (project) => project.name === loaded.config?.activeProjectName
  )
  const projectSlug = normalize(activeProject?.slug) ?? normalize(activeProject?.name)
  const answers = collectAnswers(options)
  const answersForRecommendation: StartAnswers = {
    ...answers,
    mode: normalize(answers.mode) ?? 'solo',
  }
  const recommended = recommendStartDiscipline(answersForRecommendation)
  const explicit = resolveExplicitDiscipline(answersForRecommendation)
  const selected = explicit.discipline ?? recommended.discipline
  const playbookNudges = await buildReadOnlyActivePlaybookNudgePackFromContext({
    repoRoot: rootDir,
    localRoot: activeProject?.localRoot,
    projectSlug,
  }, {
    missionId: normalize(answers.resume) ?? normalize(answers.mission),
    limit: parsePositiveInteger(options.limit),
  })
  const guardrails = startGuardrailsForDiscipline(selected)
  const profile = START_DISCIPLINE_PROFILES[selected]
  const sessionGuidance = await buildSessionGuidancePack({
    repoRoot: rootDir,
    localRoot: activeProject?.localRoot,
    projectSlug,
  }, {
    surface: 'start-reminder',
    task: normalize(answers.task) ?? normalize(answers.objective),
    missionId: normalize(answers.resume) ?? normalize(answers.mission),
    planId: normalize(answers.plan),
    area: normalize(options.area),
    limit: options.limit,
    playbookNudges,
    discipline: {
      selected,
      recommended: recommended.discipline,
      explicit: explicit.discipline !== undefined,
      profile,
      guardrails,
    },
  })

  return {
    action: 'start.reminder',
    status: 'ready',
    rootDir,
    projectSlug,
    answers,
    readOnly: true,
    defaultWrite: false,
    sessionGuidance,
    suggestedActions: sessionGuidance.suggestedActions,
    warnings: [],
  }
}

type StartCommandOptions = StartComposeOptions & {
  json?: boolean
  reminder?: boolean
  compact?: boolean
  fullOutput?: boolean
}

function serializableStartResult(result: StartComposeResult, params: { compact: boolean }): Record<string, unknown> {
  const base = {
    action: result.action,
    status: result.status,
    rootDir: result.rootDir,
    mirrorPath: result.mirrorPath,
    projectSlug: result.projectSlug,
    boards: result.boards,
    answers: result.answers,
    questions: result.questions,
    missing: result.missing,
    warnings: result.warnings,
    memoryBrief: result.memoryBrief,
    sessionGuidance: result.sessionGuidance,
    sessionStateNudges: result.sessionStateNudges,
    promptRef: result.promptRef
      ? { ...result.promptRef, inline: params.compact ? false : result.promptRef.inline }
      : undefined,
    outFile: result.outFile,
  }

  if (params.compact) {
    return {
      ...base,
      mission: result.mission ? compactStartMissionPack(result.mission, { includeSessionGuidance: false }) : undefined,
    }
  }

  return {
    ...base,
    mission: result.mission,
    prompt: result.prompt,
  }
}

function serializableStartReminderResult(result: StartReminderResult): Record<string, unknown> {
  return {
    action: result.action,
    status: result.status,
    rootDir: result.rootDir,
    projectSlug: result.projectSlug,
    answers: result.answers,
    readOnly: result.readOnly,
    defaultWrite: result.defaultWrite,
    sessionGuidance: result.sessionGuidance,
    suggestedActions: result.suggestedActions,
    warnings: result.warnings,
  }
}

export async function runStart(options: StartCommandOptions = {}): Promise<void> {
  const interactive = options.json === true ? false : options.interactive
  if (options.reminder === true) {
    const result = await composeStartReminder({ ...options, interactive: false })
    if (options.json) {
      console.log(JSON.stringify({ command: 'start.reminder', result: serializableStartReminderResult(result) }, null, 2))
      return
    }
    logSuccess('Session guidance reminder ready (read-only).')
    console.log(JSON.stringify(result.sessionGuidance, null, 2))
    return
  }

  const result = await composeStart({ ...options, interactive })

  if (options.json) {
    const compact = options.fullOutput === true ? false : true
    console.log(JSON.stringify({ command: 'start', result: serializableStartResult(result, { compact }) }, null, 2))
    return
  }

  result.warnings.forEach((warning) => logWarn(warning))

  if (result.status === 'needs-input') {
    logWarn('Missing answers — re-run with the flags below (or answer interactively in a TTY):')
    for (const question of result.missing) {
      const hints: string[] = []
      if (question.default) hints.push(`default: ${question.default}`)
      if (question.suggestions && question.suggestions.length > 0) hints.push(`suggestions: ${question.suggestions.join(', ')}`)
      if (question.askOperator) hints.push('ask the operator — do not invent this answer')
      logInfo(`${question.flag} — ${question.question}${hints.length > 0 ? ` [${hints.join('; ')}]` : ''}`)
    }
    return
  }

  if (result.outFile) logSuccess(`Composed kickoff prompt written to ${result.outFile}`)
  logSuccess(`Kickoff prompt ready (mode: ${result.answers.mode}, board: ${result.answers.board})`)
  process.stdout.write(`\n${result.prompt ?? ''}`)
}

export function makeStartCommand(): Command {
  const cmd = new Command('start')
    .description('Compose the AOPS Collaborative Startup kickoff prompt (interactive or flag-driven)')
    .option('--mode <mode>', `Session mode: ${START_MODES.join(' | ')}`)
    .option('--task <text>', 'Initial task definition (optional; empty = set up and wait)')
    .option('--board <slug>', 'PM board slug or new:<title>')
    .option('--project-slug <slug>', 'Project slug override (default: repo config active project)')
    .option('--room-slug <slug>', 'Hosted chat room slug (chat-room mode)')
    .option('--room-title <title>', 'Hosted chat room title (chat-room mode)')
    .option('--roles <list>', 'Operator-assigned roles, e.g. "claude=implementer, codex=reviewer, mzs=operator"')
    .option('--mission <ref>', 'Mission id or title to resume/define in the startup pack')
    .option('--resume <mission-id>', 'Hosted mission id to resume; embeds a compact mission resume pack')
    .option('--objective <text>', 'Mission objective override; defaults to --task when omitted')
    .option('--discipline <discipline>', `Working discipline: ${START_DISCIPLINES.join(' | ')}`)
    .option('--method <method>', `Compatibility alias for --discipline: ${START_METHODS.join(' | ')}`)
    .option('--work-size <size>', 'Work size signal for method recommendation: small | medium | large')
    .option('--agent-count <n>', 'Agent count signal for method recommendation')
    .option('--decision-uncertainty <level>', 'Decision uncertainty signal: low | medium | high')
    .option('--operator-interface <shape>', 'Operator interface signal: direct | delegated (delegated recommends coordinator-loop)')
    .option('--plan <id>', 'Existing implementation-plan id; this is the underlying sprint id')
    .option('--checkpoint-start', 'Seed mission.policy.checkpoint.start=true and surface a checkpoint create suggested action; start remains read-only')
    .option('--checkpoint-auto-between-phases', 'Seed mission.policy.checkpoint.autoBetweenPhases=true and surface phase-transition checkpoint nudges')
    .option('--mission-resume-depth <depth>', 'Hosted mission resume depth: light | standard', 'light')
    .option('--mission-resume-limit <n>', 'Maximum refs/rows for the compact hosted mission resume pack', '8')
    .option('--mission-resume-full', 'Embed the full hosted mission resume skeleton instead of the compact summary')
    .option('--reminder', 'Build a bounded read-only session guidance reminder pack instead of the full kickoff prompt')
    .option('--area <area>', 'Area hint for reminder/session guidance experience ranking')
    .option('--limit <n>', 'Maximum experience briefs in session guidance; default 3, max 5')
    .option('--compact', 'Use compact JSON output with promptRef instead of inline prompt (default for --json)')
    .option('--full-output', 'With --json, include the full composed prompt and uncompact mission payload')
    .option('--root <path>', 'Workspace root override (default: nearest repo config ancestor)')
    .option('--out <file>', 'Write the composed prompt to a file')
    .option('--no-memory-brief', 'Do not build/embed the read-only local memory cache brief')
    .option('--no-interactive', 'Never prompt on a TTY; report missing answers instead')
    .option('--json', 'Output JSON only (implies --no-interactive)')
    .action(async (options: StartCommandOptions) => {
      await runStart(options)
    })
    .addHelpText(
      'after',
      `
The composed prompt is the hosted "AOPS Collaborative Startup" starter
(mirror: ${START_PROMPT_MIRROR_PATH}) with its operator
placeholders filled in. It boots the aops-collaborative-work skill and embeds a
read-only local memory cache brief pack for startup context unless
--no-memory-brief is set.

Examples:
  aops-cli start                                   # interactive (operator at a TTY)
  aops-cli start --json                            # agent interview: questions + missing answers
  aops-cli start --mode solo --board ops --json    # compact JSON; read result.promptRef
  aops-cli start --mode solo --board ops --out tmp/start.md --json
  aops-cli start --mode solo --board ops --full-output --json
  aops-cli start --reminder --task "continue S1" --area aops-cli --json
  aops-cli start --mode chat-room --board ops --discipline build-review-chat --json
  aops-cli start --resume <mission-id> --mode solo --board ops --json
  aops-cli start --mode chat-room --board ops \\
    --room-slug ops-room --room-title "Ops" \\
    --roles "claude=implementer, codex=reviewer, mzs=operator" --json

Agent flow:
  1. Run \`aops-cli start --json\` and read result.missing.
  2. Answer what you already know from context; ask the operator only the
     items marked askOperator (roles are always operator-assigned).
  3. Re-run with the answers as flags until result.status is "ready".
  4. Default --json is compact: follow result.promptRef.path when --out is used,
     or re-run with --full-output only when an inline prompt is required. Use
     result.memoryBrief as the read-only startup pack when present; write
     \`aops-cli checkpoint create --summary "<summary>" --apply --json\` only
     after meaningful progress.
`
    )

  applyCommonOptions(cmd, { withProject: true })
  cmd.option('--scope-id <id>', 'Canonical owner scope override for hosted mission resume')
  cmd.option('--scope-resolution <mode>', 'Scope resolution for hosted reads: explicit | cascade')
  cmd.option('--tenant-id <id>', 'Tenant id header (x-tenant-id)')
  cmd.option('--locale <locale>', 'Locale header (x-locale)')
  cmd.option('--fallback-locale <locale>', 'Fallback locale header (x-fallback-locale)')

  return cmd
}
