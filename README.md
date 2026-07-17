# AOPS Community

Local, three-application AOPS distribution: Cockpit, CLI, and the AOPS server on PostgreSQL 17.

For AOPS introduction please visit [aopslab.com](https://www.aopslab.com)

> Release status: Apache-2.0 source candidate. Public release remains gated on reviewed attribution, SBOM/provenance, migration safety, and independent release validation.

## Installation and Getting Started

Choose one path. Docker is optional: N1 and C1 do not need it, N2 uses it only for PostgreSQL, and D1 uses it to run the ready Community stack. Normal users never build an AOPS application image.

| Path | Use this when | Clone | Docker | PostgreSQL |
| --- | --- | --- | --- | --- |
| **N1** | You want the application to run from source and already have PostgreSQL 17 | Yes | No | You manage it |
| **N2** | You want the application to run from source but want AOPS to provide only PostgreSQL | Yes | PostgreSQL only | AOPS manages the container |
| **D1** | You want the ready Community stack with the least setup | No | Yes | Included in the ready stack |
| **C1** | An AOPS server already runs locally or remotely and you need only the CLI | No | No | Owned by that server |

For a local server path (N1, N2, or D1), allow at least 4 GB of free memory and 2 GB of free disk space.

All examples use release 0.1.0. Use the exact version announced for a later release instead of silently mixing versions.

### N1 — Clone, native application, external PostgreSQL

Requirements: Git, Node.js 22.9.0 or newer, pnpm@11.9.0, and a reachable PostgreSQL 17 database. Docker is not used.

```sh
git clone --branch v0.1.0 --depth 1 https://github.com/eeemzs/aops-community.git aops-community
cd aops-community
corepack enable
corepack install --global pnpm@11.9.0
pnpm install --frozen-lockfile
```

Create `aops.server.env` beside the root `package.json`. Keep it private and never pass the connection URL on the command line:

```dotenv
AOPS_PG_URL=postgresql://USER:PASSWORD@HOST:5432/aops
# Optional for a private CA; the path must stay beside this file:
# AOPS_PG_SSL_ROOT_CERT=ca.pem
```

Preview first, then apply the exact profile:

```sh
pnpm run aops-cli server setup --runtime native --postgres external --postgres-config ./aops.server.env --postgres-tls verify-full --source-root . --port 5900 --detach --preview --json
pnpm run aops-cli server setup --runtime native --postgres external --postgres-config ./aops.server.env --postgres-tls verify-full --source-root . --port 5900 --detach --apply --json
pnpm run aops-cli server status --json
```

`verify-full` is the recommended remote-database policy. `disable` is accepted only for loopback PostgreSQL. The CLI installs the frozen workspace, builds the native application, migrates the database under a lock, starts the server, and verifies health.

### N2 — Clone, native application, PostgreSQL-only container

Requirements: Git, Node.js 22.9.0 or newer, pnpm@11.9.0, and Docker Engine or Docker Desktop. Docker runs PostgreSQL only; Cockpit and the server remain native processes.

```sh
git clone --branch v0.1.0 --depth 1 https://github.com/eeemzs/aops-community.git aops-community
cd aops-community
corepack enable
corepack install --global pnpm@11.9.0
pnpm install --frozen-lockfile
pnpm run aops-cli server setup --runtime native --postgres container --source-root . --port 5900 --detach --preview --json
pnpm run aops-cli server setup --runtime native --postgres container --source-root . --port 5900 --detach --apply --json
pnpm run aops-cli server status --json
```

The CLI creates a private database secret, pulls the pinned PostgreSQL 17 image, and preserves the named database volume across normal stop/start operations. It does not build or run the AOPS application image.

Inside a clone, `pnpm run aops-cli` always executes the clone-local CLI entry even if another `aops-cli` is installed globally.

### D1 — No clone, ready signed OCI stack

Requirements: Node.js 22.9.0 or newer and Docker Engine or Docker Desktop with Docker Compose v2. No Git clone, pnpm workspace install, registry login, or application image build is required.

```sh
npm install --global @aopslab/aops-cli@0.1.0
aops-cli server setup --runtime oci --preview --json
aops-cli server setup --runtime oci --apply --json
aops-cli server status --json
```

The CLI version selects the matching immutable release tag. Setup verifies the signed release descriptor, binds the exact OCI digest, anonymously pulls the ready image, creates local secrets and persistent PostgreSQL storage, starts the stack, and verifies health. Mutable `latest` resolution is not an authorization path.

For a one-off command without a global install:

```sh
npx --yes --package @aopslab/aops-cli@0.1.0 aops-cli server status --json
pnpm dlx --package @aopslab/aops-cli@0.1.0 aops-cli server status --json
```

### C1 — CLI only, connect to an existing server

Requirements: Node.js 22.9.0 or newer and the HTTPS address of the existing server. Docker, PostgreSQL, and a source clone are not required on the client computer.

```sh
npm install --global @aopslab/aops-cli@0.1.0
aops-cli target add --name team --api-base-url https://aops.example.test --auth-provider authv2-jwt-session --tls-policy system-ca --use --json
aops-cli target add --name team --api-base-url https://aops.example.test --auth-provider authv2-jwt-session --tls-policy system-ca --use --apply --json
aops-cli auth login --target team
aops-cli target doctor team --json
```

Replace `https://aops.example.test` with the real server address. Remote targets require HTTPS with the system certificate store. The interactive login stores credentials per named target; it does not copy or install a server.

## Operate an installed server

Open <http://127.0.0.1:5900> after N1, N2, or D1 setup. The same origin serves Cockpit and the AOPS HTTP API. Every normal start rechecks the fixed migration chain; data is preserved across stop/start and restart.

For N1 or N2, run the clone-local commands:

```sh
pnpm run aops-cli server status --json
pnpm run aops-cli server logs --tail 100 --json
pnpm run aops-cli server restart --detach --json
pnpm run aops-cli server stop --json
pnpm run aops-cli server start --detach --json
```

For D1, use the independently installed CLI:

```sh
aops-cli server status --json
aops-cli server logs --tail 100 --json
aops-cli server restart --json
aops-cli server stop --json
aops-cli server start --json
```

N1 database backup and restore remain the external PostgreSQL operator's responsibility. N2 and D1 keep managed database data in named volumes and expose explicit CLI backup, update, recovery, and reset commands; inspect `aops-cli server --help` before a destructive action.

## Contributing and release engineering

Normal installation ends above. Application-image builds, source validation, generated evidence, and release-factory operations are maintainer/contributor work, not user setup. See [CONTRIBUTING.md](CONTRIBUTING.md) for contributor and release-engineering guidance. Do not hand-edit generated SBOM, checksum, provenance, or release-descriptor evidence.
