---
name: aops-cli-projectman
description: Use for Projectman boards, tasks, sprints and implementation plans, microtasks, issues, feedback, reviews, handoffs, and server-canonical planning through AOPS.
---

# Projectman

Projectman is the execution and review source of truth. It supports board-only,
sprint-only, combined, and small-task flows; do not force a ceremony the
operator did not choose. Read the relevant heading in
`../../user-guides/projectman.md` for deeper examples.

## Inspect the live surface

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

## Common planning flow

```bash
aops pm board list --json
aops pm board create --name "Delivery" --apply --json
aops pm ktask create --board <board> --column Todo --title "<task>" --apply --json
aops pm sprint create --task <task-id> --name "Sprint 1" --goal "<outcome>" --apply --json
aops pm utask create --sprint <sprint-id> --title "<verifiable step>" --apply --json
```

Use clear outcome text: what is needed, why it matters, and how completion will
be proven. IDs returned by writes should be reused; do not resolve ambiguous
titles repeatedly.

## Read and resume

```bash
aops pm board get --slug <board-slug> --json
aops pm ktask get --id <task-id> --json
aops pm sprint get --id <sprint-id> --json
aops view digest --task <task-id> --depth deep
aops pm handoff resume --subject ktask --id <task-id> --json
```

Local `view` output is a read-only presentation cache. Writes always go through
hosted Projectman commands.

## Issues, feedback, and review

```bash
aops pm issue create --help
aops pm feedback create --help
aops pm review-request create --help
aops pm review-request result --help
aops pm handoff write --help
```

Use an issue for a material blocker/defect, feedback for observations or
suggestions, and review-request/result for an auditable review gate. A chat
message may wake a reviewer but is not the review record.

## Status discipline

1. Inspect the record before changing status.
2. Use the exact nested help and stable IDs.
3. Apply one bounded mutation and read it back.
4. Mark done only after requested validation actually passes.
5. Ordinary session stop writes a handoff/status; board/room closeout remains
   an explicit operator decision.

## Raw fallback

```bash
aops agent tools --domain projectman --q review --limit 20 --summary --json
aops agent schema --tool projectman.<operation> --summary --json
aops agent invoke --tool projectman.<operation> --input '@payload.json' --preview --json
```

Do not guess raw fields. If sugar returns validation errors, compare the sugar
payload with live schema before using a direct invoke workaround.
