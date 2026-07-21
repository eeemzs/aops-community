---
name: aops-fileman
description: Neutral AOPS Fileman capability map for tracked targets, snapshots, lineage, diffs, restore, copy, archives, and managed cleanup.
---

# Fileman

Fileman owns hosted file-target and snapshot lineage. Its capabilities include
target registration, snapshots and file versions, comparisons, restore, copy,
zip/export, and managed cleanup.

Hosted records may reference content without making an arbitrary server path a
portable client package. Runtime files and agent-assets use their own ownership
and safe-publication contracts.

## Exact mechanics

```text
aops file --help
aops file <family> --help
aops agent tools --domain fileman --summary --json
aops agent schema --tool fileman.<operation> --summary
```

CLI help owns sugar flags. Live schema owns raw payload fields. Restore and
cleanup can change files; the command help exposes the relevant guards and
target identity requirements.
