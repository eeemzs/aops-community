<!-- Public packaged snapshot from canonical slug:aops working-discipline guidance. Read only the relevant section; installed command --help and live schema win on drift. -->

# AOPS Working Disciplines v7

_Release Notes:_ Adds coordinator-loop discipline (operator -> coordinator -> implementer delegation, free-form multi-task sessions) + guardrails + signal mapping

## 1 Core model

### 1.1 Overview

#### 1.1.1 Overview

`discipline` is the user-facing name for a policy preset. `method` is a
compatibility alias in `aops start` output and flags.

A discipline is:

- a policy preset id
- `guardrails[]`
- when-to-use signals
- review and RRR timing
- issue timing
- memory cadence
- plan and slice rhythm

A discipline is role-agnostic. Reusable discipline text names roles such as `implementer`, `reviewer`, `coordinator`, and `operator-approver`; it does not bind concrete agents to those roles. Concrete agent-to-role assignment belongs in mission-specific `mission.policy.roles`.

The four canonical ids are:

| Discipline | Best for | Primary surfaces |
| --- | --- | --- |
| `solo-pm-loop` | Single-agent or low-uncertainty work | Projectman, optional RR, memory |
| `build-review-chat` | Live implementer plus reviewer work | Projectman RR/RRR, ChatV3 wake, memory |
| `design-first-consensus` | High design uncertainty or irreversible choices | Discuss, operator approval, Projectman |
| `coordinator-loop` | Operator delegates session management to one coordinator agent directing implementer agents | Mission policy, Projectman RR/RRR, ChatV3 room, memory |

`mode` is transport/session shape: `solo`, `solo+async-review`, or `chat-room`.
`discipline` is the work policy. A chat-room mode usually maps to
`build-review-chat`, but an operator can override with `--discipline`.
`coordinator-loop` also runs in `chat-room` mode; the difference is the
authority shape: in `build-review-chat` the operator coordinates peers, in
`coordinator-loop` the operator talks only to the coordinator and the
coordinator directs the other agents.

`verify-first consensus-to-build` is a composite recipe, not a discipline.
Use it when an operator reports an AOPS/project improvement issue and wants two
agents to verify the problem before deciding whether a formal discuss topic is
needed. It combines a short verify-first stance from each active role,
`design-first-consensus` when the decision is material, and `build-review-chat`
for reviewed implementation slices after consensus is bound to Projectman.

## 2 Start selection

### 2.1 Overview

#### 2.1.1 Overview

`aops start` exposes the transition vocabulary:

```bash
aops start --mode chat-room --board <board> --discipline build-review-chat --json
aops start --mode solo --board <board> --method solo-pm-loop --json
aops start --mode chat-room --board <board> --discipline coordinator-loop --json
```

`--discipline` is preferred. `--method` is a compatibility alias. Supplying both
with different values is an error.

Signal mapping:

| Signal | Match | Discipline | Why |
| --- | --- | --- | --- |
| `decisionUncertainty` | `high` | `design-first-consensus` | Settle design before implementation. |
| `operatorInterface` | `delegated` | `coordinator-loop` | Operator wants one coordinator as the single interface; other agents work under it. |
| `mode` | `chat-room` | `build-review-chat` | Chat is live coordination for build/review. |
| `agentCount` | `>1` | `build-review-chat` | Multiple agents need per-slice review gates. |
| `workSize + decisionUncertainty` | `large + medium` | `design-first-consensus` | Large uncertain work should converge first. |
| default | otherwise | `solo-pm-loop` | Single-agent or low-uncertainty PM loop. |

`operatorInterface: delegated` wins over the plain `chat-room ->
build-review-chat` mapping because the delegation hierarchy changes review
authority and escalation routing, not just transport.

The start pack includes:

- `discipline.selected`, `discipline.recommended`, `discipline.reasons`
- `method.selected` with `aliasOf: "discipline"`
- `guardrails[]`
- `guardrailGroups.execution` and `guardrailGroups.closeout`
- `policy` and `policyJson` for mission policy seeding
- `policy.closeout` with explicit closeout command hints
- apply-required `deferredBindings`

## 3 Mission policy convention

### 3.1 Overview

#### 3.1.1 Overview

