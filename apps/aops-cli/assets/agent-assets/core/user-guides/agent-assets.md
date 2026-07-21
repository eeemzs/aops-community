# AOPS Community client assets

Community client assets are installed from an independently signed
agent-assets bundle included in the npm CLI. This asset identity is separate
from application-image releases. The logical user-local data root is
`~/.aops/agent-assets`.
Every agent runtime registered by the installed CLI receives one managed
`skills/aops/SKILL.md` gateway. Today this includes Codex and Claude; future
runtimes can join the same registry without changing the asset model. The
gateway resolves the immutable core package rather than copying every AOPS
reference into each runtime.

## Install and verify

Use guided setup when configuring a new machine or server target:

```text
aops setup init
```

Use the normal explicit lifecycle from the installed npm package:

```text
aops assets install --target all --apply --json
aops assets status --verify quick --json
```

Install verifies signed expected digests, refuses unowned runtime files, and
does not use a repository as the source of core bytes. `status` is read-only;
`--verify full` additionally rehashes every active, previous, and pinned
immutable package file.

`--target all` expands to every runtime registered by this CLI. A single
runtime, comma-separated subset, or repeated `--target` is also accepted;
`both` is not a selector. `--from-release` is only a maintainer/offline recovery
override—the normal npm package resolves its verified bundled asset release.

## Discover only what is needed

```text
aops assets resolve --gateway aops --json
aops assets discover --query "<intent or domain>" --limit 5 --json
aops assets resolve --name <exact-name> --json
```

Discovery returns bounded metadata candidates before any body is loaded.
Resolve only the selected exact asset. The verified offline core includes a
small neutral router, mounted-domain references, on-demand user guides, and the
current working-discipline references. Setup makes those choices available;
it does not silently select a board model, communication mode, or discipline.
Optional hosted catalog packages also remain inert until explicitly selected.

The core deliberately excludes private development architecture, machine
paths, repository caches, and domains not mounted by Community. Exact live
capability discovery remains the authority when a server adds custom domains.

## Local and remote ownership

The AOPS server may run locally or on another machine. Hosted records and
optional packages remain server-owned; the verified client store, activation
receipts, and runtime gateway stay on the user's machine. Repository caches do
not replace or shadow the installed core.

Fresh server setup may import an inert signed official catalog for optional
discovery. `aops setup init --no-catalog` skips that initial import only; it
does not remove existing rows or change the offline core.

## Diagnose before repair

```text
aops assets status --verify quick --json
aops assets repair --json
aops assets migrate inspect --json
```

Mutations preview by default and require `--apply`. Destructive cleanup or an
ownership transition additionally requires `--confirm`. Unknown or user-owned
runtime files are reported and left untouched.

Use `aops assets --help` and the selected subcommand's `--help` as the exact
flag and safety contract for the installed CLI version.
