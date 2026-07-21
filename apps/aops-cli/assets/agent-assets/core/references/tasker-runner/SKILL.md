---
name: aops-tasker-runner
description: Neutral AOPS Tasker and Runner capability map for human tasks, scenarios, tracked runs, workflows, workers, and ingress.
---

# Tasker and Runner

Tasker provides human-facing task records and task-manager views. Runner
provides executable scenarios, tracked runs, workflow instances, workers, and
ingress. These surfaces are distinct from Projectman delivery records.

A system may use task records without execution, execution without a planning
board, or compose them through explicit identifiers supported by the server.

## Exact mechanics

```text
aops tasker --help
aops runner --help
aops agent tools --domain tasker --summary --json
aops agent tools --q runner --limit 5 --summary --json
aops agent schema --tool <domain.operation> --summary
```

CLI help owns sugar flags. Live schema owns raw payloads. Inspect the selected
scenario or run contract before supplying execution input.
