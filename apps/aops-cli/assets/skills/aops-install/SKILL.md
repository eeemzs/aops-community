---
name: aops-install
description: Guide an AI agent through safe AOPS Community npm installation with an existing database, AOPS-managed Docker PostgreSQL, or detected local PostgreSQL; then verify migrations, Gateway assets, server health, and Cockpit. Use for install, initialize, configure, repair, verify, or setup explanation requests after installing @aopslab/aops-cli.
---

# AOPS Community installation

Use the installed `aops` command as live truth. Run the relevant `--help` before any mutation; do not guess flags from this skill when the installed version differs.

## Inspect first

Run mutation-free discovery:

```sh
aops --cli-version
aops setup init --yes --json
```

This setup envelope already includes installation, PostgreSQL, host, and Gateway
readiness. Read its actions before choosing a path. Run `aops assets status` or
`aops server status` separately only when that check is action-required and more
detail is needed.

Never place any PostgreSQL URL, application password, or path 3 administrator
password in argv, logs, committed files, or chat.

## Route by need

| Need | Smallest surface |
| --- | --- |
| inspect choices and readiness | `aops setup init --yes --json` |
| normal operator installation | `aops setup init` |
| use an existing database URL | path `1`, then `aops setup server-env` |
| let AOPS manage Docker PostgreSQL | path `2` |
| create AOPS DB in PostgreSQL on this computer | path `3` |
| connect only to an existing AOPS server | path `4` |
| inspect or repair Gateway assets | `aops assets --help` |
| operate an installed local server | `aops server --help` |

Load only the section needed for the selected path. The current nested `--help`
owns exact flags.

## Normal interactive installation

Prefer the normal setup menu:

```sh
aops setup init
```

All server paths use the normal `default` instance and port `5900`, verify
migrations, install registered Gateway pointers, reconcile the inert signed
official catalog, and create a small starter dataset automatically. Interactive
setup applies after collecting the selected path's required private inputs; it
does not ask a redundant continue or starter-data question. Use `--no-seed` or
`--no-catalog` only when the operator explicitly opts out.

For automatic Docker PostgreSQL, the container port is loopback-only and dynamically assigned. A destructive reset removes only exact instance/root/secret label-verified resources:

```sh
aops server reset --remove-managed-postgres --confirm-data-loss --confirm-instance default
aops setup init
```

Global AOPS skills and pointers are shared installation assets and remain installed after server reset.

## Path safety notes

Git clone is a secondary development path. The optional application image is
built from the same exact public npm CLI/server closure and runs the normal
`aops server setup` lifecycle inside the container. It is a distribution path,
not a fifth interactive `setup init` path. Path `2` manages only its namespaced,
label-verified PostgreSQL resources; unrelated Docker resources remain
operator-owned.

For path `1`, PostgreSQL is operator-owned and may be local, remote, managed,
or separately containerized. Run interactive `aops setup init` and select path
`1`; it asks for the TLS policy and PostgreSQL URL using masked input. A saved
URL is offered as a masked default on retry and can be kept or replaced.
`require` is the interactive TLS default for encrypted transport without a CA
file. Use `verify-full` with a trusted CA and matching hostname; use `disable`
only when the operator explicitly accepts unencrypted transport. For
non-interactive work, inject `AOPS_PG_URL` privately or prepare it with
`aops setup server-env`, then inspect `aops setup init --path 1
--postgres-tls <policy> --yes --json`.

For path `3`, prefer interactive setup. It probes loopback PostgreSQL, asks for
an existing administrator role/password through masked input, creates a new
dedicated login and database with a generated application password, stores only
the application URL in the private user server-env, and runs the normal external
migrations. The administrator password is never stored. If PostgreSQL is absent
or stopped, return the platform-specific install/start actions reported by
readiness; do not silently run an elevated package manager. Automation may use
the private `AOPS_LOCAL_POSTGRES_ADMIN_PASSWORD` environment variable.
`--local-postgres-admin-no-password` works only with PostgreSQL TCP trust auth;
it does not bypass authentication or make Linux peer/socket auth work over
loopback TCP. If the administrator password is unknown, stop and ask the
operator to configure one through their local PostgreSQL administration flow
(for example, interactive `sudo -u postgres psql` followed by `\password
postgres`) before retrying.

## Apply explicitly in automation

Interactive `aops setup init` applies directly. For agents, CI, and scripts,
run the selected path's mutation-free readiness first and apply only after its
required actions and private inputs are understood:

```sh
aops setup init --path 2 --yes --json
aops setup init --path 2 --apply --yes --json

aops setup init --path 3 --yes --json
aops setup init --path 3 --apply
```

All server paths install registered Gateway pointers, reconcile the inert signed
official catalog, and create starter data by default. Use `--agent-assets skip`,
`--no-catalog`, or `--no-seed` only for an explicit opt-out.

If Gateway pointers need a separate action, install for every runtime registered by this CLI:

```sh
aops assets install --target all --apply --json
```

Use `--target codex`, `--target claude`, comma-separated values such as `--target codex,claude`, or repeat `--target` for an explicit subset. Do not use `both`; it is not a selector.

Do not supply a release directory in the normal npm flow. `--from-release` and `--agent-assets-release` are maintainer/offline recovery overrides only. Do not write runtime homes from npm `postinstall`; Gateway writes require the explicit guarded commands above.

## Verify and hand off

```sh
aops server start --json
aops server health --json
aops assets status --verify full --json
aops cockpit --no-open --json
```

Read and report the apply result's migration verification, then report the
selected path, server health, registered runtime binding states, and Cockpit
URL. Never report success from process exit alone when JSON says
action-required, conflict, or unhealthy.

When setup remains incomplete, preserve the exact safe next action from the CLI output. Ask the operator only for missing authority or private configuration; do not bypass ownership conflicts, native qualification gates, TLS decisions, or unknown user-owned pointer files.
