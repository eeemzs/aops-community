import { InferSelectModel } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { index, integer, text, sqliteTable, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { projectTableSqlite as projectTable } from '../../project/drizzle/drizzle.schema.project.sqlite.js'

export const projectPathTableSqlite = sqliteTable(
  'project-paths',
  {
    id: text().primaryKey().$defaultFn(() => randomUUID()),
    tenantId: text().notNull(),
    projectId: text()
      .notNull()
      .references(() => projectTable.id, { onDelete: 'cascade' }),
    pathKey: text().notNull(),
    path: text().notNull(),
    description: text(),
    createdBy: text(),
    updatedBy: text(),
    createdAt: integer({ mode: 'timestamp_ms' }).$defaultFn(() => new Date()),
    updatedAt: integer({ mode: 'timestamp_ms' }).$defaultFn(() => new Date()),
  },
  (t) => [
    uniqueIndex('project_path_unique_key').on(t.tenantId, t.projectId, t.pathKey),
    index('project_path_idx_tenant').on(t.tenantId),
    index('project_path_idx_project').on(t.tenantId, t.projectId),
  ]
)

export type IdbProjectPathDrizzleSqlite = InferSelectModel<typeof projectPathTableSqlite>;
export type ProjectPathColumnsDrizzleSqlite = keyof IdbProjectPathDrizzleSqlite;
