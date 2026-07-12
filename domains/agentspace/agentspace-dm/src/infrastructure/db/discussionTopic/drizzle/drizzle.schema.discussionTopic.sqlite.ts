import { InferSelectModel } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { AnySQLiteColumn, index, integer, text, sqliteTable, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { projectTableSqlite as projectTable } from '../../project/drizzle/drizzle.schema.project.sqlite.js'

export const discussionTopicTableSqlite = sqliteTable(
  'discussion-topics',
  {
    id: text().primaryKey().$defaultFn(() => randomUUID()),
    tenantId: text().notNull(),
    scopeId: text().notNull(),
    projectId: text().references(() => projectTable.id, { onDelete: 'set null' }),
    parentTopicId: text().references((): AnySQLiteColumn => discussionTopicTableSqlite.id, { onDelete: 'set null' }),
    lineageKind: text(),
    referencedOutputs: text({ mode: 'json' }).$type<string[]>(),
    referencedTurnRefs: text({ mode: 'json' }).$type<string[]>(),
    referencedMemoryRefs: text({ mode: 'json' }).$type<string[]>(),
    abandonReason: text(),
    slug: text().notNull(),
    title: text().notNull(),
    question: text().notNull(),
    participants: text({ mode: 'json' }).$type<string[]>(),
    initiatorAgentId: text().notNull(),
    status: text().notNull(),
    blockedOn: text(),
    blockingTurnSeq: integer(),
    subjectType: text(),
    subjectId: text(),
    rules: text({ mode: 'json' }).$type<{
      turnOrder?: string[]
      minTurnsBeforeConclude?: number
      requireQuestionAnswer?: boolean
    }>(),
    tags: text({ mode: 'json' }).$type<string[]>(),
    lastSeq: integer().notNull().default(0),
    lastTurnAt: integer({ mode: 'timestamp_ms' }),
    createdBy: text(),
    updatedBy: text(),
    createdAt: integer({ mode: 'timestamp_ms' }).$defaultFn(() => new Date()),
    updatedAt: integer({ mode: 'timestamp_ms' }).$defaultFn(() => new Date()),
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

export type IdbDiscussionTopicDrizzleSqlite = InferSelectModel<typeof discussionTopicTableSqlite>
export type DiscussionTopicColumnsDrizzleSqlite = keyof IdbDiscussionTopicDrizzleSqlite
