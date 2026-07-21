---
name: aops-working-disciplines
description: Use only when the operator asks to choose, compare, or apply an AOPS working discipline such as solo, review-oriented, consensus-first, or coordinator-led work.
---

# AOPS working disciplines

Disciplines are optional working methods. Setup installs this reference so an
agent can explain the choices, but neither setup nor gateway loading selects
one. Read the relevant discipline only—not the whole guide—in
`../../user-guides/working-disciplines.md`.

Transport and method are separate:

- mode: `solo`, `solo+async-review`, or `chat-room`;
- discipline: the working method below.

## Choose the smallest method

| Discipline | Use when | Core evidence |
| --- | --- | --- |
| `solo-pm-loop` | One agent can deliver the bounded work | PM status, focused validation, handoff |
| `build-review-chat` | Implementation benefits from an independent review | PM review-request/result; chat only wakes |
| `design-first-consensus` | A material design decision needs independent stances before build | Discuss conclusion linked to plan |
| `coordinator-loop` | Several delegated slices need explicit coordinator ownership | Mission policy, slice tasks/reviews, integration gate |

Do not choose a heavier discipline solely because multiple tools exist. The
operator owns agent count, identities, roles, and closeout authority.

## Compose startup

```bash
aops start --help
aops start --task "<task>" --mode solo \
  --discipline solo-pm-loop --json --out ./aops-start.md
aops start --task "<task>" --mode chat-room \
  --discipline build-review-chat --json --out ./aops-start.md
```

Inspect `result.mission.policyJson` and persist it only if a durable mission is
appropriate:

```bash
aops mission create --objective "<objective>" \
  --policy-json '@policy.json' --apply --json
```

## Shared guardrails

1. Put every implementation slice in Projectman before or at kickoff.
2. Read live help/schema instead of guessing flags or payloads.
3. Validate in proportion to risk and record only evidence actually produced.
4. Use hosted chat for coordination/wake, Discuss for consensus, and
   Projectman review-request/result for review truth.
5. Keep scope changes and blockers explicit; do not fabricate peer approval.
6. Ordinary stop writes status/handoff and keeps mission/board/room open.

## Discipline-specific minimums

- `solo-pm-loop`: orient → plan bounded slice → implement → validate → handoff.
- `build-review-chat`: implementer validates → creates PM review request →
  reviewer records result → material findings become issues/fix slices.
- `design-first-consensus`: independent research/turns → every participant
  records final stance → conclude → bind decision to implementation plan.
- `coordinator-loop`: coordinator assigns non-overlapping slices → each owner
  reports validation → independent review/integration gate → operator closeout.

Use `aops start --reminder --task "<task>" --area <area> --json` for a bounded
mid-session refresh instead of reloading the full discipline guide.
