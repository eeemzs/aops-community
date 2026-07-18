# AOPS Community

AOPS (Agentic Operations System) is a self-hosted workspace for running AI-assisted operational work with durable project plans, shared context, documents, and agent collaboration.

AOPS Community brings the three user-facing parts together:

- **Cockpit** — the browser interface.
- **AOPS Server** — the API and application runtime.
- **AOPS CLI** — setup, administration, and agent workflows from the terminal.

The server stores its data in PostgreSQL 17 and can run on the same computer as the CLI or on another machine. For a broader product introduction, visit [aopslab.com](https://www.aopslab.com).

## Getting Started

Choose the setup that matches how you want to run AOPS:

1. **Clone the repository and use your own PostgreSQL** — no Docker required.
2. **Clone the repository and use the ready PostgreSQL container** — Docker is used only for PostgreSQL.
3. **Run the ready AOPS stack with Docker** — no source clone or application build.
4. **Install only the CLI and connect to an existing server** — no local server, PostgreSQL, or Docker required.

The examples below use release `0.1.0`. Use one matching version for the source, CLI, and server. Local server installations should have at least 4 GB of free memory and 2 GB of free disk space.

> The Docker-only and CLI-only paths require `@aopslab/aops-cli` to be available on npm. Until that package is published, use one of the source-clone paths.

### 1. Clone and use your own PostgreSQL

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
pnpm run aops-cli server setup --runtime native --postgres external --postgres-config ./aops.server.env --postgres-tls verify-full --source-root . --port 5900 --detach --preview --json
pnpm run aops-cli server setup --runtime native --postgres external --postgres-config ./aops.server.env --postgres-tls verify-full --source-root . --port 5900 --detach --apply --json
pnpm run aops-cli server status --json
```

Use `--postgres-tls disable` only for PostgreSQL running on the same computer. For a remote database, keep hostname verification enabled.

### 2. Clone and use the ready PostgreSQL container

Use this option when you want to run AOPS from source but do not want to install PostgreSQL yourself. Docker runs PostgreSQL only; Cockpit and the AOPS server run directly from the cloned repository.

Requirements: Git, Node.js 22.9.0 or newer, pnpm 11.9.0, and Docker Engine or Docker Desktop.

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

The CLI creates the database secret, starts the pinned PostgreSQL 17 container, and keeps its data in a persistent Docker volume. It does not build or run an AOPS application image.

Inside the repository, always use `pnpm run aops-cli`. This selects the clone-local CLI even when another version is installed globally.

### 3. Run the ready Docker stack

Use this option for the shortest full local installation. A source clone, pnpm workspace install, registry login, and application image build are not required.

Requirements: Node.js 22.9.0 or newer and Docker Engine or Docker Desktop with Docker Compose v2.

```sh
npm install --global @aopslab/aops-cli@0.1.0
aops-cli server setup --runtime oci --preview --json
aops-cli server setup --runtime oci --apply --json
aops-cli server status --json
```

The CLI pulls the matching ready AOPS image, creates local secrets and persistent PostgreSQL storage, starts the stack, and verifies server health.

### 4. Install only the CLI

Use this option when an AOPS server already runs on this computer, another computer, or a hosted environment. The client computer does not need a source clone, PostgreSQL, or Docker.

Requirements: Node.js 22.9.0 or newer and the HTTPS address of the existing server.

```sh
npm install --global @aopslab/aops-cli@0.1.0
aops-cli target add --name team --api-base-url https://aops.example.test --auth-provider authv2-jwt-session --tls-policy system-ca --use --json
aops-cli target add --name team --api-base-url https://aops.example.test --auth-provider authv2-jwt-session --tls-policy system-ca --use --apply --json
aops-cli auth login --target team
aops-cli target doctor team --json
```

Replace `https://aops.example.test` with the real server address. Login credentials are stored for the named target on the client computer.

### After the server starts

For a local installation, open <http://127.0.0.1:5900>. The same address serves Cockpit and the AOPS API.

From a cloned repository:

```sh
pnpm run aops-cli server status --json
pnpm run aops-cli server logs --tail 100 --json
pnpm run aops-cli server restart --detach --json
pnpm run aops-cli server stop --json
pnpm run aops-cli server start --detach --json
```

With an independently installed CLI:

```sh
aops-cli server status --json
aops-cli server logs --tail 100 --json
aops-cli server restart --json
aops-cli server stop --json
aops-cli server start --json
```
