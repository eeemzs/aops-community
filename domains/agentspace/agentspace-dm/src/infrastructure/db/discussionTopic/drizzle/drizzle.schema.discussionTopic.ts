import { AnyPgColumn, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { InferSelectModel } from 'drizzle-orm'
import { projectTable } from '../../project/drizzle/drizzle.schema.project.js'

export const discussionTopicTable = pgTable(
  'discussion-topics',
  {
    id: uuid().primaryKey().defaultRandom(),
    tenantId: text().notNull(),
    scopeId: uuid().notNull(),
    projectId: uuid().references(() => projectTable.id, { onDelete: 'set null' }),
    parentTopicId: uuid().references((): AnyPgColumn => discussionTopicTable.id, { onDelete: 'set null' }),
    lineageKind: text(),
    referencedOutputs: jsonb().$type<string[]>(),
    referencedTurnRefs: jsonb().$type<string[]>(),
    referencedMemoryRefs: jsonb().$type<string[]>(),
    abandonReason: text(),
    slug: text().notNull(),
    title: text().notNull(),
    question: text().notNull(),
    participants: jsonb().$type<string[]>(),
    initiatorAgentId: text().notNull(),
    status: text().notNull(),
    blockedOn: text(),
    blockingTurnSeq: integer(),
    subjectType: text(),
    subjectId: uuid(),
    rules: jsonb().$type<{
      turnOrder?: string[]
      minTurnsBeforeConclude?: number
      requireQuestionAnswer?: boolean
    }>(),
    tags: jsonb().$type<string[]>(),
    lastSeq: integer().notNull().default(0),
    lastTurnAt: timestamp({ withTimezone: true }),
    createdBy: text(),
    updatedBy: text(),
    createdAt: timestamp({ withTimezone: true }).defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).defaultNow(),
  },
  (t) => [
    uniqueIndex('discussion_topic_tenant_scope_slug_unique').on(t.tenantId, t.scopeId, t.slug),
    index('discussion_topic_idx_tenant').on(t.tenantId),
    index('discussion_topic_idx_scope_updated').on(t.tenantId, t.scopeId, t.updatedAt),
    index('discussion_topic_idx_project_updated').on(t.tenantId, t.projectId, t.updatedAt),
    index('discussion_topic_idx_scope_status').on(t.tenantId, t.scopeId, t.status),
    index('discussion_topic_idx_tenant_parent').on(t.tenantId, t.parentTopicId),
  ]
)

export type IdbDiscussionTopicDrizzle = InferSelectModel<typeof discussionTopicTable>
export type DiscussionTopicColumnsDrizzle = keyof IdbDiscussionTopicDrizzle
