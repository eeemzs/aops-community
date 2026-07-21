---
name: aops
description: Route AOPS Community requests to concise packaged references, current CLI help, or live tool schema without selecting a work method.
---

# AOPS Community

AOPS is a self-hostable operations layer. The `aops` command installs and
operates a local server, connects to remote servers, discovers live domain
capabilities, and manages verified machine-local agent assets.

This root skill is deliberately small. Read exactly one matching reference,
then open only the relevant heading in its linked user guide. Working
disciplines are available after setup, but are never selected merely because
this gateway loaded.

## Route the request

| Need | Read first |
| --- | --- |
| install/setup, PostgreSQL, auth, server, health, sync, views, client assets | `references/aops-cli-core/SKILL.md` |
| read-only local dashboard, sprint/task/board views, focused digest | `references/view/SKILL.md` |
| durable memory, reusable prompts/skills/resources/artifacts, experience | `references/agentspace/SKILL.md` |
| durable session intent and resume packs | `references/mission/SKILL.md` |
| boards, tasks, sprints/plans, issues, feedback, reviews, handoffs | `references/projectman/SKILL.md` |
| versioned documents, sections, links, search, answer, mirrors | `references/docman/SKILL.md` |
| hosted coordination rooms, messages, inbox/listen/catchup | `references/hosted-chat/SKILL.md` |
| structured multi-agent decision/consensus topics | `references/discuss/SKILL.md` |
| encrypted ChatV3 product channels, invites, sessions, membership | `references/chatv3/SKILL.md` |
| counters, countries, event store, rate limits | `references/sys/SKILL.md` |
| choose or explain a working method | `references/working-disciplines/SKILL.md` |
| run the full optional collaborative session playbook | `references/collaborative-work/SKILL.md` |
| another installed/custom domain | `aops agent tools --domain <domain> --summary --json` |

`aops chat` is hosted coordination. `aops chatv3` is the encrypted product
channel surface. Do not merge those models. Fileman, Tasker/Runner, and the
interactive loop are not part of the default Community capability closure;
discover them only if the connected server actually advertises them.

## Authority order

1. Packaged references explain ownership, safety, and common examples.
2. Current nested `aops ... --help` owns sugar command flags.
3. `aops agent schema --tool <domain.operation> --summary --json` owns raw invoke payload fields.
4. `aops agent invoke --tool <domain.operation> --input '@payload.json' --preview --json` is the generic fallback.

Use `aops agent tools --summary --json` when the installed server differs from
the packaged core. Do not load every reference or whole guide into context, and
do not infer server topology or capabilities from a repository checkout.
