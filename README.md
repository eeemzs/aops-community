# AOPS Community

AOPS (AI Operations) is a self-hosted workspace for durable project plans,
shared agent context, documents, discussions, and operator workflows.

AOPS Community ships three user-facing parts:

- **AOPS Cockpit** — the browser interface.
- **AOPS Server** — the loopback API and application runtime.
- **AOPS CLI** — setup, lifecycle, administration, and agent operations.

## Quick start: npm, no Git clone

The supported default installation needs no Git checkout, pnpm build, or AOPS
application container. You need:

- Node.js `>=22.9.0` with npm.
- PostgreSQL 17+ already installed or available remotely, or Docker
  Desktop/Engine for the automatic managed-PostgreSQL option.

Install one global command:

```sh
npm install --global @aopslab/aops-cli
aops --cli-version
```

Then choose the setup menu, direct wizard, or an AI-assisted handoff:

```sh
aops                 # setup-first when no local installation is detected
aops setup           # compact installation menu
aops setup init      # direct interactive installation wizard
aops setup ai        # copy-ready prompt for any terminal AI agent
aops setup guide     # read-only installation skill for an AI agent
```

`aops setup guide` prints the agent-readable installation skill bundled with
the npm CLI. It is available before server initialization and guides an agent
through PostgreSQL ownership, `setup init`, Gateway activation, health checks,
and Cockpit handoff without performing hidden writes.

npm installs this verified application closure:

- `@aopslab/aops-cli` — the global `aops` command.
- `@aopslab/aops-server` — the ready server runtime, exact CLI dependency.
- AOPS Cockpit, PostgreSQL migrations, and runtime assets inside the server package.
- The signed offline AOPS Gateway/client-core skills and inert official skill
  catalog snapshot inside the CLI package.

You do not need to install `@aopslab/aops-server` separately. The package is
available directly for inspection, but setup and lifecycle operations should go
through the canonical `aops` command.

### Choose how to complete setup

| Setup style | Start here | Best for |
|---|---|---|
| Interactive operator setup | `aops`, `aops setup`, or `aops setup init` | A person installing AOPS on one computer |
| Agent-assisted setup | `aops setup ai` | Codex, Claude, or another terminal agent helping the operator safely |
| Agent install skill | `aops setup guide` | An agent that needs the complete packaged setup discipline |
| Non-interactive automation | `aops setup init --yes --json` | CI, scripts, and an agent that must inspect readiness before applying |

The no-argument `aops` menu is intentionally short. When no complete local
runtime or configured remote AOPS target is detected it opens the setup-first
menu automatically; otherwise it opens the operator menu. `aops setup` always
opens the compact installation menu. Use `aops --help` or
`aops <command> --help` for the complete live surface.

### Recommended: interactive first installation

Run the compact operator menu and choose **Initialize AOPS**, or open the setup
wizard directly:

```sh
aops
aops setup init
```

On Windows, macOS, and Linux the menu offers three local server paths:

- use your own local, remote, or managed PostgreSQL connection; or
- let AOPS create a PostgreSQL 17 container and persistent volume through
  Docker; or
- let AOPS detect PostgreSQL on this computer and create a dedicated AOPS role
  and database in it.

All three choices install the npm server as the normal `default` instance on
<http://127.0.0.1:5900>, activate the AOPS Gateway for every registered agent
runtime, reconcile the bundled signed official catalog without activating its
skills, and create a deliberately small starter dataset automatically. The
interactive wizard proceeds after the selected path's required private inputs
and installs or repairs the verified agent assets automatically; it does not ask
redundant continue, starter-data, asset-selection, or asset-confirmation
questions. Use `--agent-assets skip`, `--no-catalog`, or `--no-seed` only for an
explicitly minimal installation:

- one **AOPS Starter** project;
- one **Getting Started** kanban board;
- one task with the **First AOPS Sprint** plan; and
- one **AOPS Getting Started** user-guide document.

The global verified AOPS core includes the neutral router, concise domain
references, and user guides needed by an agent immediately after setup. The
signed official catalog also makes collaboration and working-discipline skills
discoverable, but keeps them inert until the user or agent deliberately selects
one; setup does not impose a working method.

For the managed Docker database, AOPS generates a strong password by default.
The wizard can instead accept and confirm a custom password through masked
prompts; it is never passed as a command-line argument. With your own
PostgreSQL, the managed container, or a newly provisioned local database, setup plans and applies pending migrations,
verifies the resulting schema, and only then reports the server ready. Long
steps use animated progress in an interactive terminal, while `--json` output
contains only the structured result.

