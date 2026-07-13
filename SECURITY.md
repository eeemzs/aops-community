# Security Policy

## Supported versions

Only the latest published AOPS Community release receives security fixes.
Unreleased branches and release candidates are for testing, and older releases
are not supported. Before the first public release, no production-supported
version exists.

| Version | Security support |
| --- | --- |
| Latest published release | Supported |
| Older releases | Not supported |
| Unreleased branches and candidates | Testing only |

## Report a vulnerability privately

Do not disclose vulnerability details in a public issue, discussion, pull
request, chat room, or social-media post.

If the repository's Security page shows **Report a vulnerability**, use that
private GitHub form. If private vulnerability reporting is not available, open a
minimal public issue in `eeemzs/aops-community` titled `Private security contact
requested`. Include only:

- your GitHub handle;
- the affected component at a high level;
- whether you believe active exploitation is occurring.

Do not include reproduction steps, logs, payloads, secrets, or impact details in
that issue. A maintainer will create a private draft GitHub Security Advisory,
invite your GitHub account, and continue the report there. If that private space
has not been established, do not disclose further details.

Once a private channel exists, include the affected version, impact, minimal
reproduction, relevant configuration, and any suggested remediation. Never send
real credentials or personal data; use redacted or synthetic examples.

## What happens next

Maintainers will validate the report, determine affected versions, coordinate a
fix and release when appropriate, and agree on disclosure timing with the
reporter. A report may be redirected to an upstream project when the defect is
outside AOPS Community. Public disclosure should wait until users have a
reasonable remediation path.

This policy covers the Community CLI, server, Cockpit, public domain sources,
packaging, installers, release evidence, and official container definitions.
Operational support requests and general bugs belong in the normal issue
tracker.

