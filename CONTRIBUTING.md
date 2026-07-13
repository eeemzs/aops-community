# Contributing to AOPS Community

Thank you for considering a contribution. AOPS Community is developed in public
under the Apache License 2.0. This guide explains how to propose a change and how
contributions are licensed.

## Community standards

Participation is governed by [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md). Security
reports follow [SECURITY.md](SECURITY.md), not the public issue workflow.

## Choose the right repository

- Changes to the Community CLI, server, Cockpit, domain sources, packaging, or
  documentation belong in `eeemzs/aops-community`.
- Changes to the public XF packages consumed by Community belong in
  `eeemzs/xf-packages`.
- Commercial modules, hosted services, and separately licensed products are not
  part of either Community repository. A contribution to Community does not grant
  access to, or create rights in, a separate commercial module.

Open an issue before a large or cross-cutting change so the scope can be agreed
before substantial work begins. Small fixes may go directly to a pull request.

## Local validation

AOPS Community uses Node.js 22.9 or newer and pnpm 11.9.0. From a clean clone:

```sh
corepack enable
corepack install --global pnpm@11.9.0
pnpm install --frozen-lockfile
pnpm typecheck
pnpm build
```

Docker is optional for source validation. Use the build overlay only when you
want to exercise the complete local stack:

```sh
docker compose -f compose.yaml -f compose.build.yaml up --build -d --wait
```

Do not hand-edit generated release evidence such as `SBOM.spdx.json`,
`SOURCE-COVERAGE.md`, `community-sources.lock.json`, or `SHA256SUMS`. Change the
source or generator and reproduce the evidence instead.

## Pull request expectations

Keep each pull request focused and explain:

- the problem and intended behavior;
- the important design or compatibility choices;
- the validation you ran;
- any documentation, migration, security, or attribution impact.

Do not commit credentials, tokens, private registry configuration, machine-local
paths, private source, or generated dependency directories. Preserve package
`LICENSE` and `NOTICE` files and update third-party attribution when dependency
content changes.

## Developer Certificate of Origin

AOPS Community uses the [Developer Certificate of Origin 1.1](DCO.md). Every
commit must contain a `Signed-off-by` trailer certifying that you have the right
to submit the contribution under the applicable project license.

Create a signed-off commit with:

```sh
git commit -s
```

The trailer must use a real name and an email address you control. Pull requests
with unsigned commits are not ready to merge.

## Copyright and licensing

You retain copyright in your contribution. By submitting it with the DCO
sign-off, you license it under Apache-2.0 unless the file clearly states a
different license. For example, the Contributor Covenant adaptation in
`CODE_OF_CONDUCT.md` remains under CC BY-SA 4.0.

No Contributor License Agreement is required for this version of the project.
The DCO is a certification of origin and permission, not a copyright assignment.
Project maintainers may decline, revise, or remove contributions as part of
normal project stewardship.

## Review

Maintainers review correctness, security, compatibility, test coverage,
documentation, licensing, and release reproducibility. A review may ask for
changes even when automated checks pass. Only maintainers merge pull requests.

