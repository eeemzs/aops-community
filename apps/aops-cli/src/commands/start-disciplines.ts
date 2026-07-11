export const START_DISCIPLINES = ['solo-pm-loop', 'build-review-chat', 'design-first-consensus', 'coordinator-loop'] as const
export type StartDiscipline = (typeof START_DISCIPLINES)[number]

export type StartGuardrailDefinition = {
  id: string
  title: string
  description: string
  disciplines: StartDiscipline[]
  phase: 'execution' | 'closeout'
  evidence: string[]
  enforcementLevel: 'advisory' | 'soft-preflight' | 'strict-opt-in'
}

export type StartDisciplineProfile = {
  id: StartDiscipline
  version: string
  title: string
  whenToUse: string[]
  plan: {
    rhythm: string
    owner: string
  }
  review: {
    owner: string
    timing: string
    required: boolean
  }
  issue: {
    owner: string
    timing: string
  }
  memory: {
    owner: string
    cadence: string
  }
  guardrailIds: string[]
  closeoutGuardrailIds: string[]
}

export type StartDisciplineSignalMapping = {
  signal: string
  matches: string
  discipline: StartDiscipline
  reason: string
}

export const START_DISCIPLINE_SIGNAL_MAPPING: StartDisciplineSignalMapping[] = [
  {
    signal: 'decisionUncertainty',
    matches: 'high',
    discipline: 'design-first-consensus',
    reason: 'material design uncertainty needs final stances and operator approval before implementation',
  },
  {
    signal: 'operatorInterface',
    matches: 'delegated',
    discipline: 'coordinator-loop',
    reason: 'operator delegates the session to one coordinator agent that directs implementer agents',
  },
  {
    signal: 'mode',
    matches: 'chat-room',
    discipline: 'build-review-chat',
    reason: 'chat-room is coordination transport for live implementer/reviewer work',
  },
  {
    signal: 'agentCount',
    matches: '>1',
    discipline: 'build-review-chat',
    reason: 'more than one active agent needs per-slice PM review gates and chat wakes',
  },
  {
    signal: 'workSize+decisionUncertainty',
    matches: 'large+medium',
    discipline: 'design-first-consensus',
    reason: 'large work with non-trivial uncertainty should settle the design before coding',
  },
  {
    signal: 'default',
    matches: 'otherwise',
    discipline: 'solo-pm-loop',
    reason: 'single-agent or low-uncertainty work can iterate through PM and memory without live review',
  },
]

