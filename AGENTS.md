# AOPS Community Development Rules

These rules apply to the public `aops-community` repository.

## Canonical ownership

- This repository is the sole canonical source for AOPS Community development and releases.
- Do not project, reconcile, or copy routine development from a private AOPS repository.
- Treat any former private repository as historical archive material only.

## Safe Git workflow

- Start work from the current public `origin/main` commit in a clean worktree.
- Develop on short-lived local `codex/` branches. Do not push development history unless the operator explicitly approves it.
- Prepare a small, understandable public candidate commit after validation; pushing, opening a pull request, tagging, and releasing are separate operator-approved actions.
- Never overwrite or clean an unrelated dirty checkout. Preserve user-owned changes and use a separate worktree.

## Public repository safety

- Keep every tracked file safe for a public repository.
- Never commit credentials, tokens, private URLs, private operational details, machine-specific absolute paths, or user-local runtime state.
- Keep secrets and PostgreSQL connection details in user-owned environment/config locations outside the repository.
- Inspect package contents and the scoped diff for private or machine-local data before preparing a public candidate.

## Distribution direction

- The promoted installation path is the public npm CLI plus the public npm server package.
- Domain source is owned by its independent public repository. Consume released domain packages from npm; do not restore copied domain workspaces as the normal dependency path.
- Each domain repository owns its GitHub Release to npm automation through npm Trusted Publishing/OIDC. Do not add a central domain-package publish workflow to this repository or rely on a long-lived npm token here.
- The server package must include the production server runtime, PostgreSQL migrations/bootstrap assets, Cockpit production assets, and every required runtime child/resource.
- PostgreSQL is operator-owned and may be local, remote, managed, or started separately from a documented PostgreSQL-only container recipe.
- Git clone remains a supported secondary development/install path.
- AOPS application Docker image automation is deferred. npm work must not trigger Docker, GHCR, QEMU, or private-source projection.
- The CLI may manage AOPS setup and server lifecycle, but it does not own the user's Docker lifecycle in the npm-first path.

## Package and release gates

- Build npm candidates from one exact public `aops-community` commit or tag.
- Treat the CLI and server as one compatible package closure; coordinate versions when their lifecycle contract changes.
- Use `npm pack` tarballs and their integrity values as the publish candidates. A GitHub Release archive is not a prerequisite for npm publication.
- Stop at `publish-ready` unless the operator separately approves an npm registry mutation.
- After an approved publish, verify registry metadata and perform a clean install/readback smoke from the public registry.
- Do not run `npm publish`, push, create a release/tag, publish an image, or mutate GHCR without explicit operator approval.

## Validation discipline

- Prefer targeted builds, typechecks, package-content checks, and clean-install smokes for the changed surface.
- For the npm-first server path, prove CLI version/help, PostgreSQL migration/bootstrap, server start/status/health, Cockpit root/static assets, and CLI local/remote connectivity.
- Report only validation actually run in the current worktree.
