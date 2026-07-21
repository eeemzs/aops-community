# AOPS Community Development Rules

These rules apply to the public `aops-community` repository.

## Canonical ownership

- This repository is the sole canonical source for AOPS Community development and releases.
- Do not project, reconcile, or copy routine development from a private AOPS repository.
- Treat any former private repository as historical archive material only.

## Safe Git workflow

- Start work from the current public `origin/main` commit in a clean worktree.
- Develop on short-lived local `codex/` branches or local worktrees. These are machine-local implementation surfaces and must not be pushed to the public repository.
- Publish source only through a small, understandable commit on local `main`, then push `main` directly. Public tags and release assets may follow only after validation and separate operator approval.
- Do not expose local branch names, intermediate commit history, worktree layout, or development-only review surfaces in the public repository. A public pull request is exceptional and requires an explicit operator request.
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
- Existing PostgreSQL is operator-owned and may be local, remote, managed, or started from the documented manual container recipe. Setup path 2 is the explicit AOPS-managed PostgreSQL exception.
- Git clone remains a supported secondary development/install path.
- The optional AOPS application image is assembled only from exact public npm CLI/server releases. Image Dockerfiles, build/push scripts, registry composition, and architecture-manifest automation live in private `aops-dist`; routine Community source/npm work must not trigger Docker, GHCR, QEMU, or private-source projection.
- Community owns the thin container-runtime capability used by that image: the existing npm server lifecycle may expose its hardened container edge, while Docker remains a distribution wrapper rather than a second application build system.
- The CLI may manage AOPS setup and server lifecycle. Setup path 2 may create or remove only the selected instance's namespaced PostgreSQL container/volume, and destructive reset must verify exact instance/root/secret ownership labels plus explicit data-loss and instance confirmations. Manually created or unrelated Docker resources remain operator-owned.
- `apps/aops-cli/assets/agent-assets/core` owns only the public offline client skill/reference/user-guide closure. Hosted Docman architecture groups are development truth and must never be copied into the npm agent-asset payload.

## Complete setup experience

- A successful default `aops setup init` is an immediately usable AOPS installation, not only a running server.
- For local server paths, setup must configure the selected PostgreSQL ownership model, plan/apply/verify all AOPS migrations, start and health-check the npm server, reconcile the signed official catalog, install or repair the verified global AOPS core for every registered agent runtime, and create the small starter project/user-guide dataset.
- The verified global core includes the neutral AOPS router, concise domain references, and user guides. Signed official catalog packages include optional collaboration and working-discipline skills; setup makes them available and discoverable without silently choosing or activating a working discipline for the user.
- Default interactive setup installs or repairs required agent assets automatically after its primary setup choices. Do not add a second asset-selection or confirmation prompt. Explicit `--agent-assets status` and `--agent-assets skip` remain advanced opt-outs.
- `--no-catalog`, `--no-seed`, and asset opt-outs are explicit advanced choices; they are never the default first-run experience.
- Asset ownership conflicts, unsafe paths, invalid signatures, and unknown user files fail closed. Setup must never overwrite or remove user-owned runtime files to appear successful.
- Setup success requires final readback of migrations, server health, global core integrity, registered-runtime bindings, official catalog reconciliation, and Cockpit reachability. Preserve exact safe next actions when any part remains incomplete.

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