Mission policy stays free-form, but AOPS uses this convention. The current
`aops start --json` seed includes the main policy groups plus the expanded
selection/orchestration helpers shown below:

```json
{
  "discipline": {
    "id": "build-review-chat",
    "version": "s1",
    "enforcement": "advisory",
    "selectedBy": "operator",
    "selectedVia": "--discipline",
    "recommended": "solo-pm-loop",
    "signals": {
      "mode": "solo",
      "agentCount": 1
    },
    "rationale": ["explicit discipline flag supplied"]
  },
  "signalMapping": {
    "mode": "transport/session shape",
    "agentCount": "coordination complexity",
    "workSize": "planning granularity",
    "decisionUncertainty": "design-first trigger",
    "operatorInterface": "delegation trigger for coordinator-loop"
  },
  "guardrails": [],
  "guardrailGroups": {
    "execution": [],
    "closeout": []
  },
  "closeout": {
    "required": true,
    "trigger": "explicit",
    "guardrailIds": ["closeout-handoff-memory"],
    "check": {
      "command": null,
      "mode": "read-only",
      "state": "not-shipped-use-owner-readbacks",
      "statusStates": [
        "present",
        "missing",
        "deferred-with-owner",
        "not-applicable",
        "waived-by-operator"
      ]
    },
    "handoff": {
      "command": "aops pm handoff write --help",
      "mode": "owner-surface"
    }
  },
  "review": {},
  "issue": {},
  "memory": {},
  "plan": {},
  "planning": {},
  "orchestration": {},
  "vocabBridge": {
    "mode": { "meaning": "transport/session shape" },
    "discipline": { "meaning": "policy preset plus guardrails" },
    "method": { "aliasOf": "discipline" }
  }
}
```

Use `result.mission.policyJson` from `aops start --json` with
`aops mission create --policy-json` or `aops mission update --policy-json`.

The exact policy is still advisory and free-form. Treat this convention as a
stable reading/writing shape, not as a strict schema.

`mission.policy.roles` may bind the generic roles for one mission, for example `implementer`, `reviewer`, `coordinator`, and `operator-approver`. A `coordinator-loop` mission typically binds `roles.operator`, `roles.coordinator`, and one or more `roles.implementer` entries; `roles.reviewer` defaults to the coordinator when absent. This binding is mission-local evidence and must not be copied into reusable discipline docs as a fixed Codex/Claude assignment.

`guardrailGroups.execution` and `guardrailGroups.closeout` are presentation
groups over the same `guardrails[]` registry. `policy.closeout` is an
explicit-before-leaving convention: it records required closeout guardrails,
the required owner readbacks and a Projectman/memory handoff. This Community
release has no `mission check` or `mission handoff` command, and it never closes
boards or chat rooms automatically.

## 4 Guardrail registry

### 4.1 Overview

#### 4.1.1 Overview

Every guardrail now has a phase:

- `execution`: applies while planning, implementing, reviewing, and committing.
- `closeout`: applies before leaving a mission/session or handing it to the next run.

Empty `evidence` means reviewer-attested/non-auto-checkable in S1/S2. A later
`mission check --closeout` must not auto-fail those rows; it may report them as
not-applicable or reviewer-attested. Non-empty evidence names a surface that a
future read-only check can inspect.