export const START_GUARDRAIL_REGISTRY: StartGuardrailDefinition[] = [
  {
    id: 'pm-task-sprint-before-implementation',
    title: 'PM task and sprint before implementation',
    description: 'Substantive engineering work starts from Projectman task/sprint truth instead of prose-only chat state.',
    disciplines: ['solo-pm-loop', 'build-review-chat', 'design-first-consensus', 'coordinator-loop'],
    phase: 'execution',
    evidence: ['projectman.kanban-task', 'projectman.sprint'],
    enforcementLevel: 'advisory',
  },
  {
    id: 'microtask-slice-rhythm',
    title: 'Slice work through microtasks',
    description: 'Multi-step work uses sprint phases and microtasks so progress and review scope stay inspectable.',
    disciplines: ['solo-pm-loop', 'build-review-chat', 'design-first-consensus', 'coordinator-loop'],
    phase: 'execution',
    evidence: ['projectman.sprint.phases.microtasks'],
    enforcementLevel: 'advisory',
  },
  {
    id: 'verify-first-initial-stance',
    title: 'Verify-first initial stance',
    description: 'Before formal discuss or live implementation on material multi-agent work, each active role records whether the problem is real, which truth source was checked, and whether consensus is needed.',
    disciplines: ['build-review-chat', 'design-first-consensus'],
    phase: 'execution',
    evidence: ['chatv3.message'],
    enforcementLevel: 'advisory',
  },
  {
    id: 'coordinator-independent-research',
    title: 'Coordinator independent research',
    description: 'The coordinator verifies scope in code, PM, and docs before assigning work to an implementer.',
    disciplines: ['coordinator-loop'],
    phase: 'execution',
    evidence: ['projectman.kanban-task', 'projectman.sprint'],
    enforcementLevel: 'advisory',
  },
  {
    id: 'single-operator-interface',
    title: 'Single operator interface',
    description: 'Implementers route questions and decisions to the coordinator, never directly to the operator; the coordinator escalates only operator-owned decisions.',
    disciplines: ['coordinator-loop'],
    phase: 'execution',
    evidence: ['chatv3.message'],
    enforcementLevel: 'advisory',
  },
  {
    id: 'assignment-via-canonical-refs',
    title: 'Assignment via canonical refs',
    description: 'Assignments carry mission/ktask/plan refs; chat prose alone is not an assignment.',
    disciplines: ['coordinator-loop'],
    phase: 'execution',
    evidence: ['agentspace.mission', 'projectman.kanban-task', 'projectman.sprint'],
    enforcementLevel: 'advisory',
  },
  {
    id: 'idle-window-improvement',
    title: 'Idle-window improvement work',
    description: 'The coordinator uses implementer work windows for doc/skill/tooling improvements and files findings as PM issues or feedback.',
    disciplines: ['coordinator-loop'],
    phase: 'execution',
    evidence: ['projectman.issue', 'projectman.feedback'],
    enforcementLevel: 'advisory',
  },
  {
    id: 'review-request-per-slice',
    title: 'Review request per implementation slice',
    description: 'Live build/review work opens a PM review request for every code slice and posts the ref into chat.',
    disciplines: ['build-review-chat', 'coordinator-loop'],
    phase: 'execution',
    evidence: ['projectman.review-request', 'chatv3.message'],
    enforcementLevel: 'advisory',
  },
  {
    id: 'verify-in-code',
    title: 'Verify in code',
    description: 'Reviewer approval is based on inspecting the actual changed code and tests, not only status prose.',
    disciplines: ['build-review-chat', 'coordinator-loop'],
    phase: 'execution',
    evidence: [],
    enforcementLevel: 'advisory',
  },
  {
    id: 'smoke-before-accept',
    title: 'Smoke before accept',
    description: 'The review result records direct validation or an explicit reason the smoke could not be run.',
    disciplines: ['build-review-chat', 'coordinator-loop'],
    phase: 'execution',
    evidence: [],
    enforcementLevel: 'advisory',
  },
  {
    id: 'explicit-pathspec-commit',
    title: 'Explicit pathspec commit',
    description: 'Atomically commit only the reviewed slice paths and leave unrelated worktree drift to its owner.',
    disciplines: ['build-review-chat', 'coordinator-loop'],
    phase: 'execution',
    evidence: [],
    enforcementLevel: 'advisory',
  },
  {
    id: 'no-fake-validation',
    title: 'No fake validation',
    description: 'Do not report tests, builds, smokes, or review checks that were not actually run in the session.',
    disciplines: ['build-review-chat', 'coordinator-loop'],
    phase: 'execution',
    evidence: [],
    enforcementLevel: 'advisory',
  },
  {
    id: 'material-findings-become-issues',
    title: 'Material findings become PM issues',
    description: 'Review blockers and defects are tracked as explicit Projectman issues instead of being buried in chat.',
    disciplines: ['solo-pm-loop', 'build-review-chat', 'design-first-consensus', 'coordinator-loop'],
    phase: 'execution',
    evidence: ['projectman.issue'],
    enforcementLevel: 'advisory',
  },
  {
    id: 'memory-checkpoint-cadence',
    title: 'Memory checkpoint cadence',
    description: 'Durable carry-forward context is written to Agentspace memory at meaningful phase or session boundaries.',
    disciplines: ['solo-pm-loop', 'build-review-chat', 'design-first-consensus', 'coordinator-loop'],
    phase: 'execution',
    evidence: ['agentspace.memory-item'],
    enforcementLevel: 'advisory',
  },
  {
    id: 'consensus-before-implementation',
    title: 'Consensus before implementation',
    description: 'Material design forks require discuss final stances and operator approval before code changes begin.',
    disciplines: ['design-first-consensus'],
    phase: 'execution',
    evidence: ['agentspace.discussion-topic.final-stance', 'operator.approval'],
    enforcementLevel: 'advisory',
  },
  {
    id: 'no-conclude-before-final-stance',
    title: 'No conclude before final stances',
    description: 'Design-first work does not conclude the discuss topic until each required agent records a final stance.',
    disciplines: ['design-first-consensus'],
    phase: 'execution',
    evidence: [],
    enforcementLevel: 'advisory',
  },
  {
    id: 'no-tbd-output',
    title: 'No TBD outputs',
    description: 'Concluded consensus outputs must be filled and must not carry placeholder TBD sections.',
    disciplines: ['design-first-consensus'],
    phase: 'execution',
    evidence: [],
    enforcementLevel: 'advisory',
  },
  {
    id: 'chat-is-coordination-only',
    title: 'Chat is coordination only',
    description: 'Chat wakes peers and carries refs; PM, discuss, and memory remain the truth ledgers.',
    disciplines: ['build-review-chat', 'design-first-consensus', 'coordinator-loop'],
    phase: 'execution',
    evidence: ['projectman.review-request', 'agentspace.discussion-topic', 'agentspace.memory-item'],
    enforcementLevel: 'advisory',
  },
  {
    id: 'no-hosted-mirror-hand-edit',
    title: 'No hosted mirror hand edits',
    description: 'Hosted prompt, skill, and Docman mirrors are read-only snapshots; canonical changes go through their owner commands.',
    disciplines: ['solo-pm-loop', 'build-review-chat', 'design-first-consensus', 'coordinator-loop'],
    phase: 'execution',
    evidence: [],
    enforcementLevel: 'advisory',
  },
  {
    id: 'closeout-handoff-memory',
    title: 'Closeout writes handoff memory',
    description: 'Session closeout leaves a handoff or resume memory item with next action, validation state, and source refs.',
    disciplines: ['solo-pm-loop', 'build-review-chat', 'design-first-consensus', 'coordinator-loop'],
    phase: 'closeout',
    evidence: ['agentspace.memory-item'],
    enforcementLevel: 'soft-preflight',
  },
  {
    id: 'closeout-triage-open-reviews',
    title: 'Closeout triages open review requests',
    description: 'Open review requests are accepted, linked to follow-up work, or explicitly deferred with an owner before leaving the session.',
    disciplines: ['solo-pm-loop', 'build-review-chat', 'design-first-consensus', 'coordinator-loop'],
    phase: 'closeout',
    evidence: ['projectman.review-request'],
    enforcementLevel: 'soft-preflight',
  },
  {
    id: 'closeout-triage-open-issues',
    title: 'Closeout triages open issues',
    description: 'Open issues are resolved, linked to follow-up work, or explicitly deferred with an owner according to the mission policy.',
    disciplines: ['solo-pm-loop', 'build-review-chat', 'design-first-consensus', 'coordinator-loop'],
    phase: 'closeout',
    evidence: ['projectman.issue'],
    enforcementLevel: 'soft-preflight',
  },
  {
    id: 'closeout-mission-status-finalized',
    title: 'Closeout finalizes mission status',
    description: 'The mission is left in a truthful status such as handoff or completed instead of a stale active state.',
    disciplines: ['solo-pm-loop', 'build-review-chat', 'design-first-consensus', 'coordinator-loop'],
    phase: 'closeout',
    evidence: ['agentspace.mission.status'],
    enforcementLevel: 'soft-preflight',
  },
  {
    id: 'closeout-resume-readiness',
    title: 'Closeout proves resume readiness',
    description: 'The mission resume pack has enough objective, policy, plan, memory, review, issue, and next-action context for the next session.',
    disciplines: ['solo-pm-loop', 'build-review-chat', 'design-first-consensus', 'coordinator-loop'],
    phase: 'closeout',
    evidence: ['agentspace.mission.resume-pack'],
    enforcementLevel: 'soft-preflight',
  },
  {
    id: 'closeout-session-summary',
    title: 'Closeout records session summary',
    description: 'A concise session summary captures what changed, what was validated, and what remains next.',
    disciplines: ['solo-pm-loop', 'build-review-chat', 'design-first-consensus', 'coordinator-loop'],
    phase: 'closeout',
    evidence: ['agentspace.memory-item'],
    enforcementLevel: 'soft-preflight',
  },
  {
    id: 'closeout-slice-review-accounted',
    title: 'Closeout accounts for slice review',
    description: 'Build/review closeout accounts for every slice review request as accepted, linked to an issue, or explicitly deferred with owner.',
    disciplines: ['build-review-chat', 'coordinator-loop'],
    phase: 'closeout',
    evidence: ['projectman.review-request', 'projectman.issue'],
    enforcementLevel: 'soft-preflight',
  },
  {
    id: 'closeout-commit-scope-recorded',
    title: 'Closeout records commit scope',
    description: 'Build/review closeout records commit hash, reviewed path scope, and validation evidence for the accepted slice.',
    disciplines: ['build-review-chat', 'coordinator-loop'],
    phase: 'closeout',
    evidence: ['git.commit', 'projectman.review-request', 'chatv3.message'],
    enforcementLevel: 'soft-preflight',
  },
  {
    id: 'closeout-assignment-queue-truthful',
    title: 'Closeout leaves the assignment queue truthful',
    description: 'Coordinator closeout binds every operator request to mission/ktask/plan records, marks it completed, or defers it explicitly with an owner.',
    disciplines: ['coordinator-loop'],
    phase: 'closeout',
    evidence: ['agentspace.mission', 'projectman.kanban-task'],
    enforcementLevel: 'soft-preflight',
  },
  {
    id: 'closeout-discuss-output-finalized',
    title: 'Closeout finalizes discuss outputs',
    description: 'Design-first closeout confirms final stances, consensus, disagreement, and open-question outputs are finalized without placeholders.',
    disciplines: ['design-first-consensus'],
    phase: 'closeout',
    evidence: ['agentspace.discussion-topic.outputs'],
    enforcementLevel: 'soft-preflight',
  },
  {
    id: 'closeout-decision-carried-to-execution',
    title: 'Closeout carries decision to execution truth',
    description: 'Design-first closeout carries the decision ref into PM task, sprint, issue, or feedback records before implementation resumes.',
    disciplines: ['design-first-consensus'],
    phase: 'closeout',
    evidence: ['projectman.kanban-task', 'projectman.sprint', 'projectman.issue', 'projectman.feedback'],
    enforcementLevel: 'soft-preflight',
  },
]

