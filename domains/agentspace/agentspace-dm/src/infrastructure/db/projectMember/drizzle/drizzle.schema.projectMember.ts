import { index, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { InferSelectModel } from 'drizzle-orm'
import { projectTable } from '../../project/drizzle/drizzle.schema.project.js'

export const projectMemberTable = pgTable(
  'project-members',
  {
    id: uuid().primaryKey().defaultRandom(),
    tenantId: text().notNull(),
    projectId: uuid()
      .notNull()
      .references(() => projectTable.id, { onDelete: 'cascade' }),
    userId: uuid().notNull(),
    role: text().notNull(),
    createdBy: text(),
    updatedBy: text(),
    createdAt: timestamp({ withTimezone: true }).defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).defaultNow(),
  },
  (t) => [
    uniqueIndex('project_member_unique_user').on(t.tenantId, t.projectId, t.userId),
    index('project_member_idx_tenant').on(t.tenantId),
    index('project_member_idx_project').on(t.tenantId, t.projectId),
    index('project_member_idx_user').on(t.tenantId, t.userId),
  ]
)

export type IdbProjectMemberDrizzle = InferSelectModel<typeof projectMemberTable>;
export type ProjectMemberColumnsDrizzle = keyof IdbProjectMemberDrizzle;
