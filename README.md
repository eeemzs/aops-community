# AOPS Community

Local, three-application AOPS distribution: Cockpit, CLI, and the AOPS server on PostgreSQL 17.

> Release status: operational candidate. The license decision and LICENSE/NOTICE files are intentionally deferred, so this tree is not approved for public or commercial redistribution.

## Requirements

- Docker Engine or Docker Desktop with Docker Compose
- At least 4 GB of free memory and 2 GB of free disk space
- Node.js 22+ only for the one-time local environment initializer

## Start

From this directory:

```sh
node deploy/community/init-env.mjs
docker compose pull
docker compose up --no-build -d --wait
```

Open <http://127.0.0.1:5900>. The same origin serves the production Cockpit and proxies the AOPS HTTP API. The PostgreSQL port is not published. The only published port is explicitly bound to host loopback.

The initializer creates a local `.env` once with independent random URL-safe PostgreSQL and ChatV3 server-encryption secrets. Re-running it preserves the existing file. The file is excluded from the image build context and must never be committed.

## Verify and operate

```sh
curl --fail http://127.0.0.1:5900/api/health
docker compose ps
docker compose logs --tail 100 app
```

Every app start applies the five domain schemas in a fixed order. Migrations are idempotent, so normal restarts preserve data.

```sh
docker compose restart app
docker compose down
docker compose up -d --wait
```

## Five-minute product walkthrough

Seed one deterministic, demo-owned scenario after the stack is healthy:

```sh
docker compose exec app node deploy/community/demo.mjs seed
docker compose exec app node deploy/community/demo.mjs status
```

Open the Cockpit and follow the seeded Project, Docman brief, Projectman task and implementation plan, prompt, skill, and durable decision memory. Fileman, Runner, hosted cloud, and public publishing are intentionally not part of this Community scenario.

The reset command deletes only records referenced by the demo-owned durable state record. It is safe to run repeatedly:

```sh
docker compose exec app node deploy/community/demo.mjs reset
docker compose exec app node deploy/community/demo.mjs seed
```

Run the self-hosted/local-trusted ChatV3 health flow separately. It creates a disposable channel, joins a second member through an invite, verifies room/message/presence, then deletes the channel without printing the invite:

```sh
docker compose exec app node deploy/community/chatv3-smoke.mjs
```

The candidate also contains an offline product-site and operator submission pack. Open `site/index.html` locally; review `site/application.md` and the timed, secret-safe `site/demo-script.md`. They are draft artifacts only. No site, repository, video, or application submission is published by this package.

`docker compose down` keeps the named PostgreSQL volume. To back up before maintenance:

```sh
docker compose exec -T postgres pg_dump -U aops -d aops > aops-community-backup.sql
```

Deleting all local data is intentionally explicit and destructive:

```sh
docker compose down --volumes
```

## Contributor build and source validation

The default Compose file is deliberately pull-only: it contains no build instruction and never needs private registry credentials or the private monorepo. Contributors can opt into a local image build only by adding the separate build overlay:

```sh
docker compose -f compose.yaml -f compose.build.yaml up --build -d --wait
```

Contributors can also validate the finalized source tree directly with the exact package manager version:

```sh
corepack enable
corepack install --global pnpm@11.9.0
pnpm install --frozen-lockfile
pnpm typecheck
pnpm build
```

This secondary path verifies all three applications but does not replace the Compose-managed PostgreSQL runtime.

## Supply-chain evidence

Node build/runtime and PostgreSQL base images are pinned by digest. Package installation uses pnpm 11.9.0 with the frozen lockfile. `SBOM.spdx.json` and `SHA256SUMS` cover the finalized release tree. Re-run the repository-owned Community finalizer to reproduce them; do not edit generated evidence by hand.

The release factory uses `docker-bake.hcl` with a fixed `SOURCE_DATE_EPOCH`, multi-platform deterministic output, and OCI timestamp rewriting. SBOM and provenance are generated as detached evidence so invocation metadata cannot destabilize the runtime index digest. `deploy/community/release.schema.json` is the fail-closed contract for the signed `release.json` that binds the public tree, OCI index and platform digests, CLI artifact, Compose file, migrations, detached SBOM, provenance, and signature.
