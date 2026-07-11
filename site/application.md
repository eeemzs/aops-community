# AOPS Community — Build Week application package

Status: operator-ready draft, not submitted or published.

## One-line pitch

AOPS Community is a self-hosted, local-first operations spine that keeps AI-assisted work coherent across projects, implementation plans, versioned documents, reusable prompts and skills, durable memory, and team coordination.

## The problem

Coding agents are good at producing a local answer, but the work around that answer fragments quickly: intent lives in chat, execution state lives in an issue tracker, architecture notes drift into documents, successful prompts are lost, and the next agent begins without the decisions that shaped the previous session.

AOPS turns those disconnected traces into one inspectable operating loop. The product does not try to replace every tool. It gives agent-assisted teams a durable control plane for what the work is, why it matters, what is being executed, what was decided, and what should be reused.

## Who it is for

- developers and small technical teams already working with coding agents;
- operators who want local ownership of project and agent context;
- teams that need plans, documents, reusable agent assets, and decisions to stay linked; and
- builders who value explicit system boundaries over opaque automation.

## The five-minute workflow

1. Create a project as the durable scope anchor.
2. Capture a product brief in Docman as a versioned document graph.
3. Create a Projectman board, task, and implementation plan with done-when evidence.
4. Publish a reusable prompt and skill in Agentspace.
5. Write the key boundary as durable project memory.
6. Prove local ChatV3 coordination with a private invite, two members, a message, and presence.
7. Restart to prove persistence, then reset only demo-owned records and verify the project is absent.

## What works today

| Area | Working evidence |
| --- | --- |
| Installation | Compose-first, token-free local startup with pinned Node/PostgreSQL images and exact pnpm 11.9.0 build |
| Runtime | Exact five-domain allowlist: sys, Agentspace, Docman, Projectman, ChatV3 |
| Product flow | Project → brief → task/plan → prompt/skill → durable memory |
| Coordination | Server-encrypted local ChatV3 channel/room/invite/message/presence flow with cleanup |
| Persistence | Clean PostgreSQL volume survives application restart and reruns migrations idempotently |
| UI | Responsive Cockpit; Project counts Planning=3, Docs=1, Memory=1 in the seeded scenario |
| Supply chain | Deterministic 271-file raw tree and 274-file evidence tree; full Community suite 137/137 |
| Review | G0–G3 independently approved through Projectman review requests and immutable results |

## Responsible implementation

- The host publishes one edge bound explicitly to `127.0.0.1`; PostgreSQL has no host-published port.
- `trusted-local` is documented as a single-operator machine boundary, not anonymous or multi-user authentication.
- Included capabilities come from a fail-closed allowlist. Excluded AuthV2/RBAC, Fileman, and Tasker/Runner surfaces are absent from routes, tools, CLI, UI, source closure, and runtime dependencies.
- ChatV3 is described accurately as server-encrypted in the acceptance flow; the submission does not claim end-to-end encryption for every channel mode.
- Invite and session secrets are redacted, the local store is removed after smoke, and ChatV3 uses a create-once secret independent from the PostgreSQL password.
- Public Internet exposure, hosted security claims, security certification, and public-release readiness are explicit non-claims.

## Why this is a practical product

The demo is not a mocked landing page. A clean packaged candidate creates real records through the same agent gateway and domain operations used by the CLI and Cockpit. The browser reads those records back from PostgreSQL. The reset uses only record IDs owned by the seeded state and verifies the project is gone before reporting success.

## Why Build Week matters

Build Week creates a useful forcing function: compress a broad internal platform into a bounded product that another developer can install, inspect, and understand. The work produced a smaller capability profile, a deterministic distribution pipeline, an honest security model, a Compose-first runtime, and an end-to-end product story.

## Continuation plan

1. Improve first-run onboarding, backup/restore guidance, and failure recovery inside the existing local boundary.
2. Resolve the operator-owned license and NOTICE decision, rerun the legal gate, and publish only after explicit authorization.
3. Collect Community feedback without silently expanding the allowlist.
4. Treat hosted collaboration as a separate product gate requiring cloud identity, recovery, abuse controls, and stronger chat guarantees.

## Demonstration and local review

- Product site: `site/index.html`
- Timed walkthrough and shot list: `site/demo-script.md`
- Runtime quickstart: repository `README.md`
- Security model: `docs/community/security-model-and-limitations.md` in the canonical source repository
- Technical review references: commits `855e1368` and `c77212df`; G3 review request `83d40aa4-7e06-40b4-8fc9-c6ca043ee014`

## Submission state

No public repository, deployed site, public video URL, or application submission is claimed by this draft. Those are external publication actions and require explicit operator authorization. LICENSE and NOTICE policy remains the open publication gate; technical work continues without guessing that decision.
