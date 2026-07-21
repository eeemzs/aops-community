---
name: aops-agentspace
description: Neutral AOPS Agentspace capability map for memory, missions, reusable prompts and skills, experience, profiles, artifacts, resources, and discovery.
---

# Agentspace

Agentspace owns durable agent context and reusable assets. Its capabilities
include memory, sticky context and synopsis; missions; prompts and versioned
skills; resources and artifacts; experience items, playbooks and agent
profiles; and bounded skill metadata search/answer.

Reusable assets remain hosted and versioned until an exact package is
explicitly pulled into the verified client store. Finding an asset does not
activate a discipline or install it into every runtime.

## Exact mechanics

```text
aops mem --help
aops mission --help
aops prompt --help
aops skill --help
aops experience --help
aops agent tools --domain agentspace --summary --json
aops agent schema --tool agentspace.<operation> --summary
```

CLI help owns sugar flags. Live schema owns raw invoke payloads. Skill search
returns bounded metadata; exact package export is a separate body-loading step.
