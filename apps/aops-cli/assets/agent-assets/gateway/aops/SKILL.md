---
name: aops
description: Use the installed AOPS Community gateway to discover and operate AOPS capabilities without assuming a working discipline.
---

# AOPS Community gateway

When the task needs AOPS, run this bounded resolver first:

`aops-cli assets resolve --gateway aops --json`

Read the verified `entryPath` returned by that command and follow only the task-relevant references from it. Do not preload unrelated assets or choose a working discipline for the operator.

If resolution fails, inspect the local client with `aops-cli assets status --verify quick --json`. Use `aops-cli assets --help` for lifecycle commands.
