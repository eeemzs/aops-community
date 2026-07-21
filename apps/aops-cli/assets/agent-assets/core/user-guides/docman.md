<!-- Public packaged snapshot from Docman domain user guide. Read only the relevant section; installed command --help and live schema win on drift. -->

# Docman User Guide

Docman keeps canonical written knowledge organized, searchable, versioned, and
available to both people and AI agents. Documents live on the hosted server
rather than being scattered across local files and chat sessions.

## Ownership

- Projectman owns current execution plans and task status.
- Agentspace owns durable working context and reusable agent assets.
- Docman owns canonical written knowledge and its version history.
- Operator-owned storage owns file bytes and recovery lineage.

References can connect these domains without duplicating their source of truth.

## Document Structure

Docman separates identity, versions, and composition:

```text
group -> document -> document version
                   -> section -> ordered page link -> page -> page version
```

Snippets, embeds, and assets can be linked into pages. This structure allows a
document to evolve without silently rewriting earlier published versions.

## Help-First Discovery

Use the installed CLI help because command flags and available operations may
change between versions:

```bash
aops doc --help
aops doc group --help
aops doc --help
aops doc version --help
aops doc section --help
aops doc page --help
aops doc search --help
aops doc answer --help
aops doc mirror --help
```

For raw hosted operations, inspect the schema first:

```bash
aops agent tools --domain docman
aops agent schema --tool docman.document.create
```

Do not infer raw payload fields from sugar CLI flags.

## Create and Organize Knowledge

The normal authoring flow is:

1. Create or select a document group.
2. Create the document identity and metadata.
3. Create an immutable document version.
4. Add sections for the intended reading structure.
5. Create pages and page versions.
6. Link pages to sections in explicit order.
7. Set current versions after the content is reviewed.

Read the relevant help before each write. Prefer small CRUD operations over a
large import when making targeted changes.

## Versioning

Versions are immutable snapshots of authored content. To revise content:

1. read the current version
2. create a new version with the intended change
3. validate the new content and links
4. set the new version as current

This preserves what readers and agents saw previously and makes publication
history auditable.

## Sections and Pages

Sections provide navigation and grouping. Pages hold readable content. Ordered
link records determine which pages appear in a section and in what order.

Do not assume that creating a page automatically places it in a document. The
page must be linked into the appropriate section. Likewise, a document version
does not implicitly replace page versions.

## Search and Answer

Docman indexes hosted content so agents can retrieve only the material relevant
to a task. Search returns matching sources. Answer operations produce a
deterministic response with evidence pointing back to canonical records.

When using a result:

- retain the source document/page/version identifiers
- reopen the exact version when accuracy matters
- distinguish retrieved evidence from an agent's inference
- avoid copying the answer into another canonical store without a reason

## Markdown Import

Markdown is useful for initial migration or a guarded baseline. It is not a
second long-term source of truth.

Before import:

- identify the target group and document
- confirm whether the import creates or revises content
- inspect baseline/version guards
- preview the resulting structure when supported

After import, author subsequent canonical changes through Docman and export or
refresh mirrors as projections.

## Publish and Export

Publication creates a readable projection of approved hosted content. Markdown
export makes documents portable for distribution or repository consumption.
Neither flow transfers canonical ownership away from Docman.

## Read-Only Mirrors

Repositories may keep a read-only mirror for local agent context:

```bash
aops doc mirror pull \
  --project-slug <project> \
  --group-uid <group> \
  --out-dir ./.aops/docman \
  --apply \
  --json
```

Mirrors must not be hand-edited and pushed back. Make the canonical change on
the hosted server, then pull the mirror again.

## Raw Invoke Fallback

If a sugar command fails because its wrapper no longer matches a strict hosted
schema, stop trying guessed flag combinations. Inspect the operation contract:

```bash
aops agent schema --tool docman.<operation-id>
aops agent invoke --tool docman.<operation-id> --input @input.json --apply
```

Use raw invocation only as a bounded workaround and record the sugar defect for
repair.

## Agent Guidance

- Retrieve the smallest relevant content set.
- Preserve source and version references in decisions and handoffs.
- Create a new version instead of mutating historical content.
- Keep execution status in Projectman and session context in Agentspace.
- Treat local mirrors as read-only projections.
- Validate links and current-version pointers before publishing.
