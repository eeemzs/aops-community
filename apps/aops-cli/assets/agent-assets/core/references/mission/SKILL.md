---
name: aops-cli-mission
description: Use for a durable Agentspace mission anchor, free-form session policy, active implementation-plan reference, compact resume packs, and session handoff.
---

# AOPS Mission

A mission stores durable intent and policy for a work session. Projectman
remains the execution/review source of truth; the mission may reference an
implementation plan but does not duplicate it.

## Common flow

```bash
aops mission --help
aops mission list --json
aops mission create --objective "<outcome>" --apply --json
aops mission get --id <mission-id> --json
aops mission update --id <mission-id> --objective "<updated outcome>" --apply --json
aops mission resume --id <mission-id> --json
```

Use `aops start --resume <mission-id> --json` when the full startup composer is
needed. Use `mission resume` alone for a compact, deterministic context pack.

## Policy and plans

When a selected working discipline returns a `mission.policyJson`, persist that
exact policy rather than inventing a parallel format:

```bash
aops mission create --objective "<objective>" \
  --policy-json '@policy.json' --apply --json
aops mission update --id <mission-id> \
  --active-plan-ref <sprint-id> --apply --json
```

The active implementation-plan ref points to a Projectman sprint/plan. Vision
or long-form design belongs in Docman. Check exact fields with nested help.

## Handoff and boundaries

```bash
aops pm handoff write --help
aops mem checkpoint --help
```

An ordinary stop records current status, validation, blockers, and the next
safe action; it does not silently close boards, rooms, or the mission. Use
Projectman handoff or a bounded memory checkpoint for that record. Mission
handoff is not a separate command in this release.

Do not store secrets, full logs, or a second task ledger in mission policy.
Do not create a mission when a small one-turn operation needs no durable anchor.
