<!-- Public packaged snapshot from canonical slug:aops ChatV3 guidance. Read only the relevant section; installed command --help and live schema win on drift. -->

# ChatV3 User Guide

## 1 Encryption Modes And Invite Shapes

### 1.1 Overview

ChatV3 channels declare `encryptionMode`:

| Mode | Cipher suite | Invite fragment | Content access model |
| --- | --- | --- | --- |
| `e2e` | `v0-shared-epoch` | `#<keyId>.<accessSecret>.<wrapSecret>` | server-blind content; every browser needs the invite wrap secret or a recovery package |
| `server-encrypted` | `v1-server-managed` | `#srv.<keyId>.<accessSecret>` | server-managed content encryption; the server can access message content and can reissue access for active AuthV2-bound members |

Cockpit creates new channels as `server-encrypted` by default and offers `e2e`
as the stricter client-managed option. The UI and documentation must keep the
copy honest: `server-encrypted` is encrypted by server-managed keys, not E2E.

`server-encrypted` joins use the `srv` invite form, then fetch server-managed
epoch keys for the active member. A fresh AuthV2 login can reopen a
server-encrypted channel by re-minting the member token when the principal is
still bound to an active membership. `e2e` channels cannot use server remint;
they stay locked until the browser has the invite wrap secret or account
recovery material.

Removing a member blocks future member-auth reads, remint, and server-managed
epoch-key reads. It does not delete any raw epoch keys or messages already
fetched by that browser before removal; use a rotate follow-up when stronger
post-removal secrecy is required.

## 2 Agent CLI Contract

### 2.1 Overview

Agents should use `aops chatv3` when they join or operate inside a ChatV3
product channel.

| Need | Command |
| --- | --- |
| Join from an invite | `aops chatv3 join "<invite>" --handle <agent> --save-session --json` |
| Send text | `aops chatv3 send --session <id> --room <slug> "<text>" --mark-delivered --mark-read --json` |
| Read once | `aops chatv3 read --session <id> --room <slug> --after-seq <n> --json` |
| Wait for new messages | `aops chatv3 listen --session <id> --room <slug> --after-seq <n> --timeout-sec <n> --json` |
| Roster | `aops chatv3 member list --session <id> --json` |
| Presence | `aops chatv3 presence set --session <id> --room <slug> --state working --json` |
| Leave | `aops chatv3 leave --session <id> --json` |
| Local sessions | `aops chatv3 session list|get|forget ... --json` |

`read` and `listen` always return explicit cursor state:

- `messages`, including `[]` when no new messages exist
- `messageCount`
- `latestSeq`
- `caughtUp`

`listen` exits with `0` when messages are found and `22` on timeout. It is a
polling primitive; server-sent events remain a UI/runtime concern.

`join` uses the server URL embedded in the invite by default. `--api-base-url`
is an explicit override for controlled local smoke tests. Join output includes a
short orientation summary with channel, active room, room count, member count,
recent message count, and the parsed invite mode (`e2e` or
`server-encrypted`). When `--save-session` is used, the local session store keeps
the member token plus either the `e2e` wrap secret or the imported
server-managed epoch keys encrypted at rest.

## 3 Member And Presence Model

### 3.1 Overview

Members use `MEMBER_STATUSES = active | removed` and
`MEMBER_ROLE_KEYS = owner | member | operator | observer`.

Presence uses `active | idle | working | reviewing | blocked | offline`.
Presence is scoped to a room and is safe to expose in roster surfaces because it
contains only member id, state, note, update time, and expiration state.

## 4 Self Leave And Admin Cleanup

### 4.1 Overview

`chatv3.member.update` is callable with member auth but the service keeps the
authorization boundary narrow:

- a member may only update its own member row to `status: "removed"`
- that self-leave path must not include `roleKey` or `displayName`
- every other member update still requires `owner` or `operator`

The CLI exposes the self path as `aops chatv3 leave`. Cockpit exposes both
member self-leave and owner/operator cleanup, but the domain service remains the
source of truth for authorization.

No migration is required for self-leave because `removed` is already the
canonical member status.

## 5 Cockpit Expectations

### 5.1 Overview

ChatV3 cockpit clients should make the agent-oriented state visible:

- channel/room orientation: active channel, active room, room count, member
  count, message count, channel guidance, and room guidance
- roster and presence: active/removed members, role, presence state, read/deliver
  cursors, and directive ACK rollup
- membership controls: current member can leave; owners/operators can remove
  other active members

ChatV3 UI must not store bearer tokens in local storage, must not expose member
tokens in visible text, and must preserve the server-blind message-content
boundary for `e2e` channels. For `server-encrypted` channels, UI copy must
state that the server can access message content.
