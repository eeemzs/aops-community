---
name: aops-cli-agentspace
description: Use for durable memory, synopsis, reusable prompts/skills/resources/artifacts, experience, agent profiles, and other Agentspace-owned context through the AOPS CLI.
---

# Agentspace

Agentspace owns durable agent/operator context and reusable hosted assets.
Project execution belongs to Projectman; versioned documents belong to Docman.
Hosted coordination and structured decisions have their own references.

Read only the needed section of `../../user-guides/agentspace.md`. Exact flags
come from live nested help.

## Durable memory

```bash
aops mem --help
aops mem list --json
aops mem search --q "migration decision" --limit 10 --json
aops mem write --mode resume --subject project --content "<bounded handoff>" --apply
aops mem list --durability sticky --json
aops mem synopsis --subject project --json
```

Use memory for decisions, constraints, handoffs, and facts that must survive a
session. Keep content concise and scoped. Do not use memory as a duplicate task
tracker or paste secrets, logs, or large documents into it.

## Reusable hosted assets

```bash
aops prompt list --json
aops skill list --json
aops resource list --json
aops artifact list --json
aops exp list --json
```

Create/update/version commands are guarded writes. Inspect their help first:

```bash
aops skill version create --help
aops skill version publish --help
aops prompt version create --help
aops resource create --help
```

Hosted prompt/skill truth lives on the server. Local mirrors are read-only
context. Artifact records are metadata/pointers, not a large binary store.

## Missions and sessions

For durable session intent and resume packs, load `../mission/SKILL.md` rather
than the full Agentspace guide. For rooms/messages load
`../hosted-chat/SKILL.md`; for structured consensus load
`../discuss/SKILL.md`.

## Raw discovery fallback

```bash
aops agent tools --domain agentspace --q memory --limit 20 --summary --json
aops agent schema --tool agentspace.<operation> --summary --json
aops agent invoke --tool agentspace.<operation> --input '@payload.json' --preview --json
```

Always inspect schema before raw writes. Use `--apply` only after scope and
payload are clear; use an idempotency key for retryable mutations when
supported. Read back the exact record after mutation.

## Boundaries

- Planning, tasks, sprints, issues, feedback, reviews: Projectman.
- Document graphs, page content, publish/search/answer: Docman.
- Hosted coordination/wake: `aops chat`.
- Structured decision transcript: `aops discuss`.
- Encrypted product channel: `aops chatv3`.
- Repo `.aops/**`: derived cache, never the canonical authoring source.
