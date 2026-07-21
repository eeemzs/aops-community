---
name: aops-cli-discuss
description: Use for a structured server-canonical design decision or consensus topic with independent turns, explicit final stances, completeness checks, and deterministic conclusion.
---

# AOPS Discuss

`aops discuss` owns a durable decision transcript and conclusion. Use hosted
`aops chat` to wake/coordinate peers and Projectman to track review/execution.
Do not start a discussion ritual for a small reversible implementation choice.

The complete owner and troubleshooting model is in the Discuss sections of
`../../user-guides/agentspace.md`.

## Start and inspect

```bash
aops discuss --help
aops discuss start --title "<decision>" --question "<question>" \
  --participant <agent-a> --participant <agent-b> --apply --json
aops discuss status --id <topic> --json
aops discuss get --id <topic> --json
```

Give every participant enough neutral context to research independently. Role
assignment belongs to the operator; an agent must not invent or swap identities.

## Record turns

```bash
aops discuss turn --topic <topic> --agent <agent> \
  --kind statement --from-file ./turn.md --apply --json
aops discuss wait --id <topic> --for <agent> \
  --timeout-sec 540 --interval-sec 5 --json
```

For material design decisions, record multiple substantive non-final turns so
tradeoffs and objections are visible. Do not use chat messages as a substitute
for the canonical topic transcript.

## Finalize safely

```bash
aops discuss turn --topic <topic> --agent <agent> \
  --kind final-stance --from-file ./final.md --apply --json
aops discuss status --id <topic> --json
aops discuss conclude --topic <topic> --apply --json
```

Conclude only when every required participant has a `final-stance` and status
reports no missing final stances. Outputs must contain real decisions and
follow-ups, not `_TBD_` placeholders.

There is no automatic bridge: explicitly reference the concluded topic from a
Projectman task/review/issue or durable memory, then send a short hosted-chat
wake if another agent must act.

For raw operations:

```bash
aops agent tools --domain agentspace --q discuss --limit 20 --summary --json
aops agent schema --tool agentspace.<discuss-operation> --summary --json
```

Prefer slug/ID selectors returned by creation. Treat timeouts as state to
report, not permission to fabricate another participant's stance.
