import { InferSelectModel } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { index, integer, text, sqliteTable, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { projectTableSqlite as projectTable } from '../../project/drizzle/drizzle.schema.project.sqlite.js'

export const projectMemberTableSqlite = sqliteTable(
  'project-members',
  {
    id: text().primaryKey().$defaultFn(() => randomUUID()),
    tenantId: text().notNull(),
    projectId: text()
      .notNull()
      .references(() => projectTable.id, { onDelete: 'cascade' }),
    userId: text().notNull(),
    role: text().notNull(),
    createdBy: text(),
    updatedBy: text(),
    createdAt: integer({ mode: 'timestamp_ms' }).$defaultFn(() => new Date()),
    updatedAt: integer({ mode: 'timestamp_ms' }).$defaultFn(() => new Date()),
  },
  (t) => [
    uniqueIndex('project_member_unique_user').on(t.tenantId, t.projectId, t.userId),
    index('project_member_idx_tenant').on(t.tenantId),
    index('project_member_idx_project').on(t.tenantId, t.projectId),
    index('project_member_idx_user').on(t.tenantId, t.userId),
  ]
)

export type IdbProjectMemberDrizzleSqlite = InferSelectModel<typeof projectMemberTableSqlite>;
export type ProjectMemberColumnsDrizzleSqlite = keyof IdbProjectMemberDrizzleSqlite;
