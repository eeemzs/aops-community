<!-- Public packaged snapshot from Projectman domain user guide. Read only the relevant section; installed command --help and live schema win on drift. -->

# Projectman User Guide

This guide explains how operators and AI agents use Projectman through the
hosted `aops pm` surface. Projectman is the source of truth for current
planning and execution status.

## Mental Model

```text
board
  -> kanban task
       -> sprint
            -> phase
                 -> microtask
```

- The board makes delivery visible.
- The kanban task represents the work item.
- The sprint is the task-scoped implementation plan.
- Phases organize the plan.
- Microtasks track the smallest verifiable units of work.

Durable session context belongs in Agentspace memory. Canonical long-form
knowledge belongs in Docman. Projectman records what is being delivered, its
state, its evidence, and its review lineage.

## Help-First Discovery

Read the exact command surface before writing:

```bash
aops pm --help
aops pm board --help
aops pm ktask --help
aops pm sprint --help
aops pm utask --help
aops pm issue --help
aops pm feedback --help
aops pm review-request --help
aops pm handoff --help
```

Use sugar commands for routine work. For raw operation invocation, inspect the
hosted schema first:

```bash
aops agent tools --domain projectman
aops agent schema --tool projectman.kanban-task.create
```

## Select the Project

Projectman writes are project-scoped. Bind the repository or pass the exact
project selector required by the installed CLI. Confirm the active project
before mutating a board, task, or sprint.

## Boards

Create a board when the project does not already have an appropriate delivery
surface:

```bash
aops pm board create --name "Delivery" --apply
aops pm board list --json
```

A board contains ordered columns. Board lifecycle actions can initialize or
resume a working board, but closing a board is an operator decision.

## Kanban Tasks

Create a task before implementation starts:

```bash
aops pm ktask create \
  --board delivery \
  --column Todo \
  --title "Implement the selected capability" \
  --apply
```

The task is the visible delivery item. Keep its state honest: moving a task to
Done should follow implementation and validation, not intention.

Useful reads:

```bash
aops pm ktask list --board delivery --json
aops pm ktask get --task <task-id> --json
```

## Sprints and Implementation Plans

Create a sprint under the kanban task. State what will change, why it matters,
and how completion will be verified:

```bash
aops pm sprint create \
  --task <task-id> \
  --name "Capability implementation" \
  --goal "NE: deliver the capability; NICIN: make the workflow usable; DONE-WHEN: tests and live verification pass" \
  --apply
```

The `aops plan` surface is a facade over this sprint plan. It does not create
a second plan store.

Use microtasks for bounded, verifiable steps. Update each item individually so
the sprint remains a trustworthy execution record:

```bash
aops pm utask create --sprint <sprint-id> --title "Implement" --apply
aops pm utask create --sprint <sprint-id> --title "Validate" --apply
aops pm utask update --id <microtask-id> --status doing --apply
aops pm utask update --id <microtask-id> --status completed --apply
```

Inspect `aops pm utask --help` for the exact phase and ordering flags in the
installed version.

## Issues and Feedback

Use issues for defects, blockers, or follow-up work that must remain visible.
Use feedback for operator observations and requested improvements. Preserve the
link to the task, sprint, or review that produced the item.

```bash
aops pm issue --help
aops pm feedback --help
```

Feedback can become tracked work without losing its origin. Do not copy the
same concern into unrelated records without retaining lineage.

## Review Requests

Review requests coordinate synchronous or asynchronous review between agents or
operators. The implementation remains attached to its Projectman context, and
review results are appended rather than overwritten.

```bash
aops pm review-request --help
```

A reviewer can approve, comment, or request changes. When changes are requested:

1. keep the original result intact
2. update the implementation task and sprint
3. record the new evidence
4. create or continue the linked re-review flow

Chat can wake or coordinate participants, but Projectman remains the review and
execution source of truth.

## Handoffs

A handoff should let another agent continue without reconstructing the entire
session. Include:

- what changed
- what was validated and with which evidence
- what remains open
- the exact next action
- relevant task, sprint, issue, review, document, or artifact references

Use `aops pm handoff --help` for the installed command shape. Durable
narrative context may also be written to Agentspace memory, but do not duplicate
the active execution status in a competing store.

## Reading Local Presentation Views

After synchronizing the read-only cache, Projectman can be inspected through
local views without mutating hosted state:

```bash
aops view dashboard --style agent
aops view board <selector>
aops view task <selector>
aops view sprint <selector>
aops view digest --task <selector>
```

Views do not call the server, synchronize data, or write decisions. Use normal
`pm`, `mem`, or `discuss` commands for durable changes.

## Status Discipline

- `todo`: planned but not started
- `doing`: active work
- `completed`: implemented and honestly validated
- blocked or cancelled states: use only when supported by the current command
  and record the reason

Do not close boards, rooms, or project-level work merely because one agent turn
ended. Ordinary closeout writes current status and a handoff, leaving shared
surfaces open for the operator.

## Raw Invoke Fallback

If a sugar wrapper fails because its payload no longer matches a strict hosted
schema, stop guessing flags. Inspect the raw contract and invoke the operation
directly only when necessary:

```bash
aops agent schema --tool projectman.<operation-id>
aops agent invoke --tool projectman.<operation-id> --input @input.json --apply
```

Record the sugar defect separately so the workaround does not become the normal
workflow.
