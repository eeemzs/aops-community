---
name: aops-collaborative-work
description: Use when the operator explicitly wants the full AOPS session playbook for solo work, async review, or hosted chat-room collaboration with Projectman-backed execution.
---

# AOPS collaborative work

Default to `solo`. Collaboration is an operator choice, not an automatic
requirement. Select one mode at kickoff and use
`../working-disciplines/SKILL.md` only when a working method must also be chosen.

## Compact startup

```bash
aops sync status --json
aops view dashboard --style agent
aops start --task "<task>" --json --out ./aops-start.md
aops mission resume --id <mission-id> --json
aops pm board resume --board <slug> --json
```

Use `result.promptRef.path` or the output file; do not request inline/full output
unless the prompt body is actually needed. Ask the operator only for fields
explicitly marked operator-owned, especially agent identities and roles.

## Mode 1: solo

1. Read the smallest relevant guide/help surface.
2. Create or identify the Projectman task/plan appropriate to the work size.
3. Implement one bounded slice.
4. Run focused validation and read back hosted mutations.
5. Update status/handoff; keep board/mission open unless closeout was requested.

Useful reads:

```bash
aops view digest --task <task-id> --depth shallow
aops pm issue list --status open --json
aops pm review-request list --status open --json
```

## Mode 2: solo plus async review

After implementation and local validation, create a durable review request:

```bash
aops pm review-request create --help
aops pm review-request list --status open --json
aops pm review-request result --help
```

The reviewer records the result in Projectman. Material findings become
Projectman issues or bounded fix slices; chat is only the optional wake channel.
Do not claim review completion from a message alone.

## Mode 3: hosted chat room

```bash
aops chat room create --slug <slug> --title "<purpose>" \
  --created-by <lead> --member "<lead>:<role>" \
  --member "<peer>:<role>" --apply --json
aops chat binding add --room-id <id> \
  --binding-type projectman.board --ref-id <board-id> \
  --created-by <lead> --apply --json
aops chat room brief --room-id <id> --for <peer>
aops chat listen --for <agent> --room-id <id> --timeout-sec 570 --json
```

Each participant owns a non-overlapping slice and reports completion with
validation evidence. Use `aops discuss` only for a material consensus decision;
use `aops chatv3` only when encrypted product-channel behavior is the actual
task.

## During work

```bash
aops start --reminder --task "<task>" --area <area> --json
aops mem checkpoint --help
aops pm status audit --help
```

Prefer the detail ladder: this skill → one family reference → nested `--help` →
live `agent schema`. Never preload every guide. Never invent another agent's
stance, close operator-owned surfaces, or mark work done without requested
validation and durable status.
