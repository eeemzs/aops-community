export type AgentsMdTemplateSeed = {
  slug: string
  title: string
  description: string
  mirrorPath: string
  promptRef: string
  tags: string[]
  snippet: string[]
}

export const AOPS_AGENTS_MD_TEMPLATE_SEEDS: AgentsMdTemplateSeed[] = [
  {
    slug: 'aops-collaborative-startup',
    title: 'AOPS Collaborative Startup',
    description:
      'Default solo-first session starter; boots the aops-collaborative-work skill (collaboration and chat are operator-opt-in).',
    mirrorPath: '.aops/hosted/prompts/aops-collaborative-startup.md',
    promptRef: 'prompt:aops-collaborative-startup',
    tags: ['default', 'starter', 'solo-first', 'coordination-optional'],
    snippet: [
      'Boot the aops-collaborative-work skill and pick the mode once at kickoff: solo (default) | solo+async-review | chat-room.',
      'Run the skill startup block with compact output; prefer aops-cli start --json --out <file> and follow result.promptRef.path instead of inline prompt JSON.',
      'Read layered rules only as needed: repo AGENTS.md / ChatV3 room rules, selected working-discipline guardrails, accepted playbook briefs, and ranked experience briefs.',
      'Use aops-cli mission resume --id <mission-id> --json or aops-cli start --resume <mission-id> --json when a mission exists; use aops-cli start --reminder --task "<current task>" --area <area> --json for mid-session refresh.',
      'Pull detail through the skill detail ladder (sub-skill section, command --help, aops-cli agent schema).',
      'Every task lands in PM before implementation; validate honestly; UI slices are verified live via Chrome MCP.',
      'Solo modes may leave async PM review requests for a future session; chat-room mode posts the PM review-request ref into the hosted room as a wake.',
      'Closeout (board/room) is operator-only; ordinary turn end writes status/handoff and keeps surfaces open.',
      'When the operator asks for the bootstrapper/starter prompt, paste the prompt mirror body verbatim.',
    ],
  },
  {
    slug: 'aops-task-execution-template',
    title: 'AOPS Task Execution Template',
    description: 'Operator-fillable, PM-backed generic execution checklist template.',
    mirrorPath: '.aops/hosted/prompts/aops-task-execution-template.md',
    promptRef: 'prompt:aops-task-execution-template',
    tags: ['pm', 'closeout', 'template'],
    snippet: [
      'Use AOPS PM for substantive work: inspect or create the board/task/sprint window before implementation.',
      'Build project context from AGENTS.md, repo memory, Projectman state, and relevant docs before changing files.',
      'Track meaningful work as sprint microtasks; promote review findings or blockers to PM issues.',
      'Validate, commit only scoped changes, then run the PM closeout sequence requested by the operator.',
      'Write a short memory closeout for durable decisions, follow-ups, and resume context.',
    ],
  },
  {
    slug: 'aops-cli-discuss',
    title: 'AOPS Discuss / Decision Protocol',
    description:
      'Standalone discuss decision/consensus discipline; coordination via aops-cli-chat, review via aops-cli-projectman; canonical mechanics in the aops-cli-discuss hosted skill.',
    mirrorPath: '.aops/hosted/skills/aops-cli-discuss.md',
    promptRef: 'skill:aops-cli-discuss',
    tags: ['discuss', 'decision', 'consensus'],
    snippet: [
      'Run a standalone discuss topic for material design decisions; give every peer enough independent context to research and form its own stance.',
      'Drive at least four substantive non-final turns, then each agent files a kind=final-stance turn before concluding.',
      'Confirm completeness from JSON (lifecycleState / missingTurnFinalStances), then conclude and finalize the outputs with no _TBD_ placeholders.',
      'Surface decisions explicitly: there is no auto bridge — carry the discussion-topic ref into a PM review-request/issue and ping the hosted chat room.',
      'Coordination/wake lives in aops-cli-chat; review + execution truth lives in aops-cli-projectman.',
      'Conclude only after final stances are recorded; session/board closeout stays operator-only.',
    ],
  },
]

export const DEFAULT_AGENTS_MD_TEMPLATE_SLUG = 'aops-collaborative-startup'
export const DISCUSS_AGENTS_MD_TEMPLATE_SLUG = 'aops-cli-discuss'