Supabase, Neon, and similar managed PostgreSQL services are supported through
the same existing-PostgreSQL path. AOPS versions only its own non-extension
objects in `public` plus its per-domain migration receipts; provider schemas,
extensions, and global event triggers stay outside the AOPS lineage and are not
removed. If a provider automatically grants its API roles access to newly
created AOPS tables, setup revokes those non-owner grants before the exact
schema verification succeeds. Access remains through the configured AOPS
server connection unless the operator deliberately adds a separate policy.

Use `--no-seed` to start with an empty database. Non-interactive examples:

```sh
aops setup init --path 2 --apply --yes
aops setup init --path 2 --no-seed --apply --yes
```

The Docker PostgreSQL port is bound only to loopback and assigned dynamically,
so setup does not claim port `5432`. To delete a managed database and its local
installation state, use the normal reset command; it refuses unknown or
ownership-label-drifted Docker resources:

```sh
aops server reset --remove-managed-postgres --confirm-data-loss --confirm-instance default
aops setup init
```

If PostgreSQL is installed on the computer but AOPS does not yet have a
database, choose path `3`. Setup probes only the loopback endpoint, asks for an
existing PostgreSQL administrator role and password through masked prompts,
creates a new dedicated application role/database, and stores only the generated
application connection in the private user server-env. The administrator
password is never stored. If PostgreSQL is missing or stopped, readiness shows
the relevant official Windows installer link, Homebrew commands, or detected
Linux `apt`/`dnf` commands; it does not silently run an elevated system package
manager.

### Agent-assisted installation

The npm CLI contains a small `aops-install` skill specifically for installation
and recovery. It is available immediately after `npm install`, before the AOPS
server or global Gateway pointers exist:

```sh
aops setup guide          # print the complete agent-readable guide
aops setup ai             # print a safe prompt to copy to any terminal AI agent
aops setup ai --json      # return the prompt and skill identity for tooling
aops setup guide --path   # print the installed SKILL.md path
aops setup guide --json   # return metadata and content for automation
aops setup init --help    # inspect the exact setup surface in this CLI version
```

`aops setup guide` is read-only. It teaches an agent to inspect the machine,
ask the operator for the PostgreSQL ownership and TLS decisions it cannot infer,
apply only an explicitly selected path, activate registered agent runtimes, and
verify server health and Cockpit. It does not silently install or change
anything.

After installing the CLI, run `aops setup ai` and copy its generated bootstrap
request to a terminal agent. The generated prompt routes the agent back to the
packaged `aops-install` skill, mutation-free readiness, live help, masked secret
entry, and end-to-end verification. Its current shape is:

```text
Install AOPS Community on this computer with the installed `aops` command.

1. Run `aops setup guide --json` and follow its packaged `aops-install` skill as
   the current installation guide.
2. Run `aops setup init --yes --json` first and explain the available PostgreSQL
   paths and remaining actions briefly.
3. Ask me only for choices or authority you cannot safely infer. Use the
   installed command's exact nested `--help`; do not guess flags.
4. Never ask me to paste PostgreSQL URLs or passwords into chat and never place
   secrets in command arguments. Let me enter private values through AOPS's
   masked interactive prompts.
5. Keep the starter data, signed official catalog, and Gateway assets for all
   registered agent runtimes unless I explicitly opt out.
6. Apply the selected setup path, then verify migrations, server health,
   Gateway asset bindings, and Cockpit. Report the Cockpit URL and any remaining
   safe action.
```

The agent's safe discovery sequence is:

```sh
aops --cli-version
aops setup init --yes --json
```

These commands are mutation-free. The setup envelope already includes host and
Gateway readiness; run separate `assets status` or `server status` only when
that check needs more detail. When the operator has selected a path, inspect
that exact path without mutation before applying it, for example:

```sh
aops setup init --path 2 --yes --json
aops setup init --path 2 --apply --yes --json   # managed Docker PostgreSQL

aops setup init --path 3 --yes --json
aops setup init --path 3 --apply                # detected local PostgreSQL; masked admin prompt
```

There are two related but different skill layers:

- `aops setup guide` exposes the packaged **installation skill** used to get the
  system running.
- `aops assets install --target all --apply` installs the verified global
  **AOPS Gateway skill/pointers** for every agent runtime registered by this CLI.
  Interactive setup performs this Gateway step by default.

This distinction lets an agent bootstrap AOPS before Gateway activation, then
use the installed Gateway for normal AOPS planning, memory, documents, and tool
discovery after setup.

### 1. Save the PostgreSQL connection