| Guardrail id | Phase | Disciplines | Evidence | Enforcement |
| --- | --- | --- | --- | --- |
| `pm-task-sprint-before-implementation` | execution | all | `projectman.kanban-task`, `projectman.sprint` | advisory |
| `microtask-slice-rhythm` | execution | all | `projectman.sprint.phases.microtasks` | advisory |
| `verify-first-initial-stance` | execution | `build-review-chat`, `design-first-consensus` | `chatv3.message` | advisory |
| `coordinator-independent-research` | execution | `coordinator-loop` | `projectman.kanban-task`, `projectman.sprint` | advisory |
| `single-operator-interface` | execution | `coordinator-loop` | `chatv3.message` | advisory |
| `assignment-via-canonical-refs` | execution | `coordinator-loop` | `agentspace.mission`, `projectman.kanban-task`, `projectman.sprint` | advisory |
| `idle-window-improvement` | execution | `coordinator-loop` | `projectman.issue`, `projectman.feedback` | advisory |
| `review-request-per-slice` | execution | `build-review-chat`, `coordinator-loop` | `projectman.review-request`, `chatv3.message` | advisory |
| `verify-in-code` | execution | `build-review-chat`, `coordinator-loop` | empty | advisory |
| `smoke-before-accept` | execution | `build-review-chat`, `coordinator-loop` | empty | advisory |
| `explicit-pathspec-commit` | execution | `build-review-chat`, `coordinator-loop` | empty | advisory |
| `no-fake-validation` | execution | `build-review-chat`, `coordinator-loop` | empty | advisory |
| `material-findings-become-issues` | execution | all | `projectman.issue` | advisory |
| `memory-checkpoint-cadence` | execution | all | `agentspace.memory-item` | advisory |
| `consensus-before-implementation` | execution | `design-first-consensus` | `agentspace.discussion-topic.final-stance`, `operator.approval` | advisory |
| `consensus-to-plan-binding` | execution | `design-first-consensus`, `build-review-chat`, `coordinator-loop` | `agentspace.discussion-topic.outputs`, `projectman.sprint`, `projectman.review-request`, `operator.approval` | advisory |
| `no-conclude-before-final-stance` | execution | `design-first-consensus` | empty | advisory |
| `no-tbd-output` | execution | `design-first-consensus` | empty | advisory |
| `chat-is-coordination-only` | execution | `build-review-chat`, `design-first-consensus`, `coordinator-loop` | `projectman.review-request`, `agentspace.discussion-topic`, `agentspace.memory-item` | advisory |
| `no-hosted-mirror-hand-edit` | execution | all | empty | advisory |
| `closeout-handoff-memory` | closeout | all | `agentspace.memory-item` | soft-preflight |
| `closeout-pm-status-audit` | closeout | all | `projectman.status.audit`, `projectman.status.reconcile` | soft-preflight |
| `closeout-triage-open-reviews` | closeout | all | `projectman.review-request` | soft-preflight |
| `closeout-triage-open-issues` | closeout | all | `projectman.issue` | soft-preflight |
| `closeout-mission-status-finalized` | closeout | all | `agentspace.mission.status` | soft-preflight |
| `closeout-resume-readiness` | closeout | all | `agentspace.mission.resume-pack` | soft-preflight |
| `closeout-session-summary` | closeout | all | `agentspace.memory-item` | soft-preflight |
| `closeout-slice-review-accounted` | closeout | `build-review-chat`, `coordinator-loop` | `projectman.review-request`, `projectman.issue` | soft-preflight |
| `closeout-commit-scope-recorded` | closeout | `build-review-chat`, `coordinator-loop` | `git.commit`, `projectman.review-request`, `chatv3.message` | soft-preflight |
| `closeout-assignment-queue-truthful` | closeout | `coordinator-loop` | `agentspace.mission`, `projectman.kanban-task` | soft-preflight |
| `closeout-discuss-output-finalized` | closeout | `design-first-consensus` | `agentspace.discussion-topic.outputs` | soft-preflight |
| `closeout-decision-carried-to-execution` | closeout | `design-first-consensus` | `projectman.kanban-task`, `projectman.sprint`, `projectman.issue`, `projectman.feedback` | soft-preflight |

### 4.2 Closeout discipline

#### 4.2.1 Overview

Closeout is the explicit before-leaving phase for an active mission/session. It
is not the same as operator board closeout or leaving a ChatV3 room.

Use handoff when work continues or a future session must resume. Use complete
only when no required work remains and the operator-approved lifecycle state
allows completion. Board and room closeout stay operator-only unless the
operator explicitly delegates them.

All disciplines share this closeout checklist:

- write handoff/resume memory with next action, validation state, and source refs
- run `aops pm status audit` for the active task/board before saying work is done; resolve, reconcile, or explicitly defer stale task/sprint status findings with an owner
- triage open review requests as accepted, linked to follow-up work, or deferred with owner
- triage open issues as resolved, linked to follow-up work, or deferred with owner
- leave mission status truthful: active, handoff, completed, blocked, or deferred
- prove resume readiness from objective, policy, plan, memory, review, issue, and next-action refs
- record a concise session summary with changed scope and validation evidence

Closeout status values are intentionally descriptive, not hard-fail booleans:
`present`, `missing`, `deferred-with-owner`, `not-applicable`, and
`waived-by-operator`.

