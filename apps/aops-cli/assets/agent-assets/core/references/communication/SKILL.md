---
name: aops-communication
description: Neutral AOPS communication capability map for hosted chat rooms, direct messages, cursors, discussions, turns, outputs, and recorded conclusions.
---

# Communication and discussion

Hosted chat provides channels, rooms, membership, messages, inbox/catch-up,
and delivered/read cursors. Discussion records provide topics, turns, outputs,
and conclusions for decisions that need a durable structured record.

Chat coordination and structured discussion are independent capabilities.
Neither is required merely because other AOPS records are in use.

## Exact mechanics

```text
aops chatv3 --help
aops discuss --help
aops agent tools --domain agentspace --q chat --limit 5 --summary --json
aops agent schema --tool agentspace.<operation> --summary
```

Room rules come from the selected hosted room. CLI help owns sugar flags and
live schema owns raw payloads. Projectman review records remain separate from
chat delivery state and discussion outputs.
