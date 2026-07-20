# AOPS Community

AOPS (AI Operations) is a self-hosted workspace for durable project plans,
shared agent context, documents, discussions, and operator workflows.

AOPS Community ships three user-facing parts:

- **AOPS Cockpit** — the browser interface.
- **AOPS Server** — the loopback API and application runtime.
- **AOPS CLI** — setup, lifecycle, administration, and agent operations.

## Default installation: npm

The promoted installation does not require Git, a source checkout, pnpm, or an
AOPS application container. Install the CLI globally; its exact dependency
installs the matching ready-to-run server package and bundled Cockpit:

```sh
npm install --global @aopslab/aops-cli@0.1.3
aops-cli --cli-version
```

The compatible package pair for this release is:

- `@aopslab/aops-cli@0.1.3`
- `@aopslab/aops-server@0.1.0`

The server package may also be downloaded directly with npm for inspection,
but normal operation should go through the `aops-cli` command.

### 1. Configure PostgreSQL

PostgreSQL is operator-owned. AOPS can use an existing local, remote, or
managed PostgreSQL 17+ database. Create the private configuration interactively:

```sh
aops-cli setup server-env
```

The default file is `~/.aops/aops.server.env` on Windows, macOS, and Linux. It
is outside the npm package and outside this repository. Its core value is:

```dotenv
AOPS_PG_URL=postgresql://USER:PASSWORD@HOST:5432/aops
```

Do not commit this file. Use `--postgres-tls disable` only for loopback
PostgreSQL. For remote PostgreSQL use `require`, or preferably `verify-full`
with `AOPS_PG_SSL_ROOT_CERT` configured beside the env file.

### 2. Install and start the server

For PostgreSQL on the same computer:

```sh
aops-cli server setup \
  --runtime native \
  --postgres external \
  --postgres-tls disable \
  --apply
```

For a remote PostgreSQL server with certificate and hostname verification:

```sh
aops-cli server setup \
  --runtime native \
  --postgres external \
  --postgres-tls verify-full \
  --apply
```

The guided equivalent remains available:

```sh
aops-cli setup init
```

The npm server package is the default. `--source-root` is only needed when an
advanced user deliberately runs a cloned Community checkout.

### 3. Verify and operate

```sh
aops-cli server health --json
aops-cli server status --json
aops-cli server logs --tail 100 --json
aops-cli server stop --json
aops-cli server start --json
```

Open <http://127.0.0.1:5900>. The same loopback origin serves Cockpit and the
AOPS API. Configuration, credentials, data, logs, migration receipts, and
lifecycle state remain in the user-owned AOPS data directories, never inside
the npm package folder.

## Optional PostgreSQL-only container

Docker is not required for the AOPS application. If PostgreSQL is not already
installed, an operator may run only PostgreSQL in a container and then give its
loopback connection to `aops-cli`:

```sh
docker volume create aops-postgres-data
docker run --detach \
  --name aops-postgres \
  --publish 127.0.0.1:5432:5432 \
  --env POSTGRES_DB=aops \
  --env POSTGRES_USER=aops \
  --env POSTGRES_PASSWORD=REPLACE_WITH_A_PRIVATE_PASSWORD \
  --volume aops-postgres-data:/var/lib/postgresql/data \
  postgres:17-alpine
```

The operator owns this container lifecycle. In the npm-first path, `aops-cli`
does not start, stop, update, or delete Docker resources.

The ready AOPS application image and Docker/Compose installation lanes are
temporarily deferred. Their code may remain for future reactivation, but npm
installation is the supported default and ordinary source/doc changes do not
trigger image work.

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
aops-cli server setup \
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
aops-cli target add --name remote-community \
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