The current Community CLI does not ship `mission check` or `mission handoff`.
Use the owner surfaces instead:

```bash
aops pm status audit --task <task-id> --sprint <sprint-id> --json
aops pm handoff write --help
aops mem checkpoint --help
```

Agents enforce closeout through PM/RR state, memory, review, chat wake refs,
and honest handoff notes.

## 5 solo-pm-loop

### 5.1 Overview

#### 5.1.1 Overview

When to use:

- one agent is implementing
- uncertainty is low or medium
- review can be optional or asynchronous
- no live coordination room is required

Preset:

- `discipline.id`: `solo-pm-loop`
- enforcement: `advisory`
- review: async optional at slice or session boundary
- issue: create when validation or review finds a material blocker
- memory: checkpoint at meaningful phase boundaries; summary at session end
- rhythm: task/sprint plus microtask iteration

Expected flow:

```bash
aops pm ktask create --board <board> --column Doing --title "<task>" --apply --json
aops pm sprint create --task <task-id> --name "<sprint>" --goal "<goal>" --apply --json
# implement and validate
aops mem checkpoint --task-id <task-id> --content "<progress>" --apply --json
```

RR/RRR:

- optional for low-risk work
- recommended for shared CLI/domain behavior
- material findings become PM issues

Closeout checklist:

- base closeout guardrails only: handoff memory, review/issue triage, mission status, resume readiness, and session summary
- optional async review is either accepted or deferred with owner
- next agent can resume from PM sprint/task plus memory without reading the whole chat

## 6 build-review-chat

### 6.1 Overview

#### 6.1.1 Overview

When to use:

- operator assigns live implementer and reviewer
- chat room is used for wake/coordination
- each implementation slice needs fast RRR
- commit should happen after accepted review

Preset:

- `discipline.id`: `build-review-chat`
- review: required per implementation slice before commit
- issue: material RRR findings become linked PM issues before re-review
- memory: checkpoint after accepted slice or handoff-relevant review
- rhythm: slice equals microtask; open RR, post chat wake, resolve before commit

Consensus-to-plan binding:

- when a material consensus exists, the implementer or reviewer proactively asks whether it should become a PM implementation plan
- the operator approval gate decides whether the consensus is carried into Projectman
- execution waits until the plan references the consensus and the reviewer accepts the plan review request
- the reusable recipe stays role-agnostic; the mission policy decides which concrete agent is implementer or reviewer

Verify-first consensus-to-build recipe:

- operator reports an issue or improvement request in the room
- each active role records a short verify-first stance before formal discuss: whether the problem appears real, which truth source was checked, whether formal consensus is needed, and the suspected risk/scope
- skip standalone discuss only when the stances agree the work is low-uncertainty or atomic; otherwise open a standalone discuss topic
- after accepted consensus, bind the decision into a PM task/sprint-backed implementation plan and require reviewer acceptance before implementation
- implementation continues through per-slice review requests, ChatV3 wakes, PM issues/feedback for material findings, checkpoints when useful, and explicit closeout

Expected flow:

```bash
aops pm review-request create \
  --task <task-id> \
  --sprint <sprint-id> \
  --review-scope "sprint:<plan-id>" \
  --requested-by <agent> \
  --target-agent <reviewer> \
  --apply --json

aops chatv3 send --session <session> --room general \
  --text "REVIEW READY: PM RR <id> ..." --json

# reviewer appends result
aops pm review-request result --id <rr-id> --reviewer <reviewer> \
  --outcome approved --summary "<evidence>" --apply --json
```

Reviewer RRR summaries should explicitly mention stale PM status when seen:
task Done with open sprint/microtask evidence, completed sprint with task not
Done, or progress/status mismatch. Material stale-status findings become linked
PM issues or an explicit deferred owner before approval/handoff.

Use `sprint:<plan-id>` as the default review-scope when the slice is sprint or
microtask backed; this matches the `aops start` deferred-binding hint.
`aops pm review-request create --help` also accepts `files:<glob>`, which is
appropriate when the reviewer should inspect an explicit file set. For mixed
slices, put the sprint ref in `--review-scope` and list exact files in
`--reference` or the instructions, unless the reviewer asks for a file-only RR.

