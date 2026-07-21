---
name: aops
description: Route AOPS Community requests to concise packaged references, current CLI help, or live tool schema without selecting a work method.
---

# AOPS Community

AOPS is a self-hostable operations layer. The `aops` command connects to local or remote domain capabilities and manages machine-local client assets.

This skill is a neutral capability router. Kanban, sprints, reviews, chat, memory practices, and working disciplines are available choices, not prerequisites.

## Find the smallest relevant surface

| Need | Start with |
| --- | --- |
| setup, targets, auth, server, health, sync, views, client assets | `references/aops-cli-core/SKILL.md` |
| durable memory, missions, reusable prompts or skills, discovery | `references/agentspace/SKILL.md` |
| boards, tasks, sprints/plans, issues, feedback, reviews, handoffs | `references/projectman/SKILL.md` |
| versioned documents, sections, links, search, answer, mirrors | `references/docman/SKILL.md` |
| hosted chat rooms, messages, discussions and recorded decisions | `references/communication/SKILL.md` |
| human tasks, runs, workflows, workers, ingress | `references/tasker-runner/SKILL.md` |
| file targets, snapshots, diffs, restore, export | `references/fileman/SKILL.md` |
| an installed custom domain | `aops agent tools --domain <domain> --summary --json` |

Load only the matching reference. Each reference is a neutral capability map,
not a workflow. A user may combine capabilities in any way supported by their
server.

## Authority order

1. Packaged references explain concepts and small examples.
2. Current nested `aops ... --help` owns sugar command flags.
3. `aops agent schema --tool <domain.operation> --summary` owns raw invoke payload fields.
4. `aops agent invoke --tool <domain.operation> --input '@payload.json' --preview --json` is the generic fallback.

Use `aops agent tools --summary --json` when the installed server differs from the packaged core. Do not infer server topology or capabilities from the current repository.
