# AOPS Community

AOPS (Agentic Operations System) is a self-hosted workspace for running AI-assisted operational work with durable project plans, shared context, documents, and agent collaboration.

AOPS Community brings the three user-facing parts together:

- **Cockpit** — the browser interface.
- **AOPS Server** — the API and application runtime.
- **AOPS CLI** — setup, administration, and agent workflows from the terminal.

The server stores its data in PostgreSQL 17 and can run on the same computer as the CLI or, for one trusted operator, on another machine through the SSH tunnel described below. For a broader product introduction, visit [aopslab.com](https://www.aopslab.com).

## Getting Started

Choose one of these independent alternatives:

- **Alternative A1 — Clone the repository and use your own PostgreSQL.** No Docker required.
- **Alternative A2 — Clone the repository and use the ready PostgreSQL container.** Docker is used only for PostgreSQL.
- **Alternative A3 — Run the ready AOPS stack with Docker.** No source clone or application build.
- **Alternative A4 — Connect to an existing Community server through SSH.** No local server, PostgreSQL, or Docker required on the client computer.

The examples below use release `0.1.0`. Use one matching version for the source, CLI, and server. Local server installations should have at least 4 GB of free memory and 2 GB of free disk space.

### Install the AOPS CLI

Every alternative uses the public CLI package from npm. Install the version that matches the AOPS source or server release:

```sh
npm install --global @aopslab/aops-cli@0.1.0
aops-cli --version
```

> `@aopslab/aops-cli@0.1.0` is not published yet. The normal installation commands below become available after the npm package is published. The repository-local source invocation described at the end is for CLI development, not the normal user installation path.

## Security and remote access

AOPS Community is currently a single-user, local-trusted distribution. It does
not provide an AOPS user account, password login, or JWT session boundary. A
request accepted from the local machine receives the built-in local operator
identity with administrator permissions.

The default installation therefore publishes AOPS only on `127.0.0.1:5900` and
does not publish PostgreSQL. Do not change the server binding to `0.0.0.0` or
place this release directly behind a public reverse proxy: anyone who could
reach that endpoint would be treated as the trusted operator.

| Scenario | Current support | Security boundary |
| --- | --- | --- |
| Cockpit and CLI on the AOPS host | Supported | The local machine is trusted |
| AOPS on a remote host, accessed through an SSH tunnel by one operator | Supported for single-user operation | SSH authenticates and encrypts the connection; AOPS still trusts the tunneled client |
| Direct LAN or Internet exposure | Not supported | Community has no user-login boundary |
| Multiple authenticated users | Not available yet | Authentication-based multi-user support is under development; a limited form is planned for Community Edition |

Some CLI and ChatV3 surfaces refer to tokens. ChatV3 member tokens identify room
membership, and shared CLI transport code can understand access tokens used by
other AOPS distributions. Neither currently adds user authentication to AOPS
Community.

### Alternative A1 — Clone and use your own PostgreSQL

Use this option when PostgreSQL 17 is already available locally, on your network, or through a managed database service.

Requirements: Git, Node.js 22.9.0 or newer, pnpm 11.9.0, and a reachable PostgreSQL 17 database.

```sh
git clone --branch v0.1.0 --depth 1 https://github.com/eeemzs/aops-community.git aops-community
cd aops-community
corepack enable
corepack install --global pnpm@11.9.0
pnpm install --frozen-lockfile
```

Create `aops.server.env` beside the root `package.json`:

```dotenv
AOPS_PG_URL=postgresql://USER:PASSWORD@HOST:5432/aops
# Optional private certificate authority:
# AOPS_PG_SSL_ROOT_CERT=ca.pem
```

Keep this file private. Preview the setup, apply it, and check the server:

```sh
aops-cli server setup --runtime native --postgres external --postgres-config ./aops.server.env --postgres-tls verify-full --source-root . --port 5900 --detach --preview --json
aops-cli server setup --runtime native --postgres external --postgres-config ./aops.server.env --postgres-tls verify-full --source-root . --port 5900 --detach --apply --json
aops-cli server status --json
```

Use `--postgres-tls disable` only for PostgreSQL running on the same computer. For a remote database, keep hostname verification enabled.

### Alternative A2 — Clone and use the ready PostgreSQL container

Use this option when you want to run AOPS from source but do not want to install PostgreSQL yourself. Docker runs PostgreSQL only; Cockpit and the AOPS server run directly from the cloned repository.

Requirements: Git, Node.js 22.9.0 or newer, pnpm 11.9.0, and Docker Engine or Docker Desktop.

```sh
git clone --branch v0.1.0 --depth 1 https://github.com/eeemzs/aops-community.git aops-community
cd aops-community
corepack enable
corepack install --global pnpm@11.9.0
pnpm install --frozen-lockfile
aops-cli server setup --runtime native --postgres container --source-root . --port 5900 --detach --preview --json
aops-cli server setup --runtime native --postgres container --source-root . --port 5900 --detach --apply --json
aops-cli server status --json
```

The CLI creates the database secret, starts the pinned PostgreSQL 17 container, and keeps its data in a persistent Docker volume. It does not build or run an AOPS application image.

The source clone contains the CLI implementation for transparency and contribution, but normal setup still uses the npm-installed `aops-cli` command.

### Alternative A3 — Run the ready Docker stack

Use this option for the shortest full local installation. A source clone, pnpm workspace install, registry login, and application image build are not required.

Requirements: Node.js 22.9.0 or newer and Docker Engine or Docker Desktop with Docker Compose v2.

```sh
aops-cli server setup --runtime oci --preview --json
aops-cli server setup --runtime oci --apply --json
aops-cli server status --json
```

The CLI pulls the matching ready AOPS image, creates local secrets and persistent PostgreSQL storage, starts the stack, and verifies server health.

### Alternative A4 — Connect through an SSH tunnel

Use this option when AOPS Community already runs on another computer. The client computer does not need a source clone, PostgreSQL, or Docker, but the deployment remains single-user and local-trusted.

Requirements: Node.js 22.9.0 or newer, the AOPS CLI, and SSH access to the remote host.

Keep AOPS bound to loopback on the remote host. From the client computer, open a tunnel and leave the SSH session running:

```sh
ssh -L 5900:127.0.0.1:5900 user@aops-host
```

In another terminal, register the local end of that tunnel:

```sh
aops-cli target add --name remote-community --api-base-url http://127.0.0.1:5900 --auth-provider trusted-local --tls-policy loopback-http --use --json
aops-cli target add --name remote-community --api-base-url http://127.0.0.1:5900 --auth-provider trusted-local --tls-policy loopback-http --use --apply --json
aops-cli target doctor remote-community --json
```

The browser can use <http://127.0.0.1:5900> while the tunnel is open. SSH provides authentication and encryption; AOPS Community itself still treats the tunneled connection as the one trusted operator. Do not share the SSH account or tunnel with untrusted users.

### After the server starts

For a local installation, open <http://127.0.0.1:5900>. The same address serves Cockpit and the AOPS API.

Use the npm-installed CLI for both source-clone and ready-image installations:

```sh
aops-cli server status --json
aops-cli server logs --tail 100 --json
aops-cli server restart --json
aops-cli server stop --json
aops-cli server start --json
```

### Develop the CLI from source

The repository includes the CLI source so the open-source Community tree is complete and contributors can inspect, test, and change it. This is not the normal installation path. After installing the workspace dependencies, the built CLI can be invoked directly with Node.js:

```sh
node ./apps/aops-cli/dist/main.js --help
node ./apps/aops-cli/dist/main.js server status --json
```

Use the npm-installed `aops-cli` command for normal operation. Use the direct Node.js form only while developing or testing the repository copy of the CLI.