Commit discipline:

- use explicit pathspec
- include only the reviewed slice
- do not bundle PM/doc/hosted drift unless that drift is the reviewed scope
- announce the commit hash in the room

Closeout checklist:

- every slice RR is accepted, linked to a PM issue, or explicitly deferred with owner
- PM status audit is clean, reconciled, or deferred with owner; stale task/sprint status must be named in the RRR instead of hidden in chat
- commit hash, reviewed pathspec, and validation evidence are recorded in PM/RR and announced in chat
- unresolved review findings become PM issues before handoff or completion
- do not close the room or board unless the operator says to close them

## 7 design-first-consensus

### 7.1 Overview

#### 7.1.1 Overview

When to use:

- design uncertainty is high
- a change crosses owner boundaries
- the decision is expensive to reverse
- implementation should not start until consensus is accepted

Preset:

- `discipline.id`: `design-first-consensus`
- review: after final stances and operator approval define the implementation slice
- issue: open issues for unresolved blockers
- memory: record accepted consensus and handoff checkpoints
- rhythm: discuss first, carry consensus ref into sprint plan, then implement

Expected flow:

```bash
aops discuss start --title "<decision>" --question "<question>" --apply --json
# run the full protocol: at least four substantive non-final turns
aops discuss turn --topic <topic> --agent <agent> --kind final-stance --apply --json
aops discuss conclude --topic <topic> --apply --json
```

Do not conclude before final stances are present. Do not publish conclusion
outputs with `_TBD_` placeholders. After conclusion, ask or record operator
approval before implementation if the consensus contract requires it.

For verify-first consensus-to-build, the discuss topic starts only after the
active roles have recorded initial stances in the room. The topic output should
carry those stance refs into the consensus, and the implementation plan should
carry the discussion ref plus the verify-first refs before any code or canonical
document changes start.

Consensus-to-plan binding is mandatory for this discipline when implementation follows from the decision:

- carry the concluded consensus ref into a Projectman task, sprint-backed implementation plan, issue, or feedback record before implementation resumes
- the implementation plan goal should explain `NE / NICIN / DONE-WHEN` in operator-readable language
- execution stays blocked until the operator-approved consensus is bound to the plan and the reviewer accepts the plan approval review request
- concrete agent names stay in mission policy; the reusable discipline names only implementer, reviewer, and operator-approver roles

Closeout checklist:

- final stances, consensus, disagreements, and open questions are finalized without placeholders
- decision refs are carried into PM task, sprint-backed implementation plan, issue, or feedback records before implementation resumes
- the plan approval review request is accepted or explicitly deferred with owner before execution begins
- unresolved decision work is deferred with owner instead of disappearing into chat
- handoff memory names the accepted decision and the next execution surface

## 8 coordinator-loop

### 8.1 Overview

#### 8.1.1 Overview

When to use:

- the operator wants exactly one agent as their interface and delegates session
  management to it
- one or more implementer agents execute work under coordinator direction in a
  shared ChatV3 room
- the session is free-form: multiple, possibly independent tasks arrive over
  time and the team must adapt without a fixed sprint scope
- review authority is delegated: the coordinator (or a bound reviewer) accepts
  slices; the operator is not paged per slice

Roles (generic, bound per mission in `mission.policy.roles`):

- `operator`: human intent, priorities, and approvals; speaks only to the
  coordinator.
- `coordinator`: single operator interface. Researches independently before
  assigning, authors mission/task/plan records, assigns work with canonical
  refs, reviews RRs, instructs commits, keeps PM/mission/memory truthful, and
  uses idle windows for improvement work (docs, skills, tooling) plus
  issue/feedback capture.
- `implementer` (one or more): executes assigned slices, opens an RR per slice,
  routes questions and decisions to the coordinator (never directly to the
  operator), commits only on coordinator instruction.
- `reviewer` (optional): defaults to the coordinator; a mission may bind a
  separate reviewer.

Role names are open: `master` or `operator-agent` are discouraged aliases for
`coordinator` — `coordinator` is the canonical role id because it does not
collide with the human `operator` role and carries no ambiguous authority
connotation.

Preset:

- `discipline.id`: `coordinator-loop`
- enforcement: `advisory`
- review: RR per implementation slice; reviewer defaults to the coordinator;
  commit only after the RR is accepted and the coordinator instructs the commit
