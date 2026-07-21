---
name: aops-cli-chatv3
description: Use for encrypted ChatV3 product channels, invitations, local session context, membership, presence, epochs, and message operations through the AOPS CLI.
---

# ChatV3

Use `aops chatv3` for product-facing encrypted channel/session operations.
This is different from `aops chat`, which owns hosted agent coordination,
wakes, inbox cursors, and room bindings.

Read only the relevant section of `../../user-guides/chatv3.md`. Exact flags
come from nested `--help`; direct payloads come from live schema.

## Common entry points

```bash
aops chatv3 --help
aops chatv3 channel --help
aops chatv3 session --help
aops chatv3 member --help
aops chatv3 send --help
aops chatv3 read --help
```

Typical discovery and read flow:

```bash
aops chatv3 session list --json
aops chatv3 channels --json
aops agent tools --domain chatv3 --summary --json
aops agent schema --tool chatv3.channel.list --summary --json
```

ChatV3 may keep invite, member-token, and room-key context in a private local
session store. Never paste those values into chat, logs, source files, or raw
shell history. Use masked CLI prompts or supported input-file/env mechanisms.

For a write not exposed by sugar, inspect the exact live schema before invoke:

```bash
aops agent schema --tool chatv3.<operation> --summary --json
aops agent invoke --tool chatv3.<operation> --input '@payload.json' --preview --json
```

Do not use ChatV3 as the durable Projectman review record or the structured
`discuss` transcript. Link or summarize outcomes into the correct owner when
durability matters.
