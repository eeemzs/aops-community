---
name: aops-cli-core
description: Neutral reference for AOPS Community setup, server targets, authentication, diagnostics, live capability discovery, guarded writes, cache views, and client assets.
---

# AOPS CLI core reference

Use this reference for operator and client mechanics. Domain meaning stays with the relevant domain help, guide, and live schema.

## Command map

| Need | Command authority |
| --- | --- |
| Agent-readable installation route | `aops setup guide` |
| Guided machine/server readiness | `aops setup init --help` |
| User-level server environment | `aops setup server-env --help` |
| Local or remote server target | `aops target --help` |
| Authentication | `aops auth --help` |
| Host health and plugin diagnostics | `aops host --help` |
| Client asset install/status/update/repair | `aops assets --help` |
| Live tool discovery and schema | `aops agent --help` |
| Direct domain route escape hatch | `aops api --help` |
| Repository binding and cache refresh | `aops init --help`, `aops sync --help` |
| Read-only cached presentation | `aops view --help` |

The server may run on this computer or another machine. Target and auth configuration are user-level; repository `.aops` content is project binding and derived cache state, not the source for installed Community client assets.

## Discovery ladder

```text
aops <family> --help
aops <family> <command> --help
aops agent tools --domain <domain> --q <intent> --limit 5 --summary --json
aops agent schema --tool <domain.operation> --summary
```

Inspect the live schema before direct invocation. Sugar validation errors are diagnosed against the same live operation contract rather than by guessing flags.

## Guards

Read-only commands do not mutate. Mutations preview by default where documented and require `--apply`; destructive or rebinding operations additionally require `--confirm`. `--yes` only controls interaction and does not replace write authorization.

Packaged concepts: `../../user-guides/aops-system.md` and
`../../user-guides/agent-assets.md`.
