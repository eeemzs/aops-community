---
name: aops-cli-docman
description: Use for Docman document groups, documents, versions, sections/pages, search, answer, publish, mirrors, markdown import, and schema-first payloads through AOPS.
---

# Docman

Docman owns the versioned document graph and retrieval/publishing surfaces.
Read the matching section of `../../user-guides/docman.md` for the complete
model; use nested help for current flags.

## Discover and read

```bash
aops doc --help
aops doc group list --project-slug <slug> --json
aops doc list --project-slug <slug> --json
aops doc outline get --document-version-id <id> --titles-only --depth 0 --json
aops doc search --document-version-id <id> --q "<query>" --json
aops doc answer --help
```

Prefer IDs from list/get output. Search is retrieval, not necessarily the full
page body. Use outline for structure and the supported page/version read
surface for exact content.

## Author and version

```bash
aops doc group create --help
aops doc create --help
aops doc version create --help
aops doc section create --help
aops doc page create --help
aops doc page draft-save --help
```

Create graph nodes through CRUD commands when IDs are known. Use markdown
import for intentional bulk import, not for a one-page edit. Every mutation is
preview/apply guarded where supported; read back the current version after
publishing.

## Search, answer, publish, and mirrors

```bash
aops doc scope search --project-slug <slug> --q "<query>" --json
aops doc publish --help
aops doc mirror pull --project-slug <slug> --group-uid <group> --out-dir <dir> --apply --json
```

Mirrors are read-only projections. Change the hosted document, publish/set the
current version as required, then refresh the mirror. `aops sync pull` does not
replace Docman mirror pull.

## Raw fallback

```bash
aops agent tools --domain docman --q document --limit 20 --summary --json
aops agent schema --tool docman.<operation> --summary --json
aops agent invoke --tool docman.<operation> --input '@payload.json' --preview --json
```

If sugar reports a validation error, stop varying flags blindly. Compare the
live operation schema/OpenAPI with the wrapper payload, then use raw invoke only
with an exact reviewed payload.

Docman owns document semantics; external storage owns binary file bytes and
recovery, Projectman owns execution status, and Agentspace owns durable agent
memory/reusable assets.
