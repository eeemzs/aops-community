---
name: aops-cli-core
description: Use for AOPS installation, PostgreSQL setup, server lifecycle, health, authentication, sync, views, verified agent assets, and schema-first capability discovery.
---

# AOPS CLI core

Use the installed `aops` command as runtime truth. Read only the matching
section in `../../user-guides/aops-cli.md`, `../../user-guides/aops-system.md`,
or `../../user-guides/agent-assets.md` when this quick map is insufficient.

## Install and diagnose

```bash
aops --version
aops setup init
aops setup ai
aops setup guide
aops server status --json
aops server health --json
aops cockpit
```

`aops setup init` owns the complete first-run flow: choose an existing
PostgreSQL, AOPS-managed PostgreSQL container, detected local PostgreSQL, or a
remote AOPS server. Local server paths plan/apply/verify migrations, start the
npm server, load the small starter seed by default, and install verified agent
assets. Database secrets belong only in masked prompts or private input
files/environment; never paste them into chat or argv.

For an unattended run, inspect readiness before apply:

```bash
aops setup init --path 1 --yes --json
aops setup init --path 2 --yes --json
aops setup init --path 3 --yes --json
```

Use the exact next action returned by readiness. Do not bypass TLS choices,
asset ownership conflicts, or migration lineage errors.

## Server and target lifecycle

```bash
aops server start --json
aops server stop --json
aops server restart --json
aops server logs --tail 100
aops host health --json
aops host diagnostics --json
aops target list --json
aops target doctor <name> --json
```

Use `aops server <command> --help` before reset, rollback, or recovery. Never
remove operator-owned PostgreSQL/Docker resources. Setup path 2 may manage only
its exact label-verified AOPS container and volume.

## Verified agent assets

```bash
aops assets status --verify quick --json
aops assets install --target all --apply --json
aops assets resolve --gateway aops --json
aops assets discover --query "sprint planning" --limit 5 --json
```

`--target all` means every registered runtime, not only Codex and Claude.
Install/repair fails closed on unknown user files. The core makes rich guides
and disciplines available but never selects a working method.

## Cache and read-only views

```bash
aops sync status --json
aops sync pull --apply --json
aops view dashboard --style agent
aops view digest --task <task-id> --depth deep
```

Hosted records remain canonical. Repository `.aops/**` content is a read-only
cache/presentation surface; never hand-edit it as hosted truth.

## Capability discovery

```bash
aops agent tools --summary --json
aops agent tools --domain <domain> --q <intent> --limit 10 --summary --json
aops agent schema --tool <domain.operation> --summary --json
aops agent invoke --tool <domain.operation> --input '@payload.json' --preview --json
```

Use sugar when nested `--help` exposes it. Direct invoke requires live schema.
If a write is intended, preview when supported and add `--apply`; destructive
operations may additionally require `--confirm`. Stop guessing after a 400 or
validation error and inspect full schema/OpenAPI.

## Guard contract

- `--json`: stable automation output.
- `--yes`: non-interactive input handling; never implies mutation approval.
- `--preview`: validate/plan without applying when supported.
- `--apply`: execute a guarded write.
- `--confirm`: acknowledge destructive scope.
- `--idempotency-key`: make supported retries deterministic.

Current nested `--help` wins over packaged examples. Live schema wins for raw
payload fields and the live catalog wins for mounted-domain availability.
