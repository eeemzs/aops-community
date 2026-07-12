import { z } from 'zod'

export const projectScopedFields = {
  projectId: z.string(),
} as const

export type ProjectScope = {
  projectId: string
}

export const scopeScopedFields = {
  scopeId: z.string(),
} as const

export type ScopeOwner = {
  scopeId: string
}

export const SPRINT_STATUSES = ['todo', 'doing', 'blocked', 'paused', 'in_review', 'completed', 'cancelled', 'postponed'] as const
export type SprintStatus = (typeof SPRINT_STATUSES)[number]

export const MICROTASK_STATUSES = ['todo', 'doing', 'blocked', 'paused', 'in_review', 'completed', 'cancelled', 'postponed'] as const
export type MicroTaskStatus = (typeof MICROTASK_STATUSES)[number]

export const ISSUE_STATUSES = ['open', 'triaged', 'in_progress', 'resolved', 'closed'] as const
export type IssueStatus = (typeof ISSUE_STATUSES)[number]

export const ISSUE_SEVERITIES = ['low', 'medium', 'high', 'critical'] as const
export type IssueSeverity = (typeof ISSUE_SEVERITIES)[number]

export const ISSUE_SOURCES = ['human', 'agent', 'automation', 'review'] as const
export type IssueSource = (typeof ISSUE_SOURCES)[number]

export const REVIEW_REQUEST_STATUSES = ['requested', 'in_review', 'responded', 'accepted', 'changes_requested', 'closed', 'cancelled'] as const
export type ReviewRequestStatus = (typeof REVIEW_REQUEST_STATUSES)[number]

export const REVIEW_REQUEST_PRIORITIES = ['low', 'medium', 'high', 'critical'] as const
export type ReviewRequestPriority = (typeof REVIEW_REQUEST_PRIORITIES)[number]

export const REVIEW_REQUEST_SOURCES = ['human', 'agent', 'automation', 'collab'] as const
export type ReviewRequestSource = (typeof REVIEW_REQUEST_SOURCES)[number]

export const REVIEW_REQUEST_OUTCOMES = ['approved', 'changes_requested', 'commented', 'blocked'] as const
export type ReviewRequestOutcome = (typeof REVIEW_REQUEST_OUTCOMES)[number]

export const FEEDBACK_STATUSES = ['new', 'triaged', 'planned', 'implemented', 'dismissed'] as const
export type FeedbackStatus = (typeof FEEDBACK_STATUSES)[number]

export const FEEDBACK_TYPES = ['refactor', 'bug', 'improvement', 'warning', 'observation', 'other'] as const
export type FeedbackType = (typeof FEEDBACK_TYPES)[number]

export const FEEDBACK_SEVERITIES = ['low', 'medium', 'high', 'critical'] as const
export type FeedbackSeverity = (typeof FEEDBACK_SEVERITIES)[number]

export const FEEDBACK_SOURCES = ['human', 'agent', 'automation'] as const
export type FeedbackSource = (typeof FEEDBACK_SOURCES)[number]

export const HISTORY_STATUSES = ['draft', 'active', 'archived'] as const
export type HistoryStatus = (typeof HISTORY_STATUSES)[number]
