---
name: aops-docman
description: Neutral AOPS Docman capability map for versioned documents, groups, sections, links, publication, mirrors, search, and grounded answers.
---

# Docman

Docman owns the versioned document graph. Its capabilities include document
groups, documents and versions, hierarchical sections, document/section links,
publication/current-version selection, mirror projection, indexed search, and
grounded answer retrieval.

Document authoring, publication, linking, and retrieval are separate
capabilities. This reference does not prescribe a documentation process.

## Exact mechanics

```text
aops doc --help
aops doc <family> --help
aops agent tools --domain docman --summary --json
aops agent schema --tool docman.<operation> --summary
```

CLI help owns sugar flags. The live Docman schema owns direct invoke payloads.
For an existing graph, read identifiers before mutation and preserve version
and current-publication boundaries exposed by the selected command.