The simplest and safest path is interactive; the URL is entered through a
masked prompt and is not placed in shell history:

```sh
aops setup server-env
```

For automation, pass the URL through the process environment rather than a CLI
argument. PowerShell:

```powershell
$env:AOPS_PG_URL = "postgresql://aops:PRIVATE_PASSWORD@127.0.0.1:5432/aops"
aops setup server-env --yes
Remove-Item Env:AOPS_PG_URL
```

macOS or Linux:

```sh
AOPS_PG_URL='postgresql://aops:PRIVATE_PASSWORD@127.0.0.1:5432/aops' \
  aops setup server-env --yes
```

The command writes `~/.aops/aops.server.env` on Windows, macOS, and Linux. This
private file is outside the npm package and this repository; never commit it.

### 2. Install, migrate, and start AOPS Server

For PostgreSQL bound to loopback on the same computer:

```sh
aops server setup \
  --runtime native \
  --postgres external \
  --postgres-tls disable \
  --apply
```

This resolves the npm-installed server package, applies pending migrations, and
starts the server detached in the background. No `--source-root` is needed.

For a remote PostgreSQL server, prefer certificate and hostname verification:

```sh
aops server setup \
  --runtime native \
  --postgres external \
  --postgres-tls verify-full \
  --apply
```

Configure `AOPS_PG_SSL_ROOT_CERT` beside the server env file for
`verify-full`. The interactive default is `require`, which encrypts transport
without requiring a CA file. `--postgres-tls disable` is also available for an
operator who intentionally chooses an unencrypted local, remote, or
private-network PostgreSQL connection.

For a guided readiness and installation flow instead of the explicit command:

```sh
aops setup init
```

The npm server is the promoted path. `--source-root` is only for an advanced
user deliberately running a cloned Community checkout.

### 3. Verify and operate

```sh
aops server health
aops server status
aops server logs --tail 100

aops server stop
aops server start
aops server restart
```

Open Cockpit with one command:

```sh
aops cockpit
```

If the installed server is stopped, this command starts it first. If it is
already healthy, it opens the existing Cockpit in the default browser. It
fails closed for unhealthy, crashed, or identity-conflicted runtimes instead
of hiding a recovery problem. For scripts or headless hosts:

```sh
aops cockpit --no-open --json
```

Add `--json` to health, status, logs, start, or stop for automation. Cockpit
and the AOPS API share the same loopback origin, normally
<http://127.0.0.1:5900>. Configuration, credentials, data, logs, migration
receipts, and lifecycle state stay in user-owned AOPS data directories, never
in the npm package folder.

### 4. Install the AOPS Gateway skill for registered agent runtimes

Run the interactive asset manager:

```sh
aops assets
```

It can inspect, install or update, repair, and remove the global AOPS Gateway
skill for registered agent runtimes. This release registers Codex and Claude;
future runtimes extend the registry rather than the selector grammar. The gateway files are installed at
`<codex-home>/skills/aops/SKILL.md` and
`<claude-home>/skills/aops/SKILL.md`. They resolve the verified local AOPS
client core, so agents do not depend on a particular repository checkout.

The guided `aops setup init` flow also inspects these assets and, when running
interactively with `--apply`, asks whether to install, repair, inspect, or skip
them. The official npm package carries the signed Gateway/client-core closure
and inert official catalog snapshot; normal users are never asked to locate a
release directory. The payload contains client skills, compact references, and
end-user guides—not the hosted development architecture document group.

Equivalent explicit commands are:

```sh
aops assets status --verify full --json
aops assets install --target all --apply
aops assets update --target codex,claude --apply
aops assets repair --repair-bindings --target codex --target claude --apply
aops assets uninstall --target all --apply --confirm
```

`--target all` expands to every runtime registered by the installed CLI.
Explicit subsets may be comma-separated or supplied through repeated
`--target`; `both` is not a selector.

Maintainers and fully offline recovery workflows may explicitly override the
bundled source with `--from-release <signed-release-directory>`. This is not an
end-user installation step.

Install and update safely migrate only exact recognized legacy AOPS pointers.
Uninstall removes only recognized Codex/Claude gateway pointers and retains the
verified core and receipts, so a later repair can restore them. Unknown,
unsafe, and user-owned skill files are never overwritten or removed.

### Find the right hosted skill

Agents and operators can search current published, package-verified skill
metadata without loading every skill body:

```sh
aops skill search --q "kanban sprint planning" --limit 3
aops skill ask --q "Which skill should an agent use to plan a sprint?" --limit 3
```

