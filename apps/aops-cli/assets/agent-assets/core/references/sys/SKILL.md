---
name: aops-cli-sys
description: Use for live Sys capabilities including counters, shared country lookup, event-store operations, and rate-limit state through schema-first AOPS agent tools.
---

# Sys

Sys is a mounted Community domain but has no dedicated sugar family. Start
with compact live discovery and use raw invoke only after reading its schema.
Detailed examples are in `../../user-guides/sys.md`.

```bash
aops agent tools --domain sys --summary --json
aops agent tools --domain sys --q country --limit 10 --examples --summary --json
aops agent schema --tool sys.country.resolve-iso2 --summary --json
```

The current capability families are:

- `sys.counter.*` — tenant-scoped formatted counters;
- `sys.country.*` — shared ISO country lookup/search;
- `sys.event-store.*` — append/read/cleanup domain events;
- `sys.rate-limiter.*` — check, record, reset, inspect, and cleanup limits.

Reads can be invoked without `--apply`. Database mutations require `--apply`;
cleanup/reset operations should be previewed and treated as destructive even
when the live contract does not require a separate `--confirm` flag.

```bash
aops agent invoke --tool sys.country.resolve-iso2 --input '{"body":{"iso2Code":"TR"}}' --json
aops agent invoke --tool sys.counter.preview-next --input '{"body":{"counterKey":"inventory.item.code","prefix":"ITM","width":5}}' --json
aops agent invoke --tool sys.counter.next --input '@counter-next.json' --preview --json
```

Examples are illustrative. The connected server's `agent schema` and tool
detail are authoritative for required fields, tenant context, and guard flags.