- issue: material findings become PM issues/feedback; both coordinator and
  implementer file them; the coordinator also files doc/skill gap findings
  discovered during policy checks
- memory: the coordinator writes kickoff/checkpoint/closeout memory; assignment
  truth lives in mission/ktask/plan records, not in chat prose
- rhythm: operator request -> coordinator independent research (code, PM,
  docs) -> mission/ktask/plan authoring -> chat assignment with canonical
  refs -> implementer slices with RRs -> coordinator review and fix loop ->
  instructed pathspec commit -> next task or idle-window improvement work

Expected flow:

```bash
# coordinator: durable anchor + role binding
aops mission create --objective "<program>" \
  --policy-json '{"discipline":"coordinator-loop","roles":{"operator":"<name>","coordinator":"<agent>","implementer":"<agent>"}}' \
  --apply --json

# coordinator: per task
aops pm ktask create --board <board> --column Doing --title "<task>" --apply --json
aops plan create --task <task-id> --name "<plan>" --goal "<goal>" \
  --scope-item "S1 ..." --scope-item "S2 ..." --apply --json
aops mission update --id <mission-id> --active-plan <plan-id> --apply --json
aops chatv3 send --session <session> --room general \
  "GOREV ATAMASI: mission <id> / ktask <id> / plan <id> - S1'den basla, slice basina RR" --json

# implementer: per slice
aops pm review-request create --task <task-id> --sprint <plan-id> \
  --review-scope "sprint:<plan-id>" --requested-by <implementer> \
  --target-agent <coordinator> --apply --json

# coordinator: review result
aops pm review-request result --id <rr-id> --reviewer <coordinator> \
  --outcome approved --summary "<evidence>" --apply --json
```

Free-form session notes:

- multiple independent tasks may be active at once; each gets its own
  ktask/plan; the mission stays the session anchor and
  `activeImplementationPlanRef` tracks the current focus
- the coordinator adapts the depth of process to the task: an atomic fix may
  run as a single RR without a plan; multi-slice work gets a sprint-backed plan
- when material design uncertainty appears inside a task, the coordinator runs
  a bounded peer deliberation with the implementer first (for example two
  turns); if positions converge the coordinator proposes the converged path,
  and only unresolved material decisions escalate to the operator
- the escalation boundary is explicit: implementers never page the operator;
  the coordinator escalates only operator-owned decisions (scope, budget,
  irreversible product choices)
- binding project policy documents (for example a UI system doc) are named in
  the assignment; both coordinator and implementer re-read the relevant
  sections as a policy check before and during the work, and gaps found in
  those documents are filed as PM issues/feedback

Closeout checklist:

- base closeout guardrails plus `build-review-chat` items: every slice RR
  accounted for; commit hash, pathspec, and validation evidence recorded
- assignment queue truthful: every operator request in the session is bound to
  a mission/ktask/plan record, completed, or explicitly deferred with owner
- coordinator improvement findings are filed as PM issues/feedback, not left in
  chat
- handoff memory names the active assignments, review states, and the next
  action per implementer

## 9 Owner boundaries

### 9.1 Overview

#### 9.1.1 Overview

| Surface | Owner | Use for |
| --- | --- | --- |
| Mission | Agentspace | durable intent and policy |
| Projectman | Projectman | task, sprint, microtask, issue, review truth |
| Discuss | Agentspace discuss | material decisions and final stances |
| Memory | Agentspace memory | durable carry-forward context |
| ChatV3 | ChatV3 | coordination and wake |
| Docman | Docman | published documentation |
| Hosted skills | Agentspace skill | reusable runtime guidance |

Do not hand-edit `.aops/hosted/**` or `.aops/docman/**` as canonical truth.
Use hosted commands, then refresh mirrors.

## 10 Later: mission check

### 10.1 Overview

#### 10.1.1 Overview

`aops mission check --closeout` is intentionally later. The MVP check must
be read-only and inspect PM/discuss/memory evidence plus declared closeout
status. It must not mutate PM, memory, git, boards, or chat rooms. It should not
hard-fail by default; strict enforcement is opt-in later through
`policy.discipline.enforcement = "strict"` or a future explicit closeout policy.
