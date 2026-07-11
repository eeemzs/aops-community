# AOPS Community — 4 minute 30 second demo script

Status: recording-ready script and shot list. The product site and runtime remain local; no public upload is authorized.

## Recording contract

- Target length: 4:15–4:45.
- Viewport: 1512×814 for the main recording; include one 390×844 responsive insert.
- Do not show `.env`, invites, member tokens, session-store paths, database URLs, or unrelated private project data.
- Use only the disposable Community candidate and the deterministic demo slug `aops-community-five-minute-demo`.
- Keep the host URL visibly on `http://127.0.0.1:5900` when the address bar is shown.
- End with reset and an empty-state proof. Do not imply public availability or a decided license.

## Timeline and narration

### 0:00–0:25 — The problem

**Shot:** product site hero, then the workflow cards.

**Narration:** “Coding agents can generate an answer quickly, but the work around that answer fragments: intent in chat, plans in tickets, architecture in documents, and decisions in someone’s memory. AOPS Community keeps those pieces in one local, inspectable operating loop.”

### 0:25–0:50 — The boundary

**Shot:** architecture and responsible-boundary sections of the product site.

**Narration:** “This is the intentionally small Community boundary: one loopback host, five allowlisted domains, and a private PostgreSQL service. It is a single-operator, trusted-machine product—not an Internet-facing or multi-tenant service.”

### 0:50–1:15 — Start and seed

**Shot:** terminal with only the following safe commands and their status lines.

```sh
node deploy/community/init-env.mjs
docker compose up --build -d --wait
docker compose exec app node deploy/community/demo.mjs seed
```

**Narration:** “The Compose-first path creates independent local secrets, runs idempotent domain migrations, builds with pnpm 11.9.0, and seeds one deterministic scenario. No hosted account or access token is required.”

### 1:15–1:45 — Project and plan

**Shot:** Cockpit Projects overview, then Projectman board and task card.

**Narration:** “The project is the durable scope anchor. Projectman holds a real board, delivery task, and implementation plan. The plan says what we are building, why, and what evidence makes it done.”

### 1:45–2:10 — Versioned brief

**Shot:** Docman navigator, document version, Product brief, Five-minute scenario page.

**Narration:** “The same project owns a versioned Docman graph. This is not a blob attached to a chat; sections and pages remain addressable, searchable, and linked to execution.”

### 2:10–2:40 — Reuse and memory

**Shot:** Agentspace Prompt, Skill, then Memory.

**Narration:** “A successful status prompt and verification skill become reusable assets. The key product boundary is retained as durable memory, so the next session can resume with the decision instead of reconstructing it.”

### 2:40–3:15 — Local coordination

**Shot:** terminal runs the ChatV3 smoke; show only the redacted result object.

```sh
docker compose exec app node deploy/community/chatv3-smoke.mjs
```

**Narration:** “Self-hosted ChatV3 creates a disposable server-encrypted channel and room, joins a second member through a private invite, sends a message, reports presence, and deletes the channel. The invite is never printed, and the temporary session store is removed.”

### 3:15–3:40 — Responsive operator surface

**Shot:** 390×844 insert of the Cockpit; open the Agentspace selector and a record card.

**Narration:** “The Cockpit keeps the same project context on a narrow screen. Navigation becomes a drawer, records remain readable, and the page has no horizontal overflow.”

### 3:40–4:05 — Persistence and evidence

**Shot:** restart status, then product site proof strip.

```sh
docker compose restart app
docker compose exec app node deploy/community/demo.mjs status
```

**Narration:** “The records survive application restart. The release is built from a deterministic projection: 137 Community checks, 271 raw files, and a 274-file evidence tree independently reproduced during review.”

### 4:05–4:30 — Safe reset and honest close

**Shot:** reset command, empty status, then product-site publication notice.

```sh
docker compose exec app node deploy/community/demo.mjs reset
docker compose exec app node deploy/community/demo.mjs status
```

**Narration:** “Reset removes only IDs owned by the demo state and verifies the project is absent. The technical candidate works, but public release is deliberately not claimed: licensing and NOTICE policy remain an explicit operator decision.”

## Capture checklist

- [ ] Clean candidate and empty PostgreSQL volume at the start.
- [ ] Browser console shows zero errors and warnings.
- [ ] Project overview shows Planning 3, Docs 1, Memory 1.
- [ ] Board, task, sprint, document page, prompt, skill, and durable memory are visible.
- [ ] ChatV3 result shows two members, message sequence 1, presence `working`, and server-encrypted local-trusted mode.
- [ ] Active disposable ChatV3 channel count is zero after smoke.
- [ ] Responsive insert reports document scroll width 390 at viewport width 390.
- [ ] Final reset reports `community-demo-reset-clean`; status reports `community-demo-empty`.
- [ ] No secret, private repository path, or unrelated record appears in frame.
