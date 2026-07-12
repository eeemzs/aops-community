import { InferSelectModel } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { index, integer, text, sqliteTable, uniqueIndex } from 'drizzle-orm/sqlite-core'
import { projectTableSqlite as projectTable } from '../../project/drizzle/drizzle.schema.project.sqlite.js'
import { promptTableSqlite as promptTable } from '../../prompt/drizzle/drizzle.schema.prompt.sqlite.js'

export const promptVersionTableSqlite = sqliteTable(
  'prompt-versions',
  {
    id: text().primaryKey().$defaultFn(() => randomUUID()),
    tenantId: text().notNull(),
    projectId: text()
      .notNull()
      .references(() => projectTable.id, { onDelete: 'cascade' }),
    promptId: text()
      .notNull()
      .references(() => promptTable.id, { onDelete: 'cascade' }),
    version: integer().notNull(),
    status: text().notNull(),
    content: text().notNull(),
    variables: text({ mode: 'json' }),
    meta: text({ mode: 'json' }),
    refType: text(),
    refId: text(),
    createdBy: text(),
    updatedBy: text(),
    publishedAt: integer({ mode: 'timestamp_ms' }),
    createdAt: integer({ mode: 'timestamp_ms' }).$defaultFn(() => new Date()),
    updatedAt: integer({ mode: 'timestamp_ms' }).$defaultFn(() => new Date()),
  },
  (t) => [
    uniqueIndex('prompt_version_unique').on(t.tenantId, t.promptId, t.version),
    index('prompt_version_idx_tenant').on(t.tenantId),
    index('prompt_version_idx_project').on(t.tenantId, t.projectId),
    index('prompt_version_idx_prompt').on(t.tenantId, t.promptId),
  ]
)

export type IdbPromptVersionDrizzleSqlite = InferSelectModel<typeof promptVersionTableSqlite>
export type PromptVersionColumnsDrizzleSqlite = keyof IdbPromptVersionDrizzleSqlite
