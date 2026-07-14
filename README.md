# AOPS Community

Local, three-application AOPS distribution: Cockpit, CLI, and the AOPS server on PostgreSQL 17.

> Release status: Apache-2.0 source candidate. Public release remains gated on final reviewed attribution/SBOM/provenance and independent release validation.

## Requirements

- Docker Engine or Docker Desktop with Docker Compose
- At least 4 GB of free memory and 2 GB of free disk space
- Node.js 22.9 or newer

## Start

Clone the exact release tag, then run the release-local launcher from the clone.
The launcher never clones or downloads source, and it does not use npm, npx, pnpm,
or a package-manager cache. It verifies the exact bundled CLI before executing it.

macOS or Linux:

```sh
./aops server setup
```

Windows PowerShell:

```powershell
.\aops.ps1 server setup
```

Open <http://127.0.0.1:5900>. The same origin serves the production Cockpit and proxies the AOPS HTTP API. The PostgreSQL port is not published. The only published port is explicitly bound to host loopback.

Setup verifies the signed release graph, creates local secrets and managed state,
anonymously pulls the digest-pinned images, starts PostgreSQL and AOPS, and runs
health and data checks. Re-running setup preserves the existing installation.

## Verify and operate

```sh
curl --fail http://127.0.0.1:5900/api/health
./aops server status
./aops server logs --tail 100
```

Every app start verifies the exact five-domain migration lineage and applies only
the reviewed pending steps through one strict migration owner. Normal restarts
are idempotent and preserve data. An unknown, partially changed, or unreviewed
database shape is rejected instead of being guessed or silently rewritten.

```sh
./aops server restart
./aops server stop
./aops server start
```

## Upgrade and rollback

The normal upgrade entry point is the CLI; operators do not run raw database
migration commands. `server update` verifies the signed release, creates and
verifies a PostgreSQL backup, stops the current application, activates the new
digest-pinned release, and lets startup converge the reviewed schema changes.

```sh
./aops server update
./aops server status
```

If an upgrade must be reversed, the rollback flow is explicit because it also
rewinds the database to the verified pre-upgrade backup:

```sh
./aops server rollback --confirm-data-rewind
```

The first Community baseline recognizes only its named legacy and strict-v1
lineages. A later schema-changing release must publish a new reviewed migration
policy and recovery proof; adding an unreviewed SQL file intentionally blocks
the release factory.

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

## Project policies

Before contributing, read `CONTRIBUTING.md`, the `DCO.md` sign-off contract,
and `CODE_OF_CONDUCT.md`. Report suspected vulnerabilities through
`SECURITY.md`; do not place vulnerability details in a public issue. Name and
logo use is described in `TRADEMARKS.md` and does not change the Apache-2.0
license granted for the source code.