`search` returns exact version refs, match fields, and ranking rationale. `ask`
formats one bounded search result as a concise recommendation; it is
deterministic and does not call an LLM. Both commands return at most five
candidates, support `--json`, and use on-read hosted metadata, so there is no
local index to rebuild or maintain.

### Verified clean-install smoke

The published pair above is exercised from an empty npm prefix without a Git
checkout. The release gate verifies package identity, PostgreSQL migrations,
setup readiness, start/stop/start, CLI health, `/api/health`, the Cockpit root
and hashed asset, and the agent-tool catalog. The latest Windows smoke used
Node.js 22, PostgreSQL 17, applied 26 migrations, and discovered 337 agent
tools. These counts are evidence for this release, not a permanent API promise.

## Optional PostgreSQL-only container

Docker is not required for the AOPS application. If PostgreSQL is not already
installed, an operator may run only PostgreSQL in a container and then give its
loopback connection to `aops`:

```sh
docker volume create aops-postgres-data
docker run --detach --name aops-postgres --publish 127.0.0.1:5432:5432 --env POSTGRES_DB=aops --env POSTGRES_USER=aops --env POSTGRES_PASSWORD=REPLACE_WITH_A_PRIVATE_PASSWORD --volume aops-postgres-data:/var/lib/postgresql/data postgres:17-alpine
```

The operator owns containers created with this manual recipe. The normal setup
path `aops setup init --path 2` is separate: AOPS manages only its own
namespaced, ownership-label-verified PostgreSQL container and volume.

## Optional npm-built application image

The application image is another wrapper around the same published npm
CLI/server closure; it does not clone or build this repository. Configuration,
migrations, lifecycle state, Cockpit, and the server still flow through `aops`.
Keep the data root on a volume and place the PostgreSQL URL in a private env
file rather than command arguments:

```sh
docker volume create aops-community-data
docker run --detach --name aops-community \
  --publish 127.0.0.1:5900:5900 \
  --env-file ./aops-container.env \
  --volume aops-community-data:/var/lib/aops \
  ghcr.io/eeemzs/aops-community:0.1.5
```

Set `AOPS_PG_URL` and choose the PostgreSQL transport policy explicitly with
`AOPS_POSTGRES_TLS=require`, `verify-full`, or `disable`. `require` remains the
image default, while `disable` is available when the operator intentionally
uses a non-TLS local, remote, or private-network PostgreSQL service. The image
never mounts the Docker socket or creates sibling containers.

Image construction and architecture composition live in private `aops-dist`.
Windows/x64 builds `linux/amd64` locally and macOS/ARM64 builds `linux/arm64`
locally; ordinary source or documentation changes do not trigger either lane.

## Source checkout for contributors

Git clone remains a supported development and advanced installation path:

```sh
git clone https://github.com/eeemzs/aops-community.git
cd aops-community
corepack enable
corepack install --global pnpm@11.9.0
pnpm install --frozen-lockfile
pnpm build
```

Run that explicit checkout through the same installed CLI:

```sh
aops server setup \
  --runtime native \
  --postgres external \
  --postgres-tls disable \
  --source-root . \
  --apply
```

The repository includes CLI source for transparency and contribution. During
development it can also be invoked directly:

```sh
node ./apps/aops-cli/dist/main.js --help
```

## Security and remote access

AOPS Community is currently single-user and local-trusted. It does not expose
a multi-user login boundary. The server therefore binds to `127.0.0.1` by
default. Do not bind it to `0.0.0.0`, expose it directly to a LAN or the
Internet, or place it behind a public reverse proxy.

For one trusted operator accessing another computer, keep AOPS loopback-only
on the host and use an SSH tunnel:

```sh
ssh -L 5900:127.0.0.1:5900 user@aops-host
```

Register the local end of the tunnel in another terminal:

```sh
aops target add --name remote-community \
  --api-base-url http://127.0.0.1:5900 \
  --auth-provider trusted-local \
  --tls-policy loopback-http \
  --use \
  --apply
```

SSH provides authentication and encryption; AOPS still treats the tunneled
client as the trusted operator.

## Open-source ownership

This public repository is the canonical AOPS Community application source.
Reusable domains live in their independent public repositories and are
consumed here as exact npm packages. Maintainer-only packaging and release
automation belongs in the private `aops-dist` repository, not in this source
tree.

Licensed under Apache-2.0. See `LICENSE`, `NOTICE`, and
`THIRD_PARTY_NOTICES`. Historical v1 Docker/projection SBOM and source-coverage
files were removed because they no longer describe the npm-first product.
