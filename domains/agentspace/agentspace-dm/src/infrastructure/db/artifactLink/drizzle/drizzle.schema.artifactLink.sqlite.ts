import { InferSelectModel } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { index, integer, text, sqliteTable } from 'drizzle-orm/sqlite-core'
import { artifactTableSqlite as artifactTable } from '../../artifact/drizzle/drizzle.schema.artifact.sqlite.js'
import { projectTableSqlite as projectTable } from '../../project/drizzle/drizzle.schema.project.sqlite.js'

export const artifactLinkTableSqlite = sqliteTable(
  'artifact-links',
  {
    id: text().primaryKey().$defaultFn(() => randomUUID()),
    tenantId: text().notNull(),
    projectId: text()
      .notNull()
      .references(() => projectTable.id, { onDelete: 'cascade' }),
    artifactId: text()
      .notNull()
      .references(() => artifactTable.id, { onDelete: 'cascade' }),
    refType: text().notNull(),
    refId: text().notNull(),
    createdBy: text(),
    createdAt: integer({ mode: 'timestamp_ms' }).$defaultFn(() => new Date()),
    updatedAt: integer({ mode: 'timestamp_ms' }).$defaultFn(() => new Date()),
  },
  (t) => [
    index('artifact_link_idx_tenant').on(t.tenantId),
    index('artifact_link_idx_artifact').on(t.tenantId, t.artifactId),
    index('artifact_link_idx_project_ref_created').on(t.tenantId, t.projectId, t.refType, t.refId, t.createdAt),
  ]
)

export type IdbArtifactLinkDrizzleSqlite = InferSelectModel<typeof artifactLinkTableSqlite>;
export type ArtifactLinkColumnsDrizzleSqlite = keyof IdbArtifactLinkDrizzleSqlite;
