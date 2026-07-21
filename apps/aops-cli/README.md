# @aopslab/aops-cli

AOPS Community operator CLI. The global CLI controls the local AOPS server,
including setup, start, stop, status, health, authentication, and agent-facing
operations.

```sh
npm install --global @aopslab/aops-cli
aops --help
aops setup guide
aops setup init
aops cockpit
aops assets
```

`aops` is the primary executable. The former `aops-cli` name remains an exact
backward-compatible alias. `aops cockpit` opens a healthy installed Cockpit,
starting a stopped server first; use `--no-open --json` on headless hosts.

`aops setup init` is the normal cross-platform first-install menu. It offers an
existing PostgreSQL connection, an automatic Docker PostgreSQL 17 container,
or a dedicated AOPS role/database created in PostgreSQL installed on this computer,
uses the standard `default` instance and port `5900`, installs all registered
runtime pointers, reconciles the bundled signed official catalog without
activating its skills, and creates one small starter project/board/sprint/user-guide
dataset by default. Managed PostgreSQL uses a generated strong password by
default, with a masked custom-password choice in the interactive wizard. All
database paths verify migrations before readiness; interactive terminals show
animated progress and `--json` remains machine-clean. Interactive setup applies
the chosen path immediately after collecting its required private inputs; the
starter dataset is automatic and has no extra confirmation question. Use
`--no-seed` to start empty. A managed database can be
removed only with `aops server reset --remove-managed-postgres
--confirm-data-loss --confirm-instance default`; exact ownership labels are
verified before the container or volume is deleted.

Setup path 3 probes loopback PostgreSQL without relying on `psql` being on
`PATH`, then asks for an existing administrator role/password through masked
input. The administrator password is transient; AOPS stores only its generated
application connection in the private user server-env. If PostgreSQL is absent
or stopped, readiness returns platform-specific Windows, macOS, or Linux
install/start guidance instead of silently invoking an elevated package manager.

The existing-PostgreSQL path supports managed providers such as Supabase and
Neon. Migration lineage is scoped to AOPS-owned, non-extension `public`
objects and the five domain migration roots (`sys`, `agentspace`, `docman`,
`projectman`, and `chatv3`); provider schemas, extensions, and global event
triggers are preserved. Provider-applied non-owner grants on new AOPS tables
are revoked before final schema verification so a managed provider's data API
does not expose AOPS tables by default.

The npm installation includes the matching `@aopslab/aops-server` runtime, so
the default setup path does not require Git or a source checkout. Advanced
users can still run an explicit AOPS Community checkout with `--source-root`.

`aops setup guide` prints the packaged agent-readable installation skill before
the server is initialized. `aops assets` opens the registered-runtime asset
manager. It installs or updates the verified AOPS Gateway skill, repairs global pointers, reports
status, and can safely remove recognized pointers while retaining the local
verified core. Interactive `aops setup init` applies directly; automation uses
an explicit path with `--apply --yes`.
The official npm package supplies an independently signed
Gateway/client-core closure and inert official catalog snapshot, so normal
installation does not depend on an application-image release or ask for a
release directory. `--from-release` remains an
advanced maintainer/offline override. Use `aops assets --help` for the
non-interactive commands and target selectors. Unknown or user-owned skill
files are never overwritten or removed. Use `--target all`, a single runtime,
a comma-separated subset, or repeated `--target`; `both` is not supported.

Server data, configuration, credentials, logs, and lifecycle state are stored
outside npm's package directory. Existing and manually created PostgreSQL
remain operator-owned; setup path 2 owns only its namespaced, label-verified
managed PostgreSQL resources.
