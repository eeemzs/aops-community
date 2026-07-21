---
name: aops-projectman
description: Neutral AOPS Projectman capability map for boards, tasks, sprints and implementation plans, issues, feedback, reviews, and handoffs.
---

# Projectman

Projectman owns durable delivery records. Its capabilities include boards and
columns, Kanban tasks, sprint-backed implementation plans and microtasks,
issues, feedback, review requests/results, and handoffs.

These records are composable. A project may contain a board, a sprint, both,
or neither. This reference does not select a planning method or lifecycle.

## Exact mechanics

```text
aops pm --help
aops pm <family> --help
aops plan --help
aops agent tools --domain projectman --summary --json
aops agent schema --tool projectman.<operation> --summary
```

Sugar help owns flags. The live Projectman schema owns raw payload fields.
Read operations are distinct from guarded mutations; inspect the selected
command help for preview and apply behavior.
