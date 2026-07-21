---
name: aops-cli-view
description: Use for read-only local-cache dashboards, board/task/sprint details, filtered lists, hosted inventory, and focused context digests through aops view.
---

# AOPS view

`aops view` reads local presentation caches and never mutates or synchronizes
them. Use it for orientation and bounded context; use owner commands (`pm`,
`mem`, `doc`, and others) for hosted writes.

## Fast paths

```bash
aops view dashboard --style agent
aops view boards
aops view tasks --board <slug> --status Doing
aops view sprints --board <slug> --status doing
aops view issues --status open --severity high
aops view feedback --status open
```

Focused inspection accepts a full UUID, an unambiguous 8+ character ID prefix,
a slug, or an exact title/name when supported:

```bash
aops view board <selector>
aops view task <selector>
aops view sprint <selector> --max-items 20
aops view memory --subject sprint --id <sprint-id>
aops view discussions --status open
```

## Context packs

```bash
aops view digest --task <task-id> --depth shallow
aops view digest --sprint <sprint-id> --depth deep --max-bytes 32768
aops view digest --board <board-slug> --depth deep
```

Use shallow first; request deep only when linked memory/discussions/details are
actually needed. Markdown is the human/agent default; add `--json` for stable
automation.

## Hosted inventory

```bash
aops view hosted-projects --style compact
aops view hosted-inventory --hosted-project <slug> --scope-resolution explicit
```

These are still read-only views. If output is stale, inspect `aops sync status
--json` and refresh intentionally with `aops sync pull --apply --json`.

For exact filters and output limits, run the relevant nested `--help`. Do not
edit generated view files, treat a view as canonical hosted state, or dump a
deep digest when a small selector read is enough.
