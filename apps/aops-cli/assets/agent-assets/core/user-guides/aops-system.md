# AOPS Community system guide

AOPS consists of a server, a CLI, independent domain capabilities, and optional monitoring surfaces.

- `aops-server` hosts the installed domains and is canonical for their records.
- the `aops` CLI provides setup, target/auth configuration, domain sugar, generic discovery/invoke, and local client-asset lifecycle commands.
- Domain plugins own their semantics and operation schemas.
- Cockpit applications are optional presentation and monitoring surfaces.

The server and CLI need not be on the same computer. A local client selects a target and keeps credentials in its user-level configuration. Repository `.aops` content binds a project and caches derived views; it does not replace hosted records or the verified user-level agent-assets store.

## Installation boundary

`aops setup init` is the setup authority. It can use an operator-supplied
PostgreSQL URL, manage only an AOPS-owned Docker PostgreSQL, or create a
dedicated AOPS role/database in loopback PostgreSQL already installed on the
computer. All server paths use the same migration verification. PostgreSQL
administrator credentials for local provisioning are transient and never
stored; the application connection is kept in the private user server-env.
Use `aops setup guide` for the small installation skill and live
`aops setup init --help` for exact flags.

## Capability discovery

Start with the relevant CLI family help. When a server has custom or newer domains, query its live catalog:

```text
aops agent tools --summary --json
aops agent tools --domain <domain> --q <intent> --limit 5 --summary --json
aops agent schema --tool <domain.operation> --summary
```

Sugar `--help` is authoritative for CLI flags. Live tool schema is authoritative for direct `agent invoke` payloads.

## Composition without prescription

Projectman can represent boards, tasks, sprints/plans, reviews, issues, and handoffs. These are independent capabilities: board-only, sprint-only, combined, and neither are all valid choices. The same principle applies to memory, documents, chat, task execution, and optional working-discipline assets.

## Local state boundaries

- user configuration selects servers and authentication;
- the logical AOPS data root contains machine-local runtime state;
- `agent-assets` beneath that data root contains verified immutable packages and activation/binding receipts;
- a repository `.aops` directory contains project binding and derived cache views;
- hosted reusable skills and prompts remain server-canonical unless an exact package is explicitly materialized.

For current paths, flags, previews, apply requirements, and troubleshooting, use `aops --help` and the relevant nested help.
