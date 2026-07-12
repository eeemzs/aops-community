import { z } from 'zod'

export const SCOPE_TYPES = ['project'] as const
export type ScopeType = (typeof SCOPE_TYPES)[number]
export const SCOPE_RESOLUTION_TYPES = ['explicit', 'cascade'] as const
export type ScopeResolution = (typeof SCOPE_RESOLUTION_TYPES)[number]

export const TAG_SCOPE_TYPES = ['prompt', 'skill', 'project', 'memory-item'] as const
export type TagScopeType = (typeof TAG_SCOPE_TYPES)[number]

export const RESOURCE_TYPES = ['document', 'rule', 'spec', 'link', 'reference', 'template', 'dataset', 'code', 'skill'] as const
export type ResourceType = (typeof RESOURCE_TYPES)[number]

export const PROJECT_MEMBER_ROLES = ['owner', 'editor', 'viewer'] as const
export type ProjectMemberRole = (typeof PROJECT_MEMBER_ROLES)[number]

export const KANBAN_STATUS_KEYS = ['backlog', 'ready', 'in_progress', 'review', 'qa', 'done', 'blocked'] as const
export type KanbanStatusKey = (typeof KANBAN_STATUS_KEYS)[number]

export const TASK_TYPES = ['epic', 'story', 'task', 'bug', 'chore', 'spike'] as const
export type TaskType = (typeof TASK_TYPES)[number]
export const TASK_LABEL_COLORS = ['gray', 'red', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink'] as const
export type TaskLabelColor = (typeof TASK_LABEL_COLORS)[number]
export const TASK_RELATION_KINDS = ['blocks', 'precedes', 'relates_to'] as const
export type TaskRelationKind = (typeof TASK_RELATION_KINDS)[number]

export const SPRINT_STATUSES = ['draft', 'active', 'completed', 'superseded', 'blocked'] as const
export type SprintStatus = (typeof SPRINT_STATUSES)[number]

export const SPRINT_ITEM_STATUSES = ['draft', 'active', 'completed', 'pending', 'blocked'] as const
export type SprintItemStatus = (typeof SPRINT_ITEM_STATUSES)[number]

export const PROMPT_STATUSES = ['draft', 'published', 'archived'] as const
export type PromptStatus = (typeof PROMPT_STATUSES)[number]

export const PROMPT_VERSION_STATUSES = ['draft', 'published', 'archived'] as const
export type PromptVersionStatus = (typeof PROMPT_VERSION_STATUSES)[number]

export const SKILL_VERSION_STATUSES = ['draft', 'published', 'archived'] as const
export type SkillVersionStatus = (typeof SKILL_VERSION_STATUSES)[number]

export const AGENT_SESSION_STATUSES = ['active', 'ended', 'failed'] as const
export type AgentSessionStatus = (typeof AGENT_SESSION_STATUSES)[number]

export const MISSION_STATUSES = ['draft', 'active', 'completed', 'archived'] as const
export type MissionStatus = (typeof MISSION_STATUSES)[number]

export const ARTIFACT_TYPES = ['file', 'diff', 'log', 'report', 'doc', 'image', 'dataset', 'other'] as const
export type ArtifactType = (typeof ARTIFACT_TYPES)[number]

export const ARTIFACT_LINK_REF_TYPES = ['task', 'agent-run', 'prompt-version', 'skill-version', 'resource', 'other'] as const
export type ArtifactLinkRefType = (typeof ARTIFACT_LINK_REF_TYPES)[number]

export const MEMORY_ITEM_KINDS = [
  'kickoff',
  'resume',
  'closeout',
  'checkpoint',
  'decision',
  'constraint',
  'rule',
  'note',
] as const
export type MemoryItemKind = (typeof MEMORY_ITEM_KINDS)[number]

export const MEMORY_ITEM_DURABILITIES = ['short', 'durable', 'sticky'] as const
export type MemoryItemDurability = (typeof MEMORY_ITEM_DURABILITIES)[number]

export const EXPERIENCE_ITEM_TYPES = [
  'technique',
  'problem-solution',
  'tool',
  'script',
  'pattern',
  'anti-pattern',
  'idea',
] as const
export type ExperienceItemType = (typeof EXPERIENCE_ITEM_TYPES)[number]

export const CODEX_CHAT_MESSAGE_ROLES = ['user', 'assistant', 'system'] as const
export type CodexChatMessageRole = (typeof CODEX_CHAT_MESSAGE_ROLES)[number]

export const CODEX_CHAT_EXECUTION_MODES = ['agent-auto', 'ask', 'safe'] as const
export type CodexChatExecutionMode = (typeof CODEX_CHAT_EXECUTION_MODES)[number]

export const CODEX_CHAT_SANDBOX_MODES = ['read-only', 'workspace-write', 'danger-full-access'] as const
export type CodexChatSandboxMode = (typeof CODEX_CHAT_SANDBOX_MODES)[number]

export const CODEX_CHAT_REASONING_EFFORTS = ['none', 'minimal', 'low', 'medium', 'high', 'xhigh'] as const
export type CodexChatReasoningEffort = (typeof CODEX_CHAT_REASONING_EFFORTS)[number]

export const CHAT_ROOM_KINDS = ['group', 'dm'] as const
export type ChatRoomKind = (typeof CHAT_ROOM_KINDS)[number]

export const CHAT_ROOM_STATUSES = ['active', 'archived'] as const
export type ChatRoomStatus = (typeof CHAT_ROOM_STATUSES)[number]

export const CHAT_ROOM_MEMBER_STATUSES = ['active', 'left'] as const
export type ChatRoomMemberStatus = (typeof CHAT_ROOM_MEMBER_STATUSES)[number]

export const CHAT_MESSAGE_KINDS = ['message', 'system'] as const
export type ChatMessageKind = (typeof CHAT_MESSAGE_KINDS)[number]

export const DISCUSSION_TOPIC_STATUSES = ['active', 'concluding', 'concluded', 'abandoned'] as const
export type DiscussionTopicStatus = (typeof DISCUSSION_TOPIC_STATUSES)[number]

export const DISCUSSION_BLOCKED_ON = ['operator'] as const
export type DiscussionBlockedOn = (typeof DISCUSSION_BLOCKED_ON)[number]

export const DISCUSSION_LINEAGE_KINDS = ['follow-up', 'fork'] as const
export type DiscussionLineageKind = (typeof DISCUSSION_LINEAGE_KINDS)[number]

export const DISCUSSION_TURN_KINDS = [
  'statement',
  'question',
  'answer',
  'objection',
  'concession',
  'proposal',
  'final-stance',
] as const
export type DiscussionTurnKind = (typeof DISCUSSION_TURN_KINDS)[number]

export const DISCUSSION_TURN_ADDRESSED_TO = ['agent', 'operator'] as const
export type DiscussionTurnAddressedTo = (typeof DISCUSSION_TURN_ADDRESSED_TO)[number]

export type ActorRef = 'manual' | `agent:${string}` | `user:${string}`

export function buildActorRef(type: 'manual' | 'agent' | 'user', id?: string): ActorRef {
  if (type === 'manual') return 'manual'
  if (!id) throw new Error(`${type} requires id`)
  return `${type}:${id}` as ActorRef
}

export const scopeableFields = {
  scopeId: z.string(),
} as const

// -----------------------------------------------------------------------------
// ToolPacks (xf-gen integration contracts)
// -----------------------------------------------------------------------------

export const TOOLPACK_RESOURCE_KINDS = ['resource', 'skill', 'prompt'] as const
export type ToolPackResourceKind = (typeof TOOLPACK_RESOURCE_KINDS)[number]

export type ToolPackStagePolicies = Record<string, string[]>

export interface ToolPackManifestResource {
  kind: ToolPackResourceKind
  mcpUri: string
  name: string
  displayName: string
  sourcePath: string
  tags: string[]
  category?: string
}

export interface ToolPackManifestTool {
  name: string
  mcpToolName: string
  description: string
  inputSchema: unknown
}

export interface ToolPackManifest {
  packId: string
  packVersion: string
  displayName: string
  description: string
  sourceRoot: string
  resources: ToolPackManifestResource[]
  stagePolicies: ToolPackStagePolicies
  tools: ToolPackManifestTool[]
}
