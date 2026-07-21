<!-- Public packaged guide derived from the mounted Community Sys catalog. Read only the relevant section; live schema wins on drift. -->

# Sys User Guide

Sys provides small infrastructure capabilities shared by Community domains:
tenant-scoped counters, country lookup, event persistence, and rate-limit
state. It is mounted on the AOPS gateway but intentionally has no separate
`aops sys` sugar tree.

## Discover the live contract

```bash
aops agent tools --domain sys --summary --json
aops agent tools --domain sys --q counter --limit 10 --examples --summary --json
aops agent schema --tool sys.counter.next --summary --json
```

Use `--examples` only when a small invocation shape is useful. If a compact
schema is opaque, inspect the full schema or tool detail; never guess inner
`body` fields after a validation error.

## Countries

```bash
aops agent invoke --tool sys.country.resolve-iso2 \
  --input '{"body":{"iso2Code":"TR"}}' --json
aops agent invoke --tool sys.country.search \
  --input '{"body":{}}' --json
```

Country records are shared reference data. Normalize ISO2 input to the shape
required by the live schema and prefer lookup over duplicating country truth
inside another domain.

## Counters

```bash
aops agent invoke --tool sys.counter.get \
  --input '{"body":{"counterKey":"inventory.item.code"}}' --json
aops agent invoke --tool sys.counter.preview-next \
  --input '{"body":{"counterKey":"inventory.item.code","prefix":"ITM","width":5}}' --json
```

`preview-next` does not allocate a value. `next` atomically allocates one and
requires a guarded write:

```bash
aops agent invoke --tool sys.counter.next \
  --input '@counter-next.json' --apply --json
```

Treat `counter.reset` as destructive. Read the live schema, inspect the current
counter first, and use an idempotency key when the invoke surface supports it.

## Event store

Read operations include `list`, `list-by-aggregate`, and `list-by-type`.
Publishing persists a domain event:

```bash
aops agent schema --tool sys.event-store.publish --summary --json
aops agent invoke --tool sys.event-store.publish \
  --input '@event.json' --preview --json
aops agent invoke --tool sys.event-store.publish \
  --input '@event.json' --apply --idempotency-key event-001 --json
```

Use the business domain as the semantic owner. Sys stores the event; it does
not invent aggregate or event-type conventions for another domain. Preview
cleanup and verify retention scope before applying it.

## Rate limiter

```bash
aops agent invoke --tool sys.rate-limiter.check \
  --input '{"body":{"key":"user:123","scope":"login"}}' --json
aops agent invoke --tool sys.rate-limiter.record-attempt \
  --input '@rate-attempt.json' --preview --json
```

`record-attempt`, `reset`, and `cleanup-expired` mutate database state. Inspect
the live contract and current stats before reset/cleanup. Do not put secrets or
raw authentication tokens into limiter keys.

## Safety and troubleshooting

1. Use `aops agent tools --domain sys --summary --json` to confirm the connected
   server actually exposes the operation.
2. Use `aops agent schema --tool sys.<operation> --summary --json` before every
   new raw payload.
3. Stop random retries after a validation error; compare against full schema or
   the operation detail.
4. Keep tenant/scope context explicit when the server requires it.
5. Preview writes when supported, apply once, then read back the result.
