import 'dotenv/config'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  activityItemTable,
  agentProfileTable,
  agentRunEventTable,
  agentRunTable,
  agentSessionTable,
  artifactLinkTable,
  artifactTable,
  chatMessageTable,
  chatRoomBindingTable,
  chatRoomMemberTable,
  chatRoomTable,
  codexChatMessageTable,
  codexChatSettingTable,
  codexChatThreadTable,
  discussionOutputTable,
  discussionTopicTable,
  discussionTurnTable,
  experienceItemTable,
  memoryItemTable,
  missionTable,
  projectMemberTable,
  projectPathTable,
  projectTable,
  promptTable,
  promptVersionTable,
  resourceTable,
  scopeTable,
  skillTable,
  skillVersionTable,
  tagTable,
  workflowDefinitionTable,
  workflowInstanceTable,
  workflowStepRunTable,
} from '@aopslab/domain-dm-agentspace'

// Drizzle Kit's `generate` command serializes every table exported by each
// schema module; `tablesFilter` is a database push/introspection filter. Export
// only the exact domain-owned Community set so generation cannot widen to a
// newly exported table without an explicit config review.
export {
  activityItemTable,
  agentProfileTable,
  agentRunEventTable,
  agentRunTable,
  agentSessionTable,
  artifactLinkTable,
  artifactTable,
  chatMessageTable,
  chatRoomBindingTable,
  chatRoomMemberTable,
  chatRoomTable,
  codexChatMessageTable,
  codexChatSettingTable,
  codexChatThreadTable,
  discussionOutputTable,
  discussionTopicTable,
  discussionTurnTable,
  experienceItemTable,
  memoryItemTable,
  missionTable,
  projectMemberTable,
  projectPathTable,
  projectTable,
  promptTable,
  promptVersionTable,
  resourceTable,
  scopeTable,
  skillTable,
  skillVersionTable,
  tagTable,
  workflowDefinitionTable,
  workflowInstanceTable,
  workflowStepRunTable,
}

const CONFIG_DIR = path.dirname(fileURLToPath(import.meta.url))
const resolveFromCwd = (...segments: string[]) => {
  const absolute = path.join(CONFIG_DIR, ...segments)
  const relative = path.relative(process.cwd(), absolute).split(path.sep).join('/')
  return relative.startsWith('.') ? relative : `./${relative}`
}

// The Community capability closure includes the canonical Agentspace migration
// set plus the Agent Profile and Discuss tables exported by the current DM.
// Tasker and AuthV2 tables are not part of this projection.
const agentspaceCommunityTables = [
  'activity-items',
  'agent-profiles',
  'agent-run-events',
  'agent-runs',
  'agent-sessions',
  'artifact-links',
  'artifacts',
  'chat-messages',
  'chat-room-bindings',
  'chat-room-members',
  'chat-rooms',
  'codex-chat-messages',
  'codex-chat-settings',
  'codex-chat-threads',
  'discussion-outputs',
  'discussion-topics',
  'discussion-turns',
  'experience-items',
  'memory-items',
  'missions',
  'project-members',
  'project-paths',
  'projects',
  'prompt-versions',
  'prompts',
  'resources',
  'scopes',
  'skill-versions',
  'skills',
  'tags',
  'workflow-definitions',
  'workflow-instances',
  'workflow-step-runs',
]

export default {
  out: resolveFromCwd('drizzle-out/agentspace-community'),
  schema: [resolveFromCwd('drizzle.agentspace-community.config.ts')],
  tablesFilter: agentspaceCommunityTables,
  dialect: 'postgresql',
  casing: 'camelCase',
  dbCredentials: {
    url:
      process.env.AGENTSPACE_REPO_URL ||
      process.env.AGENTSPACE_PG_URL ||
      process.env.AOPS_REPO_URL ||
      process.env.AOPS_PG_URL ||
      process.env.DEV_PG_URL ||
      process.env.POSTGRES_URL_LOCAL ||
      process.env.POSTGRES_URL ||
      process.env.DATABASE_URL ||
      'postgresql://postgres:postgres@localhost:5432/aops-community',
  },
}
