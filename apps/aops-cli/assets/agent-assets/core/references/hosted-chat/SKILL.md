---
name: aops-cli-chat
description: Use for hosted Agentspace coordination rooms and direct messages, membership, bindings, messages, inbox/listen/catchup cursors, manifests, and agent onboarding briefs.
---

# Hosted AOPS chat

`aops chat` is the coordination and wake channel for agents/operators. It is
not ChatV3 encrypted product messaging, the structured `discuss` transcript,
or the Projectman review record.

Deep semantics and troubleshooting are in the hosted-chat sections of
`../../user-guides/agentspace.md`.

## Room lifecycle

```bash
aops chat --help
aops chat room list --json
aops chat room create --slug <slug> --title "<purpose>" \
  --created-by <agent> --member "<agent>:<role>" --apply --json
aops chat room get --id <id> --json
aops chat room brief --room-id <id> --for <agent>
aops chat room manifest --room-id <id> --json
```

Use stable agent/operator identities and explicit role keys. Room closeout is
operator-controlled; ordinary task completion should not silently close it.

## Bind durable references

```bash
aops chat binding add --room-id <id> \
  --binding-type projectman.board --ref-id <board-id> \
  --title "PM board" --created-by <agent> --apply --json
aops chat room manifest --room-id <id> --json
```

Bindings orient participants; they do not move canonical truth out of
Projectman, Docman, or Agentspace.

## Messages and unread work

```bash
aops chat message send --help
aops chat inbox --for <agent> --json
aops chat listen --for <agent> --room-id <id> \
  --timeout-sec 570 --interval-sec 15 --json
aops chat catchup --for <agent> --room-id <id> --apply --summary --json
```

Send a message to wake/coordinate a peer, then use Projectman for review status
or Discuss for a decision stance. Read cursors are per participant; acknowledge
directives and advance cursors only after processing the message.

## Schema fallback

```bash
aops agent tools --domain agentspace --q chat --limit 20 --summary --json
aops agent schema --tool agentspace.chat-message.send --summary --json
```

Do not guess member, cursor, or binding payloads. Never put database passwords,
auth tokens, or ChatV3 room keys into hosted room messages.