export const START_DISCIPLINE_PROFILES: Record<StartDiscipline, StartDisciplineProfile> = {
  'solo-pm-loop': {
    id: 'solo-pm-loop',
    version: 's1',
    title: 'Solo PM loop',
    whenToUse: ['single agent', 'low or medium uncertainty', 'review is optional or asynchronous'],
    plan: {
      owner: 'projectman',
      rhythm: 'task/sprint plus microtask iteration; review when risk warrants it',
    },
    review: {
      owner: 'projectman.review-request',
      timing: 'async optional at slice or session boundary',
      required: false,
    },
    issue: {
      owner: 'projectman.issue',
      timing: 'create when validation or review finds a material blocker',
    },
    memory: {
      owner: 'agentspace.memory-item',
      cadence: 'checkpoint at meaningful phase boundaries; summary at session end',
    },
    guardrailIds: [
      'pm-task-sprint-before-implementation',
      'microtask-slice-rhythm',
      'material-findings-become-issues',
      'memory-checkpoint-cadence',
      'no-hosted-mirror-hand-edit',
    ],
    closeoutGuardrailIds: [
      'closeout-handoff-memory',
      'closeout-triage-open-reviews',
      'closeout-triage-open-issues',
      'closeout-mission-status-finalized',
      'closeout-resume-readiness',
      'closeout-session-summary',
    ],
  },
  'build-review-chat': {
    id: 'build-review-chat',
    version: 's1',
    title: 'Build + review over chat',
    whenToUse: ['live implementer and reviewer', 'chat-room coordination', 'per-slice review needed'],
    plan: {
      owner: 'projectman',
      rhythm: 'slice equals microtask; open RR, post chat wake, resolve before commit',
    },
    review: {
      owner: 'projectman.review-request',
      timing: 'instant per implementation slice before commit',
      required: true,
    },
    issue: {
      owner: 'projectman.issue',
      timing: 'material RRR findings become linked issues before re-review',
    },
    memory: {
      owner: 'agentspace.memory-item',
      cadence: 'checkpoint after accepted slice or handoff-relevant review result',
    },
    guardrailIds: [
      'pm-task-sprint-before-implementation',
      'microtask-slice-rhythm',
      'verify-first-initial-stance',
      'review-request-per-slice',
      'verify-in-code',
      'smoke-before-accept',
      'explicit-pathspec-commit',
      'no-fake-validation',
      'material-findings-become-issues',
      'memory-checkpoint-cadence',
      'chat-is-coordination-only',
      'no-hosted-mirror-hand-edit',
    ],
    closeoutGuardrailIds: [
      'closeout-handoff-memory',
      'closeout-triage-open-reviews',
      'closeout-triage-open-issues',
      'closeout-mission-status-finalized',
      'closeout-resume-readiness',
      'closeout-session-summary',
      'closeout-slice-review-accounted',
      'closeout-commit-scope-recorded',
    ],
  },
  'design-first-consensus': {
    id: 'design-first-consensus',
    version: 's1',
    title: 'Design-first consensus',
    whenToUse: ['high design uncertainty', 'irreversible or cross-owner changes', 'consensus needed before coding'],
    plan: {
      owner: 'projectman',
      rhythm: 'discuss first, carry consensus ref into sprint plan, then slice implementation',
    },
    review: {
      owner: 'projectman.review-request',
      timing: 'after final stances and operator approval define the implementation slice',
      required: true,
    },
    issue: {
      owner: 'projectman.issue',
      timing: 'open issues for unresolved blockers; do not hide them in discussion prose',
    },
    memory: {
      owner: 'agentspace.memory-item',
      cadence: 'record accepted consensus and implementation handoff checkpoints',
    },
    guardrailIds: [
      'pm-task-sprint-before-implementation',
      'microtask-slice-rhythm',
      'verify-first-initial-stance',
      'material-findings-become-issues',
      'memory-checkpoint-cadence',
      'consensus-before-implementation',
      'no-conclude-before-final-stance',
      'no-tbd-output',
      'chat-is-coordination-only',
      'no-hosted-mirror-hand-edit',
    ],
    closeoutGuardrailIds: [
      'closeout-handoff-memory',
      'closeout-triage-open-reviews',
      'closeout-triage-open-issues',
      'closeout-mission-status-finalized',
      'closeout-resume-readiness',
      'closeout-session-summary',
      'closeout-discuss-output-finalized',
      'closeout-decision-carried-to-execution',
    ],
  },
  'coordinator-loop': {
    id: 'coordinator-loop',
    version: 's1',
    title: 'Coordinator loop',
    whenToUse: [
      'operator delegates the session to one coordinator agent',
      'one or more implementers work under coordinator direction',
      'free-form multi-task session that needs adaptive task intake',
    ],
    plan: {
      owner: 'projectman',
      rhythm:
        'operator request -> coordinator research -> mission/ktask/plan authoring -> chat assignment with canonical refs -> per-slice RR -> instructed pathspec commit',
    },
    review: {
      owner: 'projectman.review-request',
      timing: 'per implementation slice; reviewer defaults to the coordinator; commit on coordinator instruction',
      required: true,
    },
    issue: {
      owner: 'projectman.issue',
      timing: 'material findings and policy-doc gaps become issues/feedback as they are found',
    },
    memory: {
      owner: 'agentspace.memory-item',
      cadence: 'coordinator checkpoints at assignment, accepted-slice, and closeout boundaries',
    },
    guardrailIds: [
      'pm-task-sprint-before-implementation',
      'microtask-slice-rhythm',
      'coordinator-independent-research',
      'single-operator-interface',
      'assignment-via-canonical-refs',
      'idle-window-improvement',
      'review-request-per-slice',
      'verify-in-code',
      'smoke-before-accept',
      'explicit-pathspec-commit',
      'no-fake-validation',
      'material-findings-become-issues',
      'memory-checkpoint-cadence',
      'chat-is-coordination-only',
      'no-hosted-mirror-hand-edit',
    ],
    closeoutGuardrailIds: [
      'closeout-handoff-memory',
      'closeout-triage-open-reviews',
      'closeout-triage-open-issues',
      'closeout-mission-status-finalized',
      'closeout-resume-readiness',
      'closeout-session-summary',
      'closeout-slice-review-accounted',
      'closeout-commit-scope-recorded',
      'closeout-assignment-queue-truthful',
    ],
  },
}

export function startGuardrailsForDiscipline(discipline: StartDiscipline): StartGuardrailDefinition[] {
  const profile = START_DISCIPLINE_PROFILES[discipline]
  const ids = new Set([...profile.guardrailIds, ...profile.closeoutGuardrailIds])
  return START_GUARDRAIL_REGISTRY.filter((guardrail) => ids.has(guardrail.id))
}

export function startGuardrailGroupsForDiscipline(discipline: StartDiscipline): {
  execution: StartGuardrailDefinition[]
  closeout: StartGuardrailDefinition[]
} {
  const guardrails = startGuardrailsForDiscipline(discipline)
  return {
    execution: guardrails.filter((guardrail) => guardrail.phase === 'execution'),
    closeout: guardrails.filter((guardrail) => guardrail.phase === 'closeout'),
  }
}
